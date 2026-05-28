from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]
README = ROOT_DIR / "README.md"


def readme_text() -> str:
    return README.read_text(encoding="utf-8")


def test_readme_documents_current_application_structure_and_features():
    text = readme_text()

    required_phrases = [
        "FastAPI",
        "React",
        "Vite",
        "SQLAlchemy",
        "Neon PostgreSQL",
        "JWT",
        "product catalog",
        "shopping cart",
        "order placement",
        "backend/",
        "frontend/",
    ]

    for phrase in required_phrases:
        assert phrase in text


def test_readme_documents_operational_commands_and_configuration():
    text = readme_text()

    required_phrases = [
        "DATABASE_URL",
        "JWT_SECRET_KEY",
        "pip install -r backend/requirements.txt",
        "uvicorn backend.main:app --reload",
        "npm install",
        "npm run dev",
        "pytest backend/tests",
        "npm test",
        "npm run build",
    ]

    for phrase in required_phrases:
        assert phrase in text


def test_readme_documents_public_api_surface():
    text = readme_text()

    endpoints = [
        "GET /",
        "POST /auth/register",
        "POST /auth/login",
        "GET /auth/me",
        "GET /products",
        "GET /products/{product_id}",
        "POST /products",
        "PUT /products/{product_id}",
        "DELETE /products/{product_id}",
        "POST /orders",
        "GET /orders",
        "GET /orders/{order_id}",
    ]

    for endpoint in endpoints:
        assert endpoint in text
