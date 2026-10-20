# REQ-386 実行可能テスト計画

## 1. 自動テスト Baseline 検証 (AC-1, AC-2, AC-3 Baseline)

本節は AC-1（進捗同期）、AC-2（プレビュー即時表示）、AC-3（完了時表示）を支える Baseline 検証を定義する。

### Gate 1: 静的型チェック (Typecheck Baseline)
- **バックエンド型チェック**:
  - コマンド: `mypy backend`
  - 期待値: 型エラー 0 件 (Exit code 0)
- **フロントエンド型チェック**:
  - コマンド: `npm run typecheck`
  - 期待値: 型エラー 0 件 (Exit code 0)

### Gate 2: ユニット＆結合テスト (Unit / Full Suite Baseline)
- **バックエンドテスト**:
  - コマンド: `pytest backend/tests/integration/legacy/test_generation_service.py`
  - 期待値: 全テスト PASS (Exit code 0)
- **フロントエンドテスト**:
  - コマンド: `npm test -- src/store/__tests__/slices/connectionSlice.test.ts src/pages/GeneratePage/components/__tests__/GenerationProgress.test.tsx --run`
  - 検証内容:
    - AC-1: WebSocket進捗イベントのUI伝播および個別プログレスバー更新
    - AC-2: バッチ生成時の1枚目完了プレビュー即時表示および自動追従
    - AC-3: 単体および複数生成完了時の100%表示と最新画像プレビュー整合
  - 期待値: 全テスト PASS (Exit code 0)

---

## 2. 結合・単体検証 (Integration & Unit Verification)

### テスト配置計画 (Test Placement Plan) [MUST [W-DD-PLACE]]
- 既存コロケーションテストを拡張し、新規のチケットID冠ファイル（`*req*`, `*pbi*`）の新設を禁止する。
  1. `backend/tests/integration/legacy/test_generation_service.py` (バックエンド progress バインド・型正規化)
  2. `frontend/src/store/__tests__/slices/connectionSlice.test.ts` (フロントエンド自動追従・プレビュー即時解除)
  3. `frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateDisplayState.test.tsx` (モーダル自動追従URL消費制御)
  4. `frontend/src/pages/GeneratePage/components/__tests__/GenerationProgress.test.tsx` (デスクトップ・モバイル進捗表示および即時プレビュー)

### ケース名タグ定義
- **[REQ-386/AC-1]**:
  - `test_generation_service.py`: `test_progress_event_without_prompt_id_binds_to_single_active_job`
    - 検証コマンド: `pytest backend/tests/integration/legacy/test_generation_service.py -k "REQ-386 and AC-1"`
  - `test_generation_service.py`: `test_progress_event_with_integer_node_id_updates_node_progress`
    - 検証コマンド: `pytest backend/tests/integration/legacy/test_generation_service.py -k "REQ-386 and AC-1"`
  - `GenerationProgress.test.tsx`: `it('[REQ-386/AC-1] displays individual node progress percentage and name with store fallback when managed job lacks node', () => { ... })`
    - 検証コマンド: `npm test -- src/pages/GeneratePage/components/__tests__/GenerationProgress.test.tsx -t "REQ-386/AC-1" --run`
- **[REQ-386/AC-2]**:
  - `connectionSlice.test.ts`: `it('[REQ-386/AC-2] clears obsolete previewImage immediately upon autoFollowImage transition even if next job has no preview frame', () => { ... })`
    - 検証コマンド: `npm test -- src/store/__tests__/slices/connectionSlice.test.ts -t "REQ-386/AC-2" --run`
  - `useGenerateDisplayState.test.tsx`: `it('[REQ-386/AC-2] preserves pendingAutoFollowUrl until image is confirmed in sortedDisplayImages', () => { ... })`
    - 検証コマンド: `npm test -- src/pages/GeneratePage/hooks/__tests__/useGenerateDisplayState.test.tsx -t "REQ-386/AC-2" --run`
  - `GenerationProgress.test.tsx`: `it('[REQ-386/AC-2] immediately renders newly completed auto-follow image in desktop preview without waiting for next batch job', () => { ... })`
    - 検証コマンド: `npm test -- src/pages/GeneratePage/components/__tests__/GenerationProgress.test.tsx -t "REQ-386/AC-2" --run`
- **[REQ-386/AC-3]**:
  - `GenerationProgress.test.tsx`: `it('[REQ-386/AC-3] displays 100 percent completion and latest image preview upon batch completion', () => { ... })`
    - 検証コマンド: `npm test -- src/pages/GeneratePage/components/__tests__/GenerationProgress.test.tsx -t "REQ-386/AC-3" --run`

