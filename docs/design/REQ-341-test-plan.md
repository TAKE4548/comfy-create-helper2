# REQ-341 実行可能テスト計画 (Test Plan)

## 1. 自動テスト Baseline 検証 (CLI Verification)

### Gate 1: 静的型チェック (Typecheck Baseline)
- **コマンド**: cd frontend; npm run typecheck
- **期待値**: TypeScript エラー 0 件 (Exit code 0)

### Gate 2: ユニット＆結合テスト (Unit / Full Suite Baseline)
- **コマンド**: cd frontend; npm test
- **個別実行コマンド**:
  - cd frontend; npx vitest run src/components/common/__tests__/SystemStatusBadge.test.tsx
  - cd frontend; npx vitest run src/components/common/header/__tests__/ResourceHoverMonitor.test.tsx
  - cd frontend; npx vitest run src/components/common/header/__tests__/HeaderKebabMenu.test.tsx
  - cd frontend; npx vitest run src/components/common/__tests__/PageHeader.test.tsx
  - cd frontend; npx vitest run src/pages/GeneratePage/components/__tests__/WorkflowActionsMenu.test.tsx
  - cd frontend; npx vitest run src/test/e2e_req341_header_unification.test.tsx
- **期待値**: 全テスト PASS (Exit code 0)。

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### シナリオ 1: 全6画面の共通50pxヘッダー描画・画面遷移CLSゼロ検証 (AC-1)
- **手順**:
  1. / (Generate), /studio, /loras, /tags, /history, /settings の各画面をマウント。
  2. デスクトップビューポート (width: 1280px) においてヘッダー要素の高さを確認。
- **期待値**:
  - 各画面のヘッダー要素が h-[50px] (または実測 50px) で描画され、共通のタイポグラフィクラス (	ext-sm font-semibold text-zinc-200) およびアイコン (	ext-zinc-400, 16px) が適用されていること。
  - 画面遷移時にヘッダー構造の相違によるレイアウトシフトが発生しないこと。

### シナリオ 2: 左クラスタリング主要操作の配置・動作検証 (AC-2)
- **手順**: 各画面のヘッダー左クラスタ領域を検証。
- **期待値**:
  - Generate: タイトル直後にワークフロー選択、[⋯]メニュー、Animaトグル、Undo/Redoが配置されていること。
  - Studio: タイトル直後にプロジェクト選択、マトリクス/キュレーター/学習設定/評価切替ボタングループが配置されていること。
  - LoRAs: タイトル直後に検索ボックス、+ Register Model、再スキャン、件数バッジが配置されていること。
  - Tags: タイトル直後に検索ボックス、+ New Tag Set、エクスポート/インポート、件数バッジが配置されていること。
  - History: タイトル直後にスナップ/アルバム切替、セリフ変換、アルバム追加が配置されていること。
  - Settings: タイトル直後に設定タブチップ群が配置されていること。

### シナリオ 3: スリム状態バッジ & ホバーツールチップ検証 (AC-3)
- **手順**:
  1. 通常稼働時の状態バッジを確認。
  2. バッジにホバー操作を実行。
- **期待値**:
  - デフォルト表示では冗長テキスト FE 200 · BE 200 · Comfy が表示されず、スリムな [● READY] のみ表示されること。
  - ホバー時に詳細ツールチップ（FE 200 · BE 200 · Comfy (FastAPI中継 OK)）が展開されること。

### シナリオ 4: 受動的リソースモニター & ホバーカード展開検証 (AC-4)
- **手順**:
  1. ヘッダー右端のリソースチップの表示順序を確認。
  2. チップ領域にマウスホバーを実行。
- **期待値**:
  - 通常時は CPU -> RAM -> GPU -> VRAM の順序でパーセンテージが表示されること（VRAMはパープルアクセント）。
  - ホバー時に 250px 幅の Hover Card が展開され、m / n GB の実容量（VRAM, RAM）とプロポーショナルバーが表示されること。

### シナリオ 5: 縦3点メニュー & ストレージ推定値 & ComfyUI直通URL完全撤廃検証 (AC-5)
- **手順**:
  1. ヘッダー最右端の縦3点ボタン (⋮) をクリック。
  2. 270px 幅のドロップダウンの内容を確認。
