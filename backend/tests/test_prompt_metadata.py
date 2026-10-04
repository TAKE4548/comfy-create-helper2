import unittest
import json
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


class TestPromptMetadataRouter(unittest.TestCase):
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

    def test_save_and_get_prompt_metadata(self):
        # 1. 保存 (POST)
        payload = {
            "prompt_id": "p-12345",
            "workflow_id": 1,
            "param_values": {"prompt": "a beautiful landscape", "steps": 20},
            "applied_assets": {"loras": [{"name": "detailer", "strength": 0.8}]}
        }
        res = self.client.post("/api/prompt-metadata", json=payload)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"status": "ok", "prompt_id": "p-12345"})

        # 2. 取得 (GET)
        res_get = self.client.get("/api/prompt-metadata/p-12345")
        self.assertEqual(res_get.status_code, 200)
        data = res_get.json()
        self.assertEqual(data["prompt_id"], "p-12345")
        self.assertEqual(data["workflow_id"], 1)
        self.assertEqual(data["param_values"]["prompt"], "a beautiful landscape")
        self.assertEqual(data["applied_assets"]["loras"][0]["name"], "detailer")

    def test_upsert_prompt_metadata(self):
        # 初回保存
        self.client.post("/api/prompt-metadata", json={
            "prompt_id": "p-upsert",
            "workflow_id": 1,
            "param_values": {"seed": 111}
        })
        # 更新
        res = self.client.post("/api/prompt-metadata", json={
            "prompt_id": "p-upsert",
            "workflow_id": 2,
            "param_values": {"seed": 999},
            "applied_assets": {"test": True}
        })
        self.assertEqual(res.status_code, 200)

        res_get = self.client.get("/api/prompt-metadata/p-upsert")
        self.assertEqual(res_get.status_code, 200)
        data = res_get.json()
        self.assertEqual(data["workflow_id"], 2)
        self.assertEqual(data["param_values"]["seed"], 999)

    def test_get_not_found(self):
        res = self.client.get("/api/prompt-metadata/non-existent")
        self.assertEqual(res.status_code, 404)

    def test_req316_full_unicode_record_and_json_roundtrip(self):
        text = '日本語(重み:1.2)\r\n' * 200 + '末尾-REQ316'
        record = {'version': 1, 'workflow_id': 1, 'workflow_name': '生成時名称',
                  'completeness': 'complete', 'queued_at': '2026-10-03T17:00:00Z',
                  'fields': [{'mapping_id': i, 'node_id': str(i), 'role': role,
                              'param_name': 'text', 'input_type': 'textarea', 'display_name': role,
                              'class_type': 'CLIPTextEncode', 'recorded': True, 'value': value,
                              'status': 'submitted', 'value_kind': 'literal'}
                             for i, (role, value) in enumerate([('Quality', text), ('Character', '人物'), ('Negative', '低品質'), ('Scene', '')], 1)],
                  'parameters': [{'mapping_id': i, 'node_id': str(i), 'role': role, 'param_name': 'value',
                                  'input_type': 'lora_stack' if role == 'LoRA' else 'number', 'display_name': role,
                                  'class_type': None, 'recorded': True, 'value': value, 'status': 'submitted', 'value_kind': 'literal'}
                                 for i, (role, value) in enumerate([('Sampler_Seed', 123456), ('Enabled', False), ('Zero', 0), ('Null', None),
                                     ('Array', [0, False, None]), ('LoRA', {'lora_count': 1, 'lora_name_1': 'model', 'model_str_1': 0.4, 'clip_str_1': 0.8})], 5)],
                  'assets': [{'type': 'lora', 'asset_id': 4, 'name': '名前', 'role': 'Quality', 'tags': [],
                              'lora_prompt': None, 'origin': 'unknown', 'trigger_set_id': None, 'trigger_set_name': None}]}
        raw = json.dumps(record, ensure_ascii=False)
        params = {'Quality': text, 'seed': 123456, 'json': [False, 0, None, {'x': '日本語'}],
                  '__prompt_surgeon_metadata_v1': raw,
                  '__metadata_associations_v1': json.dumps({'version': 1, 'lora_trigger_sets': []})}
        assets = {'Quality': [{'assetId': 4, 'tags': ['日本語'], 'enabled': True}]}
        response = self.client.post('/api/prompt-metadata', json={
            'prompt_id': 'req316', 'workflow_id': 1, 'param_values': params, 'applied_assets': assets})
        self.assertEqual(response.status_code, 200)
        saved = self.client.get('/api/prompt-metadata/req316').json()
        self.assertEqual(saved['param_values'], params)
        self.assertEqual(saved['applied_assets'], assets)
        self.assertEqual(saved['param_values']['__prompt_surgeon_metadata_v1'], raw)
        self.assertEqual(json.loads(saved['param_values']['__prompt_surgeon_metadata_v1']), record)
