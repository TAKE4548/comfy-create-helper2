---
id: REQ-347-test-plan
status: draft
design_gate: pending
tags: [REQ-347, test-plan, generate, settings, stage]
related_paths: [docs/design/REQ-347.md, docs/backlog/pbi/active/REQ-347.md, frontend/src/components/AdaptiveWorkflowWiring.tsx]
---

# REQ-347 結合・受入・境界テスト計画

## Current Execution Context

workspaceは`git rev-parse --show-toplevel`で取得するGit root、frontendはその`frontend`。この計画の有効な動作契約はFixtures/各Gate表/Fixture RecipeとMeasurement Oracle。監査履歴はREQ-347-test-plan-history.mdへ隔離した時点証跡であり実行の前提ではない。status:draft/design_gate:pendingは受入完了を意味しない。r12変更前のGate1と有効な全体Gate2再実行はPASS（226 files/2,053 tests）、新視覚改訂は試験未実施。Gate3は実ブラウザー前提未充足でINCONCLUSIVE。ユーザーは変更前の動作OKを確認したが、これを改訂後/自動telemetryのPASSに転用しない。以前の実行/監査状態は履歴文書の時点記録を参照する。

既存lockfileに沿うNode/npmと依存、Git、PowerShellが必要。各commandはGit checkout内から`Set-Location (Join-Path (git rev-parse --show-toplevel).Trim() 'frontend')`でfrontendへ移動し、command/exit/全結果を保存する。Git root取得失敗またはfrontend/package.json不在なら実行前提未充足として止め、pathを推測しない。jsdomのVitest1.6（vite.config.ts）はGate1/2専用。現在ブラウザー接続/5173・8000起動/fixture公開は存在しない。以下のbrowser oracleはrunnerに渡す仕様であり実行済みとしない。

ブラウザーGate3の前提は(1)対応する実ブラウザー/制御接続、(2)現在sourceから起動した画面、(3)実DOMの矩形・computedStyle・scrollTop/valueを取得しpixel単位のroot scrollとnative click/Tab/resize/200%zoomを操作できるrunner、(4)隔離したfixture/API応答制御、(5)画像と生観測JSONの保存。いずれか未充足はそのcaseをINCONCLUSIVEにする。存在しないURL/driver/workerへ接続できたと仮定しない。新しいbrowser依存やtool未対応APIを本計画から自動導入しない。

## Fixtures and Preconditions

Main(id1,key main,order0)、Rough(id2,key rough,order1)、Detail(id3,order2)、ユーザー定義第四stage。V2 Prompt/Steps masterにはMain/Rough enabled variantsを用意。表示名は同じPrompt/Steps、computed_roleはPrompt/Prompt_rough、Sampler_Steps/Sampler_Steps_rough。Prompt=A/B、Steps=20/30、paramSyncGroups=[]。Settings Main Steps=nodeA、Rough Steps=nodeB、変更候補nodeC。nodes titleにMain/Rough検索keywordを含めstageを有効にする。

第四stageは既存StageMaster schemaの制御fixture `{id:4,key:'custom',name:'Custom',suffix:'_custom',search_keywords:['custom'],previous_suffixes:null,is_builtin:false,is_active:true,sort_order:3}`。既存Steps masterにenabled variant（id=84001、元master_id、stage_id=4、stage_key='custom'、stage_name='Custom'、stage_suffix='_custom'、computed_role='steps_custom'、custom_role_override/extra_title_patterns=null）と対応mappingを1件加える。Settingsの境界caseは既存workflow()のnodeDを使いtitleだけ'Custom sampler'へ固定する。BR-11は元のRough nodeDを使う別caseで混ぜない。これは事前設定されたmetadataを渡す試験であり、第四stage作成UI/ID採番機能の新規実装を要求しない。同じStageInputGroup/CSS/最寄りrootを利用し、mapped群はMain/Rough/Detailがある時その後（order3）、未mapped生成群は表示しない。

