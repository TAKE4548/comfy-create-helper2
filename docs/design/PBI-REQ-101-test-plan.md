# REQ-101 自動テスト計画 (Machine-Readable)

## 1. 自動テスト (CLI Verification)
- **コマンド**: `npm run build` と `npm run lint` の順次実行。
- **判定ロジック**:
  - Exit Code が `0` でなければ失敗とする。
  - エラーメッセージに "Error" または "Failed" を含む場合は、エラー内容をログ出力して停止する。

## 2. ツール主導監査 (Tool-Driven Audit)
- **コマンド**: `python ${GLOBAL_SCRIPTS}\artifact_linter.py .`
- **判定ロジック**:
  - スクリプトの Exit Code が `0` の場合のみ「パス」と判定する。
  - Exit Code が非ゼロの場合、エラーメッセージを `.gemini/evidence_error.log` に保存し、テストを失敗とする。

## 3. ブラウザ検証 (Browser Agent Verification)
**環境設定**:
- 自動化ツール: Playwright (またはブラウザ開発者ツールコンソールでのJavaScript実行)
- ブラウザ幅: `800px` (モバイル表示検証) および `1280px` (PC表示検証)
- セーフエリアオフセット: `24px`

### 3.1 モーダルフッター配置とクリック検証 (モバイル: 800px)
- **ステップ A (操作 & 座標取得)**:
  1. 画面幅を `800px` に設定し、`http://localhost:5173/` を開く。
  2. 生成ページの「アセット追加」ボタン (`button[data-testid="add-asset-btn"]` または「アセット追加」テキストを含むボタン) をクリックしてモーダルを開く。
  3. ブラウザコンソールで以下のスクリプトを実行し、座標を取得する。
     ```javascript
     (() => {
       const nav = document.querySelector('nav');
       const modalBackdrop = document.querySelector('.modal-backdrop');
       const modalContent = modalBackdrop ? modalBackdrop.querySelector('div') : null;
       const cancelBtn = modalContent ? Array.from(modalContent.querySelectorAll('button')).find(b => b.textContent.includes('キャンセル')) : null;

       if (!nav) return { error: "Navigation element (nav) not found" };
       if (!modalBackdrop) return { error: "Modal backdrop (.modal-backdrop) not found" };
       if (!modalContent) return { error: "Modal content container not found" };
       if (!cancelBtn) return { error: "Cancel button in modal not found" };

       const navRect = nav.getBoundingClientRect();
       const modalRect = modalContent.getBoundingClientRect();
       const cancelRect = cancelBtn.getBoundingClientRect();

       return {
         nav_top_y: navRect.top,
         modal_bottom_y: modalRect.bottom,
         cancel_bottom_y: cancelRect.bottom,
         window_height: window.innerHeight
       };
     })()
     ```
- **ステップ B (判定ロジック)**:
  - コンソール実行結果が `error` を返した場合は、**即座に判定失敗 (FAIL)** とする。
  - 取得した値から以下の条件を検証する：
    1. **条件1 (重なり回避)**: モーダル下部およびフッターのボタンが、ボトムナビの上端より上にあること。
       - `cancel_bottom_y < nav_top_y`
    2. **条件2 (画面内表示)**: フッターのボタンが画面内に収まっており、ボトムナビの影に隠れていないこと。
       - `cancel_bottom_y < (window_height - 24)` (セーフエリアオフセット考慮)
  - 上記の条件1と条件2の両方が真であれば「パス(PASS)」、いずれかが偽であれば「失敗(FAIL)」とする。

### 3.2 モーダルスクロール動作の検証 (モバイル: 800px)
- **ステップ A (操作 & 状態取得)**:
  1. アセット追加モーダル内のアセットリストなど、十分な高さのコンテンツを表示させる。
  2. ブラウザコンソールで以下のスクリプトを実行し、スクロール属性とフッターの固定状態を取得する。
     ```javascript
     (() => {
       const modalBackdrop = document.querySelector('.modal-backdrop');
       const modalContent = modalBackdrop ? modalBackdrop.querySelector('div') : null;
       const scrollContainer = modalContent ? modalContent.querySelector('.overflow-y-auto') : null;
       const cancelBtn = modalContent ? Array.from(modalContent.querySelectorAll('button')).find(b => b.textContent.includes('キャンセル')) : null;

       if (!modalBackdrop) return { error: "Modal backdrop not found" };
       if (!modalContent) return { error: "Modal content container not found" };
       if (!scrollContainer) return { error: "Scrollable container (.overflow-y-auto) not found in modal" };
       if (!cancelBtn) return { error: "Cancel button in modal not found" };

       const style = window.getComputedStyle(scrollContainer);
       const isScrollable = style.overflowY === 'auto' || style.overflowY === 'scroll';
       
       // ボタンの表示状態と固定位置確認
       const cancelStyle = window.getComputedStyle(cancelBtn.parentElement);
       
       return {
         isScrollable,
         scrollHeight: scrollContainer.scrollHeight,
         clientHeight: scrollContainer.clientHeight,
         footerPositionStyle: cancelStyle.position || 'static'
       };
     })()
     ```
