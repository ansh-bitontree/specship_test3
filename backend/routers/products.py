from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

if __package__.startswith("backend."):
    from backend.database import get_db
    from backend.models import Product, User
    from backend.routers.users import get_current_user
    from backend.schemas import ProductCreate, ProductRead, ProductUpdate
else:
    from database import get_db
    from models import Product, User
    from routers.users import get_current_user
    from schemas import ProductCreate, ProductRead, ProductUpdate


router = APIRouter(prefix="/products", tags=["products"])


def get_product_or_404(db: Session, product_id: int) -> Product:
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found")
    return product


@router.get("", response_model=list[ProductRead])
def list_products(
    search: str | None = None,
    min_price: Decimal | None = None,
    max_price: Decimal | None = None,
    db: Session = Depends(get_db),
) -> list[Product]:
    query = db.query(Product)
    if search:
        query = query.filter(Product.name.ilike(f"%{search}%"))
    if min_price is not None:
        query = query.filter(Product.price >= min_price)
    if max_price is not None:
        query = query.filter(Product.price <= max_price)
    return query.order_by(Product.id).all()


@router.get("/{product_id}", response_model=ProductRead)
def read_product(product_id: int, db: Session = Depends(get_db)) -> Product:
    return get_product_or_404(db, product_id)


@router.post("", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
def create_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Product:
    product = Product(**payload.model_dump())
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@router.put("/{product_id}", response_model=ProductRead)
def update_product(
    product_id: int,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Product:
    product = get_product_or_404(db, product_id)
    for field, value in payload.model_dump().items():
        setattr(product, field, value)
    db.commit()
    db.refresh(product)
    return product


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    product = get_product_or_404(db, product_id)
    db.delete(product)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
