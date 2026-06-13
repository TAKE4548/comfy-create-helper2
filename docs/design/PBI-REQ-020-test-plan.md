# テスト計画書 - REQ-020: プロンプト入力欄の個別折り畳み・展開機能 (自動検証対応版)

## 1. テスト概要
本テスト計画では、各プロンプト枠の個別折り畳み・展開操作、localStorageを用いた状態永続化とリロード時の復元、およびアセット追加やテキストモード切替に伴う自動展開が正しく機能することを、DOM構造やlocalStorageの値などの客観的データに基づいて検証します。

## 2. 検証項目と実行手順

### 2.1 個別折り畳み・展開機能 (UIインタラクション)
1. **初期状態の検証**:
   - **手順**: 画面ロード後、正負のプロンプト欄が展開された状態であることを確認する。
   - **期待される状態**:
     - `positive_prompt` および `negative_prompt` の入力エリア (DOM ID: `prompt-positive_prompt`, `prompt-negative_prompt`) が存在し、表示されていること。
   - **検証コード**:
     ```javascript
     const pos = document.getElementById('prompt-positive_prompt');
     const neg = document.getElementById('prompt-negative_prompt');
     console.assert(pos !== null && pos.getBoundingClientRect().height > 0, 'Positive prompt is not visible');
     console.assert(neg !== null && neg.getBoundingClientRect().height > 0, 'Negative prompt is not visible');
     ```

2. **折り畳み・展開トグル操作の検証**:
   - **手順**: `positive_prompt` の折り畳みトグルボタン (DOM ID: `prompt-header-toggle-positive_prompt`) をクリックする。
   - **期待される状態**:
     - トグルボタン内の Chevron アイコンが変更されること。
     - 入力エリア (DOM ID: `prompt-positive_prompt`) および `Add Asset` ボタン (DOM ID: `add-asset-btn-positive_prompt`) が非表示 (`display: none` または DOMから削除) になること。
   - **検証コード**:
     ```javascript
     const toggleBtn = document.getElementById('prompt-header-toggle-positive_prompt');
     toggleBtn.click();
     // 折り畳み後の検証
     const editor = document.getElementById('prompt-positive_prompt');
     console.assert(!editor || editor.getBoundingClientRect().height === 0, 'Editor should be collapsed');
     ```

3. **データ保持確認の検証**:
   - **手順**: 展開状態で入力エリアに適当なテキスト (例: `"masterpiece, 1girl"`) を入力し、一旦折り畳み、再度展開する。
   - **期待される状態**:
     - 再展開後、入力した値が保持されており、変更されていないこと。
   - **検証コード**:
     ```javascript
     const editor = document.getElementById('prompt-positive_prompt');
     // 再展開して値の保持を確認
     document.getElementById('prompt-header-toggle-positive_prompt').click();
     const val = document.querySelector('#prompt-positive_prompt textarea')?.value || document.querySelector('#prompt-positive_prompt')?.value;
     console.assert(val.includes('masterpiece'), 'Text content was lost');
     ```

### 2.2 状態の永続化 (localStorage)
1. **状態保存の検証**:
   - **手順**: `positive_prompt` を折り畳んだ状態にする。
   - **期待される状態**:
     - `window.localStorage` に `prompt-surgeon-collapsed-positive_prompt` が `"true"` として保存されていること。
   - **検証コード**:
     ```javascript
     const val = localStorage.getItem('prompt-surgeon-collapsed-positive_prompt');
     console.assert(val === 'true', 'localStorage failed to persist true state');
     ```

2. **リロード時の復元検証**:
   - **手順**: `positive_prompt` が折り畳まれた状態でページをリロードする。
   - **期待される状態**:
     - リロード後も初期状態として `positive_prompt` が折り畳まれており、入力エリアが表示されていないこと。
   - **検証コード**:
     ```javascript
     const editor = document.getElementById('prompt-positive_prompt');
     console.assert(!editor || editor.getBoundingClientRect().height === 0, 'Should load as collapsed on reload');
     ```

### 2.3 自動展開トリガー
1. **アセット追加 (Add Asset) 時の自動展開検証**:
   - **手順**: `positive_prompt` を折り畳んだ状態にする。`Add Asset` ボタンをクリックして任意のアセットを追加する。
   - **期待される状態**:
     - アセット追加後、自動的にセクションが展開され、追加されたアセットチップが存在すること。
     - `localStorage` の値が `"false"` に更新されていること。
   - **検証コード**:
     ```javascript
     const editor = document.getElementById('prompt-positive_prompt');
     console.assert(editor && editor.getBoundingClientRect().height > 0, 'Section should automatically expand on asset addition');
     console.assert(localStorage.getItem('prompt-surgeon-collapsed-positive_prompt') === 'false', 'localStorage should update to false');
     ```

2. **テキスト入力モード切替時の自動展開検証**:
   - **手順**: `positive_prompt` を折り畳んだ状態にする。「テキスト入力モード切替」をトリガーする。
   - **期待される状態**:
     - 自動的にセクションが展開されること。
   - **検証コード**:
     ```javascript
     const editor = document.getElementById('prompt-positive_prompt');
     console.assert(editor && editor.getBoundingClientRect().height > 0, 'Section should expand on text mode toggle');
     ```
