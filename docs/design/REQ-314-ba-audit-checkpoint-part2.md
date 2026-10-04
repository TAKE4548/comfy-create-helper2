# REQ-314 BA Audit: part 2/8
Audit this fragment of the complete design, test plan and all 14 Task Cards. Other definitions may be in other fragments; do not invent defects solely from missing context. State findings with exact artifact/task references. User browser tests are manual and excluded from autonomous checks; typecheck/Vitest remain. D1: six real prompt keys versus AC-4 seven is an explicit unresolved human decision. D2: Backend/LM Studio URL editing versus unchanged API/schema is an explicit unresolved human decision. Do not require approval bypass or falsely mark those AC passed. Review acceptance coverage, logical contradictions, ownership/dependencies, testability and actual new gaps.

上流: REQ-314 PBI/HTML、人間D1/D2、ReactRouter route /settings、Query cache/store、現行API/LLM key一覧。
既存機能依存: workflow差分置換/rollback/プリセット、BaseModel checkpoint、MappingMaster DND、多言語translation、SpeechTone modal再export。
下流: Generate/Speech利用の設定保存値、Comfy接続再初期化、thumbnail/longpress全画面表示、VRAM guard、SPEC参照。
Query/API/storage/model設定の意味を維持することで下流へのデータ移行を避ける。
SettingsPageの既存SpeechTonePresetModal exportを保持する。

## Test Strategy
`REQ-314-test-plan.md` に全ACとINT/E2E/RTを定義。
Gate 1 frontend typecheck、Gate 2局所/統合/full suite、Gate 3自律実行可能な異常系・API契約・DOM操作シナリオとlocal QA監査。実ブラウザ検証はユーザーによる手動確認とし、自律テストから除外する。
ブラウザ寸法/履歴/keyboard/API実動作の手動確認結果はユーザー報告待ち。未報告を自律テスト失敗とは扱わず、未確認のACをPASSとしない。D1/D2未決定でAC-4/7をPASSにしない。
設計時点で実装test未実行。BA auditは設計監査であり、実装品質の証拠には使わない。

## Trade-off Disclosure
- 常時mountはtab往復draftとmodal状態を保つがメモリとquery購読が増える。同じcacheを共有しsystem側不要workflow fetchをguard。
  選択panelだけunmountする案は未保存値が消えるため不採用。
- group propsは大量コード移動を避けるが大きい既存ファイルは残る。目的editorの新規複製は保存仕様の乖離を招くため不採用。
- 新v2詳細stateは既存全展開の記録を引き継がず既定閉にする。旧storageを消さず復帰余地を残す。
- mobile表CSSは単一DOM/DNDを保つが読み上げ意味の実機確認が必要。別mobile複製DOMは二重focus/ID問題を増やす。
- Backend/LM Studio URL編集はAPI不変と両立しない。D2の推奨範囲に合意がなければ実装へ進めない。
- 6既存promptを7に見せる代替は採らない。D1件数決定はACを変更する人間判断。
- provider draftは表示だけ即時、実際翻訳は保存済authを使う。未保存previewを止める理由は画面に簡潔表示する。
- 14taskは各編集量を局所化し最大4層。共有sourceは順次dispatchし、独立responsive taskを並行可能。


## Artifact: docs\design\REQ-314-test-plan.md
---
title: REQ-314 実行可能テスト計画
status: awaiting-human-design-review
tags: [REQ-314, settings, integration, e2e, red-team]
related_paths:
  - docs/design/REQ-314.md
  - docs/backlog/pbi/active/REQ-314.md
  - frontend/src/pages/SettingsPage.tsx
---

# REQ-314 実行可能テスト計画

## Status / Preconditions
2026-10-04 設計時点。自動/実ブラウザテスト未実行。
D1 6/7 prompt、D2 Backend/LM Studio URL編集は人間決定待ち。
AC-4/7は条件付き・未達（BLOCKED）。推奨案で原文を満たすとは判定しない。
Frontend＋Backend稼働中のアプリoriginを使用（例 http://localhost:8000/settings#workflows）。
保存系は破壊してよい専用test fixturesだけを使い、既存ユーザー設定を事前採取して終了時に戻す。
外部翻訳API key、LM/Comfyが利用できない実動作はINCONCLUSIVEとする。
Vitest mockではAPI呼出契約を検証するが実翻訳・CSS寸法・WS通信の代替としない。

