---
id: REQ-347-design
status: draft
design_gate: pending
tags: [REQ-347, generate, settings, stage, design]
related_paths:
  - docs/backlog/pbi/active/REQ-347.md
  - docs/specs/SPEC_GENERATE.md
  - docs/specs/SPEC_SETTINGS.md
  - frontend/src/pages/GeneratePage/components/DesktopLayout.tsx
  - frontend/src/components/ParamPanel.tsx
  - frontend/src/components/AdaptiveWorkflowWiring.tsx
---

# REQ-347 ステージグループと追従見出しの設計

## Scope and Feasibility

実現可能。対象は生成ページの水平の仕切りで分かれたプロンプト・パラメータ入力、および Settings → ワークフロー →「対応付け・設定」のノード対応編集の3領域。既存の `desktop-prompt-scroll` / `desktop-controls-scroll` は独立したscroll root。内部の `ResizableSplitLayout direction="vertical"` は上下配置と水平の仕切りを表す。入力とプレビューの左右分割とは区別する。

Workspace / Git root は `C:/Users/audih/ws/comfy-create-helper2`。frontend・docsともこのroot配下、外部実装パスなし（Git_Root_Mismatch=No）。backend実装は変更なし。T13は既存API契約のOpenAPI snapshotのみ同期する。規定scriptはcontextから `GLOBAL_SCRIPTS=C:/Users/audih/.gemini/antigravity/scripts` に解決。

## Evidence and SSoT Impact

`doc_mapper.py docs/specs docs/backlog/pbi/active/REQ-347.md` は No mapped documents found。PBIの明示参照と変更箇所から下記を特定。未検出を影響なしの根拠にしない。

| 正本・依存 | 観測された契約 | 本要求の反映 |
|---|---|---|
| SPEC_GENERATE §2/2-3/2-5 | textareaとそれ以外を別入力へ描画。desktopタブの文書記述が実装と相違 | 2領域の独立group・追従・切替と既存role別値を記述 |
| SPEC_SETTINGS §3-1/4-1/7 | draft保護・variant対応付け・保存 | 連続stage groupと専用scrollを追記 |
| REQ-336設計 / api/types.ts | master→variant→stage、computed_roleが値キー | 既存型を参照、共有API型を変更しない |
| REQ-343設計 / WorkflowConnectionSection | variant_idを保持、未設定保存可 | 既存onChangeMappings/onSaveMappingsを使用 |
| REQ-348 ready PBI | 未設定ロール追加・全有効stage対応 | Settingsのenabled variant候補を保持。smart置換・検出の拡張はREQ-348 |

上流は useWorkflowManagement の validMappings/textMappings/paramMappings、既存 mapping-masters/stage-masters query、Settings activeStages。下流は TagChipEditor・assets・translation・paramValues・ParamSync・SeedField・workflow保存・preset。元mappingとroleをそのまま渡し、値・chips・asset・collapseキーを再構成しない。

取得元の根拠は `frontend/src/api/domains/stageMasters.ts` L10（`list(include_inactive = true): Promise<StageMaster[]>`）、`frontend/src/components/StageManagerModal.tsx` L42（`['stage-masters']` と `list(true)`）、`frontend/src/pages/SettingsPage/components/WorkflowConnectionSection.tsx` L146（同key、`list()`）、`frontend/src/pages/GeneratePage/hooks/useWorkflowManagement.ts` L3/L44（client importと `['mapping-masters']`）。master APIは生成と同じclientからimportし、実体 `frontend/src/api/domains/workflows.ts` L43の `list: () => request('/mapping-masters')` をqueryFnで `Promise<(MappingMaster | MappingMasterV2)[]>` にcastする。stage APIはclientからexportされていないためdomains/stageMastersから直接importする。別の型付きdomains/mappingMastersへ切り替えない。生成stateから工程一覧を受け取る既存propはないため、T3のhookが共有queryへ接続する。

既存API取得を利用するUI変更で、runtime endpoint・request/response契約は変更しない。r5では実装済みoptional variant_idがOpenAPI snapshotへ未反映と確認したため、T13でdocs/openapi.yamlとbackend/openapi.jsonを同期する。schema/endpointはopenapi_parserで抽出済み。

## Generation Grouping Contract

`utils/mappingStageGroups.ts` に純粋関数、`hooks/useMappingStageGroups.ts` に取得接続を置く。

~~~ts
interface MappingStageGroup {
  key: string; stageId?: number; stageKey: string;
  stageName: string; mappings: WorkflowMapping[];
}
function groupMappingsByStage(
  mappings: readonly WorkflowMapping[],
  masters: readonly (MappingMaster | MappingMasterV2)[],
  stages: readonly StageMaster[],
): MappingStageGroup[];
function useMappingStageGroups(
  mappings: readonly WorkflowMapping[],
  masters?: readonly (MappingMaster | MappingMasterV2)[],
  enabled?: boolean,
): MappingStageGroup[];
~~~

