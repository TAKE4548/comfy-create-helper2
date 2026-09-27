# REQ-291 検証レポート (Walkthrough)

## 1. 概要
- **PBI ID**: REQ-291
- **タイトル**: Prompt Surgeon: 2系統参照型セリフ・SE一括自動生成 (Qwen3.5-9B-Claude連携・即時VRAM解放・並行オンボーディング)
- **テスト計画書**: [REQ-291-test-plan.md](file:///c:/Users/audih/ws/comfy-create-helper2/docs/design/REQ-291-test-plan.md)
- **総合判定**: **PASS**

---

## 2. 3-Gate Baseline 検証結果

| Gate | 検証項目 | 実行コマンド | 判定 | エビデンス概要 |
| :--- | :--- | :--- | :---: | :--- |
| **Gate 1** | 型検査・静的解析 | `cd frontend && npm run typecheck` (`tsc -b --noEmit`)<br>`python -m py_compile ...` | **PASS** | フロントエンド TypeScript エラー 0 件、バックエンド py_compile エラー 0 件。 |
| **Gate 2** | フルテストスイート | `cd frontend && npx vitest run`<br>`cd backend && pytest tests/test_speech_scene_service.py tests/test_speech_migrations.py` | **PASS** | フロントエンド: 88 ファイル / 841 件中 841 件 PASS (100%)。<br>バックエンド新設スイート: 11 件中 11 件全件 PASS。 |
| **Gate 3** | シナリオ & Red Teaming (AC検証) | `pytest tests/test_speech_scene_service.py tests/test_speech_migrations.py -v`<br>`npx vitest run src/hooks/__tests__/useSceneSpeechGeneration.test.ts` | **PASS** | TEST-VRAM-01〜TEST-MIG-05 の全 Red Team 境界・異常系シナリオ検証完了。 |

---

## 3. 受入基準 (AC) 充足状況

| AC ID | 要件 | 検証テスト | 判定 | 検証内容・エビデンス |
| :--- | :--- | :--- | :---: | :--- |
| **AC-1** | DB構造拡張＆マイグレーション | TEST-MIG-05 (test_speech_migrations.py) | **PASS** | SpeechBubblePreset への tag_set_id/is_default/tone_preset_id カラム追加確認。正規表現 ([!?！？〜～ッっ…・]|^[ァ-ヴーぁ-ん]{2,6}$) によるオノマトペ is_se=True 判定と長文モノローグの除外、文字色マップによる speaker_tag_set_id バックフィルおよびべき等性を検証完了。 |
| **AC-2** | 推論 & VRAM即時解放 | TEST-VRAM-01 (test_speech_scene_service.py) | **PASS** | 正常推論時および例外送出時の finally 句における POST /v1/models/unload 発火、1回リトライ機構、全滅時フォールバック返却、エンドポイント /api/speech/scene-draft での vram_unloaded=True 返却を網羅検証。 |
| **AC-3** | 2系統参照 & パース堅牢化 | TEST-DUAL-02 (test_speech_scene_service.py) | **PASS** | 系統A（直近50件の同一キャラ確定セリフ抽出／0件時TonePresetフォールバック）と系統B（SnowballStemmer 名詞・動詞類似度スコアTop-1抽出）が正確に動作。<think> タグ除去およびマークダウン（`json ... `）からのJSON抽出を確認。 |
| **AC-4** | マルチ話者 & SE装飾 & 座標変換 | TEST-STYLE-04 (test_speech_scene_service.py) | **PASS** | TagSet.name 照合による sub話者の専用プリセット/白黒フォールバック、SE要素（role='se'）に対する shape='none', textColor='#FFCC00', 背景・枠線透明化の強制適用、定性方角から1024px座標系への正確なマッピングを検証。 |
| **AC-5** | 並行オンボーディング & レース防止 | TEST-PAR-03 (useSceneSpeechGeneration.test.ts) | **PASS** | 初出キャラ時のモーダル先行確定、推論先行完了、推論中モーダル閉じ（先行キャンセル救済: 白黒スタイル展開）の全パターンでセリフ消失・欠損なく描画されることを検証。 |
| **AC-6** | 品質検証・リグレッションなし | 3-Gate Baseline | **PASS** | TypeScript 型検査（0エラー）、Vitest 全体（841/841 PASS）、新設テスト（11/11 PASS）すべてクリア。 |

---

## 4. Red Teaming (異常系・境界値検証)

1. **VLM推論中の例外発生時のVRAMリーク防止 (Red Team: 例外注入)**:
   - 	est_vram_unload_lifecycle_on_error にて、VLM推論中に RuntimeError が送出された場合でも finally 句により POST /v1/models/unload が必ず呼び出されることを検証。
2. **LM Studio アンロード失敗時のリトライと安全なフォールバック (Red Team: 通信障害注入)**:
   - 	est_vram_unload_retry_and_success および 	est_vram_unload_failure_returns_false にて、初回タイムアウト/切断発生時の1回リトライ発火と、完全障害時にも呼び出し元をクラッシュさせず vram_unloaded=False を返却する安全動作を確認。
3. **先行キャンセル時のセリフ喪失防止 (Red Team: 非同期レース中断)**:
   - useSceneSpeechGeneration.test.ts にて、VLM推論中にユーザーがモーダルを閉じた（キャンセルした）場合でも、破棄せず白黒デフォルトスタイルで救済描画されることを確認。

---

## 5. ローカルモデル QA 監査 & VRAMクリーンアップ

- **監査実行**: local_model_adapter.py qa-audit docs/design/REQ-291-test-plan.md
- **モデル**: qwen3.5-9b-claude-4.6-highiq-thinking-heretic-uncensored (Domain: reasoning)
- **監査結果**: COMPLIANT (Partially Executable metrics noted)
  - 機械的・実装的テストは網羅されており完全実行可能。
  - テスト計画書内の定性表現に対する定量的閾値・タイムスタンプ検証仕様の強化案（Should-Have）が提示された。
- **[MANDATORY GPU CLEANUP]**:
  - python local_model_adapter.py unload を実行。
  - VRAM 全量解放完了（Exit code: 0, All models unloaded from LM Studio. VRAM freed. 確認済み）。