scroll試験では各工程本文がpane高さの2倍以上のfixtureを用意。mapping数、長いtextarea、LoRA stackで長さを確保。同じroleを重複登録せず追加mappingは別role/variant ID。nodeCは既存graphに含める。devtoolsでCSSだけ変更してPASSとしない。

### Browser Fixture Recipe and Deferred API Ground Truth

基準dataは物理ファイル`frontend/src/test/e2e_req347_generate_stage_groups.test.tsx`のstages/masters/textMappings/paramMappings/初期paramValuesと、`e2e_req347_settings_stage_groups.test.tsx`のworkflow()/stageMasters/mappingMasters/baseModels/deferred()。Vitestのvi.mockを実ブラウザーのmockとみなさない。browser fixture adapter/harnessは未実装・未起動であり、dataを隔離した環境へ公開できること自体を事前確認する。実ユーザーDBや通常originの保存値を変更しない。

- 基準viewportはCSS pxで1280×720、境界は800×600、Settings幅375/767/768/1024。root高さはproduction layoutの実clientHeightを記録し固定CSSで上書きしない。headingはproduction CSSのheight36/font-size12、padding44/margin44。フォント読込み終了後の実computed font-family/font-sizeとbrowser/version/DPR/zoomを証拠へ保存し、OS依存のimage hashをgolden値としない。
- 長いlist用は各stage各入力種別32slot。既存fixtureのPrompt/Steps templateをindex i=0..31で生成し、i=0は既存ID/role/値を維持。i>0はmaster_id=`1000+2*i`（Prompt）/`1001+2*i`（Steps）、variant_id=`10000+4*i+s`（Prompt）/`10002+4*i+s`（Steps）、s=0 Main/1 Rough。roleは既存computed_roleへ`_fixture_<i>`を付与し各roleを一意にする。slot元IDをAPI payloadへ保持、nodeは基準graph内のMain/Rough nodeだけを使用。値はi=0のA/Bと20/30、i>0は既存初期値とindexを明示した固定文字列/20+i、30+i。これは既存schemaから生成する制御fixtureでありproduction dataや実測結果ではない。
- Settingsの長listも同じSteps templateを使用、Main node=A/Rough node=B。C/Dは既存workflow()のKSampler nodeとrough keywordをそのまま使う。各本文実height>=2*root.clientHeight、root.scrollHeight>root.clientHeightをbrowserで確認する。32slotでも条件未充足ならfixture不成立としてINCONCLUSIVE、textarea内スクロールだけをsectionの長さとみなさない。
- BR-11/IT-S6の初期GETはworkflow(target=1,id=7,roughNode='B')。保存1はPUT `/api/workflows/7`のsnapshotにMain A/variant11とRough C/variant12、target_base_model_id=2、元json_body/default_applied_assetsを含み、応答を手動解放まで保持。待ち中のUIでRough D/model1へ編集後、保存1成功とGETの旧C/model2を返す。最新UIはA/D/model1・未保存表示・旧保存済み表示無し。保存2がD/model1を送信し成功した時だけ保存済み。close/reopenはfresh GETの最新D/model1で初期化する。本文slot増量caseとこの基準2slotの競合caseは分ける。
- 失敗caseは既存IT-S7と同じadapterのPromise rejection `Error('old failure')`/`Error('offline')`を制御。HTTP adapterを用いる場合は500と`{detail:'offline'}`を返すというtest transportを明示し、旧snapshot失敗/現在snapshot失敗を別に記録する。server本来の障害codeと同一だと主張しない。制御adapterがなければ遅延/失敗のbrowser caseはINCONCLUSIVE、実APIへ故意の障害を起こさない。

## Gate 1 — Static and Local Units

`Set-Location (Join-Path (git rev-parse --show-toplevel).Trim() 'frontend'); npm run typecheck`。unitコマンドは各Task Cardへ物理記載。

