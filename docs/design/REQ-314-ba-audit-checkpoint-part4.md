# REQ-314 BA Audit: part 4/8
Audit this fragment of the complete design, test plan and all 14 Task Cards. Other definitions may be in other fragments; do not invent defects solely from missing context. State findings with exact artifact/task references. User browser tests are manual and excluded from autonomous checks; typecheck/Vitest remain. D1: six real prompt keys versus AC-4 seven is an explicit unresolved human decision. D2: Backend/LM Studio URL editing versus unchanged API/schema is an explicit unresolved human decision. Do not require approval bypass or falsely mark those AC passed. Review acceptance coverage, logical contradictions, ownership/dependencies, testability and actual new gaps.

期待: typecheck exit 0、指定test全件PASS。異常系も実行し、失敗原因と結果を記録。設計段階では未実行。
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/frontend'
npm run typecheck
npx vitest run src/pages/SettingsPage/components/__tests__/BaseModelSection.test.tsx
```


## Artifact: docs\backlog\task\active\REQ-314-T11.md
---
id: REQ-314-T11
pbi: REQ-314
status: pending
tags: [frontend, settings, REQ-314]
related_paths:
  - frontend/src/pages/SettingsPage/SettingsResponsive.css
  - frontend/src/pages/SettingsPage/components/BubbleDetectionSection.tsx
  - frontend/src/pages/SettingsPage/components/ThumbnailSettingsSection.tsx
depends_on: []
---

# REQ-314-T11: 設定限定のレスポンシブ規則と小設定埋込

## Review Gate
2026-10-04ユーザー指定: 実ブラウザ検証はユーザーが手動実施。エージェントのブラウザ操作・ブラウザ自動化テストは自律検証から除外する。VitestによるDOM/統合/異常系検証は維持し、手動項目は未確認のチェックリストとして引き渡す。
設計レビュー承認前は実行禁止。D1（6/7 prompt）とD2（接続URL）が未決定のためREQ-314全体は承認待ち。
所有範囲以外を変更しない。他担当の変更を取り消さず、共有ファイルはDAG順に実行する。

## Target / Atomicity
- `C:/Users/audih/ws/comfy-create-helper2/frontend/src/pages/SettingsPage/SettingsResponsive.css`
- `C:/Users/audih/ws/comfy-create-helper2/frontend/src/pages/SettingsPage/components/BubbleDetectionSection.tsx`
- `C:/Users/audih/ws/comfy-create-helper2/frontend/src/pages/SettingsPage/components/ThumbnailSettingsSection.tsx`
依存: なし。所有 3 ファイル、実装＋局所テストの追加削除合計 190 行以下（見積り）。Atomicity: PASS（設計時）。300変更行を超える場合は担当者が分割設計を差し戻し、超過して進めない。

## Hermetic Context
### Required types / signatures
```tsx
export interface BubbleDetectionParams { min_area: number; min_brightness: number }
export interface BubbleDetectionSectionProps { isExpanded: boolean; onToggle: () => void; embedded?: boolean }
// embedded=true は同一save/query本体を描画し独立カード枠とtoggleのみ除く
// ThumbnailSettingsSection: React.FC （公開props変更なし）
```

### Existing surgical context
出典: `frontend/src/pages/SettingsPage/components/BubbleDetectionSection.tsx`（設計時点、29行）。新ファイルはこの既存契約に接続する。
```tsx

export interface BubbleDetectionParams {
  min_area: number
  min_brightness: number
}

export interface BubbleDetectionSectionProps {
  isExpanded: boolean
  onToggle: () => void
}

