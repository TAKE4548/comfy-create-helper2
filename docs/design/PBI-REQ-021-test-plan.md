# PBI-REQ-021 実行可能テスト計画

## 1. 前提条件 (Setup & Environment)
- バックエンド (`uvicorn app.main:app`) およびフロントエンド (`npm run dev`) が起動していること。
- テストデータとして、データベースに以下のレコードが存在すること：
  - 複数トリガーセット（例：`tws1=["1girl", "solo"]`, `tws2=["landscape"]`）が登録されている LoRA
  - トリガーセットが未登録または空の LoRA
  - 任意のタグ（例：`["masterpiece", "best quality"]`）が含まれるタグセット
  - *補足：テスト用データベースが汚れている、あるいはデータが存在しない場合は、`db/prompt_surgeon.db` を削除した状態でバックエンドを再起動することで、自動データベース構築およびシードデータの再投入が行われます。*

## 2. 自動テスト & ツール主導検証 (CLI & Tool-Driven Audit)
- 変更後のアーティファクト整合性と構文チェックを実行します。
```bash
python ${GLOBAL_SCRIPTS}\artifact_linter.py docs/design
```
- 期待値: 出力レポートの `<status>` タグが `PASS` であること。

## 3. ブラウザ検証 (Browser Agent Verification)
- **対象URL**: `http://localhost:5173`

### 3.1 タグセットの追加および連動テスト (AC-1, AC-4, AC-5)
1. 画面で任意のワークフローを選択する。
2. プロンプト入力欄（例: `Prompt_Composition` 役割のコンテナ）の右上にあるアセット追加ボタン `button[id="add-asset-btn-Prompt_Composition"]` をクリックする。
3. ポップオーバーメニュー内の対象タグセット（名称: `TestTagSet`）の適用ボタンをクリックする。
4. **Assertion 1 (AC-1, AC-5)**:
   - 対象プロンプト入力欄に対応する `textarea` または `TagChipEditor` の値（`#prompt-Prompt_Composition`）をDOMクエリし、挿入されたすべてのタグ（`"masterpiece"`, `"best quality"`) がカンマ区切りまたは独立した `.tag-chip` 要素としてDOM上にレンダリングされていることを確認する。
   - `document.querySelectorAll('#prompt-Prompt_Composition .tag-chip')` の要素数が、挿入されたタグ数分増加していること。
5. **Assertion 2 (AC-4)**:
   - プロンプトエリア下部のアセットバッジコンテナ内に、アセット名 `TestTagSet` を含む要素が表示され、チェックボックスが `checked=true` であることを確認する。
6. バッジの「X」削除ボタン（クラス名等: `.applied-asset-remove` またはバッジ内の `button`）をクリックする。
7. **Assertion 3 (AC-5)**:
   - アセットバッジコンテナから `TestTagSet` のバッジが消滅していること。
   - プロンプト入力欄 `#prompt-Prompt_Composition` の中身（値）から、挿入されていたタグ `"masterpiece"`, `"best quality"` が文字列レベルで除去されていることを確認する。

### 3.2 LoRAトリガー選択モーダルおよび連動テスト (AC-2, AC-3, AC-6, AC-4)
1. アセット追加ボタン `button[id="add-asset-btn-Prompt_Composition"]` を再度クリックし、複数トリガーを持つLoRAモデル（名称: `TestLora`）をクリックする。
2. **Assertion 4 (AC-2)**:
   - トリガーセット選択モーダル（ID: `#lora-trigger-modal`）が画面上に表示されること。
   - モーダル内に、登録された各トリガーセットの選択肢（ラジオボタンまたはリスト項目）および強度調整用スライダー（ID: `#lora-strength-slider`）が表示されていること。
3. モーダル内で、トリガーセット（例: `"1girl, solo"`）を選択し、スライダーで強度を `0.8` に設定した上で、「適用」ボタン（ID: `#apply-lora-btn`）をクリックする。
4. **Assertion 5 (AC-3)**:
   - モーダルが閉じられ、プロンプト入力欄 `#prompt-Prompt_Composition` の中身に、トリガーワード `"1girl"`, `"solo"` および LoRA埋め込み文字列 `<lora:TestLora:0.8>` が追加されていることを確認する。
5. **Assertion 6 (AC-4)**:
   - プロンプト欄下部のアセットバッジコンテナ内に `LoRA: TestLora` を示すバッジが表示され、強度が `(0.8)` と表示されていることを確認する。
6. バッジの有効・無効切り替え用チェックボックスを `false` (チェックオフ) に切り替える。
7. **Assertion 7**:
   - プロンプト入力欄 `#prompt-Prompt_Composition` の中身から、トリガーワード `"1girl"`, `"solo"` および `<lora:TestLora:0.8>` が完全に除去されていることを確認する。
8. バッジのチェックボックスを再度 `true` (チェックオン) に切り替える。
9. **Assertion 8**:
   - プロンプト入力欄 `#prompt-Prompt_Composition` の中身に、トリガーワード `"1girl"`, `"solo"` および `<lora:TestLora:0.8>` が再び追加されていることを確認する。
10. トリガーセットが登録されていない空の LoRA を選択し、モーダル上で「トリガーワードなし（デフォルト）」を選択して適用する。
11. **Assertion 9 (AC-6)**:
    - プロンプト入力欄 `#prompt-Prompt_Composition` に、トリガーワードを含まず `<lora:空のLoRA名:1.0>` のみが追加されていることを確認する。
