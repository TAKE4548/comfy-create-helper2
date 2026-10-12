---
id: REQ-347-audit-response
status: review-required
tags: [REQ-347, design, ba-audit]
related_paths: [docs/design/REQ-347.md, docs/design/REQ-347-test-plan.md, implementation_plan.md]
---

# REQ-347 ローカルBA監査の指摘応答

## Result and Trace

初版の設計・test-plan・全10カード・implementation_plan（13対象）を監査。固定qwen/qwen3.5-9b / Q6_K、context-length32768、reasoning none、timeout600秒/推論、input68,225文字、3 chunks＋最終合成まで完了、audit exit0。raw verdictは **Design Gate FAIL**。実行完了は設計PASSを意味しない。

直後の --unload-after はloadedなしを確認。明示unloadもexit0、追加 lms ps --json は []。GPU全メモリ解放を意味しない。lms CLI commit69d945a、runtime lsのselected engineはllama.cpp-win-x86_64-amd-rocm-avx2@2.55.0。LM Studio app versionは今回独立確認していない。API/CLIは初回からelevatedで実行した。

対象hash・処理情報はREQ-347-audit-trace.json、raw本文はREQ-347-audit.log、解放はREQ-347-unload.log。監査後の以下の改訂は再推論していない。原判定を保持して人間レビューへ返す。

## Finding Responses

| 指摘 | 判定と根拠 | 対応 |
|---|---|---|
| 1-A sectionにoverflowがないと最寄りrootのscrollByは不可能 | 前提不一致。既存Desktopの2div自体がoverflow-y-auto、Settingsにもrootを新設。section内headerはそのrootにsticky。HTMLElement.closestでrootを取得して直接scrollできる | 設計/T2へclosestの対象を明記。section単位scroll/transform追加案は境界切替を分断するため採用しない |
| 1-B WorkflowMappingとWiringMappingItemが不一致 | 2種類は用途が違う。T1の生成投影とT6のSettings slot投影が既に定義され、共通componentはname/key/childrenのみ | 設計/T6へ別投影とmaster/variantからrole/displayNameを導出することを明記 |
| 1-C pendingと実装要件が矛盾 | 設計承認後の手順を事前生成するdev-designの必須ゲートと一致。手順記載は着手承認ではない | draft/pendingを維持。監査推奨の自動approved化や手順削除は行わない |
| 2-A ambiguous/orphanが未定義 | 初版Generation Grouping Contractにlegacy一意一致/曖昧Main、explicit未解決unknownを既に定義。作成日での推測は不要 | UT-G2の既存境界を維持、同名工程key識別とmetadata取得前の入力保持も維持 |
| 2-B legacy payloadにvariant_idが含まれる | 抜粋は変更前コード。実装要件はlegacyに捏造しない旨を既に要求。ただしserialize式を具体化する価値がある | T7へconditional spreadを明記。T6はmaster単位でV2/legacyを判定、mixed slotも保持。IT-S4で検証 |
| 2-C 変更後cache同期が不明 | 一部採用。StageManagerModal成功時stage-masters/mapping-masters invalidateは既存実装済み。workflow設定成功時はworkflows/workflow-configしかinvalidateせず生成のworkflow cacheに通知が欠ける | T8を2files/280行へ更新しWorkflowConnectionSectionを所有。成功時['workflow',id]もinvalidate、失敗時draft/cache保持。IT-S5を追加 |
| 3-A jsdomでsticky偽陽性 | 初版test-planと各カードでAC-2/3/5はjsdomでPASSにしない、Gate3実ブラウザー証拠を要求済み | 3領域それぞれのBR-1/2/3とINCONCLUSIVE規則を維持。新Playwright依存は不要、利用可能な実ブラウザーUIツールで検証 |
| 3-B buildWiringStageGroupsをDesktopでrenderする結合testがない | 呼出先を取り違えている。T6はSettingsだけ、T8で実Adaptive/WorkflowConnectionを結合。生成はT9で実Desktop/ParamPanelを結合 | IT-S1/S2とIT-PV1で別投影・別UIを検証する計画を維持 |
| 4-A 絶対pathが禁止 | 本roleとskillはworkspace境界監査・正確な対象path/commandを要求。カードはこのlocal workspaceの自己完結手順、repository内参照は相対path | 個人path禁止の新規規則を導入せず維持。CI汎用化は要求範囲外 |

## Additional Boundary Clarification

CSS stickyのsection間に既存space-y/gapが残ると、旧見出し消失と次見出し到達の間で識別が欠ける可能性がある。T2/T4/T5/T7へ「工程一覧wrapperはgap/margin0、余白はsection本文内」を追加した。BR-2はroot border基準・丸め1pxで測定し、空白区間があればFAIL。jsdomで代用しない。

## Review Gate

上記は監査後の改訂。raw FAILを無条件PASSへ変更していない。初回人間レビューの承認後に実装へ着手し、T1契約不足で停止。全カードはdraft/design_gate=pendingへ戻す。T6の `frontend/src/utils/__tests__/wiringStageGroups.test.ts` は部分作成済み・test/typecheck未実行。dev-design Step2/Step4の人間設計レビューにより、実装計画・トレードオフ・監査応答を確認した後の改訂承認が必要。

## Engineer Escalation and Revision Coverage

2026-10-12 `hook-query-contract-r2`: T1にhook署名まで掲載したことで三引数純粋関数との接続責務が不明だった。既存stageMastersApi.list(true)とStageManagerModal/Settingsの共有query keyを根拠に、T3がStageMaster[]を取得しT1の必須第三引数へ渡す契約へ明確化。T1からhook署名を除き、T3に完全な接続とdisabled/cache/pending/error/空引数規則を記載し、T4/T5/T9とtest-planへ具体的呼出・UT-H1/IT-M1を同期した。API/schema・DAG・所有ファイルの拡張はない。

初版raw verdict・監査ログ・unload・traceの初版hashは保持する。初版監査はこの改訂を評価しておらず、以前の境界/serialize/cache通知の監査後改訂も未監査。今回の改訂のローカルモデル再監査も未実行で、PASSを主張しない。全13対象の再監査は新規ログ/traceと直後unloadに記録し、結果を改訂レビューへ添える。


