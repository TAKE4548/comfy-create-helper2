# REQ-372 実行可能テスト計画 (Executable Test Plan)

- **Target PBI**: REQ-372
- **Title**: モバイルGenerate：常駐プレビューを廃止し、履歴グリッド・画像シート・全画面ビューアで画像を確認できるようにする
- **Design SSoT**: `docs/design/REQ-372.md`
- **Baseline Framework**: 3-Gate Baseline Architecture (`.agents/context.md`)

---

## 1. 自動テスト Baseline 検証 (CLI Verification)

### Gate 1: 静的型チェック & 高速ユニットテスト (Fast Unit & Invariants / 3〜5秒)
- **UI Invariant Check**:
  ```bash
  backend\.venv\Scripts\python scripts/verify_ui_invariants.py
  ```
- **Test Naming & Governance Check**:
  ```bash
  backend\.venv\Scripts\python scripts/verify_test_naming.py
  ```
- **Frontend Typecheck**:
  ```bash
  cd frontend; npm run typecheck
  ```
- **Targeted Unit Tests**:
  ```bash
  cd frontend; npx vitest run src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx src/pages/GeneratePage/sections/__tests__/GenerationGallerySection.cache.test.tsx src/pages/GeneratePage/components/__tests__/MobileImageSheet.test.tsx
  ```
- **判定基準**: 型エラー0件、不変条件違反0件、ユニットテスト全PASS (Exit code 0)。

### Gate 2: フルスイート統合テスト (Full Integration Suite / ~30秒)
- **Frontend Full Suite**:
  ```bash
  cd frontend; npm test
  ```
- **Backend Full Suite**:
  ```bash
  backend\.venv\Scripts\python -m pytest
  ```
- **判定基準**: フロントエンド・バックエンド全テスト PASS (Exit code 0)。

### Gate 3: 実ブラウザ E2E 検証 (Playwright Browser Verification / ~1.2秒)
- **Playwright Mobile E2E Test**:
  ```bash
  cd frontend; npx playwright test generateMobileGallery.spec.ts
  ```
- **判定基準**: 実ブラウザ環境でモバイルビュー（375px）の画像確認導線およびデスクトップビュー（1280px）の非退行が全PASS。

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### 2.1 テスト配置 (Test Placement) [MUST [W-DD-PLACE]]
新規テストファイル名にチケット番号（`req372`, `REQ-372`）を含めることは禁止。既存コロケーションテストおよびレイヤーベーステストを拡張する。

| AC ID | 対象テストファイル | テストケース名タグ | 局所実行コマンド |
|:---|:---|:---|:---|
| **AC-1** | `frontend/src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx` | `[REQ-372/AC-1]` | `cd frontend; npx vitest run src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx -t "REQ-372/AC-1"` |
| **AC-2** | `frontend/src/pages/GeneratePage/sections/__tests__/GenerationGallerySection.cache.test.tsx` | `[REQ-372/AC-2]` | `cd frontend; npx vitest run src/pages/GeneratePage/sections/__tests__/GenerationGallerySection.cache.test.tsx -t "REQ-372/AC-2"` |
| **AC-3** | `frontend/src/pages/GeneratePage/components/__tests__/MobileImageSheet.test.tsx` | `[REQ-372/AC-3]` | `cd frontend; npx vitest run src/pages/GeneratePage/components/__tests__/MobileImageSheet.test.tsx -t "REQ-372/AC-3"` |
| **AC-4** | `frontend/src/pages/GeneratePage/components/__tests__/MobileImageSheet.test.tsx` | `[REQ-372/AC-4]` | `cd frontend; npx vitest run src/pages/GeneratePage/components/__tests__/MobileImageSheet.test.tsx -t "REQ-372/AC-4"` |
| **AC-5** | `frontend/src/pages/GeneratePage/components/__tests__/MobileImageSheet.test.tsx` | `[REQ-372/AC-5]` | `cd frontend; npx vitest run src/pages/GeneratePage/components/__tests__/MobileImageSheet.test.tsx -t "REQ-372/AC-5"` |
| **AC-6** | `frontend/src/pages/GeneratePage/components/__tests__/MobileImageSheet.test.tsx` | `[REQ-372/AC-6]` | `cd frontend; npx vitest run src/pages/GeneratePage/components/__tests__/MobileImageSheet.test.tsx -t "REQ-372/AC-6"` |
| **AC-7** | `frontend/src/pages/GeneratePage/sections/__tests__/GenerationGallerySection.cache.test.tsx` | `[REQ-372/AC-7]` | `cd frontend; npx vitest run src/pages/GeneratePage/sections/__tests__/GenerationGallerySection.cache.test.tsx -t "REQ-372/AC-7"` |
| **AC-8** | `frontend/src/pages/GeneratePage/components/__tests__/MobileImageSheet.test.tsx` | `[REQ-372/AC-8]` | `cd frontend; npx vitest run src/pages/GeneratePage/components/__tests__/MobileImageSheet.test.tsx -t "REQ-372/AC-8"` |
| **AC-9** | `frontend/src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx` | `[REQ-372/AC-9]` | `cd frontend; npx vitest run src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx -t "REQ-372/AC-9"` |
| **AC-10** | `frontend/src/pages/GeneratePage/sections/__tests__/GenerationGallerySection.cache.test.tsx` | `[REQ-372/AC-10]` | `cd frontend; npx vitest run src/pages/GeneratePage/sections/__tests__/GenerationGallerySection.cache.test.tsx -t "REQ-372/AC-10"` |
| **AC-11** | `frontend/src/pages/GeneratePage/components/__tests__/MobileImageSheet.test.tsx` | `[REQ-372/AC-11]` | `cd frontend; npx vitest run src/pages/GeneratePage/components/__tests__/MobileImageSheet.test.tsx -t "REQ-372/AC-11"` |
| **AC-12** | `frontend/src/pages/GeneratePage/components/__tests__/MobileImageSheet.test.tsx` | `[REQ-372/AC-12]` | `cd frontend; npx vitest run src/pages/GeneratePage/components/__tests__/MobileImageSheet.test.tsx -t "REQ-372/AC-12"` |
| **AC-13** | `frontend/src/pages/GeneratePage/components/__tests__/MobileImageSheet.test.tsx` | `[REQ-372/AC-13]` | `cd frontend; npx vitest run src/pages/GeneratePage/components/__tests__/MobileImageSheet.test.tsx -t "REQ-372/AC-13"` |
| **AC-14** | `frontend/src/pages/GeneratePage/components/__tests__/DesktopLayout.test.tsx` | `[REQ-372/AC-14]` | `cd frontend; npx vitest run src/pages/GeneratePage/components/__tests__/DesktopLayout.test.tsx -t "REQ-372/AC-14"` |