| ID | 対象 | 必須assert |
|---|---|---|
| UT-G1 | 純粋grouping | interleaved mapping→Main/Rough各1、sort_order優先、工程内順/元object保持、空stageなし |
| UT-G2 | grouping境界 | explicit未解決unknown、legacy一意/曖昧、inactive参照保持、定義欠落、同名区別、array非破壊、masters/stages=[]、masterだけ取得済みからstage到着で元mapping参照保持 |
| UT-H1 | query hook | 両query key、list(true)、T1の第三引数、masters提供/明示[]時fetch抑止、disabledはcache有無とも返却[]・自身のfetch無し、再有効化、pending/errorでcacheまたはfallbackを使いinput保持、refetchでvalue更新なし |
| UT-C1 | 共通group | section/可視nameのみ/ARIA key/title、CSS raw import等で `.stage-input-scroll-root[data-stage-scroll-root]` のscroll-padding44とsection内controlのscroll-margin44規則。mock root.clientTop/clientHeight/header/target矩形で隠れた時だけ露出（top100/header100..136/target120..150ならtop=-24,behavior=auto）、露出済み/欠落root/section外/可視header無しは0回、最寄りrootだけ/別rootのscrollBy=0 |
| UT-S1 | Settings投影 | 対象stage全enabled variants、未設定候補、legacy1回、v:1/m:1衝突なし |
| UT-CMP1 | ParamPanel互換性/T5 | Provider無しのdefault=false/明示false/mobile/emptyで既存数値表示と編集、group child非mount。Provider内false→true→falseで値と親hook順序保持、Batch/Seed1回 |

jsdomはCSS sticky・レイアウトを計算しない。mock矩形はfocusの局所試験でありAC-2/3/5の実ブラウザー証拠ではない。

## Gate 2 — Integration and Data Acceptance