- 明示variant_idは同master内の同idだけを採用。StageMaster.idの名前/順を優先し、定義欠落・取得前はvariant.stage_key/stage_nameを使う。suffix推測は禁止。
- legacy（variant無し）は同master内の computed_role完全一致variantが1つなら採用。曖昧/variant無しはlegacy Mainにまとめ、値キーを改名しない。
- 明示variant未解決は `unknown-variant:<id>` / `ステージ不明 (variant #<id>)` で入力保持。取得前にMainと断定しない。
- 有効StageMasterをsort_order順、同値は元定義順。既存mappingが参照するinactive/定義欠落stageは末尾初出順で保持。同stageは1group、group内は元mapping順、入力array非破壊。
- 各領域に渡されたmapped入力だけを表示。空stageを追加しない。既存 `Sampler_Seed` 代替で描画しないmapping等はParamPanel側で除外してからgroup化。
- hookの既定値は `enabled=true`。T3が `useQuery<StageMaster[]>({ queryKey: ['stage-masters'], queryFn: () => stageMastersApi.list(true), enabled })` を内部で呼び、純粋関数の必須第三引数へ `stageQuery.data ?? []` を渡す。呼出側に `stages` 引数や新しいstate/propを追加しない。T1は三引数の純粋関数だけを所有する。
- master queryは既存key `['mapping-masters']`、`queryFn: () => mappingMastersApi.list()`、`enabled: enabled && masters === undefined`。解決値は `masters ?? masterQuery.data ?? []`。明示 `masters=[]` は取得済み空一覧として扱い、cacheやfetchで補わない。
- 両useQueryは毎renderで同順に呼び、その後 `enabled ? groupMappingsByStage(mappings, resolvedMasters, resolvedStages) : []` を返す。enabled=falseはこのhookのquery observerからfetchを開始せず、cacheがあっても返却groupは空。Mobile/default=false側は既存の平坦な描画を続ける。別observerが行う共有queryのfetchをcancelする契約ではない。
- pending/errorはstatusを理由に入力を消さず、最後のquery.dataがあれば利用し、なければ空metadataで純粋関数のfallbackを使う。取得待ち/失敗と成功空一覧は戻り型を変えず区別表示を追加しない。stage未取得かつmaster有はvariant名/順fallback、master未取得かつexplicit variant有はunknown、legacyは既存legacy Main規則。再取得成功時は名前・順を再投影し、値・chips・callbackを変更しない。retry/staleTime等は既存QueryClient設定を継承する。

呼出接続は Desktop Prompt が `useMappingStageGroups(textMappings, mappingMasters, true)`。ParamPanel親はquery hookを呼ばず、stageGrouping=falseはprovider不要の元renderer。trueかつParameters本文を表示する時だけ同ファイル内の非export子 `StageGroupedParameters` をReact componentとしてmountし、子は `useMappingStageGroups(mappings, undefined, true)` を毎render同順に呼ぶ。空のParamPanelは子をmountしない。子の非mountによる取得抑止と、T3 hook自体のenabled=false契約は区別する。T3のqueryが必要な全 `StageMaster[]` を明示してT1へ渡すため、T1で取得処理を実装しない。

~~~ts
interface StageGroupedParametersProps {
  mappings: readonly WorkflowMapping[];
  renderMapping: (mapping: WorkflowMapping) => React.ReactNode;
}
// 非export、ParamPanel.tsx内。関数として直接呼ばずJSXでmountする。
function StageGroupedParameters(props: StageGroupedParametersProps): React.JSX.Element;
~~~

T5は描画対象だけをvisibleParamMappingsへ絞り、既存renderParamMapping callbackと元objectを子へ渡す。子はgroupごとのStageInputGroupと本文space-y-3のみを返す。親のBatch/global Seed/ParamSync/Bypassは各1回、既存値/callback/disabled/collapseを維持する。stageGrouping false↔trueの切替は子のmount/unmountとなり、親のhooks順序とReact Rules of Hooksを守る。query取得は表示中のgroup子だけで行い、flat/Mobile/StudioへQueryClient依存を追加しない。

ParamPanelに `stageGrouping?: boolean` をdefault=falseで導入しDesktopだけtrue。既存Mobile Prompt tabsを拡張しない。T3でprop型を先に公開してT4/T5の型依存を解消する。

## Settings Grouping and Identity

`utils/wiringStageGroups.ts` に既存slot投影を抽出する。activeStagesをsort_orderと元順で並べ、各工程のenabled variantsを連続groupへ描画。未設定enabled候補も保持し、0slotなら既存説明本文を表示。対象workflowに有効なstageの検出・smart置換は変更しない。工程情報のないlegacy slotはMain（なければ先頭対象工程）へ1度だけ置き、全工程に複製しない。

