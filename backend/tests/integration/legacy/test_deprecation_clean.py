import warnings
import pytest
from app.config import settings
from app import models
from app.database import engine, Base, SessionLocal


def test_zero_deprecation_warnings_on_models_and_config():
    """Verify that importing and instantiating models and config emits zero DeprecationWarnings."""
    with warnings.catch_warnings(record=True) as record:
        warnings.simplefilter("always", DeprecationWarning)
        warnings.simplefilter("always", UserWarning)
        
        # 1. Config verification
        assert settings.database_url is not None
        assert isinstance(settings.cors_origins_list, list)

        # 2. Model column default verification
        now_dt = models.utc_now()
        assert now_dt.tzinfo is not None

        # 3. DB insert/refresh with timezone-aware default
        db = SessionLocal()
        try:
            pt = models.ParamTypeMaster(name="test_clean_dep_widget", widget_type="select")
            db.add(pt)
            db.commit()
            db.refresh(pt)
            assert pt.created_at is not None
            db.delete(pt)
            db.commit()
        finally:
            db.close()

        # Check for any DeprecationWarning or PydanticDeprecatedSince20
        relevant_warnings = [
            w for w in record 
            if issubclass(w.category, DeprecationWarning) or "deprecated" in str(w.message).lower()
        ]
        assert len(relevant_warnings) == 0, f"Detected deprecated warnings: {[str(w.message) for w in relevant_warnings]}"
