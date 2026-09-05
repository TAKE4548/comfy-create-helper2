# TASK-REQ-124-HOTFIX-T1: useWorkflowParams — リマッピング時の全セット初期値補完

## 1. ターゲット識別
- **対象ファイル**: `frontend/src/pages/GeneratePage/hooks/useWorkflowParams.ts`
- **依存タスク**: REQ-124-T1〜T5 完了済み（バグ修正タスク）

---

## 2. 密閉コンテキスト

### 2.1 バグの概要
ワークフローにCheckpointロール等のカスタムマッピングを追加後、そのロールキーが `paramValues` および各セットの `paramValues` に存在しないまま生成が実行され、`ckpt_name: ''` として空文字が送信される。

### 2.2 根本原因
`useWorkflowParams.ts` の `useEffect([workflow])` (L86-118) は、localStorage に保存済みの params がある場合それをそのまま使用する。マッピング追加後に新規ロールキーが補完されないため、生成時に `paramValues[新ロール] === undefined` → `""` となる。

### 2.3 修正対象コード（現在の実装）

```typescript
// useWorkflowParams.ts L81-118
export function useWorkflowParams(workflow: Workflow | undefined, selectedWorkflowId: number | null) {
  const { setParamValues, paramValues, setSeed, setSeedMode, appliedAssets, setAppliedAssets } = useGenerationStore()

  useEffect(() => {
    if (!workflow) return
    const savedStr = localStorage.getItem(LS_KEYS.PARAMS_PREFIX + workflow.id)
    let hasLoadedParams = false
    if (savedStr) {
      try {
        const savedParams = JSON.parse(savedStr)
        setParamValues(savedParams)              // ← 保存済みをそのまま使う（新規ロール補完なし）
        hasLoadedParams = true
      } catch (e) { ... }
    }
    if (!hasLoadedParams) {
      const init = getInitialParams(workflow)
      setParamValues(init)
      localStorage.setItem(LS_KEYS.PARAMS_PREFIX + workflow.id, JSON.stringify(init))
    }
  }, [workflow])
```

### 2.4 ストア: `sets` と `setSets` の型

```typescript
// useGenerationStore.ts

export interface GenerationSet {
  id: string | number
  name: string
  paramValues: Record<string, string>   // ← 全セットがそれぞれ持つ
  appliedAssets: Record<string, AppliedAsset[]>
  batchSize: number
  seedMode: 'random' | 'fixed'
  seed: number
  checked: boolean
}

// GenerationState
sets: GenerationSet[]
setSets: (sets: GenerationSet[]) => void   // L202
```

### 2.5 `getInitialParams` のシグネチャ（変更なし）

```typescript
// useWorkflowParams.ts L63-78
export function getInitialParams(workflow: Workflow): Record<string, string>
// → workflow.mappings を走査し、各ロールのデフォルト値を json_body から抽出して返す
```

---

## 3. 実装要件

### 3.1 `useGenerationStore` から `sets` と `setSets` を追加取得

```typescript
// 変更前
const { setParamValues, paramValues, setSeed, setSeedMode, appliedAssets, setAppliedAssets } = useGenerationStore()

// 変更後
const { setParamValues, paramValues, setSeed, setSeedMode,
        appliedAssets, setAppliedAssets, sets, setSets } = useGenerationStore()
```

### 3.2 `useEffect([workflow])` の修正

```typescript
useEffect(() => {
  if (!workflow) return

  const defaultParams = getInitialParams(workflow)

  // ─── 全セットへの新規ロール補完 ────────────────────────────
  const hasNewKeys = sets.some(s =>
    Object.keys(defaultParams).some(k => !(k in s.paramValues))
  )
  if (hasNewKeys) {
    const updatedSets = sets.map(s => ({
      ...s,
      paramValues: { ...defaultParams, ...s.paramValues },  // デフォルト値ベース、既存値優先
    }))
    setSets(updatedSets)
  }

  // ─── アクティブ paramValues の初期化/補完 ──────────────────
  const savedStr = localStorage.getItem(LS_KEYS.PARAMS_PREFIX + workflow.id)
  if (savedStr) {
    try {
      const savedParams = JSON.parse(savedStr)
      if (hasNewKeys) {
        const merged = { ...defaultParams, ...savedParams }
        setParamValues(merged)
        localStorage.setItem(LS_KEYS.PARAMS_PREFIX + workflow.id, JSON.stringify(merged))
      } else {
        setParamValues(savedParams)
      }
    } catch (e) {
      console.error('Failed to parse workflow saved params:', e)
      setParamValues(defaultParams)
      localStorage.setItem(LS_KEYS.PARAMS_PREFIX + workflow.id, JSON.stringify(defaultParams))
    }
    return
  }

  // localStorage 未保存の場合は初回初期化
  setParamValues(defaultParams)
  localStorage.setItem(LS_KEYS.PARAMS_PREFIX + workflow.id, JSON.stringify(defaultParams))

  // ─── applied assets の初期化（既存ロジック変更なし）────────
  const savedAssetsStr = localStorage.getItem(`${LS_KEYS.APPLIED_ASSETS}_${workflow.id}`)
  if (!savedAssetsStr && workflow.default_applied_assets) {
    try {
      const defaultAssets = JSON.parse(workflow.default_applied_assets)
      setAppliedAssets(defaultAssets)
    } catch (e) {
      console.error('Failed to parse workflow default applied assets:', e)
    }
  }
}, [workflow])
```

> **注意**: `sets` を `useEffect` の依存配列に含めないこと（無限ループ防止。ワークフロー変更時のみ実行する意図）。

---

## 4. 検証手順 (→ テスト計画: REQ-124-HOTFIX-test-plan.md)
- [ ] `getInitialParams` が新規ロールのデフォルト値を正しく返すこと（既存テスト）
- [ ] 新規ロールを含む workflow が渡されたとき、全セットの paramValues にキーが補完されること
- [ ] 既存セットの保存済み値は上書きされないこと
- [ ] localStorage の保存値にも新規ロールが追記されること
- [ ] sets が空の場合に例外が発生しないこと