## Verification Ownership (2026-10-04 User Revision)
ユーザー指示「ブラウザテストは手動でやるから、自律テストからは除いていい」を適用。
- 自律: Gate 1 typecheck、Gate 2局所/統合/full Vitest、Gate 3のVitestで実行可能な異常系・API契約・DOM操作検証とlocal QA監査。
- 手動（ユーザー）: 全E2E-1..6、実ブラウザでの寸法/レスポンシブ/44px/safe-area/読み上げ/実API・WS・他画面確認。エージェントはブラウザを操作せず、ブラウザ自動化テストも追加・実行しない。
- RT-1/2/3/4/6/7/8/9/10/11のmock・DOMで検証可能な部分はVitestで自律検証し、実ブラウザ/外部接続が必要な部分とRT-5はユーザー手動確認にする。
- 未実施の手動項目は「ユーザー手動確認待ち」。自律ゲートの失敗や再試行理由にせず、自律検証完了後に手順を引き渡す。ユーザー報告なしに手動項目/対応ACのPASSを宣言しない。
- D1/D2の要件判断・設計承認は本変更と別で、引き続き待機する。

## Gate 1 / Gate 2 Commands
PowerShell、repo frontend:
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/frontend'
npm run typecheck
npx vitest run src/pages/SettingsPage/hooks/__tests__/useSettingsTab.test.tsx src/pages/SettingsPage/components/__tests__/SettingsTabBar.test.tsx src/pages/SettingsPage/components/__tests__/LlmSettingsSection.test.tsx src/pages/SettingsPage/components/__tests__/TranslationSettingsSection.test.tsx src/pages/SettingsPage/components/__tests__/WorkflowConnectionSection.test.tsx src/pages/SettingsPage/components/__tests__/TranslationPreviewCard.test.tsx src/pages/SettingsPage/components/__tests__/ServiceConnectionCard.test.tsx
npx vitest run src/pages/__tests__/SettingsPage.test.tsx src/pages/__tests__/SettingsPage.req314.test.tsx src/pages/SettingsPage/components/__tests__/SpeechToneSection.test.tsx src/pages/SettingsPage/components/__tests__/MappingMasterSection.test.tsx src/pages/SettingsPage/components/__tests__/BaseModelSection.test.tsx src/pages/SettingsPage/components/__tests__/ThumbnailSettingsSection.test.tsx
npm test
```
期待: 全command exit 0、指定全件PASS。fullは実装後の既存退行検出に1回実行し、新変更・失敗時のみ再実行。
Task Cardごとにtypecheck＋局所commandを記録。上の新testファイルは各taskで生成予定。
設計段階で実行/成功を宣言しない。timeout目安: typecheck120秒、局所180秒、full600秒。超過時timeoutとして結果を残し根拠なしに延長しない。

## AC Traceability
| AC | シナリオ/検証 | 対応task | 判定条件 |
|---|---|---|---|
| 1 | E2E-1 等幅5tab/横幅 | T2,T7 | 実測＋DOM |
| 2 | INT-1/RT-1 hash/LS/履歴/リロード | T1,T2,T7 | 5hashと履歴一致 |
| 3 | INT-2/E2E-2 workflow/base/mapping集約 | T5,T7,T9,T10 | 既存全action到達 |
| 4 | INT-3 prompt分類/詳細閉 | T3,T7 | 件数D1未決定: BLOCKED |
| 5 | INT-4/E2E-3 tone/models/bubble/3role | T3,T7,T8,T11 | key/label保存一致 |
| 6 | INT-5/RT-3 4provider即時表示 | T4,T6 | 保存前でも同期可視 |
| 7 | INT-6/E2E-4 connections/guard/display | T14,T5,T7,T11 | URL編集D2未決定: BLOCKED |
| 8 | E2E-5/RT-5 767/390/320px・safearea・表・44px | T2,T8,T9,T10,T11 | 実寸/操作全て一致 |
| 9 | INT-7/E2E-6 ARIA/keyboard | T2,T7 | focus/selected/tabpanel一致 |

D1が6種訂正として承認された場合は承認済PBI AC-4改訂を引用し6種で判定。
7件目を追加する決定なら新key/backend/default/使用経路を再設計し本planを更新。
D2のUI限定案承認時も元の全URL編集ACをPASSにせず、改訂AC/承認記録に基づく判定。
API変更案ならendpoint/schema/認証/再接続/保存検証を別改訂してから実行。

## Integration Scenarios
- INT-1: BrowserRouterで各hashへ開く。storage別tabを事前設定しhash優先、click→hash/storage、back→前tab、forward→次tab、reload→同tab。
  初回無hash+有効LSはそのtabへreplace。初回不正hash+不正LSはworkflows。移動後空hashはworkflows。
  navigateでquery/path保持。選択済tab再clickでhistory.length増加なし。期待は選択aria値/可視panel/URL/LSが全て同一。
- INT-2: workflows fixture2件、BaseModel3件、mapping2件。rename/copy/diff/rollback/delete/preset展開へ到達し元API/ID/payloadをassert。
  workflowとsystem instanceが異目的データを描画しない。systemでworkflows queryが新しく走らない。
  Deleteはtest専用fixtureのみ。
- INT-3: prompts fixtureに既存6キー＋2translation＋3speech＋model/params/unknown recordを混ぜる。
  prompt詳細既定閉→展開で6だけ、2params、main model。unknown/model JSONがeditorへ出ない。
  D1未承認のため配置検証結果とAC-4全体BLOCKEDを別記録。
  prompt入力/paramsを未保存編集→他tab→戻る、値不変。background query refetchでもdirty params不変。
- INT-4: dialogueでtone名/prompt/order、VLM/LLM2select、bubble min_area/min_brightnessを確認。
  詳細展開で3役割labelとキー一致。各PUTのcontent形式が旧契約と同じ。
  tone create/edit/delete/cancelのfixture IDを確認、modal再export利用に退行なし。
- INT-5: provider draftをfugumt/deepl/google_cloud/llmに順次changeし保存せずLLM詳細可視条件をassert。
  credentialsはAPI型2providerのみ。FuguMT保存PUTはtranslation_provider1件だけ。
  translation_debounceを保存しpreviewへ渡る。基本未保存はpreview無効＋案内、保存成功で入力訳文を更新。
  既存testConnection/cache stats/clear-cacheの契約維持。
- INT-6: store comfyUrlあり/なしの実効表示優先順、保存buttonでsetComfyUrlを1回、typingでは未実行。
  Backend origin/health、LM modelsのbackend経由API応答で疎通、取得不能URLをdefaultで偽装しない。
  store.systemStatsのused更新を送りfree/total meter追従、useSystemStats購読1回・unmount cleanup。
  thumbnail比率変更→livepreview、longpress2キー変更と保存確認。
  D2未承認のためURL編集全AC-7はBLOCKED。
- INT-7: tablist1、tab5、aria-controls存在、全panel aria-labelledby正確、selected1、
  tabIndex=0のtab1、hidden panelがtab順から消える。Right/Left循環/Home/End/Enter/Space通常button動作。
  Tabで選択tab→tabpanel内の有効controlへ入り、Shift+Tabで戻れる。
- INT-8 (API/schema invariant):変更対象diffにbackend/api/client/types/store schemaの変更がないことを確認。
  existing llm PUT keys/JSON、translation POST、workflow actions、vram PUTをrequest spyで元契約と比較。
  同じ永続化値がGenerate/Speechで使えることはユーザーがブラウザで手動確認。見た目group名を保存keyにしない。
  T14は既存store動作利用のみ、新backend config書込/URL取得を作らない。

## User Manual Browser Checklist (E2E Paths)
以下は自律実行対象外のユーザー手動確認手順。ユーザーから得たviewport/URL/操作/観測/結果を `REQ-314-walkthrough.md` に記録する。未報告の実測値やスクリーン証拠を生成しない。各操作応答10秒、外部推論30秒を確認目安とする。
- E2E-1: 1280x900で /settings#workflows。sidebarを含め利用可能content幅を測る。
  tabbar幅がcontent内幅を使い、5tab幅の最大差2px以内、縦積みaccordionがtop構造に無い。
  768pxでも等幅。767pxでは短縮label+scrollsnapへ変わる。
- E2E-2: 5tab各click→識別heading/正しい3/2/3/3/3目的cardを確認。
  workflow rename/copy→list反映、JSON差分→confirm→rollback、preset展開、BaseModel/checkpoint、mapping CRUDに到達。
  保存は専用fixtureを使い元設定を終了時復元。現在データ全削除を行わない。
- E2E-3: prompt/dialogue詳細初期閉。11既存promptの全分類6+3+2を数え、未知keyがeditor混入しない。
  3speech labelの説明、VLM/LLM選択、bubble保存を確認。未保存prompt/paramsを書きtab往復で維持。
  D1決定未済ならAC-4はBLOCKED。
- E2E-4: translation4provider即時toggle、保存→任意原文→訳文、API認証条件、debounce、cache/疎通維持。
  system接続probe、guardトグル/threshold保存/WS実更新、thumbnailpreview、longpressを確認。
  D2決定未済ならAC-7はBLOCKED。外部稼働なしは疎通/実翻訳INCONCLUSIVE。
- E2E-5: 390x844と320x640、767x900でtabをscrollして全5選択。
  computed scroll-snap-type='x mandatory'、tab snap-align、fadeがpointerを遮らないこと。
  各tableをcardとして読む。prompt/checkpoint長文がviewport内折返し、全edit/delete/order/dragが使える。
  document.scrollWidth<=clientWidth+1px（tabbar内部scrollは許容）。viewport計測とスクリーン記録。
  最終controlをscroll into viewしbottom navのtopより上で全44px領域が見え、操作可能。
  computed mobile padding-bottom >=96px+safe-area評価値。safe-area0環境は0で確認と明記し非0実機を推測しない。
  <768pxの全可視button/input/select/textarea/drag/checkbox label hitboxのDOMRect width/height>=44px（1px誤差以内）。
- E2E-6: マウスを使わずTab/Left/Right/Home/End/Enter/Spaceで全tabとcardへ移動。
  hash/selected/focus一致、hidden内容へfocus侵入なし、モバイル選択tabは画面内。
  accessible nameは長いtab名、各aria-controls/labelledby相互参照を確認。
  画面読み上げが使える環境ではcard化tableの見出しと列ラベル対応を確認。未実施は明記。

## Red Team / Boundary / Anomaly (Ownership Above)
| ID | 注入/操作 | 期待する観測 |
|---|---|---|
| RT-1 | #unknown、#PROMPT、壊れLS、false/string/arrayのv2、getItem/setItem throw | crashなし、正規fallback、details false/false、URL操作可能 |
| RT-2 | hash再選択100回・back/forward5往復・search付きURL・route離脱再入 | 履歴増殖/loopなし、path/search維持、listener/WS leakなし |
| RT-3 | llm→fugumt→llm高速切替、詳細内focus、未保存auth、query refetch | 即時可視、focus脱落なし、draft不変、保存前preview不可 |
| RT-4 | slow訳文A→入力B、順序B→A応答、provider/方向変更、API500/timeout | AがBを上書きしない、旧訳文clear、失敗表示/再試行、入力維持 |
| RT-5 | 767/768/1023/1024px・320px・200%zoom・long日本語/URL/prompt | 設定とAppShell境界整合、controls/nav非重複、44px、情報欠落なし |
| RT-6 | 空models、offlineComfy、Backend500、LM API失敗、WS切断/復帰 | fake接続成功なし、保存値保持、未取得を0へ偽装しない、復帰更新 |
| RT-7 | doubleclicksave/dirtyparams中refetch、別tabへ移動中mutation完了 | 重複破壊なし、保存対象key不変、他draft消失なし |
| RT-8 | 空workflow/base/checkpoint/tones/mapping＋大量50件 | loading/empty到達、スクロール後最終操作可能、tab安定 |
| RT-9 | invalidComfy URL・empty・https有効、typing10回 | invalid保存抑止、setComfyUrlは明示保存だけ、入力毎WS再接続なし |
| RT-10 | FuguMT/LLMの認証欄非表示、既存キーを値ありにして保存 | fugumt PUT providerのみ、非API認証情報を新規要求しない |
| RT-11 | mobile MappingMaster並替/多選択、preset展開/drag/action | ID/順序API不変、actionがrow選択と衝突せずcontrols到達 |

## Audit / Evidence / Verdict
local QA test-plan auditはdev-verifyのGate3で行い、終了直後unloadを実施。
BA設計監査は別記録。監査モデルの指摘をそのまま実装test PASSと扱わない。
PASS=期待観測を実ツールで確認。FAIL=期待との不一致。INCONCLUSIVE=必要環境/証拠不足。BLOCKED=人間要件決定待ち。
自律Gateの結果とユーザー手動確認待ちを分けて引き渡す。全ACと必要な確認証拠が揃うまで全受入完了/Doneを宣言しない。D1/D2承認はAC改訂の根拠も残す。


## Artifact: docs\design\REQ-314-implementation_plan.md
---
title: REQ-314 Implementation Plan
status: awaiting-human-design-review
tags: [REQ-314, settings, frontend]
related_paths:
  - docs/design/REQ-314.md
  - docs/design/REQ-314-test-plan.md
  - docs/backlog/pbi/active/REQ-314.md
---

# Implementation Plan - REQ-314: 設定ページ水平タブ化

## Review Status
2026-10-04 設計レビュー待ち。実装未開始。
[設計](REQ-314.md)・[テスト計画](REQ-314-test-plan.md)・全14Task Cardを物理生成済み。
D1「7種類→既存6種類」の訂正か7件目定義、D2「Backend/LM Studio URL編集」とAPI不変制約の優先を人間が確定する必要がある。
元のAC-4/AC-7は未達/条件付きとして維持。設計承認だけで原文ACを満たしたことにはしない。

## Proposed Changes
既存SettingsPageの9分割componentを、目的別5tabへ再配置する。
LLMとWorkflowConnectionにgroupを設けて保存/queryロジックを再利用。常時mountのhidden panelで未保存draftを維持。
URL hash/LocalStorage/戻る進む・キーボードARIAを実装。翻訳provider draftで即時詳細表示。
翻訳原文プレビュー、VRAM実時間購読、768px境界のmobile snap・表card化・44px操作を追加する。
既存API/backend/schema保存keyを維持。SSoTは実装後のT13で同期。

## Required Human Decisions
- D1 推奨: AC-4を6種へ件数訂正。既存6promptの名前/保存keyを維持。
  代案: 7件目の用途/key/初期値/利用経路を定義し再設計。架空・重複editorで7にしない。
