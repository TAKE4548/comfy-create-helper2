"""Focused contract tests for LM Studio instance acquisition and release."""

import asyncio
import json
import unittest
from collections import deque
from unittest.mock import AsyncMock, patch

import httpx

from app.services import lm_studio_lifecycle as lifecycle


class LifecycleTests(unittest.TestCase):
    def run_requests(self, responses, operation):
        pending = deque(responses)
        seen = []

        async def handler(request):
            seen.append(request)
            status, body = pending.popleft()
            if isinstance(status, Exception):
                raise status
            return httpx.Response(status, json=body if isinstance(body, dict) else None,
                                  content=None if isinstance(body, dict) else body)

        async def run():
            async_client = httpx.AsyncClient
            with patch.object(
                lifecycle.httpx,
                "AsyncClient",
                side_effect=lambda **kwargs: async_client(
                    transport=httpx.MockTransport(handler), **kwargs
                ),
            ):
                return await operation()

        return asyncio.run(run()), seen

    def test_acquire_reuses_one_exact_key_instance(self):
        result, seen = self.run_requests(
            [(200, {"models": [{"key": "wanted", "loaded_instances": [{"id": "instance-a"}]},
                               {"key": "wanted-extra", "loaded_instances": []}]})],
            lambda: lifecycle.acquire_model_instance("wanted"),
        )
        self.assertEqual(result, "instance-a")
        self.assertEqual([r.url.path for r in seen], ["/api/v1/models"])

    def test_acquire_loads_when_no_instance_is_loaded(self):
        result, seen = self.run_requests(
            [(200, {"models": [{"key": "wanted", "loaded_instances": []}]}),
             (200, {"instance_id": "new-instance"})],
            lambda: lifecycle.acquire_model_instance("wanted"),
        )
        self.assertEqual(result, "new-instance")
        self.assertEqual(seen[1].read(), b'{"model":"wanted"}')

    def test_load_timeout_recovers_completed_instance_id(self):
        async def delayed_load():
            with patch("app.services.lm_studio_lifecycle.asyncio.sleep", new_callable=AsyncMock):
                return await lifecycle.acquire_model_instance("wanted")

        result, seen = self.run_requests(
            [(200, {"models": [{"key": "wanted", "loaded_instances": []}]}),
             (httpx.ReadTimeout("delayed load response"), None),
             (200, {"models": [{"key": "wanted", "loaded_instances": []}]}),
             (200, {"models": [{"key": "wanted", "loaded_instances": [
                 {"id": "recovered-instance"}]}]})],
            delayed_load,
        )
        self.assertEqual(result, "recovered-instance")
        self.assertEqual([request.url.path for request in seen], [
            "/api/v1/models", "/api/v1/models/load", "/api/v1/models", "/api/v1/models"
        ])
        self.assertEqual(seen[1].extensions["timeout"]["read"], 120.0)

    def test_acquire_rejects_multiple_instances(self):
        with self.assertRaisesRegex(RuntimeError, "LM_STUDIO_INSTANCE_AMBIGUOUS"):
            self.run_requests(
                [(200, {"models": [{"key": "wanted", "loaded_instances": [
                    {"id": "one"}, {"id": "two"}]}]})],
                lambda: lifecycle.acquire_model_instance("wanted"),
            )

    def test_unload_retries_id_mismatch_then_verifies_state(self):
        result, seen = self.run_requests(
            [(200, {"wrong": "not-an-id"}),
             (200, {"instance_id": "target"}),
             (200, {"models": [{"key": "wanted", "loaded_instances": []}]})],
            lambda: lifecycle.unload_model_instance_with_retry("target"),
        )
        self.assertTrue(result)
        self.assertEqual([r.url.path for r in seen], [
            "/api/v1/models/unload", "/api/v1/models/unload", "/api/v1/models"
        ])
        self.assertEqual(json.loads(seen[1].read()), {"instance_id": "target"})

    def test_unload_rejects_http_200_without_expected_response_id(self):
        result, _ = self.run_requests(
            [(200, b"Unexpected endpoint or method") ,
             (200, b"Unexpected endpoint or method")],
            lambda: lifecycle.unload_model_instance_with_retry("target"),
        )
        self.assertFalse(result)

    def test_unload_rejects_instance_still_loaded(self):
        result, _ = self.run_requests(
            [(200, {"instance_id": "target"}),
             (200, {"models": [{"key": "wanted", "loaded_instances": [{"id": "target"}]}]}),
             (200, {"instance_id": "target"}),
             (200, {"models": [{"key": "wanted", "loaded_instances": [{"id": "target"}]}]})],
            lambda: lifecycle.unload_model_instance_with_retry("target"),
        )
        self.assertFalse(result)

    def test_unload_http_failure_is_verified_by_absent_instance(self):
        result, seen = self.run_requests(
            [(500, {"error": "unload reply failed"}),
             (200, {"models": [{"key": "wanted", "loaded_instances": []}]})],
            lambda: lifecycle.unload_model_instance_with_retry("target"),
        )
        self.assertTrue(result)
        self.assertEqual([request.url.path for request in seen], [
            "/api/v1/models/unload", "/api/v1/models"
        ])

    def test_unload_http_failure_with_instance_remaining_is_not_success(self):
        result, _ = self.run_requests(
            [(500, {"error": "unload reply failed"}),
             (200, {"models": [{"key": "wanted", "loaded_instances": [{"id": "target"}]}]})],
            lambda: lifecycle.unload_model_instance_with_retry("target", max_retries=0),
        )
        self.assertFalse(result)


if __name__ == "__main__":
    unittest.main()
