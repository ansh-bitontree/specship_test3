import os
from decimal import Decimal

from fastapi.testclient import TestClient

os.environ["DATABASE_URL"] = "sqlite:///./test_orders.db"

from backend.database import Base, engine
from backend.main import app
from backend.models import Product


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
    return response.json()


def test_authenticated_user_can_place_order_and_stock_is_reduced():
    reset_database()
    client = TestClient(app)
    token = create_token(client)
    headers = {"Authorization": f"Bearer {token}"}
    backpack = create_product(client, token, "Trail Backpack", "89.99", 12)
    mug = create_product(client, token, "Camp Mug", "19.50", 5)

    response = client.post(
        "/orders",
        headers=headers,
        json={
            "items": [
                {"product_id": backpack["id"], "quantity": 2},
                {"product_id": mug["id"], "quantity": 1},
            ],
        },
    )

    assert response.status_code == 201
    order = response.json()
    assert order["status"] == "pending"
    assert Decimal(order["total_price"]) == Decimal("199.48")
    assert [item["product_id"] for item in order["items"]] == [backpack["id"], mug["id"]]
    assert [item["quantity"] for item in order["items"]] == [2, 1]
    assert order["items"][0]["unit_price"] == "89.99"

    assert client.get(f"/products/{backpack['id']}").json()["stock"] == 10
    assert client.get(f"/products/{mug['id']}").json()["stock"] == 4


def test_user_can_list_and_view_only_their_own_orders():
    reset_database()
    client = TestClient(app)
    buyer_token = create_token(client, "buyer@example.com")
    other_token = create_token(client, "other@example.com")
    product = create_product(client, buyer_token, "Trail Backpack", "89.99", 12)

    buyer_order = client.post(
        "/orders",
        headers={"Authorization": f"Bearer {buyer_token}"},
        json={"items": [{"product_id": product["id"], "quantity": 1}]},
    ).json()
    client.post(
        "/orders",
        headers={"Authorization": f"Bearer {other_token}"},
        json={"items": [{"product_id": product["id"], "quantity": 1}]},
    )

    list_response = client.get("/orders", headers={"Authorization": f"Bearer {buyer_token}"})
    detail_response = client.get(
        f"/orders/{buyer_order['id']}",
        headers={"Authorization": f"Bearer {buyer_token}"},
    )
    forbidden_response = client.get(
        f"/orders/{buyer_order['id']}",
        headers={"Authorization": f"Bearer {other_token}"},
    )

    assert list_response.status_code == 200
    assert [order["id"] for order in list_response.json()] == [buyer_order["id"]]
    assert detail_response.status_code == 200
    assert detail_response.json()["items"][0]["product"]["name"] == "Trail Backpack"
    assert forbidden_response.status_code == 404


def test_order_rejects_missing_products_and_insufficient_stock():
    reset_database()
    client = TestClient(app)
    token = create_token(client)
    product = create_product(client, token, "Camp Mug", "19.50", 1)
    headers = {"Authorization": f"Bearer {token}"}

    missing_response = client.post(
        "/orders",
        headers=headers,
        json={"items": [{"product_id": 9999, "quantity": 1}]},
    )
    stock_response = client.post(
        "/orders",
        headers=headers,
        json={"items": [{"product_id": product["id"], "quantity": 2}]},
    )

    assert missing_response.status_code == 404
    assert stock_response.status_code == 400
    assert client.get(f"/products/{product['id']}").json()["stock"] == 1


def test_order_validates_total_quantity_for_duplicate_product_lines():
    reset_database()
    client = TestClient(app)
    token = create_token(client)
    product = create_product(client, token, "Camp Mug", "19.50", 1)

    response = client.post(
        "/orders",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "items": [
                {"product_id": product["id"], "quantity": 1},
                {"product_id": product["id"], "quantity": 1},
            ],
        },
    )

    assert response.status_code == 400
    assert client.get(f"/products/{product['id']}").json()["stock"] == 1


def test_order_routes_require_authentication():
    reset_database()
    client = TestClient(app)

    post_response = client.post("/orders", json={"items": [{"product_id": 1, "quantity": 1}]})
    list_response = client.get("/orders")
    detail_response = client.get("/orders/1")

    assert post_response.status_code == 403
    assert list_response.status_code == 403
    assert detail_response.status_code == 403


def test_order_routes_reject_invalid_token_with_forbidden():
    reset_database()
    client = TestClient(app)
    headers = {"Authorization": "Bearer not-a-valid-token"}

    response = client.get("/orders", headers=headers)

    assert response.status_code == 403
