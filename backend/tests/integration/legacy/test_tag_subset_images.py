"""Tag subset thumbnail persistence through create, replacement, and read APIs."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import get_db
from app.models import Base
from app.routers.tag_sets import router


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app = FastAPI()
    app.include_router(router)

    def override_get_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    engine.dispose()


def test_subset_thumbnails_round_trip_create_replace_and_list(client: TestClient) -> None:
    create_response = client.post(
        "/api/tag-sets",
        json={
            "name": "Parent set",
            "tags": ["parent-tag"],
            "thumbnail_path": "parent-cover.png",
            "subsets": [
                {"name": "Warm", "tags": ["amber", "gold"], "thumbnail_path": "warm.png"},
                {"name": "Cool", "tags": ["blue"], "thumbnail_path": "cool.png"},
            ],
        },
    )
    assert create_response.status_code == 201
    created = create_response.json()
    tag_set_id = created["id"]
    assert created["thumbnail_path"] == "parent-cover.png"
    assert created["tags"] == ["parent-tag"]
    assert [(item["name"], item["tags"], item["thumbnail_path"]) for item in created["subsets"]] == [
        ("Warm", ["amber", "gold"], "warm.png"),
        ("Cool", ["blue"], "cool.png"),
    ]

    listed = client.get("/api/tag-sets").json()
    assert listed[0]["subsets"] == created["subsets"]

    replace_response = client.put(
        f"/api/tag-sets/{tag_set_id}",
        json={
            "name": "Parent set renamed",
            "tags": ["parent-tag-updated"],
            "thumbnail_path": "parent-cover.png",
            "subsets": [
                {"name": "Warm", "tags": ["amber", "copper"], "thumbnail_path": None},
                {"name": "Cool", "tags": ["blue", "cyan"], "thumbnail_path": ""},
            ],
        },
    )
    assert replace_response.status_code == 200
    replaced = replace_response.json()
    assert replaced["thumbnail_path"] == "parent-cover.png"
    assert replaced["name"] == "Parent set renamed"
    assert replaced["tags"] == ["parent-tag-updated"]
    assert [(item["name"], item["tags"], item["thumbnail_path"]) for item in replaced["subsets"]] == [
        ("Warm", ["amber", "copper"], None),
        ("Cool", ["blue", "cyan"], None),
    ]

    omit_response = client.put(
        f"/api/tag-sets/{tag_set_id}",
        json={
            "name": "Parent set renamed",
            "tags": ["parent-tag-updated"],
            "thumbnail_path": "parent-cover.png",
            "subsets": [
                {"name": "Warm", "tags": ["amber", "copper"]},
                {"name": "Cool", "tags": ["blue", "cyan"], "thumbnail_path": "cool-new.png"},
            ],
        },
    )
    assert omit_response.status_code == 200
    assert [(item["name"], item["tags"], item["thumbnail_path"]) for item in omit_response.json()["subsets"]] == [
        ("Warm", ["amber", "copper"], None),
        ("Cool", ["blue", "cyan"], "cool-new.png"),
    ]

    revisited = client.get("/api/tag-sets").json()[0]
    assert revisited["thumbnail_path"] == "parent-cover.png"
    assert [(item["name"], item["tags"], item["thumbnail_path"]) for item in revisited["subsets"]] == [
        ("Warm", ["amber", "copper"], None),
        ("Cool", ["blue", "cyan"], "cool-new.png"),
    ]
