# インシデント調査レポート: Add Set 実行時に追加されたセットがアクティブ化されない件

## 1. 概要
生成画面（GeneratePage）において「+ Add Set」ボタンから新規プロファイル（セット）を作成した際、作成された新セットのタブは追加されるものの、アクティブ（選択状態）にならず、作成前の既存セットがアクティブなまま残る現像が発生している。

## 2. 再現手順
1. 生成画面（GeneratePage）を開く（例: Set 1 がアクティブな状態）。
2. ヘッダー/タブエリアの「+ Add Set」ボタンをクリックし、新規プロファイル作成モーダルを表示する。
3. 任意のプロファイル名（例: "Set 2"）を入力し、「作成」ボタンを押下する。
4. **期待結果**: 新しく追加された "Set 2" のタブが選択状態（アクティブ）になり、フォーム値も Set 2 の内容に切り替わる。
5. **実際の結果**: "Set 2" のタブは追加されるが、アクティブタブは "Set 1" のままであり、自動的に切り替わらない。

## 3. 根本原因 (Root Cause) — 確定

### 主因 1: `createPresetMutation.onSuccess` で `setActiveSetId` が呼ばれていない
`frontend/src/pages/GeneratePage/hooks/useGeneratePageState.ts` L489-499:
```typescript
onSuccess: (newPreset) => {
  if (newPreset?.id && selectedWorkflowId) {
    localStorage.setItem(
      `${LS_KEYS.ACTIVE_SET_PREFIX}${selectedWorkflowId}`,
      String(newPreset.id)
    )
    openPreset?.(newPreset.id)
  }
  qc.invalidateQueries({ queryKey: ['workflow-presets', selectedWorkflowId] })
  setNewPresetName('')
}
```
- 新規作成成功時、`localStorage` の保存と `openPreset`（開いているタブ一覧 `openPresetIds` への追加）は行われるが、Zustand store 上の `activeSetId` を更新する `setActiveSetId(newPreset.id)` が呼び出されていない。

### 主因 2: presets 同期エフェクトにおける `matchedPreset` 検索条件の不備
`frontend/src/pages/GeneratePage/hooks/useGeneratePageState.ts` L943-950:
```typescript
const matchedPreset = presets.find(
  p => String(p.id) === String(storedActiveStr) || String(p.id) === String(activeSetId)
)
```
- `qc.invalidateQueries` により `presets` クエリが再取得された際、上記の同期エフェクトが発火する。
- この時、`storedActiveStr` には `onSuccess` で書き込まれた新 Preset ID（例: `11`）が入っているが、`activeSetId` には未更新の旧 Preset ID（例: `10`）が入っている。
- `presets.find` 内の判定で `|| String(p.id) === String(activeSetId)` が含まれているため、`presets` 配列の先頭側にある旧 Preset (`id: 10`) が先に条件を満たしてヒットしてしまう。
- この結果、`targetActiveId` が旧 Preset ID (`10`) と評価され、`String(activeSetId) !== String(targetActiveId)` の条件を満たさず、新 Preset への切り替えが発生しない。

## 4. 障害分類
- **分類**: **Type A (Implementation Bug / 実装バグ)**
- **該当ファイル**: `frontend/src/pages/GeneratePage/hooks/useGeneratePageState.ts`
  - L489–L499 (`createPresetMutation.onSuccess`)
  - L943–L950 (`matchedPreset` 算出ロジック)

## 5. 修正の方向性 (参考：/dev-design で正式設計)
1. `createPresetMutation.onSuccess` 内で、`setActiveSetId(newPreset.id)` を明示的に呼び出し、さらにパラメータ等の状態も新 Preset の初期値に即時同期する。
2. presets 同期エフェクトにおいて、`storedActiveStr` に対応する Preset が存在する場合は `storedActiveStr` を優先して `matchedPreset` を決定するように評価順序・ロジックを修正する。

## 6. 次のステップ
調査完了につき、ユーザーの承認後に `/dev-design` Workflow を実行して詳細設計および実装タスクの分割を行います。