~~~ts
interface WiringStageSlot {
  slotKey: string; variantId?: number; masterId: number;
  role: string; paramName: string; displayName: string;
  inputType: string; stageId: number;
}
interface WiringStageGroup {
  info: ActiveStageInfo; slots: WiringStageSlot[];
}
function buildWiringStageGroups(
  activeStages: readonly ActiveStageInfo[],
  masters: readonly (MappingMaster | MappingMasterV2)[],
  currentMappings: readonly WiringMappingItem[],
): WiringStageGroup[];
~~~

mapキーは `v:<variantId>` と `m:<masterId>` に分離。数値衝突で別slotを上書きしない。V2送信には元variant_id、legacy送信にはmaster_id/node_idだけ。選択・解除は当該slotだけ、保存は全工程の最新draftを一度だけ渡す。推奨nodeは各stage.matchedNodeIdsから生成する。

## Sticky Header and Editing Contract

共通 `StageInputGroup.tsx` とCSSでsection内に通常フロー高さ36pxの `position:sticky; top:0` 見出しを1つ置く。不透明背景、局所z-index10、sectionに新overflow/transformを設けない。名前は1行省略、完全名をtitle/accessible nameへ保持。keyまたはidも併記し長名・同名を識別する。

~~~ts
interface StageInputGroupProps {
  groupKey: string; stageName: string; stageKey: string;
  children: React.ReactNode;
}
~~~

scroll root の唯一の検出selectorは `[data-stage-scroll-root]`。実際に `overflow-y:auto` を持つHTMLElementへ `data-stage-scroll-root=""` と `className` の `stage-input-scroll-root` を併せて付ける。sectionやParamPanelの非scroll wrapper、外pageへ付けない。T2が `frontend/src/components/StageInputGroup.css` に `.stage-input-scroll-root[data-stage-scroll-root] { scroll-padding-top: 44px; }` を定義し、StageInputGroup.tsxから同CSSを静的importする。CSSはコンポーネントのrender有無に依存せず読まれる。新しい全体CSSファイルやroot用prop/exportを追加しない。

T2のsection classは `stage-input-group`、見出しは `stage-input-group__heading`、本文は `stage-input-group__body`。同CSSのsection内 `input, textarea, select, button, [tabindex], [contenteditable="true"]` 各selectorに `scroll-margin-top:44px` を与える（各selectorは `.stage-input-group` でscope）。見出しは `height:36px; box-sizing:border-box; position:sticky; top:0`、通常フローに残す。44pxは見出し36px＋露出後の8px余白。focus補正の発火に固定44pxを使わず、見出しの実矩形を使う。

T2はsectionのonFocusCaptureで `event.target` のHTMLElementを対象とし、`target.closest('[data-stage-scroll-root]')` を唯一のrootとする。own section内の対象/own heading refを使い、root欠落やsection外（portal経由の候補等）、高さ0の矩形はno-op。rootの表示範囲は `rootRect.top + root.clientTop` から `+ root.clientHeight`、見出しの可視範囲はその範囲とheaderRectの交差。対象上端が可視見出し下端より上で、対象下端が可視見出し上端より下の場合のみ `root.scrollBy({ top: targetRect.top - (visibleHeaderBottom + 8), behavior: 'auto' })` を1回呼ぶ。これで上側へscrollして対象上端を見出し下へ露出する。別root/window/sectionのscroll、scrollIntoView、focus/valueの変更は行わない。browserのscroll範囲clampを尊重し、補正後の非遮蔽はBR-3で実測する。scroll監視や共有activeStage stateは導入しない。resize・分割drag・折り畳みはCSS再レイアウトに追従する。

| root / 接続箇所 | 属性とclassの実装所有 | 利用側 |
|---|---|---|
| `#desktop-prompt-scroll` / DesktopLayout.tsx のfirst | T4: 既存divへ両方を追加、既存overflowを保持 | T4のPrompt group |
| `#desktop-controls-scroll` / DesktopLayout.tsx のsecond | T4: 既存divへ両方を追加、既存overflowを保持 | T5のParamPanel group。T5はDesktopLayoutや別rootを編集しない |
| `#settings-mapping-scroll` / AdaptiveWorkflowWiring.tsx | T7: 新規の工程一覧scroll divへ両方を追加、overflow-y:autoとmax-height:min(60vh,480px) | T7のSettings group。saveはroot外 |

T2は外部scroll divを編集せず、3領域へのclass/属性の適用はT4/T7だけが行う。T5の局所testは同じ属性/classを持つtest-only rootでParamPanelをwrapする。T4のtestで両Desktop rootの属性/classを、r8でT7から所有分割したT15のtestでSettings rootの属性/classとsaveのroot外配置をassertする。T2のtestでは実CSSのselectorと44px規則をraw import等で検証する。jsdomのCSSレイアウトを根拠にstickyの受入PASSを出さない。

