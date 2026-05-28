import os

from fastapi.testclient import TestClient

os.environ["DATABASE_URL"] = "sqlite:///./test_products.db"

from backend.database import Base, engine
from backend.main import app


def reset_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def create_token(client: TestClient) -> str:
    client.post(
        "/auth/register",
        json={"name": "Admin", "email": "admin@example.com", "password": "secret123"},
    )
    response = client.post(
        "/auth/login",
        json={"email": "admin@example.com", "password": "secret123"},
    )
    return response.json()["access_token"]


def test_authenticated_user_can_create_product_and_read_it_from_database():
    reset_database()
    client = TestClient(app)
    token = create_token(client)

    create_response = client.post(
        "/products",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Trail Backpack",
            "description": "Durable day pack",
            "price": "89.99",
            "stock": 12,
            "image_url": "https://example.com/backpack.jpg",
        },
    )

    assert create_response.status_code == 201
    created = create_response.json()
    assert created["id"]
    assert created["name"] == "Trail Backpack"

    list_response = client.get("/products")
    assert list_response.status_code == 200
    assert list_response.json() == [created]


def test_products_can_be_searched_filtered_updated_and_deleted():
    reset_database()
    client = TestClient(app)
    token = create_token(client)
    headers = {"Authorization": f"Bearer {token}"}

    backpack = client.post(
        "/products",
        headers=headers,
        json={
            "name": "Trail Backpack",
            "description": "Durable day pack",
            "price": "89.99",
            "stock": 12,
            "image_url": "https://example.com/backpack.jpg",
        },
    ).json()
    client.post(
        "/products",
        headers=headers,
        json={
            "name": "Camp Mug",
            "description": "Insulated mug",
            "price": "19.50",
            "stock": 5,
            "image_url": "https://example.com/mug.jpg",
        },
    )

    search_response = client.get("/products", params={"search": "pack", "min_price": 80, "max_price": 100})
    detail_response = client.get(f"/products/{backpack['id']}")
    update_response = client.put(
        f"/products/{backpack['id']}",
        headers=headers,
        json={
            "name": "Trail Backpack 30L",
            "description": "Updated day pack",
            "price": "99.99",
            "stock": 10,
            "image_url": "https://example.com/backpack-30l.jpg",
        },
    )
    delete_response = client.delete(f"/products/{backpack['id']}", headers=headers)
    missing_response = client.get(f"/products/{backpack['id']}")

    assert search_response.status_code == 200
    assert [product["name"] for product in search_response.json()] == ["Trail Backpack"]
    assert detail_response.status_code == 200
    assert detail_response.json()["description"] == "Durable day pack"
    assert update_response.status_code == 200
    assert update_response.json()["name"] == "Trail Backpack 30L"
    assert delete_response.status_code == 204
    assert missing_response.status_code == 404


def test_product_writes_require_authentication():
    reset_database()
    client = TestClient(app)

    response = client.post(
        "/products",
        json={
            "name": "Trail Backpack",
            "description": "Durable day pack",
            "price": "89.99",
            "stock": 12,
            "image_url": "https://example.com/backpack.jpg",
        },
    )

    assert response.status_code == 403


def test_product_create_rejects_invalid_payloads():
    reset_database()
    client = TestClient(app)
    token = create_token(client)

    response = client.post(
        "/products",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "",
            "description": "Invalid product",
            "price": "-1.00",
            "stock": -1,
            "image_url": "https://example.com/invalid.jpg",
        },
    )

    assert response.status_code == 422
