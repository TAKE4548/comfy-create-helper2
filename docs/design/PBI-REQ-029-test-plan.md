# PBI-REQ-029 実行可能テスト計画 (QA Audit 適用済)

## 1. 静的検証・ビルド (Static Verification & Build)
- **ビルドコマンド**:
  ```bash
  cd frontend
  npm run build
  ```
- **期待値 (Assertion)**:
  1. コマンドがエラーコード 0 で正常終了すること。
  2. `dist/index.html` が存在し、ファイルサイズが 0 バイトより大きいこと。
  3. `dist/assets/` ディレクトリが存在し、中に `.js` および `.css` ファイルが書き出されていること（ビルド空振りの防止）。

## 2. ブラウザ・DOM 検証項目 (Machine-Runnable DOM Verification)
AI エージェント（Browser Agent）またはテスト実行者は、以下の手順を DOM セレクタおよび属性値に基づいて厳密に検証すること。脳内推論での完了報告は禁止する。

### 検証項目 1: ポップオーバー設定メニュー (AC-1)
1. ワークフロー選択の右隣に配置されたギアボタン `[id="workflow-settings-trigger"]` をクリックする。
2. **検証**: ポップオーバー `[id="workflow-settings-popover"]` が表示され（DOM上に出現し、非表示属性がないこと）、内部に ComfyUI URL 入力フィールド `[id="settings-comfy-url-input"]` が表示されること。
3. `[id="settings-comfy-url-input"]` に `http://invalid.url` を入力してフォーカスアウトまたは適用する。
4. **検証**: WebSocket 接続ステータス表示（`[id="connection-indicator"]` 等）のクラスが変更され、背景色がエメラルドグリーンからグレー（`bg-zinc-600`）へ変化すること。
5. URL を元の `http://localhost:8188` に戻し、再びオンライン（`bg-accent-green`）になることを確認する。

### 検証項目 2: 非ブロッキングプログレスバー (AC-2)
1. 「Generate Batch」 `[id="generate-btn"]`（またはモバイル用 `[id="generate-btn-mobile"]`）をクリックする。
2. **検証**: メインプレビュー領域に画面全体を覆うブロッキング用のローディング表示（`isGenerating` 判定による巨大なインジケータ）が出現しないこと。
3. **検証**: プレビュー画像またはプレースホルダーが表示された状態で、プレビューコンテナの底面にプログレスバー `[id="generation-progress-bar"]` が出現し、進捗率に合わせて幅（CSS `width: x%`）が変化すること。

### 検証項目 3: スナップショットのビジュアル選択 (AC-3)
1. 履歴エリア上部のタブから「Snapshots」ボタン `[id="tab-snapshots-trigger"]` をクリックする。
2. **検証**: スナップショットタブ `[id="snapshots-tab-content"]` がアクティブ状態（クラス `data-state="active"` 等）になり、登録済みのスナップショットカードが画像サムネイル `img[src*="view"]` またはプレースホルダーを伴って一覧表示されること。
3. 任意のスナップショットカード `[id^="snapshot-card-"]` をクリックする。
4. **検証**: 対象スナップショットの Seed やプロンプト値が画面の入力フィールドに適用されること。

### 検証項目 4: 保存アイコンのカメラ化 (AC-4)
1. 保存ボタン `[id="save-snapshot-btn"]` および `[id="save-snapshot-btn-mobile"]` を検出する。
2. **検証**: ボタン内の SVG 要素が Lucide `Camera` アイコン（クラス名または SVG パスが `Camera` 固有のもの）であることを確認する。

### 検証項目 5: メインプレビューのサイズ調整と装飾 (AC-5)
1. メインプレビューの画像要素（またはそのラッパー要素 `[id="main-preview-wrapper"]`）のスタイルを確認する。
2. **検証**: 画像の表示サイズが親コンテナに対して最大 `h-[70%] w-[70%]` 前後に制限され、中央に余白を持って配置されていること。
3. **検証**: ラッパーに枠線（`border-zinc-800` または `border`）と影（`shadow-2xl` または `shadow-black`）が適用されていること。

### 検証項目 6: ホバー左右切り替えボタン (AC-6)
1. メインプレビュー領域 `[id="main-preview-container"]` に `mouseenter` イベントをシミュレート（ホバー）する。
2. **検証**: 左右の切り替えアローボタン `[id="prev-img-btn"]` および `[id="next-img-btn"]` が表示状態になること。
3. アローボタンをクリックし、メインプレビューの画像 `src` が履歴配列の別画像URLへ遷移することを確認する。

### 検証項目 7: キーボード操作 (AC-7)
1. メインプレビュー領域 `[id="main-preview-container"]` をクリックしてフォーカスを与える。
2. キーボードの左矢印キー (`ArrowLeft`) および右矢印キー (`ArrowRight`) を押下する。
3. **検証**: 表示画像が履歴画像に切り替わること。
4. プロンプトテキストエリア `[id^="prompt-"]` をフォーカスした状態で矢印キーを押下する。
5. **検証**: 画像切り替えは発生せず、テキストエリア内でのカーソル移動のみが動作すること（イベントのバブリングが適切に防止、またはフォーカス先判定が行われていること）。
