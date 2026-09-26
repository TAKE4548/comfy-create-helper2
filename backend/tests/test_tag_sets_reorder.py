import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from app.main import app
from app.database import get_db
from app import models


SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
connection = engine.connect()
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=connection)


def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


@pytest.fixture(autouse=True)
def setup_db():
    models.Base.metadata.create_all(bind=connection)
    app.dependency_overrides[get_db] = override_get_db
    yield
    models.Base.metadata.drop_all(bind=connection)
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    return TestClient(app)


def test_reorder_scoped_to_category_and_no_interference(client):
    """1. category_id 指定時のカテゴリ内並び替えと他カテゴリカードへの非干渉"""
    db = TestingSessionLocal()
    cat1 = models.TagsetCategory(name="Category 1")
    cat2 = models.TagsetCategory(name="Category 2")
    db.add_all([cat1, cat2])
    db.commit()
    db.refresh(cat1)
    db.refresh(cat2)
    cat1_id = cat1.id
    cat2_id = cat2.id

    ts1 = models.TagSet(name="TS1", tags="[]", category_id=cat1_id, sort_order=0)
    ts2 = models.TagSet(name="TS2", tags="[]", category_id=cat1_id, sort_order=1)
    ts3 = models.TagSet(name="TS3", tags="[]", category_id=cat2_id, sort_order=0)
    db.add_all([ts1, ts2, ts3])
    db.commit()
    db.refresh(ts1)
    db.refresh(ts2)
    db.refresh(ts3)
    ts1_id, ts2_id, ts3_id = ts1.id, ts2.id, ts3.id
    db.close()

    res = client.put("/api/tag-sets/reorder", json={
        "category_id": cat1_id,
        "ordered_ids": [ts2_id, ts1_id]
    })
    assert res.status_code == 204

    db = TestingSessionLocal()
    r_ts1 = db.query(models.TagSet).filter(models.TagSet.id == ts1_id).first()
    r_ts2 = db.query(models.TagSet).filter(models.TagSet.id == ts2_id).first()
    r_ts3 = db.query(models.TagSet).filter(models.TagSet.id == ts3_id).first()

    assert r_ts2.sort_order == 0
    assert r_ts2.category_id == cat1_id
    assert r_ts1.sort_order == 1
    assert r_ts1.category_id == cat1_id

    assert r_ts3.sort_order == 0
    assert r_ts3.category_id == cat2_id
    db.close()


def test_reorder_uncategorized_items(client):
    """2. category_id: null 指定による未分類アイテムの並び替え"""
    db = TestingSessionLocal()
    ts1 = models.TagSet(name="Uncat 1", tags="[]", category_id=None, sort_order=0)
    ts2 = models.TagSet(name="Uncat 2", tags="[]", category_id=None, sort_order=1)
    db.add_all([ts1, ts2])
    db.commit()
    db.refresh(ts1)
    db.refresh(ts2)
    ts1_id, ts2_id = ts1.id, ts2.id
    db.close()

    res = client.put("/api/tag-sets/reorder", json={
        "category_id": None,
        "ordered_ids": [ts2_id, ts1_id]
    })
    assert res.status_code == 204

    db = TestingSessionLocal()
    r_ts1 = db.query(models.TagSet).filter(models.TagSet.id == ts1_id).first()
    r_ts2 = db.query(models.TagSet).filter(models.TagSet.id == ts2_id).first()

    assert r_ts2.sort_order == 0
    assert r_ts2.category_id is None
    assert r_ts1.sort_order == 1
    assert r_ts1.category_id is None
    db.close()


def test_reorder_cross_category_move(client):
    """3. 別カテゴリから移動してきたカードの category_id 更新と順序反映"""
    db = TestingSessionLocal()
    cat1 = models.TagsetCategory(name="Category A")
    cat2 = models.TagsetCategory(name="Category B")
    db.add_all([cat1, cat2])
    db.commit()
    db.refresh(cat1)
    db.refresh(cat2)
    cat1_id = cat1.id
    cat2_id = cat2.id

    ts1 = models.TagSet(name="Card 1", tags="[]", category_id=cat1_id, sort_order=0)
    ts2 = models.TagSet(name="Card 2", tags="[]", category_id=cat1_id, sort_order=1)
    ts3 = models.TagSet(name="Card 3", tags="[]", category_id=cat2_id, sort_order=0)
    db.add_all([ts1, ts2, ts3])
    db.commit()
    db.refresh(ts1)
    db.refresh(ts2)
    db.refresh(ts3)
    ts1_id, ts2_id, ts3_id = ts1.id, ts2.id, ts3.id
    db.close()

    res = client.put("/api/tag-sets/reorder", json={
        "category_id": cat1_id,
        "ordered_ids": [ts1_id, ts3_id, ts2_id]
    })
    assert res.status_code == 204

    db = TestingSessionLocal()
    r_ts1 = db.query(models.TagSet).filter(models.TagSet.id == ts1_id).first()
    r_ts2 = db.query(models.TagSet).filter(models.TagSet.id == ts2_id).first()
    r_ts3 = db.query(models.TagSet).filter(models.TagSet.id == ts3_id).first()

    assert r_ts1.sort_order == 0
    assert r_ts1.category_id == cat1_id
    assert r_ts3.sort_order == 1
    assert r_ts3.category_id == cat1_id
    assert r_ts2.sort_order == 2
    assert r_ts2.category_id == cat1_id
    db.close()


def test_reorder_legacy_request_backwards_compatibility(client):
    """4. レガシーリクエスト（category_id なし）の後方互換性"""
    db = TestingSessionLocal()
    cat1 = models.TagsetCategory(name="Category X")
    db.add(cat1)
    db.commit()
    db.refresh(cat1)
    cat1_id = cat1.id

    ts1 = models.TagSet(name="Old 1", tags="[]", category_id=cat1_id, sort_order=0)
    ts2 = models.TagSet(name="Old 2", tags="[]", category_id=None, sort_order=1)
    db.add_all([ts1, ts2])
    db.commit()
    db.refresh(ts1)
    db.refresh(ts2)
    ts1_id, ts2_id = ts1.id, ts2.id
    db.close()

    res = client.put("/api/tag-sets/reorder", json={
        "ordered_ids": [ts2_id, ts1_id]
    })
    assert res.status_code == 204

    db = TestingSessionLocal()
    r_ts1 = db.query(models.TagSet).filter(models.TagSet.id == ts1_id).first()
    r_ts2 = db.query(models.TagSet).filter(models.TagSet.id == ts2_id).first()

    assert r_ts2.sort_order == 0
    assert r_ts1.sort_order == 1

    assert r_ts1.category_id == cat1_id
    assert r_ts2.category_id is None
    db.close()

