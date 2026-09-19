# REQ-279: テスト計画書 (Test Plan) - レースコンディション是正＆インメモリ同期的フラッシュ検証版 (第4版: フィクスチャ・ベースライン定義完全版)

- **PBI**: REQ-279
- **改訂日**: 2026-09-19
- **作成者**: Architect / QA
- **ステータス**: テスト計画承認完了 (QA Audit 78点 指摘反映版)

---

## 1. 検証ゲート概要 (3-Gate Baseline)

### 前提環境
- Node.js >= 20.x
- Vitest / TypeScript

### Gate 1: 静的解析・型チェック
- **実行コマンド**: `npx tsc -p tsconfig.app.json --noEmit`
- **機械的判定基準**: エラー出力 0 件、プロセス終了コード `0`

### Gate 2: フルテストスイート自動ディスカバリ実行
- **実行コマンド**: `npm test`
- **機械的判定基準**: テスト失敗 0 件、プロセス終了コード `0`

### Gate 3: 結合シナリオ & レースコンディション是正検証 (True Positive Verification)
- **テスト実装先**:
  `frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts` 内の専用ブロック：
  `describe('REQ-279: In-memory synchronous flush and race condition fix', () => { ... })`
- **ピンポイント実行コマンド**:
  ```bash
  npx vitest run frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts -t "REQ-279"
  ```
- **機械的判定基準**:
  - 対象 3 テストがすべて PASS し、プロセス終了コード `0` であること。
  - テスト実行結果のターミナル出力を記録・提示すること（脳内テストの完全遮断）。

---

## 2. 抜け道防止および偽陽性排除ルール (Anti-Loophole Rules)

| ルール ID | 名称 | 機械的検証条件 | 遮断する抜け道 |
|---|---|---|---|
| **AL-1** | **非同期 HTTP 未完了時の同期検証** | `updatePresetMutation.mutate` の完了プロミスを保留（pending）にした状態で `handleGenerateSets()` を呼び出し、インターセプトした `queuePrompt` 引数 `wfJson.inputs.Sampler_Steps === '40'`（新値）かつ `!== '20'`（旧値）をアサート。 | 非同期通信完了後に遅れて同期されることで PASS してしまう偽陽性 |
| **AL-2** | **複数セット・activeSetId 未確定検証** | `sets.length === 2` かつ `activeSetId = null` の初期状態から `handleGenerateSets()` を呼び出し、第1セット引数 `wfJson.inputs.cfg === '8.5'`、第2セット引数 `wfJson.inputs.cfg === '7.0'` をアサート。 | `isActive` が `false` に誤判定されて旧値へフォールバックする抜け道 |
| **AL-3** | **バッチサイズ・シードの即時反映検証** | バッチサイズを 1 から 3 へ変更し即時生成実行後、`expect(mockQueuePrompt).toHaveBeenCalledTimes(3)` および `expect(useGenerationStore.getState().activeBatch).toHaveLength(3)` をアサート。 | `setItem.batchSize` の未同期によるループ回数・プレースホルダー不整合の抜け道 |

---

## 3. テストフィクスチャ & ベースライン定義

### 3.1 ベースライン値定義
- **旧値（変更前）**: `Sampler_Steps = '20'` (初期セット `setItem.paramValues` または初期 DB 値)
- **新値（画面編集後）**: `Sampler_Steps = '40'` (画面の最新 `state.paramValues`)
- **アサーション**: `actual === '40' && actual !== '20'`

### 3.2 テストフィクスチャ定義
```typescript
const setA: GenerationSet = {
  id: 'set-1',
  name: 'Set 1',
  paramValues: { Sampler_Steps: '20', cfg: '7.0' },
  appliedAssets: {},
  promptChips: {},
  batchSize: 1,
  seedMode: 'random',
  seed: 42,
  checked: true,
}

const setB: GenerationSet = {
  id: 'set-2',
  name: 'Set 2',
  paramValues: { Sampler_Steps: '20', cfg: '7.0' },
  appliedAssets: {},
  promptChips: {},
  batchSize: 1,
  seedMode: 'random',
  seed: 42,
  checked: true,
}
```

---

## 4. テストケース定義と機械的アサーション仕様

| テスト ID | 検証シナリオ | 具体的な検証アプローチ・アサーションコード | 判定基準 (Expected) |
|---|---|---|---|
| **TC-SYNC-1** | **1回目即時生成の同期検証** | `updatePresetMutation` 保留状態で実行。<br>`expect(mockQueuePrompt).toHaveBeenCalledTimes(1);`<br>`expect(payload.inputs.Sampler_Steps).toBe('40');`<br>`expect(payload.inputs.Sampler_Steps).not.toBe('20');` | `actual === '40' && actual !== '20'` |
| **TC-SYNC-2** | **複数セット存在時の activeSetId 解決検証** | `useGenerationStore.setState({ activeSetId: null, paramValues: { cfg: '8.5' }, sets: [setA, setB] });`<br>`await handleGenerateSets();`<br>`expect(calls[0][0].inputs.cfg).toBe('8.5');`<br>`expect(calls[1][0].inputs.cfg).toBe('7.0');` | 第1セットに画面新値（8.5）、第2セットに個別値（7.0）が正しく注入されること |
| **TC-SYNC-3** | **バッチサイズ／シードの即時反映検証** | `useGenerationStore.setState({ batchSize: 3, seedMode: 'fixed', seed: 12345 });`<br>`await handleGenerateSets();`<br>`expect(mockQueuePrompt).toHaveBeenCalledTimes(3);`<br>`expect(useGenerationStore.getState().activeBatch).toHaveLength(3);`<br>`expect(calls[0][0].seedOptions.seed).toBe(12345);` | `toHaveBeenCalledTimes === 3` かつ `activeBatch.length === 3` |

---

## 5. 機械的検証強制規則 (Anti-"Brain Test")

- **Rule BVT-1 (Binary Execution Log Enforcement)**:
  ターミナルでの実実行ログ（終了コード 0、全アサーション合格）を提示すること。
- **Rule BVT-2 (Diff & Negative Assertion)**:
  新値一致だけでなく、旧値不一致（`not.toBe('20')`）の否定アサーションを必須とする。