次工程がroot上端へ到達するまで、旧工程見出しが所属section内に残る。末尾では次見出しに押し出され、次見出し通常位置がroot上端へ到達すると次タイトルが上端に残る。次工程がviewportへ入っただけで早期切替しない。境界の識別と非遮蔽は実ブラウザーで検証する。

group一覧は間隔0の専用wrapperに置く。既存space-y/gap/marginを工程section間に適用せず、入力の余白はsection本文内に置く。これにより旧見出し消失後に空白を挟んで次見出しが到達する区間を作らない。focus rootは target.closest('[data-stage-scroll-root]') のHTMLElementであり、section自身をscroll可能にする必要はない。

生成はWorkflowMapping→MappingStageGroup、Settingsはmaster/variants＋WiringMappingItem→WiringStageGroup/WiringStageSlotを別投影する。共通StageInputGroupは表示名/key/childrenだけを受け、どちらのAPI型も直接参照しない。Settingsの選択時serializeはvariantIdがあるslotだけにvariant_idを含める。

StageManagerModalは成功時stage-masters/mapping-mastersを既にinvalidateする。SettingsのsaveWorkflowConfigは現在workflows/workflow-configだけをinvalidateし、生成の['workflow',id] cacheを残すため、T8で成功時に同queryもinvalidateする。失敗時はinvalidateせずdraftを保持。値の同期を新規導入せずmapping再取得を正しい既存queryへ通知する。

## Settings Draft Session and Save Revision Contract

r3監査の保存競合指摘を実コードで確認した。WorkflowConnectionSection.tsx L159-163はconfigWorkflow再取得で無条件にconfigMappings/configBaseModelIdを置換し、L180のrevision gateは成功表示だけを保護する。保存したRough=Cの応答待ちにDへ編集すると旧refetchでCへ戻り得るため、SPEC_SETTINGS §4-1のdraft保護をT8で具体化する。

T8は同じ2所有ファイルで、既存configDraftRevisionに下記1つのrefを追加する。新hook/API/schema/依存は不要。

~~~ts
interface ConfigDraftSession {
  epoch: number; workflowId: number | null;
  hydrated: boolean; acknowledgedRevision: number;
}
// useRef<ConfigDraftSession>({epoch:0, workflowId:null,
//   hydrated:false, acknowledgedRevision:0})
~~~

- 「対応付け・設定」の開閉/対象切替handlerはnextWorkflowIdを計算し、revisionを1増やしてepochも1増やした新sessionを同期的にrefへ設定する。workflowId=nextWorkflowId、hydrated=false、acknowledgedRevision=更新後revisionとし、既存setConfigWorkflowId/preview/errorリセットとsetSaved(null)を実行する。同じworkflowを閉じて再度開いても別epoch。render中にref/counterを変更しない。
- configWorkflow取得effectはdata.idと選択workflowIdとsession.workflowIdが一致し、session.hydrated=falseの時だけmappings/baseModelIdを初期化し、hydrated=true/acknowledgedRevision=現在revisionとする。同一sessionの後続refetch（保存/背景/再接続を含む）はこれらフォーム値を置換しない。初回取得が失敗したらhydrated=falseのまま、回復時に一度初期化する。query dataは引き続きgraph/候補/metadata表示とcache更新に使う。
- mapping/baseModel/import text/previewの既存編集handlerはrevisionを増やし、savedを消す契約を維持。hydratedかつcurrentRevision!=acknowledgedRevisionなら「変更は未保存です」を保存表示付近に表示する。古い成功/errorで最新draftへ誤った保存表示を付けず、既存の新しいvalidation errorも消さない。
- saveWorkflowConfigは受付時に非nullの保存対象ID、session epoch、revision、送信draft snapshotを捕捉。updateと成功時の3query invalidateはその捕捉IDだけを使う。保存受付時のrevisionがAPIへ送ったsnapshotに対応し、元draftや現在の選択IDをawait後に再読して送信内容を変更しない。
- API成功時、現在sessionのID/epochが捕捉値と同じ場合だけacknowledgedRevisionを送信revisionへ更新する。3queryは成功時だけinvalidate。最新のID/epoch/revisionが全て捕捉値と同じ場合だけsnapshotのmappings/baseModelIdをフォームへ明示適用し（variant_idはnull/undefinedなら省略）、preview/confirm解除と保存済み表示を行う。importで送ったsnapshotも同じ規則。ユーザーが再編集してrevisionが増えた場合はそのdraftを保持し未保存表示、旧snapshot/preview解除を適用しない。
- 失敗時はquery通知/ack変更を行わない。ID/epoch/revisionが全て一致する場合だけ既存の保存失敗・未保存errorを表示し、それ以外は最新draft/errorを保持。finallyでconfigSaving=falseを必ず実行し、現在のdraftを再保存可能にする。自動再送しない。異なるworkflow/epochへの古い成功は元IDのcache更新だけを行う。