## Current Review Disposition

2026-10-12ユーザー追加指示により、通常のエンジニア差し戻しはArchitectが自律修正し、再承認待ちで止めない。今回の取得接続の明確化は承認済み要件内であり人間の新規判断事項はない。初回レビュー承認とこの追加指示を実装再開の承認根拠として親調整役へ返す。

## R2 Full Audit Result and Responses

`hook-query-contract-r2` の設計・test-plan・全10カード・implementation_plan（13対象、79,982文字）を再監査した。固定qwen/qwen3.5-9b / Q6_K、context32768、reasoning none。4 chunks＋最終合成まで完了、audit exit0。raw verdictは **FAIL (実装着手禁止)**。直後の明示unload exit0、LM Studioのno models loadedを確認。今回の証跡はREQ-347-r2-audit.log / REQ-347-r2-audit-trace.json / REQ-347-r2-unload.log。初版raw FAILと旧証跡は変更していない。

| r2指摘 | 証拠に基づく評価・対応 |
|---|---|
| 1-A Settings保存がworkflow-configだけ無効化、master/stage更新規則が不明 | 前提不一致。設計Sticky Header and Editing Contract/T8は成功時 `['workflow',id]` の追加invalidateを規定。既存StageManagerModal L52/65/75/86はstage-mastersとmapping-mastersを成功時にinvalidateする。ワークフロー対応付け保存はmaster/stage定義を変更しない。IT-S5/UT-H1を維持。 |
| 1-B 36px headerと44px scroll余白が矛盾 | 36pxが見出し実高さ、44pxはその下に8px余裕を残すscroll余白。両者を等しくする必要はない。focus補正は44px固定の早期トリガーでなくheader/root/targetの実矩形を比較するT2契約。BR-3/5で非遮蔽を実測。 |
| 1-C Desktop groupingとParamPanelのflat defaultが矛盾 | T4はDesktopからstageGrouping=true、T5はtrueでgrouping・falseで元renderer。default=falseは既存Mobile等の呼出互換。T3/T5/r2設計にはdisabled返却[]を元rendererで扱う流れが明記済み。共通T2はheading wrapperのみで入力rendererを置き換えない。 |
| 1-D promptChips/paramValues自動再構築のSSoT矛盾 | 今回は新規再構築/双方向同期を設計していない。既存Desktop L185/194はstore promptChipsとsetPromptChips(role,chips)、L548以降はrole別値/既存callback。T4/T9はこれを保持しdisabled chip/collapse/preset回帰を要求。既存状態管理の全面変更は本要求の必要性が示されていない。 |
| 2-A m:/v: keyだけでは保存型を区別できない | 既存保存型のvariant_id有無が識別根拠。T7はMap<string,WiringMappingItem>と元variant_idを保持し、legacyにvariant_idを捏造しない。キーだけから保存entityを逆推定しない。IT-S4はmaster1/variant1混在を検証。DB/schema変更の根拠なし。 |
| 2-B role/param_name省略payloadがbackendで必須か不明 | `backend/app/schemas/workflow.py` L48のWorkflowMappingCreateはmaster_id/node_id/optional variant_idだけ。L82のWorkflowUpdate.mappingsも同型。Readにはoptional role/param_name等があるがCreateに要求されない。既存WorkflowConnectionSection L161/L173の保存契約を保持している。IT-S2で再取得確認。 |
| 2-C union型とStageMasterのsuperset保証が必要 | StageMasterとMappingMasterは別型・別引数でsuperset関係を要求していない。T1/T6はmasterのvariants有無を型安全に判定してV2/legacyを投影し、共通grouping関数はgroup_idへ依存しない。queryのunion castは既存未知response境界の型付けであり、legacyをV2と断定する契約ではない。typecheck/UT-G2/UT-S1を維持。 |
| 3-A jsdomではscroll試験が不可能 | test-planは既にCSS/実矩形の受入をGate3の実ブラウザーへ分離、ツール利用不能ならINCONCLUSIVE。UT-C1のmock矩形はfocus局所試験。T4/T5/T9のjsdomをAC-2/3/5のPASSとしない。 |
| 3-B T2が欠落、T3もT2に依存 | T2カードは93行、props/signature/36px sticky/z10/root/focus/unitを物理記載し、今回の13対象にも含む。T3は純粋投影T1だけに依存しT2を必要としない。T4/T5はT2/T3依存、T9はT4/T5完了後というDAGが既に存在。 |

Architectの判断: 指摘を原文のまま保存し、前提不一致は上記根拠で応答した。エンジニア差し戻しの取得契約は解消され、人間の新規判断事項は0。今回の応答で挙動・DAG・タスク所有を変更していない。入力保持・混在保存・非遮蔽は実装後の試験で検証する実リスクとして残る。raw FAILは設計PASS/実装受入PASSへ変換しない。親調整役へこの判断と証拠を渡し、ユーザーの自律修正指示に基づき継続する。

Coverage: r2の全13対象snapshotをモデルが監査した。本節と監査結果の記録のみを監査完了後に追記し、その報告記録自体は再推論していない。カードの動作契約は監査時snapshotから変更なし。

## R3 Engineer Escalation — Scroll Root Contract

2026-10-12のT2エンジニア差し戻しは、最寄りroot検出の属性と共通scroll-padding classの名称/配置、および外部divを編集する担当が未定義という指摘。これはローカルモデル監査の指摘ではなく、`scroll-root-contract-r3` の設計修正である。初版/r2のraw verdict・応答・log/traceを変更しない。r3はローカルモデル未監査、実装受入未確認。

根拠: DesktopLayout.tsxのfirst/secondに `#desktop-prompt-scroll` / `#desktop-controls-scroll` の既存overflow-y-auto divがある（差し戻し時点L490/L569）。T4が同ファイルを既に所有し、T5はParamPanel.tsxのみを所有する。T2のStageInputGroup.cssが共通CSS所有先、T7のAdaptiveWorkflowWiring.tsxがSettings専用scrollの追加先。外部root接続をT2に持たせると3ファイル制限を超えるため、既存所有へ割り当てる。

