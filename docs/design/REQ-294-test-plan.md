# REQ-294 実行可能テスト計画

## 2026-09-29 実装後の自動検証結果

- `mypy backend`: PASS、131 source files、0 issues（REQ-295 の修正を含む現在の作業ツリーで確認）。
- Frontend `npm run typecheck`: PASS。
- Backend 全テスト: PASS、356 passed、1 Starlette/httpx deprecation warning。
- Frontend 全テスト: PASS、92 files / 876 tests。
- 実ブラウザー E2E-01〜06 と P-07/08 はユーザーが実施するため、未検証として扱いPASSと推定しない。

## 2026-09-29 引き継ぎ監査による実行手順の補正

- Backend個別テストはリポジトリルートから `Set-Location backend; .\.venv\Scripts\python -m pytest tests/test_speech_scene_service.py tests/test_speech_scene_router.py tests/test_speech_draft.py -v --tb=short` を実行する。旧記述の `cd backend && .venv/Scripts/python` はPowerShellの標準手順ではない。
- Frontend個別テストはfrontendディレクトリで `npx vitest run src/components/__tests__/SceneSpeechModal.test.tsx src/hooks/__tests__/useSceneSpeechGeneration.test.ts src/components/__tests__/SpeechBubbleEditorModal.test.tsx`。旧記述のHook/Modalテストパスを置き換える。
- Gate 2は個別テストだけでなくbackendの全pytestとfrontendの `npm test` を実行する。
- override切替は応答IDに加えてVLMへ渡る参照prompt/bubblesの切替をモックで確認する。無効なoverride IDは明確な4xxを期待する。
- JPEG圧縮後の長辺1024px以下に加え、VLMへのdata URLが `data:image/jpeg;base64,` であることを検査する。
- State 2で全チェック解除した場合にキャンバスへ追加しないこと、初出キャラの並行オンボーディングが生成完了と同期すること、モバイルで全パラメータを編集できることを確認する。
- 現存の `backend/openapi.json` は対象APIを含まない。Gate 3で実アプリのOpenAPI出力に新Request/Responseフィールドが公開されることを検査する。
- VLM応答が不正JSONまたは空itemsの場合、フロントエンドが無反応にならずエラー表示と再試行へ遷移することを確認する。
- 初出キャラの推論中に閉じて再試行した場合、旧リクエストの遅延結果が新しいレビューやキャンバスへ混入しないことを確認する。
- UI状態は `progress` / `onboarding` / `error` / `review` の排他的4状態として検証する。State 1-Error等は仕様書の画面名として扱う。
- NDJSON progress event は `{"type":"progress","step":"reference|vlm|style|vram","status":"active|done|error"}`。error event は `{"type":"error","error_kind":"lm_studio_400|connection_refused|timeout|invalid_request|vram_unload_failed|unknown","message":"<安全な表示文>"}`。`message` に画像パス、prompt、stack traceを含めない。
- Error画面は `error_kind` に対応する利用者向け見出し、安全な `message`、再試行操作を表示する。再試行時は旧AbortControllerをabortし、新しいgenerationIdのイベントだけを受け付ける。
- T8独立フォーム: PC/375pxモバイルの両方で名前、ベース、形状、文字方向、フォント、文字サイズ、3色、枠幅を操作する。ベース選択で値がコピーされ、保存時にtag_set_idと編集値がcreate APIへ渡り、返却idがHookへ届くことを確認する。base_preset_idは送らない。
- 並行Onboarding: 「推論先着」と「プリセット保存/スキップ先着」の両順序、API保存失敗、二重送信、閉じた後の遅延結果を検証する。

---
pbi_id: REQ-294
related_design: docs/design/REQ-294.md
gate: 1,2,3
---

## 1. Gate 1: 型検査 (Typecheck)

```powershell
# Backend
mypy backend

# Frontend
Push-Location frontend
npm run typecheck
Pop-Location
```