フォームを一度だけ初期化する方針は、同一編集sessionで外部から変更されたmapping/baseModel値を自動適用しないという制約を持つ。閉じて再度開くと最新query dataで初期化する。工程名/候補/graphなどmetadataの再取得は継続する。保存成功が最新draftに一致すれば送信snapshotを明示採用するので、成功後の旧cache/取得失敗でもフォームが保存前へ戻らない。実APIが受け付けた値の保持を優先し、外部更新との自動mergeや新警告flowは追加しない。

| 領域 | 統合 |
|---|---|
| Prompt | desktop-prompt-scroll内でgroup→元textMappings描画。m.id、TagChipEditorのactiveSetId-role keyを保持 |
| Parameter | desktop-controls-scrollがroot。ParamPanelのmapped入力だけgroup化。Batch/global Seed/ParamSync/Bypassはgroup外各1回、Audit/MappingError/assetsの既存配置を維持 |
| Settings | AdaptiveWorkflowWiring内にsettings-mapping-scroll、max-height:min(60vh,480px)。stage tabs→連続group、saveはscroll外 |

## AC Traceability

| AC | 責務 | 証拠 |
|---|---|---|
| 1 | T1/T3/T4/T5/T6/T7、3領域Main/Rough各1 | IT-P1/V1/S1、E2E-G1/S1 |
| 2 | T2と各root | BR-1-P/V/S |
| 3 | T2、境界押し出し | BR-2-P/V/S |
| 4 | T5/T9、role別paramValues | IT-V2、E2E-G2 |
| 5 | T2/T4/T5/T7、focus露出 | BR-3-P/V/S |
| 6 | T6/T7/T8、slot別mapと保存 | IT-S2、E2E-S2 |
| 7 | T4/T9、role別chips/文字列 | IT-P2、E2E-G3 |
| 8 | T4/T5/T9、両欄個別heading | IT-PV1、BR-4 |

## Tasks and DAG Audit

15枚を物理生成（r5でT11～T14、r8でT15追加）。上限は固定baselineに対する所有ファイルの追加＋削除の累積合計、net差分やrevision追加分だけで算定しない。カード自身300行以下。超過予測時は着手前に自律再分割し親へ返す。旧T7は実測360行で上限違反となり、source255/test105を分離した事実を保持する。

| Task | 責務 | ファイル数 | 行上限 | 依存 |
|---|---|---:|---:|---|
| T1 | 純粋stage grouping/unit | 2 | 260 | なし |
| T2 | 共通group component/CSS/unit | 3 | 250 | なし |
| T3 | query hook/unit + ParamPanel prop型 | 3 | 200 | T1 |
| T4 | Desktop Prompt/既存unit | 2 | 220 | T2,T3 |
| T5 | ParamPanel grouped子/flat互換性/既存unit | 2 | 300 | T2,T3 |
| T6 | Settings slot投影/unit | 2 | 260 | なし |
| T7 | Settings連続groupのproduction（実測255行） | 1 | 300 | T2,T6 |
| T8 | Settings保存・独立性結合test、cache通知、draft session保護 | 2 | 300 | T7 |
| T9 | 生成独立性・両欄結合test | 1 | 260 | T4,T5 |
| T10 | SPEC_GENERATE/SPEC_SETTINGS同期 | 2 | 160 | なし |
| T11 | Desktop grouped consumerのtest Provider fixture | 3 | 120 | T4 |
| T12 | Settings/REQ-336の旧UI期待同期 | 2 | 100 | T8,T15 |
| T13 | WorkflowMappingCreate/Read OpenAPI snapshot同期 | 2 | 80 | なし |
| T14 | 既存visibilitychange検証の履歴baseline条件同期 | 1 | 80 | なし |
| T15 | Settings staging局所test全差分/確認（実測105行） | 1 | 150 | T7 |

最大4層（T1→T3→T4/T5→T9）。T4/T5は別source/test、T8/T9は別結合test、T10は仕様のみ。T3のParamPanel prop型公開後T5が編集するため同時書込はない。計画上atomicity全件PASS、受入PASSではない。

r5のT11はT4後、T12はT7/T8後でいずれも最大4層内。T13/T14は独立。T5再作業後にT9と既存Mobile/Matrixを再検証する。T11/T12/T14は各々別test、T13はschema snapshotだけでsource所有と競合しない。

## Gate 2 Rework and OpenAPI Snapshot Consistency (r5)