| ID | 操作 | 期待 / AC |
|---|---|---|
| IT-P1 | Desktopへ同名Main/Rough Prompt | Prompt root内Main/Rough各1、所有section一致 / 1 |
| IT-P2 | Rough Prompt B→C、chips更新、rerender | Main A、Rough C、disabled chip/collapse/text mode/assets混線なし / 7 |
| IT-V1 | ParamPanel stageGrouping=true | Parameter内Main/Rough各1、Batch/global Seed等1回、空stage無し / 1 |
| IT-V2 | Rough Steps30→40 | Main20、Rough40、sync off、専用/global Seed独立 / 4 |
| IT-PV1 | 実Desktopと実ParamPanelを同時render | 両root内独立heading、片側のheadingで他方を代替しない / 8 |
| IT-R1 | T4でDesktop両root、T5局所fixture、T7でSettings rootをrender | Desktopの `#desktop-prompt-scroll` / `#desktop-controls-scroll` は別HTMLElement、Settingsの `#settings-mapping-scroll` は独立scroll div。各divに `data-stage-scroll-root=""` / `stage-input-scroll-root` があり、group内control.closest('[data-stage-scroll-root]')が当該div。ParamPanel/sectionに新root無し、Settings saveはroot外。T5単体は同契約のtest-only controls divを使用 |
| IT-CMP2 | 既存Mobile/Matrixを変更せず再実行 | T5によりflatのquery hook依存を除去。Mobile18例外とint mappingを持つMatrixのmissing submit secondary failureが解消する。残れば新診断で再分類 |
| IT-CMP3 | T11のDesktop grouped consumer 3test | stable QueryClient wrapper/metadata seed、rerender保持、既存toolbar/chips/preview/進捗assertを維持して10/5/1のProvider例外を解消 |
| IT-CMP4 | T12のREQ-336/Settings旧UI期待 | stage region/headingとstage付きselect名で所属を確認し、保存payload等の既存assertを保持して旧tab/labelの2失敗を解消 |
| IT-BASE1 | T14のvisible復帰 | 非空の復元baselineはqueue同期/history冗長fetchなし、cold empty baselineではcomplete後にqueue/history fallback。sourceを旧無条件fetchへ戻さない |
| SC-API1 | T13 OpenAPI文書 | YAML/JSONのWorkflowMappingCreate/Read.variant_idがPydantic fieldと一致しoptional integer/null、required/endpoint不変 |
| IT-M1 | 実hook/grouping、shared QueryClientのmetadataを遅延・失敗・再取得 | stage/master片方ずつ到着→両取得、cold error→回復、cache有refetchでもmapping/role別値/chips保持、名前/順だけ更新。Desktop mastersのundefined/[]を区別、Mobile/default=falseはcache有でも元renderer。UT-H1の局所assertと合わせ共有fetchの重複/不要fetchを検証 |
| IT-S1 | 実AdaptiveとWorkflowConnection連携 | Main/Rough別section、未設定enabled slot/未指定option保持 / 1 |
| IT-S2 | Rough nodeB→C、save、成功mock、再取得/再表示 | 元master/variant ID、Main nodeA/Rough nodeC、save1回 / 6 |
| IT-S3 | Rough解除→save、別case保存失敗 | 当該variantだけ除去、Main保持、失敗時draft/未保存表示、import/export variant保持 |
| IT-S4 | variant1 とlegacy master1混在 | 互いに上書きしない、legacy payloadにvariant_idを捏造しない |
| IT-S5 | Settings成功保存後Generateの同workflow cacheを再利用 | ['workflow',id]をinvalidate/refetchし変更済みmappingを取得。失敗時はcache/draft保持、Stage/master rename成功の既存query invalidateも確認 |
| IT-S6 | updateをdeferred、Rough Cで保存→待ち中D/baseModel変更→古いC取得を返す→成功refetch完了 | Main A/Rough Dと新baseModelを保持、未保存表示、旧成功表示/preview解除なし、saving解除。次の明示保存はD/new modelを送信し成功表示。API成功後refetch失敗でも旧cacheにdraftを戻さない |
| IT-S7 | 同じ保存待ち中の再編集→古いupdateをreject | 最新draft/validation error保持、旧errorによる上書き/自動再送なし、saving解除。最新revisionの失敗は既存失敗・未保存errorを表示 |
| IT-S8 | 保存中workflow変更/同IDを閉じ直して別epoch | 旧成功は捕捉した元IDだけをinvalidate。現在sessionのフォーム/preview/保存表示へ適用せず、新sessionは最初の取得で1回初期化。保存後import snapshotも最新revisionだけ反映 |
| IT-S9 | warm workflow-config cache＋初回GETをdeferred、開閉/対象変更 | hydratedまではmapping/baseModel/import/export/保存を非mount、送信なし。fresh GET後だけ初期値を表示、編集後の背景取得ではdraft保持。保存成功後の開閉/対象変更で旧保存表示を解除。実QueryClient/実Settings UI、T8所有2ファイル内 |
| IT-S10 | 同Main内にsampling/steps、sampling/cfgの2slot | param付きcombobox名で各1を取得し異なるnodeを選択、両master payload保持。T7がproduction、T15所有のstaging testがlabel/保存、T12既存consumerがsteps選択を検証。重複slot削除/位置選択で回避しない |

T8: `Set-Location (Join-Path (git rev-parse --show-toplevel).Trim() 'frontend'); npx vitest run src/test/e2e_req347_settings_stage_groups.test.tsx`
T9: `Set-Location (Join-Path (git rev-parse --show-toplevel).Trim() 'frontend'); npx vitest run src/test/e2e_req347_generate_stage_groups.test.tsx`

e2e_*.test.tsx は既存Vitest結合試験の命名。実QueryClient・実対象UI・API境界mockを用い、groupやParamPanelをmockして自己検証しない。実ブラウザーE2Eは下記で別途行う。

hookのcold error試験だけはtest用QueryClientのretry=falseで待機を固定する。本番retry/staleTimeは既存設定を継承する。enabled=falseの「fetch無し」はそのhookのobserverを単独mountしcache有/無しでAPI呼出0をassertし、共有observerによるfetchと混同しない。query refetch failureは最後の成功dataを保持するcase、初回failureは空metadataのfallback caseとして分ける。

