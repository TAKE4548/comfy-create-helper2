# インシデントレポート: 生成ページでseedをランダムにしても、ランダムになっていない問題

## 1. 現象・症状
生成ページ（GeneratePage）において、シード設定を「Shuffle」（ランダムモード）に設定して画像を生成した際、生成される画像のシード値がランダムに変化せず、固定値（あるいはデフォルト値）のまま生成されてしまう。

## 2. 再現手順
1. 生成ページにて、シード設定を「Shuffle」（サイコロアイコン / ランダムモード）に切り替える（入力フィールドが非活性になることを確認）。
2. 画像生成を実行する。
3. キューに送られたワークフローパラメータや、生成された結果のメタデータを確認すると、シード値が毎回同じ値（固定値）で実行されている。

## 3. 原因究明 (Root Cause Isolation)
調査の結果、フロントエンドの生成アクション処理におけるシード注入ロジックに不整合があることが特定されました。

- **該当箇所**: [useGenerateAction.ts](../frontend/src/pages/GeneratePage/hooks/useGenerateAction.ts#L44-L51)
  ```typescript
  // Inject seed for Sampler_Seed role
  const seedNode = workflow.mappings.find((m) => m.role === 'Sampler_Seed')
  if (seedNode) {
    const node = wfJson[seedNode.node_id] as Record<string, unknown> | undefined
    if (node) {
      const inputs = node.inputs as Record<string, unknown>
      inputs['seed'] = seedMode === 'random' ? Math.floor(Math.random() * 2 ** 32) : seed + i
    }
  }
  ```
- **詳細原因**:
  - `workflow.mappings` の処理では、対象ノードの入力パラメータ名（`m.param_name`）や、代替キー（`'value'`）を動的に判定して値を設定しています。
  - しかし、その後のシード注入処理において、ノードの入力値（`inputs`）に設定するキー名が `inputs['seed']` とハードコードされています。
  - ワークフロー内でシードが別名キー（例: プリミティブノードなどの `'value'`）で管理されている場合、`inputs['seed']` にランダム値を設定しても無視されてしまいます。
  - その結果、マッピング処理で `paramValues['Sampler_Seed']`（固定値）から設定された `inputs['value']` がそのまま適用され続け、ランダム化されない現象が発生します。

## 4. 対策方針 (Proposed Solution)
本インシデントは **Type A (Implementation Bug: 実装バグ)** に分類されます。

- **修正の方針**:
  - `useGenerateAction.ts` 内で `inputs['seed']` をハードコードするのではなく、対象の `seedNode` で定義されているパラメータ名（`seedNode.param_name` または `'value'` 等のフォールバック）を動的に解決してランダム値またはインクリメント値を代入するように修正します。

---

## 5. 診断チェック (Diagnostic Check)
- **Root Cause Isolated**: Yes
- **Classification**: Type A (Implementation Bug)
- **Route**: `/dev-design` へ進み、フロントエンドの `useGenerateAction.ts` におけるシード動的キー解決ロジックの修正設計およびタスク定義に進みます。
