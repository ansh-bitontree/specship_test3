import importlib
import os
import sys
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def require_backend_file(relative_path):
    file_path = BACKEND_DIR / relative_path
    if not file_path.exists():
        raise AssertionError(f"Expected backend file {relative_path} to exist")
    return file_path


def reload_backend_module(module_name):
    sys.modules.pop(module_name, None)
    return importlib.import_module(module_name)


class ProjectSetupTests(unittest.TestCase):
    def setUp(self):
        os.environ["DATABASE_URL"] = (
            "postgresql://neondb_owner:test-password@"
            "ep-super-dust-apa655z8-pooler.c-7.us-east-1.aws.neon.tech/"
            "neondb?sslmode=require&channel_binding=require"
        )
        for module_name in [
            "database",
            "main",
            "models",
            "models.order",
            "models.order_item",
            "models.product",
            "models.user",
        ]:
            sys.modules.pop(module_name, None)

    def test_fastapi_app_exposes_swagger_docs(self):
        require_backend_file("main.py")
        from fastapi.testclient import TestClient

        main = reload_backend_module("main")

        client = TestClient(main.app)
        response = client.get("/docs")

        self.assertEqual(response.status_code, 200)
        self.assertIn("swagger-ui", response.text)

    def test_cors_allows_vite_frontend_origin(self):
        require_backend_file("main.py")
        from fastapi.testclient import TestClient

        main = reload_backend_module("main")

        client = TestClient(main.app)
        response = client.options(
            "/",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers["access-control-allow-origin"],
            "http://localhost:5173",
        )

    def test_database_uses_neon_postgresql_url(self):
        require_backend_file("database.py")
        database = reload_backend_module("database")

        self.assertTrue(database.DATABASE_URL.startswith("postgresql://neondb_owner:"))
        self.assertIn("neon.tech/neondb", database.DATABASE_URL)
        self.assertIn("sslmode=require", database.DATABASE_URL)
        self.assertTrue(database.engine.url.drivername.startswith("postgresql"))

    def test_database_does_not_read_unrelated_root_env_local(self):
        os.environ.pop("DATABASE_URL", None)
        root_env_local = BACKEND_DIR.parent / ".env.local"
        if not root_env_local.exists():
            self.skipTest("No root .env.local file is present in this workspace")

        with self.assertRaisesRegex(RuntimeError, "DATABASE_URL"):
            reload_backend_module("database")

    def test_all_required_tables_are_registered_on_metadata(self):
        require_backend_file("models/__init__.py")
        reload_backend_module("models")
        database = importlib.import_module("database")

        expected_columns = {
            "users": {"id", "name", "email", "hashed_password", "created_at"},
            "products": {
                "id",
                "name",
                "description",
                "price",
                "stock",
                "image_url",
                "created_at",
            },
            "orders": {"id", "user_id", "total_price", "status", "created_at"},
            "order_items": {
                "id",
                "order_id",
                "product_id",
                "quantity",
                "unit_price",
            },
        }

        tables = database.Base.metadata.tables

        self.assertTrue(set(expected_columns).issubset(tables.keys()))
        for table_name, columns in expected_columns.items():
            self.assertTrue(columns.issubset(tables[table_name].columns.keys()))

    def test_create_tables_registers_models_before_creating_schema(self):
        require_backend_file("database.py")
        database = reload_backend_module("database")

        created_table_names = []

        def capture_create_all(bind):
            created_table_names.extend(database.Base.metadata.tables.keys())

        original_create_all = database.Base.metadata.create_all
        database.Base.metadata.create_all = capture_create_all

        try:
            database.create_tables()
        finally:
            database.Base.metadata.create_all = original_create_all

        self.assertEqual(
            {"users", "products", "orders", "order_items"},
            set(created_table_names),
        )


if __name__ == "__main__":
    unittest.main()
