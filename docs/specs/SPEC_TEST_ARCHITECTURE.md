# Prompt Surgeon — テストアーキテクチャ設計仕様書 (SPEC_TEST_ARCHITECTURE)

**バージョン**: 2.3 (正式確定)
**最終更新**: 2026-10-25
**ステータス**: 正式確定 (REQ-394 完了同期)
**対象**: `frontend/src`（テスト・`test/utils`）, `frontend/e2e`, `backend/tests`
**原本**: `tmp/prompt_surgeon_test_architecture.html`（SPEC-TESTING v2.1 / Product x Test Seam Map）

> 関連仕様書: [SPEC_COMMON.md](./SPEC_COMMON.md) / 関連PBI: REQ-356（テストスイート再構成）, REQ-394（テスト実行時間の劣化解消と性能予算）

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
| 統合・ドメイン | 約25% | Gate 2 | Frontend: Vitest（既定 jsdom、DOM 不要の .test.ts は node。§8.3）（Hook+Store+Query結合）/ Backend: pytest + TestClient（SAVEPOINT Rollback）。状態遷移・API通信・DB整合性の網羅検証 | BE並列: 中央値 29.4秒 / FE全体: 中央値 111.7秒 (局所: 3〜15秒) ※計測条件と予算は §8 |
| 単体・ロジック | 約70% | Gate 1 | Frontend: 純粋関数（`seedBatch`, parser）・単一UIパーツ / Backend: 純粋サービス・計算ロジック・Pydantic。モック不要・DB不要 | BE単体: 0.55秒 / FE単体: 3〜5秒 |

※E2E・単体・局所の実績は REQ-356 時点の値で、REQ-394 では再計測していない。Gate 2 全体の実績のみ REQ-394（2026-10-25）の再計測値。

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

pytest 設定は `backend/pytest.ini`（Backend 配下での実行用）とリポジトリ直下の `pytest.ini`（Gate 2 の実行用。§8.4）の 2 つ。`backend/tests/` 直下に設定ファイルは置かない。

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
| Gate 2: 統合テストスイート | FE: `npm test` (または局所 `vitest run src/pages`)<br>BE: `pytest -n auto` (並列) | BE並列: 中央値 29.4秒 (逐次: 80.2秒)<br>FE全体: 中央値 111.7秒 (局所: 3〜15秒)<br>予算は §8.2 | Store・API・DB状態遷移の検証 (SAVEPOINT Rollback) |
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

---

## 8. テスト性能予算と環境選択方針 (REQ-394)

### 8.1 目的と適用範囲

- 本節は Gate 2（フルスイート）の実行時間の上限（性能予算）と、それを支えるテスト実行環境の選択方針を規範として定める。
- 適用対象: リポジトリ直下から実行する `cd frontend; npm test` と `backend\.venv\Scripts\python -m pytest -n auto`（`scripts/run_full_suite.py` が呼ぶコマンド）。Gate 1、Gate 3、局所実行（`vitest run <path>`、`pytest <path>`）は対象外で、§4・§6 の目安に従う。
- 「MUST」は検証者が FAIL と判定する条件、「目安」は参考値で FAIL 条件ではない。

### 8.2 性能予算

| 項目 | 予算 | 区分 |
|---|---|---|
| FE `cd frontend; npm test` の wall | 中央値(3回) ≤ 125秒、最大 ≤ 140秒 | MUST |
| BE `python -m pytest -n auto`（ルート）の wall | 中央値(3回) ≤ 36秒、最大 ≤ 42秒 | MUST |
| ルート `pytest --collect-only` の pytest 内計時 | パス指定 `backend/tests tests` の 1.25 倍以内 | MUST |
| BE 逐次 `python -m pytest` の wall | ≤ 105秒 | 目安 |

- 計測は 3 回連続で行い、中央値と最大で判定する。各計測の前後の CPU 負荷（`Win32_Processor.LoadPercentage`）の平均が 60% を超えた計測は**無効**とし、再計測する。無効な計測を PASS の根拠にしてはならない（MUST NOT）。
- 予算を超過した場合（有効計測で）、検証者は FAIL として報告し設計へ戻す（MUST）。予算を暗黙に緩めてはならない（MUST NOT）。予算の改訂は人間のレビューを経て本節を更新することで行う。
- 収集件数は、PBI が宣言した追加・削除だけで変動してよい。意図しない増減、想定外の skip・xfail・deselect は FAIL とする（MUST）。
- FE の実行時間は Duration 内訳（environment / collect / tests など）とともに記録する（MUST）。環境初期化（environment）の累計が全体を支配するため、内訳なしの wall だけの記録は不十分である。

### 8.3 Frontend の環境選択方針