**期待値**: エラー0件。特に `SceneDraftResponse` / `ToneSampleItem` / `SimilarSceneCandidate` の新フィールドが型エラーを起こさないこと。

---

## 2. Gate 2: 自動テスト

### 2.1 バックエンド単体・結合テスト

```powershell
Set-Location backend
.\.venv\Scripts\python -m pytest tests/test_speech_scene_service.py -v
```

#### TC-BE-01: 高・中・低分散抽出 – 正常系
- **前提**: 同キャラ（target_tag_set_id=1）の8〜50文字セリフを持つスナップショットが5件以上DBに存在
- **実行**: `extract_character_tone_samples_high_mid_low(db, 1, "battle in the rain")`
- **期待値**:
  - 戻り値リスト長 = 3
  - `similarity_tier` が `["high", "mid", "low"]` をそれぞれ1件ずつ含む
  - 3件の `snapshot_id` がすべて異なる

#### TC-BE-02: 高・中・低分散抽出 – フォールバック（0件）
- **前提**: 対象キャラのスナップショットが0件、SpeechTonePreset に prompt がある
- **実行**: `extract_character_tone_samples_high_mid_low(db, 99, "some prompt")`
- **期待値**: 戻り値リスト長 = 1、`similarity_tier = "fallback"`

#### TC-BE-03: 高・中・低分散抽出 – 相槌除外
- **前提**: 同キャラのセリフが「うん」「はい」「ええ」の3件のみ
- **期待値**: FILLER_PATTERNSに一致するため除外され、フォールバックへ移行

#### TC-BE-04: Top-3候補返却 – 正常系
- **実行**: `extract_top3_similar_scenes(db, "crying battle scene")`
- **期待値**:
  - 戻り値タプルの第2要素リスト長 = min(3, 利用可能スナップショット数)
  - 各 `SimilarSceneCandidate` に `snapshot_id`, `score`, `matched_stems`, `bubble_count` が存在

#### TC-BE-05: override再推論
- **実行**: `extract_top3_similar_scenes(db, "some prompt", override_snapshot_id=15)`
- **期待値**: 第1要素（selected_id）= 15

#### TC-BE-06: load_image_as_base64 – JPEG圧縮
- **実行**: `load_image_as_base64(Path("tests/fixtures/large_4k.png"))`
- **期待値**: base64デコード後の画像の長辺 ≤ 1024px

#### TC-BE-07: LM Studio 400エラー透過
- **モック**: `httpx.AsyncClient.post` が status_code=400 / text="Bad Request: ..." を返す
- **期待値**: `httpx.HTTPStatusError` が `"LM Studio error 400:"` を含むメッセージで raise される

#### TC-BE-08: generate_scene_script シグネチャ変更
- **実行**: エンドポイント POST `/api/speech/scene-draft` に `override_similar_scene_snapshot_id: 5` を含むリクエスト
- **期待値**: レスポンスに `selected_similar_scene_id: 5` が含まれる

```powershell
# 修正後の期待テストコマンド（test_speech_scene_service.py の既存テストも PASS すること）
Set-Location backend
.\.venv\Scripts\python -m pytest tests/test_speech_scene_service.py -v --tb=short
```

### 2.2 フロントエンド単体テスト

```powershell
Set-Location frontend
npx vitest run src/hooks/__tests__/useSceneSpeechGeneration.test.ts src/components/__tests__/SceneSpeechModal.test.tsx
```

#### TC-FE-01: プログレス即時表示
- `handleBatchGenerateClick` 呼び出し直後に `modalState.type === 'progress'` であること

#### TC-FE-02: エラーステート遷移
- `generateDraftApi` がrejectされたとき `modalState.type === 'error'` であること
- NDJSON error event の `error_kind` が `lm_studio_400` / `connection_refused` / `timeout` / `invalid_request` / `vram_unload_failed` / `unknown` のいずれかに分類され、安全な `message` と再試行操作を表示すること