- **ステップ B (判定ロジック)**:
  - コンソール実行結果が `error` を返した場合は、**即座に判定失敗 (FAIL)** とする。
  - 取得した値から以下の条件を検証する：
    1. モーダルのスクロールコンテナがCSS上でスクロール可能 (`isScrollable === true`) であること。
    2. スクロール領域のコンテンツが高さ制限内に収まり、固定フッターによってボタンが隠れず常にアクセス可能であること。

### 3.3 ページ最下部コンテンツ配置検証 (モバイル: 800px)
- **ステップ A (操作 & 状態取得)**:
  1. ページを最下部までスクロールする (`window.scrollTo(0, document.body.scrollHeight)`)。
  2. ブラウザコンソールで以下のスクリプトを実行し、最下部コンテンツとボトムナビの座標を取得する。
     ```javascript
     (() => {
       const nav = document.querySelector('nav');
       const main = document.querySelector('main');
       
       if (!nav) return { error: "Bottom navigation (nav) not found" };
       if (!main) return { error: "Main container (main) not found" };

       const navRect = nav.getBoundingClientRect();
       const mainStyle = window.getComputedStyle(main);
       const paddingBottom = parseFloat(mainStyle.paddingBottom);

       return {
         nav_top_y: navRect.top,
         paddingBottom: paddingBottom
       };
     })()
     ```
- **ステップ B (判定ロジック)**:
  - コンソール実行結果が `error` を返した場合は、**即座に判定失敗 (FAIL)** とする。
  - **条件**: `<main>` タグの下部パディング (`paddingBottom`) が、ボトムナビの高さ (`64px` = `4rem`) とセーフエリアを考慮した十分な値 (`>= 64`) であること。
  - 条件を満たす場合「パス(PASS)」、満たさない場合「失敗(FAIL)」。

### 3.4 デスクトップ表示回帰検証 (PC: 1280px)
- **ステップ A (操作 & 状態取得)**:
  1. 画面幅を `1280px` に設定し、`http://localhost:5173/` を開く。
  2. ブラウザコンソールで以下のスクリプトを実行し、サイドバーとメインコンテンツの表示状態を確認する。
     ```javascript
     (() => {
       const aside = document.querySelector('aside');
       const main = document.querySelector('main');
       
       if (!aside) return { error: "Sidebar (aside) not found" };
       if (!main) return { error: "Main container (main) not found" };

       const asideStyle = window.getComputedStyle(aside);
       const isSidebarVisible = asideStyle.display !== 'none' && aside.getBoundingClientRect().width > 0;

       return {
         isSidebarVisible: isSidebarVisible
       };
     })()
     ```
- **ステップ B (判定ロジック)**:
  - コンソール実行結果が `error` を返した場合は、**即座に判定失敗 (FAIL)** とする。
  - **条件**: PC幅においてサイドバーが正常に表示されていること (`isSidebarVisible === true`)。
  - 条件を満たす場合「パス(PASS)」、満たさない場合「失敗(FAIL)」。

## 4. エビデンス出力
- すべての判定ステップで、以下の情報を JSON 形式で `.gemini/evidence_req_101.json` に保存する:
  - `timestamp`: 実行時刻
  - `browser_width`: 現在のブラウザ幅
  - `nav_top_y`: ナビゲーションバー Y 座標
  - `cancel_bottom_y`: モーダル内キャンセルボタン Y 座標
  - `final_verdict`: "PASS" または "FAIL"
  - `failure_reason`: コンソールエラー等で判定不能の場合は `"element_missing_or_script_failure"`、それ以外の検証条件不整合の場合は `"layout_regression"` または空文字列とする。

