# REQ-431 実行可能テスト計画

## 1. リスク評価と検証プロファイル

- **適用プロファイル**: V1 Baseline（`.agents/verification.json` 準拠）。
- **変更リスク分類**: `low`（Generate ページモバイルUIコンポーネントおよび同画面統合・E2Eのみの変更であり、インフラ・DBスキーマ・権限・共有フィクスチャ・公開API契約への変更なし）。ただし本リポジトリは V1 Baseline 運用のため、Gate 1〜3 をすべてフレッシュに完全実行する。
- **フルスイート・フォールバック条件**:
  - 共有フィクスチャ（`frontend/src/test/utils/` 等）や共通 `Modal.tsx` / `BottomSheet.tsx` への変更が発生した場合
  - テスト収集数の不一致・予期せぬスキップ・フレーキーテストが検出された場合
  - 未知のリスクや環境差異が判明した場合（この場合も全件フルスイートを実行する）

---

## 2. 自動テスト Baseline 検証 (CLI Verification)

### Gate 1: 静的チェック & 高速ユニット検証
- **Frontend Typecheck**: `npm.cmd --prefix frontend run typecheck`
- **UI Invariant Check**: `backend\.venv\Scripts\python.exe scripts/verify_ui_invariants.py`
- **Test Naming Check**: `backend\.venv\Scripts\python.exe scripts/verify_test_naming.py --strict`
- **Backend Typecheck & Unit**: `backend\.venv\Scripts\python.exe -m mypy backend` / `backend\.venv\Scripts\python.exe -m pytest backend/tests/unit`
- **Frontend Unit Tests**: `backend\.venv\Scripts\python.exe scripts/run_in_dir.py frontend npm.cmd exec -- vitest run src/utils src/components/**/__tests__`
- **局所TDD検証 (T1)**: `cd frontend; npx vitest run src/pages/GeneratePage/components/__tests__/MobileImageSheet.test.tsx -t "REQ-431"`
- **期待値**: 型エラー・規約違反 0 件、対象ユニットテスト全 PASS (Exit code 0)。

### Gate 2: フル統合テストスイート
- **フルスイート実行**: `backend\.venv\Scripts\python.exe scripts/run_full_suite.py`
- **局所統合検証 (T2)**: `cd frontend; npx vitest run src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx -t "REQ-431"`
- **期待値**: 全テスト PASS (Exit code 0)。

### Gate 3: 実ブラウザ E2E & シナリオ検証
- **Playwright E2E Suite**: `backend\.venv\Scripts\python.exe scripts/run_e2e.py`
- **局所 E2E 検証**: `backend\.venv\Scripts\python.exe scripts/run_e2e.py frontend/e2e/generateMobileGallery.spec.ts`
- **期待値**: 実 Chromium モバイルビューポート (`375x812`) 上で全シナリオ PASS (Exit code 0)。

---

## 3. テスト配置・Seam Map・AC マッピング (`SPEC-TESTING v2.1 / REQ-356`)

- **テスト配置 (Test Placement)**:
  - Unit: `frontend/src/pages/GeneratePage/components/__tests__/MobileImageSheet.test.tsx`（既存ファイルへ追記）
  - Integration: `frontend/src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx`（既存ファイルへ追記）
  - E2E / Scenario: `frontend/e2e/generateMobileGallery.spec.ts`（既存ファイルへ追記）
  - ※ チケット番号を含むテストファイル名の新設は禁止。全テストケース名に `[REQ-431/AC-n]` プレフィックスを付与する。

- **Seam Map**:
  - **Integrated (real code)**: `MobileImageSheet`, `MobileLayout`, `GenerationGallerySection`, `useGenerationStore`
  - **Severed (external I/O only)**: Fullscreen API / Screen Wake Lock API（Unit/Integration）、`/api/*` & `/api/ws` & `/view`（Playwright `page.route` / `page.routeWebSocket`）
  - **Mock Level**: 内部ビジネスロジックのモンキーパッチ禁止。

- **AC-to-Case マッピング表**:

| AC ID | テスト層 (`tier`) | テスト配置ファイル | ケース名タグ (`[REQ-431/AC-n]`) | 検証内容 |
| :--- | :--- | :--- | :--- | :--- |
| AC-1 | `unit`, `e2e` | `MobileImageSheet.test.tsx`, `generateMobileGallery.spec.ts` | `[REQ-431/AC-1]` | 3枚ウィンドウ描画（履歴8枚以上でも最大3枚マウント）、水平ドラッグ中の `mobile-image-carousel-track` の `translateX` 指追従、閾値未満離脱時の中央スナップ復帰、左スワイプで古い画像／右スワイプで新しい画像へのスライド切替、先頭・末尾での端点抵抗＋非ループ停止。 |
| AC-2 | `unit`, `e2e` | `MobileImageSheet.test.tsx`, `generateMobileGallery.spec.ts` | `[REQ-431/AC-2]` | 全画面ビューア表示中の `mobile-image-carousel-track` 指追従・左右スワイプ画像送り（`viewMode === 'fullscreen'` 維持）、および全画面解除後のボトムシート表示画像の維持。 |
| AC-3 | `unit`, `integration`, `e2e` | `MobileImageSheet.test.tsx`, `MobileLayout.test.tsx`, `generateMobileGallery.spec.ts` | `[REQ-431/AC-3]` | スワイプ切替後の `#download-btn-mobile` `href` および `mobile-sheet-save-btn` 引数・モーダル対象の一致。 |
| AC-4 | `unit`, `e2e` | `MobileImageSheet.test.tsx`, `generateMobileGallery.spec.ts` | `[REQ-431/AC-4]` | `80px` 以上ドラッグおよび高速フリック（`> 0.5px/ms` & `> 30px`）で閉じ、背面グリッドのスクロール位置を維持。閾値未満は `translateY: 0` 復帰、上ドラッグは `0` クランプ。 |
| AC-5 | `unit`, `e2e` | `MobileImageSheet.test.tsx`, `generateMobileGallery.spec.ts` | `[REQ-431/AC-5]` | 全画面表示中の下スワイプでシートが閉じないこと、および画像タップ・閉じるボタン・Escで復帰できること。シート通常閉じ導線維持。 |
| AC-6 | `unit`, `e2e` | `MobileImageSheet.test.tsx`, `generateMobileGallery.spec.ts` | `[REQ-431/AC-6]` | 横スワイプ時の縦追従抑止、縦下スワイプ時の画像送り抑止、上ドラッグの `0` クランプ、`scrollTop > 0` 時の縦スクロール優先（両スワイプ抑止）。 |
| AC-7 | `integration`, `e2e` | `MobileLayout.test.tsx`, `generateMobileGallery.spec.ts` | `[REQ-431/AC-7]` | シートを閉じた後、背後の履歴3列グリッドで直前表示画像のサムネイルが選択状態になっていること。 |

