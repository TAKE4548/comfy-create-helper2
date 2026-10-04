# REQ-314 BA Audit: part 5/8
Audit this fragment of the complete design, test plan and all 14 Task Cards. Other definitions may be in other fragments; do not invent defects solely from missing context. State findings with exact artifact/task references. User browser tests are manual and excluded from autonomous checks; typecheck/Vitest remain. D1: six real prompt keys versus AC-4 seven is an explicit unresolved human decision. D2: Backend/LM Studio URL editing versus unchanged API/schema is an explicit unresolved human decision. Do not require approval bypass or falsely mark those AC passed. Review acceptance coverage, logical contradictions, ownership/dependencies, testability and actual new gaps.

python 'C:/Users/audih/.gemini/antigravity/scripts/doc_mapper.py' docs/specs frontend/src/pages/SettingsPage
git diff --check -- docs/specs/SPEC_SETTINGS.md docs/specs/SPEC_COMMON.md docs/specs/SPEC_SUMMARY.md
```


## Artifact: docs\backlog\task\active\REQ-314-T14.md
---
id: REQ-314-T14
pbi: REQ-314
status: pending
tags: [frontend, settings, REQ-314]
related_paths:
  - frontend/src/pages/SettingsPage/components/ServiceConnectionCard.tsx
  - frontend/src/pages/SettingsPage/components/__tests__/ServiceConnectionCard.test.tsx
depends_on: []
---

# REQ-314-T14: 外部サービス接続カードの既存契約移動

## Review Gate
2026-10-04ユーザー指定: 実ブラウザ検証はユーザーが手動実施。エージェントのブラウザ操作・ブラウザ自動化テストは自律検証から除外する。VitestによるDOM/統合/異常系検証は維持し、手動項目は未確認のチェックリストとして引き渡す。
設計レビュー承認前は実行禁止。D1（6/7 prompt）とD2（接続URL）が未決定のためREQ-314全体は承認待ち。
所有範囲以外を変更しない。他担当の変更を取り消さず、共有ファイルはDAG順に実行する。

## Target / Atomicity
- `C:/Users/audih/ws/comfy-create-helper2/frontend/src/pages/SettingsPage/components/ServiceConnectionCard.tsx`
- `C:/Users/audih/ws/comfy-create-helper2/frontend/src/pages/SettingsPage/components/__tests__/ServiceConnectionCard.test.tsx`
依存: なし。所有 2 ファイル、実装＋局所テストの追加削除合計 255 行以下（見積り）。Atomicity: PASS（設計時）。300変更行を超える場合は担当者が分割設計を差し戻し、超過して進めない。

## Hermetic Context
### Required types / signatures
```tsx
export function ServiceConnectionCard(): React.JSX.Element
// useGenerationStore selectors:
// comfyUrl: string | null; setComfyUrl: (url: string) => void
// useConfig(): UseQueryResult<{comfy_url: string}>
// resolveComfyUrl(url: string | null): string
// 新ServiceConnectionCard内で独立したcheckを実装しresponse.okを確認
// 現行ConnectionStatusはfetchのHTTP statusを検査しないためそのまま再利用しない
// llmPromptsApi.getModels(): Promise<string[]>
```

### Existing surgical context
出典: `frontend/src/store/slices/connectionSlice.ts`（設計時点、29行）。新ファイルはこの既存契約に接続する。
```tsx
    comfyUrl: localStorage.getItem(LS_KEYS.COMFY_URL),
    submissionAbortController: null,

    setSubmissionAbortController: (controller) => set({ submissionAbortController: controller }),
    abortSubmission: () => {
      const controller = get().submissionAbortController
      if (controller) {
        controller.abort()
        set({ submissionAbortController: null })
      }
    },

    clearPreview: () => {
      const prevUrl = get().previewImage
      if (prevUrl && prevUrl.startsWith('blob:')) {
        try { URL.revokeObjectURL(prevUrl) } catch {}
      }
      set({ previewImage: null, progress: null })
    },

    setComfyUrl: (url) => {
      comfyWsService.clearReconnectTimer()
      localStorage.setItem(LS_KEYS.COMFY_URL, url)
      set({ comfyUrl: url })
      comfyWsService.disconnect()
      get().initialize()
    },

    initialize: (options?: { force?: boolean }) => {
```

### Stable contracts
- query keys: `llm-prompts`, `llm-models`, `llm-current-model`, `workflows`, `settings-vram` を維持。
- backend/API/schemaは変更しない。保存先keyを表示ラベルに置き換えない。
- 正規hash順序: workflows / prompt / dialogue / translation / system。
- 詳細設計: `docs/design/REQ-314.md`。関連ACの条件付き判定は `REQ-314-test-plan.md`。

## Implementation Logic
- [ ] D2人間決定が先行必須。推奨UI限定案はComfy URLのdraft入力＋保存で既存store.setComfyUrlへ渡す。空/不正http(s)入力は保存抑止。自動typing保存で接続再初期化を連打しない。
- [ ] Comfy実効URLはstore値優先→config値→既存default。Backendはwindow.location.origin/healthで疎通、API BASE_URL=/api固定。LM Studioはモデル一覧の既存backend経由APIで疎通を判定する。
- [ ] LM Studio実際URLをfrontendが取得する契約は無いため、default1234を現在設定として偽装しない。'.envのLLM_BASE_URLで変更'と取得不可を説明。Backend表示をeditできるふりのinputにしない。
- [ ] 疎通はBackend/Comfyの既存URLにfetch({signal:AbortSignal.timeout(3000)})しresponse.okを確認。HTTP4xx/5xxもerror。現行ConnectionStatusの『fetch解決=成功』動作を再利用しない。localStorageは既存COMFY_URLと既存store保存を使用し新API/schema/config書込を作らない。結果と失敗messageをaria-live。API拡張案を人間が選んだ場合このカードを含め設計再作成が必要。

## Acceptance / Verification
Comfy store引数/実効URL、invalidURL抑止、Backend origin health、LM models backend経由/失敗、urlを偽装しない。AC-7原文は未達を記録。
期待: typecheck exit 0、指定test全件PASS。異常系も実行し、失敗原因と結果を記録。設計段階では未実行。
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/frontend'
npm run typecheck
npx vitest run src/pages/SettingsPage/components/__tests__/ServiceConnectionCard.test.tsx
```


## Artifact: docs\backlog\task\active\REQ-314-T2.md
---
id: REQ-314-T2
pbi: REQ-314
status: pending
tags: [frontend, settings, REQ-314]
related_paths:
  - frontend/src/pages/SettingsPage/components/SettingsTabBar.tsx
  - frontend/src/pages/SettingsPage/components/__tests__/SettingsTabBar.test.tsx
depends_on: [REQ-314-T1]
---

# REQ-314-T2: 水平タブバーとキーボード操作

## Review Gate
2026-10-04ユーザー指定: 実ブラウザ検証はユーザーが手動実施。エージェントのブラウザ操作・ブラウザ自動化テストは自律検証から除外する。VitestによるDOM/統合/異常系検証は維持し、手動項目は未確認のチェックリストとして引き渡す。
設計レビュー承認前は実行禁止。D1（6/7 prompt）とD2（接続URL）が未決定のためREQ-314全体は承認待ち。
所有範囲以外を変更しない。他担当の変更を取り消さず、共有ファイルはDAG順に実行する。

## Target / Atomicity
- `C:/Users/audih/ws/comfy-create-helper2/frontend/src/pages/SettingsPage/components/SettingsTabBar.tsx`
- `C:/Users/audih/ws/comfy-create-helper2/frontend/src/pages/SettingsPage/components/__tests__/SettingsTabBar.test.tsx`
依存: REQ-314-T1。所有 2 ファイル、実装＋局所テストの追加削除合計 245 行以下（見積り）。Atomicity: PASS（設計時）。300変更行を超える場合は担当者が分割設計を差し戻し、超過して進めない。

## Hermetic Context
### Required types / signatures
```tsx
import type { SettingsTabId } from '../hooks/useSettingsTab'
export interface SettingsTabBarProps { activeTab: SettingsTabId; onSelect: (id: SettingsTabId) => void }
export function SettingsTabBar(props: SettingsTabBarProps): React.JSX.Element
```

### Existing surgical context
出典: `frontend/src/pages/SettingsPage.tsx`（設計時点、27行）。新ファイルはこの既存契約に接続する。
```tsx
        <LlmSettingsSection
          isExpandedModel={expandedSections.llmModel}
          onToggleModel={() => toggleSection('llmModel')}
          isExpandedPrompts={expandedSections.prompts}
          onTogglePrompts={() => toggleSection('prompts')}
          isExpandedParams={expandedSections.llmParams}
          onToggleParams={() => toggleSection('llmParams')}
        />

        {/* Translation Settings */}
        <TranslationSettingsSection
          isExpanded={expandedSections.translation}
          onToggle={() => toggleSection('translation')}
        />

        {/* Bubble Detection Parameters */}
        <BubbleDetectionSection
          isExpanded={expandedSections.bubbleDetection}
          onToggle={() => toggleSection('bubbleDetection')}
        />

        {/* Speech Tone Presets */}
        <SpeechToneSection
          isExpanded={expandedSections.speechTones}
          onToggle={() => toggleSection('speechTones')}
        />

```

### Stable contracts
- query keys: `llm-prompts`, `llm-models`, `llm-current-model`, `workflows`, `settings-vram` を維持。
- backend/API/schemaは変更しない。保存先keyを表示ラベルに置き換えない。
- 正規hash順序: workflows / prompt / dialogue / translation / system。
- 詳細設計: `docs/design/REQ-314.md`。関連ACの条件付き判定は `REQ-314-test-plan.md`。

## Implementation Logic
- [ ] 5tabの順序/名前/hashは設計書どおり。各button id=settings-tab-{id}, aria-controls=settings-panel-{id}, role=tab, aria-selected、選択のみtabIndex=0。
- [ ] ArrowLeft/Right循環、Home/End先頭/末尾でfocusと選択を同時変更。Tabは通常移動。Enter/Spaceはbutton本来の動作。キーdefault抑止は実処理時のみ。
- [ ] >=768pxはgrid-cols-5等分、<768pxはoverflow-x-auto snap-x snap-mandatory＋snap-start、短縮labelを表示。aria-labelは常に長い名前。44px高、両端pointer-events-noneフェード、scrollIntoView({block:'nearest',inline:'nearest'})。

## Acceptance / Verification
5個tab、選択1個、controls対応、roving tabIndex、循環/Home/End、通常Tab、クリック後focus、長短label契約を検証。幅実測はT12。
期待: typecheck exit 0、指定test全件PASS。異常系も実行し、失敗原因と結果を記録。設計段階では未実行。
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/frontend'
npm run typecheck
npx vitest run src/pages/SettingsPage/components/__tests__/SettingsTabBar.test.tsx
```


## Artifact: docs\backlog\task\active\REQ-314-T3.md
---
id: REQ-314-T3
pbi: REQ-314
status: pending
tags: [frontend, settings, REQ-314]
related_paths:
  - frontend/src/pages/SettingsPage/components/LlmSettingsSection.tsx
  - frontend/src/pages/SettingsPage/components/__tests__/LlmSettingsSection.test.tsx
depends_on: []
---

# REQ-314-T3: LLM設定の目的別グループと詳細折りたたみ

## Review Gate
2026-10-04ユーザー指定: 実ブラウザ検証はユーザーが手動実施。エージェントのブラウザ操作・ブラウザ自動化テストは自律検証から除外する。VitestによるDOM/統合/異常系検証は維持し、手動項目は未確認のチェックリストとして引き渡す。
設計レビュー承認前は実行禁止。D1（6/7 prompt）とD2（接続URL）が未決定のためREQ-314全体は承認待ち。
所有範囲以外を変更しない。他担当の変更を取り消さず、共有ファイルはDAG順に実行する。

## Target / Atomicity
- `C:/Users/audih/ws/comfy-create-helper2/frontend/src/pages/SettingsPage/components/LlmSettingsSection.tsx`
- `C:/Users/audih/ws/comfy-create-helper2/frontend/src/pages/SettingsPage/components/__tests__/LlmSettingsSection.test.tsx`
依存: なし。所有 2 ファイル、実装＋局所テストの追加削除合計 290 行以下（見積り）。Atomicity: PASS（設計時）。300変更行を超える場合は担当者が分割設計を差し戻し、超過して進めない。

## Hermetic Context
### Required types / signatures
```tsx
export type LlmSettingsGroup = 'prompt' | 'dialogue' | 'translation'
export interface LlmSettingsSectionProps {
 group?: LlmSettingsGroup // 未指定は従来呼出互換
 isExpandedModel: boolean; onToggleModel: () => void
 isExpandedPrompts: boolean; onTogglePrompts: () => void
 isExpandedParams: boolean; onToggleParams: () => void
 modelFooter?: React.ReactNode
}
export interface LlmParams { temperature: number; top_p: number; max_tokens: number; presence_penalty: number; frequency_penalty: number }
// llmPromptsApi.update(key: string, data: unknown): Promise<LlmPrompt>
// dialogueモデルカード内のモデルselect直後へ modelFooter を描画
```

### Existing surgical context
出典: `frontend/src/pages/SettingsPage/components/LlmSettingsSection.tsx`（設計時点、29行）。新ファイルはこの既存契約に接続する。
```tsx
export const PROMPT_LABELS: Record<string, string> = {
  audit_interference: '干渉タグ診断（SDXL/汎用）',
  audit_interference_anima: '干渉タグ診断（Anima）',
  audit_vocabulary: '語彙サジェスト（SDXL/汎用）',
  audit_physical: '物理・構図整合性チェック',
  scene_generate: 'Scene Generator プロンプト',
  scene_generate_anima: 'Scene Generator プロンプト（Animaモード）',
  translation_ja_to_en: '翻訳システムプロンプト (日 -> 英)',
  translation_en_to_ja: '翻訳システムプロンプト (英 -> 日)',
  speech_draft_vlm_prompt: 'セリフ下書き: VLM システムプロンプト',
  speech_draft_llm_prompt: 'セリフ下書き: LLM システムプロンプト',
  speech_rewrite_system_prompt: 'セリフ口調変換: システムプロンプト',
}

export const PARAM_LABELS: Record<string, string> = {
  llm_params_translation: '翻訳パラメータ設定',
  llm_params_scene_generate: 'Scene Generator パラメータ設定',
  llm_params_audit: 'プロンプト診断パラメータ設定',
  llm_params_speech_draft: 'セリフ下書きパラメータ設定',
}

export const PARAM_FIELDS: { key: keyof LlmParams; label: string; min: number; max: number; step: number }[] = [
  { key: 'temperature', label: 'Temperature (温度)', min: 0.0, max: 2.0, step: 0.1 },
  { key: 'top_p', label: 'Top P (核サンプリング)', min: 0.0, max: 1.0, step: 0.05 },
  { key: 'max_tokens', label: 'Max Tokens (最大トークン数)', min: 1, max: 8192, step: 1 },
  { key: 'presence_penalty', label: 'Presence Penalty (存在ペナルティ)', min: -2.0, max: 2.0, step: 0.1 },
  { key: 'frequency_penalty', label: 'Frequency Penalty (頻度ペナルティ)', min: -2.0, max: 2.0, step: 0.1 },
]

```

### Stable contracts
```ts
const GROUP_PROMPTS = {
 prompt: ['audit_interference','audit_interference_anima','audit_vocabulary','audit_physical','scene_generate','scene_generate_anima'],
 dialogue: ['speech_draft_vlm_prompt','speech_draft_llm_prompt','speech_rewrite_system_prompt'],
