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


def test_authenticated_user_can_place_order_and_view_order_details():
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
                {"product_id": mug["id"], "quantity": 1},
            ],
        },
    )

    assert create_response.status_code == 201
    order = create_response.json()
    assert order["status"] == "pending"
    assert order["total_price"] == "199.48"
    assert [item["product_id"] for item in order["items"]] == [backpack["id"], mug["id"]]
    assert order["items"][0]["quantity"] == 2
    assert order["items"][0]["unit_price"] == "89.99"
    assert order["items"][0]["product_name"] == "Trail Backpack"

    assert client.get(f"/products/{backpack['id']}").json()["stock"] == 10
    assert client.get(f"/products/{mug['id']}").json()["stock"] == 4

    list_response = client.get("/orders", headers=headers)
    detail_response = client.get(f"/orders/{order['id']}", headers=headers)

    assert list_response.status_code == 200
    assert [listed["id"] for listed in list_response.json()] == [order["id"]]
    assert detail_response.status_code == 200
    assert detail_response.json()["items"] == order["items"]


def test_order_placement_rejects_insufficient_stock_without_reducing_stock():
    reset_database()
    client = TestClient(app)
    token = create_token(client)
    product = create_product(client, token, "Camp Mug", "19.50", 1)

    response = client.post(
        "/orders",
        headers={"Authorization": f"Bearer {token}"},
        json={"items": [{"product_id": product["id"], "quantity": 2}]},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Insufficient stock for Camp Mug"
    assert client.get(f"/products/{product['id']}").json()["stock"] == 1


def test_orders_are_protected_and_scoped_to_current_user():
    reset_database()
    client = TestClient(app)
    first_token = create_token(client, "first@example.com")
    second_token = create_token(client, "second@example.com")
    product = create_product(client, first_token, "Trail Backpack", "89.99", 12)
    order = client.post(
        "/orders",
        headers={"Authorization": f"Bearer {first_token}"},
        json={"items": [{"product_id": product["id"], "quantity": 1}]},
    ).json()

    missing_token = client.get("/orders")
    other_user_list = client.get("/orders", headers={"Authorization": f"Bearer {second_token}"})
    other_user_detail = client.get(
        f"/orders/{order['id']}",
        headers={"Authorization": f"Bearer {second_token}"},
    )

    assert missing_token.status_code == 401
    assert other_user_list.status_code == 200
    assert other_user_list.json() == []
    assert other_user_detail.status_code == 404
