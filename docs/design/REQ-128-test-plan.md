# PBI-REQ-128 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **コマンド**: `npm --prefix frontend run build` 及び `npm --prefix frontend run lint`
- **期待値**: エラー無く正常にビルド・TypeScript型チェック・リンターを通過すること。

## 2. ツール主導監査 (Tool-Driven Audit)
- **ガバナンス・アーティファクト検証**: `python ${GLOBAL_SCRIPTS}\artifact_linter.py docs/backlog/task/active/`
- **ワークフロー検証**: `python ${GLOBAL_SCRIPTS}\workflow_validator.py`

## 3. 手動 / ブラウザ検証 (Verification Criteria)
- **操作手順**:
  1. 吹き出しセリフ編集モーダルを開く。
  2. セリフを入力し、吹き出し領域が検出された状態で「保存して履歴へ追加」をクリック。
- **判定基準 (Assertion)**:
  - AC-1: 生成・保存された画像の解像度が `imageObj.naturalWidth` × `imageObj.naturalHeight` に一致すること。
  - AC-2: 保存画像に緑の検出枠 (`#3ECF8E`) が含まれないこと。
  - AC-3: 保存画像にデバッグ候補枠（破線）が含まれないこと。
  - AC-4: 保存画像にROI選択矩形が含まれないこと。
  - AC-5 & 6: セリフテキストが元画像サイズで適切な大きさ・レイアウトで描画されていること。
