---
id: REQ-383-test-plan
title: "REQ-383 検証計画: Generate画面 連続横スクロールリールプレビュー・履歴双方向同期・端点ジャンプと共有コントロール"
status: ready
related_pbi: REQ-383
related_design: docs/design/REQ-383.md
---

# REQ-383 テスト・検証計画 (Test & Verification Plan)

## REQ-383 検証計画・ACトレーサビリティ・実行コマンド (AC-1 〜 AC-14)

### 1. AC-to-Case トレーサビリティマトリクス (AC-to-Case Mapping Table)

全テストケースに `[REQ-383/AC-n]` プレフィックスを付与し、既存テストファイルへ統合する（`[MUST [W-DD-PLACE]]`）。

| AC ID | 受入基準・検証仕様 (Given / When / Then 完全対応) | Tier | ランナー識別子 (Runner ID: 完全ファイルパス + `[REQ-383/AC-n]`) |
| :--- | :--- | :--- | :--- |
| **AC-1** | デスクトップ複数の生成済み画像がある状態でメインプレビューと履歴を表示した際、両領域とも最新画像が先頭（`index 0`）で右方向へ過去画像が並び、ソート順反転操作は表示されないこと | `unit`, `integration`, `e2e`, `doc` | ・`frontend/src/pages/GeneratePage/components/__tests__/GenerateParallelPreview.test.tsx` :: `[REQ-383/AC-1] latest-first order`<br>・`frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateDisplayState.test.tsx` :: `[REQ-383/AC-1] newest-first fixed`<br>・`frontend/src/pages/GeneratePage/sections/__tests__/GenerationGallerySection.cache.test.tsx` :: `[REQ-383/AC-1] hides sort toggle`<br>・`frontend/e2e/generateMobileGallery.spec.ts` :: `[REQ-383/AC-1]` / `docs/specs/SPEC_GENERATE.md` |
| **AC-2** | 複数画像がある状態で初期表示または端点へ移動した際、初期表示では最新画像（先頭）の中心がプレビュー水平中央に配置され、最新・最古いずれの端点画像も画像自体の表示幅を圧縮せずに水平中央へ吸着・配置できる端部余白（`marginLeft`/`marginRight`）を持つこと | `unit`, `e2e`, `doc` | ・`frontend/src/pages/GeneratePage/components/__tests__/GenerateParallelPreview.test.tsx` :: `[REQ-383/AC-2] initial center and non-compressing edge margins`<br>・`frontend/e2e/generateMobileGallery.spec.ts` :: `[REQ-383/AC-2]` / `docs/specs/SPEC_GENERATE.md` |
| **AC-3** | メインプレビューに複数画像がある状態でマウスホイールまたはトラックパッド横スクロール操作を連続入力した際、不要な振動や急停止を起こさず滑らかに横スクロール・減衰し、停止後に最も中心に近い画像がプレビュー水平中央へ吸着すること | `unit`, `e2e`, `doc` | ・`frontend/src/pages/GeneratePage/components/__tests__/GenerateParallelPreview.test.tsx` :: `[REQ-383/AC-3] smooth wheel inertia and center snap`<br>・`frontend/e2e/generateMobileGallery.spec.ts` :: `[REQ-383/AC-3]` / `docs/specs/SPEC_GENERATE.md` |
| **AC-4** | 縦長・正方形・横長（2:1等）の画像が混在する状態でメインプレビューに表示・スクロールした際、各画像の元アスペクト比を維持しつつプレビュー領域を上下・左右にはみ出さず、細長い空枠や極端な縮小なしに表示されること | `unit`, `e2e`, `doc` | ・`frontend/src/pages/GeneratePage/components/__tests__/GenerateParallelPreview.test.tsx` :: `[REQ-383/AC-4] mixed aspect ratios fit within viewport`<br>・`frontend/e2e/generateMobileGallery.spec.ts` :: `[REQ-383/AC-4]` / `docs/specs/SPEC_GENERATE.md` |
| **AC-5** | メインプレビューで過去画像側へスクロール移動している状態（`scrollLeft >= 72`）で「← 最新へ」が表示され押下した際、進行中のスクロール慣性が即座に停止し、最新画像（先頭 `index 0`）がプレビュー水平中央へ移動・表示されること | `unit`, `e2e`, `doc` | ・`frontend/src/pages/GeneratePage/components/__tests__/GenerateParallelPreview.test.tsx` :: `[REQ-383/AC-5] return-to-latest stops inertia and centers newest`<br>・`frontend/e2e/generateMobileGallery.spec.ts` :: `[REQ-383/AC-5]` / `docs/specs/SPEC_GENERATE.md` |
| **AC-6** | 履歴に複数画像がある状態でプレビュー上部の「最古へ →」ボタンを押下した際、進行中のスクロール慣性が即座に停止し、最古画像（末尾）がプレビュー水平中央へ移動・表示されること | `unit`, `e2e`, `doc` | ・`frontend/src/pages/GeneratePage/components/__tests__/GenerateParallelPreview.test.tsx` :: `[REQ-383/AC-6] jump-to-oldest stops inertia and centers oldest`<br>・`frontend/e2e/generateMobileGallery.spec.ts` :: `[REQ-383/AC-6]` / `docs/specs/SPEC_GENERATE.md` |
| **AC-7** | 履歴ペイン展開かつ複数選択モードではない通常状態で任意の履歴サムネイルをクリックした際、対象画像が選択状態になり、メインプレビューが該当画像へスクロール移動して水平中央に表示されること | `unit`, `integration`, `e2e`, `doc` | ・`frontend/src/pages/GeneratePage/sections/__tests__/GenerationGallerySection.cache.test.tsx` :: `[REQ-383/AC-7] normal thumbnail click triggers center`<br>・`frontend/src/pages/GeneratePage/components/__tests__/previewLayoutIntegration.test.tsx` :: `[REQ-383/AC-7] centers main preview`<br>・`frontend/e2e/generateMobileGallery.spec.ts` :: `[REQ-383/AC-7]` / `docs/specs/SPEC_GENERATE.md` |
| **AC-8** | 履歴ペインで複数選択モードが有効または複数選択用の修飾キー（`Ctrl`/`Meta`/`Shift`）押下状態で履歴サムネイルをクリックして選択・解除した際、複数選択状態のみが更新され、メインプレビューの表示位置は移動・ジャンプしないこと | `unit`, `integration`, `e2e`, `doc` | ・`frontend/src/pages/GeneratePage/sections/__tests__/GenerationGallerySection.cache.test.tsx` :: `[REQ-383/AC-8] suppresses preview scroll on multi-select`<br>・`frontend/src/pages/GeneratePage/components/__tests__/previewLayoutIntegration.test.tsx` :: `[REQ-383/AC-8] keeps scrollLeft unchanged`<br>・`frontend/e2e/generateMobileGallery.spec.ts` :: `[REQ-383/AC-8]` / `docs/specs/SPEC_GENERATE.md` |
| **AC-9** | 履歴ペインが展開されている状態でプレビューと履歴の境界バーにある「⌄ 履歴を閉じる」ボタンを押下した際、履歴ペインが閉じ、メインプレビューの表示領域が展開前の通常表示高へ復帰すること | `integration`, `e2e`, `doc` | ・`frontend/src/pages/GeneratePage/components/__tests__/previewLayoutIntegration.test.tsx` :: `[REQ-383/AC-9] boundary close button collapses history and restores height`<br>・`frontend/e2e/generateMobileGallery.spec.ts` :: `[REQ-383/AC-9]` / `docs/specs/SPEC_GENERATE.md` |
| **AC-10** | デスクトップGenerate画面を表示している状態でプレビュー上部または履歴ペイン内の「最新追従（`previewAutoFollow`）」トグルを切り替えた際、もう一方の表示状態も即座に同じON/OFF状態へ同期されること | `unit`, `integration`, `e2e`, `doc` | ・`frontend/src/pages/GeneratePage/components/__tests__/GenerateParallelPreview.test.tsx` :: `[REQ-383/AC-10] reel auto-follow toggle`<br>・`frontend/src/pages/GeneratePage/components/__tests__/previewLayoutIntegration.test.tsx` :: `[REQ-383/AC-10] bidirectional auto-follow sync`<br>・`frontend/e2e/generateMobileGallery.spec.ts` :: `[REQ-383/AC-10]` / `docs/specs/SPEC_GENERATE.md` |
| **AC-11** | デスクトップGenerate画面を表示している状態でプレビュー上部または履歴ペイン内の「自セッション（`filterOwnSession`）」トグルを切り替えた際、もう一方の表示状態も即座に同じON/OFF状態へ同期され表示対象画像群に反映されること | `unit`, `integration`, `e2e`, `doc` | ・`frontend/src/pages/GeneratePage/components/__tests__/GenerateParallelPreview.test.tsx` :: `[REQ-383/AC-11] reel session filter toggle`<br>・`frontend/src/pages/GeneratePage/components/__tests__/previewLayoutIntegration.test.tsx` :: `[REQ-383/AC-11] bidirectional session filter sync`<br>・`frontend/e2e/generateMobileGallery.spec.ts` :: `[REQ-383/AC-11]` / `docs/specs/SPEC_GENERATE.md` |
| **AC-12** | メインプレビューに画像が表示されている状態でリール内の画像をクリックした際、既存の詳細プレビューモーダル（`HistoryModalPreview`）が開き、拡大表示および閉じる操作（`Escape` キーまたは閉じるボタン）が正常に機能すること | `unit`, `integration`, `e2e`, `doc` | ・`frontend/src/pages/GeneratePage/components/__tests__/GenerateParallelPreview.test.tsx` :: `[REQ-383/AC-12] tile click opens modal`<br>・`frontend/src/pages/GeneratePage/components/__tests__/DesktopLayout.test.tsx` :: `[REQ-383/AC-12] modal open and Escape close`<br>・`frontend/e2e/generateMobileGallery.spec.ts` :: `[REQ-383/AC-12]` / `docs/specs/SPEC_GENERATE.md` |
| **AC-13** | 履歴ペインが展開されている状態で複数選択チェックボックス操作・一括保存・選択解除・スナップショットタブ切り替えを行った際、それぞれの既存機能がエラーなく動作すること | `unit`, `integration`, `e2e`, `doc` | ・`frontend/src/pages/GeneratePage/sections/__tests__/GenerationGallerySection.cache.test.tsx` :: `[REQ-383/AC-13] preserves multi-select and snapshot tabs`<br>・`frontend/src/pages/GeneratePage/components/__tests__/DesktopLayout.test.tsx` :: `[REQ-383/AC-13] preserves bulk actions`<br>・`frontend/e2e/generateMobileGallery.spec.ts` :: `[REQ-383/AC-13]` / `docs/specs/SPEC_GENERATE.md` |
| **AC-14** | デスクトップ表示でGenerate画面を表示している状態でメインプレビューの横スクロールおよび履歴の開閉・選択操作を行った際、`document.body` に横スクロールバー（`overflow-x`）が発生しないこと | `unit`, `e2e`, `doc` | ・`frontend/src/pages/GeneratePage/components/__tests__/GenerateParallelPreview.test.tsx` :: `[REQ-383/AC-14] min-w-0 and overflow-hidden prevent body overflow`<br>・`frontend/e2e/generateMobileGallery.spec.ts` :: `[REQ-383/AC-14]` / `docs/specs/SPEC_GENERATE.md` |

