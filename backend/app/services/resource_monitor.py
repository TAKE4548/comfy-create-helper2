import asyncio
import json
import subprocess
import time
from typing import Callable

try:
    import psutil
except ImportError:
    psutil = None  # type: ignore

# ---------------------------------------------------------------------------
# リソース監視サービス
# ---------------------------------------------------------------------------


class ResourceMonitorService:
    """CPU / RAM / GPU メトリクスを定期収集し、ブロードキャスト関数へ送信するサービス。"""

    _task: asyncio.Task | None = None
    INTERVAL: float = 2.5

    async def start(self, broadcast_fn: Callable[[str], None]) -> None:
        """監視タスクを開始する。"""
        self._task = asyncio.create_task(self._run(broadcast_fn))

    async def stop(self) -> None:
        """監視タスクをキャンセルする。"""
        if self._task:
            self._task.cancel()

    async def _run(self, broadcast_fn: Callable[[str], None]) -> None:
        while True:
            data = await self._collect()
            msg = json.dumps({"type": "SYSTEM_STATS", "data": data})
            await broadcast_fn(msg)
            await asyncio.sleep(self.INTERVAL)

    async def _collect(self) -> dict:
        if psutil is not None:
            cpu = psutil.cpu_percent(interval=None)
            mem = psutil.virtual_memory()
            ram_used_gb = round(mem.used / 1e9, 1)
            ram_total_gb = round(mem.total / 1e9, 1)
            ram_pct = mem.percent
        else:
            cpu = 0.0
            ram_used_gb = 0.0
            ram_total_gb = 0.0
            ram_pct = 0.0

        gpu_pct, vram_used, vram_total, vram_pct = await self._get_gpu_stats()
        return {
            "cpu_pct": cpu,
            "ram_used_gb": ram_used_gb,
            "ram_total_gb": ram_total_gb,
            "ram_pct": ram_pct,
            "gpu_pct": gpu_pct,
            "vram_used_gb": vram_used,
            "vram_total_gb": vram_total,
            "vram_pct": vram_pct,
            "ts": int(time.time() * 1000),
        }

    async def _get_gpu_stats(self) -> tuple:
        """rocm-smi から GPU / VRAM 情報を取得する。失敗時は (None, None, None, None) を返す。"""
        try:
            result = subprocess.run(
                ["rocm-smi", "--showmeminfo", "vram", "--json"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode != 0:
                return (None, None, None, None)

            raw = json.loads(result.stdout)

            # rocm-smi JSON の典型的なキー構造: {"card0": {"VRAM Total Memory (B)": ..., "VRAM Total Used Memory (B)": ...}}
            card = next(iter(raw.values()))
            vram_total_bytes = int(card.get("VRAM Total Memory (B)", 0))
            vram_used_bytes = int(card.get("VRAM Total Used Memory (B)", 0))

            if vram_total_bytes == 0:
                return (None, None, None, None)

            vram_total_gb = round(vram_total_bytes / 1e9, 1)
            vram_used_gb = round(vram_used_bytes / 1e9, 1)
            vram_pct = round(vram_used_bytes / vram_total_bytes * 100, 1)

            # GPU 使用率は rocm-smi --showuse 等で別途取得が必要だが、
            # --showmeminfo のみでは取得不可のため None を返す
            return (None, vram_used_gb, vram_total_gb, vram_pct)

        except Exception:
            return (None, None, None, None)


resource_monitor = ResourceMonitorService()
