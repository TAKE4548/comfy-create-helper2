# Prompt Surgeon — テストアーキテクチャ設計仕様書 (SPEC_TEST_ARCHITECTURE)

**バージョン**: 2.2 (正式確定)
**最終更新**: 2026-10-14
**ステータス**: 正式確定 (REQ-356 完了同期)
**対象**: `frontend/src`（テスト・`test/utils`）, `frontend/e2e`, `backend/tests`
**原本**: `tmp/prompt_surgeon_test_architecture.html`（SPEC-TESTING v2.1 / Product x Test Seam Map）

> 関連仕様書: [SPEC_COMMON.md](./SPEC_COMMON.md) / 関連PBI: REQ-356（テストスイート再構成）

---

## 1. 概要

製品側の実アーキテクチャ（React / FastAPI / SQLite / ComfyUI / LM Studio）と、テスト側の境界（Seam）を対応付け、「どこを本物で動かし、どこで切断・モック化するか」を定義する。
標準的な Test Boundaries / Seams（Hexagonal Architecture、Martin Fowler の Subcutaneous Test）の考え方に基づく。

**設計原則**:
- ビジネスロジックの中核は **100% 本物のコード** を動かす。
  - Frontend: UIコンポーネント → カスタムフック → Zustand → React Query
  - Backend: FastAPIルーター → サービス層 → SQLAlchemy ORM
- モックを挟むのは、速度低下・非決定性（副作用・漏洩）を生む **ネットワークI/O（fetch / WebSocket / httpx）・ディスク物理書き込み・DB永続化トランザクション** の境界のみ。
- エージェントによる内部関数の独断パッチを禁止し、所定の境界（`conftest.py` / `test/utils`）のみを使う。

---

## 2. 製品アーキテクチャ x テスト境界マップ (Seam Map)

| # | 製品レイヤー | 本番コンポーネント | テスト境界 | 実行ゲート |
|---|---|---|---|---|
| 1 | クライアントUI (React 18 / DOM / CSS) | `GeneratePage`, `DesktopLayout`, `MobileLayout`, `TagChipEditor`, `ActionBar`, `SettingsPage`, `position: sticky`, `scrollTop`, `dnd-kit` | **境界A**: 純粋UIパーツ(Unit)はモックゼロで検証 / **境界B**: 物理レイアウト（sticky・実スクロール・D&D）は Playwright のみ。jsdom の擬似スクロールテストは禁止（偽陽性防止） | Gate 1 / Gate 3 |
| 2 | クライアント状態・通信 (Zustand / Query / WebSocket) | `useGenerationStore`, `persistClient`(IndexedDB), `systemWsService`, `api/client.ts` | **境界C**: Zustand は `resetTestStore(..., true)` で完全置換初期化 / **境界D**: React Query は `gcTime: 0` の短命Clientでキャッシュ隔離 / **境界E**: WebSocket は `MockWebSocketController` で決定論的制御 / **境界F**: `api/client.ts` で実通信を100%遮断 | Gate 2 (FE) |
| 3 | サーバーアプリケーション (FastAPI) | Routers (`workflows.py`, `snapshots.py`, `presets.py`), Services (`SnapshotService`, `MappingService`), Pydantic v2 | **境界G**: `TestClient(app)` で直接呼び出し（Uvicorn起動不要）。Router・Service・Pydanticバリデーションは本物を実行。サービス関数の内部モンキーパッチ禁止（I/O境界のみ遮断） | Gate 2 (BE) |
| 4 | インフラ・外部データ (SQLite / Disk / ComfyUI / LM Studio) | `db/prompt_surgeon.db`, `db/snapshots/*.png`, ComfyUI(:8188), LM Studio(:1234) | **境界H (DB)**: `sqlite:///:memory:` + SAVEPOINT Commit Interceptor で全テスト後ロールバック / **境界I (Disk)**: `pytest tmp_path` でテスト毎に隔離・消去 / **境界J (External)**: `respx` で `httpx` トランスポート層を遮断 | Gate 2 (BE) |

メリット: リファクタリング耐性（モック境界がI/Oなので内部関数分割でテストが壊れない）、AIエージェントの暴走防止、二重テスト・漏れの撲滅。

---

## 3. 多層防護（Defense-in-Depth）モック＆データ分離

