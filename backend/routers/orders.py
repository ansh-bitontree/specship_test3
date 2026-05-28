from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

if __package__.startswith("backend."):
    from backend.database import get_db
    from backend.models import Order, OrderItem, Product, User
    from backend.routers.users import get_current_user
    from backend.schemas import OrderCreate, OrderRead
else:
    from database import get_db
    from models import Order, OrderItem, Product, User
    from routers.users import get_current_user
    from schemas import OrderCreate, OrderRead


router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("", response_model=OrderRead, status_code=status.HTTP_201_CREATED)
def create_order(
    payload: OrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Order:
    product_ids = [item.product_id for item in payload.items]
    requested_quantities: dict[int, int] = {}
    for item in payload.items:
        requested_quantities[item.product_id] = requested_quantities.get(item.product_id, 0) + item.quantity

    products = db.query(Product).filter(Product.id.in_(product_ids)).all()
    products_by_id = {product.id: product for product in products}

    for product_id, quantity in requested_quantities.items():
        product = products_by_id.get(product_id)
        if product is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
        if product.stock < quantity:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Insufficient stock")

    order = Order(user_id=current_user.id, total_price=Decimal("0.00"), status="pending")
    db.add(order)
    db.flush()

    total_price = Decimal("0.00")
    for item in payload.items:
        product = products_by_id[item.product_id]
        product.stock -= item.quantity
        unit_price = product.price
        total_price += unit_price * item.quantity
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=product.id,
                quantity=item.quantity,
                unit_price=unit_price,
            )
        )

    order.total_price = total_price
    db.commit()
    return get_order_for_user(db, order.id, current_user.id)


@router.get("", response_model=list[OrderRead])
def list_orders(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Order]:
    return (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(Order.user_id == current_user.id)
        .order_by(Order.created_at.desc(), Order.id.desc())
        .all()
    )


@router.get("/{order_id}", response_model=OrderRead)
def read_order(
    order_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Order:
    return get_order_for_user(db, order_id, current_user.id)


def get_order_for_user(db: Session, order_id: int, user_id: int) -> Order:
    order = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(Order.id == order_id, Order.user_id == user_id)
        .first()
    )
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    return order
