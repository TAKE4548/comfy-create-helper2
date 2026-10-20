# REQ-377 実行可能テスト計画

## 1. 自動テスト Baseline 検証 (CLI Verification)

### Gate 1: 静的型チェック (Typecheck Baseline)
- **コマンド**: `npm --prefix frontend run typecheck`
- **期待値**: 型エラー 0 件 (Exit code 0)

### Gate 2: ユニット＆結合テスト (Unit / Full Suite Baseline)
- **コマンド**: `npm --prefix frontend test -- --run`
- **期待値**: 全テストスイート PASS (Exit code 0)。脳内推論代用は厳禁。

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### 2.1 テスト配置規約 (Test Placement Plan) [MUST [W-DD-PLACE]]
チケット番号（`REQ-377`）を含むテストファイルの新設は厳禁とする。既存のコロケーションテストスイートを拡張し、各テストケース名に `[REQ-377/AC-n]` タグを明記する：

| 対象 AC | 拡張対象既存テストファイル | テストケース識別子 | 検証実行コマンド |
|---|---|---|---|
| **AC-9, AC-10** | `frontend/src/components/TagSetModals/__tests__/TagSetFormFields.test.tsx` | `[REQ-377/AC-9][REQ-377/AC-10]` Subsets scroll integration without independent overflow | `npm --prefix frontend test -- src/components/TagSetModals/__tests__/TagSetFormFields.test.tsx -t "REQ-377/AC-9" --run` |
| **AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7, AC-12, AC-13, AC-14** | `frontend/src/components/__tests__/TagSetModals.test.tsx` | `[REQ-377/AC-1]`〜`[REQ-377/AC-14]` TagSetDetailModal mobile bottom sheet, fixed footer, compact cover, gallery subview, and baseline preservation | `npm --prefix frontend test -- src/components/__tests__/TagSetModals.test.tsx -t "REQ-377" --run` |
| **AC-8** | `frontend/src/pages/__tests__/TagsPage.test.tsx` | `[REQ-377/AC-8]` Card edit button and detail edit button open identical TagSetDetailModal edit state | `npm --prefix frontend test -- src/pages/__tests__/TagsPage.test.tsx -t "REQ-377/AC-8" --run` |
| **AC-1, AC-2, AC-3, AC-5, AC-6, AC-7, AC-11, AC-13, AC-14** | `frontend/src/components/LoraModals/__tests__/LoraDetailModal.test.tsx` | `[REQ-377/AC-1]`〜`[REQ-377/AC-14]` LoraDetailModal mobile sheet, fixed footer, compact cover, gallery subview, strength validation, and desktop preservation | `npm --prefix frontend test -- src/components/LoraModals/__tests__/LoraDetailModal.test.tsx -t "REQ-377" --run` |
| **AC-4** | `frontend/src/components/__tests__/LoraModals.test.tsx` | `[REQ-377/AC-4]` Lora modals safe-area and fixed footer keyboard responsiveness | `npm --prefix frontend test -- src/components/__tests__/LoraModals.test.tsx -t "REQ-377/AC-4" --run` |

---

### 2.2 受入基準別検証シナリオ (AC-1 〜 AC-14)

#### シナリオ 1 (AC-1, AC-2): モバイルボトムシート構造と閲覧時固定フッター
- **事前条件**: ビューポート幅 767px 以下、LoRA または Tag Set の詳細を開く。
- **検証手順**:
  1. モーダルが `modal-backdrop items-end` かつ `rounded-t-2xl` のボトムシートとして下端から開くことを確認する。
  2. 上端にドラッグハンドルバー (`aria-hidden="true"`)、固定ヘッダーが存在することを確認する。
  3. フッターが本文外に固定され、左に `Close`、右に `Edit` が表示されることを確認する。
  4. 本文をスクロールしてもフッターが動かず、常時クリック可能であることを確認する。

#### シナリオ 2 (AC-3, AC-4): 編集時固定フッター・状態表示・仮想キーボード
- **事前条件**: 詳細モーダルで Edit を押して編集モードに移行する。
- **検証手順**:
  1. フッターが左 `Cancel`、右 `Save` に切り替わることを確認する。
  2. 必須入力（名前など）が空または無効（LoRA 強度 min > max）の場合、Save ボタンが `disabled` かつエラーメッセージが表示されることを確認する。
  3. 保存処理中（`isPending = true`）に Save ボタンが `disabled` で「Saving…」と表示されることを確認する。
  4. フッターにセーフエリアパディング `pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]` が適用されていることを確認する。

#### シナリオ 3 (AC-5, AC-6): 小型 Cover プレビューと画像ギャラリーサブビュー導線
- **事前条件**: スナップショット画像を持つ LoRA / Tag Set の詳細を開く。
- **検証手順**:
  1. 本文上部に巨大画像ではなく、小型 Cover サムネイルと「Related Snapshots (N)」が表示されていることを確認する。
  2. 小型 Cover をタップすると、同一モーダル内で画像ギャラリーサブビュー（スナップショット全件一覧・拡大表示）へ切り替わることを確認する。
  3. 編集モードで別画像を「Set as Cover」に選択し、Cancel を押して閉じた場合、元の Cover 画像が維持される（取消整合性）ことを確認する。
  4. Save を押した場合にのみ新しい Cover が永続化されることを確認する。

