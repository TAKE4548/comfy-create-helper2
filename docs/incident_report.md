# インシデントレポート: モバイルモードにおけるバッチ・複数プリセット生成のキュー登録遅延および取り消しレスポンス遅延

## 概要 (Overview)
モバイル環境（スマートフォン等の実機Wi-Fi接続、または画面幅768px未満のモバイル表示環境）において、バッチ生成または複数プリセットを選択して生成を実行した際、ComfyUIキューへの登録完了までに著しい遅延が発生し、また実行・待機ジョブの取り消し（キャンセル）操作を行っても即座に停止せずレスポンスが悪化する事象が確認されました。なお、同一PC上のローカルブラウザ（通常モード）では遅延が顕著化しにくい傾向にあります。

---

## 再現手順 (Reproduction Steps)
1. スマートフォン実機（Wi-Fi経由）、またはブラウザでモバイルモード（幅 768px 未満）を開く。
2. 複数のプリセット（例: 3〜5個）にチェックを入れる、またはバッチサイズを 2 以上に設定する。
3. 「Generate Batch」ボタン（`#generate-btn-mobile`）をタップして生成を実行する。
4. **観測事象 1 (キュー登録遅延)**:
   - ボタン押下後、すべてのジョブがComfyUIのキューに登録されてバッチ進捗表示が正常化するまでに数秒〜十数秒のタイムラグが発生する。
5. **観測事象 2 (取り消しレスポンス悪化)**:
   - キュー登録中または生成開始直後に「ジョブ管理」モーダル等からキャンセル（または一括キャンセル）を実行しても、キャンセル直後に後続のジョブが再度キューに投入され、生成が即座に停止しない。

---

## 影響範囲 (Affected Area)
- **フロントエンド生成アクションフック**:
  - `frontend/src/pages/GeneratePage/hooks/useGenerateAction.ts`:
    - L182-228: `handleGenerateSets` において、選択された全プリセット（`checkedSets`）とバッチサイズ（`setItem.batchSize`）に対する二重ループ内で `await queuePrompt(...)` を直列（逐次）実行している。
    - L199-222: ループ内でキャンセル状態の検知・中断フラグ（AbortController / Cancel Token）のチェック機構が存在しない。
    - L225-227: 全てのキュー投入ループが完了するまで `setActiveBatch` が呼び出されず、ループ処理中は `activeBatch` が `null` のままとなる。
- **グローバル生成状態ストア**:
  - `frontend/src/store/useGenerationStore.ts`:
    - L894-966: `queuePrompt` 実行毎に `POST /prompt` に加え、`localStorage` のメタデータ走査・削除処理（L940-957）および `await get().fetchQueue()`（`GET /queue` の通信 + Zustand 状態更新）が毎回直列で実行されている。
    - L1066-1167: `cancelJob` / `cancelAllJobs` がComfyUIキューをクリアしても、`useGenerateAction` の直列ループが並行して動き続け、後続のプロンプトを再投入してしまう。

---

## 原因分類 (Root Cause Classification)
- **分類**: **Type A (実装不備 / Implementation Bug)**
- **理由**:
  - 複数ジョブ投入時における非同期通信の直列化（逐次リクエスト）、不要な毎回のキュー取得（`fetchQueue`）、およびキャンセル時の生成ループ中断機構の欠落という実装上の問題に起因するため。

---

## 調査詳細 (Deep Dive Analysis)

### 1. 直列リクエストとネットワーク往復遅延 (RTT) の累積
`frontend/src/pages/GeneratePage/hooks/useGenerateAction.ts` L199-222:
```ts
for (const setItem of checkedSets) {
  const syncedParamValues = applyParamSync(setItem.paramValues)
  for (let i = 0; i < setItem.batchSize; i++) {
    ...
    const promptId = await queuePrompt(wfJson, { paramValues: syncedParamValues, appliedAssets: setItem.appliedAssets })
    ...
  }
}
```
`frontend/src/store/useGenerationStore.ts` L894-965 (`queuePrompt`):
```ts
const res = await fetch(`${activeUrl}/prompt`, ...)
...
localStorage.setItem(metaKey, JSON.stringify(promptMetadata))
// 毎回全メタキー走査
...
await get().fetchQueue() // 毎回 GET /queue 通信を実行
```
- 例えば 4 プリセット × バッチ 4 の場合、合計 16 回の `POST /prompt` と 16 回の `GET /queue`（計 32 回の HTTP 通信）が完全に 1 つずつ直列に実行されます。
- **PCローカル環境（`localhost`）**: RTT が 1ms 未満のため、32 回の通信でも数十ミリ秒で完了し遅延が目立ちません。
- **モバイル実機（Wi-Fi / LAN 経由）**: 1 通信あたり 20〜100ms 程度のレイテンシが生じるため、32 回の通信で数秒以上のブロッキングが発生します。また、低スペック端末では通信ごとの Zustand 再レンダリングと localStorage 走査負荷が加わり、キュー登録が著しく遅延します。

### 2. 取り消し（キャンセル）時のループ継続と再投入
- ユーザーがジョブのキャンセルを実行した場合、`cancelAllJobs` は ComfyUI 上の待機キューを削除し `interrupt` を送信します。
- しかし、フロントエンドの `handleGenerateSets` ループはキャンセルの発生を感知せず稼働し続けるため、キューがクリアされた直後に次のループの `queuePrompt` が ComfyUI に新規送信されます。
- これにより「キャンセルしたはずなのに次のジョブがキューに追加され生成が続く」という現象が発生し、レスポンスが極めて悪く見えます。

---

## 次のステップ提案 (Next Action)
本問題は Type A（実装不備）に分類されるため、`/dev-design` に進み、キュー投入処理の最適化（一括/パイプライン化、不要な中間フェッチ削減、キャンセル用 Abort シグナルの導入）の設計を行うことを提案します。

- **承認の確認**: 次のステップ（`/dev-design`）へ進んでよろしいですか？ (YES / NO)