| 層 | 対象 | 内容 |
|---|---|---|
| Backend 第1層 | SAVEPOINT + Commit Interceptor（SQLAlchemy / StaticPool） | セッション開始時にテーブル作成を1回のみ実行。サービス層で `db.commit()` が呼ばれても外側のトランザクションは確定させず、新しいSAVEPOINTを自動再作成。テスト終了時に完全ロールバック |
| Backend 第2層 | 外部HTTPトランスポート遮断（respx） | ComfyUI(:8188) / LM Studio(:1234) への通信を `httpx` トランスポート層で遮断。未定義通信は即例外化 |
| Backend 第3層 | ファイルシステムサンドボックス（`tmp_path`） | `settings.snapshot_dir` をテスト固有の一時フォルダへ差し替え。本番 `db/snapshots/` への書き込みをゼロにする |
| Frontend | 5層ステート完全分離（Zustand / Query / WebSocket / idb） | Zustand `setState(..., true)` 完全置換、React Query `gcTime: 0`、`fake-indexeddb` 破棄、`MockWebSocketController` によるイベント完全制御、`networkGuard` による実通信遮断 |

---

## 4. テストピラミッド

| 階層 | 比率目安 | ゲート | 内容 | 実行時間 (実績) |
|---|---|---|---|---|
| E2E / 実ブラウザ | 約5% | Gate 3 | Playwright (Headless)。sticky追従・実スクロール・dnd-kit 物理D&D。主要導線に厳選。Desktop/Mobile両対応 | ~1.2秒 (2 tests) |
| 統合・ドメイン | 約25% | Gate 2 | Frontend: Vitest + jsdom（Hook+Store+Query結合）/ Backend: pytest + TestClient（SAVEPOINT Rollback）。状態遷移・API通信・DB整合性の網羅検証 | BE並列: ~30秒 / FE全体: ~38秒 (局所: 3〜15秒) |
| 単体・ロジック | 約70% | Gate 1 | Frontend: 純粋関数（`seedBatch`, parser）・単一UIパーツ / Backend: 純粋サービス・計算ロジック・Pydantic。モック不要・DB不要 | BE単体: 0.55秒 / FE単体: 3〜5秒 |

---

## 5. ディレクトリ配置規約 (As-Built / 確定)

PBI番号入りのフラットなファイル名（例: `e2e_req347_*.test.tsx`, `test_req334_*.py`）を廃止し、責務と実行コストで階層化・コロケーションする（AC-1, AC-2, AC-3 準拠）。

### 5.1 Frontend

```
frontend/src/
  utils/**/__tests__/                # 【Unit / Gate 1】純粋関数・計算ロジック（モックゼロ）
    seedBatch.test.ts, mappingStageGroups.test.ts 等
  components/**/__tests__/           # 【Unit / Gate 1】単一UIパーツ（PropsとDOMイベントのみ）
    TagChip.test.tsx, LlmSettingsSection.test.tsx 等
  hooks/**/__tests__/                # 【Unit / Gate 1】純粋カスタムフック
  pages/**/__tests__/                # 【Integration / Gate 2】画面・状態統合（Store + QueryClient結合）
    GeneratePage.test.tsx, SettingsPage.test.tsx 等
  test/utils/                        # 【共通ヘルパー】
    storeHelpers.ts                  # resetTestStore(overrides, true)
    queryHelpers.ts                  # createTestQueryClient() (gcTime: 0)
    wsHelpers.ts                     # MockWebSocketController
    networkGuard.ts                  # 実fetch/WebSocket検出・遮断ガード
frontend/e2e/                        # 【Gate 3: E2E Playwright】実ブラウザのみ
  stickyHeader.spec.ts               # sticky追従・実スクロール (Desktop & Mobile)
```

### 5.2 Backend

```
backend/tests/
  conftest.py                        # 【基盤】DB (SAVEPOINT) / Client / respx / tmp_path Fixtures
  pytest.ini                         # pytest 設定 (markers, default asyncio mode)
  unit/                              # 【Unit / Gate 1】DB非接続・純粋ロジック (0.55秒)
    test_schemas.py, test_config.py, test_helpers.py
  integration/                       # 【Integration / Gate 2】DB (SAVEPOINT Rollback) / API
    api/                             # ルーター別HTTPエントリー（TestClient経由）
      test_workflows.py, test_snapshots.py, test_presets.py
    services/                        # サービスクラスとDBの結合
      test_snapshot_service.py, test_mapping_service.py
    models/                          # ORMリレーション・マイグレーション整合性
      test_model_relations.py, test_migrations.py
    legacy/                          # 移行済みレガシーテスト（随時リファクタ対象）
  governance/                        # 【メタ検証 / Gate 1-2】CI・リポジトリ規約
    test_openapi_contract.py         # OpenAPI スキーマ一致検証
    test_vram_guard.py               # VRAM ガード・GPU 排他制御
    test_no_req_naming.py            # テストファイル名規約検証 (AC-1/AC-2)
```

