import json
import unittest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app import models

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


class TestReq336MappingMastersAPI(unittest.TestCase):
    def setUp(self):
        self.old_override = app.dependency_overrides.get(get_db)
        app.dependency_overrides[get_db] = override_get_db
        Base.metadata.create_all(bind=connection)
        self.client = TestClient(app)
        self.db = TestingSessionLocal()

        # Seed initial stages for testing
        self.stage_main = models.StageMaster(
            key="main",
            name="通常 / Main",
            suffix="",
            search_keywords=json.dumps([]),
            previous_suffixes=json.dumps([]),
            is_builtin=True,
            is_active=True,
            sort_order=0,
        )
        self.stage_rough = models.StageMaster(
            key="rough",
            name="Rough",
            suffix="_rough",
            search_keywords=json.dumps(["rough"]),
            previous_suffixes=json.dumps([]),
            is_builtin=True,
            is_active=True,
            sort_order=1,
        )
        self.db.add_all([self.stage_main, self.stage_rough])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=connection)
        if self.old_override is not None:
            app.dependency_overrides[get_db] = self.old_override
        else:
            app.dependency_overrides.pop(get_db, None)

    def test_mapping_groups_crud_and_deletion_guard(self):
        # 1. Create custom group
        res = self.client.post("/api/mapping-groups", json={
            "key": "sampler",
            "name": "サンプラー系",
            "sort_order": 1,
            "is_active": True,
        })
        self.assertEqual(res.status_code, 201)
        group_data = res.json()
        group_id = group_data["id"]
        self.assertEqual(group_data["key"], "sampler")
        self.assertEqual(group_data["name"], "サンプラー系")
        self.assertFalse(group_data["is_builtin"])

        # Duplicate key rejected
        res_dup = self.client.post("/api/mapping-groups", json={
            "key": "sampler",
            "name": "サンプラー系重複",
        })
        self.assertEqual(res_dup.status_code, 400)

        # 2. List groups
        res_list = self.client.get("/api/mapping-groups")
        self.assertEqual(res_list.status_code, 200)
        self.assertEqual(len(res_list.json()), 1)

        # 3. Update group
        res_upd = self.client.put(f"/api/mapping-groups/{group_id}", json={
            "name": "サンプラー設定群",
        })
        self.assertEqual(res_upd.status_code, 200)
        self.assertEqual(res_upd.json()["name"], "サンプラー設定群")

        # 4. Guard 1: Cannot delete builtin group
        builtin_group = models.MappingGroupMaster(
            key="builtin_group",
            name="既定グループ",
            is_builtin=True,
            is_active=True,
        )
        self.db.add(builtin_group)
        self.db.commit()

        res_del_builtin = self.client.delete(f"/api/mapping-groups/{builtin_group.id}")
        self.assertEqual(res_del_builtin.status_code, 400)
        self.assertIn("システム既定のグループは削除できません", res_del_builtin.json()["detail"])

        # 5. Guard 2: Cannot delete group with active masters
        master = models.MappingMaster(
            group_id=group_id,
            base_key="steps",
            name="Steps",
            param_name="steps",
            input_type="int",
        )
        self.db.add(master)
        self.db.commit()

        res_del_inuse = self.client.delete(f"/api/mapping-groups/{group_id}")
        self.assertEqual(res_del_inuse.status_code, 400)
        self.assertIn("現在1件のマスターで使用中のため削除できません", res_del_inuse.json()["detail"])

        # 6. Logical hide (is_active = False)
        res_hide = self.client.put(f"/api/mapping-groups/{group_id}", json={
            "is_active": False,
        })
        self.assertEqual(res_hide.status_code, 200)
        self.assertFalse(res_hide.json()["is_active"])

        # 7. Safe physical delete after disassociating master
        master.group_id = None
        self.db.commit()

        res_del_ok = self.client.delete(f"/api/mapping-groups/{group_id}")
        self.assertEqual(res_del_ok.status_code, 204)

        # Verify deleted
        res_get = self.client.get(f"/api/mapping-groups/{group_id}")
        self.assertEqual(res_get.status_code, 404)

    def test_mapping_groups_reorder(self):
        g1 = models.MappingGroupMaster(key="g1", name="G1", sort_order=0)
        g2 = models.MappingGroupMaster(key="g2", name="G2", sort_order=1)
        self.db.add_all([g1, g2])
        self.db.commit()

        res = self.client.put("/api/mapping-groups/reorder", json={
            "ordered_ids": [g2.id, g1.id]
        })
        self.assertEqual(res.status_code, 204)

        self.db.refresh(g1)
        self.db.refresh(g2)
        self.assertEqual(g2.sort_order, 0)
        self.assertEqual(g1.sort_order, 1)

    def test_mapping_master_create_legacy_and_v2(self):
        # 1. Legacy create payload
        res_legacy = self.client.post("/api/mapping-masters", json={
            "role": "seed",
            "display_name": "Seed",
            "param_name": "seed",
            "input_type": "int",
            "expected_class_types": ["KSampler"],
            "title_patterns": ["KSampler"],
        })
        self.assertEqual(res_legacy.status_code, 201)
        data_legacy = res_legacy.json()
        self.assertEqual(data_legacy["role"], "seed")
        self.assertEqual(data_legacy["base_key"], "seed")
        self.assertEqual(data_legacy["display_name"], "Seed")
        self.assertEqual(data_legacy["name"], "Seed")
        self.assertEqual(len(data_legacy["variants"]), 2)  # Created for stage_main and stage_rough

        # 2. V2 create payload
        res_v2 = self.client.post("/api/mapping-masters", json={
            "base_key": "steps",
            "name": "Steps",
            "param_name": "steps",
            "input_type": "int",
            "expected_class_types": ["KSampler"],
            "base_title_patterns": ["KSampler"],
        })
        self.assertEqual(res_v2.status_code, 201)
        data_v2 = res_v2.json()
        self.assertEqual(data_v2["base_key"], "steps")
        self.assertEqual(data_v2["role"], "steps")
        self.assertEqual(data_v2["name"], "Steps")
        self.assertEqual(data_v2["display_name"], "Steps")
        self.assertEqual(len(data_v2["variants"]), 2)

        # Verify variants fields
        var_main = next(v for v in data_v2["variants"] if v["stage_key"] == "main")
        var_rough = next(v for v in data_v2["variants"] if v["stage_key"] == "rough")
        self.assertEqual(var_main["computed_role"], "steps")
        self.assertEqual(var_rough["computed_role"], "steps_rough")
        self.assertTrue(var_main["is_enabled"])
        self.assertTrue(var_rough["is_enabled"])

    def test_mapping_master_update_with_variants(self):
        # Create master
        res = self.client.post("/api/mapping-masters", json={
            "base_key": "steps",
            "name": "Steps",
            "param_name": "steps",
            "input_type": "int",
            "expected_class_types": ["KSampler"],
            "base_title_patterns": ["KSampler"],
        })
        self.assertEqual(res.status_code, 201)
        master_id = res.json()["id"]
        variants = res.json()["variants"]
        var_main_id = next(v["id"] for v in variants if v["stage_key"] == "main")
        var_rough_id = next(v["id"] for v in variants if v["stage_key"] == "rough")

        # Update parent master and variants in batch
        res_upd = self.client.put(f"/api/mapping-masters/{master_id}", json={
            "name": "Sampling Steps",
            "expected_class_types": ["KSampler", "KSamplerAdvanced"],
            "variants": [
                {
                    "id": var_main_id,
                    "is_enabled": True,
                },
                {
                    "id": var_rough_id,
                    "custom_role_override": "custom_rough_steps",
                    "is_enabled": False,
                }
            ]
        })
        self.assertEqual(res_upd.status_code, 200)
        upd_data = res_upd.json()
        self.assertEqual(upd_data["name"], "Sampling Steps")
        self.assertEqual(upd_data["display_name"], "Sampling Steps")
        self.assertEqual(upd_data["expected_class_types"], ["KSampler", "KSamplerAdvanced"])

        upd_variants = upd_data["variants"]
        upd_main = next(v for v in upd_variants if v["id"] == var_main_id)
        upd_rough = next(v for v in upd_variants if v["id"] == var_rough_id)

        self.assertTrue(upd_main["is_enabled"])
        self.assertEqual(upd_main["computed_role"], "steps")
        self.assertFalse(upd_rough["is_enabled"])
        self.assertEqual(upd_rough["custom_role_override"], "custom_rough_steps")
        self.assertEqual(upd_rough["computed_role"], "custom_rough_steps")

        # Verify persistence via GET
        res_get = self.client.get(f"/api/mapping-masters/{master_id}")
        self.assertEqual(res_get.status_code, 200)
        get_data = res_get.json()
        self.assertEqual(get_data["name"], "Sampling Steps")
        get_rough = next(v for v in get_data["variants"] if v["id"] == var_rough_id)
        self.assertFalse(get_rough["is_enabled"])
        self.assertEqual(get_rough["computed_role"], "custom_rough_steps")

    def test_mapping_master_filter_by_group(self):
        g1 = models.MappingGroupMaster(key="prompt", name="Prompt")
        g2 = models.MappingGroupMaster(key="sampler", name="Sampler")
        self.db.add_all([g1, g2])
        self.db.commit()

        self.client.post("/api/mapping-masters", json={
            "base_key": "prompt_pos",
            "name": "Prompt Positive",
            "param_name": "text",
            "input_type": "textarea",
            "group_id": g1.id,
        })
        self.client.post("/api/mapping-masters", json={
            "base_key": "steps",
            "name": "Steps",
            "param_name": "steps",
            "input_type": "int",
            "group_id": g2.id,
        })

        # List all
        res_all = self.client.get("/api/mapping-masters")
        self.assertEqual(len(res_all.json()), 2)

        # Filter by g1
        res_g1 = self.client.get(f"/api/mapping-masters?group_id={g1.id}")
        self.assertEqual(len(res_g1.json()), 1)
        self.assertEqual(res_g1.json()[0]["base_key"], "prompt_pos")

        # Filter by g2
        res_g2 = self.client.get(f"/api/mapping-masters?group_id={g2.id}")
        self.assertEqual(len(res_g2.json()), 1)
        self.assertEqual(res_g2.json()[0]["base_key"], "steps")

    def test_req358_master_AC_26_default_enabled_crud(self):
        """[REQ-358/AC-26] Master default_enabled defaults true and round-trips false."""
        default_res = self.client.post("/api/mapping-masters", json={
            "base_key": "default_role",
            "name": "Default Role",
            "param_name": "default_value",
            "input_type": "int",
        })
        self.assertEqual(default_res.status_code, 201)
        self.assertTrue(default_res.json()["default_enabled"])

        disabled_res = self.client.post("/api/mapping-masters", json={
            "base_key": "disabled_role",
            "name": "Disabled Role",
            "param_name": "disabled_value",
            "input_type": "int",
            "default_enabled": False,
        })
        self.assertEqual(disabled_res.status_code, 201)
        disabled_id = disabled_res.json()["id"]
        self.assertFalse(disabled_res.json()["default_enabled"])
        self.assertFalse(self.client.get(f"/api/mapping-masters/{disabled_id}").json()["default_enabled"])
        listed = self.client.get("/api/mapping-masters").json()
        self.assertIn(disabled_id, [row["id"] for row in listed])
        self.assertFalse(next(row for row in listed if row["id"] == disabled_id)["default_enabled"])

    def test_req358_master_AC_28_default_enabled_update_presence(self):
        """[REQ-358/AC-28] Omitted update retains value; explicit booleans replace it."""
        created = self.client.post("/api/mapping-masters", json={
            "base_key": "role",
            "name": "Role",
            "param_name": "value",
            "input_type": "int",
            "default_enabled": False,
        }).json()
        master_id = created["id"]

        omitted = self.client.put(f"/api/mapping-masters/{master_id}", json={"name": "Renamed"})
        self.assertEqual(omitted.status_code, 200)
        self.assertFalse(omitted.json()["default_enabled"])

        enabled = self.client.put(f"/api/mapping-masters/{master_id}", json={"default_enabled": True})
        self.assertEqual(enabled.status_code, 200)
        self.assertTrue(enabled.json()["default_enabled"])

    def test_req358_master_AC_30_default_enabled_rejects_null_and_non_boolean(self):
        """[REQ-358/AC-30] API rejects null and non-boolean default_enabled values."""
        created = self.client.post("/api/mapping-masters", json={
            "base_key": "role",
            "name": "Role",
            "param_name": "value",
            "input_type": "int",
        }).json()
        master_id = created["id"]
        self.assertEqual(self.client.put(f"/api/mapping-masters/{master_id}", json={"default_enabled": None}).status_code, 422)
        self.assertEqual(self.client.put(f"/api/mapping-masters/{master_id}", json={"default_enabled": "false"}).status_code, 422)
        self.assertEqual(self.client.post("/api/mapping-masters", json={
            "base_key": "bad_role",
            "param_name": "value",
            "input_type": "int",
            "default_enabled": None,
        }).status_code, 422)
