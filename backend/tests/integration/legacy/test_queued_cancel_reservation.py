import asyncio
import selectors

import httpx
import pytest
from fastapi import FastAPI

from app.routers.generation import router
from app.services.generation_service import GenerationService
from test_generation_service import FakeBridge, MemoryRepository, _payload


@pytest.fixture(scope="session")
def event_loop_policy():
    class NoopSelector:
        def __init__(self):
            self._map = {}

        def register(self, fileobj, events, data=None):
            key = selectors.SelectorKey(fileobj, selectors._fileobj_to_fd(fileobj), events, data)
            self._map[key.fd] = key
            return key

        def unregister(self, fileobj):
            return self._map.pop(selectors._fileobj_to_fd(fileobj))

        def modify(self, fileobj, events, data=None):
            self.unregister(fileobj)
            return self.register(fileobj, events, data)

        def select(self, timeout=None):
            return []

        def get_map(self):
            return self._map

        def close(self):
            self._map.clear()

    class NoSocketSelectorEventLoop(asyncio.SelectorEventLoop):
        def __init__(self):
            super().__init__(selector=NoopSelector())

        def _make_self_pipe(self):
            self._ssock = None
            self._csock = None

        def _write_to_self(self):
            return None

        def _close_self_pipe(self):
            return None

    class NoSocketEventLoopPolicy(asyncio.DefaultEventLoopPolicy):
        def new_event_loop(self):
            return NoSocketSelectorEventLoop()

    return NoSocketEventLoopPolicy()


def make_service(repository, bridge):
    return GenerationService(repository, bridge, clock=lambda: "2026-10-10T00:00:00Z", vram_status=lambda: {}, publish=None)


async def accepted_job(service):
    accepted = await service.accept(_payload())
    return accepted["job_ids"][0]


@pytest.mark.asyncio
async def test_local_queued_job_is_cancelled_without_upstream_calls():
    repository, bridge = MemoryRepository(), FakeBridge()
    service = make_service(repository, bridge)
    job_id = await accepted_job(service)

    result = await service.cancel_queued(job_id)

    assert result.outcome == "cancelled"
    assert repository.jobs[job_id]["status"] == "cancelled"
    assert bridge.deleted == []
    assert bridge.interrupts == []


@pytest.mark.asyncio
async def test_upstream_pending_is_deleted_but_running_is_never_interrupted():
    repository, bridge = MemoryRepository(), FakeBridge()
    service = make_service(repository, bridge)
    job_id = await accepted_job(service)
    repository.jobs[job_id].update(status="submitting", prompt_id="pending-1")
    bridge.pending = [{"prompt_id": "pending-1", "client_id": "backend"}]

    result = await service.cancel_queued(job_id)

    assert result.outcome == "cancelled"
    assert bridge.deleted == [["pending-1"]]
    assert bridge.interrupts == []

    running_id = await accepted_job(service)
    repository.jobs[running_id].update(status="running", prompt_id="running-1")
    bridge.running = [{"prompt_id": "running-1", "client_id": "backend"}]
    running_result = await service.cancel_queued(running_id)
    assert running_result.outcome == "not_cancelled"
    assert bridge.interrupts == []


@pytest.mark.asyncio
async def test_pending_job_that_starts_during_delete_is_not_cancelled():
    repository, bridge = MemoryRepository(), FakeBridge()
    service = make_service(repository, bridge)
    job_id = await accepted_job(service)
    repository.jobs[job_id].update(status="queued", prompt_id="race-1")
    bridge.pending = [{"prompt_id": "race-1", "client_id": "backend"}]

    def start_during_delete():
        bridge.pending = []
        bridge.running = [{"prompt_id": "race-1", "client_id": "backend"}]
        repository.jobs[job_id]["status"] = "running"

    bridge.after_delete_queue = start_during_delete
    result = await service.cancel_queued(job_id)

    assert result.outcome == "not_cancelled"
    assert repository.jobs[job_id]["status"] == "running"
    assert bridge.interrupts == []


@pytest.mark.asyncio
async def test_legacy_prompt_id_can_only_delete_pending_and_delete_failure_is_unconfirmed():
    repository, bridge = MemoryRepository(), FakeBridge()
    service = make_service(repository, bridge)
    bridge.pending = [{"prompt_id": "legacy-1", "client_id": "external"}]
    result = await service.cancel_queued("legacy-1")
    assert result.outcome == "cancelled"
    assert bridge.deleted == [["legacy-1"]]
    assert bridge.interrupts == []

    bridge.pending = [{"prompt_id": "legacy-2", "client_id": "external"}]
    bridge.delete_error = RuntimeError("delete failed")
    uncertain = await service.cancel_queued("legacy-2")
    assert uncertain.outcome == "unconfirmed"
    assert bridge.interrupts == []


@pytest.mark.asyncio
async def test_router_keeps_only_unsubmitted_and_adds_queued_only_guard():
    repository, bridge = MemoryRepository(), FakeBridge()
    service = make_service(repository, bridge)
    app = FastAPI()
    app.include_router(router)
    app.state.generation_service = service
    job_id = await accepted_job(service)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        queued = await client.post(f"/api/generation/jobs/{job_id}/cancel?only_queued=true")
        assert queued.status_code == 200
        assert queued.json()["outcome"] == "cancelled"

        legacy_id = await accepted_job(service)
        legacy = await client.post(f"/api/generation/jobs/{legacy_id}/cancel?only_unsubmitted=true")
        assert legacy.status_code == 200
        assert legacy.json()["outcome"] == "cancelled"

        conflict = await client.post(f"/api/generation/jobs/{legacy_id}/cancel?only_queued=true&only_unsubmitted=true")
        assert conflict.status_code == 422
