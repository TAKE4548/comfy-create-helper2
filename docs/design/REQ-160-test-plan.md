# PBI-REQ-160 実行可能テスト計画

## 1. 自動テスト (CLI Verification)

### Backend Tests
- **コマンド**: `pytest backend/tests/test_speech_tone_presets.py -v`
- **対象ケース**:
  1. `test_create_and_list_speech_tone_preset`: 口調プリセットの新規作成と一覧取得
  2. `test_update_and_delete_speech_tone_preset`: 口調プリセットの更新と削除
  3. `test_rewrite_speech_tone_success`: 外部LLMをモックした口調書き換えAPIの正常終了テスト
  4. `test_rewrite_speech_tone_with_preset_id`: プリセットID指定による口調書き換えテスト
  5. `test_rewrite_speech_tone_validation_error`: 必須項目不足時のバリデーションテスト

### Frontend Tests
- **コマンド**: `npm --prefix frontend test -- SpeechBubbleControls.test.tsx`
- **対象ケース**:
  1. 口調変換セクションの展開とプリセット一覧の描画
  2. プリセット選択時のプロンプト連動と「変換実行」トリガー
  3. 変換完了後のプレビュー表示および「セリフに適用」クリック時のテキスト更新

## 2. ツール主導監査 (Tool-Driven Audit)
- **API検証**: `python ${GLOBAL_SCRIPTS}\openapi_parser.py backend/openapi.json list-endpoints`
- **品質監査**: `python ${GLOBAL_SCRIPTS}\artifact_linter.py docs/backlog/task/active`

## 3. 手動・E2E検証 (Manual UI Verification)
1. スナップショット一覧またはアルバム詳細からセリフ編集モーダルを開く。
2. 吹き出しにセリフ（例:「ここから先は通さないよ」）を入力。
3. 口調変換セクションを展開し、プリセット「お嬢様」（例:「〜ですわ、〜ごきげんよう」）を選択。
4. 「口調変換」を実行し、ローディング後にプレビュー「ここから先はお通しいたしませんわ」等の変換結果が表示されることを確認。
5. 「セリフに適用」をクリックし、吹き出しのセリフテキストが置換されキャンバスにも反映されることを確認。
6. 設定ページ（SettingsPage）の「セリフ口調プリセット設定」から新規プリセットの作成・削除が正常に行えることを確認。
