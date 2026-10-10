"""Album description persistence contract tests."""

import pytest
import sqlalchemy as sa
from sqlalchemy.orm import sessionmaker

from app import models, schemas
from app.database import Base
from app.routers import albums


@pytest.fixture
def db():
    engine = sa.create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        yield session
    Base.metadata.drop_all(engine)
    engine.dispose()


def test_album_description_schemas_accept_legacy_missing_and_explicit_values():
    assert schemas.AlbumCreate(name="Legacy").description is None
    assert schemas.AlbumCreate(name="Named", description="About it").description == "About it"
    assert schemas.AlbumSummary(
        id=1,
        name="Legacy",
        created_at="2026-10-10T00:00:00",
    ).description is None
    assert schemas.AlbumRead(
        id=1,
        name="Legacy",
        created_at="2026-10-10T00:00:00",
    ).description is None


def test_album_update_distinguishes_omitted_description_from_clear():
    omitted = schemas.AlbumUpdate()
    cleared = schemas.AlbumUpdate(description=None)
    replaced = schemas.AlbumUpdate(description="Updated")

    assert "description" not in omitted.model_fields_set
    assert "description" in cleared.model_fields_set
    assert cleared.description is None
    assert replaced.description == "Updated"


def test_album_description_is_persisted_and_serialized_on_create_get_and_list(db):
    legacy = albums.create_album(schemas.AlbumCreate(name="Legacy"), db)
    created = albums.create_album(
        schemas.AlbumCreate(name="Travel", description="Trip photos"), db
    )
    setting_key = f"album_description:{created.id}"

    assert legacy.description is None
    assert albums.get_album(legacy.id, db).description is None
    assert created.description == "Trip photos"
    assert db.get(models.AppSetting, setting_key).value == "Trip photos"
    assert albums.get_album(created.id, db).description == "Trip photos"
    summaries = albums.list_albums(db)
    assert {item.id: item.description for item in summaries} == {
        legacy.id: None,
        created.id: "Trip photos",
    }


def test_album_description_update_preserves_when_omitted_and_clears_when_explicit(db):
    created = albums.create_album(
        schemas.AlbumCreate(name="Travel", description="Trip photos"), db
    )
    setting_key = f"album_description:{created.id}"

    updated = albums.update_album(created.id, schemas.AlbumUpdate(name="Renamed"), db)
    assert updated.name == "Renamed"
    assert updated.sort_order == created.sort_order
    assert updated.description == "Trip photos"

    cleared = albums.update_album(created.id, schemas.AlbumUpdate(description=None), db)
    assert cleared.description is None
    assert db.get(models.AppSetting, setting_key) is None

    recreated = albums.update_album(created.id, schemas.AlbumUpdate(description="Again"), db)
    empty_cleared = albums.update_album(created.id, schemas.AlbumUpdate(description=""), db)
    assert recreated.description == "Again"
    assert empty_cleared.description is None
    assert db.get(models.AppSetting, setting_key) is None


def test_delete_album_cleans_description_setting(db):
    created = albums.create_album(
        schemas.AlbumCreate(name="Travel", description="Trip photos"), db
    )
    setting_key = f"album_description:{created.id}"

    albums.delete_album(created.id, db)

    assert db.get(models.AppSetting, setting_key) is None
