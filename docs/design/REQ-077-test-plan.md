# REQ-077 テスト計画書

## 1. テスト方針
リファクタリング（Pydantic スキーマ定義のファイル分割・リネーム）によるデグレを防ぐため、以下の手順で検証を実施する。
特に、リファクタリング前にスキーマのバリデーションロジックや `from_attributes` の動作を単体検証するテストを `backend/tests/test_schemas.py` として新規に拡充し、デグレを確実に検知できるようにする。

## 2. 実施手順
1. **リファクタリング前**:
   - 新規テストファイル `backend/tests/test_schemas.py` を作成し、主要なスキーマ（`Snapshot`, `Album`, `Lora`, `TagSet` 等）のバリデーションや `from_attributes` パースのテストを記述する。
   - 既存のテストおよび新規追加テストを実行し、すべて PASS することを確認する。
2. **リファクタリング実施**:
   - `schemas/snapshot.py` から `album.py` への分割、および `tagset.py` から `tag_set.py` へのリネームを行う。
   - `__init__.py` 等の公開インポートを修正する。
3. **リファクタリング後**:
   - テストスイートを再実行し、デグレが発生していないか検証する。

---

## 3. テスト仕様 (新規テスト: `test_schemas.py`)

### 3.1. 検証対象モデル
- **Snapshot関連**: `SnapshotCreate`, `SnapshotRead`, `SnapshotLoraCreate`, `SnapshotTagSetCreate`
- **Album関連**: `AlbumCreate`, `AlbumRead`, `AlbumItemRead`
- **Lora関連**: `LoraCreate`, `LoraRead`
- **TagSet関連**: `TagSetCreate`, `TagSetRead`

### 3.2. テストケース定義
- **正常系バリデーション**:
  - 正当なパラメータを辞書形式で渡し、正常にスキーマモデルが初期化できること。
- **異常系バリデーション (ValidationError)**:
  - 必須フィールドが欠落している場合、または無効な型（例: 数値フィールドに不正文字列）を渡した際に `ValidationError` が発生すること。
- **`from_attributes` (ORMオブジェクトからのパース)**:
  - モッククラスまたはダミーオブジェクト（SQLAlchemy モデルの代わりに属性アクセスを提供するオブジェクト）を作成し、`model.model_validate(dummy_obj)` が正しく動作すること。
- **インポート整合性の確認**:
  - `from app.schemas import ...` 経由ですべてのモデルが正しくインポートできること。

---

## 4. 検証コマンド
バックエンドのルートディレクトリ（`backend/`）にて以下のコマンドを実行する。

```bash
# テストの実行
.venv\Scripts\python -m pytest
```
