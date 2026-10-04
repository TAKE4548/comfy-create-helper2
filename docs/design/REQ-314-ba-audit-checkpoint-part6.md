# REQ-314 BA Audit: part 6/8
Audit this fragment of the complete design, test plan and all 14 Task Cards. Other definitions may be in other fragments; do not invent defects solely from missing context. State findings with exact artifact/task references. User browser tests are manual and excluded from autonomous checks; typecheck/Vitest remain. D1: six real prompt keys versus AC-4 seven is an explicit unresolved human decision. D2: Backend/LM Studio URL editing versus unchanged API/schema is an explicit unresolved human decision. Do not require approval bypass or falsely mark those AC passed. Review acceptance coverage, logical contradictions, ownership/dependencies, testability and actual new gaps.

 translation: ['translation_ja_to_en','translation_en_to_ja'],
} as const
const GROUP_PARAMS = {
 prompt: ['llm_params_audit','llm_params_scene_generate'],
 dialogue: ['llm_params_speech_draft'],
 translation: ['llm_params_translation'],
} as const
// models: dialogue=speech_draft_vlm_model/speech_draft_llm_model;
// translation=translation_model; prompt=getCurrentModel/updateCurrentModel
// PARAM_FIELDS: temperature 0..2 step.1; top_p 0..1 step.05;
// max_tokens 1..8192 step1; presence/frequency_penalty -2..2 step.1
// DEFAULT_PARAMS: {.2,1,1000,0,0} in above field order
```
- query keys: `llm-prompts`, `llm-models`, `llm-current-model`, `workflows`, `settings-vram` を維持。
- backend/API/schemaは変更しない。保存先keyを表示ラベルに置き換えない。
- 正規hash順序: workflows / prompt / dialogue / translation / system。
- 詳細設計: `docs/design/REQ-314.md`。関連ACの条件付き判定は `REQ-314-test-plan.md`。

## Implementation Logic
- [ ] 既存のquery/mutation/保存IDを再利用してgroupでmodel枠・promptリスト・paramsリストを明示allowlist絞込。prompts全件mapを止めて未知keyやmodel/debounce JSONをeditorへ出さない。
- [ ] prompt=メインmodel+6既存prompt+audit/scene params。dialogue=VLM/LLM model+3prompt+speech params。translation=翻訳model+2prompt+translation params。translation_debounceはT4へ移す。固定keyは下記allowlistを使用。
- [ ] prompt/dialogueはそれぞれ1つの詳細カード内にprompt/paramsを集約し同じisExpandedPrompts状態に従う（呼出側isExpandedParamsも同値）。modelは常時可視。role/aria-expanded対応buttonで詳細toggle。
- [ ] セリフ3labelをPBI指定役割名へ変更し短い補足を添える。編集値はtask以外groupへ伝播させず同じ保存key/PARAM_FIELDS/DEFAULT_PARAMSを維持。query refetch時未保存paramsを上書きしないdirty key保護を入れる。
- [ ] AC-4は6/7件数決定までBLOCKED。7件目の新設やAPI追加をこのカードでしない。新group以外互換分岐は将来廃止せず既存呼出を保つ。

## Acceptance / Verification
各groupの正確なキー集合、modelID重複なし、3役割label、詳細初期閉、同一PUTペイロード、unknown key非表示、refetch後dirty params不変を検証。
期待: typecheck exit 0、指定test全件PASS。異常系も実行し、失敗原因と結果を記録。設計段階では未実行。
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/frontend'
npm run typecheck
npx vitest run src/pages/SettingsPage/components/__tests__/LlmSettingsSection.test.tsx
```


## Artifact: docs\backlog\task\active\REQ-314-T4.md
---
id: REQ-314-T4
pbi: REQ-314
status: pending
tags: [frontend, settings, REQ-314]
related_paths:
  - frontend/src/pages/SettingsPage/components/TranslationSettingsSection.tsx
  - frontend/src/pages/SettingsPage/components/__tests__/TranslationSettingsSection.test.tsx
