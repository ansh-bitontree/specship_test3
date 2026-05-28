from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

if __package__:
    import backend.models  # noqa: F401
    from backend.database import create_tables
    from backend.routers.orders import router as orders_router
    from backend.routers.products import router as products_router
    from backend.routers.users import router as users_router
else:
    import models  # noqa: F401
    from database import create_tables
    from routers.orders import router as orders_router
    from routers.products import router as products_router
    from routers.users import router as users_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_tables()
    yield


app = FastAPI(title="Specship API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(users_router)
app.include_router(products_router)
app.include_router(orders_router)

@app.get("/")
def read_root():
    return {"status": "ok"}