## Gate 3 — Browser Acceptance and Red Team

実対象ページをブラウザー操作しroot selector、viewport、scrollTop、header/target矩形、before/after値、画面証拠を記録。ツールを使えない場合はINCONCLUSIVE。3領域ごとに実施し結果を流用しない。

各3rootについてDOM属性/class、実際のoverflow-y、computed scroll-padding-top=44px、group内対象controlのcomputed scroll-margin-top=44px、headingの実高さ36pxを記録する。CSSの定義元はT2のStageInputGroup.css、DOM接続所有はDesktop両root=T4/Settings=T7。T5のwrapper追加でcontrolsに二重scrollができていないことを確認する。これらのstyle値だけで追従/切替/非遮蔽をPASSにせず下記BRを実操作する。

| ID | シナリオ | 判定 |
|---|---|---|
| E2E-G1 | 生成2欄にMain/Roughを表示 | 両rootそれぞれMain/Rough各1、所属一致 / AC-1/8 |
| E2E-G2 | Rough Steps30→40 | Main20、Rough40 / AC-4 |
| E2E-G3 | Rough Prompt B→C | Main A、Rough C / AC-7 |
| E2E-S1 | Settings対応付け表示 | Main/Rough各1、未設定候補維持 / AC-1 |
| E2E-S2 | Settings Rough→nodeC、save、再表示 | Main nodeA、Rough nodeC、payload両variant保持 / AC-6 |
| BR-1-P/V/S | 同stage本文途中scroll | 当該root上端に所属名、外page上端とは区別 / AC-2 |
| BR-2-P/V/S | Rough見出し到達前→到達→先→逆戻り | 到達前Mainは所属内、Rough通常位置root上端到達時Rough、逆でMain。viewport入場だけで切替しない / AC-3 |
| BR-3-P/V/S | sticky直下inputをclick・Tab/Shift+Tabでfocus、編集 | target上端>=header下端、操作部可視、click阻害なし、必要時だけfocus露出 / AC-5 |
| BR-4 | PromptだけRoughへ、ParameterはMain途中 | 他方Mainのまま、逆も成立 / AC-8 |
| BR-5 | 分割最小120px、drag、800×600、zoom200% | header36px、scrollして編集可、長名title/ARIA key識別、横overflowで隠れない |
| BR-6 | 長名/同名2stage、短い本文、単一/0 mapping | title/accessible name、ARIA/data key区別、空生成groupなし、短い2groupで早期切替なし |
| BR-7 | collapse、preset/workflow切替、master refetch | 値/disabled chips/role state消失なし、stale headingなし |
| BR-8 | query失敗、master欠落、inactive参照、第四stage | 入力保持、unknown名、sort_order、Settings候補保持 |
| BR-9 | sync enabled、Seed、LoRA/候補popup | disabled契約、専用/global Seed独立、popup操作をheaderが妨げない |
| BR-10 | Settings幅375/767、768/1024境界 | 独立rootと外pageを区別、save到達、既存44px対象寸法維持 |
| BR-11 | Settingsのsave応答を遅延しRough C保存後Dへ再編集、完了・再表示・次保存 | 開いたsessionはMain A/Rough D、未保存表示で編集可。旧C responseでDを戻さず、明示の次保存でDだけを確定。閉じ直し時は最新保存dataで初期化 / AC-6とSPEC_SETTINGS draft保護 |

BR-2のroot上端はborder/clientTop基準、丸め許容1px。paddingをviewport基準と取り違えない。section押し出し後に次header到達まで識別が欠けるならFAIL、section高さ/spacingを調整する。

### Measurement Oracle (independent of PASS labels)