depends_on: [REQ-314-T3, REQ-314-T6]
---

# REQ-314-T4: 翻訳設定の集約とprovider即時条件表示

## Review Gate
2026-10-04ユーザー指定: 実ブラウザ検証はユーザーが手動実施。エージェントのブラウザ操作・ブラウザ自動化テストは自律検証から除外する。VitestによるDOM/統合/異常系検証は維持し、手動項目は未確認のチェックリストとして引き渡す。
設計レビュー承認前は実行禁止。D1（6/7 prompt）とD2（接続URL）が未決定のためREQ-314全体は承認待ち。
所有範囲以外を変更しない。他担当の変更を取り消さず、共有ファイルはDAG順に実行する。

## Target / Atomicity
- `C:/Users/audih/ws/comfy-create-helper2/frontend/src/pages/SettingsPage/components/TranslationSettingsSection.tsx`
- `C:/Users/audih/ws/comfy-create-helper2/frontend/src/pages/SettingsPage/components/__tests__/TranslationSettingsSection.test.tsx`
依存: REQ-314-T3, REQ-314-T6。所有 2 ファイル、実装＋局所テストの追加削除合計 280 行以下（見積り）。Atomicity: PASS（設計時）。300変更行を超える場合は担当者が分割設計を差し戻し、超過して進めない。

## Hermetic Context
### Required types / signatures
```tsx
type TranslationProvider = 'google_cloud' | 'deepl' | 'llm' | 'fugumt'
interface TranslationSettingsSectionProps { isExpanded: boolean; onToggle: () => void }
interface LlmPrompt { id: number; key: string; content: string; description: string | null; updated_at: string }
// 同梱: LlmSettingsSection group='translation'
// 同梱: TranslationPreviewCard { provider: TranslationProvider; enabled: boolean; debounceMs: number }
```

### Existing surgical context
出典: `frontend/src/pages/SettingsPage/components/TranslationSettingsSection.tsx`（設計時点、27行）。新ファイルはこの既存契約に接続する。
```tsx
    queryFn: () => llmPromptsApi.list() as Promise<LlmPrompt[]>,
  })

  const { data: cacheStats, refetch: refetchStats } = useQuery({
    queryKey: ['translate-stats'],
    queryFn: translateApi.getStats,
  })

  const [provider, setProvider] = useState<'google_cloud' | 'deepl' | 'llm' | 'fugumt'>(
    'google_cloud'
  )
  const [apiKey, setApiKey] = useState('')
  const [apiUrl, setApiUrl] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [saved, setSaved] = useState(false)

  // Test connection state
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<TranslateTestResponse | null>(null)

  // Sync state from fetched prompts
  useEffect(() => {
    if (prompts) {
      const pRecord = prompts.find((p) => p.key === 'translation_provider')
      if (pRecord?.content) {
        if (pRecord.content === 'google_free') {
          setProvider('google_cloud')
```

### Stable contracts
- query keys: `llm-prompts`, `llm-models`, `llm-current-model`, `workflows`, `settings-vram` を維持。
- backend/API/schemaは変更しない。保存先keyを表示ラベルに置き換えない。
- 正規hash順序: workflows / prompt / dialogue / translation / system。
- 詳細設計: `docs/design/REQ-314.md`。関連ACの条件付き判定は `REQ-314-test-plan.md`。

## Implementation Logic
- [ ] provider draftを表示条件の唯一の正本にする。保存前でもllmなら詳細表示、他なら即時hidden。React Query更新前でも反映。hidden内LLM editorはmountを保持し入力draftを失わない。
- [ ] 翻訳model/日英prompt/paramsはgroup=translationからここにだけ配置。translation_debounceを300..2000/step50/既定500で同じkeyへ保存。基本カード、テスト翻訳カード、LLM詳細カードの3枠。 PreviewCardへ検証済debounceMsを渡す。
- [ ] API認証入力はgoogle_cloud/deeplのみ。FuguMTはproviderのみ更新。既存疎通test/統計/cache clear/古いgoogle_free→google_cloud対応を維持。基本保存に未変更/無関係キーを追加しない。
- [ ] 基本設定が未保存/保存失敗/保存中はプレビューenabled=falseと保存案内。保存成功後、確定providerとkey/urlを使う。refetch時はdirty provider/apiKey/apiUrlを上書きせず、保存成功値と照合してdirty解除。
- [ ] プロバイダー切替で詳細内focusが隠れる場合selectへfocusを戻す。LLM詳細を隠しても翻訳query/保留レスポンスを誤表示しない。

