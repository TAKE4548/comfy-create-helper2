"""Application settings router."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AppSetting
from app.services.resource_monitor import resource_monitor

router = APIRouter(prefix="/api/settings", tags=["settings"])


class VramSettingsRequest(BaseModel):
    vram_min_free_gb: float
    vram_guard_enabled: bool = True


class VramSettingsResponse(BaseModel):
    vram_min_free_gb: float
    vram_guard_enabled: bool
    vram_free_gb: float | None = None
    vram_total_gb: float | None = None


@router.get("/vram", response_model=VramSettingsResponse)
def get_vram_settings(db: Session = Depends(get_db)):
    """現在のVRAM設定およびステータスを取得する。"""
    status = resource_monitor.get_vram_status()
    # DBに保存されている値があればそれを優先して反映
    setting_min_free = db.query(AppSetting).filter(AppSetting.key == "vram_min_free_gb").first()
    if setting_min_free and setting_min_free.value is not None:
        try:
            status["vram_min_free_gb"] = float(setting_min_free.value)
        except ValueError:
            pass

    setting_guard = db.query(AppSetting).filter(AppSetting.key == "vram_guard_enabled").first()
    if setting_guard and setting_guard.value is not None:
        status["vram_guard_enabled"] = setting_guard.value.lower() in ("true", "1")

    return VramSettingsResponse(**status)


@router.put("/vram", response_model=VramSettingsResponse)
def update_vram_settings(req: VramSettingsRequest, db: Session = Depends(get_db)):
    """VRAM安全閾値およびガード有効フラグを更新し永続化する。"""
    # 永続化: vram_min_free_gb
    min_free_record = db.query(AppSetting).filter(AppSetting.key == "vram_min_free_gb").first()
    if not min_free_record:
        min_free_record = AppSetting(key="vram_min_free_gb", value=str(req.vram_min_free_gb))
        db.add(min_free_record)
    else:
        min_free_record.value = str(req.vram_min_free_gb)

    # 永続化: vram_guard_enabled
    guard_record = db.query(AppSetting).filter(AppSetting.key == "vram_guard_enabled").first()
    if not guard_record:
        guard_record = AppSetting(key="vram_guard_enabled", value=str(req.vram_guard_enabled).lower())
        db.add(guard_record)
    else:
        guard_record.value = str(req.vram_guard_enabled).lower()

    db.commit()

    # resource_monitorへ即座に反映
    resource_monitor.update_threshold(req.vram_min_free_gb, req.vram_guard_enabled)

    status = resource_monitor.get_vram_status()
    status["vram_min_free_gb"] = req.vram_min_free_gb
    status["vram_guard_enabled"] = req.vram_guard_enabled
    return VramSettingsResponse(**status)