許容誤差eps=1 CSS px。採取JSONはroot selector/clientTop/clientLeft/clientHeight/clientWidth/scrollTop/scrollWidth、各section/header/visible name/controlのrectとARIA/data key、input value、computed style、API request/response順序を含む。rectは実browserのgetBoundingClientRectで取得しmockへ置換しない。観測者のPASS記述ではなく、次の入力→計算expected→observed比較で判定する。数値未取得/fixture未成立はINCONCLUSIVE、比較不成立はFAIL。画像は矩形の目視交差確認と証跡に使い、それだけでPASSにしない。

- root viewportは`Vt=root.rect.top+root.clientTop`、`Vb=Vt+root.clientHeight`、`Vl=root.rect.left+root.clientLeft`、`Vr=Vl+root.clientWidth`。heading36/padding44/margin44はcomputed/rectを独立に比較するが、これだけでAC-2/3/5をPASSにしない。
- BR-1/2: sectionのnormal topをS、bottomをE、header実heightをHとし、productionのmargin0/top0/section自身にoverflow無しの前提で期待sticky top=`max(S,min(Vt,E-H))`。observed header.topとの絶対差<=epsを比較。Roughがviewportへ入っただけの`S>Vt+eps`ではheader.top=S（root上端へ固定されない）、root上端到達の`abs(S-Vt)<=eps`と本文中の`S<Vt<E-H`ではtop=Vt。Main/Rough/逆順を連続採取し、押出し区間もsection範囲に対して比較する。見出し名の可視矩形がrootと交差しない識別欠落はFAIL、単なるposition:stickyの存在で代替しない。
- 境界scroll位置は先に未scroll時のRough section normal topから`d=Srough-Vt`を計算し、rootのみをd-2/d/d+max(36,root.clientHeight/2)へscroll（0..scrollHeight-clientHeightでclamp）。実scrollTopとrectを再取得し、clampで必要な到達sampleを作れなければfixture不成立とする。逆戻りも同じ座標sampleを取る。driverがpixel scrollを操作できない場合はこの精密caseをINCONCLUSIVEとし未対応APIを呼ばない。
- BR-3: focus対象はownsection内control、visible header bottom=`min(Vb,header.bottom)`。native click/Tab/Shift+Tab後にcontrol.top>=visibleHeaderBottom-eps、controlのviewport交差width/height>0、入力変更後に期待値が保持されることを比較。click点の実hit targetがcontrolまたはその子であることを確認。完全可視controlではscrollTopが変わらず、隠れたcontrolの露出後も別2rootのscrollTop/値が変わらない。focus時のownroot scroll期待はT2既存のrect式で計算し、clamp範囲を考慮する。
- BR-4: 片側だけ操作した前後の別root scrollTop/valueが同一（scrollTop差<=eps）、そのrootのheader expected位置も維持。共有名でもselector/sectionを領域ごとに分離する。
- BR-5/10: viewport/zoom/分割変更後、root.scrollWidth<=root.clientWidth+eps、documentElement.scrollWidth<=documentElement.clientWidth+eps、各可視操作control/heading nameのrectがVl..Vrへ収まり、root内scroll後の編集/保存が成功することを比較。長名はtitle/accessible nameがfixture全文と一致しkeyで同名stageを区別、nameの省略表示を全文欠落と混同しない。zoomは実browser200%を確認、CSS transformで代替しない。heading高さはCSS pxの36を比較、physical image pxへ誤適用しない。
- BR-11: 上記固定API台本と実input/select valueを比較。送信1=C/model2、再編集後と旧応答後=D/model1、送信2=D/model1、未保存/保存済み表示と送信回数1→2をJSONへ残す。adapterは各requestのrequestId、開始/完了の単調seq、method/url/payload/response-or-errorを生logへ保存する。UI編集event/valueも別logへ採取する。旧応答を実際に解放し完了logを確認した後に、更新されたUIのD/model1保持を判定する。
- BR-11の必要な部分順序は`initial GET完了(B/model1) → PUT1開始(C/model2,held) → UI再編集(D/model1) → PUT1完了(C/model2) → invalidation GET開始/完了(C/model2) → UI保持確認(D/model1,未保存) → PUT2開始(D/model1) → PUT2完了/GET完了(D/model1) → 保存済み表示`。metadata取得等の無関係な並列requestの順番は拘束しない。実logの必要eventが欠落した場合INCONCLUSIVE、eventを観測して値が旧Cへ戻った場合FAIL。まだ未解放/未処理の応答を「無視できた」と扱わない。無限待ち/複数tabの新しい製品方針はこのcaseへ追加しない。

