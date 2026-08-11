# インシデント調査レポート: Checkpointセレクタ 空値送信エラー（最終版）

## 1. 概要
REQ-124でCheckpointセレクタ（カスタム型）をノードマッピングに追加した。Verifyでセットを作成してGenerateした場合、ComfyUI側で `ckpt_name: ''` として認識されバリデーションエラーになる。UIではモデルを選択しているにもかかわらず空文字になる。

```text
[ERROR] CheckpointLoaderSimple 1260:916:
[ERROR]   - Value not in list: ckpt_name: '' not in ['meinamix_v12Final.safetensors', ...]
```

## 2. 根本原因 (Root Cause) — 確定

### 主因: セット作成時点で Checkpoint ロールキーが存在しない

**証拠コード**:
`frontend/src/store/useGenerationStore.ts` `addSet`:
```typescript
const currentParamValues = { ...get().paramValues }  // L1240
const newSet: GenerationSet = {
  ...
  paramValues: currentParamValues,  // セット作成時点のparamsをコピー
  ...
}
```

**障害シナリオ**:

1. ユーザーがセットを作成した時点で、Checkpointロールは `paramValues` に存在しない  
   （Checkpointマッピングは REQ-124 で新規追加 → 既存セットの `paramValues` に当該キーなし）
2. ユーザーがUIでCheckpointを選択 → `setParamValues` → アクティブセット（`activeSetId`）のみ更新
3. `handleGenerateSets` でそのセットの `setItem.paramValues` を参照  
   → `paramValues[m.role] = undefined` → `val = paramValues[m.role] || '' = ""`  
   → `inputs['ckpt_name'] = ""` で送信

**証拠コード**:
`frontend/src/pages/GeneratePage/hooks/useGenerateAction.ts` `injectParams`:
```typescript
} else {
  val = paramValues[m.role] || ''   // role キーが存在しない場合 → ""
}
if (inputs[m.param_name] !== undefined) {
  inputs[m.param_name] = val        // "" で上書き
}
```

`frontend/src/store/useGenerationStore.ts` `updateActiveSet`:
```typescript
updateActiveSet: (updates) => {
  const activeSetId = get().activeSetId
  if (activeSetId === null) return          // アクティブセットのみ更新
  // → チェックのみされた他セットは更新されない
  ...
}
```

## 3. 障害分類
- **分類**: **Type A (Implementation Bug)**
- **影響箇所**: `useGenerateAction.ts` の `injectParams`
- **症状**: カスタム型(combo select)セレクタを含むマッピングで、セット作成後に値を選択しても、`paramValues` にキーが存在しない場合に空文字が注入される

## 4. 修正の方向性 (参考：/dev-design で正式設計)

| 修正案 | 概要 | リスク |
|--------|------|--------|
| A. `injectParams` にフォールバック追加 | `val === ""` の場合、元の `inputs[m.param_name]` の値を保持（上書きしない） | シンプル・低リスク |
| B. セット同期の強化 | `updateActiveSet` でアクティブ以外のセットにも新規キーを同期 | 副作用大きい |

**推奨: 修正案A** — `injectParams` において、カスタム型(select)で `val === ""` の場合はワークフロー元の値を保持する

## 5. 次のステップ
`/dev-design` へ移行して実装設計を行うか、この調査をもとに直接 `/dev-task` で修正タスクを作成することを推奨します。
