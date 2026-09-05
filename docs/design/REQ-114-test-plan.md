# PBI-REQ-114 実行可能テスト計画

## 1. 自動テスト (CLI Verification)

バックエンド側の影響がないため、既存の pytest スイートが不具合修正によって壊れないことを確認します。

- **コマンド**: `pytest backend`
- **期待値**: 100% 成功すること。

## 2. ツール主導監査 (Tool-Driven Audit)

- **API検証**: 本修正において新規のAPI追加はないため、`openapi_parser.py` による検証では差分（差分なし）を確認。
- **コード監査**: `local_model_adapter.py arch-audit .` を実行し、設計整合性の客観的証明を得ること。

## 3. ブラウザ検証 (Browser Agent Verification)

- **対象URL**: `http://localhost:5173/tags` (TagsPage)
- **操作手順**: 
  1. 既存のタグセット（例: 「ベースモデル設定等があるもの」）の「編集」ボタンをクリックして `LocalTagSetEditModal` を開く。
  2. タグ名や説明を一部編集し、「Save Changes」をクリックする。
  3. **判定基準**: モーダルが自動的に閉じ、一覧に変更した値が正しく反映されていること。リロードしてもその値が維持されていること。
  4. 同様に、任意のタグセットの「詳細」ボタンから `TagSetDetailModal` を開き、「Edit」をクリックして編集モードに入る。
  5. 編集し「Save Changes」をクリックする。
  6. **判定基準**: 詳細モーダルが閉じ、一覧が更新され、既存のサブセット（subsets）が消えずに残っていること。
- **必須エビデンス**: 編集保存成功後のTagsPage画面のスクリーンショット。
