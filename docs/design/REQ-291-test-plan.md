---
id: REQ-291-test-plan
title: "Prompt Surgeon: 2系統参照型セリフ・SE一括自動生成 テスト計画書"
status: test-plan
tags: [test, backend, frontend, vlm, pytest, vitest]
related_paths:
  - backend/tests/test_speech_scene_service.py
  - backend/tests/test_speech_migrations.py
  - frontend/src/hooks/__tests__/useSceneSpeechGeneration.test.ts
---

# REQ-291 実行可能テスト計画: 2系統参照型セリフ・SE一括自動生成

## 1. 3-Gate Baseline 検証コマンド一覧

### Gate 1: 型検査 (Typecheck)
- **コマンド**: `cd frontend && npm run typecheck`
- **対象**: `frontend/src/api/types.ts`, `frontend/src/api/client.ts`, `frontend/src/hooks/useSceneSpeechGeneration.ts`
- **合否判定基準**: エラー 0 件（終了コード 0）。

### Gate 2: 単体・結合テスト (Unit & Integration Tests)
- **バックエンドテスト**:
  - `cd backend && pytest tests/test_speech_scene_service.py tests/test_speech_migrations.py -v`
- **フロントエンドテスト**:
  - `cd frontend && npx vitest run src/hooks/__tests__/useSceneSpeechGeneration.test.ts`
- **合否判定基準**: 全テストケース PASS（終了コード 0）。

---

## 2. 自動テストケース詳細仕様 (Automated Verification Suite)

### TEST-VRAM-01 (Backend/Pytest)
- **対象**: `app.services.speech_scene_service.unload_vlm_model_with_retry`, `POST /api/speech/scene-draft`
- **検証シナリオ**:
  1. VLM正常推論時: 推論直後に `POST /v1/models/unload` が 1 回コールされ、`vram_unloaded=True` が返ること。
  2. VLM例外発生時: `finally` 句内で `unload_vlm_model_with_retry` が発火し、例外送出時もアンロードが試行されること。
  3. 初回リクエスト失敗時: 最大 1 回リトライが実行され、2回目成功時に `True`、全滅時に `False` が返ること。
- **検証コマンド**:
  ```bash
  cd backend && pytest tests/test_speech_scene_service.py -k test_vram_unload -v
  ```

### TEST-DUAL-02 (Backend/Pytest)
- **対象**: `extract_character_tone_samples`, `extract_best_similar_scene_samples`, `parse_vlm_json_with_fallback`
- **検証シナリオ**:
  1. 系統A: 同一 `tag_set_id` の確定セリフ（`not is_se`）を直近50件から抽出。0件時に `SpeechTonePreset` へフォールバックすること。
  2. 系統B: SnowballStemmer による動詞・名詞トークン類似度計算（感情語+5, 状況語+2）で Top-1 最類似シーンを抽出すること。
  3. パース堅牢化: `<think>...</think>` タグ付きテキスト、マークダウン囲み（` ```json ... ``` `）テキストから純粋な JSON 辞書が抽出されること。
- **検証コマンド**:
  ```bash
  cd backend && pytest tests/test_speech_scene_service.py -k test_dual_track_and_parse -v
  ```

### TEST-PAR-03 (Frontend/Vitest)
- **対象**: `src/hooks/useSceneSpeechGeneration.ts`
- **検証シナリオ**:
  1. モーダル先行確定: ユーザーがモーダルでプリセットを作成・確定した後に推論 API が解決された場合、確定したプリセット ID で `setBubbles` が実行されること。
  2. 推論先行完了: 推論 API が先に解決され、その後モーダル確定された場合、保管されたドラフトが確定プリセット ID で即座に描画されること。
  3. 先行キャンセル救済: 推論中にモーダルが閉じられた（キャンセルされた）場合、推論完了時に `style=null`（標準白黒スタイル）で救済描画され、セリフ消失が発生しないこと。
- **検証コマンド**:
  ```bash
  cd frontend && npx vitest run src/hooks/__tests__/useSceneSpeechGeneration.test.ts
  ```

### TEST-STYLE-04 (Backend/Pytest)
- **対象**: `convert_items_to_bubbles`, `resolve_bubble_style`
- **検証シナリオ**:
  1. sub話者のキャラ名が `TagSet.name` と一致する場合、そのキャラのデフォルトプリセットまたは専用スタイルが適用されること。未一致時は汎用白黒になること。
  2. SE要素（`role='se'`）の場合、`is_se=True`, `shape='none'`, `textColor='#FFCC00'`, 背景・枠線透明が強制適用されること。
  3. `position`（`top_right`, `top_left`, `center_right` 等）が 1024px 実ピクセル座標系（`x, y, w, h`）に正しく変換されること。
- **検証コマンド**:
  ```bash
  cd backend && pytest tests/test_speech_scene_service.py -k test_style_and_coords -v
  ```

### TEST-MIG-05 (Backend/Pytest)
- **対象**: `backend/tools/migrate_speech_speakers.py`, `step_012_speech_bubble_presets_tag_set_id`
- **検証シナリオ**:
  1. 正規表現 `([!?！？〜～ッっ…・]|^[ァ-ヴーぁ-ん]{2,6}$)` により、「ドクン」「ハッ」等のカタカナ・ひらがな短文が `is_se=True` と判定されること。
  2. 長文モノローグ（7文字以上かつ感嘆符なし）は `is_se=False` のまま維持されること。
  3. `color_to_tagset_id_map` に基づき、文字色から既存吹き出しに `speaker_tag_set_id` が付与されること。
- **検証コマンド**:
  ```bash
  cd backend && pytest tests/test_speech_migrations.py -k test_migration_and_backfill -v
  ```