### 5.3 PBIトレーサビリティ規約 & 検証スクリプト

- **命名フォーマット**: テストケース名（`it("...", ...)` / `def test_*(...):`）に `[REQ-xxx/AC-n]` の形式でPBI番号と受入基準番号をプレフィックスとして付与する。ファイル名からPBI番号を外しても、`grep -rn "REQ-350" tests/` で該当テストを逆引き可能。
- **ファイル名規約**: テストファイル名・ディレクトリパスへの `req\d+` や `REQ-\d+` の含入は厳禁（AC-1/AC-2）。
- **検証スクリプト**: `scripts/verify_test_naming.py`
  - 新規PRやCIチェックにて `python scripts/verify_test_naming.py --strict` を実行することで、規約違反（PBI番号不正・チケット名ファイル）を0件として厳格ゲートする。
  - PBI番号に紐づかない汎用・ガバナンステストは「PBI紐づけなし」として集計・通過可能（ガバナンスパラドックス防止、AC-15準拠）。

---

## 6. 実行ゲート（エージェント開発用 3段階）

| ゲート | コマンド（推奨） | 実績実行時間 | 目的 |
|---|---|---|---|
| Gate 1: 静的検証 + 単体 | `npm run typecheck && mypy backend && pytest backend/tests/unit` | ~4.5秒 (FE型: 3.5s, BE型: 0.4s, BE単体: 0.55s) | 型エラー・純粋ロジックの即時検出 |
| Gate 2: 統合テストスイート | FE: `npm test` (または局所 `vitest run src/pages`)<br>BE: `pytest -n auto` (並列) | BE並列: ~30秒 (逐次: ~89秒)<br>FE全体: ~38秒 (局所: 3〜15秒) | Store・API・DB状態遷移の検証 (SAVEPOINT Rollback) |
| Gate 3: 最小限ブラウザE2E | `npx playwright test` | ~1.2秒 (Headless 2 workers) | 物理スクロール・sticky追従・実ブラウザ描画の検証 (Desktop/Mobile) |

局所実行の例:
- Backend 単体: `pytest backend/tests/unit`
- Backend API統合: `pytest backend/tests/integration/api/test_workflows.py`
- Frontend 単体: `vitest run src/utils src/components/**/__tests__`
- Frontend 画面統合: `vitest run src/pages/GeneratePage`

---

## 7. 実装基盤: `backend/tests/conftest.py`（SAVEPOINT + Commit Interceptor）

```python
import os
import sys
import pytest
import respx
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

# Ensure backend root is on sys.path for robust imports across all test runners
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import settings
from app.database import Base, engine
from app.main import app
from app import models  # Register all models with Base.metadata


@pytest.fixture(scope="session")
def db_engine():
    """In-memory SQLite engine with all metadata tables pre-created."""
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=eng)
    yield eng
    Base.metadata.drop_all(bind=eng)
    eng.dispose()


@pytest.fixture
def db_session(db_engine):
    """Isolated DB session wrapped in a SAVEPOINT with automatic commit interceptor."""
    connection = db_engine.connect()
    transaction = connection.begin()
    nested = connection.begin_nested()
    session = Session(bind=connection)

    @event.listens_for(session, "after_transaction_end")
    def restart_savepoint(sess, trans):
        nonlocal nested
        if trans.nested and not trans._parent.nested:
            nested = connection.begin_nested()

    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture(autouse=True)
def isolated_snapshot_dir(tmp_path, monkeypatch):
    """Isolate snapshot storage to a temporary directory to prevent writing to production db/snapshots."""
    test_snapshot_dir = tmp_path / "snapshots"
    test_snapshot_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(settings, "snapshot_dir", str(test_snapshot_dir))
    return test_snapshot_dir


@pytest.fixture(autouse=True)
def mock_external_services():
    """Intercept and block all unauthorized external HTTP calls (ComfyUI :8188, LM Studio :1234, etc.)."""
    with respx.mock(assert_all_called=False) as respx_router:
        yield respx_router


@pytest.fixture(autouse=True)
def clean_dependency_overrides():
    """Ensure FastAPI dependency overrides are always cleaned up after each test."""
    yield
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def verify_db_pool_clean():
    """Ensure no SQLAlchemy connection leak exists after each test execution."""
    yield
    assert engine.pool.checkedout() == 0, (
        f"DB session/connection leak detected! Checked out connections: {engine.pool.checkedout()}"
    )
```