対応: 検出selector `[data-stage-scroll-root]`、空文字属性、`stage-input-scroll-root` class、T2 CSSのroot padding44/control margin44、36px headingと8px余白、focus対象/clip矩形/scrollByの符号を明記した。Desktop両root=T4、Parameter本文=T5、Settings root=T7とし、T4/T7で属性/class、T2で実CSS規則とmock focus、T5で既存root利用、Gate3で実計算値と3領域の追従/非遮蔽を確認する。所有ファイル数/行上限/DAG維持、分割不要。人間の新規判断事項は0。初回承認とユーザーの自律差し戻し指示を根拠として親調整役へ返す。

## R3 Full Audit Result and Responses

`scroll-root-contract-r3` の全13対象、89,679文字をqwen/qwen3.5-9b / Q6_K、context32768、reasoning noneで監査した。4 chunks＋最終合成、audit exit0、直後unload exit0/LM Studio no models loaded、監査と解放を含む477.335秒。raw verdictは **FAIL (実装停止推奨)**。新証跡はREQ-347-r3-audit.log / REQ-347-r3-audit-trace.json / REQ-347-r3-unload.log。実行成功を設計PASSに変更しない。

| r3指摘 | 根拠と評価・対応 |
|---|---|
| 1-A rootの所有権パラドックス、SettingsとDesktopのroot統一不足 | 前提不一致。r3のroot表とT2/T4/T5/T7はCSS=T2、Desktop両div=T4、Settings div=T7、Parameter利用=T5を明記。CSSを別componentのclass/属性に適用することは通常のstylesheet契約であり外部ファイル編集を必要としない。Settingsは別ページの別編集領域。PBIは3領域の独立検証を要求し、root統一は要求と相違する。 |
| 1-B StageMaster取得の循環依存、T3 hookへ必須stages引数 | 前提不一致。T1カードL102/105は三引数純粋関数のみ、T3 L106/133-152はhook(mappings,masters?,enabled?)と内部stage query→T1第三引数を明記。T1→T3→T4/T5の一方向DAGで、T1はhookを消費しない。 |
| 1-C save中の再編集でrevision違い、結果非表示/データ不一致 | **一部採用。** 最新draftに古い成功/error表示を重ねないrevision gate自体は妥当。ただしWorkflowConnectionSection.tsx L159-163のconfigWorkflow更新effectにはdraft guardがなく、L178-184の成功表示gateだけでは古いrefetchによるconfigMappings/baseModel上書きを防げない。SPEC_SETTINGS L83に照らし具体的な実リスク。r4でT8所有の編集session初期化1回＋save ID/epoch/revision/snapshot保護へ修正し、遅延save→再編集→旧refetchを検証する。 |
| responsiveにResizeObserver必須 | 前提不一致。見出しは固定border-box高さ36px、長名1行省略、位置はCSS stickyによる再レイアウト。focusの矩形はイベント時に読み直し、保存した高さを使わない。BR-5/10でresize/zoomを実測する。新Observerの必然性は示されていない。 |
| portal用のsticky戦略切替不足 | section外のportalはstage groupのscroll内容ではない。T2はevent.targetがown section外ならno-opと明記。候補popupをheaderが妨げないBR-9は維持する。modal全体へ新sticky機能を追加する要求はない。 |
| 同roleの複数legacy masterのtie-break未定義 | mapping.master_idが対象masterを識別する。T1はそのmaster内のcomputed_role完全一致variantが一意なら採用、曖昧はlegacy Main。異なるmaster同roleから最小IDを選ぶ案は元mappingのidentityを変更するため採用しない。UT-G2で元mapping参照を保持する。 |
| masters=[]/stages=[]の空状態未定義 | 設計Generation Grouping ContractとT1 L140-143、T3 L133-152でexplicit variantはunknown、legacyはMain、stage未取得かつmaster有はvariant名fallback、元入力保持を明記済み。roleをunknownに改名する案は値キー保持と矛盾する。 |
| jsdomではstickyを検証不可 | 同意する既存制約。test-plan L29/Gate3と全カードでmock矩形は局所focus試験、実sticky受入はブラウザー3領域に分離済み。unitを純粋関数だけへ狭めずDOM属性接続/編集独立性の結合testも維持する。 |
| 検証ファイルが生成/Settingsを誤指示している可能性 | 具体的な誤指定の提示なし。T4=DesktopLayout、T5=ParamPanel、T7=WorkflowAdaptiveStaging、T8/T9は実対象ページの結合testと明示済み。typecheckと局所commandはカードの所有testを指定し、Gate3は実対象ページで操作する。 |

監査中にT1/T2/T3/T6/T10の全体hashが変わったことを終了時に検出した。監査前hashと終了時hashをr3 traceへ別々に保持し、調整役のmetadata更新か内容変更かを照合する。モデルは全対象を読み込み89,679文字を固定してから分割推論した。この応答とr4挙動改訂はr3監査後の追加であり、r4全13対象の再監査で評価する。

調整役へ照合し、上記5カードはpbi_managerによるstatus frontmatterの更新だけで挙動本文は変更なしと確認した。r3のbody hashは監査前に採取していないため、この分類の根拠は調整役の更新履歴。r4ではfull/body両hashを採取し、以後のmetadata driftと本文変更を直接区別する。

## R4 Concrete Finding Disposition

保存競合は`settings-draft-session-r4`として採用・設計修正した。最小の保護は、編集sessionのID/epochと既存revision、初回hydrateフラグ、APIが成功したrevisionを持つ1つのref。後続configWorkflow refetchをフォーム初期化に再利用せず、最新saveだけ送信snapshotを明示採用する。再編集は未保存表示で保持し、finallyでsavingを解放する。これにより旧成功/旧error/旧cacheが最新draftを戻さない。別workflow/同ID閉じ直しのepochも分離する。

T8の2所有ファイル内、source約65/test約235、上限300行で具体化した。IT-S6/7/8とBR-11を追加し、r4全13対象を再監査する。人間の新規判断事項0。外部mapping/baseModelの変更は同sessionフォームへ自動適用せず閉じ直しで採用するという制約を設計/planへ明記した。新API/新schema/外部ファイルを追加しない。r3 raw FAILは保持し、この設計修正だけで監査PASS/実装受入PASSとは判定しない。

## R4 Full Audit Result and Responses

