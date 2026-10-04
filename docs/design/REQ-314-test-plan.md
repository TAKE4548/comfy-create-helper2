---
title: REQ-314 実行可能テスト計画
status: approved
tags: [REQ-314, settings, integration, e2e, red-team]
related_paths:
  - docs/design/REQ-314.md
  - docs/backlog/pbi/active/REQ-314.md
  - frontend/src/pages/SettingsPage.tsx
---

# REQ-314 実行可能テスト計画

## Status / Preconditions
2026-10-04 設計時点。自動/実ブラウザテスト未実行。
D1は既存6種類、D2は既存契約内に人間が確定済み。[決定記録](REQ-314-decisions.md)。
AC-4/7は確定条件でPBI改訂済み。未決定によるBLOCKEDは解消し、実装後に改訂ACで検証する。現時点のAC合格は未判定。
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
- D1/D2の要件判断は確定済み。ブラウザ検証の手動分担を維持し、2026-10-04のユーザー「OK」で最終設計レビューと実装開始を承認済み。

## Gate 1 / Gate 2 Commands
PowerShell、repo frontend:
```powershell
Set-Location 'C:/Users/audih/ws/comfy-create-helper2/frontend'
npm run typecheck
npx vitest run src/pages/SettingsPage/components/__tests__/llmSettingsGroups.test.ts src/pages/SettingsPage/hooks/__tests__/useSettingsTab.test.tsx src/pages/SettingsPage/components/__tests__/SettingsTabBar.test.tsx src/pages/SettingsPage/components/__tests__/LlmSettingsSection.test.tsx src/pages/SettingsPage/components/__tests__/TranslationSettingsSection.test.tsx src/pages/SettingsPage/components/__tests__/WorkflowConnectionSection.test.tsx src/pages/SettingsPage/components/__tests__/TranslationPreviewCard.test.tsx src/pages/SettingsPage/components/__tests__/ServiceConnectionCard.test.tsx
npx vitest run src/pages/__tests__/SettingsPage.test.tsx src/pages/__tests__/SettingsPage.req314.test.tsx src/pages/SettingsPage/components/__tests__/SpeechToneSection.test.tsx src/pages/SettingsPage/components/__tests__/MappingMasterSection.test.tsx src/pages/SettingsPage/components/__tests__/BaseModelSection.test.tsx src/pages/SettingsPage/components/__tests__/ThumbnailSettingsSection.test.tsx
npm test
```
期待: 全command exit 0、指定全件PASS。fullは実装後の既存退行検出に1回実行し、新変更・失敗時のみ再実行。
Task Cardごとにtypecheck＋局所commandを記録。上の新testファイルは各taskで生成予定。
設計段階で実行/成功を宣言しない。timeout目安: typecheck120秒、局所180秒、full600秒。超過時timeoutとして結果を残し根拠なしに延長しない。

## AC Traceability
| AC | シナリオ/検証 | 対応task | 判定条件 |
|---|---|---|---|
| 1 | E2E-1 等幅5tab/横幅 | T2,T7,T18 | 実測＋DOM |
| 2 | INT-1/RT-1 hash/LS/履歴/リロード | T1,T2,T7,T18 | 5hashと履歴一致 |
| 3 | INT-2/E2E-2 workflow/base/mapping集約 | T5,T7,T9,T10 | 既存全action到達 |
| 4 | INT-3 prompt分類/詳細閉 | T3,T15,T16,T7 | 改訂AC:既存6種類、配置/詳細初期閉/保存互換 |
| 5 | INT-4/E2E-3 tone/models/bubble/3role | T3,T15,T16,T7,T8,T11 | key/label保存一致 |
| 6 | INT-5/RT-3 4provider即時表示 | T4,T6 | 保存前でも同期可視 |
| 7 | INT-6/E2E-4 connections/guard/display | T14,T5,T7,T11 | 改訂AC:既存契約内の接続/VRAM/表示集約 |
| 8 | E2E-5/RT-5 767/390/320px・safearea・表・44px | T2,T8,T9,T10,T11 | 実寸/操作全て一致 |
| 9 | INT-7/E2E-6 ARIA/keyboard | T2,T7 | focus/selected/tabpanel一致 |
| RT-1 | SettingsPage全体のStorage拒否境界 | T1,T5,T17,T7 | denied get/setはno-throw fallbackし、既定値/セッションdraftで画面を維持 |

AC-4は既存6種類で判定。AC-7はComfy URL編集・保存・疎通、Backend同一origin表示/疎通、LM Studio Backend経由疎通/環境設定案内、およびVRAM/表示設定で判定する。
Backend/LM Studio URL編集は本PBIの合格条件に含めず、既存API/schema/store契約の維持を検証する。
決定記録と改訂PBIを根拠とし、実検証なしでACをPASSにしない。

## Integration Scenarios
- INT-1: BrowserRouterで各hashへ開く。storage別tabを事前設定しhash優先、click→hash/storage、back→前tab、forward→次tab、reload→同tab。
  初回無hash+有効LSはそのtabへreplace。初回不正hash+不正LSはworkflows。移動後空hashはworkflows。
  navigateでquery/path保持。選択済tab再clickでhistory.length増加なし。期待は選択aria値/可視panel/URL/LSが全て同一。
- INT-2: workflows fixture2件、BaseModel3件、mapping2件。rename/copy/diff/rollback/delete/preset展開へ到達し元API/ID/payloadをassert。
  workflowとsystem instanceが異目的データを描画しない。systemでworkflows queryが新しく走らない。
  Deleteはtest専用fixtureのみ。
- INT-3: prompts fixtureに既存6キー＋2translation＋3speech＋model/params/unknown recordを混ぜる。
  prompt詳細既定閉→展開で6だけ、2params、main model。unknown/model JSONがeditorへ出ない。
  D1確定の既存6種を正確に数え、改訂AC-4の配置/詳細初期閉/保存互換を検証する。
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
  D2確定範囲でComfyのみURL編集可能、Backend/LM Studioは既存契約内の表示/疎通/案内であることを確認する。
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
  AC-4は改訂済み6種を基準として判定する。
- E2E-4: translation4provider即時toggle、保存→任意原文→訳文、API認証条件、debounce、cache/疎通維持。
  system接続probe、guardトグル/threshold保存/WS実更新、thumbnailpreview、longpressを確認。
  AC-7は既存契約内の確定範囲で判定する。外部稼働なしは疎通/実翻訳INCONCLUSIVE。
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
自律Gateの結果とユーザー手動確認待ちを分けて引き渡す。全ACと必要な確認証拠が揃うまで全受入完了/Doneを宣言しない。D1/D2の確定原文とAC改訂根拠はREQ-314-decisions.mdを参照。

## LLM Atomic Split Test Ownership
T3は純粋allowlistの集合testと既存page退行を実行。T15は詳細UIを局所編集し旧caller退行を実行。T16はLlmSettingsSection.test.tsxへgroupごとのDOM集合・一意ID・単一開閉・役割ラベル・modelFooter・元保存payload・dirty/refetch/保存中追加編集の異常系を追加する。T17はthumbnail ratio hookのStorage denied read/writeを検証する。
T16はT15依存、T18はT7依存、T12もT7完了後に独立したtest fileで実施する。T12/T16/T18はいずれも最終検証でPASS必須だが、ファイル所有が独立しているT12とT18は相互依存せず並行可能。実装/検証未実施の状態をPASSとしない。ブラウザは引き続きユーザー手動。
