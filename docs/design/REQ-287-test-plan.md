# REQ-287 実行可能テスト計画: TagSetModals & LoraModals の 1 コンポーネント 1 ファイル化と共通セレクター抽出

## 1. 自動テスト (CLI Verification)

- **共通セレクター単体テスト (CategorySelect)**:
  - コマンド: `cd frontend; npx vitest run src/components/common/__tests__/CategorySelect.test.tsx`
  - 対象:
    - 既存カテゴリ一覧のセレクトボックス描画と選択変更 (`onChange` 発火)
    - `__new__` 選択時のインライン作成入力フォームへの切替
    - 新規カテゴリ名の入力および追加ボタンクリック時の `apiCreateFn` 呼び出し、`onCategoryCreated` / `onChange` 通知
    - 空文字入力時のエラーメッセージ表示
    - キャンセルボタン押下時のセレクトボックス復帰
    - `accentClass` によるスタイル切り替え（紫色 [#7C6FDD] / 緑色 accent-green）
  - 期待値: 全テスト PASS。

- **共通セレクター単体テスト (BaseModelSelect)**:
  - コマンド: `cd frontend; npx vitest run src/components/common/__tests__/BaseModelSelect.test.tsx`
  - 対象:
    - ベースモデル一覧のチェックボックス描画
    - 選択中 ID（`selectedIds`）の一致による初期 checked 状態の反映
    - チェックボックス ON/OFF による `onChange`（ID 追加・削除配列）の正確な発火
    - ベースモデルが 0 件時の「No base models configured.」フォールバック表示
    - アクセントカラー設定（TagSet用 / LoRA用）の適用確認
  - 期待値: 全テスト PASS。

- **既存リグレッションテスト (TagSetModals)**:
  - コマンド: `cd frontend; npx vitest run src/components/__tests__/TagSetModals.test.tsx`
  - 対象:
    - `TagSetCreateModal` の入力、タグチップ編集、保存ボタン発火
    - `TagSetDetailModal` の閲覧、コピー、編集モードトグル、保存・削除
  - 期待値: 既存 5 テストすべて PASS。

- **既存リグレッションテスト (LoraModals)**:
  - コマンド: `cd frontend; npx vitest run src/components/__tests__/LoraModals.test.tsx`
  - 対象:
    - `LoraRegisterModal` の入力、カテゴリ選択、登録ボタン発火
    - `LoraDetailModal` の閲覧、トリガーワードコピー、編集モードトグル、保存・削除
  - 期待値: 既存 6 テストすべて PASS。

- **静的型検査 (Gate 1 Baseline)**:
  - コマンド: `cd frontend; npm run typecheck`
  - 対象: TypeScript `tsc -b --noEmit` による全コンポーネントおよびテストコードの型整合性
  - 期待値: エラー 0 件。

- **フロントエンド全自動テストスイート (Gate 2 Baseline)**:
  - コマンド: `cd frontend; npx vitest run`
  - 期待値: 失敗 0 件。

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

- **シナリオ 1: TagSet 新規作成と共通セレクター連携 (AC-1)**:
  1. `TagsPage` で「New Tag Set」ボタンをクリックし、`TagSetCreateModal` を開く。
  2. `CategorySelect` からカテゴリを選択、または「+ 新規カテゴリを追加」で新カテゴリを入力・登録して選択状態にする。
  3. `BaseModelSelect` で対象のベースモデル（SDXL等）をチェックする。
  4. タグ入力欄にタグを入力し、Create ボタンを押下する。
  5. API 登録が正常に呼び出され、一覧に反映されることを確認。

- **シナリオ 2: TagSet 詳細・編集モードとスナップショット紐付け (AC-1)**:
  1. タグセットカードをクリックして `TagSetDetailModal` を開く。
  2. `TagChipViewer` でタグが閲覧専用表示されていることを確認。
  3. 「Edit」ボタンをクリックして編集モードに切り替える。
  4. 共通セレクター（カテゴリ、BaseModel）およびフォームフィールドを編集し、保存する。
  5. 詳細画面および一覧に更新内容が反映されることを確認。

- **シナリオ 3: LoRA 新規登録と共通セレクター連携 (AC-1)**:
  1. `LoRAsPage` で「Register Model」ボタンをクリックし、`LoraRegisterModal` を開く。
  2. モデル名を入力（ComfyUI ドロップダウンからの自動選択を含む）。
  3. `CategorySelect` および `BaseModelSelect` で設定を行う。
  4. トリガーワードセットを入力し、Register ボタンを押下する。
  5. 登録完了し、一覧に LoRA カードが表示されることを確認。

- **シナリオ 4: LoRA 詳細・コピー・編集 (AC-1)**:
  1. LoRA カードをクリックして `LoraDetailModal` を開く。
  2. トリガーワードのコピーボタンをクリックし、クリップボードにコピーされることを確認。
  3. 「Edit」ボタンをクリックして編集モードに入り、推奨強度や BaseModel チェックを変更して保存する。
  4. 正しく更新内容が反映されることを確認。

---

## 3. Red Teaming (境界値・異常系)

- **異常系 1: カテゴリインライン作成のバリデーション**:
  - 手順: `CategorySelect` で「+ 新規カテゴリを追加」を選択後、何も入力せずに（空白のみで）追加ボタンをクリックまたは Enter キーを押す。
  - 期待値: 「カテゴリ名を入力してください」というエラーメッセージが表示され、API 送信は実行されないこと。

- **異常系 2: カテゴリインライン作成の API 障害ハンドリング**:
  - 手順: `apiCreateFn` が Reject される状況（ネットワーク切断・500エラー相当）をモックし、追加を実行。
  - 期待値: ローディング状態（スピナー）が解除され、エラーメッセージが表示されること。入力途中の文字列は消失せず残ること。

- **境界値 3: BaseModels が 0 件の場合のフォールバック表示**:
  - 手順: `BaseModelSelect` に渡される `baseModels` が空配列 `[]` の状態を検証。
  - 期待値: エラーとならず、「No base models configured.」のプレースホルダーが表示され、UI レイアウトが崩れないこと。

- **境界値 4: Target Base Models の全選択および全解除**:
  - 手順: 複数のベースモデルをすべてチェックした状態から、順次すべてチェックを外して 0 件にする。
  - 期待値: `onChange` に空配列 `[]` が正確に伝達され、フォームステートの `target_base_model_ids` が空配列として維持されること（undefined やクラッシュが発生しないこと）。

- **境界値 5: モーダル Backdrop クリック・閉じる操作の非干渉**:
  - 手順: 入力中の状態でモーダル右上の「×」ボタンまたは Backdrop をクリックしてモーダルを閉じる。
  - 期待値: `onClose` が正常に呼び出され、未保存のデータが安全に破棄され、親画面が正常に復帰すること。

---

## 4. ツール主導監査 (Tool-Driven Audit)

- **ビジネスアナリスト監査 (BA Audit)**:
  - コマンド: `python C:\Users\audih\.gemini\antigravity\scripts\local_model_adapter.py ba-audit`
  - 監査対象: REQ-287 の要件網羅性、1コンポーネント1ファイル化の粒度、下位互換性。

