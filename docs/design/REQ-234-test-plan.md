# REQ-234 実行可能テスト計画 (Test Plan)

## 1. 自動テスト (CLI Verification)

### 1-1. バックエンド検証 (Backend CLI Verification)
- **依存インストール**:
  ```bash
  pip install -r backend/requirements.txt
  ```
  - **合否判定コマンド**: `pip list | grep -E "respx|pytest-randomly|hypothesis|pytest-repeat"`
  - **期待値**: 4パッケージすべてがバージョン付きで出力されること。

- **ランダム順序実行 & コネクションリーク自動検知**:
  ```bash
  pytest backend/tests/
  ```
  - **合否判定基準**:
    1. 終了コードが `0`（全テスト成功）であること。
    2. 標準出力に `Using --randomly-seed=` が含まれていること（ランダム化の動作証明）。
    3. 標準出力に `DB session/connection leak detected!` が含まれないこと（リークゼロの証明）。
    4. 35個のテストファイルすべてで収集エラー（ERROR collecting）が `0` 件であること。

---

### 1-2. フロントエンド検証 (Frontend CLI Verification)
- **パッケージインストール**:
  ```bash
  npm --prefix frontend install
  ```
  - **合否判定コマンド**: `npm --prefix frontend ls msw fast-check`
  - **期待値**: 終了コード `0` で `msw@2.x` および `fast-check@3.x` がツリーに表示されること。

- **Vitest 隔離モード全件実行**:
  ```bash
  npm --prefix frontend test -- --run
  ```
  - **合否判定基準**:
    1. 終了コードが `0` であること。
    2. 標準出力に `54 passed`（全54テストファイル合格）が出力されること。
    3. `Tests` の合格件数が `570 passed` 以上であり、`failed: 0` であること。

---

## 2. 結合・耐障害性検証 (Integration & Red Teaming Verification)

### 2-1. MSW v2 サーバー稼働・疎通検証
- **検証コマンド**:
  ```bash
  node -e "import('./frontend/src/test/mocks/server.js').then(m => { m.server.listen(); console.log('MSW_SERVER_READY'); m.server.close(); })"
  ```
  または Vitest 上でハンドラ直接検証:
  ```bash
  npm --prefix frontend test -- --run src/components/TagChipEditor/__tests__/TagChipEditor.test.tsx
  ```
  - **合否判定基準**:
    1. 終了コードが `0` で PASS すること。
    2. MSW の `onUnhandledRequest: 'bypass'` により、未登録 API へのリクエストが原因の例外・遮断ログが一切発生しないこと。

### 2-2. Red Teaming (DB コネクションリーク検知の物理実証)
- **検証手順**:
  1. `backend/tests/test_config.py` 末尾に以下の一時的リークテストを追加:
     ```python
     def test_intentional_leak_fail():
         from app.database import SessionLocal
         _ = SessionLocal()  # close しない意図的リーク
     ```
  2. `pytest backend/tests/test_config.py -k test_intentional_leak_fail` を実行。
  3. **期待値**: 終了コードが `1`（失敗）となり、以下のメッセージが確実に出力されること:
     `AssertionError: DB session/connection leak detected!`
  4. 一時テストを即座に削除し、`git checkout backend/tests/test_config.py` で元に戻す。

---

## 3. ツール主導監査 (Tool-Driven Audit)
- **タスクカード自律性監査**:
  ```bash
  python ${GLOBAL_SCRIPTS}\local_model_adapter.py engineer-audit docs/backlog/task/active/REQ-234-T1.md
  python ${GLOBAL_SCRIPTS}\local_model_adapter.py engineer-audit docs/backlog/task/active/REQ-234-T2.md
  python ${GLOBAL_SCRIPTS}\local_model_adapter.py engineer-audit docs/backlog/task/active/REQ-234-T3.md
  ```
- **ガバナンスバリデーション**:
  ```bash
  python ${GLOBAL_SCRIPTS}\workflow_validator.py design-end REQ-234
  python ${GLOBAL_SCRIPTS}\backlog_linter.py
  python ${GLOBAL_SCRIPTS}\artifact_linter.py <implementation_plan_path>
  ```