### Seam Map 結合検証方針
- **結合対象 (Real Code)**: `GenerationService`, `connectionSlice`, `DesktopLayout`, `MobileLayout`
- **切断対象 (Severed)**: ComfyUI HTTP/WS API, ブラウザ WebSocket
- **モックレベル**: `FakeBridge`（HTTPモック）、`ws.message` / `applyGenerationSnapshot`（ステート注入）によるトランスポート層での切断。内部ヘルパーの monkey-patch は禁止。

### 結合テストシナリオ
1. **シナリオ 1 (AC-1 サンプリング進捗のリアルタイム同期)**:
   - バックエンドにジョブを投入し `running` 状態とする。
   - ComfyUIから `prompt_id` が省略された `{"type": "progress", "data": {"value": 5, "max": 20}}` イベントを送信する。
   - バックエンドが単一の実行中ジョブを特定し、`node.value = 5.0, node.max = 20.0` に更新されたスナップショットを WebSocket へ配信すること。
   - フロントエンドがスナップショットを受信し、個別プログレスバーが `25%` と即時表示されることを検証する。
2. **シナリオ 2 (AC-2 バッチ生成時の1枚目即時プレビュー表示)**:
   - 2枚バッチジョブ（Job 1, Job 2）を実行中とする。
   - Job 1 が完了（`succeeded`）し、Job 2 が `running`（`preview_url: null`）に遷移したスナップショットを配信する。
   - フロントエンドの `previewImage` が即座に null となり、Job 1 の生成完了原画（`selectedImg`）が 1 秒以内（即時）にメインプレビューへ表示（auto-follow）されることを検証する。
3. **シナリオ 3 (AC-3 単体・複数ジョブ完了時の100%維持および最新画像プレビュー)**:
   - 単体生成（1ジョブ）または複数バッチ生成の双方が `succeeded` に遷移したスナップショットを受信した際、全体プログレスおよび個別プログレスが 100% 完了状態となり、最新画像が選択・プレビュー表示された状態が保たれることを検証する。

---

## 3. Red Teaming (境界値・異常系シナリオ, AC-1, AC-2, AC-3) [Gate 3 Baseline]

本節は各受入基準（AC-1, AC-2, AC-3）に対する境界値・異常系耐性を検証する。

### 境界値テスト 1 (異常進捗値・ゼロ除算ガード, AC-1)
- **対象ファイル**: `backend/tests/integration/legacy/test_generation_service.py`
- **ケース名**: `test_progress_event_boundary_zero_division_and_clamp`
- **検証コマンド**: `pytest backend/tests/integration/legacy/test_generation_service.py -k "REQ-386 and AC-1"`
- **手順**: `data = {"value": 0, "max": 0}` や `data = {"value": 25, "max": 20}` の進捗イベントを注入する。
- **期待結果**: ゼロ除算例外（ZeroDivisionError / NaN%）を防止し、進捗値を 0%〜100% に安全に clamp すること。

### 異常系テスト 2 (複数ジョブ実行中の prompt_id 欠落イベント, AC-1)
- **対象ファイル**: `backend/tests/integration/legacy/test_generation_service.py`
- **ケース名**: `test_progress_event_multiple_jobs_without_prompt_id_dropped`
- **検証コマンド**: `pytest backend/tests/integration/legacy/test_generation_service.py -k "REQ-386 and AC-1"`
- **手順**: 複数の実行中ジョブが存在する異常状況で `prompt_id` のない `progress` イベントを注入する。
- **期待結果**: 不確定なジョブへの誤バインドを行わず、安全にイベントを破棄または待機すること。

### 異常系テスト 3 (画像生成完了時の空 outputs リカバリ, AC-2)
- **対象ファイル**: `frontend/src/store/__tests__/slices/connectionSlice.test.ts`
- **ケース名**: `it('[REQ-386/AC-2] safely skips autoFollowImage when outputs array is empty upon completion')`
- **検証コマンド**: `npm test -- src/store/__tests__/slices/connectionSlice.test.ts -t "REQ-386/AC-2" --run`
- **手順**: `succeeded` に遷移したが `outputs` が空配列のイベントを受信する。
- **期待結果**: クラッシュせず `autoFollowImage` をスキップし、既存プレビューを安全に保護すること。

### 境界値テスト 4 (全ジョブ完了時の状態整合とプログレス値 clamp, AC-3)
- **対象ファイル**: `frontend/src/pages/GeneratePage/components/__tests__/GenerationProgress.test.tsx`
- **ケース名**: `it('[REQ-386/AC-3] keeps 100 percent progress and does not revert to 0 on final event')`
- **検証コマンド**: `npm test -- src/pages/GeneratePage/components/__tests__/GenerationProgress.test.tsx -t "REQ-386/AC-3" --run`
- **手順**: 単体生成および複数バッチ生成の全ジョブが完了した直後に余分な空イベントを受信する。
- **期待結果**: プログレスが 100% から 0% に巻き戻らず、最新画像表示を維持すること。