#### TC-FE-03: レビューステート遷移
- `generateDraftApi` が解決後に `modalState.type === 'review'` であること

#### TC-FE-04: モバイル自動タブ遷移（AC-7）
- `setActiveMobileTab` スパイが `'preview'` で呼ばれること（`generateDraftApi` 完了後）

#### TC-FE-05: 初出キャラ（Onboarding）フロー
- `speechBubblePresetsApi.getByTagSetId` が null を返すとき `modalState.type === 'onboarding'` であること
- `onPresetCreatedAndApply` 後にバブルが正しく setBubbles に渡されること

---

## 3. Gate 3: E2E・手動確認

### 3.1 E2E シナリオ（実ブラウザ）

前提条件:
- LM Studio が localhost:1234 で起動済み
- 少なくとも3件の同キャラスナップショットがDBに存在

#### E2E-01: State 1 プログレス表示（AC-1）
1. スナップショット一覧から任意の画像を選択し、セリフ編集モーダルを開く
2. ✨シーン一括生成ボタンをクリック
3. **確認**: 次の描画フレームまでにモーダルが表示され「参照抽出」ステップが active 状態になること
4. **確認**: 経過秒数カウンターが1秒ごとにインクリメントされること
5. **確認**: reference / VLM / style / VRAM は対応するNDJSONイベント到着後に更新され、固定タイマーだけで工程を完了扱いにしないこと

#### E2E-02: State 1-Error エラー表示（AC-2）
1. LM Studio を停止した状態で ✨ボタンをクリック
2. **確認**: State 1-Error が表示され、エラー種別（接続拒否）と再試行ボタンが表示されること
3. 再試行ボタンをクリックし、プログレスが再度表示されること

#### E2E-03: State 2 レビュー – 系統A高中低（AC-3, AC-5）
1. ✨ボタン → 生成完了後 State 2 が表示されること
2. **確認**: tone_samples として「高」「中」「低」の3コマサムネイルが表示されること
3. **確認**: 各コマにキャプション（"高: スナップ#N"等）が表示されること
4. 一部チェックボックスをオフにして「キャンバスに反映」
5. **確認**: オフにしたセリフがキャンバスに追加されないこと

#### E2E-04: State 2 レビュー – 系統BリファレンススイッチTop-3（AC-4）
1. State 2 にて candidate_similar_scenes の2位/3位サムネイルをクリック
2. **確認**: `override_similar_scene_snapshot_id` に選択したIDがセットされ、再生成リクエストが送信されること
3. **確認**: 再生成後の `selected_similar_scene_id` が選択したIDと一致すること

#### E2E-05: モバイル機能パリティ（AC-6）
1. ブラウザ幅を375px（モバイル模倣）に変更
2. 初出キャラとして ✨ボタンをクリック
3. **確認**: State 1-Onboarding がボトムシートとして表示されること
4. **確認**: フォント・文字方向・配色3点（テキスト/背景/枠）・枠幅の全パラメータが設定可能であること

#### E2E-06: モバイル自動タブ遷移（AC-7）
1. モバイル幅で「編集設定」タブを表示中に ✨ボタンをクリック
2. **確認**: 生成完了後、自動的に「プレビュー」タブに切り替わること

---

## 4. Red Team 境界値・異常系テスト

### 2026-09-29 AC-1実工程イベント改訂案の追加検証（設計レビュー待ち）

この節は `docs/design/REQ-294-progress-revision.md` に従う。T12〜T16は実装済みで、既存JSON endpointの契約を維持する。

