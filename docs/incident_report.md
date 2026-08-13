# インシデントレポート: REQ-132実装後のバックエンド起動時 PIL インポートエラー

## 概要 (Overview)
REQ-132のWebP化対応において、`backend/app/routers/snapshots.py` および `backend/app/services/snapshot_service.py` 等で `from PIL import Image` が追加されましたが、`backend/requirements.txt` に `Pillow` パッケージが定義されていませんでした。
このため、バックエンド再起動時や依存関係をインストールし直した環境において、`ModuleNotFoundError: No module named 'PIL'` が発生し、バックエンドサーバーの起動に失敗します。

---

## 再現手順 (Reproduction Steps)
1. `backend` ディレクトリにて `requirements.txt` に基づき作成された仮想環境 (`.venv`) を用意する。
2. バックエンドサーバーを起動しようとする（または `python -c "import app.main"` を実行する）。
3. `app/routers/snapshots.py` のインポート処理時に `from PIL import Image` が評価される。
4. `ModuleNotFoundError: No module named 'PIL'` が発生し、バックエンドが起動に失敗する。

---

## 影響範囲 (Affected Area)
- **依存関係設定**:
  - `backend/requirements.txt`: `Pillow` の定義が漏れている。
- **バックエンドソースコード**:
  - `backend/app/routers/snapshots.py` (L8: `from PIL import Image`)
  - `backend/app/services/snapshot_service.py` (L20: `from PIL import Image`)
  - `backend/scripts/migrate_images_to_webp.py` (L7: `from PIL import Image`)
  - `backend/tests/test_migrate_images_to_webp.py` (L4)
  - `backend/tests/test_snapshots_webp.py` (L4)

---

## 原因分類 (Root Cause Classification)
- **分類**: **Type A (実装バグ / Implementation Bug)**
- **理由**: REQ-132の実装時に Python コード上で `Pillow (PIL)` への依存を追加したが、プロジェクトの依存定義ファイルである `backend/requirements.txt` への追記が漏れていたため。

---

## 調査詳細 (Deep Dive Analysis)

### 1. エラーログ（検証結果）
`python -c "import app.main"` 実行時のスタックトレース:
```
Traceback (most recent call last):
  File "<string>", line 1, in <module>
  File "backend/app/main.py", line 15, in <module>
    from app.routers import (
  File "backend/app/routers/snapshots.py", line 8, in <module>
    from PIL import Image
ModuleNotFoundError: No module named 'PIL'
```

### 2. 依存定義ファイルの状態
`backend/requirements.txt`:
```
fastapi>=0.110.0
uvicorn[standard]>=0.29.0
sqlalchemy>=2.0.0
alembic>=1.13.0
pydantic>=2.6.0
pydantic-settings>=2.2.0
httpx>=0.27.0
python-multipart>=0.0.9
python-dotenv>=1.0.0
aiofiles>=23.2.1
opencv-python-headless
numpy
```
（`Pillow` の記載が存在しない）

---

## 次のステップ提案 (Next Action)
本調査結果（Type A 実装バグ）に基づき、`/dev-design` ワークフローへ進み修正設計を行うことを提案します。

- **承認の確認**: 次のステップ（修正設計 `/dev-design`）へ進んでよろしいですか？ (YES / NO)

