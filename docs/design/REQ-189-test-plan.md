# テスト計画書: REQ-189 画像生成中プログレスバーの実行中ノード名Unknown表示の解消とキュー情報フォールバック対応

## 1. 概要 (Overview)
`useGenerationStore` におけるワークフロー保持、WebSocket イベント処理（`executing`, `progress`, `executed`, `execution_complete`）、および ComfyUI キュー情報（`queueRunning`）を用いたノード名解決ロジックを検証する。

---

## 2. 自動テスト項目 (Automated Tests)

### テスト対象ファイル: `frontend/src/store/__tests/useGenerationStore.test.ts`

| # | テストケース名 | 検証内容 |
|---|---|---|
| 1 | `queuePrompt with isBatchIntermediate: true saves currentWorkflow` | `isBatchIntermediate: true` オプション付きで `queuePrompt` を実行した際、`state.currentWorkflow` にワークフローが正常に保存されること |
| 2 | `handles WS executing with currentWorkflow resolving node title` | `currentWorkflow` がセットされている状態で WS `executing (node: "3")` を受信した際、`_meta.title` または `class_type`（例: `KSampler`）が `currentNode.name` および `nodeProgress.nodeName` に設定されること |
| 3 | `handles WS executing for other session with fallback to queueRunning` | `currentWorkflow` が `null` の状態で、`queueRunning` にワークフローが存在する場合に WS `executing (node: "3")` を受信した際、キュー内の `prompt_json` からノード名を解決して `KSampler` が設定されること |
| 4 | `fetchQueue re-resolves Unknown currentNode when queueRunning is loaded` | `currentNode.name` が `'Unknown'` の状態で `fetchQueue()` が完了した際、取得した `queueRunning` のノード定義により `currentNode.name` および `nodeProgress.nodeName` が正しいノード名に自動更新されること |
| 5 | `executed event does not clear currentWorkflow during active generation` | 画像出力ノード完了（`executed`）を受信した際、`currentWorkflow` が `null` にクリアされず維持されること |
| 6 | `execution_complete clears currentWorkflow only when batch is completely finished` | 全てのバッチジョブが完了した `execution_complete` 時にのみ `currentWorkflow` が `null` に初期化されること |

---

## 3. 実行コマンド (CLI Execution)

```bash
cd frontend && npm test -- src/store/__tests/useGenerationStore.test.ts
```
全テストがパス（Exit code 0）すること。