`settings-draft-session-r4` の現行全13対象、96,492文字を再監査した。qwen/qwen3.5-9b / Q6_K、context32768、reasoning none、timeout600秒/推論、5 chunks＋最終合成、audit exit0。直後unload exit0/LM Studio no models loaded、監査と解放を含む464.031秒。raw verdictは **Design Gate FAIL（設計ゲート失敗）**。REQ-347-r4-audit.log / REQ-347-r4-audit-trace.json / REQ-347-r4-unload.logへ保存した。過去のraw FAIL/応答/証跡は保持し、exit0を設計PASSへ変換しない。

| r4指摘 | 根拠に基づく評価・対応 |
|---|---|
| A sticky36/padding44/focus矩形の幾何矛盾 | 実装受入のリスクとしてGate3に残す。36はborder-boxの見出し高さ、44はscrollの補助余白、focusは実際のroot/header/target矩形を読み、target上端を可視header下端+8へ移すため負のscrollByを使う。scroll-paddingをstickyの高さ/閾値と取り違えていない。T2の例は100..136のheaderと120..150のtargetに-24を適用。ブラウザー差やclamp後の露出はBR-3/5で実測し、未確認時にPASSにしない。scrollIntoView案は外pageまで動かす可能性があり既存局所root契約へ置き換えない。 |
| B/SSoT-3/action1 jsdomで物理ACをPASSにする矛盾 | 前提不一致。test-plan Gate3は3領域の実対象ページでroot/viewport/scrollTop/矩形と画面証拠を必須化し、ツール不可時INCONCLUSIVEと明記。UT-C1はCSS規則/DOM接続とmock focusの局所試験。全カードもAC-2/3/5をjsdomでPASSにしない。手動QA必須という提案は既存契約に含まれ、Playwright/Cypressの追加は必須ではない。 |
| C/action4 長時間放置/タブ閉じでsession消失、再初期化がdraft保護と矛盾 | r4のepochは設定の開閉/対象変更handlerだけで増やし、放置のTTLを持たない。同sessionの再接続/背景refetchはhydrated=trueでdraftを上書きしない。API成功は同ID/epoch/revisionの最新snapshotだけ反映。明示的な閉じ直しは新sessionで最新dataを初期化する制約を設計へ開示済み。browser終了後のメモリーdraft永続化/外部更新conflict UIはREQ-347のAC外で、今回の変更がsessionをタイマーで破棄する前提はない。IT-S6/7/8で実動作を確認する。 |
| D/action2 FAILのまま継続するaudit loop | raw FAILを保持し、指摘ごとにArchitectが根拠を照合する手順。初回設計レビューは人間が承認し、その後ユーザーが通常の差し戻しを自律修正するよう明示指示した。ローカルモデルが人間の既存承認を取り消す規則は適用skillにない。r3の実リスクは採用してr4修正・再監査済みで、無評価のゲート省略ではない。実装受入は依然未確認。 |
| unknown variant編集時のAPI error/cleanup不足 | T1は不明metadataでも元mappingを保持しroleを変更しない。生成投影が保存payloadを改変する機能はなく、variant自動削除/修復は要求外。SettingsのAPI失敗はT8/IT-S3/S7で最新draft保持と未保存errorを検証。架空variantを捏造するcleanupを追加しない。 |
| viewport高36pxでoverflow | 実ブラウザーで確認する境界リスク。生成の分割minSize=120、BR-5の小pane/zoomとBR-10のSettings幅境界を既に指定。headerだけの極端なviewportを通常の操作可能レイアウトと断定しない。実測で入力が遮蔽/操作不能ならFAILとして設計へ戻す。 |
| disabled cache invalidate→再有効化で空画面 | T3はdisabled時返却[]を元flat rendererへ渡す契約。enabled時はquery cacheまたは空metadataをT1へ渡し元mappingをfallback groupで保持する。UT-H1/IT-M1にdisabled cache有無・再有効化・pending/error/metadata到着を含めている。空metadataを入力array=[]と混同しない。 |
| Settings保存invalidateがGenerateの編集中値を失う | 既存useWorkflowManagement.ts L39-43はworkflow queryだけを再取得し、値を直接resetしない。useGeneratePageState.ts L80のuseWorkflowParams→同hook L45-65はdefaultParamsよりhealedBaseParamsを後勝ちでmergeし既存role値を保持、新規keyだけ補完する。T8 IT-S5/T9 IT-M1で再取得と値/chips保持を確認する。roleそのものを変更する別のworkflow編集に自動merge保証を拡張しない。 |
| legacy/V2混在・stage欠落・ID衝突/SSoT補完7 | T1は同masterのexplicit variant、一意legacy/fallback/unknownとinactive参照順を定義。T6/T7は各masterのvariants有無でslot化、legacyをMainまたは先頭stageへ1回、v:<variantId>/m:<masterId>を分離しpayload元ID保持。UT-G2/UT-S1/IT-S4で検証する。APIへ新ID体系を追加する必要はない。 |
| SSoT-1 hook引数変更がbackend API drift | hookは新規frontend内部関数、HTTP endpoint/request/response schemaは変更しない。T3のstage/master取得も既存APIを利用する。内部exportとbackend公開HTTP APIを混同した指摘。 |
| SSoT-2 root責務/依存グラフ8 | r3 root表と各カードで共通CSS=T2、Desktop両root=T4、Parameter利用=T5、Settings root=T7を明記。SettingsのT6は独立純粋slot投影で生成hookを呼ばず、T3に依存しない。T10は承認設計に沿う仕様同期を所有し、実装source待ちの依存を人工的に増やさない。 |
| empty group統一5 | PBIの推論点が生成はmapped入力だけ、Settingsは未設定enabled候補維持と明示。T5の空groupなしとT6/T7の0slot説明は各用途の要求に一致する。同一表示ルールへ統一するとSettings候補または生成の入力制限を失う。 |
| T9を実装計画から除く6 | T9は物理testファイルを生成/編集する検証実装タスクで、T4/T5後というDAGが既にある。受入のreview担当とintegration test実装の所有は分かれている。T9を除く根拠はない。 |

