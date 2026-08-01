import unittest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.database import Base, get_db

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
connection = engine.connect()
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=connection)


def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


class TestParamTypeMastersAPI(unittest.TestCase):
    def setUp(self):
        self.old_override = app.dependency_overrides.get(get_db)
        app.dependency_overrides[get_db] = override_get_db
        Base.metadata.create_all(bind=connection)
        self.client = TestClient(app)

    def tearDown(self):
        Base.metadata.drop_all(bind=connection)
        if self.old_override:
            app.dependency_overrides[get_db] = self.old_override
        else:
            app.dependency_overrides.pop(get_db, None)

    def test_list_param_type_masters_empty(self):
        response = self.client.get("/api/param-type-masters")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_crud_param_type_master(self):
        # 1. Create
        payload = {
            "name": "SamplerType",
            "widget_type": "select",
            "combo_options": ["euler", "dpmpp_2m"],
            "min_value": None,
            "max_value": None,
            "step": None,
        }
        res_create = self.client.post("/api/param-type-masters", json=payload)
        self.assertEqual(res_create.status_code, 201)
        data = res_create.json()
        self.assertEqual(data["name"], "SamplerType")
        self.assertEqual(data["widget_type"], "select")
        self.assertEqual(data["combo_options"], ["euler", "dpmpp_2m"])
        ptm_id = data["id"]

        # 2. List
        res_list = self.client.get("/api/param-type-masters")
        self.assertEqual(res_list.status_code, 200)
        items = res_list.json()
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["id"], ptm_id)

        # 3. Conflict on duplicate name
        res_dup = self.client.post("/api/param-type-masters", json=payload)
        self.assertEqual(res_dup.status_code, 409)

        # 4. Update
        update_payload = {
            "name": "SamplerTypeUpdated",
            "widget_type": "select",
            "combo_options": ["euler", "dpmpp_2m", "ddim"],
            "min_value": None,
            "max_value": None,
            "step": None,
        }
        res_update = self.client.put(f"/api/param-type-masters/{ptm_id}", json=update_payload)
        self.assertEqual(res_update.status_code, 200)
        self.assertEqual(res_update.json()["name"], "SamplerTypeUpdated")
        self.assertEqual(res_update.json()["combo_options"], ["euler", "dpmpp_2m", "ddim"])

        # 5. Delete
        res_del = self.client.delete(f"/api/param-type-masters/{ptm_id}")
        self.assertEqual(res_del.status_code, 204)

        # 6. Verify empty list again
        res_list2 = self.client.get("/api/param-type-masters")
        self.assertEqual(res_list2.status_code, 200)
        self.assertEqual(res_list2.json(), [])