- **期待値**:
  - LocalStorage / SessionStorage の UTF-16 概算容量が「推定値 (Estimate Only)」表記で表示されること。
  - キャッシュ再同期ボタンおよび設定画面 (/settings) リンクが表示されること。
  - 旧ヘッダーに存在した「ComfyUI 本体 URL」の入力欄およびテキスト表示が一切存在しないこと。

### シナリオ 6: Generate画面 ワークフロー個別設定 [⋯] 集約検証 (AC-6)
- **手順**: ワークフローセレクタ直横の [⋯] ボタンをクリック。
- **期待値**:
  - ドロップダウンに「ベースモデル紐付け (Auto/Anima/SDXL)」「デフォルト保存」「リセット」「名前を変更」「複製」「ノード再スキャン」が表示され、それぞれのアクションがトリガーできること。

### シナリオ 7: モバイル2段レイアウト & 7px発光ドット検証 (AC-7)
- **手順**: ビューポート幅を 390px (モバイル) に変更。
- **期待値**:
  - 1段目: タイトル (省略記号つき)、7px緑発光ドット (テキストなし)、VRAMピル、縦3点メニューが配置されること。
  - 2段目: 画面固有のアクション群が横スクロール可能バー (overflow-x: auto) として配置されること。

### シナリオ 8: モバイルVRAMピル左スライド展開オーバーレイ検証 (AC-8)
- **手順**:
  1. モバイル1段目の [VRAM xx% ◀] (幅96px) をタップ。
  2. 展開状態を確認。
  3. ✕ボタン、ピル再タップ、または外側をクリック。
- **期待値**:
  - ピルが右隣の縦3点ボタンの上に覆いかぶさりながら (z-index: 80 vs 10)、幅 330px に伸長すること。
  - 展開内部に CPU xx% | RAM xxG | GPU xx% | VRAM xxG | ✕ が表示されること。
  - 閉じる操作で幅 96px に縮小復帰し、縦3点ボタンが再露出してクリック可能になること。

---

## 3. Red Teaming (境界値・異常系シナリオ) [Gate 3 Baseline]

### RT-1: テレメトリ未受信・接続断・Null値時のフォールバック耐久性
- **手順**: systemStats が 
ull、または ram_pct, gpu_pct, 
am_used_gb 等が 
ull や未定義の状態でリソースモニターを描画。
- **期待値**:
  - チップに --% が表示され、Hover Card にも安全なプレースホルダーが表示されること。
  - コンポーネントがクラッシュせず、レイアウトシフトや崩れが発生しないこと。

### RT-2: ストレージアクセス拒否・プライベートブラウジング環境 (SecurityError)
- **手順**: window.localStorage または window.sessionStorage へのアクセス時に例外 (SecurityError / QuotaExceededError) がスローされる環境をモック。
- **期待値**:
  - 例外がキャッチされ、縦3点メニュー内に「推定容量: 取得不可」等の安全なフォールバックテキストが表示されること。
  - アプリケーションが白画面にならず、他のメニュー項目が正常に動作すること。

### RT-3: モバイル極小幅 (320px) でのタイトル長文オーバーフロー耐久性
- **手順**: 画面幅 320px において極端に長いページタイトルを設定。
- **期待値**:
  - タイトルが white-space: nowrap; overflow: hidden; text-overflow: ellipsis; で正しく省略され、右側の VRAM ピルや縦3点ボタンを画面外へ押し出さないこと。

### RT-4: モバイルオーバーレイ展開中の連打・同時操作競合耐久性
- **手順**: VRAM ピルを高速に連続タップ、または展開アニメーション中に外側タップを実施。
- **期待値**:
  - アニメーション状態フラグが不整合にならず、最終的に展開または格納のいずれかの整合した状態に収束すること。
  - 縦3点ボタンが非表示のまま操作不能になるデッドロックが発生しないこと。

---

## 4. ツール主導監査 (Tool-Driven Audit)
- **コマンド**: python /local_model_adapter.py ba-audit
- **アンロード**: python /local_model_adapter.py unload