監査終了時、全13対象のbody hashは監査前と一致した。T9だけfull hashが変わりbody一致のためmetadata-only driftと直接判別できた。r3のT1/T2/T3/T6/T10 driftは調整役からstatus更新のみと確認済み。以後の追記は監査結果/根拠応答/trace/handoverだけで、T8を含む全カードの挙動契約はr4監査snapshotから変更しない。

Architectの判断: r3で採用した実リスクはr4のsession/revision保護として具体化・再監査済み。r4の指摘は既存契約との前提不一致、要求外の拡張、または既にGate3へ残した実測リスクとして上記根拠で評価した。raw FAILを無条件PASSにしない。人間の新規判断事項は0。T8の契約は凍結済みで、親調整役がこの監査応答と既存のユーザー承認を確認して継続する。T8の遅延保存試験と3領域ブラウザー受入は実装後に必須。今回の監査結果記録自体は再推論していない。

## R5 Gate 2 Diagnostics and QA Finding Disposition

全frontend診断 `tmp/REQ-347-vitest-report.json` は2050 tests中38 failed/2012 passed、exit1。これを設計差し戻しへ全件取り込んだ。REQ-347局所testが通っていても全体Gate2のPASSとはしない。以下は実装前の修正計画であり、修正後結果は未確認。

| 原因/件数 | 実コード・診断根拠 | 対応 |
|---|---|---|
| Provider直接例外34 | DesktopLayout.tabs10、MobileLayout18、GenerationProgress5、REQ-339 preview1。useMappingStageGroupsはenabled=falseでもuseQueryを呼びProviderが必須。ParamPanel親L151がdefault falseでもこれを呼ぶ | T5でgrouping時だけmountする子componentへquery hookを移しflat Provider-free契約を維持。Desktopの意図的groupingはT11のstable Provider fixtureへ移行 |
| Matrix missing submit1 | 失敗caseだけint mappingを持ちMatrixGenerationStep L971でshared ParamPanelをmount。QAのunhandled stackはuseMappingStageGroups L12→ParamPanel L151のNo QueryClient。render例外でbodyが空となりbuttonが見つからない | T5修正後に当該testをそのまま再実行。Studio/source/testへ不要なProviderを追加しない。残る新症状は再分類 |
| UI旧期待2 | REQ-336は存在しなくなったtabを要求。Settingsは旧sampling のノードlabelを要求、現名はstageNameを含む | T12でregion/headingとstage付きselectへexpectを同期。payload/既存機能assertは維持し、既存testという理由で除外しない |
| visibilitychange1 | JSON locationは367のfetchHistory、fetchQueueの366は成功。useGenerateDisplayState L638-647は非空baseline/waiting/checkingでfull historyを抑止。fixtureは非空history/batch | T14で非空baseline保護とcold empty fallbackを分けて確認。変更対象外の旧test契約不整合。変更前baselineの実行証拠がないので歴史的FAILとは断定しない |
| QAのOpenAPI workflow variant欠落 | backend/schemaのoptional variant_idは実在するが、docs/openapi.yamlとbackend/openapi.jsonのWorkflowMappingCreate/Readには欠落。docs/system/openapi.yamlは実在しない | 指摘を採用しT13を追加。runtimeを変えず2snapshotをPydantic fieldへ同期、required/endpoint維持 |

visibilitychangeの調査初期に「useGeneratePageState本体にlistenerがない」とした暫定所見は、委譲先useGenerateDisplayStateに実listenerがあるため訂正した。実際の失敗はqueueではなくhistoryの抑止条件との期待差である。backend実装を根拠としたR2/R4のvariant受け付け評価は正しいが、保存済みOpenAPI文書の欠落を除外できる根拠ではなかったためT13で補う。

`consumer-compatibility-r5` の設計・test-plan・T5とT11～T14・planを更新した。query hook自体のT3 disabled契約を変えずcomponentのmount境界を修正する。17対象の監査計画/full-body hashを準備し、r4以前の全raw verdict/log/trace/unloadを保持する。r5は未監査。人間の追加判断事項0。既存の承認と自律差し戻し指示を根拠として親へ返す。

## R5 Full Audit Result and Evidence-Based Responses

2026-10-12 r5全17対象（design/test-plan/全14カード/implementation_plan）、120,119文字、6 chunks＋最終合成を完了。qwen/qwen3.5-9b/Q6_K/context32768/reasoning none、audit exit0、754.925秒。raw verdictは **【設計ゲート FAIL】（実装着手禁止）**。exit0は監査処理の成功だけを示す。直後unload exit0、独立したlms ps --jsonもexit0で`[]`。原文logと全過去監査証跡は変更しない。

監査前snapshotと完了時の全17対象のfull/body SHA256は一致し、metadata driftもない。モデルの入力にimplementation sourceは含まれない。以下はArchitectによる指摘照合であり、raw FAILをPASSへ変更するものではない。

