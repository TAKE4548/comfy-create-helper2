# PBI-REQ-205 実行可能テスト計画

## 1. 自動テスト (CLI Verification)

### 1.1 バックエンド単体テスト
- **コマンド**: `pytest backend/tests/test_speech_parser.py backend/tests/test_speech_tone_presets.py backend/tests/test_speech_batch.py -v`
- **期待値**:
  - `test_speech_parser.py`: 構造化XMLタグ（`<dialogue>`, `<interpretation>`, `<reasoning>`）、推論モデル思考タグ（`<think>`）、JSONフォーマット、タグ妥当性判定 (`is_valid_structured_response`)、およびタグなしフォールバックのパースがすべて PASS すること。
  - `test_speech_tone_presets.py`: 単体変換エンドポイントにおいて、構造化レスポンスが正常に返却され、`scene_interpretation` と `reasoning` が含まれること。初回出力がタグ違反時に指摘プロンプト付きで自動リトライされパース成功すること。ダメ出し・修正指示 (`revision_instruction`) を付与したリクエストでプロンプトに指示が合成されること。
  - `test_speech_batch.py`: バッチジョブ実行時に各アイテムで構造化パースが行われ、補助情報が保存されること。アイテム再生成 (`retry`) エンドポイントで `revision_instruction` を渡して再試行できること。

### 1.2 フロントエンド単体テスト
- **コマンド**: `npm --prefix frontend test -- src/components/__tests__/SpeechBubbleControls.test.tsx src/components/__tests__/BatchSpeechTransformModal.test.tsx src/pages/__tests__/SettingsPage.test.tsx`
- **期待値**:
  - `SettingsPage.test.tsx`:
    - 「LLM System Prompts」一覧に「セリフ口調変換: システムプロンプト」が表示され、編集・保存できること。
  - `SpeechBubbleControls.test.tsx`:
    - 変換結果表示時にクリーンなセリフのみが表示され、思考トグルをクリックすると解釈・思考情報が展開されること。
    - 修正指示（ダメ出し）入力欄にテキストを入力して「修正指示を反映して再生成」ボタンをクリックすると、`previous_rewritten_text` と `revision_instruction` が API に送信されること。
  - `BatchSpeechTransformModal.test.tsx`:
    - レビュー画面の各アイテムで解釈・思考の確認ができること。
    - 個別アイテムの再生成で修正指示を入力して再試行 API が呼び出されること。

---

## 2. ツール主導監査 (Tool-Driven Audit)
- **バックログ監査**: `python ${GLOBAL_SCRIPTS}\backlog_linter.py`
- **成果物監査**: `python ${GLOBAL_SCRIPTS}\artifact_linter.py`
- **コミット前静的検査**: `python ${GLOBAL_SCRIPTS}\pre_commit_linter.py`

---

## 3. UI検証手順 (Manual & Browser Verification)
- **対象画面**:
  - 設定画面: `SettingsPage`（LLM System Prompts セクション）
  - 単体セリフ編集: `SpeechBubbleControls`（キャンバス上で吹き出しを選択）
  - 一括セリフ変換: `BatchSpeechTransformModal`
- **操作手順**:
  1. 設定画面を開き、「LLM System Prompts」内の「セリフ口調変換: システムプロンプト」を編集・保存できることを確認。
  2. 単体編集でセリフを選択し、場面ヒントを入力して「✨ 口調変換 (LLM)」を実行。
  3. 変換後プレビューにセリフのみが表示され、「💡 AIの解釈・思考過程」を開いて解釈・推論が確認できることを検証。
  4. 「修正指示・ダメ出し」欄に「もっと怒っている口調にして」と入力し、「修正指示を反映して再生成」を実行。期待通り修正されたセリフが反映されることを検証。
  5. 一括変換モーダルを開き、複数画像のセリフを一括変換。各アイテムの解釈・思考バッジを確認し、特定アイテムで修正指示付き再生成が動作することを検証。