---

## 4. Red Teaming (境界値・異常系シナリオ) [Gate 3 Baseline]

1. **斜めスワイプ・微小ブレ境界 (`AC-6`)**:
   - **手順**: `deltaX = 50, deltaY = 12`（横優勢）および `deltaX = 12, deltaY = 90`（縦優勢）を実行。
   - **期待結果**: 前者は画像切替のみ発火し `translateY` は `0` のまま、後者はシート閉じのみ発火し `onSelectImage` は呼ばれない。
2. **内部縦スクロール中 (`scrollTop > 0`) の下スワイプ・横スワイプ (`AC-6`)**:
   - **手順**: `mobile-image-sheet-content` 内のスクロール可能要素の `scrollTop` を `40` に設定した状態で下方向 100px ドラッグおよび左方向 80px スワイプを実行。
   - **期待結果**: `onClose`・`onSelectImage` ともに発火せず、`translateY` も変化しない。
3. **単一画像・空配列・未登録画像でのスワイプ (`AC-1`)**:
   - **手順**: `images={['img1.png']}` または `images={[]}` で左右スワイプを実行。
   - **期待結果**: 例外が発生せず、`onSelectImage` は呼ばれない。
4. **マルチタッチおよび `touchCancel` 中断 (`AC-4`)**:
   - **手順**: 下方向 50px ドラッグ中に 2 本目の指を追加、または `touchCancel` を発火。
   - **期待結果**: `translateY` が `0` にリセットされ、誤ってシートが閉じない。
5. **画像読込エラー後のスワイプ復帰 (`Fault Injection`)**:
   - **手順**: 1枚目で `onError` を発火させてエラー表示（`mobile-sheet-image-error`）にした後、左スワイプで2枚目へ移動。
   - **期待結果**: `hasError` がリセットされ、2枚目の `<img>` が正常に表示される。
6. **デスクトップ幅 (`>= 768px`) でのスワイプダウン抑止 (`REQ-408` 準拠)**:
   - **手順**: `window.innerWidth = 1024` 環境で下方向 120px ドラッグを実行。
   - **期待結果**: `onClose` が発火しない。
7. **カルーセル閾値未満離脱・端点抵抗・3枚ウィンドウ上限・DOM同一性 (`AC-1`, `AC-2`)**:
   - **手順**: 8枚の履歴画像がある状態で、右方向 20px（閾値未満）ドラッグして離す、および先頭（index 0）で右方向 60px ドラッグして離す。また全画面ビューアでも同様にドラッグする。さらに左スワイプ確定時の `onSelectImage` 即時発火とスライド要素の DOM 同一性（`key={`${idx}-${slideUrl}`}`）を確認する。
   - **期待結果**: ドラッグ中は `mobile-image-carousel-track` の `translateX` が指に追従（端点では `0.25x` 減衰）し、離すと中央位置（`translateX(calc(0% + 0px))` 等）へスナップ復帰して `onSelectImage` は呼ばれないこと。閾値以上のスワイプでは `setTimeout` を待たずに即時 `onSelectImage` が確定し、同一スライドの `<img>` DOM ノードが維持されること。DOM 内のカルーセル画像数は常に最大3枚であること。
8. **モバイルブラウザ Pull-to-Refresh 抑止 (`AC-4`, `AC-6`)**:
   - **手順**: `MobileImageSheet` が `isOpen={true}` の状態で `document.documentElement.style.overscrollBehaviorY` / `document.body.style.overscrollBehaviorY`、および `{ passive: false }` のネイティブ `touchmove` リスナーにおける下方向ドラッグ時の `event.defaultPrevented` を検証し、クローズ後の復元も確認する。
   - **期待結果**: 表示中は `overscrollBehaviorY` が `'contain'` に設定され、下方向ドラッグ中の `touchmove` で `preventDefault()` が呼ばれること。クローズ後は元の値へ復元されること。

---

## 5. ツール主導監査 (Tool-Driven Audit)
- **コマンド**: `python "${GLOBAL_HELPERS}/local_model_adapter.py" --context-length 32768 qa-audit --audit-kind qa_evidence --audit-package <PKG_JSON> docs/design/REQ-431-test-plan.md`
- **アンロード**: `python "${GLOBAL_HELPERS}/local_model_adapter.py" unload`