## Acceptance / Verification
4providerの保存前即時可視、認証欄条件、FuguMT PUTキー1件、debounce境界、未保存draft/refetch/保存失敗/プレビュー無効状態を検証。
期待: typecheck exit 0、指定test全件PASS。異常系も実行し、失敗原因と結果を記録。設計段階では未実行。
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/frontend'
npm run typecheck
npx vitest run src/pages/SettingsPage/components/__tests__/TranslationSettingsSection.test.tsx
```


## Artifact: docs\backlog\task\active\REQ-314-T5.md
---
id: REQ-314-T5
pbi: REQ-314
status: pending
tags: [frontend, settings, REQ-314]
related_paths:
  - frontend/src/pages/SettingsPage/components/WorkflowConnectionSection.tsx
  - frontend/src/pages/SettingsPage/components/__tests__/WorkflowConnectionSection.test.tsx
depends_on: [REQ-314-T14]
---

# REQ-314-T5: ワークフローとシステム設定の表示責務分離

## Review Gate
2026-10-04ユーザー指定: 実ブラウザ検証はユーザーが手動実施。エージェントのブラウザ操作・ブラウザ自動化テストは自律検証から除外する。VitestによるDOM/統合/異常系検証は維持し、手動項目は未確認のチェックリストとして引き渡す。
設計レビュー承認前は実行禁止。D1（6/7 prompt）とD2（接続URL）が未決定のためREQ-314全体は承認待ち。
所有範囲以外を変更しない。他担当の変更を取り消さず、共有ファイルはDAG順に実行する。

## Target / Atomicity
- `C:/Users/audih/ws/comfy-create-helper2/frontend/src/pages/SettingsPage/components/WorkflowConnectionSection.tsx`
- `C:/Users/audih/ws/comfy-create-helper2/frontend/src/pages/SettingsPage/components/__tests__/WorkflowConnectionSection.test.tsx`
依存: REQ-314-T14。所有 2 ファイル、実装＋局所テストの追加削除合計 210 行以下（見積り）。Atomicity: PASS（設計時）。300変更行を超える場合は担当者が分割設計を差し戻し、超過して進めない。

## Hermetic Context
### Required types / signatures
```tsx
export interface WorkflowConnectionSectionProps {
 group?: 'workflows' | 'system' // 未指定は現行互換
 isExpandedLongPress: boolean; onToggleLongPress: () => void
 isExpandedWorkflows: boolean; onToggleWorkflows: () => void
 isExpandedConnections: boolean; onToggleConnections: () => void
}
// ServiceConnectionCard は system のConnections枠へ配置
```

### Existing surgical context
出典: `frontend/src/pages/SettingsPage/components/WorkflowConnectionSection.tsx`（設計時点、29行）。新ファイルはこの既存契約に接続する。
```tsx
export interface WorkflowConnectionSectionProps {
  isExpandedLongPress: boolean
  onToggleLongPress: () => void
  isExpandedWorkflows: boolean
  onToggleWorkflows: () => void
  isExpandedConnections: boolean
  onToggleConnections: () => void
}

