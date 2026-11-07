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


class TestParamSyncGroupsAPI(unittest.TestCase):
    def _seed_variant(self, role: str, display_name: str | None = None) -> models.MappingVariant:
        master = models.MappingMaster(
            base_key=role,
            name=role,
            param_name=role,
            input_type="text",
            display_name=display_name or role.replace("_", " ").title(),
        )
        self.db.add(master)
        self.db.flush()

        variant = models.MappingVariant(
            master_id=master.id,
            stage_id=self.stage.id,
            role=role,
            binding_rule_set_id=self.rule_set.id,
            is_enabled=True,
        )
        self.db.add(variant)
        self.db.commit()
        self.db.refresh(variant)
        self.variants[role] = variant
        return variant

    def setUp(self):
        self.old_override = app.dependency_overrides.get(get_db)
        app.dependency_overrides[get_db] = override_get_db
        Base.metadata.create_all(bind=connection)
        self.client = TestClient(app)
        self.db = TestingSessionLocal()

        self.stage = models.StageMaster(
            key="default",
            name="Default",
            suffix="",
            is_builtin=True,
            is_active=True,
            sort_order=1,
        )
        self.rule_set = models.BindingRuleSet(name="default_rule_set")
        self.db.add_all([self.stage, self.rule_set])
        self.db.commit()

        self.variants: dict[str, models.MappingVariant] = {}
        roles_to_seed = [
            "ckpt_name", "refiner_ckpt_name", "vae_name",
            "seed", "subseed", "cfg", "refiner_cfg",
            "master1", "slave1", "slave2",
            "Sampler_Steps", "Sampler_Steps_Rough", "Other_Steps_Rough",
        ]
        for role in roles_to_seed:
            self._seed_variant(role)

        self.workflow = models.Workflow(name="test_wf", json_body="{}")
        self.db.add(self.workflow)
        self.db.commit()
        self.db.refresh(self.workflow)

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=connection)
        if self.old_override is not None:
            app.dependency_overrides[get_db] = self.old_override
        else:
            app.dependency_overrides.pop(get_db, None)

    def test_create_param_sync_group(self):
        payload = {
            "name": "Sync Group 1",
            "master_role": "ckpt_name",
            "slave_roles": ["refiner_ckpt_name", "vae_name"],
            "is_enabled": True
        }
        response = self.client.post(f"/api/workflows/{self.workflow.id}/param-sync-groups", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["id"] is not None
        assert data["workflow_id"] == self.workflow.id
        assert data["name"] == "Sync Group 1"
        assert data["master_role"] == "ckpt_name"
        assert data["slave_roles"] == ["refiner_ckpt_name", "vae_name"]
        assert data["is_enabled"] is True
        assert "created_at" in data

        # Test 404 when workflow not found
        response_bad = self.client.post("/api/workflows/9999/param-sync-groups", json=payload)
        assert response_bad.status_code == 404

    def test_list_param_sync_groups(self):
        g1 = models.ParamSyncGroup(
            workflow_id=self.workflow.id,
            name="Group A",
            master_role="seed",
            slave_roles='["subseed"]',
            master_variant_id=self.variants["seed"].id,
            is_enabled=True
        )
        g1.members = [models.ParamSyncGroupMember(variant_id=self.variants["subseed"].id)]
        g2 = models.ParamSyncGroup(
            workflow_id=self.workflow.id,
            name="Group B",
            master_role="cfg",
            slave_roles='["refiner_cfg"]',
            master_variant_id=self.variants["cfg"].id,
            is_enabled=False
        )
        g2.members = [models.ParamSyncGroupMember(variant_id=self.variants["refiner_cfg"].id)]
        self.db.add_all([g1, g2])
        self.db.commit()

        response = self.client.get(f"/api/workflows/{self.workflow.id}/param-sync-groups")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["name"] == "Group A"
        assert data[0]["master_role"] == "seed"
        assert data[0]["slave_roles"] == ["subseed"]
        assert data[0]["is_enabled"] is True

        assert data[1]["name"] == "Group B"
        assert data[1]["master_role"] == "cfg"
        assert data[1]["slave_roles"] == ["refiner_cfg"]
        assert data[1]["is_enabled"] is False

        # Test 404 when workflow not found
        response_bad = self.client.get("/api/workflows/9999/param-sync-groups")
        assert response_bad.status_code == 404

    def test_update_param_sync_group(self):
        g = models.ParamSyncGroup(
            workflow_id=self.workflow.id,
            name="Orig Name",
            master_role="master1",
            slave_roles='["slave1"]',
            master_variant_id=self.variants["master1"].id,
            is_enabled=False
        )
        g.members = [models.ParamSyncGroupMember(variant_id=self.variants["slave1"].id)]
        self.db.add(g)
        self.db.commit()
        self.db.refresh(g)

        payload = {"name": "New Name", "is_enabled": True, "slave_roles": ["slave1", "slave2"]}
        response = self.client.put(f"/api/param-sync-groups/{g.id}", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "New Name"
        assert data["master_role"] == "master1"
        assert data["slave_roles"] == ["slave1", "slave2"]
        assert data["is_enabled"] is True

        response_bad = self.client.put("/api/param-sync-groups/9999", json=payload)
        assert response_bad.status_code == 404

    def test_delete_param_sync_group(self):
        g = models.ParamSyncGroup(
            workflow_id=self.workflow.id,
            name="ToDelete",
            master_role="master1",
            slave_roles='[]',
            master_variant_id=self.variants["master1"].id,
            is_enabled=False
        )
        self.db.add(g)
        self.db.commit()
        self.db.refresh(g)

        response = self.client.delete(f"/api/param-sync-groups/{g.id}")
        assert response.status_code == 204

        db_g = self.db.query(models.ParamSyncGroup).filter(models.ParamSyncGroup.id == g.id).first()
        assert db_g is None

        response_bad = self.client.delete("/api/param-sync-groups/9999")
        assert response_bad.status_code == 404

    def test_stage_qualified_roles_round_trip(self):
        """[REQ-351/AC-6] Stage-qualified computed roles persist and reload unchanged."""
        payload = {
            "name": "Steps Sync",
            "master_role": "Sampler_Steps",
            "slave_roles": ["Sampler_Steps_Rough", "Other_Steps_Rough"],
            "is_enabled": True,
        }
        list_url = f"/api/workflows/{self.workflow.id}/param-sync-groups"
        created = self.client.post(list_url, json=payload)
        assert created.status_code == 201
        group_id = created.json()["id"]

        listed = self.client.get(list_url)
        assert listed.status_code == 200
        groups = [g for g in listed.json() if g["id"] == group_id]
        assert len(groups) == 1
        assert groups[0]["master_role"] == "Sampler_Steps"
        assert groups[0]["slave_roles"] == ["Sampler_Steps_Rough", "Other_Steps_Rough"]

        updated = self.client.put(
            f"/api/param-sync-groups/{group_id}",
            json={"slave_roles": ["Sampler_Steps_Rough"]},
        )
        assert updated.status_code == 200

        relisted = self.client.get(list_url)
        assert relisted.status_code == 200
        groups = [g for g in relisted.json() if g["id"] == group_id]
        assert len(groups) == 1
        assert groups[0]["slave_roles"] == ["Sampler_Steps_Rough"]
        assert groups[0]["master_role"] == "Sampler_Steps"
        assert groups[0]["name"] == "Steps Sync"
        assert groups[0]["is_enabled"] is True

    def test_variant_ref_ac3_create_with_variant_ids_persists_master_and_members(self):
        """[REQ-418/AC-3] Create sync group with master_variant_id and slave_variant_ids persists members."""
        m_vid = self.variants["ckpt_name"].id
        s1_vid = self.variants["refiner_ckpt_name"].id
        s2_vid = self.variants["vae_name"].id

        payload = {
            "name": "AC3 Variant IDs Group",
            "master_variant_id": m_vid,
            "slave_variant_ids": [s1_vid, s2_vid],
            "is_enabled": True,
        }
        res = self.client.post(f"/api/workflows/{self.workflow.id}/param-sync-groups", json=payload)
        assert res.status_code == 201
        data = res.json()
        assert data["master_variant_id"] == m_vid
        assert data["slave_variant_ids"] == [s1_vid, s2_vid]
        assert data["master_role"] == "ckpt_name"
        assert data["slave_roles"] == ["refiner_ckpt_name", "vae_name"]
        assert len(data["variants"]) == 3
        assert {v["id"] for v in data["variants"]} == {m_vid, s1_vid, s2_vid}

        # Check DB rows
        db_group = self.db.query(models.ParamSyncGroup).filter(models.ParamSyncGroup.id == data["id"]).first()
        assert db_group is not None
        assert db_group.master_variant_id == m_vid
        assert [m.variant_id for m in db_group.members] == [s1_vid, s2_vid]

    def test_param_sync_group_create_with_variant_ids_persists_members(self):
        """[REQ-418/AC-3] Param sync group create with variant IDs persists members in DB."""
        self.test_variant_ref_ac3_create_with_variant_ids_persists_master_and_members()

    def test_variant_ref_ac3_create_with_roles_fallback_resolves_ids(self):
        """[REQ-418/AC-3] Create sync group with legacy master_role and slave_roles resolves variant IDs."""
        payload = {
            "name": "Fallback Group",
            "master_role": "seed",
            "slave_roles": ["subseed"],
            "is_enabled": False,
        }
        res = self.client.post(f"/api/workflows/{self.workflow.id}/param-sync-groups", json=payload)
        assert res.status_code == 201
        data = res.json()
        assert data["master_variant_id"] == self.variants["seed"].id
        assert data["slave_variant_ids"] == [self.variants["subseed"].id]
        assert data["master_role"] == "seed"
        assert data["slave_roles"] == ["subseed"]

    def test_variant_ref_ac3_invalid_payload_returns_422(self):
        """[REQ-418/AC-3] Invalid payload returns 422 Unprocessable Entity."""
        # Empty name
        res = self.client.post(
            f"/api/workflows/{self.workflow.id}/param-sync-groups",
            json={"name": "   ", "master_variant_id": self.variants["seed"].id},
        )
        assert res.status_code == 422

        # Unknown master_variant_id
        res = self.client.post(
            f"/api/workflows/{self.workflow.id}/param-sync-groups",
            json={"name": "Bad Master ID", "master_variant_id": 999999},
        )
        assert res.status_code == 422

        # Unknown slave_variant_id
        res = self.client.post(
            f"/api/workflows/{self.workflow.id}/param-sync-groups",
            json={
                "name": "Bad Slave ID",
                "master_variant_id": self.variants["seed"].id,
                "slave_variant_ids": [999999],
            },
        )
        assert res.status_code == 422

        # Unknown master_role
        res = self.client.post(
            f"/api/workflows/{self.workflow.id}/param-sync-groups",
            json={"name": "Bad Master Role", "master_role": "non_existent_role"},
        )
        assert res.status_code == 422

        # Unknown slave_role
        res = self.client.post(
            f"/api/workflows/{self.workflow.id}/param-sync-groups",
            json={
                "name": "Bad Slave Role",
                "master_role": "seed",
                "slave_roles": ["non_existent_role"],
            },
        )
        assert res.status_code == 422

    def test_param_sync_group_rejects_unknown_variant_id(self):
        """[REQ-418/AC-3] Rejects unknown variant ID with 422 Unprocessable Entity."""
        res = self.client.post(
            f"/api/workflows/{self.workflow.id}/param-sync-groups",
            json={"name": "Unknown Vid", "master_variant_id": 888888},
        )
        assert res.status_code == 422

    def test_variant_ref_ac3_update_replaces_members_and_dedupes(self):
        """[REQ-418/AC-3] Update replaces members, deduplicates, and excludes master_variant_id."""
        m_vid = self.variants["master1"].id
        s1_vid = self.variants["slave1"].id
        s2_vid = self.variants["slave2"].id

        g = models.ParamSyncGroup(
            workflow_id=self.workflow.id,
            name="Update Group",
            master_role="master1",
            slave_roles="[]",
            master_variant_id=m_vid,
            is_enabled=False,
        )
        g.members = [models.ParamSyncGroupMember(variant_id=s1_vid)]
        self.db.add(g)
        self.db.commit()

        # Update with duplicates and including master_variant_id
        update_payload = {
            "slave_variant_ids": [s2_vid, m_vid, s2_vid, s1_vid],
        }
        res = self.client.put(f"/api/param-sync-groups/{g.id}", json=update_payload)
        assert res.status_code == 200
        data = res.json()
        assert data["slave_variant_ids"] == [s2_vid, s1_vid]
        assert data["slave_roles"] == ["slave2", "slave1"]

        # Check DB members
        self.db.expire_all()
        db_members = (
            self.db.query(models.ParamSyncGroupMember)
            .filter(models.ParamSyncGroupMember.group_id == g.id)
            .order_by(models.ParamSyncGroupMember.id)
            .all()
        )
        assert [m.variant_id for m in db_members] == [s2_vid, s1_vid]

    def test_variant_ref_ac3_delete_group_removes_members(self):
        """[REQ-418/AC-3] Deleting a sync group removes its members via cascade."""
        m_vid = self.variants["master1"].id
        s_vid = self.variants["slave1"].id

        g = models.ParamSyncGroup(
            workflow_id=self.workflow.id,
            name="Delete Group",
            master_role="master1",
            slave_roles="[]",
            master_variant_id=m_vid,
            is_enabled=False,
        )
        g.members = [models.ParamSyncGroupMember(variant_id=s_vid)]
        self.db.add(g)
        self.db.commit()
        group_id = g.id

        assert self.db.query(models.ParamSyncGroupMember).filter(
            models.ParamSyncGroupMember.group_id == group_id
        ).count() == 1

        res = self.client.delete(f"/api/param-sync-groups/{group_id}")
        assert res.status_code == 204

        assert self.db.query(models.ParamSyncGroupMember).filter(
            models.ParamSyncGroupMember.group_id == group_id
        ).count() == 0

    def test_variant_ref_ac4_list_reflects_renamed_role_and_display_name(self):
        """[REQ-418/AC-4] Param sync groups immediately reflect updated variant role and display_name."""
        m_var = self.variants["cfg"]
        s_var = self.variants["refiner_cfg"]

        g = models.ParamSyncGroup(
            workflow_id=self.workflow.id,
            name="Reflect Group",
            master_role="cfg",
            slave_roles="[]",
            master_variant_id=m_var.id,
            is_enabled=True,
        )
        g.members = [models.ParamSyncGroupMember(variant_id=s_var.id)]
        self.db.add(g)
        self.db.commit()

        # Initial fetch
        res1 = self.client.get(f"/api/workflows/{self.workflow.id}/param-sync-groups")
        assert res1.status_code == 200
        group_data1 = [x for x in res1.json() if x["id"] == g.id][0]
        assert group_data1["master_role"] == "cfg"
        assert group_data1["slave_roles"] == ["refiner_cfg"]

        # Now update MappingVariant role and MappingMaster display_name
        m_var.role = "cfg_renamed"
        m_var.master.display_name = "CFG Scale Updated"
        s_var.role = "refiner_cfg_renamed"
        self.db.commit()

        # Fetch again: should immediately reflect updated role and display_name
        res2 = self.client.get(f"/api/workflows/{self.workflow.id}/param-sync-groups")
        assert res2.status_code == 200
        group_data2 = [x for x in res2.json() if x["id"] == g.id][0]
        assert group_data2["master_role"] == "cfg_renamed"
        assert group_data2["slave_roles"] == ["refiner_cfg_renamed"]
        master_ref = [v for v in group_data2["variants"] if v["id"] == m_var.id][0]
        assert master_ref["role"] == "cfg_renamed"
        assert master_ref["display_name"] == "CFG Scale Updated"

    def test_param_sync_group_reflects_updated_variant_role_and_master_display_name(self):
        """[REQ-418/AC-4] Updated variant role and master display name are reflected immediately."""
        self.test_variant_ref_ac4_list_reflects_renamed_role_and_display_name()