| 生の指摘 | 根拠付き応答・処置 |
|---|---|
| T13/T14が実装済みでFAILと矛盾 | 前提不一致。両カードはsnapshot/currentともstatus:draft、design_gate:pending。planの「実装済みoptional variant_id」はbackend/app/schemas/workflow.py L41/L51に既存fieldがあることを指し、snapshot同期T13の完了ではない。T14も未実装。原文を書き換えるPASS/Partial Pass案は採用しない。 |
| 親へ返す処理が監査迂回/審議ループ | dev-design Step4は親へstructured handoverを要求。初回人間承認と今回のユーザーによる自律差し戻し指示を保持し、実リスクを修正して再監査している。判定と応答を分けて親へ返す。モデルによる新たな停止命令を人間判断必須と解釈しない。 |
| jsdomでsticky AC-2/3/5をPASSにする | 前提不一致。test-plan Gate3と各カードは実ブラウザーの3領域証拠を必須とし、未確認時INCONCLUSIVE。unitはDOM/CSS契約とmock矩形だけ。typecheck/unitを削除せず、ブラウザー実測を別に残す。 |
| masters undefined/[]、pending/errorの優先順位不明 | T3はundefined時のみfetch、明示[]優先、最後のquery.dataまたは空metadataをT1へ渡して元mappingを保持。UT-H1/IT-M1が到着/失敗/共有cacheを確認。r5 T5はflat時query子を非mountにしてProvider互換性を修正し、hook自体のdisabled契約は変えない。 |
| 同ID再開のepoch/初期化がdraft保護と矛盾 | 明示開閉・対象変更は新session、同sessionの背景refetchはdraft保持というr4契約を開示済み。放置TTLはない。ただし下記のwarm-cache初期化前編集は実コードで新たに確認した具体的不足として採用する。 |
| variant_idの必須/optional/legacy serialize不整合 | backend Create/ReadはOptional[int]=None、UpdateはCreateを参照。T7はslot.variantIdがある時だけ保持し、T8はnull/undefinedを省略する。T13は実際に欠落した2 OpenAPI snapshotをoptional nullable/default nullで同期しrequiredを変更しない。未知IDの捏造/role変換はしない。 |
| T2 focus補正数式と見出し切替が数学的に衝突 | 前提不一致。focus補正は対象とown headingの実重なり時に最寄りrootだけ露出する処理。見出し切替はCSS stickyと次sectionのroot上端到達。50% viewport閾値を導入するとAC-3を変えるため採用しない。clamp/小pane/遮蔽の実リスクはGate3で測定。 |
| T11の空fixtureがAPI error/実fetchを検証しない | T11は既存Desktop consumer fixtureの互換性を担当。実hookをmockせずstage/master空metadataをseedし入力保持を確認。metadata取得/到着/失敗はT3/T9のUT-H1/IT-M1が担当し、T11へ重複所有しない。 |
| T4/T5が同じQueryClientか不明 | App.tsxのPersistQueryClientProviderが両方を包み共有query keyを利用。T9は実Desktop/ParamPanelを同Providerでmount。T5 flat子は非mountでqueryを要求しない。各testの独立clientはtest間cache漏れ防止。 |
| root/CSS所有不足、T4→T5の追加依存が必要 | r3 root表と各カードにCSS=T2、Desktop両root=T4、Parameter利用=T5、Settings root=T7を明記。source所有は分離、T9が両方に依存。人工的T4→T5は不要。新カードを含むDAGは最大4層。 |

### Genuine T8 Finding: Warm-Cache Initial Hydration

監査応答の実コード照合で、WorkflowConnectionSection.tsx L162–168はisFetching中の初期化を待つ一方、L644–663のUIはconfigWorkflowがcacheにあればhydrated=falseでも編集可能と確認した。warm cache→初回GET遅延→node/baseModelを編集→fresh GET完了でeffectがdraftを上書きしackを現在revisionへ進める経路がある。初回取得の保護不足であり、モデルのT13/T14状態誤認とは別の具体的問題。再現試験はまだ実行していない。またtoggle L635–641に既存T8必須のsetSaved(null)がなく、別sessionへ旧保存表示が残る。

`settings-initial-hydration-r6` としてT8へ技術的修正を差し戻す。選択ID/session/configWorkflow一致かつhydrated=trueまで編集フォーム全体を非mount、初回GETとeffectの間も保護する。hydrated後の背景取得では編集を妨げない。保存入口も未初期化を拒否。toggleでsavedを解除。実QueryClientのwarm cache＋deferred GET、初期化後再編集と背景GET、旧保存表示解除をIT-S9に追加。T8の所有2ファイル/300行、依存T7を維持し、超過予測は再分割へ戻す。通常の安全な技術選択で人間判断は不要。

この追加契約はr5終了後の未監査改訂であり、r5のhash coverageで監査済みとはしない。新設計の監査とT8の実装/試験、T5/T11～T14の修正後全体Gate2、3領域Gate3は未完了。親調整役へraw FAIL・応答・T8具体的差し戻しを返す。

## R6 Full Audit Result and Responses

r6全17対象122,815文字/6 chunks＋最終合成、qwen/qwen3.5-9b/Q6_K/context32768/reasoning none、627.849秒、audit exit0。raw最終判定 **【実装着手禁止】 (Implementation Prohibited)**、report見出しは「REQ-347 統合設計レビューレポート：実装着手禁止（Design Gate FAIL）」。直後unload exit0、独立lms ps --json exit0/[]。REQ-347-r6-audit.log/trace/unload.logを保存しr5以前の証跡は変更しない。完了時全17本文hash一致、T11/T12/T13/T14だけ全文hashが変わりmetadata-only、他13全文hash一致。監査入力は文書だけでsource検証結果ではない。

| 生の指摘 | 根拠付き応答 |
|---|---|
| 未hydrated編集不可とrevision増加が矛盾 | 状態を混同。初期取得中は未編集でフォーム非mount、初期化後の保存中再編集だけrevisionを増やす。T8 IT-S9は前者、IT-S6/7/8は後者。「読み込み表示」案は既にr6契約に含まれる。 |
| flat維持なのにT5がMobile/Matrixを直す因果がない | 実不具合はflat ParamPanelがdisabledでもquery hookを無条件に呼びProvider例外を投げること。r5 T5はgrouped子だけにhookを移しflat互換性を復旧する。QAのMatrix stack/useMappingStageGroups→ParamPanelとMobile18件を根拠としている。Mobileをgroupedへ統合する案は要求を変える。 |
| variantIdへrole文字列を代入 | 前提不一致。T6 L139はvariantId:v.id、L141は別field role:v.computed_role。WiringStageSlotはvariantId?:number。T1/T6/7は元IDを保持し、T8はnull/undefinedを省略。 |
| FAILと未監査T8修正指示が矛盾 | r5後のr6を未監査と明記してから、この全17対象監査を実施した。時点履歴は現在の未実行を示さない。raw判定・Architect応答・実装受入を区別し既存ユーザー承認/自律修正指示に基づき親へ返す。 |
| StageInputGroupがDOM追加でroot所有衝突 | sectionはrootではない。T2はsectionとCSS/focus、T4は既存Desktop両root、T7はSettings root、T5はancestor利用。最寄り属性root・ownsection/headingの契約とIT-R1/BR-Vがある。 |
| masters/stages空/pendingで入力消失不明 | T3は明示[]優先、undefinedだけfetch、最後のcacheまたは空metadataをT1へ渡し元mappingを保持。fallback/unknown群とUT-H1/IT-M1を既に定義。空metadataと空入力を混同しない。 |
| legacy/V2優先順位未定義 | T1の明示variantは同master同id、legacyはcomputed_role一意一致。T6はmaster単位variants有無を判定しV2/legacy共存、v:/m:キーを分離。computed_roleをvariant_idへ変換しない。 |
| jsdomでsticky検証不能 | 採用済み制約。unitは構造/CSS/mock矩形、AC-2/3/5はGate3の実ブラウザー3領域証拠。未確認時INCONCLUSIVE。ブラウザー受入は未完了として残す。 |
| rg/誤pathしか検証しない | カードは所有ファイルのtypecheck/局所Vitest、T13は実在docs/openapi.yaml/backend/openapi.jsonのschema parityを指定。rgは調査根拠で受入代替ではない。具体的な誤pathをモデルは示していない。 |
| 初期化中入力のmerge不明/r4も未監査 | 初期化中の入力を許可しないr6契約なのでmergeは不要。r4全13監査のraw/log/traceは保持済み。r6も今回全17対象を監査。新しい人間判断を要する根拠はない。 |