QAの `tmp/REQ-347-vitest-report.json` は2050 tests中38 failed/2012 passed。内訳は直接Provider例外34件（DesktopLayout.tabs10、MobileLayout18、GenerationProgress5、REQ-339 preview1）、Matrix1、旧UI期待2、visibilitychange1。REQ-347生成/Settings結合testは各4/4成功だが全体Gate2はFAILのまま。

Matrixのfixtureはint mappingを追加し、MatrixGenerationStep.tsx L971でshared ParamPanelを初めてmountする。QAの例外stackはuseMappingStageGroups L12→ParamPanel L151のNo QueryClientであり、submit-batch-buttonが消えたのはrender exceptionの二次症状。T5のprovider不要flat互換性修正でMobile18とMatrix1を扱い、Studio本体や当該testへ不要なProviderを追加しない。再検証で別の失敗が残れば再分類する。

DesktopLayoutは意図的にgrouping=trueなのでProviderが必要。T11がDesktopLayout.tabs/GenerationProgress/REQ-339 previewの3testへ、testごとの安定したQueryClient wrapperと空stage/master cacheを導入する。staleTime=Infinity/retry=falseで無関係のAPIを呼ばず、wrapperをrender optionsへ渡してrerenderにも維持する。global setupやproductionへ自動Providerを追加せず、元の表示/操作assertは保持する。

T12はREQ-336のtab→stage region/headingと、WorkflowConnectionSection.testの `sampling のノード`→stage付きaccessible nameの2期待を同期する。これは受入済み表示変更による直接影響であり、既存testという理由で除外しない。

visibilitychangeの失敗locationはuseGeneratePageState.test.tsx L367（fetchHistory）で、L366のfetchQueueは成功。useGenerateDisplayState L638-647はqueueを更新し、hasDisplayedBaselineまたはwaiting/checkingではfull historyを抑止する。fixtureはhistory/batchImages非空で、SPEC_GENERATE L275の復元baseline保護と整合する。REQ-347変更対象外の旧test契約不整合であり、変更前baseline実行証拠がないため歴史的なFAILとは断定しない。T14は非空baselineの冗長history抑止とcold empty baselineのfallbackをtestで分け、sourceへ古い無条件fetchを戻さない。

実在するOpenAPIは `docs/openapi.yaml` と `backend/openapi.json`（`docs/system/openapi.yaml` は存在しない）。両者のWorkflowMappingCreate/Readにvariant_idが欠落する一方、backend/app/schemas/workflow.py L41/L51はOptional[int]=None、WorkflowUpdate L85はCreateを参照する。T13は2schemaへinteger/null/default:nullのoptional propertyだけを追加しrequiredやendpointを変更しない。runtime契約の追加ではなく保存済み文書の同期。全体再生成による無関係な差分を避け、両snapshotとPydantic生成fieldの一致を確認する。

## Trade-offs and Risks

CSS stickyは境界をDOMで表現しイベント管理を減らせる。section末尾で見出しが押し出されるため、切替境界・短いpaneの入力露出は実ブラウザー証拠が必要。JS固定バー案は領域別active状態とresize処理を増やすため採用しない。

Settingsはtabから連続一覧へ変わり縦長になる。専用scrollで範囲を区切り全工程draft・未設定候補・saveを保つ。候補範囲拡張はREQ-348。初期query中の未解決名は一時表示し得るが入力は保持する。同期disabled、Seed/global Seed独立、無効chips・assets・preset状態は回帰対象。

## Audit and Human Review

全カードdraft/design_gate=pending。初回設計はユーザー承認後に実装へ着手したが、T1の契約不足で停止。T1/T2のsource変更なし。T6の `frontend/src/utils/__tests__/wiringStageGroups.test.ts` は部分作成済みでtest/typecheck未実行、受入PASSではない。保存して再開時に担当者が確認する。設計・test-plan・10カード・implementation_planを明示して固定model/context32768/reasoning noneで監査し、直後unload exit0を証跡化する。監査実行完了と設計PASSを分け、指摘対応を記録。変更設計はdev-designの人間レビューゲートへ返す。

2026-10-12 初版13対象の監査は3 chunks＋最終合成まで完了（exit0）。raw verdictはDesign Gate FAIL、unload exit0/loaded=[]。証跡はREQ-347-audit.log、REQ-347-unload.log、REQ-347-audit-trace.json。指摘応答はREQ-347-audit-response.md。上記の境界余白・投影型・serialize・cache通知の明確化は監査後の改訂であり、改訂全体の再推論は未実行。raw FAILを保持し無条件PASSとせず、人間レビューへ返す。

