# PBI-REQ-183 実行可能テスト計画

## 1. 自動テスト (CLI Verification)

- **Vitest 実行**: `npm --prefix frontend test`
- **対象テストファイル**:
  - `frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx` (プリセット切り替え、ステート同期、OCC競合ハンドリング)
  - `frontend/src/components/TagChipEditor/__tests__/TagChipEditor.test.tsx` (外部 value 更新時の挙動、onChange 発火検証)
  - `frontend/src/pages/GeneratePage/components/__tests__/DesktopLayout.test.tsx` または `MobileLayout.test.tsx` (タブクリック時のレンダリング)
- **期待値**: 全 30 テストファイル（357+ テスト）が PASS すること。

## 2. ツール主導監査 (Tool-Driven Audit)
- **TypeScript ビルド**: `npm --prefix frontend build` (型エラーゼロ)
- **コード品質監査**: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py arch-audit .`

## 3. ブラウザ / UI 手動検証 (Manual / Browser Verification)
- **対象画面**: `http://localhost:5173/` (Generate 画面)
- **操作手順**:
  1. 異なるプロンプト・LoRA 設定を持つ複数のプリセットタブ（Set 1, Set 2, Set 3 など）を用意する。
  2. Tab Bar 上でタブを連続クリック（Set 1 ↔ Set 2 ↔ Set 3）して切り替える。
  3. 切り替え直後にプロンプト文字列やパラメータを変更し、正しくそのタブの変更として反映・保存されることを確認する。
- **判定基準**:
  - クリック後、瞬時（体感 100ms 以内）にアクティブタブのハイライトと入力欄の値が切り替わること。
  - 切り替え時に画面のフリーズ・突っかかり（2〜3秒の遅延）が発生しないこと。
  - 不要な 409 Conflict や予期せぬオートセーブの誤動作が発生しないこと。

