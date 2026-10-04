import json
import unittest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.database import Base, get_db
from app import models


class TestSnapshotRecordedMetadata(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite:///:memory:', connect_args={'check_same_thread': False})
        self.connection = self.engine.connect()
        self.factory = sessionmaker(autocommit=False, autoflush=False, bind=self.connection)
        self.old_override = app.dependency_overrides.get(get_db)
        def dependency():
            db = self.factory()
            try:
                yield db
            finally:
                db.close()
        app.dependency_overrides[get_db] = dependency
        Base.metadata.create_all(bind=self.connection)
        self.client = TestClient(app)
        self.db = self.factory()
        workflow = models.Workflow(name='req316-test-workflow', json_body='{}')
        self.db.add(workflow)
        self.db.commit()
        self.workflow_id = workflow.id

    def tearDown(self):
        try:
            self.client.close()
            self.db.close()
            Base.metadata.drop_all(bind=self.connection)
        finally:
            if self.old_override is None:
                app.dependency_overrides.pop(get_db, None)
            else:
                app.dependency_overrides[get_db] = self.old_override
            self.connection.close()
            self.engine.dispose()

    def test_record_remains_independent_after_prompt_metadata_deletion(self):
        text = '日本語(重み:1.2)\r\n' * 200 + '末尾-REQ316'
        record = {'version': 1, 'workflow_id': self.workflow_id, 'workflow_name': '生成時名称',
                  'completeness': 'complete', 'queued_at': '2026-10-03T17:00:00Z',
                  'fields': [{'mapping_id': i, 'node_id': str(i), 'role': role, 'param_name': 'text',
                              'input_type': 'textarea', 'display_name': role, 'class_type': 'CLIPTextEncode',
                              'recorded': True, 'value': value, 'status': 'submitted', 'value_kind': 'literal'}
                             for i, (role, value) in enumerate([('Quality', text), ('Character', '人物'), ('Negative', '低品質'), ('Scene', '')], 1)],
                  'parameters': [{'mapping_id': i, 'node_id': str(i), 'role': role, 'param_name': 'value',
                                  'input_type': 'lora_stack' if role == 'LoRA' else 'number', 'display_name': role,
                                  'class_type': None, 'recorded': True, 'value': value, 'status': 'submitted', 'value_kind': 'literal'}
                                 for i, (role, value) in enumerate([('Sampler_Seed', 123456), ('Enabled', False), ('Zero', 0), ('Null', None),
                                     ('Array', [0, False, None]), ('LoRA', {'lora_count': 1, 'lora_name_1': 'model', 'model_str_1': 0.4, 'clip_str_1': 0.8})], 5)],
                  'assets': [{'type': 'lora', 'asset_id': 4, 'name': '名前', 'role': 'Quality', 'tags': [],
                              'lora_prompt': None, 'origin': 'unknown', 'trigger_set_id': None, 'trigger_set_name': None}]}
        raw = json.dumps(record, ensure_ascii=False)
        params = {'Quality': text, 'seed': 123456, 'values': [False, 0, None, {}],
                  '__prompt_surgeon_metadata_v1': raw,
                  '__metadata_associations_v1': json.dumps({'version': 1, 'lora_trigger_sets': []})}
        response = self.client.post('/api/prompt-metadata', json={
            'prompt_id': 'req316', 'workflow_id': self.workflow_id, 'param_values': params, 'applied_assets': {}})
        self.assertEqual(response.status_code, 200)
        source = self.client.get('/api/prompt-metadata/req316').json()['param_values']
        created = self.client.post('/api/snapshots', json={'workflow_id': self.workflow_id, 'params': source})
        self.assertEqual(created.status_code, 201)
        snapshot_id = created.json()['id']
        self.assertEqual(self.client.get(f'/api/snapshots/{snapshot_id}').json()['params'], params)
        self.db.query(models.PromptMetadata).filter_by(prompt_id='req316').delete()
        self.db.commit()
        self.assertEqual(self.client.get('/api/prompt-metadata/req316').status_code, 404)
        saved = self.client.get(f'/api/snapshots/{snapshot_id}').json()
        self.assertEqual(saved['params'], params)
        self.assertEqual(saved['params']['__prompt_surgeon_metadata_v1'], raw)
        self.assertEqual(json.loads(saved['params']['__prompt_surgeon_metadata_v1']), record)
        with self.factory() as fresh:
            self.assertEqual(json.loads(fresh.query(models.Snapshot).filter_by(id=snapshot_id).one().params), params)

    def test_legacy_and_empty_params_roundtrip(self):
        for params in [{}, {'Quality': '', 'seed': 0, 'enabled': False, 'custom': {'x': [None, '日本語']}}]:
            response = self.client.post('/api/snapshots', json={'workflow_id': self.workflow_id, 'params': params})
            self.assertEqual(response.status_code, 201)
            saved = self.client.get(f"/api/snapshots/{response.json()['id']}")
            self.assertEqual(saved.status_code, 200)
            self.assertEqual(saved.json()['params'], params)
