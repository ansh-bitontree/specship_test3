import os

from fastapi.testclient import TestClient

os.environ["DATABASE_URL"] = "sqlite:///./backend/test_auth.db"

from backend.database import Base, engine
from backend.main import app


def reset_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def test_user_can_register_login_and_fetch_profile():
    reset_database()
    client = TestClient(app)

    register_response = client.post(
        "/auth/register",
        json={
            "name": "Ada Lovelace",
            "email": "ada@example.com",
            "password": "correct horse battery staple",
        },
    )

    assert register_response.status_code == 201
    registered_user = register_response.json()
    assert registered_user["name"] == "Ada Lovelace"
    assert registered_user["email"] == "ada@example.com"
    assert "id" in registered_user
    assert "password" not in registered_user
    assert "hashed_password" not in registered_user

    login_response = client.post(
        "/auth/login",
        json={"email": "ada@example.com", "password": "correct horse battery staple"},
    )

    assert login_response.status_code == 200
    token_payload = login_response.json()
    assert token_payload["token_type"] == "bearer"
    assert token_payload["access_token"]

    me_response = client.get(
        "/auth/me",
        headers={"Authorization": f"Bearer {token_payload['access_token']}"},
    )

    assert me_response.status_code == 200
    assert me_response.json() == registered_user


def test_auth_me_requires_valid_bearer_token():
    reset_database()
    client = TestClient(app)

    missing_token = client.get("/auth/me")
    invalid_token = client.get(
        "/auth/me",
        headers={"Authorization": "Bearer not-a-valid-token"},
    )

    assert missing_token.status_code == 403
    assert invalid_token.status_code == 403


def test_login_rejects_invalid_credentials():
    reset_database()
    client = TestClient(app)
    client.post(
        "/auth/register",
        json={"name": "Grace Hopper", "email": "grace@example.com", "password": "secret"},
    )

    response = client.post(
        "/auth/login",
        json={"email": "grace@example.com", "password": "wrong"},
    )

    assert response.status_code == 401


def test_register_rejects_duplicate_email_and_invalid_payload():
    reset_database()
    client = TestClient(app)
    payload = {"name": "Grace Hopper", "email": "grace@example.com", "password": "secret123"}

    first_response = client.post("/auth/register", json=payload)
    duplicate_response = client.post("/auth/register", json=payload)
    invalid_response = client.post(
        "/auth/register",
        json={"name": "", "email": "not-an-email", "password": "123"},
    )

    assert first_response.status_code == 201
    assert duplicate_response.status_code == 400
    assert duplicate_response.json()["detail"] == "Email already registered"
    assert invalid_response.status_code == 422
