---
id: REQ-309-test-plan
title: 初回 JavaScript 読み込み量削減のテスト計画
tags: [frontend, performance, verification]
related_paths:
  - docs/backlog/pbi/active/REQ-309.md
  - docs/design/REQ-309.md
---

# REQ-309 テスト計画

## Gate 1: 静的検査とビルド

`cd frontend; npm run typecheck`、`cd frontend; npm run build`。ビルドログを保存し、`chunkSizeWarningLimit` が既定値のままで 500 kB 超警告がないこと、全 JS チャンクの非圧縮サイズを確認する。生成物の `index.html` が必要な chunk を参照し、遅延 chunk の URL が解決できることを確認する。

## Gate 2: 局所・回帰

`cd frontend; npx vitest run src/pages/__tests__/GeneratePage.test.tsx src/pages/__tests__/LoRAsPage.test.tsx src/pages/__tests__/TagsPage.test.tsx src/pages/__tests__/HistoryPage.test.tsx src/pages/__tests__/SettingsPage.test.tsx src/pages/GeneratePage/sections/__tests__/GenerateModalsOverlay.test.tsx`（既存ファイルが見つからない場合は実在する対象だけを選択）。変更した遅延境界のテストでは、閉状態で import が起きないこと、開状態で内容が描画されること、再開時の必要な状態が保たれること、読み込み失敗時にエラー表示と再読み込み導線があることを確認する。全体回帰は `cd frontend; npm test`。

## Gate 3: 本番配布物での受入

| ID | 操作 | 期待結果 |
|---|---|---|
| AC-1 | 前後の本番版を同一環境・空キャッシュ・`/`・同じ画面幅で開き、プロンプト編集可能時点の JS 転送量を記録 | 改修後の合計が改修前より小さい。転送サイズと URL の表を残す |
| AC-2 | 本番ビルドを実行 | 成功し、警告閾値変更・抑止なしで 500 kB 超警告がない |
| AC-3 | `/` でプロンプトを編集 | 入力内容が保持される。PC と幅 767px 以下のモバイルを確認 |
| AC-4 | checkpoint を選択し生成開始 | 選択した checkpoint で生成が開始される |
| AC-5 | `/history` へ移動し既存項目を開く | 初回遅延読込後に一覧・詳細が表示される |
| AC-6 | `/settings` へ移動し設定を開く | 初回遅延読込後に既存項目が表示される |
| 回帰 | `/loras` と `/tags` へ移動し一覧と編集操作 | 初回遅延読込後も操作できる |

## 統合フロー

1. `/` 起動 → プロンプト入力 → checkpoint 選択 → Generate。初期画面の操作に履歴・設定・未開モーダルの chunk が先読みされていないことを Network で確認する。
2. `/` → `/loras` → `/tags` → `/history` → `/settings` → `/`。各ページのコードは訪問時に取得され、戻った後の Generate 状態と編集が正常。
3. Generate で履歴プレビュー、ジョブ管理、スナップショット保存、プリセット競合、一括編集、翻訳、バイパス、パラメータ同期をそれぞれ開く。初回読み込み表示、内容、閉じる、再度開く操作を確認する。

## Red Team 境界・異常系

- 遅延 chunk のリクエスト失敗・404・通信中断後、既存エラー境界が空白画面にせず再読み込み導線を表示する。失敗時に未保存のプロンプトが失われる場合はリスクとして記録し、局所的な復旧境界の追加を検討する。
- モーダルを開いて読み込み中に閉じる、連続クリック、ページ遷移を行っても遅れて表示されず、重複送信しない。
- 767px 前後で画面幅を切り替えても PC/モバイルの必要なレイアウトを表示し、プロンプト値を保持する。
- 空キャッシュと温キャッシュを区別し、Service Worker・拡張機能・DevTools cache 設定の影響を記録する。`/history` 等の遅延 chunk が `<link rel=modulepreload>` によって初回に先読みされていないか確認する。
- モーダルの mount 条件変更で、閉じた後のフォームや保留中操作が破壊されないことを確認する。
- JS ファイル数増加後もバックエンドの SPA 配信から直接 `/history` や `/settings` を開ける。

性能比較と操作確認の証拠が揃うまで AC を PASS としない。現時点ではテスト未実施。