export function WorkflowConnectionSection({
  isExpandedLongPress,
  onToggleLongPress,
  isExpandedWorkflows,
  onToggleWorkflows,
  isExpandedConnections,
  onToggleConnections,
}: WorkflowConnectionSectionProps) {
  const qc = useQueryClient()
  const [saved, setSaved] = useState<string | null>(null)
  const [comfyUrl, setComfyUrl] = useState('http://localhost:8188')
  const [longPressMultiSelect, setLongPressMultiSelect] = useState(0.8)
  const [longPressCardMove, setLongPressCardMove] = useState(0.5)

  // Workflow states
  const [workflowManageMode, setWorkflowManageMode] = useState<'rename' | 'copy' | null>(null)
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null)
  const [expandedPresetWorkflowId, setExpandedPresetWorkflowId] = useState<number | null>(null)
  const [showWorkflowDeleteDialog, setShowWorkflowDeleteDialog] = useState(false)
  const [deleteWorkflowDetails, setDeleteWorkflowDetails] = useState({
```

### Stable contracts
- query keys: `llm-prompts`, `llm-models`, `llm-current-model`, `workflows`, `settings-vram` を維持。
- backend/API/schemaは変更しない。保存先keyを表示ラベルに置き換えない。
- 正規hash順序: workflows / prompt / dialogue / translation / system。
- 詳細設計: `docs/design/REQ-314.md`。関連ACの条件付き判定は `REQ-314-test-plan.md`。

## Implementation Logic
- [ ] group=workflowsでワークフロー本体・プリセット・CRUD/差分解析/rollback/削除modalだけを描画。group=systemで長押し2スライダー＋T14接続カードを描画。未指定は従来互換。
- [ ] workflows query/rollback status副作用はgroup!==systemでenabled/guardし、system instanceへ不要なworkflow接続を増やさない。既存handlerとquery keyは保持。
- [ ] systemの長押し0.1..5秒、既存2つのLS_KEYSを維持。display card内へ表示できるheading構造にし、トップレベルaccordionを残さない。
- [ ] 変更は表示条件と接続枠の委譲に絞る。差分/復元ロジックの一括移動・全面リライトを避け300変更行以下。

## Acceptance / Verification
groupごとの見出し/controls、workflow-only modal、差分/復元/名前/複製APIペイロード、system側workflow不要fetchなし、長押しLS保存を検証。
期待: typecheck exit 0、指定test全件PASS。異常系も実行し、失敗原因と結果を記録。設計段階では未実行。
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/frontend'
npm run typecheck
npx vitest run src/pages/SettingsPage/components/__tests__/WorkflowConnectionSection.test.tsx
```


## Artifact: docs\backlog\task\active\REQ-314-T6.md
---
id: REQ-314-T6
pbi: REQ-314
status: pending
tags: [frontend, settings, REQ-314]
related_paths:
  - frontend/src/pages/SettingsPage/components/TranslationPreviewCard.tsx
  - frontend/src/pages/SettingsPage/components/__tests__/TranslationPreviewCard.test.tsx
depends_on: []
---

# REQ-314-T6: 原文入力と翻訳プレビュー

## Review Gate
2026-10-04ユーザー指定: 実ブラウザ検証はユーザーが手動実施。エージェントのブラウザ操作・ブラウザ自動化テストは自律検証から除外する。VitestによるDOM/統合/異常系検証は維持し、手動項目は未確認のチェックリストとして引き渡す。
設計レビュー承認前は実行禁止。D1（6/7 prompt）とD2（接続URL）が未決定のためREQ-314全体は承認待ち。
所有範囲以外を変更しない。他担当の変更を取り消さず、共有ファイルはDAG順に実行する。

## Target / Atomicity
- `C:/Users/audih/ws/comfy-create-helper2/frontend/src/pages/SettingsPage/components/TranslationPreviewCard.tsx`
- `C:/Users/audih/ws/comfy-create-helper2/frontend/src/pages/SettingsPage/components/__tests__/TranslationPreviewCard.test.tsx`
依存: なし。所有 2 ファイル、実装＋局所テストの追加削除合計 255 行以下（見積り）。Atomicity: PASS（設計時）。300変更行を超える場合は担当者が分割設計を差し戻し、超過して進めない。

## Hermetic Context
### Required types / signatures
```tsx
export interface TranslationPreviewCardProps {
 provider: 'google_cloud' | 'deepl' | 'llm' | 'fugumt'; enabled: boolean; debounceMs: number
}