- 既定の環境は `jsdom`（`frontend/vite.config.ts`）。`.test.tsx`（描画を伴うテスト）は jsdom のままとする（MUST）。
- DOM を使わない `.test.ts` は、ファイル先頭に `// @vitest-environment node` を置いて node 環境で実行する。付与できるのは、`--environment node` で実行して全件 PASS したファイルだけ（MUST）。静的な grep や目視だけで DOM 非依存と判定してはならない（MUST NOT）。`window`/`navigator` のスタブで足りるか、jsdom の実挙動が検証の根拠かを確認し、後者は jsdom に残す。
- 環境切替の機構は docblock とする。`environmentMatchGlobs` によるパス列挙は採用しない（設定ファイルへの集中は将来の vitest 更新で廃止されうる。docblock はテストと同居し、付け忘れは安全側の jsdom に倒れる）。
- 環境カナリア: node 環境（`typeof document === 'undefined'`）と既定 jsdom（`typeof document === 'object'`）を 1 件ずつ検証するテストを常設し、docblock の効きと既定環境の維持を検知する（MUST）。
- 並列度と隔離: pool は `forks`、maxForks は既定、`isolate: true` を `frontend/vite.config.ts` に明示する（MUST）。`isolate: false` は使ってはならない（MUST NOT）。計測で、ファイル間の状態リークにより `No queryFn was passed` が無限に出力されて実行がハングしたため。`vmThreads` / `vmForks` は、msw の `WritableStream` 未定義や `location` 再定義不可で多数のファイルが失敗するため現行構成では採用しない。maxForks の変更（6〜10）や threads への変更は、計測で有意差がなかった（負荷変動に埋もれた）ため行わない。これらを変更する場合は、状態リーク検証と複数回計測をセットにして本節を改訂する。
- 実行時間の長いテストは、実タイマーの待ち（デバウンスなど）を `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })` と `advanceTimersByTimeAsync` に揃えて縮める。アサーションの削除・緩和、テスト件数の増減は行わない（MUST NOT）。

### 8.4 Backend の収集範囲と待ち時間の方針

- リポジトリ直下の `pytest.ini` に `testpaths = backend/tests tests` を宣言する（MUST）。これにより、無引数の収集が `db/`（画像キャッシュ）・`docs/`・`frontend/` を走査しない。`-n auto` は各ワーカーで収集するため、走査コストは全ワーカーに乗る。`backend/pytest.ini`（`testpaths = tests`）は Backend 配下での実行用で、本規定の影響を受けない。
- 固定の待ち時間（サーバーの監視間隔、HTTP サーバの shutdown ポーリング、ディスクキャッシュの閾値となる大量ファイル作成など）は、待ち時間の定数・閾値定数・`poll_interval` 引数だけをテスト内で縮めて、検証内容を変えずに短縮する（MUST）。内部のビジネスロジックを差し替えて短縮してはならない（MUST NOT。§1 と同じ原則）。縮める定数に対して、本番値が変わっていないことを別アサーションで固定する。
- 実行時間削減のために、実検証を Gate 2 から外すマーカー除外（`slow` の既定除外など）を使ってはならない（MUST NOT）。収集件数が変わり、実モデル検証などが Gate 2 から消えるため。

### 8.5 実績（再計測）

| 項目 | 実績 | 予算 |
|---|---|---|
| FE `npm test`（247 ファイル / 2609 テスト） | 中央値 111.7秒、最大 116.4秒（Duration 内訳: environment 789.79秒 / collect 321.20秒 / tests 158.96秒） | 中央値 ≤ 125秒、最大 ≤ 140秒 |
| BE `pytest -n auto`（777 件） | 中央値 29.4秒、最大 31.1秒 | 中央値 ≤ 36秒、最大 ≤ 42秒 |
| BE 逐次 `pytest` | 80.2秒 | ≤ 105秒（目安） |
| ルート `--collect-only` / パス指定 | 1.68秒 / 1.655秒 | パス指定の 1.25 倍以内 |

- 計測日 2026-10-25。環境: Windows 11 Home、CPU 13th Gen Intel(R) Core(TM) i5-13400F、16 論理 / 10 物理コア。有効な各計測の CPU 負荷は 21.5〜54.0%（60% 以下。各計測の前後値の平均で判定）。FE の Duration 内訳（environment / collect / tests）は計測 2 回目（Duration 中央値の回）の値で、3 回の各項目の中央値とも一致する（vitest の内訳は workers 合算値で wall ではない）。値の出典は `docs/logs/REQ-394/final-summary.md`（git 管理外の計測記録）。
- 旧実績（REQ-356 時点の FE ~38秒 / BE並列 ~30秒 / BE逐次 ~89秒）は計測条件が不明で、REQ-394 の再計測でも再現できなかったため、上表の値に置き換えた。
- FE の予算は旧実績の水準に届かない。残る時間の大部分はファイル単位の jsdom 初期化で、これ以上の短縮（happy-dom への切替、projects 分割など）は挙動差のリスクがあり、別 PBI で扱う。
- 検証候補の注: ルート `pytest.ini` を検証候補の identity に含める（`.agents/verification.json` の `root_files`）。
