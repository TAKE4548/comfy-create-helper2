import asyncio
import json
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models  # noqa: F401 - register tables with Base
from app.database import Base, get_db
from app.main import app
from app.schemas.speech import SimilarSceneCandidate
from app.services.speech_scene_service import SceneDraftError


engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
connection = engine.connect()
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=connection)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


class TestSpeechSceneRouter(unittest.TestCase):
    def setUp(self):
        self.old_override = app.dependency_overrides.get(get_db)
        app.dependency_overrides[get_db] = override_get_db
        Base.metadata.create_all(bind=connection)
        self.client = TestClient(app)

    def tearDown(self):
        Base.metadata.drop_all(bind=connection)
        if self.old_override is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = self.old_override

    @patch("app.routers.speech_scene.speech_scene_service.generate_scene_script", new_callable=AsyncMock)
    def test_response_and_override_propagation(self, generate):
        candidate = SimilarSceneCandidate(
            snapshot_id=23, thumbnail_url="/thumb", score=2,
            matched_stems=["scene"], prompt="prompt", bubble_count=1,
        )
        generate.return_value = ("interpretation", [], True, [], 23, [candidate])
        response = self.client.post("/api/speech/scene-draft", json={
            "snapshot_id": 4, "override_similar_scene_snapshot_id": 23,
        })
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["scene_interpretation"], "interpretation")
        self.assertEqual(data["bubbles"], [])
        self.assertTrue(data["vram_unloaded"])
        self.assertEqual(data["tone_samples"], [])
        self.assertEqual(data["selected_similar_scene_id"], 23)
        self.assertEqual(data["candidate_similar_scenes"][0]["snapshot_id"], 23)
        self.assertEqual(generate.await_args.kwargs["override_similar_scene_snapshot_id"], 23)

    @patch("app.routers.speech_scene.speech_scene_service.generate_scene_script", new_callable=AsyncMock)
    def test_invalid_override_returns_4xx(self, generate):
        generate.side_effect = ValueError("Invalid similar scene override: 999")
        response = self.client.post("/api/speech/scene-draft", json={
            "snapshot_id": 4, "override_similar_scene_snapshot_id": 999,
        })
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"]["error_kind"], "not_found")
        self.assertNotIn("999", response.text)

    @patch("app.routers.speech_scene.speech_scene_service.generate_scene_script", new_callable=AsyncMock)
    def test_missing_image_returns_4xx(self, generate):
        generate.side_effect = ValueError("Image file not found: missing.png")
        response = self.client.post("/api/speech/scene-draft", json={"snapshot_id": 4})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"]["error_kind"], "not_found")
        self.assertNotIn("missing.png", response.text)

    @patch("app.routers.speech_scene.speech_scene_service.generate_scene_script", new_callable=AsyncMock)
    def test_vlm_error_is_safe_and_classified(self, generate):
        generate.side_effect = SceneDraftError("vlm_invalid_json")
        response = self.client.post("/api/speech/scene-draft", json={"snapshot_id": 4})
        self.assertEqual(response.status_code, 502)
        detail = response.json()["detail"]
        self.assertEqual(detail["error_kind"], "vlm_invalid_json")
        self.assertEqual(detail["status_code"], 502)
        self.assertNotIn("SceneDraftError", response.text)

    @patch("app.routers.speech_scene.speech_scene_service.generate_scene_script", new_callable=AsyncMock)
    def test_lm_studio_transport_errors_use_gateway_statuses(self, generate):
        cases = (
            (httpx.ConnectError("private prompt"), 503, "connection_refused"),
            (httpx.TimeoutException("private image path"), 504, "timeout"),
            (RuntimeError("LM_STUDIO_INSTANCE_AMBIGUOUS"), 503, "lm_studio_error"),
        )
        for exception, expected_status, expected_kind in cases:
            with self.subTest(expected_kind=expected_kind):
                generate.side_effect = exception
                response = self.client.post("/api/speech/scene-draft", json={"snapshot_id": 4})
                self.assertEqual(response.status_code, expected_status)
                self.assertEqual(response.json()["detail"]["error_kind"], expected_kind)
                self.assertNotIn("private", response.text)

    @patch("app.routers.speech_scene.speech_scene_service.generate_scene_script", new_callable=AsyncMock)
    def test_lm_http_error_body_is_not_exposed(self, generate):
        request = httpx.Request("POST", "http://localhost/v1/chat/completions")
        response_body = httpx.Response(400, request=request, text="private model response and prompt")
        generate.side_effect = httpx.HTTPStatusError("private raw error", request=request, response=response_body)
        with self.assertLogs("app.routers.speech_scene", level="WARNING") as captured:
            response = self.client.post("/api/speech/scene-draft", json={"snapshot_id": 4})
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["detail"]["error_kind"], "lm_studio_400")
        self.assertNotIn("private", response.text)
        self.assertIn("code=lm_studio_400 http_status=502 stage=reference", captured.output[0])
        self.assertNotIn("private", captured.output[0])

    @patch("app.routers.speech_scene.SessionLocal")
    @patch("app.routers.speech_scene.speech_scene_service.generate_scene_script", new_callable=AsyncMock)
    def test_stream_uses_same_lm_error_classification_and_status(self, generate, _session_factory):
        request = httpx.Request("POST", "http://localhost/v1/chat/completions")
        response_body = httpx.Response(400, request=request, text="private LM Studio body")
        generate.side_effect = httpx.HTTPStatusError("private prompt", request=request, response=response_body)
        response = self.client.post("/api/speech/scene-draft/stream", json={"snapshot_id": 4})
        event = [json.loads(line) for line in response.text.splitlines()][-1]
        self.assertEqual(response.status_code, 200)
        self.assertEqual(event["error_kind"], "lm_studio_400")
        self.assertEqual(event["status_code"], 502)
        self.assertNotIn("private", response.text)

    @patch("app.routers.speech_scene.speech_scene_service.generate_scene_script", new_callable=AsyncMock)
    def test_unrelated_value_error_is_not_misreported_as_not_found(self, generate):
        generate.side_effect = ValueError("unexpected parser state")
        response = self.client.post("/api/speech/scene-draft", json={"snapshot_id": 4})
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json()["detail"]["error_kind"], "scene_generation_failed")
        self.assertNotIn("unexpected parser state", response.text)

    @patch("app.routers.speech_scene.speech_scene_service.generate_scene_script", new_callable=AsyncMock)
    def test_json_success_reports_unload_failure_as_false(self, generate):
        generate.return_value = ("interpretation", [], False, [], None, [])
        response = self.client.post("/api/speech/scene-draft", json={"snapshot_id": 4})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["vram_unloaded"])

    @patch("app.routers.speech_scene.SessionLocal")
    @patch("app.routers.speech_scene.speech_scene_service.generate_scene_script", new_callable=AsyncMock)
    def test_stream_emits_progress_then_one_complete_result(self, generate, session_factory):
        async def fake_generate(*args, **kwargs):
            callback = kwargs["progress_callback"]
            for step in ("reference", "vlm", "style", "vram"):
                await callback(step, "active")
                await callback(step, "done")
            return ("interpretation", [], True, [], None, [])

        generate.side_effect = fake_generate
        response = self.client.post("/api/speech/scene-draft/stream", json={"snapshot_id": 4})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "application/x-ndjson")
        events = [json.loads(line) for line in response.text.splitlines()]
        self.assertEqual([event["type"] for event in events], ["progress"] * 8 + ["result"])
        self.assertEqual(
            [(event["step"], event["status"]) for event in events[:-1]],
            [(step, status) for step in ("reference", "vlm", "style", "vram") for status in ("active", "done")],
        )
        self.assertEqual(events[-1]["data"]["scene_interpretation"], "interpretation")
        self.assertIn("candidate_similar_scenes", events[-1]["data"])
        self.assertEqual(sum(event["type"] == "result" for event in events), 1)
        session_factory.assert_called_once()
        session_factory.return_value.close.assert_called_once()

    @patch("app.routers.speech_scene.SessionLocal")
    @patch("app.routers.speech_scene.speech_scene_service.generate_scene_script", new_callable=AsyncMock)
    def test_stream_service_error_is_ndjson_error_without_sensitive_details(self, generate, _session_factory):
        generate.side_effect = ValueError("Image file not found: /private/image.png secret prompt")
        response = self.client.post("/api/speech/scene-draft/stream", json={"snapshot_id": 4})
        self.assertEqual(response.status_code, 200)
        events = [json.loads(line) for line in response.text.splitlines()]
        self.assertEqual(events[-1]["type"], "error")
        self.assertEqual(events[-1]["error_kind"], "not_found")
        self.assertEqual(events[-1]["status_code"], 404)
        self.assertNotIn("private", response.text)
        self.assertNotIn("secret prompt", response.text)
        self.assertFalse(any(event["type"] == "result" for event in events))

    @patch("app.routers.speech_scene.SessionLocal")
    @patch("app.routers.speech_scene.speech_scene_service.generate_scene_script", new_callable=AsyncMock)
    def test_stream_vram_cleanup_failure_never_emits_result(self, generate, _session_factory):
        async def fake_generate(*args, **kwargs):
            await kwargs["progress_callback"]("vram", "active")
            await kwargs["progress_callback"]("vram", "error")
            return ("interpretation", [], False, [], None, [])

        generate.side_effect = fake_generate
        response = self.client.post("/api/speech/scene-draft/stream", json={"snapshot_id": 4})
        events = [json.loads(line) for line in response.text.splitlines()]
        self.assertEqual(events[-1]["type"], "error")
        self.assertEqual(events[-1]["error_kind"], "vram_unload_failed")
        self.assertEqual(events[-1]["status_code"], 503)
        self.assertFalse(any(event["type"] == "result" for event in events))

    def test_stream_schema_validation_still_returns_422_before_stream(self):
        response = self.client.post("/api/speech/scene-draft/stream", json={})
        self.assertEqual(response.status_code, 422)

    @patch("app.routers.speech_scene.SessionLocal")
    @patch("app.routers.speech_scene.speech_scene_service.generate_scene_script", new_callable=AsyncMock)
    def test_stream_cancellation_awaits_service_cleanup(self, generate, session_factory):
        cleanup = asyncio.Event()

        async def fake_generate(*args, **kwargs):
            try:
                await kwargs["progress_callback"]("reference", "active")
                await asyncio.Event().wait()
            finally:
                # Models T12's awaited unload in its finally block.
                cleanup.set()

        generate.side_effect = fake_generate

        async def cancel_stream():
            from app.routers.speech_scene import generate_scene_draft_stream

            response = await generate_scene_draft_stream(
                __import__("app.schemas.speech", fromlist=["SceneDraftRequest"]).SceneDraftRequest(snapshot_id=4)
            )
            iterator = response.body_iterator
            session_factory.assert_not_called()
            first = await iterator.__anext__()
            session_factory.assert_called_once()
            self.assertIn(b'"reference"', first)
            await iterator.aclose()
            self.assertTrue(cleanup.is_set())
            session_factory.return_value.close.assert_called_once()

        asyncio.run(cancel_stream())