外部validatorは追加のAI判定器や任意golden screenshot hashを意味しない。上記expected計算と生の観測JSON/画像/API台本を別成果物として保存し、QA/親が同じ数式を再計算できることを求める。ブラウザーtelemetry/fixture transportがない現在はGate3 INCONCLUSIVEを維持する。

## Regression and Evidence

実装後にDesktopLayout/ParamPanel/WorkflowAdaptiveStaging/WorkflowConnectionSection、既存MobileLayoutと `npm test` をverify担当が確認。unit fixtureはQueryClient providerを追加。MobileのstageGrouping default=falseを維持する。

r5ではProvider追加をgrouped Desktop consumerに限定し、flat ParamPanel/Mobile/StudioはProvider無しでも使えることをT5で検証する。QueryClient hook自体のdisabled observer契約はT3で引き続き検証。T11～T14の局所commandを全て実行後、full frontend suiteを再実行し旧38失敗との差を記録する。

AC-1/2/3/5をPrompt/Parameter/Settingsの3列でPASS/FAIL/INCONCLUSIVE、AC-4/7/8とAC-6を別欄に記録。sticky classだけでAC-2/3/5をPASSにしない。r12前のGate1と有効な全体Gate2はPASS（226 files/2,053 tests）、Settings遅延保存/初期化5件とstaging10件も全体JSONでpassed。Gate3はbrowser/telemetry/隔離fixture transport未充足でINCONCLUSIVE。T6を含む実装カードは親の完了管理へ従い、過去の部分作成状態を現在へ適用しない。

現在のstaging test所有はT15、productionはT7、T12はT8/T15後。固定baseline/255・105の過去測定はREQ-347-r8-ownership-accounting.jsonと各カードに記録され、r12 T16–T20も同baselineで累積再計測する。履歴原文（r2時点の未実行文を含む）はREQ-347-test-plan-history.mdへ移した。r12では以下の補足AC-V1–3の視覚手順を追加し、既存機能AC1–8を維持する。

## Visual Revision r12 — Deterministic Supplement

対象はT16–T20、既存T1–T15は完了baseline。新しい視覚AC-V1–3はREQ-347.mdの表に定義。実装/測定結果は未取得。stage groupのh3名はStageMaster.name、Prompt項目のh4名はWorkflowMapping.display_name。schemaにstage display_nameはなく、可視stageKeyだけを省略する。既存Settings slot role→param/select名は維持。

### Additional Fixtures and Local Assertions

基準Main/Rough fixturesのstage名を「通常工程」「粗描工程」、key main/roughは保持。Prompt両mappingのdisplay_nameを「描写」、元role/ID/value A/B/chipsは保持する。別caseでstage名両方「同名工程」、keyはmain/rough、Prompt同stageに別ID/roleで同名2項目を用意。fallbackcaseはdisplay_name=null/空白、param_name=text/空白、role非空/空白を組合せ順序を確認。利用者の非空設定名「Rough Prompt」は全文保持caseとする。通常長list32slot/120px pane/330px入力幅/viewport800×600/200%zoomのrecipeは既存のものを使い、本番CSSをfixtureから上書きしない。

| ID | 検証 | 限界 |
|---|---|---|
| UT-VIS1 (T16) | 可視h3名のみ/key spanなし/title全文/ARIA name(key)/data/useId、空白fallback、root物理padding0と36/44/opaque/focus既存assert | jsdom/css文字列で物理sticky PASSにしない |
| UT-VIS2 (T17) | props省略は旧caption、falseは独立caption無し/元mode button各1、slot callback/UndoRedo hint/chips-mode往復 | 実折返し/viewport未測定 |
| IT-VIS1 (T19) | 実Desktop/QueryClient、h4表示名/toolbar別row構造、各roleのcopy-history/翻訳/assets/mode/collapse/value/chips独立、py除去/新root無し、旧tabs caption期待更新 | font/strip/折返しはbrowserへ残す |

