import unittest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import Base, get_db
from app import models

SQLALCHEMY_DATABASE_URL = 'sqlite:///:memory:'
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={'check_same_thread': False})
connection = engine.connect()
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=connection)


def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


class TestSpeechTonePresetsAPI(unittest.TestCase):
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

    def test_list_presets_empty(self):
        response = self.client.get('/api/speech-tone-presets')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    def test_create_and_get_preset(self):
        payload = {
            'name': 'ツンデレ風',
            'prompt': 'ツンデレな口調で。「べ、別に〜じゃないんだからね！」のような言い回し。',
            'description': '素直になれない少女の口調',
            'sort_order': 1,
        }
        res_create = self.client.post('/api/speech-tone-presets', json=payload)
        self.assertEqual(res_create.status_code, 201)
        data = res_create.json()
        self.assertEqual(data['name'], 'ツンデレ風')
        self.assertEqual(data['prompt'], payload['prompt'])
        self.assertEqual(data['description'], payload['description'])
        self.assertEqual(data['sort_order'], 1)
        self.assertIn('id', data)
        self.assertIn('created_at', data)
        preset_id = data['id']

        # List
        res_list = self.client.get('/api/speech-tone-presets')
        self.assertEqual(res_list.status_code, 200)
        items = res_list.json()
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]['id'], preset_id)
        self.assertEqual(items[0]['name'], 'ツンデレ風')

    def test_create_duplicate_name_fails(self):
        payload = {
            'name': 'お嬢様風',
            'prompt': '〜ですわ、〜ですの',
        }
        res1 = self.client.post('/api/speech-tone-presets', json=payload)
        self.assertEqual(res1.status_code, 201)

        res2 = self.client.post('/api/speech-tone-presets', json=payload)
        self.assertEqual(res2.status_code, 400)
        self.assertIn('Preset with this name already exists', res2.json()['detail'])

    def test_list_presets_ordering(self):
        p1 = {'name': 'Preset Order 2', 'prompt': 'prompt 2', 'sort_order': 2}
        p2 = {'name': 'Preset Order 1', 'prompt': 'prompt 1', 'sort_order': 1}
        p3 = {'name': 'Preset Order 0', 'prompt': 'prompt 0', 'sort_order': 0}
        self.client.post('/api/speech-tone-presets', json=p1)
        self.client.post('/api/speech-tone-presets', json=p2)
        self.client.post('/api/speech-tone-presets', json=p3)

        res = self.client.get('/api/speech-tone-presets')
        self.assertEqual(res.status_code, 200)
        names = [item['name'] for item in res.json()]
        self.assertEqual(names, ['Preset Order 0', 'Preset Order 1', 'Preset Order 2'])

    def test_update_preset(self):
        payload = {
            'name': 'Original Preset',
            'prompt': 'Original Prompt',
            'description': 'Original Desc',
            'sort_order': 0,
        }
        res_create = self.client.post('/api/speech-tone-presets', json=payload)
        self.assertEqual(res_create.status_code, 201)
        preset_id = res_create.json()['id']

        update_payload = {
            'name': 'Updated Preset',
            'prompt': 'Updated Prompt',
            'description': 'Updated Desc',
            'sort_order': 5,
        }
        res_update = self.client.put(f'/api/speech-tone-presets/{preset_id}', json=update_payload)
        self.assertEqual(res_update.status_code, 200)
        updated = res_update.json()
        self.assertEqual(updated['name'], 'Updated Preset')
        self.assertEqual(updated['prompt'], 'Updated Prompt')
        self.assertEqual(updated['description'], 'Updated Desc')
        self.assertEqual(updated['sort_order'], 5)

    def test_update_duplicate_name_fails(self):
        self.client.post('/api/speech-tone-presets', json={'name': 'Preset 1', 'prompt': 'p1'})
        res2 = self.client.post('/api/speech-tone-presets', json={'name': 'Preset 2', 'prompt': 'p2'})
        preset2_id = res2.json()['id']

        res_update = self.client.put(f'/api/speech-tone-presets/{preset2_id}', json={'name': 'Preset 1'})
        self.assertEqual(res_update.status_code, 400)
        self.assertIn('Preset with this name already exists', res_update.json()['detail'])

    def test_update_not_found(self):
        res = self.client.put('/api/speech-tone-presets/9999', json={'name': 'New Name'})
        self.assertEqual(res.status_code, 404)

    def test_delete_preset(self):
        res_create = self.client.post('/api/speech-tone-presets', json={'name': 'To Delete', 'prompt': 'p'})
        self.assertEqual(res_create.status_code, 201)
        preset_id = res_create.json()['id']

        res_del = self.client.delete(f'/api/speech-tone-presets/{preset_id}')
        self.assertEqual(res_del.status_code, 204)

        res_list = self.client.get('/api/speech-tone-presets')
        self.assertEqual(len(res_list.json()), 0)

    def test_delete_not_found(self):
        res = self.client.delete('/api/speech-tone-presets/9999')
        self.assertEqual(res.status_code, 404)

    @patch('app.services.speech_parser.call_llm', new_callable=AsyncMock)
    def test_rewrite_speech_with_custom_prompt(self, mock_call_llm):
        mock_call_llm.return_value = '<dialogue>べ、別にあなたのことなんて心配してないんだからね！</dialogue>'

        payload = {
            'text': '大丈夫？無理しないでね。',
            'tone_prompt': 'ツンデレな口調',
        }
        res = self.client.post('/api/speech-tone-presets/rewrite', json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data['rewritten_text'], 'べ、別にあなたのことなんて心配してないんだからね！')
        mock_call_llm.assert_called_once()
        call_kwargs = mock_call_llm.call_args.kwargs
        self.assertIn('ツンデレな口調', call_kwargs['user_prompt'])
        self.assertIn('大丈夫？無理しないでね。', call_kwargs['user_prompt'])

    @patch('app.services.speech_parser.call_llm', new_callable=AsyncMock)
    def test_rewrite_speech_with_preset_id_and_structured_tags(self, mock_call_llm):
        mock_call_llm.return_value = (
            '<interpretation>穏やかな昼下がり</interpretation>\n'
            '<reasoning>上品さを強調</reasoning>\n'
            '<dialogue>お茶の時間ですわ！</dialogue>'
        )

        res_create = self.client.post('/api/speech-tone-presets', json={'name': 'お嬢様', 'prompt': '上品なお嬢様言葉'})
        preset_id = res_create.json()['id']

        payload = {
            'text': 'お茶にしよう。',
            'preset_id': preset_id,
        }
        res = self.client.post('/api/speech-tone-presets/rewrite', json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data['rewritten_text'], 'お茶の時間ですわ！')
        self.assertEqual(data['scene_interpretation'], '穏やかな昼下がり')
        self.assertEqual(data['reasoning'], '上品さを強調')
        mock_call_llm.assert_called_once()
        call_kwargs = mock_call_llm.call_args.kwargs
        self.assertIn('上品なお嬢様言葉', call_kwargs['user_prompt'])

    def test_rewrite_speech_empty_text_fails(self):
        payload = {
            'text': '   ',
            'tone_prompt': 'ツンデレ',
        }
        res = self.client.post('/api/speech-tone-presets/rewrite', json=payload)
        self.assertEqual(res.status_code, 400)
        self.assertIn('Text is required', res.json()['detail'])

    def test_rewrite_speech_missing_tone_fails(self):
        payload = {
            'text': 'こんにちは',
        }
        res = self.client.post('/api/speech-tone-presets/rewrite', json=payload)
        self.assertEqual(res.status_code, 400)
        self.assertIn('Tone prompt or valid preset_id is required', res.json()['detail'])

    @patch('app.services.speech_parser.call_llm', new_callable=AsyncMock)
    def test_rewrite_speech_llm_error_returns_500(self, mock_call_llm):
        mock_call_llm.side_effect = Exception('LLM connection timeout')

        payload = {
            'text': 'こんにちは',
            'tone_prompt': '丁寧語',
        }
        res = self.client.post('/api/speech-tone-presets/rewrite', json=payload)
        self.assertEqual(res.status_code, 500)
        self.assertIn('LLM connection timeout', res.json()['detail'])

    @patch('app.services.speech_parser.call_llm', new_callable=AsyncMock)
    def test_rewrite_speech_with_scene_hint_and_revision(self, mock_call_llm):
        mock_call_llm.return_value = '<dialogue>ふん、別に待ってなんか…ないわよ</dialogue>'

        payload = {
            'text': '待ってたよ',
            'tone_prompt': 'ツンデレ',
            'scene_hint': '照れながら頬を染めている状況',
            'previous_rewritten_text': '待ってたわよ',
            'revision_instruction': 'もっと素直じゃない態度を強調して',
        }
        res = self.client.post('/api/speech-tone-presets/rewrite', json=payload)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['rewritten_text'], 'ふん、別に待ってなんか…ないわよ')
        mock_call_llm.assert_called_once()
        user_prompt = mock_call_llm.call_args.kwargs['user_prompt']
        self.assertIn('【場面の状況・ヒント】\n照れながら頬を染めている状況', user_prompt)
        self.assertIn('【前回の変換結果に対する修正指示・ダメ出し】', user_prompt)
        self.assertIn('もっと素直じゃない態度を強調して', user_prompt)
        self.assertIn('待ってたわよ', user_prompt)

    @patch('app.routers.speech_tone_presets.load_image_as_base64')
    @patch('app.services.speech_parser.call_llm', new_callable=AsyncMock)
    def test_rewrite_speech_with_image_multimodal(self, mock_call_llm, mock_load_image):
        mock_load_image.return_value = 'dummybase64string'
        mock_call_llm.return_value = '<dialogue>な、何見てるのよ！</dialogue>'

        # Create dummy workflow and snapshot in DB
        db = TestingSessionLocal()
        wf = models.Workflow(name='Test Workflow', json_body='{}')
        db.add(wf)
        db.commit()
        db.refresh(wf)
        snap = models.Snapshot(workflow_id=wf.id, params='{}', image_path='snapshots/test.png')
        db.add(snap)
        db.commit()
        db.refresh(snap)
        snapshot_id = snap.id
        db.close()

        with patch('pathlib.Path.exists', return_value=True):
            payload = {
                'text': '何見てるの',
                'tone_prompt': 'ツンデレ',
                'snapshot_id': snapshot_id,
                'include_image': True,
            }
            res = self.client.post('/api/speech-tone-presets/rewrite', json=payload)
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.json()['rewritten_text'], 'な、何見てるのよ！')
            mock_call_llm.assert_called_once()
            call_kwargs = mock_call_llm.call_args.kwargs
            self.assertEqual(call_kwargs['image_data'], 'dummybase64string')
            self.assertIn('※画像が添付されています', call_kwargs['user_prompt'])