export function BubbleDetectionSection({ isExpanded, onToggle }: BubbleDetectionSectionProps) {
  const qc = useQueryClient()
  const [saved, setSaved] = useState(false)
  const [bubbleDetectionParams, setBubbleDetectionParams] = useState<BubbleDetectionParams>({
    min_area: 1000,
    min_brightness: 150,
  })

  const { data: prompts } = useQuery({
    queryKey: ['llm-prompts'],
    queryFn: () => llmPromptsApi.list() as Promise<LlmPrompt[]>,
    staleTime: STALE_TIMES.LLM_PROMPTS,
  })

  useEffect(() => {
    if (prompts) {
      const record = prompts.find((p) => p.key === 'bubble_detection_params')
      if (record && record.content) {
```

### Stable contracts
- query keys: `llm-prompts`, `llm-models`, `llm-current-model`, `workflows`, `settings-vram` を維持。
- backend/API/schemaは変更しない。保存先keyを表示ラベルに置き換えない。
- 正規hash順序: workflows / prompt / dialogue / translation / system。
- 詳細設計: `docs/design/REQ-314.md`。関連ACの条件付き判定は `REQ-314-test-plan.md`。

## Implementation Logic
- [ ] .req314-settings内に限定したCSS。hidden強制、flex min-width:0、<768pxのinput/select/textarea/button/role=buttonに44px高・必要なicon/drag handle幅44px、checkboxは44pxlabel/実hitbox化。desktop不要な一律幅を強制しない。
- [ ] settings-mobile-tableのみtable/tbody/tr/tdを縦積みblock/card化しdata-labelに可視labelを付ける。theadをsr-onlyにしrolesは各カード所有taskで確認。body全体overflow-xを隠して問題をごまかさない。
- [ ] settings内のworkflow/presetアクション行とdialogフォームをflex-wrap/max-width:100%にし、modalの下端/close領域がnavを越えないscrollable範囲を確保。既存fixed modalはroot配下でありグローバルCSSを汚さない。
- [ ] Bubble embeddedの枠だけ変えmin_area/min_brightness範囲とbubble_detection_params JSONを維持。thumbnailのカスタム入力w-48固定と長説明をmax-w-fullへ調整、既存livepreview保持。

## Acceptance / Verification
既存ThumbnailSettingsSectionとページtestで保存/preview/Bubble埋込互換を確認。hitboxやtable/viewport/safe-areaの測定はT12のユーザー手動確認チェックリストに記載する。
期待: typecheck exit 0、指定test全件PASS。異常系も実行し、失敗原因と結果を記録。設計段階では未実行。
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/frontend'
npm run typecheck
npx vitest run src/pages/SettingsPage/components/__tests__/ThumbnailSettingsSection.test.tsx src/pages/__tests__/SettingsPage.test.tsx
```


## Artifact: docs\backlog\task\active\REQ-314-T12.md
---
id: REQ-314-T12
pbi: REQ-314
status: pending
tags: [frontend, settings, REQ-314]
related_paths:
  - frontend/src/pages/__tests__/SettingsPage.req314.test.tsx
  - docs/design/REQ-314-walkthrough.md
depends_on: [REQ-314-T7, REQ-314-T8, REQ-314-T9, REQ-314-T10]
---

# REQ-314-T12: 受入統合テストと手動確認チェックリスト

## Review Gate
2026-10-04ユーザー指定: 実ブラウザ検証はユーザーが手動実施。エージェントのブラウザ操作・ブラウザ自動化テストは自律検証から除外する。VitestによるDOM/統合/異常系検証は維持し、手動項目は未確認のチェックリストとして引き渡す。
設計レビュー承認前は実行禁止。D1（6/7 prompt）とD2（接続URL）が未決定のためREQ-314全体は承認待ち。
所有範囲以外を変更しない。他担当の変更を取り消さず、共有ファイルはDAG順に実行する。

## Target / Atomicity
- `C:/Users/audih/ws/comfy-create-helper2/frontend/src/pages/__tests__/SettingsPage.req314.test.tsx`
- `C:/Users/audih/ws/comfy-create-helper2/docs/design/REQ-314-walkthrough.md`
依存: REQ-314-T7, REQ-314-T8, REQ-314-T9, REQ-314-T10。所有 2 ファイル、実装＋局所テストの追加削除合計 290 行以下（見積り）。Atomicity: PASS（設計時）。300変更行を超える場合は担当者が分割設計を差し戻し、超過して進めない。

## Hermetic Context
### Required types / signatures
```tsx
// render wrapper: BrowserRouter + QueryClientProvider
// QueryClient defaultOptions.queries.retry=false
// mock useSystemStats / useGenerationStore.systemStats / llmPromptsApi / settingsApi
// vitest + @testing-library/react/user-event。ブラウザ実測はユーザーの手動報告だけを別記録
```

### Existing surgical context
出典: `frontend/src/pages/__tests__/SettingsPage.test.tsx`（設計時点、27行）。新ファイルはこの既存契約に接続する。
```tsx
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })
    vi.mocked(speechTonePresetsApi.list).mockResolvedValue(mockTonePresets)
  })

  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <SettingsPage />
      </QueryClientProvider>
    )
  }

  it('renders speech tone presets section and lists presets upon expanding', async () => {
    renderComponent()

```

### Stable contracts
- query keys: `llm-prompts`, `llm-models`, `llm-current-model`, `workflows`, `settings-vram` を維持。
- backend/API/schemaは変更しない。保存先keyを表示ラベルに置き換えない。
- 正規hash順序: workflows / prompt / dialogue / translation / system。
- 詳細設計: `docs/design/REQ-314.md`。関連ACの条件付き判定は `REQ-314-test-plan.md`。

## Implementation Logic
- [ ] 全5tab帰属、保存key/API維持、初期詳細閉、provider保存前条件、tab往復draft、hash/履歴/keyboardを統合testで検証。T7既存testをduplicated全suiteにしない。
- [ ] desktop1280x900/768境界、mobile767/390/320pxのtest-plan E2E/RTをユーザー用手動チェックリストとしてwalkthroughに日本語記載。エージェントはブラウザ操作・実測を実施しない。結果はユーザー手動確認待ちとし、報告が得られた項目のみ観測/結果を記録する。
- [ ] AC-4/AC-7はレビュー決定の変更記録が揃うまでBLOCKED/UNMET。6種や接続情報だけ表示してoriginal AC PASSを付けない。
- [ ] 自律3-Gateはtypecheck・局所/full frontend suite・Vitestで実行可能な異常系/契約/DOM検証とlocal QA auditをコーディネーターへ渡す。ブラウザ手動確認待ちは自律Gate失敗とせず、未確認ACをPASSにしない。実装前このtaskは実行しない。

## Acceptance / Verification
テスト追加約230行＋walkthrough約60行以内。各AC coverage表と未実施/条件付き結果が一致。
期待: typecheck exit 0、指定test全件PASS。異常系も実行し、失敗原因と結果を記録。設計段階では未実行。
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/frontend'
npm run typecheck
npx vitest run src/pages/__tests__/SettingsPage.req314.test.tsx
```
ユーザー手動確認用URL（エージェント実行対象外）: 稼働中のアプリorigin（例 http://localhost:8000）に `/settings#workflows` を付加。CSS寸法をjsdom結果で代用しない。


## Artifact: docs\backlog\task\active\REQ-314-T13.md
---
id: REQ-314-T13
pbi: REQ-314
status: pending
tags: [frontend, settings, REQ-314]
related_paths:
  - docs/specs/SPEC_SETTINGS.md
  - docs/specs/SPEC_COMMON.md
  - docs/specs/SPEC_SUMMARY.md
depends_on: [REQ-314-T7, REQ-314-T8, REQ-314-T9, REQ-314-T10]
---

# REQ-314-T13: 実装後SSoTの設定仕様同期

## Review Gate
2026-10-04ユーザー指定: 実ブラウザ検証はユーザーが手動実施。エージェントのブラウザ操作・ブラウザ自動化テストは自律検証から除外する。VitestによるDOM/統合/異常系検証は維持し、手動項目は未確認のチェックリストとして引き渡す。
設計レビュー承認前は実行禁止。D1（6/7 prompt）とD2（接続URL）が未決定のためREQ-314全体は承認待ち。
所有範囲以外を変更しない。他担当の変更を取り消さず、共有ファイルはDAG順に実行する。

## Target / Atomicity
- `C:/Users/audih/ws/comfy-create-helper2/docs/specs/SPEC_SETTINGS.md`
- `C:/Users/audih/ws/comfy-create-helper2/docs/specs/SPEC_COMMON.md`
- `C:/Users/audih/ws/comfy-create-helper2/docs/specs/SPEC_SUMMARY.md`
依存: REQ-314-T7, REQ-314-T8, REQ-314-T9, REQ-314-T10。所有 3 ファイル、実装＋局所テストの追加削除合計 140 行以下（見積り）。Atomicity: PASS（設計時）。300変更行を超える場合は担当者が分割設計を差し戻し、超過して進めない。

## Hermetic Context
### Required types / signatures
```tsx
// Frontmatter tags: settings, REQ-314
// related_paths: frontend/src/pages/SettingsPage.tsx,
// frontend/src/pages/SettingsPage/, docs/design/REQ-314.md
```

### Existing surgical context
出典: `docs/specs/SPEC_SETTINGS.md`（設計時点、27行）。新ファイルはこの既存契約に接続する。
```tsx
## 2. 機能一覧（設定セクション群）

| セクション | 説明 |
|---|---|
| **LLM 設定** | 使用する LLM モデル（ローカル/外部）の選択、システムプロンプト編集、詳細パラメータ（Temperature、Top-P、MaxTokens 等）の調整 |
| **翻訳設定** | プロンプト翻訳機能のプロバイダー設定（FuguMT [推奨・CPU常駐・初回自動配置・APIキー不要] / Google Cloud / DeepL / LLM）、APIキー、デバウンス時間、キャッシュクリア、翻訳統計確認 |
| **フキダシ検出設定** | 画像内のフキダシ自動検出パラメータ（最小面積 `min_area`、輝度閾値 `min_brightness`）の調整 |
| **セリフ口調プリセット** | キャラクター性に応じた口調変換プリセット（ツンデレ、お嬢様、敬語等）の CRUD とリアルタイム書き換えテスト |
| **ノードマッピングマスタ** | MappingMaster の一覧・登録・編集・削除・並び替え（D&D、`PUT /reorder`）・一括編集、カスタムパラメータ型マスタ（`ParamTypeMaster`）の管理 |
| **サムネイル表示設定** | アプリケーション全体でのサムネイル表示アスペクト比（1:1 正方形, 3:4 縦長, 4:3 横長, 16:9 ワイド等）の切り替え |
| **Base Model 設定** | ベースモデル（SD1.5, SDXL, Pony, Illustrious, Flux 等）の定義と、ComfyUI チェックポイントファイル（.safetensors）との自動マッピング管理 |
| **操作・ワークフロー・接続** | 複数選択モード起動の長押し時間設定、ワークフロー一覧・削除、FastAPI / ComfyUI のリアルタイム接続ステータス確認 |

---

## 3. レイアウト（折り畳みアコーディオン構成）

各セクションの開閉状態は `localStorage` キー `prompt-surgeon-settings-sections-expanded` に永続化される。

```
┌─────────────────────────────────────────────────────────┐
│ Settings                                                │
├─────────────────────────────────────────────────────────┤
│ ▼ LLM Model, Prompts & Params                           │
│   - モデル選択ドロップダウン                            │
│   - システムプロンプト編集（audit, scene_generate 等）  │
│   - 詳細パラメータスライダー                            │
```

### Stable contracts
- query keys: `llm-prompts`, `llm-models`, `llm-current-model`, `workflows`, `settings-vram` を維持。
- backend/API/schemaは変更しない。保存先keyを表示ラベルに置き換えない。
- 正規hash順序: workflows / prompt / dialogue / translation / system。
- 詳細設計: `docs/design/REQ-314.md`。関連ACの条件付き判定は `REQ-314-test-plan.md`。

## Implementation Logic
- [ ] SPEC_SETTINGSのlayout/コンポーネント/開閉storage/グループ表を実装結果で5tab仕様へ更新。旧prompt混在構造の図を置き換える。
- [ ] SPEC_COMMONは設定局所768px breakpointとAppShell既存lg breakpointの併存、tab ARIA/履歴契約への参照だけ追記。SPEC_SUMMARYはcomponent参照と設定機能サマリだけ同期。
- [ ] 人間が確定したD1/D2記録を必ず参照。Backend/LM Studio URLが読取不可のまま『設定可能』と記載しない。API表は今回不変、現実との差（google_cloud/health）を既存契約へ正す。

## Acceptance / Verification
3spec内のbacklink/hash/keys一致、旧構造残存なし。doc_mapper SettingsPage→SPEC_SETTINGS trace、git diff --check対象docs。
期待: typecheck exit 0、指定test全件PASS。異常系も実行し、失敗原因と結果を記録。設計段階では未実行。
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2'