2026-10-12 `hook-query-contract-r2` 改訂: エンジニアのESCALATE_TO_DESIGNへ対応し、T1/T3の責務、第三引数の取得接続、disabled・空引数・cache・pending/error、T4/T5/T9の利用/検証を明確化した。2026-10-12ユーザー追加指示により、通常のエンジニア差し戻しはArchitectが自律修正し、再承認待ちで止めない。今回の取得接続の明確化は承認済み要件内であり人間の新規判断事項はない。初回レビュー承認とこの追加指示を実装再開の承認根拠として親調整役へ返す。初版raw FAILとその後の未監査改訂の履歴を保持し、この改訂も現時点ではローカルモデル再監査未実行。再監査は全13対象の新ログ/traceで行い、過去の証跡を上書きしない。

同日r2再監査を全13対象へ実行完了。4 chunks＋最終合成、audit exit0、raw verdict **FAIL (実装着手禁止)**、直後unload exit0/no models loaded。原判定を保持し `REQ-347-audit-response.md` のR2節へ全9指摘の根拠付き応答を記録した。T2欠落・jsdom受入・cache規則・保存必須metadata等の指摘は現文書/既存APIとの前提不一致として評価。人間の新規判断事項は0、実装受入PASSは未確認。snapshot/hash/logは `REQ-347-r2-audit-trace.json`。この結果記録だけを監査後に追加し、挙動契約は変更していない。

2026-10-12 `scroll-root-contract-r3`: T2のエスカレーションへ対応し、selector/属性/class/CSSファイル、3領域の接続所有、focusの対象と矩形補正、局所検証を明確化。Desktopの両rootは既存DesktopLayout.tsx内のためT4が接続し、T5は利用のみ。所有ファイル数/変更行上限/DAGを維持し分割不要。初版・r2のraw FAILと応答を保持する。このr3はローカルモデル未監査、実装受入未確認。承認済み要件内の具体化で人間の新規判断事項は0。初回承認とユーザーの自律差し戻し指示を根拠として親調整役へ返す。

r3全13対象の監査完了（4 chunks＋最終合成、audit exit0、raw FAIL (実装停止推奨)、直後unload exit0/no models loaded）。REQ-347-r3-audit.log/trace/unload.logへ記録し、全指摘をREQ-347-audit-response.md R3節で照合した。root/CSS/query等は前提不一致、保存後refetchのdraft上書きは実コード根拠を確認して採用した。

2026-10-12 `settings-draft-session-r4`: 保存競合をT8のsession/ID/revision/snapshot契約と一度限りのフォーム初期化で自律修正。T8は2所有ファイル、変更行上限300、依存T7を維持。遅延保存→再編集→旧response/refetch/失敗とsession切替を計画へ追加。人間の新規判断事項0、初回承認と自律修正指示を根拠として継続する。r4は全13対象の新規ログ/traceで再監査し、過去のraw判定を保持する。

r4再監査完了: 全13対象96,492文字、5 chunks＋最終合成、qwen/qwen3.5-9b/Q6_K/context32768/reasoning none、audit exit0、raw **Design Gate FAIL（設計ゲート失敗）**、直後unload exit0/no models loaded、464.031秒。REQ-347-r4-audit.log/trace/unload.logに証跡を保存。REQ-347-audit-response.md R4節で全指摘を照合した。全13本文hash一致、T9の全体hash差はmetadata-onlyと判別。実ブラウザー受入とT8遅延保存試験は必須の未確認事項として残す。今回の追記は監査結果記録のみで、T8を含む挙動契約は監査snapshotから変更なし。人間の新規判断事項0、親調整役へ既存承認に基づく継続判断を返す。

2026-10-12 `consumer-compatibility-r5`: Gate2の38失敗とQAのOpenAPI指摘を取り込み、T5のcomponent境界修正とT11～T14を具体化した。r4以前のraw FAILと全証跡を保持。r5は設計/test-plan/全14カード/planの17対象とfull/body hashesを準備して新規監査する。現在はr5未監査。人間の新規判断事項0、既存の初回承認と自律修正指示の範囲で親へ返す。

## R5 Audit and Initial Hydration Follow-up

監査履歴は各時点の記録であり、最新完了状況は末尾のrevision節とhandover.current_local_auditを参照する。

r5全17対象の監査は120,119文字/6 chunks＋最終合成、audit exit0、raw **【設計ゲート FAIL】（実装着手禁止）**、754.925秒。直後unload exit0、独立lms ps --json exit0/[]。全17 full/body hashは完了時まで一致。REQ-347-r5-audit.log/trace/unload.logと監査応答R5節へ保存し、過去raw判定も維持した。

