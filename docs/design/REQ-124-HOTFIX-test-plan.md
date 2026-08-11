# テスト計画: REQ-124-HOTFIX — useWorkflowParams 全セット補完ロジック

## 1. テスト対象
- **ファイル**: `frontend/src/pages/GeneratePage/hooks/useWorkflowParams.ts`
- **修正関数**: `useWorkflowParams` hook 内の `useEffect([workflow])`
- **テストファイル**: `frontend/src/pages/GeneratePage/hooks/__tests__/useWorkflowParams.test.ts` （既存ファイルに追記）

---

## 2. テストケース一覧

### Suite: `fillMissingParamValuesInSets (補完ロジックの単体テスト)`

既存の `getInitialParams` テストに加え、**補完ロジックの純粋関数化**は難しいため、以下のヘルパーロジックをテストする。

#### TC-1: 新規ロールキーが全セットに補完される

```typescript
it('should fill missing new-role keys in all sets with default values from json_body', () => {
  const defaultParams = { Sampler_Seed: '42', Checkpoint: 'model_A.safetensors' }
  const sets = [
    { id: 'set-1', name: 'Set 1', paramValues: { Sampler_Seed: '100' }, checked: true, ... },
    { id: 'set-2', name: 'Set 2', paramValues: { Sampler_Seed: '200' }, checked: true, ... },
  ]

  // 補完ロジック（実装と同じ）
  const updatedSets = sets.map(s => ({
    ...s,
    paramValues: { ...defaultParams, ...s.paramValues },
  }))

  // Checkpoint（新規ロール）がデフォルト値で補完されること
  expect(updatedSets[0].paramValues.Checkpoint).toBe('model_A.safetensors')
  expect(updatedSets[1].paramValues.Checkpoint).toBe('model_A.safetensors')

  // 既存の保存値は保持されること
  expect(updatedSets[0].paramValues.Sampler_Seed).toBe('100')
  expect(updatedSets[1].paramValues.Sampler_Seed).toBe('200')
})
```

#### TC-2: 全キーが存在する場合は sets を変更しない（hasNewKeys=false）

```typescript
it('should not update sets when all roles already exist in paramValues', () => {
  const defaultParams = { Sampler_Seed: '42' }
  const sets = [
    { id: 'set-1', paramValues: { Sampler_Seed: '999' }, ... },
  ]

  const hasNewKeys = sets.some(s =>
    Object.keys(defaultParams).some(k => !(k in s.paramValues))
  )

  expect(hasNewKeys).toBe(false)
})
```

#### TC-3: sets が空配列の場合に例外が発生しない

```typescript
it('should not throw when sets is empty', () => {
  const defaultParams = { Checkpoint: 'model_A.safetensors' }
  const sets: GenerationSet[] = []

  expect(() => {
    const hasNewKeys = sets.some(s =>
      Object.keys(defaultParams).some(k => !(k in s.paramValues))
    )
    if (hasNewKeys) {
      sets.map(s => ({ ...s, paramValues: { ...defaultParams, ...s.paramValues } }))
    }
  }).not.toThrow()
})
```

#### TC-4: localStorage に保存済みparamsがある場合、新規キーがマージされること

```typescript
it('should merge defaultParams with savedParams when new keys are missing in savedParams', () => {
  const defaultParams = { Sampler_Seed: '42', Checkpoint: 'model_A.safetensors' }
  const savedParams  = { Sampler_Seed: '999' }  // Checkpoint キーなし

  const merged = { ...defaultParams, ...savedParams }

  expect(merged.Checkpoint).toBe('model_A.safetensors')  // デフォルト値が補完
  expect(merged.Sampler_Seed).toBe('999')                 // 保存済みの値を優先
})
```

#### TC-5: localStorage に保存済みparamsがあり全キー存在する場合、保存値のみ使用

```typescript
it('should use savedParams as-is when no new keys are missing', () => {
  const defaultParams = { Sampler_Seed: '42', Checkpoint: 'model_A.safetensors' }
  const savedParams  = { Sampler_Seed: '999', Checkpoint: 'model_B.safetensors' }

  const hasNewKeys = Object.keys(defaultParams).some(k => !(k in savedParams))

  expect(hasNewKeys).toBe(false)
  // setParamValues(savedParams) が呼ばれること（getInitialParamsのデフォルト値で上書きされない）
  expect(savedParams.Checkpoint).toBe('model_B.safetensors')
})
```

---

## 3. 実行コマンド

```bash
cd frontend
npx vitest run src/pages/GeneratePage/hooks/__tests__/useWorkflowParams.test.ts
```

全テストパス確認後、既存テスト全体の回帰も実行:
```bash
npx vitest run
```

---

## 4. 手動検証手順

1. SettingsPage → Mapping Masters → CheckpointLoaderSimpleノードに新規ロール（例: `Checkpoint_Model`、type: カスタムCheckpoint型）を追加して保存
2. GeneratePage をリロード（ワークフロー再フェッチのトリガー）
3. ParamPanel でCheckpointセレクタに `json_body` 元のモデル名が表示されていること
4. セットを2つ以上作成（Set 1, Set 2）
5. Set 1 でモデルAを選択、Set 2でモデルBを選択
6. 両セットにチェックしてGenerate
7. ComfyUIターミナルで各ジョブの `ckpt_name` がそれぞれ正しいモデル名になっていること

### 境界ケース
- **セットなし（デフォルトのみ）**: モデル選択 → Generate → 正しく送信されること
- **マッピング追加前に作成したセット**: リロード後に補完されて初期値が設定されていること