### 2. 統合フロー・実ブラウザ E2E シナリオ・Red Team 境界ケース・実行コマンド

- **E2E シナリオ (`1440×900` Desktop / `390×844` Mobile Preservation)**:
  1. 縦長・正方形・横長（2:1）混在データで初期表示し、`scrollLeft === 0`、先頭タイル水平中央配置、両端非圧縮余白、ソート切替UI非表示を確認（AC-1, AC-2, AC-4）。
  2. 連続ホイール入力後の滑らかな減衰停止と最寄りタイル水平中央吸着、慣性中の `← 最新へ` / `最古へ →` 押下による即時慣性停止＋端点中央移動を確認（AC-3, AC-5, AC-6）。
  3. 履歴展開→通常クリックでメインプレビュー中央同期（AC-7）→複数選択モードおよび `Ctrl`/`Meta`/`Shift` 押下クリック時に `scrollLeft` 不変（AC-8）→`最新追従` / `自セッション` 即時双方向同期（AC-10, AC-11）→複数選択・一括保存・選択解除・スナップショットタブ動作（AC-13）→境界バー `⌄ 履歴を閉じる` で通常表示高復帰（AC-9）。
  4. リール画像クリックで `HistoryModalPreview` 起動＆`Escape`/閉じるボタンClose（AC-12）、全操作を通じた `document.body.scrollWidth <= window.innerWidth + 1`（AC-14）、モバイル表示非破壊を確認。
- **Red Team 境界ケース**: RT-1 (0枚・1枚境界でNaN防止: AC-1, AC-2, AC-5, AC-6) / RT-2 (高速慣性中の端点ジャンプで `cancelAnimationFrame` 即時停止: AC-3, AC-5, AC-6) / RT-3 (修飾キー単発クリック時のスクロール抑止: AC-8) / RT-4 (`previewAutoFollow=false` 過去閲覧中の新着画像アンカー補正: AC-1, AC-10) / RT-5 (2:1横長画像の `maxWidth=0.86*viewportWidth` 収まり: AC-4, AC-14) / RT-6 (`ArrowLeft`/`ArrowRight` の `stopPropagation`: AC-3)。
- **検証プロファイル & Gate コマンド (`V1 Baseline`)**:
  - **Gate 1**: `npm.cmd --prefix frontend run typecheck` / `backend\.venv\Scripts\python.exe scripts/verify_ui_invariants.py`
  - **Gate 2**: `npm.cmd --prefix frontend run test`
  - **Gate 3**: `backend\.venv\Scripts\python.exe scripts/run_e2e.py e2e/generateMobileGallery.spec.ts`