実コード照合でwarm cacheの初回取得中に未hydratedフォームを編集でき、初期化effectがdraftを戻す経路を確認。`settings-initial-hydration-r6`（r5後の未監査改訂）ではT8が選択ID/session/configWorkflow一致かつhydrated=trueになるまでmapping/baseModel/import/export/保存を非mountとして読み込み表示とする。初回GET完了からeffectまでの間も編集不可、初期取得失敗時は回復を待つ。初期化後は背景refetch中も編集を維持しdraft保護を継続。保存入口にも初期化guard、toggleにsetSaved(null)。T8の2所有ファイル/300行/DAGを維持し、IT-S9でwarm cache＋遅延初回GETと保存表示解除を確認する。初回編集開始が取得完了まで遅れる制約を選択し、ユーザー編集を失う競合を防ぐ。人間判断は不要。実装/試験/改訂再監査は未確認で、raw FAILをPASSへ変更しない。

## R6 Audit and Slot Accessibility Revision

最終結果追記: r7変更5文書の監査完了（53,701文字/3 chunks＋最終合成、308.519秒、audit exit0/raw CRITICAL FAILURE（重大な失敗）、直後unload0/lms ps0/[]）。全5全文/本文hash一致、driftなし。REQ-347-r7-audit.log/trace/unload.logを保持し監査応答R7節に全指摘を照合。現在時刻は2026-10-12 UTCで未来日付という指摘は前提不一致。局所draftと永続化snapshot、sectionと領域rootの責務を分離した既存契約にも衝突はない。param付きlabelの具体的欠陥や新しい人間判断は未確認。T7/T12契約は実装可能で凍結、親へ局所修正・再検証を返す。実装受入とブラウザー実測は別途要求し、raw判定をPASSにしない。この追記は結果記録だけ。

r6全17対象122,815文字/6 chunks＋最終合成、627.849秒、audit exit0、raw **【実装着手禁止】 (Implementation Prohibited)**（report:Design Gate FAIL）。直後unload exit0、独立lms ps --json exit0/[]。全17本文hash一致、T11/T12/T13/T14の全文差はmetadata-only、他13全文一致。全指摘の根拠応答はREQ-347-audit-response.md R6節、監査時hash/logはr6 trace/logに保存。初期取得中非編集と初期化後のrevision保護は異なる状態。T6 variantIdは数値v.idでroleとは別field。実装受入を示す監査ではなくraw判定は保持する。

`settings-slot-accessibility-r7`: Settingsの同stage/同role/異paramの必要な2slotが同名になるT12 escalationを採用。select accessible nameを`${stageName} ${slot.role} → ${slot.paramName || '—'} のノード`へ変更する。Main samplingのsteps/cfgを各名で一意に選択し元master payloadを保持。stage regionによる工程識別は継続、IDやDOM順で選択しない。T7が既存production/testの2ファイル、T12が既存consumer testの2ファイルを所有しDAG最大4層を維持。T8の所有ファイルと競合しない。新しい人間判断は不要。r7対象design/test-plan/T7/T12/planの5文書を別auditし、r6以前のhash/rawを保存する。


## Settings Ownership Split (r8)

settings-ownership-split-r8: 固定baseline 3b901040c1887b24c56cc517e75768b777913a5eのgit diff --numstatでsource57追加+198削除=255、staging test81追加+24削除=105、旧T7合計360。旧300行上限の違反を記録し、net差分やr7だけの差分へ定義変更しない。T7はAdaptiveWorkflowWiring.tsxだけ（255/300）、T15はWorkflowAdaptiveStaging.test.tsx全差分だけ（105/150）へ責務分割。すでにpassing codeは変更/削除/再実装しない。engineer報告のtypecheck成功・局所10/10を保持し、T15が分割後に差分/要件照合と局所再検証を行う。

DAGはT2/T6→T7→T8→T12とT7→T15→T12、T12の直接依存T8,T15。最大4層、15カード、各<=3ファイル・<=300行。T8の実装/Gate3物理受入を遅らせる新規source依存は追加しない。分割のtrade-offはsource/testの所有と完了証拠が別カードになること。T7もT15の既存testを編集せず参照実行でき、テストを省略する分割ではない。関連5旧文書と新T15の6対象を別r8監査し、過去rawと360行違反/通過testの両証拠を保存。新規人間判断0。

r8監査結果:変更6文書61,169文字/3 chunks＋最終合成、342.099秒、audit exit0、raw【実装禁止 / Design Gate FAIL】（最終【実装禁止】）。直後unload0/lms ps0/[]、6全文/本文hash一致、source/test hash一致。固定baseline再計測255/105のまま。全指摘を監査応答R8節で照合し、所有制約の一般化/親rootとの混同を根拠付き評価。旧360/300違反は保持、新T7 source255/300・T15 test105/150・T12←T8,T15の契約は凍結。設計は実行可能、人間判断0、T7完了確認→T15局所再検証→T12へ返す。実装受入/全体Gate2/Gate3は別証拠、rawをPASSにしない。本追記は監査結果だけ。