| ID | 層 | 操作・注入 | 合格条件 |
|---|---|---|---|
| P-01 | service T12 | reference抽出、VLM、style変換、unloadを制御モックで順に停止/解放 | 各実境界で `reference/vlm/style/vram` のactive→doneが順序通り、固定タイマー由来の虚偽更新なし |
| P-02 | service T12 | VLM不正JSON・空items・timeoutを注入 | 失敗工程error、finally unload実行、例外が旧JSON呼出しへ維持 |
| P-03 | router T13 | stream POSTに正しいSceneDraftRequest | content-type `application/x-ndjson`、各行JSON+改行、resultはVRAM解放後に1回、送信後stream閉鎖 |
| P-04 | router T13 | 無効snapshot/override、VLM 400、通信切断、stream途中でclient cancel | schemaは開始前422、service内部エラーはerror行。切断時にtaskを停止しunloadとDB closeを完了。既存JSON POSTの4xx/500契約は維持 |
| P-05 | client T14 | NDJSONを文字境界で分割、複数行同時、最終改行なし、不正行、resultなしEOF、AbortSignal | onProgressが各行1回、正常resultのみresolve、異常はreject、reader解放 |
| P-06 | Hook T15 | 開始直後、工程イベント逐次、Onboarding先着/後着、再試行/参照切替/閉じる後の旧イベント | 即時reference active、他pending。実イベントのみ更新し、古い世代を反映せず、Error/Review遷移が正しい |
| P-07 | Editor T16 | PC/375px画面で生成し4工程の実到着を観測 | 行の表示・経過秒数・選択適用・キャンセルとモバイルpreview切替が動作 |
| P-08 | 結合/実ブラウザ | backend直配信とVite `/api` proxyの双方で遅延VLMを使用 | 参照完了/VLM開始が最終結果より前にブラウザへ届く。バッファリングされず、VRAMは終了/切断後に解放 |

Gate 1 は `mypy backend` とfrontend `npm run typecheck` が成功すること、Gate 2 はbackend `.\.venv\Scripts\python -m pytest` とfrontend `npm test` が全件成功すること。2026-09-29の現行作業ツリーではGate 1・2ともPASS。実ブラウザーにLM Studioやseedが用意できない場合、Gate 3の該当E2Eは未確認として扱う。

### 4.1 バックエンド境界値

| ID | シナリオ | 入力 | 期待値 |
|---|---|---|---|
| RT-BE-01 | 同キャラセリフが1件のみ | `target_tag_set_id` に1件しか存在しない | `tone_samples` 長 = 1（high のみ） |
| RT-BE-02 | 全セリフが相槌のみ | FILLER_PATTERNS に完全一致するセリフのみ | `fallback` tier へフォールバック |
| RT-BE-03 | `override_similar_scene_snapshot_id` が存在しないID | ID=99999 | `selected_similar_scene_id = 99999`（存在確認なし）または graceful エラー |
| RT-BE-04 | 画像ファイルが存在しない | 不正な `snapshot.image_path` | `ValueError: Image file not found` が raise される |
| RT-BE-05 | LM Studio タイムアウト | `httpx.TimeoutException` mock | `generate_scene_script` から例外が伝播し、ルーターが 500 を返す |
| RT-BE-06 | `current_prompt` が空文字列 | `""` | `extract_top3_similar_scenes` が `(None, [])` を返す |

### 4.2 フロントエンド境界値

| ID | シナリオ | 条件 | 期待値 |
|---|---|---|---|
| RT-FE-01 | `tone_samples` が0件 | レスポンスの `tone_samples: []` | State 2 でサムネイルセクションが「参照なし」表示になること |
| RT-FE-02 | `candidate_similar_scenes` が1件のみ | `candidate_similar_scenes` 長=1 | State 2 でサムネイル1件のみ表示（2/3位ボタン非表示） |
| RT-FE-03 | チェックボックス全解除で「反映」 | 全バブルのチェックをオフ | `setBubbles` が呼ばれないこと（または空配列） |
| RT-FE-04 | キャンセル後の再生成 | `onModalCancel` → 再度 ✨ クリック | 正常に新しい生成フローが開始されること |
| RT-FE-05 | 生成中に `primaryTagSetId` が null | `primaryTagSetId = null` | `null-route` を経由し Onboarding スキップ → 直接レビューへ |
