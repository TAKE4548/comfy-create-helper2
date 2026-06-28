# 設計書 - REQ-091: useAuditAction.tsテスト実装とマルチ監査タイプ仕様の修正

## 1. 目的と概要
`useAuditAction.ts` フックは、画像生成用のプロンプトに対してLLMを用いた監査（LLM Audit）を実行するための状態管理およびAPI呼び出しロジックを提供します。
しかし、現在このフックに対するユニットテストが存在しておらず、また仕様書 `SPEC_GENERATE.md` で言及されている3つの監査タイプ（`interference`, `vocabulary`, `physical`）をマルチ選択する（配列として管理・送信する）機能の型安全性や動作が十分に保証されていません。
さらに、現在の実装にはポジティブプロンプトの抽出時に `Negative_Prompt` が誤って混入してしまうバグが含まれています。

本設計では、これらの問題を解消するために以下の対応を行います：
1. `useAuditAction.ts` に対するユニットテストの追加とテストカバレッジの確保。
2. 監査タイプのマルチ選択仕様（配列）に適合するよう型定義を強化。
3. ポジティブプロンプト抽出ロジックのバグ修正。
4. API呼び出し時のモックテストによる状態遷移（loading, error, done, auditResult）の検証。

---

## 2. 変更・設計内容

### 2.1 プロンプト抽出ロジックのバグ修正 (AC-3)
現在のコードでは、`paramValues` からキー名に `positive` または `prompt` が含まれる項目をすべてポジティブプロンプト（`pos`）として抽出して結合しています。
```typescript
const pos = Object.entries(paramValues)
  .filter(([k]) => k.toLowerCase().includes('positive') || k.toLowerCase().includes('prompt'))
  .map(([, v]) => v)
  .join(', ')
```
しかし、`Negative_Prompt` というキー名は `prompt` を含んでいるため、ネガティブプロンプトの内容もポジティブプロンプトとして送信されてしまいます。

**修正案**:
キー名に `negative` が含まれる場合は除外するようにフィルタリング条件を修正します。
```typescript
const pos = Object.entries(paramValues)
  .filter(([k]) => {
    const keyLower = k.toLowerCase();
    return (keyLower.includes('positive') || keyLower.includes('prompt')) && !keyLower.includes('negative');
  })
  .map(([, v]) => v)
  .join(', ')
```

### 2.2 監査タイプの型安全性とマルチ選択仕様の整備 (AC-2)
`AuditRequest['audit_types']` に準拠した厳格なユニオン型 `AuditType` を定義し、初期値および選択更新処理が型安全に行えるようにします。

```typescript
export type AuditType = 'interference' | 'vocabulary' | 'physical';
```

`useAuditAction` 内の状態定義：
```typescript
const [auditTypes, setAuditTypes] = useState<AuditType[]>(['interference'])
```

### 2.3 エラー状態管理のサポート (AC-4)
`AuditPanel` などのUI側では `auditStatus` として `'error'` 状態を許容していますが、フックの既存ロジックでは API エラー発生時に `'error'` ステータスに遷移するようになっていません。
フックの `runAudit` mutation 実行時の例外キャッチにおいて、`setAuditStatus('error')` を呼び出すように修正します。

```typescript
const runAudit = useMutation({
  mutationFn: async () => {
    setAuditStatus('loading')
    try {
      // ... 抽出・API呼び出し処理 ...
      setAuditResult(res)
      setAuditStatus('done')
      return res
    } catch (error) {
      setAuditStatus('error')
      throw error
    }
  },
})
```

---

## 3. テスト設計

`useAuditAction.ts` に対するユニットテストを `frontend/src/pages/GeneratePage/hooks/__tests__/useAuditAction.test.ts` に新規追加します。

### 3.1 モック設計
- `useGenerationStore` のモック:
  `paramValues` に `Positive_Prompt`、`Another_Prompt`、`Negative_Prompt` などのテスト用ダミーデータを注入可能な構成にします。
- `auditApi.run` のモック:
  `vi.mock` を用いて、送信された引数（`audit_types`, `positive`, `negative`, `intent`）をキャプチャし、任意のレスポンス（正常/異常）を返すようにシミュレートします。

### 3.2 検証シナリオ (AC-1, AC-3, AC-4)
1. **初期状態の検証**:
   - `auditOpen` が `false` であること
   - `auditIntent` が空文字列であること
   - `auditTypes` が `['interference']` であること
   - `auditStatus` が `'idle'` であること
   - `auditResult` が `null` であること
2. **監査タイプの更新検証**:
   - `setAuditTypes` を呼び出して `['interference', 'vocabulary', 'physical']` に正常に更新されること
3. **正常系実行テスト (プロンプト抽出とAPIコール)**:
   - `runAudit.mutateAsync()` を実行した際、`auditApi.run` が正しい引数（ネガティブプロンプトが除外された `positive` プロンプト文字列、`negative` プロンプト、選択された `audit_types` 配列）で呼び出されること
   - 状態遷移が `loading` -> `done` となり、`auditResult` に API の返却値がセットされること
4. **異常系実行テスト (APIエラー時の状態遷移)**:
   - `auditApi.run` がエラーをスローするよう設定し、`runAudit.mutateAsync()` を呼び出した際、状態遷移が `loading` -> `error` となること
