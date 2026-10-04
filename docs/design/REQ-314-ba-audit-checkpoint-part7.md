# REQ-314 BA Audit: part 7/8
Audit this fragment of the complete design, test plan and all 14 Task Cards. Other definitions may be in other fragments; do not invent defects solely from missing context. State findings with exact artifact/task references. User browser tests are manual and excluded from autonomous checks; typecheck/Vitest remain. D1: six real prompt keys versus AC-4 seven is an explicit unresolved human decision. D2: Backend/LM Studio URL editing versus unchanged API/schema is an explicit unresolved human decision. Do not require approval bypass or falsely mark those AC passed. Review acceptance coverage, logical contradictions, ownership/dependencies, testability and actual new gaps.

export function TranslationPreviewCard(props: TranslationPreviewCardProps): React.JSX.Element
interface PromptTranslateRequest { prompt: string; source_lang?: string; target_lang?: string; provider?: string; repack?: boolean }
interface PromptTranslateResponse { translated_prompt: string; meta: { total_chunks: number; cached_chunks: number; api_requested_chunks: number; billed_characters: number; provider: string } }
```

### Existing surgical context
出典: `frontend/src/api/client.ts`（設計時点、20行）。新ファイルはこの既存契約に接続する。
```tsx
export const translateApi = {
  translatePrompt: (data: PromptTranslateRequest) =>
    request<PromptTranslateResponse>('/translate/prompt', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  testConnection: (data: TranslateTestRequest) =>
    request<TranslateTestResponse>('/translate/test', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getStats: () =>
    request<{ cached_entries_count: number }>('/translate/stats'),
  clearCache: () =>
    request<{ message: string; cleared_count: number }>('/translate/clear-cache', {
      method: 'POST',
    }),
}

// ─── Speech Batch Rewrite ─────────────────────────────────────────
```

### Stable contracts
- query keys: `llm-prompts`, `llm-models`, `llm-current-model`, `workflows`, `settings-vram` を維持。
- backend/API/schemaは変更しない。保存先keyを表示ラベルに置き換えない。
- 正規hash順序: workflows / prompt / dialogue / translation / system。
- 詳細設計: `docs/design/REQ-314.md`。関連ACの条件付き判定は `REQ-314-test-plan.md`。

## Implementation Logic
- [ ] textarea原文＋日英/英日方向＋読取専用訳文をカード内配置。原文変更に保存済translation_debounce（300..2000、fallback500）を適用、明示実行buttonも提供。
- [ ] translateApi.translatePrompt({prompt,source_lang,target_lang,provider})を既存契約で呼ぶ。未保存providerはenabled=false。空白原文・同一pending入力の重複送信をしない。
- [ ] request sequenceをinput/direction/provider/enabled変更とunmountで進め、古いresponse/rejectionを表示に使わない。入力変更時旧訳文はクリアしloading/errorをaria-liveで通知。API clientにAbortSignalを追加しない。
- [ ] type/label連携44px操作、保存されていない原文はカードstate保持。英語UI内部キーを説明ラベルとして露出しない。

## Acceptance / Verification
debounce fake timer、空白抑止、方向payload、provider変更/無効化/連続入力の遅延レスポンス逆転、失敗/再試行を検証。
期待: typecheck exit 0、指定test全件PASS。異常系も実行し、失敗原因と結果を記録。設計段階では未実行。
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/frontend'
npm run typecheck
npx vitest run src/pages/SettingsPage/components/__tests__/TranslationPreviewCard.test.tsx
```


## Artifact: docs\backlog\task\active\REQ-314-T7.md
---
id: REQ-314-T7
pbi: REQ-314
status: pending
tags: [frontend, settings, REQ-314]
related_paths:
  - frontend/src/pages/SettingsPage.tsx
  - frontend/src/pages/__tests__/SettingsPage.test.tsx
depends_on: [REQ-314-T1, REQ-314-T2, REQ-314-T3, REQ-314-T4, REQ-314-T5, REQ-314-T11]
---

# REQ-314-T7: SettingsPageの5パネル統合とVRAM購読

## Review Gate
2026-10-04ユーザー指定: 実ブラウザ検証はユーザーが手動実施。エージェントのブラウザ操作・ブラウザ自動化テストは自律検証から除外する。VitestによるDOM/統合/異常系検証は維持し、手動項目は未確認のチェックリストとして引き渡す。
設計レビュー承認前は実行禁止。D1（6/7 prompt）とD2（接続URL）が未決定のためREQ-314全体は承認待ち。
所有範囲以外を変更しない。他担当の変更を取り消さず、共有ファイルはDAG順に実行する。

## Target / Atomicity
- `C:/Users/audih/ws/comfy-create-helper2/frontend/src/pages/SettingsPage.tsx`
- `C:/Users/audih/ws/comfy-create-helper2/frontend/src/pages/__tests__/SettingsPage.test.tsx`
依存: REQ-314-T1, REQ-314-T2, REQ-314-T3, REQ-314-T4, REQ-314-T5, REQ-314-T11。所有 2 ファイル、実装＋局所テストの追加削除合計 290 行以下（見積り）。Atomicity: PASS（設計時）。300変更行を超える場合は担当者が分割設計を差し戻し、超過して進めない。

## Hermetic Context
### Required types / signatures
```tsx
type SettingsTabId = 'workflows' | 'prompt' | 'dialogue' | 'translation' | 'system'
type DetailsState = { prompt: boolean; dialogue: boolean }
// useSettingsTab() / SettingsTabBar({activeTab,onSelect})
// useSystemStats(): void
// export { SpeechTonePresetModal } を維持
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
- [ ] 全5tabpanelを同時mountしhidden属性とページ限定CSSの[hidden]{display:none}で非選択を消す。id/aria-labelledbyをtabと対応させ、選択panelのみtabIndex=0。React keyは固定id。未保存draft/開いたpreset/modalをtab切替で失わない。
- [ ] 基本カードを初期展開し、prompt/dialogue詳細は新v2キーのbooleanのみ採用し既定false。try/catch・object検証で壊れJSONを無害化。従来expandedSections型のexport互換を必要なら維持。
- [ ] workflows=workflow/base/mapping。prompt=group prompt。dialogue=tones＋group dialogueのmodels＋embedded bubble＋1詳細。translation=T4。system=接続/VRAM/thumbnail＋長押し。
- [ ] T3 groupのmodelsとadvancedの間にbubbleを配置するslot prop（ReactNode）をT3契約に追加し、T7はそこへBubbleDetectionSection embeddedを渡す。その他のEditorやAPIを複製しない。
- [ ] useSystemStatsをSettingsPageで1回呼びページ全体の寿命で購読、VramGuardSection既存store読取を使用。非選択panelではmodalもhiddenに従う（body portalを増やさない）。
- [ ] T11 CSS importとroot req314-settingsクラス。内部scroll領域に<768pxだけpadding-bottom:calc(6rem + env(safe-area-inset-bottom))。AppShell既存lg境界とpaddingを変更しない。

## Acceptance / Verification
9ACのカード帰属・非選択focus不可・draft往復保持・詳細v2・既存tone CRUDテストをBrowserRouterで適応。useSystemStats mock/store更新でVRAM値追従とunmount cleanup呼出を確認。
期待: typecheck exit 0、指定test全件PASS。異常系も実行し、失敗原因と結果を記録。設計段階では未実行。
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/frontend'
npm run typecheck
npx vitest run src/pages/__tests__/SettingsPage.test.tsx
```


## Artifact: docs\backlog\task\active\REQ-314-T8.md
---
id: REQ-314-T8
pbi: REQ-314
status: pending
tags: [frontend, settings, REQ-314]
related_paths:
  - frontend/src/pages/SettingsPage/components/SpeechToneSection.tsx
  - frontend/src/pages/SettingsPage/components/__tests__/SpeechToneSection.test.tsx
depends_on: []
---

# REQ-314-T8: 口調プリセットのモバイルカード表示

## Review Gate
2026-10-04ユーザー指定: 実ブラウザ検証はユーザーが手動実施。エージェントのブラウザ操作・ブラウザ自動化テストは自律検証から除外する。VitestによるDOM/統合/異常系検証は維持し、手動項目は未確認のチェックリストとして引き渡す。
設計レビュー承認前は実行禁止。D1（6/7 prompt）とD2（接続URL）が未決定のためREQ-314全体は承認待ち。
所有範囲以外を変更しない。他担当の変更を取り消さず、共有ファイルはDAG順に実行する。

## Target / Atomicity
- `C:/Users/audih/ws/comfy-create-helper2/frontend/src/pages/SettingsPage/components/SpeechToneSection.tsx`
- `C:/Users/audih/ws/comfy-create-helper2/frontend/src/pages/SettingsPage/components/__tests__/SpeechToneSection.test.tsx`
依存: なし。所有 2 ファイル、実装＋局所テストの追加削除合計 230 行以下（見積り）。Atomicity: PASS（設計時）。300変更行を超える場合は担当者が分割設計を差し戻し、超過して進めない。

## Hermetic Context
### Required types / signatures
```tsx
interface SpeechTonePreset { id: number; name: string; prompt: string; description?: string | null; sort_order: number; created_at: string }
export interface SpeechToneSectionProps { isExpanded: boolean; onToggle: () => void }
interface SpeechTonePresetCreate { name: string; prompt: string; description?: string | null; sort_order?: number }
export interface SpeechTonePresetModalProps { mode: 'create' | 'edit'; initial?: SpeechTonePreset | null; isPending: boolean; onClose: () => void; onSubmit: (data: SpeechTonePresetCreate) => void }
```

### Existing surgical context
出典: `frontend/src/pages/SettingsPage/components/SpeechToneSection.tsx`（設計時点、27行）。新ファイルはこの既存契約に接続する。
```tsx
            <div className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-surface overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[rgba(255,255,255,0.06)] text-zinc-400 bg-white/[0.01]">
                    <th className="px-4 py-3 font-medium">プリセット名</th>
                    <th className="px-4 py-3 font-medium">プロンプト指示</th>
                    <th className="px-4 py-3 font-medium">説明</th>
                    <th className="px-4 py-3 font-medium text-center w-16">順序</th>
                    <th className="px-4 py-3 font-medium text-right w-24">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(255,255,255,0.04)] text-zinc-300">
                  {tonePresets.map((tp) => (
                    <tr key={tp.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 font-medium text-zinc-100 whitespace-nowrap">
                        {tp.name}
                      </td>
                      <td className="px-4 py-3 text-zinc-300 max-w-xs truncate" title={tp.prompt}>
                        {tp.prompt}
                      </td>
                      <td className="px-4 py-3 text-zinc-400 max-w-xs truncate">
                        {tp.description || '-'}
                      </td>
                      <td className="px-4 py-3 text-zinc-500 font-mono text-center">
                        {tp.sort_order}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
```

### Stable contracts
- query keys: `llm-prompts`, `llm-models`, `llm-current-model`, `workflows`, `settings-vram` を維持。
- backend/API/schemaは変更しない。保存先keyを表示ラベルに置き換えない。
- 正規hash順序: workflows / prompt / dialogue / translation / system。
- 詳細設計: `docs/design/REQ-314.md`。関連ACの条件付き判定は `REQ-314-test-plan.md`。

## Implementation Logic
- [ ] 同一tonePreset.mapを使い768px未満だけtable rowをカード縦積みにする。名前・指示全文・表示順・description・編集/削除が見えるdata-labelとモバイルwrapを付ける。desktop列は維持。
- [ ] theadはdisplay:noneではなくsr-only式で見出し意味を保持、必要なrole補強。duplicate interactive DOMの二重renderを避ける。作成/編集modalの既存mutation契約保持。
- [ ] h2開閉buttonを常時カード見出しへ扱えるprops運用とし、作成buttonのnested buttonを避ける。ボタン/field44pxはT11共通CSSも使う。

## Acceptance / Verification
表示順が読める、長文ラベル、edit/delete正確ID、modal作成/保存/キャンセル、空一覧を検証。CSS実測はT12。
期待: typecheck exit 0、指定test全件PASS。異常系も実行し、失敗原因と結果を記録。設計段階では未実行。
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/frontend'
npm run typecheck
npx vitest run src/pages/SettingsPage/components/__tests__/SpeechToneSection.test.tsx
```


## Artifact: docs\backlog\task\active\REQ-314-T9.md
---
id: REQ-314-T9
pbi: REQ-314
status: pending
tags: [frontend, settings, REQ-314]
related_paths:
  - frontend/src/pages/SettingsPage/components/MappingMasterSection.tsx