追加の具体的engineer escalationはT12の同名select。Main regionにsampling/stepsとsampling/cfgの必要な2slotがあり、AdaptiveWorkflowWiringのaccessible nameがstage+roleだけなので一意query不能。slotを削除せずパラメータ名をラベルへ追加するr7でT7/T12を修正し、別監査へ回す。これはr6監査snapshotに含まれない。T8初期化保護の実装検証、T7/T12ラベル修正、Gate2再実行/Gate3実測は未完了。raw FAILをPASSとしない。

## R7 Targeted Audit Result and Disposition

settings-slot-accessibility-r7の変更5対象（design/test-plan/T7/T12/implementation_plan）を明示して監査。変更のないカードはr6全17対象snapshotの根拠を保持。53,701文字、3 chunks＋最終合成、qwen/qwen3.5-9b/Q6_K/context32768/reasoning none、308.519秒、audit exit0。raw総合判定 **CRITICAL FAILURE（重大な失敗）**、見出し「結論：実装禁止（Design Gate FAIL）」。原文をREQ-347-r7-audit.logへ保持。直後unload exit0、独立lms ps --json exit0/[]。全5対象の全文・本文hashは監査前後で一致しdriftなし。r7 traceに原文/unloadログのSHA256も保存。

| 生の指摘/提案 | Architectの根拠付き応答 |
|---|---|
| A: onChangeMappings即時更新とT8遅延保存が両立不可 | draftの局所更新と永続化snapshotは異なる状態。T8は保存受付のID/epoch/revision/snapshotを捕捉し、旧成功が再編集draftを置換しない。isSavingは二重保存を防ぎ、同sessionの編集は許す。BR-11/IT-S6で両立を検証する。API応答までフォーム全体を凍結する要求はなく、未hydrated初期取得だけ非mount。提示されたhybrid案の境界は既存契約にある。 |
| B: Settingsの1rootとclosest rootが衝突/重複padding | Settingsの全sectionが同rootを祖先に持つためclosestは同rootを返す。独立rootはDesktop Prompt/Parameter/Settingsの3領域であり各sectionではない。paddingはrootに1回、marginはcontrolに指定。T2/T7/IT-R1とGate3で接続/実矩形を確認。独立group別overflowを追加するとaccepted連続listを変える。 |
| C: unknown variant999は新規作成かerrorか未定義 | T1は存在しない参照をunknown/fallbackへ保持し入力を失わない投影。今回UIは任意variant IDを入力/新規作成する機能を持たない。T7は既存slot IDだけをpayloadへ渡す。存在しないIDから新規variantを捏造する案は要求外。 |
| 2026-10-12は未来、全監査log破棄 | 実環境とclock toolの現在時刻は2026-10-12 05:38:20 UTC（PowerShellも同日JST）。固定知識の日付を実行時刻へ優先した前提誤り。ユーザー/親の証跡保持指示にも反するのでlog破棄を採用しない。 |
| exit0/unload後に分析/hash検証は物理的に不可能 | 終了したのはLM Studio推論・adapterプロセス。Architect/PowerShellの別処理が保存済み出力と文書を読むことは可能。監査後応答は再推論ではないと明記し、snapshot/hashと追記の時点を分離している。 |
| 監査完了・人間判断不要・実装未確認・FAILが矛盾 | 実行成功、モデル判定、技術的応答、実装受入、承認は別の状態。exit0をPASSにしない。具体的修正は既存ユーザー承認/自律差し戻し指示で扱い、避けられない人間選択がある時だけ停止する。rawがFAILだから手動review ticketを自動生成する新規規則は適用しない。 |
| hash/trace内容が提示されず証拠不存在 | 5対象の全文/本文hash、実行command/env/時間/原文/unloadと独立一覧はr7 trace、17対象はr6 traceへ保存。監査対象は変更設計文書であり全証跡をLLM入力へ含めてはいない。モデルから独立検証できないことと実ファイルの不存在は異なる。 |
| task DAGと反復監査が不一致 | DAGはsource/test所有タスクの依存、r2～r7は差し戻し設計revisionの監査履歴。revision反復は循環task依存を追加しない。14タスク最大4層を維持。 |
| 複数ユーザー同時保存のconflict制御不足 | 同sessionのフォームは後続refetchでdraftを置換しない。serverの複数client間conflict/version UIはREQ-347 AC外で既存APIを変えない。外部更新のフォーム反映は閉じ直し時という制約を開示済み。今回label変更で新たに競合を導入しない。 |
| resizeでscroll位置飛躍、Scroll Lock必須 | 実ブラウザーの小pane/zoom/分割境界・非遮蔽の残存検証事項として扱う。browserのscroll clampはあり得るが、位置永続化/Scroll Lockはaccepted ACにない。DOM接続/mock試験を物理acceptanceへ替えず、実測で遮蔽/操作不能ならFAILで返す。 |
| 0slotとpending区別、ブラウザー環境不安定 | T7の0slot説明/0active警告、T3のmetadata待ちfallback、T8の初期取得読み込みは異なる状態。実ブラウザー証拠が得られない場合Gate3はINCONCLUSIVEでPASSにしない。r7で各slotのlabelを変更することでこれらの契約は変わらない。 |

