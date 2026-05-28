import os

from fastapi.testclient import TestClient

os.environ["DATABASE_URL"] = "sqlite:///./backend/test_products.db"

from database import Base, SessionLocal, engine
from main import app
from models import Product


def reset_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def create_token(client: TestClient) -> str:
    client.post(
        "/auth/register",
        json={
            "name": "Admin User",
            "email": "admin@example.com",
            "password": "admin-password",
        },
    )
    response = client.post(
        "/auth/login",
        json={"email": "admin@example.com", "password": "admin-password"},
    )
    return response.json()["access_token"]


def test_products_can_be_created_and_read_from_database():
    reset_database()
    client = TestClient(app)
    token = create_token(client)

    response = client.post(
        "/products",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Trail Backpack",
            "description": "Weather resistant day pack",
            "price": 129.99,
            "stock": 8,
            "image_url": "https://example.com/backpack.jpg",
        },
    )

    assert response.status_code == 201
    created = response.json()
    assert created["id"]
    assert created["name"] == "Trail Backpack"
    assert created["price"] == 129.99

    db = SessionLocal()
    try:
        persisted = db.query(Product).filter(Product.id == created["id"]).one()
        assert persisted.name == "Trail Backpack"
        assert float(persisted.price) == 129.99
    finally:
        db.close()

    list_response = client.get("/products")
    detail_response = client.get(f"/products/{created['id']}")

    assert list_response.status_code == 200
    assert [product["name"] for product in list_response.json()] == ["Trail Backpack"]
    assert detail_response.status_code == 200
    assert detail_response.json()["description"] == "Weather resistant day pack"


def test_products_list_supports_name_search_and_price_range_filters():
    reset_database()
    client = TestClient(app)
    token = create_token(client)
    products = [
        ("Trail Backpack", 129.99),
        ("City Tote", 49.5),
        ("Camping Lantern", 24.0),
    ]
    for name, price in products:
        client.post(
            "/products",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "name": name,
                "description": f"{name} description",
                "price": price,
                "stock": 5,
                "image_url": f"https://example.com/{name}.jpg",
            },
        )

    search_response = client.get("/products", params={"search": "trail"})
    range_response = client.get("/products", params={"min_price": 25, "max_price": 60})

    assert search_response.status_code == 200
    assert [product["name"] for product in search_response.json()] == ["Trail Backpack"]
    assert range_response.status_code == 200
    assert [product["name"] for product in range_response.json()] == ["City Tote"]


def test_products_update_and_delete_require_authentication():
    reset_database()
    client = TestClient(app)
    token = create_token(client)
    created = client.post(
        "/products",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": "Trail Backpack",
            "description": "Weather resistant day pack",
            "price": 129.99,
            "stock": 8,
            "image_url": "https://example.com/backpack.jpg",
        },
    ).json()

    assert client.post("/products", json={"name": "No Auth", "price": 1, "stock": 1}).status_code == 401
    assert client.put(f"/products/{created['id']}", json={"stock": 3}).status_code == 401
    assert client.delete(f"/products/{created['id']}").status_code == 401

    update_response = client.put(
        f"/products/{created['id']}",
        headers={"Authorization": f"Bearer {token}"},
        json={"stock": 3, "price": 119.5},
    )
    delete_response = client.delete(
        f"/products/{created['id']}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert update_response.status_code == 200
    assert update_response.json()["stock"] == 3
    assert update_response.json()["price"] == 119.5
    assert delete_response.status_code == 204
    assert client.get(f"/products/{created['id']}").status_code == 404
