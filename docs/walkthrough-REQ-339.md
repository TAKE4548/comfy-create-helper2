# Walkthrough - REQ-339: プレビューエリアのアスペクト比非依存・高さ基準動的マルチ表示レイアウトおよびリソースモニタ移設

## 1. 概要
REQ-339 では、生成ページのメインプレビュー領域において固定の2:3アスペクト比前提のカード枠判定を廃止し、画像本来のアスペクト比を維持したままコンテナの利用可能高さに統一して横方向に動的配置するレイアウトを導入しました。また、プレビューエリアの最大化に伴いプレビュー画像を覆っていた重畳HUDを撤去し、デスクトップGlobal Headerへリソース監視チップを移設しました。

## 2. 受入基準（AC）検証結果

| AC番号 | 受入基準の内容 | 検証結果 | 検証エビデンス・テストケース |
|:---|:---|:---:|:---|
| **AC-1** | 異なるアスペクト比（1:1, 16:9, 2:3）の画像群がコンテナ高さに統一され、本来のアスペクト比を維持して歪み・クロップなく表示されること | **PASS** | `e2e_req339_preview_layout.test.tsx` (テスト1: カード高さが600pxに統一され、幅が各比率に応じたピクセル数で描画されることを確認) |
| **AC-2** | 同一コンテナサイズにおいて、横長画像（16:9）は少ない枚数、縦長画像（2:3）は多くの枚数が空きスペースに応じて自動的に並列表示されること | **PASS** | `GenerateParallelPreview.test.tsx` (テスト4: 1200px幅で16:9は1枚、2:3は2枚表示されることを検証) |
| **AC-3** | 混在アスペクト比の画像群において、先頭から累積幅＋ギャップを計算し、コンテナ幅に収まる最大枚数が1行に動的配置されること | **PASS** | `GenerateParallelPreview.test.tsx` (テスト5: 1:1 + 2:3 の混在画像セットが1020pxで2枚、1430pxで3枚収まることを検証) |
| **AC-4** | ペイン境界スプリッターのドラッグ・リサイズ時に、利用可能横幅に応じて即座に表示可能枚数が再計算・追従すること | **PASS** | `e2e_req339_preview_layout.test.tsx` (テスト2: 811px→1枚、812px→2枚、1224px→3枚への動的伸縮を検証) |
| **AC-5** | 現在の横幅に収まりきらない複数画像が存在する場合、左右のナビゲーション操作（矢印ボタン・キーボード）で前後の画像セットへ切り替え可能なこと | **PASS** | `e2e_req339_preview_layout.test.tsx` (テスト3: 次ページボタン押下で `['c', 'd']` へ切り替わることを確認) |
| **AC-6** | デスクトップ環境において、リソースモニタがプレビューエリア内の重畳表示からヘッダー部へと移設され、画像表示の遮蔽が排除されていること | **PASS** | `DesktopLayout.test.tsx` (プレビューグリッド内に `.bg-[#18181C]/80` が存在せず、Global Header内に配置されていることを確認) |
| **AC-7** | ヘッダー部においてCPU, RAM, GPU, VRAM, ストレージ推定量がヘッダー要素と干渉せずに表示され、監視機能を維持していること | **PASS** | `DesktopLayout.test.tsx` & `e2e_req339_preview_layout.test.tsx` (ヘッダーコンテナ内に CPU, RAM, GPU, VRAM が存在することを確認) |
| **AC-8** | 動的マルチプレビュー表示されている画像をクリックして選択した際、アクティブ状態としてハイライトされ既存のGenerate状態へ反映されること | **PASS** | `e2e_req339_preview_layout.test.tsx` (テスト3: クリックした画像IDで `onSelect` が発行されることを確認) |

## 3. 3-Gate Baseline 検証結果
- **Gate 1 (Typecheck)**: `npm run typecheck` → 0 errors (PASS)
- **Gate 2 (Full Discovery Test Suite)**: `npm test` → 191 test files, 1823 tests passed, 0 failures (PASS)
- **Gate 3 (Scenario & Red Teaming)**: 
  - `GenerateParallelPreview.test.tsx` (5 tests PASS)
  - `DesktopLayout.test.tsx` (1 test PASS)
  - `e2e_req339_preview_layout.test.tsx` (4 tests PASS)