Architect disposition: r7のparam付きaccessible nameは表示済みのstage/role/paramを使い、sampling/stepsとsampling/cfgの別slotを保持して一意に操作できる。T7/T12の所有・上限・依存は維持され、設計は実装可能。raw CRITICAL FAILUREをPASSに変換しない。今回照合で追加の具体的label契約欠陥や避けられない人間判断は確認されなかった。T7実装と局所test→T12再検証→全体Gate2/Gate3実測の未確認事項を親へ引き継ぐ。T8の既存修正受入は親の検証結果へ従う。監査後の追記は結果・応答のみでカードの挙動契約は変えない。

## R8 Ownership-Split Audit and Disposition

r8の変更6文書（design/test-plan/T7/T12/T15/plan）61,169文字、3 chunks＋最終合成、qwen/qwen3.5-9b/Q6_K/context32768/reasoning none、342.099秒、audit exit0。rawは **【実装禁止 / Design Gate FAIL】**、最終判断は **【実装禁止】**。原文logと過去判定を保持。直後unload exit0、独立lms ps --json exit0/[]。監査前後6全文・本文hashすべて一致、source/test2ファイルhashも一致。現在全18対象の開始hashをtraceへ記録し、対象外12カード本文は全17対象r6 snapshotと一致確認済み。

行数を固定baseline 3b901040c1887b24c56cc517e75768b777913a5eから再計測：AdaptiveWorkflowWiring.tsx=57+198=255、WorkflowAdaptiveStaging.test.tsx=81+24=105。旧T7 combined360>300はFAILとして履歴保持。新T7 source1ファイル255/300、新T15 test1ファイル105/150は重複所有なし。engineerのtypecheck/staging10件成功の報告は行数違反とは別の証拠として保持し、Architectは試験を実行していない。

| 生の指摘 | 根拠付き応答 |
|---|---|
| A: 初期取得中の非編集がUX崩壊、cache previewへ変えるべき | 読み込み表示と初期化後の編集開始をT8/IT-S9で規定済み。warm-cache未初期化の再編集上書きを防ぐため選んだ安全な制約で、UIの不具合ではない。初回取得だけ待ち、hydrated後の背景refetchでは編集を維持。r8はこの動作を変更しない。 |
| B: section自身がscrollできないと後方入力へ到達不可/root未定義 | Settingsは#settings-mapping-scroll[data-stage-scroll-root].stage-input-scroll-rootがoverflowY:auto/maxHeight:min(60vh,480px)を持ち、その中のsectionは同祖先をscrollする。T2/T7/IT-R1とT15 root接続test、Gate3実測を明記。各sectionにoverflowを足す案は採用しない。 |
| C: production変更禁止とlabel test矛盾/source未変更 | T15への所有制約を全taskへ一般化した前提誤り。T7は既にlabelを含むproduction255行を変更し、engineerがtypecheck/test10件成功を報告。T15はtestだけ、depends_on:T7でsource完了後に検証。提案T7完了→T15検証は現在カード/DAGにある。sourceを巻き戻してから再実装する必要はない。 |
| D: testのみのcountなのでsource/他task混入を確認できない | T7カードのnumstatはsource、T15カードはtest、それぞれ同固定baseline。ownership-accountingは両方のexact行数/旧FAIL/source-test hashを記録し、親は他taskの当該2ファイル編集なしと確認。累積追加＋削除を定義し、独立ファイルを各1回だけ計上。commit分割/履歴rewriteは不要。 |
| 初期取得失敗時のoffline保存不明 | T8は未hydratedフォームを非mount、save入口も拒否、初回error後は回復時に初期化。同sessionの既存draftとAPI失敗はIT-S7で保持。初期化前のoffline編集を新機能として追加しない。 |
| 複数ユーザーconflict UI/サーバーrevision必要 | 現APIを変更しないREQ-347の範囲。session内の背景refetchはdraftを置換せず外部mapping/baseModel更新は閉じ直しで採用する制約を開示済み。r8は所有分割のみで新たなserver concurrencyを導入しない。 |
| Mobile sticky遮蔽/iOS-Android実機追加 | 生成Mobileはflatのまま。Settingsの小pane/幅境界/zoom/非遮蔽はGate3の実ブラウザー測定に残す。iOS/Android全実機を新規必須範囲へ広げる根拠はない。未実測はINCONCLUSIVE、unit PASSで代替しない。 |
| legacy variant_idのdefault自動生成欠落 | T6/T7はlegacy m:<masterId>とV2 v:<variantId>を分け、legacy payloadはmaster_id/node_idだけ、元variant IDだけを数値保持。T15現testもlegacy exact payloadを確認する。ID自動生成はデータを変えるため採用しない。 |
| jsdom Sticky検証不能 | 採用済み制約。T15は構造/closest-root/保存/labelだけをunitで確認、AC-2/3/5はGate3実測。ブラウザー証拠がない場合PASSにしない。 |
| REQ-348/既存error scrollの競合 | r8はデータ型/API/renderer/focusを変更せず所有だけを分割。REQ-348未設定候補を保持し、T2 focusは自身section内の対象と最寄りrootだけを補正。具体的な新たな競合コードはモデルに示されていない。既存3領域の実測で不具合があれば設計へ戻す。 |
| OpenAPI同期ロードマップ/過去status整理不足 | T13が既存optional variant_idの2 snapshot同期を具体的に所有、現在実行結果は親が管理。過去raw判定は時点履歴、現行所有はr8表/カード/DAG/handoverに明記。過去証跡の削除/判定書換えで整合させない。 |

Architect disposition: r8の所有分割は実装済みsourceとtestを保持して各カードの上限/単独所有を満たす。新たな挙動変更なし。source T7255行とtest T15105行、15カード/最長4層、T12の直接依存T8,T15を凍結。raw FAILをPASSへ変更しない。モデル提案の責務分離/順序/ブラウザー区別は既存契約に含まれ、新たな具体的設計欠陥や避けられない人間判断は未確認。親がT7のsource完了を確認し、T15へ現test差分照合・局所再検証をdispatch、その後T12へconsumer再検証を返す。全体Gate2/Gate3の受入は別途必要。今回の監査後追記は結果/応答のみでカード契約を変更しない。