新改訂後は全体Gate1/2を再実行し以前の2053件結果を新sourceへ流用しない。

### Additional Browser Oracle

ブラウザー前提/隔離transport/長本文成立条件/eps=1 CSS pxは上記と同じ。未取得はINCONCLUSIVE。header height36/font12、item collapse button font16/line-height24/font-weight600、root computed padding-top/bottom0、scroll-padding/margin44を記録する。

| ID | 操作と観測 | 客観的assert |
|---|---|---|
| BR-VIS1-P/V/S / AC-V1 | 各3rootの同stage本文中と境界/逆順、root/header rect・computedStyle・画像・実hit targetを採取 | sticky中はS<Vt<E-Hを満たすsampleでabs(header.top-Vt)<=1、root物理padding上下0、header背景alpha1/実opacity1。popup閉時、headerの左右内側4px/Vt+2pxの点でelementFromPointがheader/その子、前本文ではない。境界は既存max(S,min(Vt,E-H))規則で測定し、押出し中の旧headerへtop=Vtを強制しない |
| BR-VIS2 / AC-V2 | 通常/同名/長名/「Rough Prompt」/fallbackを実UIで確認 | h3 textContent=解決工程名のみ/visible key無し、h4 textContent=解決設定display_nameのみ。title/ARIAは全文、同名工程ARIA keyは異なりdata key/元mapping ID保持。role別編集後の他方値保持。設定値に含まれるstage文字を削除しない |
| BR-VIS3 / AC-V3 | 330px入力pane、120px最小高、800×600/200%zoomで各Promptの操作を開きclick/Tab/切替/編集 | h4/button computed16/24/600、toolbar.top>=h4.bottom-1、見出し同rowにcopy等無し。各button rectの横境界がroot client領域内、root/document scrollWidth<=clientWidth+1、wrap時も操作に到達しclick hit一致。独立caption無し/mode各1、copy/翻訳/assets/collapse後の元role/value/chips保持 |

BR-VIS1の水平採取点はheader.rect.left+4/right-4を使いroot client領域へclipする。幅が8px未満または必要sampleをscroll範囲内へ作れない場合fixture不成立でINCONCLUSIVE。horizontal root gutterは維持するため、root全幅へheaderを無理に拡張しない。本文がheaderの上へ漏れる帯はheader.top-Vtの測定、透けはopaque/styleと実hit/画像の一致で確認する。画像単独でPASSにしない。

Userの改訂前動作確認は日付/範囲を別に記録。改訂後BR-VIS1–3/既存ACをQAがPASS/FAIL/INCONCLUSIVEで返し、数値/操作ログと画像を親が再検算できるよう保存する。実browser能力が引き続き欠ければ必要capabilityを列挙してGate3 INCONCLUSIVE、unsupported新依存を追加しない。

### Popup Placement Supplement r14

T18のmenuAlign=startは全幅relative toolbarStartをanchorとし、popup left0/topfull/w72/max-width100%。default endは従来位置。IT-VIS1でdata-menu-align/start/全幅anchorと実menuの貼付・履歴操作、元role/value保持を確認する。collapse descriptionはh4外のsr-only stageKey/元roleへ結び、h4 textContent/accessible nameへ可視文字を増やさない。BR-VIS3ではpopup開時にもpopup.left>=Vl-1/popup.right<=Vr+1を実矩形で比較、履歴/貼付/TagSetにnative click/Tabで到達して元roleへ反映。overflowを隠してPASSにしない。AddAssetModalの既存開閉/overlay操作も確認。幅/操作telemetry未取得ならINCONCLUSIVE。
