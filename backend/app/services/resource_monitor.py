import asyncio
import json
import subprocess
import sys
import time
from typing import Callable, Awaitable, Any

try:
    import psutil
except ImportError:
    psutil = None  # type: ignore

# ---------------------------------------------------------------------------
# Windows 用 GPU / VRAM モニター (DXGI + PDH)
# ---------------------------------------------------------------------------

if sys.platform == "win32":
    import ctypes
    from ctypes import wintypes
    import uuid

    HRESULT = ctypes.c_long

    class GUID(ctypes.Structure):
        _fields_ = [
            ("Data1", wintypes.DWORD),
            ("Data2", wintypes.WORD),
            ("Data3", wintypes.WORD),
            ("Data4", ctypes.c_ubyte * 8),
        ]

        @classmethod
        def from_uuid(cls, u: uuid.UUID):
            b = u.bytes_le
            return cls(
                int.from_bytes(b[0:4], "little"),
                int.from_bytes(b[4:6], "little"),
                int.from_bytes(b[6:8], "little"),
                (ctypes.c_ubyte * 8)(*b[8:16]),
            )

    class LUID(ctypes.Structure):
        _fields_ = [
            ("LowPart", wintypes.DWORD),
            ("HighPart", wintypes.LONG),
        ]

    class DXGI_ADAPTER_DESC1(ctypes.Structure):
        _fields_ = [
            ("Description", ctypes.c_uint16 * 128),
            ("VendorId", wintypes.UINT),
            ("DeviceId", wintypes.UINT),
            ("SubSysId", wintypes.UINT),
            ("Revision", wintypes.UINT),
            ("DedicatedVideoMemory", ctypes.c_size_t),
            ("DedicatedSystemMemory", ctypes.c_size_t),
            ("SharedSystemMemory", ctypes.c_size_t),
            ("AdapterLuid", LUID),
            ("Flags", wintypes.UINT),
        ]

    class WindowsGpuMonitor:
        """DXGI (総量取得) と PDH (使用量取得) を組み合わせた動的GPU/VRAMサンプラー"""

        def __init__(self):
            self._initialized = False
            self._pdh = None
            self._h_query = None
            self._h_vram = None
            self._h_gpu = None
            self.primary_luid_hex: str | None = None

            # 起動時にDXGIからVRAM総量を動的検出（取得失敗時は16.0にフォールバック）
            self.vram_total_gb: float = self._detect_total_vram_gb() or 16.0
            self._init_pdh()

        def _detect_total_vram_gb(self) -> float | None:
            """DXGI API を叩いてプライマリGPUの DedicatedVideoMemory (VRAM総容量) を取得する"""
            try:
                dxgi = ctypes.windll.dxgi
                IID_IDXGIFactory1 = GUID.from_uuid(uuid.UUID("{770aae78-f26f-4dba-a829-253c83d1b387}"))

                pFactory = ctypes.c_void_p()
                if dxgi.CreateDXGIFactory1(ctypes.byref(IID_IDXGIFactory1), ctypes.byref(pFactory)) != 0:
                    return None

                vtable_ptr = ctypes.cast(pFactory, ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p)))
                vtable = vtable_ptr.contents

                FN_Release = ctypes.WINFUNCTYPE(wintypes.ULONG, ctypes.c_void_p)
                FN_EnumAdapters1 = ctypes.WINFUNCTYPE(HRESULT, ctypes.c_void_p, wintypes.UINT, ctypes.POINTER(ctypes.c_void_p))
                FN_GetDesc1 = ctypes.WINFUNCTYPE(HRESULT, ctypes.c_void_p, ctypes.POINTER(DXGI_ADAPTER_DESC1))

                factory_release = FN_Release(vtable[2])
                enum_adapters1 = FN_EnumAdapters1(vtable[12])

                max_vram_bytes = 0
                selected_luid_hex = None
                i = 0
                while True:
                    pAdapter = ctypes.c_void_p()
                    if enum_adapters1(pFactory, i, ctypes.byref(pAdapter)) != 0 or not pAdapter.value:
                        break

                    adapter_vtable_ptr = ctypes.cast(pAdapter, ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p)))
                    adapter_vtable = adapter_vtable_ptr.contents
                    adapter_release = FN_Release(adapter_vtable[2])
                    get_desc1 = FN_GetDesc1(adapter_vtable[10])

                    desc = DXGI_ADAPTER_DESC1()
                    if get_desc1(pAdapter, ctypes.byref(desc)) == 0:
                        # ソフトウェアレンダラー（Flags & 2）を除外し、最大のVRAMを持つアダプタを採用
                        if not (desc.Flags & 2):
                            if desc.DedicatedVideoMemory > max_vram_bytes:
                                max_vram_bytes = desc.DedicatedVideoMemory
                                selected_luid_hex = f"0x{desc.AdapterLuid.HighPart:08x}_0x{desc.AdapterLuid.LowPart:08x}".lower()

                    adapter_release(pAdapter)
                    i += 1

                factory_release(pFactory)

                if selected_luid_hex:
                    self.primary_luid_hex = selected_luid_hex

                if max_vram_bytes > 0:
                    raw_gb = max_vram_bytes / (1024 ** 3)
                    rounded_gb = round(raw_gb)
                    if abs(raw_gb - rounded_gb) < 0.3:
                        return float(rounded_gb)
                    return round(raw_gb, 1)
                return None
            except Exception:
                return None

        def _init_pdh(self):
            try:
                self._pdh = ctypes.windll.pdh

                self.PDH_FMT_DOUBLE = 0x00000200
                self.PDH_FMT_LARGE = 0x00000400

                class PDH_FMT_COUNTERVALUE(ctypes.Structure):
                    class _UNION(ctypes.Union):
                        _fields_ = [
                            ("longValue", ctypes.c_int32),
                            ("doubleValue", ctypes.c_double),
                            ("largeValue", ctypes.c_int64),
                            ("AnsiStringValue", ctypes.c_char_p),
                            ("WideStringValue", ctypes.c_wchar_p),
                        ]
                    _fields_ = [("CStatus", ctypes.c_uint32), ("val", _UNION)]

                class PDH_FMT_COUNTERVALUE_ITEM(ctypes.Structure):
                    _fields_ = [("szName", ctypes.c_wchar_p), ("FmtValue", PDH_FMT_COUNTERVALUE)]

                self.ItemStruct = PDH_FMT_COUNTERVALUE_ITEM

                h_query = wintypes.HANDLE()
                if self._pdh.PdhOpenQueryW(None, 0, ctypes.byref(h_query)) != 0:
                    return
                self._h_query = h_query

                h_vram = wintypes.HANDLE()
                self._pdh.PdhAddEnglishCounterW(
                    self._h_query, r"\GPU Adapter Memory(*)\Dedicated Usage", 0, ctypes.byref(h_vram)
                )
                self._h_vram = h_vram

                h_gpu = wintypes.HANDLE()
                self._pdh.PdhAddEnglishCounterW(
                    self._h_query, r"\GPU Engine(*)\Utilization Percentage", 0, ctypes.byref(h_gpu)
                )
                self._h_gpu = h_gpu

                self._pdh.PdhCollectQueryData(self._h_query)
                self._initialized = True
            except Exception:
                self._initialized = False


        def _get_sum(self, h_counter, fmt, is_double=False) -> float:
            if not self._initialized or not h_counter or self._pdh is None:
                return 0.0
            try:
                buf_size = ctypes.c_uint32(0)
                item_count = ctypes.c_uint32(0)
                self._pdh.PdhGetFormattedCounterArrayW(h_counter, fmt, ctypes.byref(buf_size), ctypes.byref(item_count), None)
                if buf_size.value == 0:
                    return 0.0

                buf = ctypes.create_string_buffer(buf_size.value)
                status = self._pdh.PdhGetFormattedCounterArrayW(
                    h_counter, fmt, ctypes.byref(buf_size), ctypes.byref(item_count), ctypes.cast(buf, ctypes.c_void_p)
                )
                if status != 0:
                    return 0.0

                items = ctypes.cast(buf, ctypes.POINTER(self.ItemStruct))
                total = 0.0
                for i in range(item_count.value):
                    item = items[i]
                    if item.FmtValue.CStatus == 0:
                        if is_double:
                            total += item.FmtValue.val.doubleValue
                        else:
                            total += float(item.FmtValue.val.largeValue)
                return total
            except Exception:
                return 0.0

        def _get_engine_max(self, h_counter) -> float:
            if not self._initialized or not h_counter or self._pdh is None:
                return 0.0
            try:
                buf_size = ctypes.c_uint32(0)
                item_count = ctypes.c_uint32(0)
                self._pdh.PdhGetFormattedCounterArrayW(
                    h_counter, self.PDH_FMT_DOUBLE, ctypes.byref(buf_size), ctypes.byref(item_count), None
                )
                if buf_size.value == 0:
                    return 0.0

                buf = ctypes.create_string_buffer(buf_size.value)
                status = self._pdh.PdhGetFormattedCounterArrayW(
                    h_counter,
                    self.PDH_FMT_DOUBLE,
                    ctypes.byref(buf_size),
                    ctypes.byref(item_count),
                    ctypes.cast(buf, ctypes.c_void_p),
                )
                if status != 0:
                    return 0.0

                items = ctypes.cast(buf, ctypes.POINTER(self.ItemStruct))
                engine_totals: dict[str, float] = {}

                for i in range(item_count.value):
                    item = items[i]
                    if item.FmtValue.CStatus != 0:
                        continue
                    name = item.szName
                    if not name:
                        continue
                    name_lower = name.lower()

                    # primary_luid_hex が設定されている場合は、別GPUのカウンターを除外
                    if self.primary_luid_hex and self.primary_luid_hex not in name_lower:
                        continue

                    # engtype_<type> をキーとして抽出
                    eng_type = "unknown"
                    if "engtype_" in name:
                        eng_type = name.split("engtype_")[1]

                    engine_totals[eng_type] = engine_totals.get(eng_type, 0.0) + item.FmtValue.val.doubleValue

                if not engine_totals:
                    return 0.0

                return round(min(100.0, max(engine_totals.values())), 1)
            except Exception:
                return 0.0

        def collect(self) -> tuple:
            if not self._initialized or self._pdh is None:
                return (None, None, self.vram_total_gb, None)
            try:
                self._pdh.PdhCollectQueryData(self._h_query)

                gpu_pct = self._get_engine_max(self._h_gpu)
                vram_bytes = self._get_sum(self._h_vram, self.PDH_FMT_LARGE, is_double=False)

                vram_used_gb = round(vram_bytes / (1024 ** 3), 1)
                vram_pct = round((vram_used_gb / self.vram_total_gb) * 100, 1) if self.vram_total_gb else None

                return (gpu_pct, vram_used_gb, self.vram_total_gb, vram_pct)
            except Exception:
                return (None, None, self.vram_total_gb, None)

        def close(self):
            if self._h_query and self._pdh:
                try:
                    self._pdh.PdhCloseQuery(self._h_query)
                except Exception:
                    pass