#### シナリオ 4 (AC-7): 空画像・エラー・異形アスペクト比の破綻防止
- **事前条件**: 画像なし、スナップショット 0 件、読込失敗、縦長・横長画像。
- **検証手順**:
  1. `thumbnail_path: undefined` かつ `snapshot_paths: []` の場合、「No Cover」プレースホルダーが表示され、レイアウト崩れが発生しないことを確認する。
  2. 画像 URL が不正またはロード失敗時でも、テキストやボタンが押し出されず正常に操作可能であることを確認する。

#### シナリオ 5 (AC-8): Tag Set 編集入口の一元化
- **事前条件**: `TagsPage` でタグセットカードを表示。
- **検証手順**:
  1. カード右上の編集アイコン (`#tagset-edit-${id}`) をクリックした際、`TagSetDetailModal` が編集モード（`initialEditing: true`）で開くことを確認する。
  2. カードクリックで開いた詳細モーダル内の `Edit` ボタンをクリックした際と、同一のコンポーネント・同一フォームフィールド・同一固定フッター（Cancel/Save）が開くことを確認する。
  3. 異なる別モーダル（レガシーな `TagSetEditModal`）へ分岐しないことを確認する。

#### シナリオ 6 (AC-9, AC-10): Subsets 独立スクロール撤廃と親コンテナ統合
- **事前条件**: 多数（5 件以上）の Subsets を持つ Tag Set の編集画面および新規作成画面を開く。
- **検証手順**:
  1. Subsets 一覧コンテナに `max-h-[160px]` や `overflow-y-auto` が存在せず、全件が自然に縦展開されることを確認する。
  2. モーダル本文（親コンテナ）のスクロールバーのみで全体をスムーズにスクロールできることを確認する。
  3. `TagSetCreateModal`（新規作成）でも同様に親モーダルスクロールに統合されていることを確認する。

#### シナリオ 7 (AC-11, AC-12, AC-13, AC-14): 既存機能維持・アクセシビリティ・デスクトップ維持
- **事前条件**: キーボード操作 (Tab, Escape)、スクリーンリーダー、デスクトップ幅 (768px 以上)。
- **検証手順**:
  1. Escape キーまたは背景タップでモーダルが閉じ、閉じた後にトリガー要素へフォーカスが戻ることを確認する (AC-13)。
  2. LoRA のトリガーワードセットコピー、推奨強度編集、ファイルパス、対象モデル選択が正常に動作すること (AC-11)。
  3. Tag Set の名前、説明、メインタグ、サブセット編集・画像追加・削除が正常に動作すること (AC-12)。
  4. デスクトップ表示（幅 768px 以上）において、左右 2 列レイアウト (`md:grid-cols-2`) とプレビューが改修前と同一に維持されていること (AC-14)。

---

## 3. Red Teaming (境界値・異常系シナリオ) [Gate 3 Baseline]

### 3.1 Fault Injection 1: 極端な長文テキストおよび英単語突き抜け
- **入力**: 200 文字以上のスペースを含まない LoRA モデル名・ファイルパス、または 500 文字以上の Description。
- **期待結果**: `break-all` または `break-words` により横スクロールやモーダル外枠突き抜けを起こさず、適切に折り返されること。

### 3.2 Fault Injection 2: LoRA 推奨強度の逆転不正値 (min > max)
- **入力**: `recommended_strength_min = 1.2`, `recommended_strength_max = 0.8`
- **期待結果**: アラートメッセージ `MinはMax以下にしてください` が表示され、Save ボタンが非活性化されて保存 API が呼び出されないこと。

### 3.3 Fault Injection 3: 画像ギャラリー内の編集取消時の完全復元
- **入力**: 画像ギャラリーで別のスナップショットを Cover に選択後、詳細シートに戻り `Cancel` をクリック。
- **期待結果**: `form.thumbnail_path` が元の Cover に復元され、再オープン時にも変更前のサムネイルが表示されること。

---

## 4. ツール主導監査 (Tool-Driven Audit)
- **コマンド**:
  ```bash
  python ${GLOBAL_HELPERS}\local_model_adapter.py --context-length 32768 ba-audit --audit-kind design --audit-package "<PKG_JSON>" docs/design/REQ-377.md docs/design/REQ-377-test-plan.md docs/backlog/task/active/REQ-377-T1.md docs/backlog/task/active/REQ-377-T2.md docs/backlog/task/active/REQ-377-T3.md docs/backlog/task/active/REQ-377-T4.md
  ```
- **実行権限**: LM Studio localhost/API と `lms` CLI を使用。
- **アンロード**:
  ```bash
  python ${GLOBAL_HELPERS}\local_model_adapter.py unload
  ```

