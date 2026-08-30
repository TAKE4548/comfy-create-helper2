---
id: REQ-213
title: "データベースマイグレーションの堅牢化（Alembic移行またはマイグレーション分離）とモデル定義SSoT化"
status: design
tags: [backend, refactor, database, migrations, sqlalchemy, schema-integrity, degradation-risk]
related_paths:
  - backend/app/main.py
  - backend/app/database.py
  - backend/app/models.py
  - backend/app/migrations/__init__.py
  - backend/app/migrations/runner.py
  - backend/app/migrations/steps.py
  - backend/scripts/migrate_images_to_webp.py
  - backend/tests/test_speech_bubble_presets.py
  - backend/tests/test_migrations.py
---

# REQ-213: データベースマイグレーションの堅牢化（マイグレーション分離・ステップモジュール化）とモデル定義SSoT化

## 1. 背景と目的

現在、Prompt Surgeon バックエンド（FastAPI + SQLAlchemy + SQLite）において以下のアーキテクチャ上の課題・負債が存在している：

1. **エントリーポイント（`main.py`）への生SQLマイグレーションロジックの密結合**:
   - `backend/app/main.py` 内の `run_migrations()` 関数に約180行の生SQL（`ALTER TABLE`、一時テーブル作成、データコピー、外部キー付与、インデックス再作成）がハードコードされている。
   - アプリケーション起動ライフサイクルとスキーマ管理ロジックが混在し、可読性と保守性を著しく低下させている。
2. **二重管理によるスキーマ不整合（デグレリスク）**:
   - `models.py` のモデル定義と `main.py` の `run_migrations()` 内のDDL/ALTER文が二重管理されている。
   - 新規DB作成時（`Base.metadata.create_all`）と既存DBへのマイグレーション適用時で、カラムや制約の定義に差異が生じるリスクを排除できていない。
3. **マイグレーションの追跡性・べき等性テストの不足**:
   - マイグレーションステップがモジュール化されておらず、過去バージョンからのアップグレードや複数回実行時のべき等性が網羅的にテストされていない。

本設計では、`main.py` からマイグレーションロジックを完全に分離し、独立したマイグレーションパッケージ `backend/app/migrations/`（ステップ定義 `steps.py`、ランナー `runner.py`）へモジュール化する。また、新規DBと既存移行DBのスキーマ完全一致を検証するテストを追加し、`models.py` をスキーマの真の Single Source of Truth (SSoT) として確立する。

---

## 2. 影響範囲と変更方針

| ファイル | 変更種別 | 内容 |
|---|---|---|
| `backend/app/migrations/__init__.py` | NEW | `run_migrations` および `MigrationRunner` を公開 |
| `backend/app/migrations/runner.py` | NEW | マイグレーション実行エンジン（ステップ順序制御、ログ出力、トランザクション管理） |
| `backend/app/migrations/steps.py` | NEW | 9つの独立したべき等なマイグレーションステップクラス/関数の定義 |
| `backend/app/main.py` | MODIFY | `run_migrations()` のインライン定義（約180行）を削除し、`from app.migrations import run_migrations` に置換 |
| `backend/scripts/migrate_images_to_webp.py` | MODIFY | `from app.migrations import run_migrations` からのインポートに統一 |
| `backend/tests/test_speech_bubble_presets.py` | MODIFY | `from app.migrations import run_migrations` からのインポートに統一 |
| `backend/tests/test_migrations.py` | NEW | ① 新規DBとマイグレーション適用DBのスキーマ完全一致テスト<br>② べき等性テスト（連続実行の安全性）<br>③ 過去スキーマからのデータ移行・制約更新の整合性テスト |

---

## 3. 詳細設計

### 3-1. マイグレーションモジュール構造 (`backend/app/migrations/`)

```
backend/app/migrations/
├── __init__.py      # run_migrations, MigrationRunner のエクスポート
├── runner.py        # マイグレーションランナー（Engine/Connectionのハンドリングとトランザクション管理）
└── steps.py         # 各テーブル・カラム・制約ごとの独立したマイグレーションステップ定義
```

#### (1) `MigrationStep` と `MigrationRunner` の設計 (`runner.py`)

```python
from typing import Callable, List, Optional
import logging
from sqlalchemy import inspect
from sqlalchemy.engine import Engine, Connection
from app.database import engine as default_engine
from app.migrations.steps import ALL_MIGRATION_STEPS, MigrationStep

logger = logging.getLogger(__name__)

class MigrationRunner:
    """マイグレーションステップを順序制御して実行するランナー"""

    def __init__(self, steps: Optional[List[MigrationStep]] = None):
        self.steps: List[MigrationStep] = steps or list(ALL_MIGRATION_STEPS)

    def register(self, step: MigrationStep) -> None:
        self.steps.append(step)

    def run(self, target_engine: Optional[Engine] = None) -> None:
        """指定された Engine（未指定時はデフォルト DB engine）に対してマイグレーションを実行"""
        eng = target_engine if target_engine is not None else default_engine
        with eng.begin() as conn:
            inspector = inspect(conn)
            for step in self.steps:
                try:
                    step.apply(conn, inspector)
                except Exception as e:
                    logger.error(f"Migration step failed [{step.step_id} - {step.name}]: {e}")
                    raise

def run_migrations(target_engine: Optional[Engine] = None) -> None:
    """FastAPI の lifespan やスクリプト、テストから呼び出されるマイグレーション実行エントリーポイント"""
    runner = MigrationRunner()
    runner.run(target_engine=target_engine)
```

