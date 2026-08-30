# PBI-REQ-202 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **コマンド**: `npm test frontend/src/components/__tests__/ProfileBulkEditModal.test.tsx`
- **期待値**: 共通タグのTagChip描画、サブメニューでの強度調整・タグ名変更・削除の反映テストを含む全テストケースが PASS すること。
- **コマンド**: `npm test frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx`
- **期待値**: `handleBulkEditApply` における `commonTagOps` のプリセット更新（強度変更、名称変更、削除、固有タグ保持）テストを含む全テストケースが PASS すること。

## 2. ツール主導監査 (Tool-Driven Audit)
- **コード監査**: `local_model_adapter.py arch-audit .` を実行し、設計整合性の客観的証明を得ること。

## 3. ブラウザ検証 (Browser / Manual Verification)
- **対象画面**: 生成プリセット一覧画面（`/generate`）
- **操作手順**:
  1. 複数プリセットを選択し「一括編集」モーダルを開く。
  2. プロンプトタブで「共通タグ編集・削除」を選択。
  3. 共通タグチップをクリックしてサブメニューを表示。
  4. タグ名の変更、強度の増減（ステップボタン / 直接入力）、削除 / 有効無効切り替えを操作。
  5. 「一括適用」を実行。
- **判定基準 (Assertion)**:
  - 選択された全プリセットのプロンプトにおいて、変更・調整された共通タグが一括更新され、固有タグが維持されていること。