### 2.2 主要結合検証シナリオ (Integration Flows)

#### シナリオ 1: 3段階画像確認フロー（サムネイル → ボトムシート → 全画面ビューア → 復帰）
1. 画面幅 375px（モバイル表示）で Generate ページを表示する。
2. 常駐プレビュー領域が存在せず、プロンプトタブと入力エリアが最上部直下から配置されていることを確認（AC-1）。
3. 履歴セクションを開き、複数枚の画像が 3列の縦スクロールグリッド（正方形トリミング）で描画され、横スクロールレールが存在しないことを確認（AC-2）。
4. 任意のサムネイルをタップする。下端起点ボトムシート（`MobileImageSheet`）が開き、画像が元のアスペクト比（`object-contain`）で表示され、ヘッダーにタイトル・保存・DL・閉じるボタンが表示されることを確認（AC-3, AC-8）。
5. ボトムシート内の画像をタップする。背景が黒の全画面ビューアに切り替わり、シートヘッダー・ハンドル・フッターが非表示になり、右上にフローティング閉じるボタンのみが表示されることを確認。対応環境で `requestFullscreen` が実行されることを確認（AC-4）。
6. 全画面の画像をタップする、または右上の閉じるボタンを押下する。ボトムシートに戻り、Fullscreen表示が解除されることを確認（AC-5）。
7. ボトムシートの背景（Backdrop）をタップする、または閉じるボタンを押下する。ボトムシートが閉じ、履歴グリッドのスクロール位置が保持されていることを確認（AC-6）。

#### シナリオ 2: 生成中進捗と生成完了時の新画像到達フロー
1. モバイルGenerateで生成ジョブを実行する。
2. 上部固定ステータスヘッダーにノード進捗率、全体進捗、経過秒数、残りETA、キュー数がリアルタイムに更新表示されることを確認（AC-9）。
3. ジョブ完了直後、ステータスヘッダーに「生成完了 (タップして履歴で確認)」が表示される。
4. ステータス通知をタップすると、セグメントが自動的に「履歴」タブに切り替わり、自動追従（Auto-Follow）設定に従って最新の生成画像が表示・選択されることを確認（AC-8, AC-9）。

#### シナリオ 3: 複数選択モード保護フロー
1. 履歴セクションでサムネイルの1つを長押し（long press）する。
2. 複数選択モードに入り、上部に「1枚選択中」「すべて選択」「選択解除」「×終了」、下部に「選択した 1 枚を保存」が表示されることを確認（AC-10）。
3. 別のサムネイルを通常タップする。画像ボトムシートは起動せず、選択チェックボックスがトグルされ、「2枚選択中」に更新されることを確認（AC-10）。
4. 「選択した 2 枚を保存」をタップすると、既存のスナップショット一括保存ダイアログが正しく開くことを確認（AC-8, AC-10）。
5. 「×終了」をタップすると、選択モードが終了し通常タップでボトムシートが開く状態に戻ることを確認。