else:
    class WindowsGpuMonitor:  # type: ignore
        def __init__(self):
            self.vram_total_gb = 16.0

        def collect(self) -> tuple:
            return (None, None, None, None)

        def close(self):
            pass

# ---------------------------------------------------------------------------
# リソース監視サービス
# ---------------------------------------------------------------------------


class ResourceMonitorService:
    """CPU / RAM / GPU メトリクスを定期収集し、ブロードキャスト関数へ送信するサービス。"""

    _task: asyncio.Task | None = None
    INTERVAL: float = 2.5

    def __init__(self):
        self._win_gpu_monitor: WindowsGpuMonitor | None = None
        self._min_free_gb: float = 6.0  # デフォルト6.0GB
        self._guard_enabled: bool = True
        self._last_vram_safe: bool | None = None
        self._last_vram_free_gb: float | None = None
        self._last_vram_total_gb: float | None = None
        self._broadcast_fn: Callable[[str], Awaitable[None]] | None = None
        if sys.platform == "win32":
            try:
                self._win_gpu_monitor = WindowsGpuMonitor()
            except Exception:
                self._win_gpu_monitor = None

    def _load_settings_from_db(self) -> None:
        """起動時にDB app_settings から vram_min_free_gb / vram_guard_enabled を読み込む。"""
        try:
            from app.database import SessionLocal
            from app.models import AppSetting
            db = SessionLocal()
            try:
                setting_val = db.query(AppSetting).filter(AppSetting.key == "vram_min_free_gb").first()
                if setting_val and setting_val.value is not None:
                    self._min_free_gb = float(setting_val.value)
                guard_val = db.query(AppSetting).filter(AppSetting.key == "vram_guard_enabled").first()
                if guard_val and guard_val.value is not None:
                    self._guard_enabled = guard_val.value.lower() in ("true", "1")
            finally:
                db.close()
        except Exception:
            pass

    def update_threshold(self, min_free_gb: float, enabled: bool = True) -> None:
        """VRAM監視の安全閾値とガード有効フラグを更新する。"""
        self._min_free_gb = float(min_free_gb)
        self._guard_enabled = bool(enabled)

    def get_vram_status(self) -> dict:
        """現在のVRAM状態と閾値設定を返す。"""
        return {
            "vram_min_free_gb": self._min_free_gb,
            "vram_guard_enabled": self._guard_enabled,
            "vram_free_gb": self._last_vram_free_gb,
            "vram_total_gb": self._last_vram_total_gb,
        }

    async def start(self, broadcast_fn: Callable[[str], Awaitable[None]]) -> None:
        """監視タスクを開始する。"""
        self._load_settings_from_db()
        self._broadcast_fn = broadcast_fn
        self._task = asyncio.create_task(self._run(broadcast_fn))

    async def stop(self) -> None:
        """監視タスクをキャンセルする。"""
        if self._task:
            self._task.cancel()
        if self._win_gpu_monitor:
            self._win_gpu_monitor.close()

    async def _run(self, broadcast_fn: Callable[[str], Awaitable[None]]) -> None:
        while True:
            data = await self._collect()
            msg = json.dumps({"type": "SYSTEM_STATS", "data": data})
            await broadcast_fn(msg)

            # VRAM回復検知: _last_vram_safe is False and vram_safe is True
            vram_safe = data.get("vram_safe")
            if self._last_vram_safe is False and vram_safe is True:
                recovered_msg = json.dumps({
                    "type": "VRAM_RECOVERED",
                    "data": {
                        "vram_free_gb": data.get("vram_free_gb"),
                        "vram_min_free_gb": data.get("vram_min_free_gb"),
                        "ts": data.get("ts"),
                    },
                })
                await broadcast_fn(recovered_msg)

            if vram_safe is not None:
                self._last_vram_safe = vram_safe

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

        vram_free_gb: float | None = None
        vram_safe: bool = True
        if vram_total is not None and vram_used is not None:
            vram_free_gb = round(max(0.0, vram_total - vram_used), 2)
            self._last_vram_free_gb = vram_free_gb
            self._last_vram_total_gb = vram_total
            if self._guard_enabled:
                vram_safe = bool(vram_free_gb >= self._min_free_gb)
            else:
                vram_safe = True
        elif vram_total is not None:
            self._last_vram_total_gb = vram_total

        return {
            "cpu_pct": cpu,
            "ram_used_gb": ram_used_gb,
            "ram_total_gb": ram_total_gb,
            "ram_pct": ram_pct,
            "gpu_pct": gpu_pct,
            "vram_used_gb": vram_used,
            "vram_total_gb": vram_total,
            "vram_free_gb": vram_free_gb,
            "vram_safe": vram_safe,
            "vram_min_free_gb": self._min_free_gb,
            "vram_guard_enabled": self._guard_enabled,
            "vram_pct": vram_pct,
            "ts": int(time.time() * 1000),
        }

    async def _get_gpu_stats(self) -> tuple:
        """Windows では WindowsGpuMonitor を、それ以外では rocm-smi から GPU / VRAM 情報を取得する。"""
        if sys.platform == "win32" and self._win_gpu_monitor:
            try:
                return self._win_gpu_monitor.collect()
            except Exception:
                return (None, None, self._win_gpu_monitor.vram_total_gb, None)

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
