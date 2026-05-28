import os

from fastapi.testclient import TestClient

os.environ["DATABASE_URL"] = "sqlite:///./test_orders.db"

from backend.database import Base, engine
from backend.main import app


def reset_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def create_token(client: TestClient, email: str = "buyer@example.com") -> str:
    client.post(
        "/auth/register",
        json={"name": "Buyer", "email": email, "password": "secret123"},
    )
    response = client.post(
        "/auth/login",
        json={"email": email, "password": "secret123"},
    )
    return response.json()["access_token"]


def create_product(client: TestClient, token: str, name: str, price: str, stock: int) -> dict:
    response = client.post(
        "/products",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "name": name,
            "description": f"{name} description",
            "price": price,
            "stock": stock,
            "image_url": f"https://example.com/{name.lower().replace(' ', '-')}.jpg",
        },
    )
    assert response.status_code == 201
    return response.json()


def test_user_can_place_order_and_view_order_details_with_stock_reduced():
    reset_database()
    client = TestClient(app)
    token = create_token(client)
    headers = {"Authorization": f"Bearer {token}"}
    backpack = create_product(client, token, "Trail Backpack", "89.99", 12)
    mug = create_product(client, token, "Camp Mug", "19.50", 5)

    create_response = client.post(
        "/orders",
        headers=headers,
        json={
            "items": [
                {"product_id": backpack["id"], "quantity": 2},
                {"product_id": mug["id"], "quantity": 3},
            ],
        },
    )

    assert create_response.status_code == 201
    created = create_response.json()
    assert created["status"] == "pending"
    assert created["total_price"] == "238.48"
    assert created["items"] == [
        {
            "product_id": backpack["id"],
            "product_name": "Trail Backpack",
            "quantity": 2,
            "unit_price": "89.99",
            "subtotal": "179.98",
        },
        {
            "product_id": mug["id"],
            "product_name": "Camp Mug",
            "quantity": 3,
            "unit_price": "19.50",
            "subtotal": "58.50",
        },
    ]

    assert client.get(f"/products/{backpack['id']}").json()["stock"] == 10
    assert client.get(f"/products/{mug['id']}").json()["stock"] == 2

    list_response = client.get("/orders", headers=headers)
    assert list_response.status_code == 200
    assert list_response.json() == [
        {
            "id": created["id"],
            "total_price": "238.48",
            "status": "pending",
            "created_at": created["created_at"],
        }
    ]

    detail_response = client.get(f"/orders/{created['id']}", headers=headers)
    assert detail_response.status_code == 200
    assert detail_response.json() == created


def test_order_creation_requires_authentication_and_available_stock():
    reset_database()
    client = TestClient(app)
    token = create_token(client)
    product = create_product(client, token, "Camp Mug", "19.50", 1)

    unauthenticated = client.post(
        "/orders",
        json={"items": [{"product_id": product["id"], "quantity": 1}]},
    )
    insufficient_stock = client.post(
        "/orders",
        headers={"Authorization": f"Bearer {token}"},
        json={"items": [{"product_id": product["id"], "quantity": 2}]},
    )

    assert unauthenticated.status_code == 401
    assert insufficient_stock.status_code == 400
    assert insufficient_stock.json()["detail"] == "Insufficient stock for Camp Mug"
    assert client.get(f"/products/{product['id']}").json()["stock"] == 1