#### (2) マイグレーションステップのモジュール化 (`steps.py`)

以下の各ステップを `steps.py` 内に定義し、`ALL_MIGRATION_STEPS` として登録する：

1. **Step 001 (`workflows_columns`)**:
   - `workflows.default_applied_assets` (TEXT) 追加
   - `workflows.target_base_model_id` (INTEGER, FK `base_models.id`) 追加
2. **Step 002 (`snapshot_loras_and_tag_sets_roles`)**:
   - `snapshot_loras.role` (VARCHAR NOT NULL DEFAULT 'positive') 追加
   - `snapshot_loras` のユニーク制約更新 (`snapshot_id, lora_id, role`)
   - `snapshot_tag_sets.role` (VARCHAR NOT NULL DEFAULT 'positive') 追加
   - `snapshot_tag_sets` のユニーク制約更新 (`snapshot_id, tag_set_id, role`)
3. **Step 003 (`snapshots_source_and_thumbnail`)**:
   - `snapshots.source_snapshot_id` (INTEGER, FK `snapshots.id`) 追加
   - `snapshots.thumbnail_path` (TEXT) 追加
4. **Step 004 (`tag_sets_thumbnail_and_sort_order`)**:
   - `tag_sets.thumbnail_path` (TEXT) 追加
   - `tag_sets.sort_order` (INTEGER DEFAULT 0) 追加および初期採番
5. **Step 005 (`master_tables_sort_order`)**:
   - `mapping_master.sort_order` 追加・初期採番
   - `loras.sort_order` 追加・初期採番
   - `lora_categories.sort_order` 追加・初期採番
   - `tagset_categories.sort_order` 追加・初期採番
   - `albums.sort_order` 追加・初期採番
6. **Step 006 (`create_param_type_masters`)**:
   - `param_type_masters` テーブル作成
7. **Step 007 (`speech_bubble_presets_and_constraints`)**:
   - `speech_bubble_presets` テーブル作成（存在しない場合）
   - `effects_json` (TEXT DEFAULT '{}'), `text` (TEXT DEFAULT NULL) カラム追加
   - ユニーク制約移行 (`name` 単体 → `name, orientation` 複合ユニーク)
8. **Step 008 (`create_speech_tone_presets`)**:
   - `speech_tone_presets` テーブル作成
9. **Step 009 (`workflow_presets_updated_at`)**:
   - `workflow_presets.updated_at` カラム追加および `created_at` からのバックフィル

---

### 3-2. `main.py` のクリーンアップ

`main.py` の `lifespan` 起動処理は以下のように簡潔化される：

```python
# backend/app/main.py
from app.migrations import run_migrations

@asynccontextmanager
async def lifespan(app: FastAPI):
    models.Base.metadata.create_all(bind=engine)
    try:
        run_migrations()
    except Exception as e:
        logger.error(f"Failed to run migration: {e}")
    db = SessionLocal()
    try:
        seed_initial_data(db)
    finally:
        db.close()
    logger.info("Prompt Surgeon API started.")
    yield
    try:
        await comfy.close_comfy_client()
    except Exception as e:
        logger.error(f"Failed to close Comfy client: {e}")
    logger.info("Prompt Surgeon API shutting down.")
```

---

## 4. トレードオフ・リスク開示 (Trade-offs & Constraints)

1. **Alembic完全導入 vs 専用マイグレーションランナー**:
   - *トレードオフ*: Alembic CLIツールを用いた高度なブランチ・ダウングレード機能ではなく、デスクトップアプリ/ローカル環境に最適な軽量Pythonマイグレーションランナーを採用する。
   - *理由*: Prompt Surgeon はエンドユーザーがローカル実行するデスクトップツールであり、アプリ起動時に `lifespan` 内で同期的に安全にSQLiteスキーマを更新する要件がある。外部CLIバイナリや複雑なパス解決設定（`alembic.ini`）を必要とせず、完全なテストカバレッジを持つ専用モジュールの方が実行信頼性が高い。
2. **SQLiteのテーブル再作成（Table Copy Pattern）**:
   - SQLiteは一部の `ALTER TABLE`（ユニーク制約の変更等）を直接サポートしないため、一時テーブル作成・データコピー・リネームの手法を用いる。
   - *リスク緩和*: トランザクション（`with eng.begin()`）内で実行し、エラー時はロールバックされることを保証する。

---

## 5. 検証方針 (Acceptance Criteria Mapping)

- **AC-1**: `backend/app/main.py` から生SQLマイグレーションロジック（約180行）が排除され、`run_migrations` が `app/migrations/` からインポートされていること。
- **AC-2**: 各マイグレーションステップが独立して管理され、複数回連続実行してもエラーなく同一の状態を維持する（べき等性）こと。
- **AC-3**: `test_migrations.py` において、`Base.metadata.create_all` で生成されたクリーンなDBと、過去バージョンからマイグレーションされたDBのスキーマ一致性が検証されること。
- **AC-4**: 既存の全バックエンドテスト（`pytest` 208件以上）がすべてパスすること。
