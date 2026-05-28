from pathlib import Path


README_PATH = Path(__file__).resolve().parents[2] / "README.md"


def readme_text() -> str:
    return README_PATH.read_text(encoding="utf-8")


def test_readme_documents_current_project_structure_and_setup():
    text = readme_text()

    expected_sections = [
        "# Specship",
        "## What the Application Does",
        "## Features",
        "## Project Structure",
        "## Backend Architecture",
        "## Frontend Architecture",
        "## Authentication Flow",
        "## Database Setup",
        "## API Overview",
        "## Environment Variables",
        "## Local Development",
        "## Running Tests",
        "## Build and Deployment",
        "## Troubleshooting",
    ]

    for section in expected_sections:
        assert section in text

    expected_content = [
        "FastAPI",
        "React",
        "Vite",
        "SQLAlchemy",
        "Neon PostgreSQL",
        "JWT",
        "DATABASE_URL",
        "JWT_SECRET_KEY",
        "uvicorn backend.main:app --reload",
        "npm run dev",
        "npm test",
        "pytest backend/tests",
        "GET /products",
        "POST /auth/register",
        "POST /orders",
        "frontend/src/App.jsx",
        "backend/routers/orders.py",
    ]

    for phrase in expected_content:
        assert phrase in text


def test_readme_removes_placeholder_content():
    text = readme_text()

    assert "specship_test3" not in text
