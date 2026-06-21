# Task Card: REQ-060-FIX-T1

---

## メタデータ

| 項目 | 値 |
|---|---|
| **Task ID** | REQ-060-FIX-T1 |
| **Parent PBI** | REQ-060-FIX |
| **Title** | useMasterMappingRows: マップスキャン結果の警告とマッチング判定の優先度整理 |
| **Role** | Engineer |
| **Estimated Effort** | XS（～15分）|
| **Target Files** | 1ファイル |

---

## Atomicity Check

- **Impacted Files Count**: 1（`useMasterMappingRows.ts` のみ）
- **Atomicity Check**: ✅ PASS（≤ 3）

---

## 背景・目的

ワークフローのアップロード時および再スキャン時のマッピング確認画面で、自動スキャン結果に複数候補（duplicated）やクラス不一致（class_type_mismatch）などの警告があるにもかかわらず、1つ目の候補がマッチ（ok）と判定されることで警告が隠蔽され、ドロップダウンに候補が出現せず直接入力しかできなくなっている問題を修正します。

---

## 実装指示

### 対象ファイル

`frontend/src/hooks/useMasterMappingRows.ts`

### 変更内容

**Step 1**: `buildRows` 内の `for (const master of masters)` ループにおける `matched` と `warning` の条件分岐を整理し、`warning`（競合や不一致など）が存在する場合は警告側の条件分岐（`duplicated` または `class_type_mismatch`）を優先して実行するように条件フローを統合・修正します。

**Step 2**: 正常に1:1マッチ（`ok`）した場合でも、ユーザーがそのノードIDを選択できるように `candidates` リストに `[matched.node_id]` を含めて返却します。

### 変更前（現状コード L27–L74）

```typescript
    for (const master of masters) {  // masters は sort_order 順で渡される
      const matched = matchedMap.get(master.id)
      const warning = warningMap.get(master.id)

      if (matched) {
        // ok マッチ
        mainRows.push({
          master,
          node_id: rowState[master.id] ?? matched.node_id,
          candidates: [],
          status: 'ok',
          node_title: matched.node_title,
        })
      } else if (warning) {
        if (warning.status === 'not_found') {
          notFoundRows.push({
            master,
            node_id: rowState[master.id] ?? '',
            candidates: [],
            status: 'not_found',
          })
        } else if (warning.status === 'duplicated') {
          const candidates = warning.node_ids ?? []
          mainRows.push({
            master,
            node_id: rowState[master.id] ?? candidates[0] ?? '',
            candidates,
            status: 'duplicated',
          })
        } else if (warning.status === 'class_type_mismatch') {
          const candidates = warning.node_id ? [warning.node_id] : []
          mainRows.push({
            master,
            node_id: rowState[master.id] ?? warning.node_id ?? '',
            candidates,
            status: 'class_type_mismatch',
          })
        }
      } else {
        // マスタにのみ存在、スキャン結果になし → not_found扱い
        notFoundRows.push({
          master,
          node_id: rowState[master.id] ?? '',
          candidates: [],
          status: 'not_found',
        })
      }
    }
```

### 変更後（修正コードの提案）

```typescript
    for (const master of masters) {
      const matched = matchedMap.get(master.id)
      const warning = warningMap.get(master.id)

      let status: 'ok' | 'duplicated' | 'class_type_mismatch' | 'not_found' = 'not_found'
      let candidates: string[] = []
      let node_id = rowState[master.id] ?? ''
      let node_title: string | undefined = undefined

      if (warning) {
        // warning が存在する（duplicated, class_type_mismatch, not_found）場合は警告側を優先
        status = warning.status as any
        if (warning.status === 'duplicated') {
          candidates = warning.node_ids ?? []
          if (!rowState[master.id] && candidates.length > 0) {
            node_id = candidates[0]
          }
        } else if (warning.status === 'class_type_mismatch') {
          candidates = warning.node_id ? [warning.node_id] : []
          if (!rowState[master.id] && warning.node_id) {
            node_id = warning.node_id
          }
        }
      } else if (matched) {
        // 警告がない場合のみ ok マッチ
        status = 'ok'
        node_title = matched.node_title
        if (!rowState[master.id]) {
          node_id = matched.node_id
        }
        // 1:1マッチの場合でも、ドロップダウンから選択可能なように候補に含める
        candidates = [matched.node_id]
      }

      const row: MasterMappingRow = {
        master,
        node_id,
        candidates,
        status,
        node_title,
      }

      if (status === 'not_found') {
        notFoundRows.push(row)
      } else {
        mainRows.push(row)
      }
    }
```

---

## Acceptance Criteria（完了基準）

- [x] AC-1: マップスキャン時に複数候補がある場合、ステータスが `duplicated` となりドロップダウンに対象候補がすべて表示されること
- [x] AC-2: マップスキャン時に1:1マッチした場合、ステータスが `ok` となり、初期値が選択されているかつドロップダウン候補にそのIDが表示されること
- [x] AC-3: テキストエリアで直接入力した値が正しくマッピングに反映されること

---

## 参照ドキュメント

- インシデントレポート: `docs/incident_report.md`（REQ-060 セクション）
- テストプラン: `docs/design/PBI-REQ-060-FIX-test-plan.md`