---

## 3. Red Teaming (境界値・異常系シナリオ) [Gate 3 Baseline]

### Red Team 1: Fullscreen API 非対応・拒否環境での 100dvh 全画面縮退 (AC-13)
- **テスト手順**:
  1. `Element.prototype.requestFullscreen` が未定義（iOS Safari環境等）、または `requestFullscreen()` が Promise reject される環境をシミュレート。
  2. ボトムシート内の画像をタップして全画面ビューアを起動する。
- **期待結果**:
  例外が捕捉され、コンソールエラーやUIフリーズを生じさせることなく、CSS `fixed inset-0 w-full h-[100dvh] z-50 bg-black` による全景表示に安全にフォールバックする。右上の閉じるボタンおよび画像タップによるシート復帰が完全に動作すること。

### Red Team 2: Screen Wake Lock API 非対応・拒否およびライフサイクル自動解除 (AC-12, AC-13)
- **テスト手順**:
  1. `navigator.wakeLock` が未定義、または `request('screen')` が reject（低バッテリーモード等）される環境をシミュレート。全画面ビューアを開いた際にエラーや操作不能が発生しないことを確認。
  2. `navigator.wakeLock` が有効な環境で全画面ビューアを開き、sentinel が取得されたことを確認。
  3. `document.dispatchEvent(new Event('visibilitychange'))` で `document.hidden = true`（アプリ最小化/タブ切り替え）を発生させる。
  4. 全画面ビューアを閉じてボトムシートに戻る。
- **期待結果**:
  バックグラウンド移行時およびシート復帰時の双方で `sentinel.release()` が確実に発火し、不必要なバッテリー消費が完全に防止されること。

### Red Team 3: 画像URL読み込み失敗時のフォールバックUI (AC-11)
- **テスト手順**:
  1. 破損した画像URL、またはネットワークエラー（404/500）で画像が読み込めないケースを用意する。
  2. サムネイルおよびボトムシート、全画面ビューアで表示を試みる。
- **期待結果**:
  サムネイルには「サムネイル再試行」ボタンが表示される。ボトムシートおよび全画面ビューアでは `ImageOff` アイコンと「画像の読み込みに失敗しました」が表示され、閉じるボタンで安全に元のグリッドへ戻れること。

### Red Team 4: 履歴0枚時の空状態表示 (AC-7)
- **テスト手順**:
  1. 履歴画像が0件の状態でモバイルGenerateを表示し、「履歴」セクションを開く。
- **期待結果**:
  「履歴はありません」の空状態表示が正しくレンダリングされ、ダミー画像やNaNエラー、存在しない画像のボトムシート起動が発生しないこと。

### Red Team 5: 360px狭幅およびセーフエリアの重なり防止 (AC-11)
- **テスト手順**:
  1. ビューポート幅 360px、上下セーフエリア（`safe-area-inset-top: 44px`, `safe-area-inset-bottom: 34px`）を設定。
  2. ボトムシートおよび全画面ビューアを表示。
- **期待結果**:
  全画面ビューアの右上閉じるボタンがノッチと重ならずタップ可能であること。ボトムシートの最下部余白がアドレスバーやホームインジケーターと重ならず、スクロールやボタンタップが阻害されないこと。

### Red Team 6: PC（768px以上）での常駐プレビュー維持と非退行 (AC-14)
- **テスト手順**:
  1. ビューポート幅 1024px / 1280px で Generate ページを表示する。
  2. 画面右側の常駐メインプレビュー（`GenerateParallelPreview`、ActionBar、HUD）が従来どおり表示されることを確認。
  3. サムネイルクリック時に従来の `HistoryModalPreview`（情報タブ、メタデータ編集付き）が開くことを確認。
- **期待結果**:
  PC環境において本改修による影響が皆無（100%非退行）であること。

---

## 4. ツール主導監査 (Tool-Driven Audit)

- **設計監査コマンド**:
  ```bash
  python ${GLOBAL_HELPERS}\local_model_adapter.py --context-length 32768 ba-audit --audit-kind design --audit-package "<PKG_JSON>" docs/design/REQ-372.md docs/design/REQ-372-test-plan.md docs/backlog/task/active/REQ-372-T1.md docs/backlog/task/active/REQ-372-T2.md docs/backlog/task/active/REQ-372-T3.md docs/backlog/task/active/REQ-372-T4.md docs/backlog/task/active/REQ-372-T5.md
  ```
- **VRAM解放**:
  ```bash
  python ${GLOBAL_HELPERS}\local_model_adapter.py unload
  ```