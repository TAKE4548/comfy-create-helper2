---
title: Settings ページ仕様書 (SPEC_SETTINGS)
tags:
  - settings
  - REQ-314
  - REQ-334
  - REQ-347
  - REQ-365
  - REQ-380
  - REQ-381
related_paths:
  - docs/backlog/pbi/active/REQ-314.md
  - docs/backlog/task/archive/REQ-334-T10.md
  - docs/backlog/pbi/active/REQ-347.md
  - docs/backlog/task/active/REQ-347-T10.md
  - docs/design/REQ-347.md
  - docs/backlog/pbi/active/REQ-365.md
  - docs/design/REQ-365.md
  - docs/design/REQ-380.md
  - docs/design/REQ-380-test-plan.md
  - docs/design/REQ-380-implementation-plan.md
  - docs/backlog/pbi/active/REQ-381.md
  - docs/design/REQ-381.md
  - docs/design/REQ-381-document-design.md
  - docs/design/REQ-381-test-plan.md
  - docs/backlog/task/active/REQ-381-T8.md
  - frontend/src/pages/SettingsPage/components/VramGuardSection.tsx
  - frontend/src/components/ParamTypeMasterManagerModal.tsx
  - frontend/src/components/MappingMasterEditModal.tsx
  - frontend/src/components/StageManagerModal.tsx
  - frontend/src/components/SettingsComponents.tsx
  - frontend/src/components/WorkflowManageModal.tsx
  - frontend/src/components/WorkflowNodePicker.tsx
  - frontend/src/pages/SettingsPage/SettingsResponsive.css
  - frontend/src/pages/SettingsPage
  - frontend/src/pages/SettingsPage/components/WorkflowConnectionSection.tsx
  - frontend/src/pages/SettingsPage/components/SpeechToneSection.tsx
  - frontend/src/pages/SettingsPage/components/LlmSettingsSection.tsx
  - frontend/src/pages/SettingsPage/components/TranslationSettingsSection.tsx
  - frontend/src/pages/SettingsPage/components/BubbleDetectionSection.tsx
---

# Prompt Surgeon — Settings ページ仕様書 (SPEC_SETTINGS)

**バージョン**: 3.1
**最終更新**: 2026-10-24
**実装ファイル**: `frontend/src/pages/SettingsPage.tsx`（`SettingsPage/components/*` 分割構成）

> 関連仕様書: [SPEC_SUMMARY.md](./SPEC_SUMMARY.md) / [SPEC_COMMON.md](./SPEC_COMMON.md) / [REQ-334設計](../design/REQ-334.md) / [REQ-334検証計画](../design/REQ-334-test-plan.md) / [REQ-334-T10正本同期](../backlog/task/archive/REQ-334-T10.md) / [REQ-347設計](../design/REQ-347.md) / [REQ-347-T10正本同期](../backlog/task/active/REQ-347-T10.md) / [REQ-365設計](../design/REQ-365.md) / [REQ-365テスト計画](../design/REQ-365-test-plan.md) / [REQ-380設計](../design/REQ-380.md) / [REQ-381設計](../design/REQ-381.md) / [REQ-381文書設計](../design/REQ-381-document-design.md) / [REQ-381検証計画](../design/REQ-381-test-plan.md)

---

## 1. 概要

アプリケーション全体の基本設定、LLM モデル・パラメータ、プロンプト翻訳、フキダシ検出、口調プリセット、BaseModel・チェックポイントマッピング、ノードマッピングマスタ、ワークフロー、接続状態を一元管理するページ。

---

## 2. 機能一覧（設定セクション群）

| セクション | 説明 |
|---|---|
| **LLM 設定** | 使用する LLM モデル（ローカル/外部）の選択、システムプロンプト編集（`prompt` タブは種別セレクタ付きの統合型プロンプトエディタ、§3-3）、詳細パラメータ（Temperature、Top-P、MaxTokens 等）の調整 |
| **翻訳設定** | プロンプト翻訳機能のプロバイダー設定（FuguMT [推奨・CPU常駐・初回自動配置・APIキー不要] / Google Cloud / DeepL / LLM）、APIキー、デバウンス時間、キャッシュクリア、翻訳統計確認 |
| **フキダシ検出設定** | 画像内のフキダシ自動検出パラメータ（最小面積 `min_area`、輝度閾値 `min_brightness`）の調整 |
| **セリフ口調プリセット** | キャラクター性に応じた口調変換プリセット（ツンデレ、お嬢様、敬語等）の CRUD とリアルタイム書き換えテスト |
| **ノードマッピングマスタ** | MappingMaster の一覧・登録・編集・削除・並び替え（D&D、`PUT /reorder`）・一括編集、カスタムパラメータ型マスタ（`ParamTypeMaster`）の管理（「カスタム型マスタ」ボタンから開く `ParamTypeMasterManagerModal`、§3-2） |
| **サムネイル表示設定** | アプリケーション全体でのサムネイル表示アスペクト比（1:1 正方形, 3:4 縦長, 4:3 横長, 16:9 ワイド等）の切り替え |
| **Base Model 設定** | ベースモデル（SD1.5, SDXL, Pony, Illustrious, Flux 等）の定義と、ComfyUI チェックポイントファイル（.safetensors）との自動マッピング管理 |
| **操作・ワークフロー・接続** | 複数選択モード起動の長押し時間設定、ワークフロー一覧・削除、FastAPI / ComfyUI のリアルタイム接続ステータス確認、サービス別の死活ランプ・インラインログ（`ServiceConnectionCard.tsx`）、VRAMガード設定（`VramGuardSection.tsx`） |

---

## 3. レイアウトと状態（5タブ）

設定ページは目的別の5タブで構成する。タブIDは `workflows`（ワークフロー）、`prompt`（プロンプト）、`dialogue`（セリフ）、`translation`（翻訳）、`system`（システム）。タブは長い表示名とコンパクト表示名を持ち、狭い画面ではコンパクト表示名を使用する。コンパクト表示名は `① モデル` / `② 呪文` / `③ セリフ` / `④ 翻訳` / `⑤ システム` とする。各タブ内は目的別カードに分け、従来の13個の縦積みアコーディオンは使用しない。

| タブID | 長い表示名 / コンパクト表示名 | 主なカード |
|---|---|---|
| `workflows` | ① ワークフロー・モデル / ① モデル | ワークフロー、BaseModel、MappingMaster |
| `prompt` | ② プロンプト支援 / ② 呪文 | メインモデル、既存6種類のプロンプト、2種類のLLMパラメータ |
| `dialogue` | ③ セリフ支援 / ③ セリフ | 口調プリセット、VLM/LLM設定、フキダシ検出、3種類のロールプロンプト、1種類のLLMパラメータ |
| `translation` | ④ 翻訳 / ④ 翻訳 | プロバイダー、認証、デバウンス、プレビュー。LLMプロバイダー時のみ2種類の翻訳プロンプトと1種類のLLMパラメータ |
| `system` | ⑤ システム・一般 / ⑤ システム | 接続、VRAM、表示と操作 |

タブは `tablist` / `tab` のARIAナビゲーションとして実装し、タブ名をARIAラベルとして提供する。`aria-label` には長い表示名を用い、丸数字（①〜⑤）は含めない。初期選択は有効なURL hash、次に有効な `prompt-surgeon-settings-active-tab`、最後に `workflows` の順で決める。hashが無効または欠落している場合は選択結果をURL hashへ `replace` で正規化する。以後はURL履歴を優先し、ユーザーのタブ選択を履歴へ `push` することで戻る/進む操作を復元する。

詳細表示の開閉状態は `prompt-surgeon-settings-details-expanded-v2` にJSONオブジェクト `{ "prompt": boolean, "dialogue": boolean }` として保存する。既定値は両方閉 (`false`) で、欠落・不正JSON・不正な値は該当項目を閉状態として扱う。旧キー `prompt-surgeon-settings-sections-expanded` は読み書きせず、削除もしないため既存データはそのまま残る。

設定ページが使うLocalStorageキーの契約は次のとおり。

| キー | 値 | 備考 |
|---|---|---|
| `prompt-surgeon-settings-active-tab` | 有効なtab ID | 初期選択の解決順は上記のとおり |
| `prompt-surgeon-vram-guard-limit` | 数値文字列（読込時 `readStoredVramLimit` で2.0〜14.0にclamp） | サーバ値が正で、本キーはwrite-throughミラー |
| `prompt-surgeon-settings-details-expanded-v2` | `{ "prompt": boolean, "dialogue": boolean }` | **スキーマ不変**。§3-2の一時的UI（モーダル等）の開閉は含めない |

編集中のドラフトは再取得や非同期応答で上書きせず、保存・適用時に最新の入力値を送る。既存6種類のプロンプト制約は `prompt` タブにのみ適用する。接続設定ではFastAPI/ComfyUIの既存契約を使い、Backend URLおよびLM Studio URLの編集機能は追加しない。

systemタブは接続状態、VRAM、表示と操作の3論理カードで構成する。日常的なサービス管理はこのsystem欄から行い、管理リクエストは閲覧中ページと同じホスト名のポート `8899` にあるWeb Managerへ送る（例: `http://<現在のホスト名>:8899/api/status`、`/api/action`、`/api/logs`）。ポート `8899` は設定ページを配信する `8000` と別オリジンである。Web Manager API固有のブラウザーOrigin許可範囲は[運用ガイド](server_manager_guide.md)に定め、バックエンドAPI一般のCORS規則には拡張しない。`8000` が停止して設定ページを開けない場合は、PCのブラウザーから既存のWeb Manager画面 `http://<PCホスト名>:8899` を直接開いて管理する。接続状態は読み取り専用のバックエンド設定 `COMFY_URL` を反映し、フロントエンドからComfyUI URLを変更する項目は追加しない。既存API、store、環境設定の境界は維持し、これら以外の新しいAPIや設定保存契約を導入しない。

ComfyUI行では、Web Managerの状態に `execution_state`（`idle` / `executing` / `queued` / `unknown`）とqueue件数を表示し、「メモリ解放」はTCP接続がLISTEN、状態が既知の`idle`、queueがrunning/pendingとも0、他のManager操作がなく、要求中でない場合だけ有効にする。Managerは全操作共通lockを取得した後、キャッシュを使わずqueueを再確認してからComfyUIの`/free`へ一度だけ送信する。停止・生成中・queue待機中・状態不明・Manager操作中・応答確認中は操作不可とし、理由を行内に示す。

成功表示は「解放要求を受け付けました。空き容量は監視値で確認してください」とし、物理VRAM解放の完了を意味しない。ComfyUIの/free受付は非同期であり、直後は以前の測定値が残る場合がある。次の生成ではモデル再ロード待ちが生じることがある。受付後の「メモリ解放」操作は、fresh status GETで`execution_state=idle`かつqueue running/pendingが0/0と確認するまで非活性に保つ。VRAMは通常WebSocketの`SYSTEM_STATS`（2.5秒周期）で同期し、既存Backend monitorの2.5秒周期と合わせて通常5秒以内に新しい監視値へ追従する。WebSocket切断中は表示中のVRAM欄が`GET /api/settings/vram`を2.5秒間隔で再取得し、失敗時は更新できない旨と古い測定値であることを示す。queue確認と/freeの間に外部クライアントが新しいpromptを送る競合は完全には排除できない。timeout、HTTP 504、通信断、応答不明時は「要求結果未確認」と表示し、Manager状態とVRAMを再取得するが同じPOSTは再送しない。未保存の閾値draftは状態・VRAMの再取得や非同期応答で上書きせず、保存済み値と区別して保持する。

systemタブのサービス管理は、Supervisor / Backend / ComfyUI（および存在する場合はFrontend）の行ごとに死活ランプと「ログ ▼」を持ち、ログは該当行の直下にインライン展開する（既存の「ログ本文は初期状態で折り畳む」規定と整合し、状態・ログ取得7秒／サービス操作120秒の待機予算は維持する）。VRAMガードは1024px（lg）以上で左=メーター（黄色の閾値縦線と閾値タグ）、右=閾値スライダーの2ペイン、未満は縦積みとし、スライダー操作はクライアントStateで即時に線とタグへ反映する（HTTP/WS負荷なし）。メーターの色は、空き容量が閾値未満で赤、閾値+1.0GB未満で黄とする。サムネイル比率は1行のドロップダウンで選択する。

### 3-1. 設定ページのレスポンシブ動作

Workflow/Mapping設定では `WorkflowConnectionSection` 内の `AdaptiveWorkflowWiring` を専用スクロール領域にする。対象workflowの有効stageを順に連続groupとして表示し、各stageのenabled variantに対応するwire項目を同じgroupへ配置する。未設定のenabled候補も表示・選択できる。各groupの見出しは専用領域内でstickyとし、次groupが領域上端へ到達したとき表示を切り替える。保存操作は既存のWorkflowConnectionSectionの保存経路を使い、スクロール領域外に置く。

wire slotのrole名およびparameter/select名は既存の契約どおり表示する。簡潔化するのはstage group見出しだけとし、slot名をgroup表示名へ置き換えない。表示整理に伴うDB、API、schemaの変更は行わない。

状態・ログ取得は7秒、サービス操作は120秒の待機予算を使う。操作timeout・504・応答不明は「要求結果未確認」と表示して状態を再取得し、再送しない。running表示だけで再起動成功と断定しない。メモリ解放の成功応答は要求受付であり、物理解放完了を示さない。ログAPIの`lines`は総行数number、本文は`content`であり、FEは表示用配列へ正規化する。Managerのbusyと各サービスの稼働状態は区別する。

画面幅768px未満ではタブバーを横スクロール可能にし、スナップ位置をタブ単位にする。タブを画面幅へ均等縮小せず、選択タブが見える状態を保つ。設定カードは狭い画面で縦積みにし、操作対象は44px以上とする。AppShellのbottom nav（<768px）、tablet rail（768–1023px）、desktop sidebar（>=1024px）は[SPEC_COMMON.md](./SPEC_COMMON.md)の共通境界に従う。

設定タブの初期値は有効なURL hash、保存済み有効tab ID、最後に`workflows`の順に解決し、tab選択後の戻る/進むもURL履歴から復元する。LLM Playgroundは設定値を保存するフォームではなく、現在編集中の未保存draftを試すstatelessな場である。token情報が応答にないときは推測せず「未取得」と表示する。

設定変更は成功応答を確認した後だけ保存済み状態として表示する。保存失敗時は入力draftを保持して「未保存」と示し、再取得や古い非同期応答で入力を上書きしない。Speech Toneは名前付きsample cardsで未保存入力をpreviewし、最新draftの結果だけを採用して古い要求結果を表示しない。モバイル（幅768px未満）の保存契機は次の分類に従う。サーバーの設定リソース単位で同じ分類を適用し、初期表示・再取得・resizeだけでは保存要求を送らない。モバイルのautosave対象には通常の保存用Saveボタンを設けず、各分類に定める確定操作だけを保存契機とする。明示保存／適用対象は既存のSave／Applyだけで確定し、Retryは失敗したautosaveを利用者が再送するときだけ表示する。

| 分類 | 対象 | 保存契機 |
|---|---|---|
| 即時autosave | 既存スイッチ、LLMモデル選択、サムネイル比率、長押し判定時間、VRAMガード有効切替 | 利用者が値を確定変更したとき |
| 入力確定後autosave | LLM数値パラメータ、Bubble Detectionの`min_area` / `min_brightness`、VRAM空きGB閾値、翻訳debounce | 数値欄はblurまたはEnter、rangeはpointerup・キーボードkeyupまたはblur。`pointercancel`では確定せず、同一snapshotを重複送信しない |
| 明示保存／適用 | 長文LLM prompt、翻訳providerと認証情報の一体フォーム、workflow一括適用、口調プリセット作成／編集 | 既存のSave／Applyを利用者が押したとき。providerだけを先行保存しない |

autosave中も編集中draftを保持し、空欄・非有限数・不正値・既存範囲外は送信しない。既存min/max/stepを変更せず、validation／未保存を示す。同じリソースの送信は1件ずつとし、送信中に確定した値は最新snapshotへ集約する。成功は提出したrevisionだけへ反映し、新draftを古い応答やrefetchで上書きしない。失敗後は後続送信を止め、最新draftと失敗／未保存を保持する。明示的な「再試行」だけで再送し、自動通信retryは行わない。保存中は控えめに「保存中…」を示し、対応revisionの成功後だけ約2秒の成功表示を許す。通常の「保存済み」badgeを常設しない。

タブ切替は非表示mounted panelとdraftを保持する。767px以下から768px以上へのresizeでもdraft・状態・送信中要求を失わず、desktopの既存手動保存とレイアウトを維持する。幅変更だけで保存要求を起動しない。

【承認済み追加設計】Settings限定の離脱保護はmobile／desktop両方に適用する。この記述は契約を定めるもので、REQ-381コードACの独立受入完了を示さない。dirty／invalid／failed／queued／inFlightのいずれかが登録され、pathnameが`/settings`を離れるrouter PUSH／REPLACE／POP（NavLink、useNavigate、戻る／進むを含む）で確認する。同じSettings内のhash／query／tab変更は許可する。最小のData Router seamとして既存rootを`createBrowserRouter`／`createRoutesFromElements`／`RouterProvider`へ移し、既存AppShell、6 route、QueryClient／persist／store起動provider、外側GlobalErrorBoundaryを維持する。loader／actionは追加しない。`SettingsDraftBoundary`は`/settings`のleaf routeだけを囲み、rootや全画面を囲まない。registryはinstance／resourceごとのflagsと`cancelQueued`／`discardLocal` callbackだけを保持し、入力値や認証情報を保存しない。

確認中もinFlight保存は継続するが、1件でもinFlightがあればLeaveは無効にする。完了しても自動離脱せず、利用者が改めてLeaveを選ぶ。Cancelは現在URL・画面・draft・queueを保ち、保存やretryを起動しない。inFlightがないときの明示Leaveだけが未送信queueを同期取消し、local draftを破棄してproceedを1回実行する。過去の成功保存はrollbackせず、timeout等で結果不明の要求がserver側で取り消されたとは保証しない。reload／close／別document移動はリスクがある場合だけnative `beforeunload`確認を登録する。文言はbrowser依存で非同期flushの完了を保証せず、モバイルOSの強制終了は保護対象としない。修飾click／新規tabは元のSettingsとdraftを保持する。

Translationの辞書照合は大文字小文字を区別するリテラル一致で、長い一致から一度だけ置換する。置換結果を再走査して連鎖変換せず、元の入力を破壊しない。キャッシュは元の入力・設定に対応する結果として扱い、置換済みテキストを別入力のキーへ流用しない。

Workflow/Mapping設定のJSON import/exportはversion 1形式を使う。importはschema、workflow graph、対象Master IDを適用前に検証し、ファイル内のtarget名と件数をpreviewに表示する。preview表示だけではDBを変更せず、利用者の明示確認後に既存workflow update APIを一度だけ呼ぶ。`default_applied_assets`を省略したimportは既存値を保ち、明示`null`は関連付けを解除する。無効な入力ではpreviewの適用操作を許可しない。

systemタブの接続/VRAM/表示・操作カードには、Supervisor、Windows Backend、ComfyUIのサービス行（死活ランプと「ログ ▼」）を含むコンパクトなservice cardを配置する。停止/再起動の前に対象サービス名を明示したinline確認を行い、操作要求は二重送信しない。状態・ログ取得timeoutは7秒、サービス操作は120秒。結果が未確認のときは状態を再取得するだけで再送せず、ログ本文は初期状態で折り畳む。ログ取得は同一ホストの8899番Manager APIを使い、メインAPI（8000番）と混同しない。

### 3-1-1. 画面レイアウト（REQ-365）

workflowsタブは `xl`（>=1280px）で2カラムとし、左=ワークフロー（上）・BaseModel（下）、右=MappingMasterを配置する。左カラムはRow-Span余白を作らない。<1280pxはワークフロー→MappingMaster→BaseModelの順に縦積みする。この並べ替えはCSS `order` のみで行い、データ順序およびAPIに影響しない。

モバイル（<768px）ではタブバーを横スワイプ（snap）にし、操作対象は44×44px以上とする。ページ下部余白は `pb-[calc(6rem+env(safe-area-inset-bottom))]` とし、768px以上では解除する。

MappingMaster行とチェックポイント表は超スリムカードで表示する。1行目は名称と右端固定のアクション、2行目はバッジ（`+N classes` / `+N stages`）とする。Target Node情報は画面表示せず、編集ボタンの `aria-label`「<名称> のマッピング設定を編集（対象ノード: …）」に保持する。Settingsの管理系・編集系モーダル（§3-2: カスタム型マスタ一覧/フォーム、BaseModelマスタ、MappingMasterEditModal、StageManagerModal、口調プリセット編集（SpeechTonePresetModal）、MappingMaster削除確認、ワークフロー削除確認、WorkflowManageModal、WorkflowNodePicker）はすべて共通Modalによりモバイルでボトムシート（実ハンドル付き、上端角丸16px、最大高さ85dvh）、768px以上で中央配置として表示する。Settingsから到達する独自overlayは残っていない（grep確認 2026-10-15）。行内の `role="alertdialog"` 確認（サービス操作、口調プリセット削除）はオーバーレイではなく、`MappingMasterModal`（`SettingsComponents.tsx`）は本番コードから未参照である。詳細は [SPEC_COMMON.md](./SPEC_COMMON.md) §1-4 を参照。


### 3-1-2. モバイルSettingsの操作契約（REQ-381）

モバイル（幅768px未満）でも5タブと全設定項目を維持し、375px幅で横はみ出し・重なり・見切れを生じさせない。横幅に収めるためページ外側の余白、カード内側余白、カード間gapをdesktopより縮め、Settings固有の値として各12pxにする（共通tokenへ昇格させない）。本文はページ縦スクロールとする。専用workflow配線、長いinfo、シート等に必要な内部スクロールは個別契約に従う。タブバーは既存の横スクロール／snapを保ち、タブ選択は既存の`selectTab`、URL hash、履歴、保存済みtab IDの契約に従う。

- MappingMasterのモバイル表示では「Add Master」を直接表示し、管理メニューに「ステージ管理」「カスタム型マスタ」を置く。各項目は既存の`StageManagerModal`／`ParamTypeMasterManagerModal`を開き、list→form→listの排他遷移を保つ。BaseModelの「モデルマスタ管理」と混同しない。desktopの既存導線は維持する。
- 補足説明は必要な詳細説明だけを同一行のinfoへ移す。infoは全文を表示し、不透明な濃色背景と十分な文字コントラスト（本文と背景の比4.5:1以上）、画面内配置、長文時の内部scrollを備える。再タップ・外側タップ・Escape・祖先またはページのscrollで閉じるが、info本文自身の長文内部scrollでは閉じない。警告・error・未保存状態はinfoへ隠さず常時表示する。この契約はSettings固有であり、共通popover基盤へ広げない。
- 本文の意図的な横swipeは隣接tabへ移動し、端で循環しない。縦scrollを優先し、入力・range・button等の操作対象、独立scroll、開いたoverlayを起点とするジェスチャーを除外する。直接tapを代替経路として残す。
- Speech Toneの作成／編集シートは共通Modalを使い、左にCancel、右にSaveを置く。keyboard表示時の到達性、44×44px以上の有効領域、focusの視認性を保つ。

### 3-2. オンデマンド管理

カスタム型マスタ（`ParamTypeMaster`）は常時展開せず、「カスタム型マスタ」ボタンから一覧モーダル（`ParamTypeMasterManagerModal`）を開き、作成/編集フォームモーダルへ**排他遷移**する（list→form→list、モーダルをネストしない）。ただし MappingMasterEditModal 内の WorkflowNodePicker は共通Modalのネスト例外で、Esc は内側のみを閉じる。BaseModelマスタ定義は「モデルマスタ管理」モーダルで行う。ワークフロー行のアクションは右端の「︙」メニューに集約する。これらの一時的UIの開閉状態は `prompt-surgeon-settings-details-expanded-v2` に含めない。API・DB契約は変更しない。

### 3-3. 統合型プロンプトエディタ

`prompt` タブは、種別セレクタ（6キー: `audit_interference` / `audit_interference_anima` / `audit_vocabulary` / `audit_physical` / `scene_generate` / `scene_generate_anima`）と、左=本文、右=共通モデル（読み取り専用）・Temperature・Max Tokens の2ペインで構成する。右ペインの値は、選択した種別が属するLLMパラメータ群（`audit_*` の4種は `llm_params_audit`、`scene_generate*` の2種は `llm_params_scene_generate`）に連動する。種別を切り替えても未保存draftは保持する。既存6種類のプロンプト制約とAPI/DB契約は変更しない。

### 3-4. 口調テスト実行

セリフタブでは、口調プリセットを選択してテスト入力を入力し、「テスト実行」で既存の `POST /speech-tone-presets/rewrite` を呼ぶ。最新の要求結果だけを表示し、古い応答は破棄する。新しいAPIは追加しない。

---

## 4. データモデル

### 4-1. MappingMaster & ParamTypeMaster

`input_type` のうち `select_sampler` および `select_scheduler` は、ComfyUI の `/object_info` から最新のサンプラ・スケジューラ一覧を動的取得する（オフライン時は定数フォールバック）。

```typescript
interface MappingMaster {
  id: number;
  role: string;
  expected_class_types: string[];
  param_name: string;
  input_type: 'textarea' | 'int' | 'float' | 'select' | 'lora_stack' | 'select_sampler' | 'select_scheduler' | 'boolean' | 'seed';
  display_name: string;
  title_patterns: string[];
  default_enabled: boolean;
  sort_order: number;
}

interface ParamTypeMaster {
  id: number;
  name: string;
  widget_type: 'select' | 'int' | 'float' | 'textarea' | 'boolean';
  combo_options?: string[]; // select 時の選択肢配列
  min_value?: number;
  max_value?: number;
  step?: number;
}
```

Settingsのwire表示は、既存のworkflow stage定義、MappingMaster、および有効variantの対応関係を使う。variantがあるslotはmaster IDとvariant IDの両方で識別し、保存時に元のvariant IDを保持する。legacy slotはvariantを持たない既存identityのまま扱う。group表示・選択解除はslot単位で、保存は既存のworkflow mapping保存契約を使う。未設定のenabled候補も候補として残すため、保存時に既存設定を意図せず削除しない。

### 4-1-1. REQ-358 ノード候補とworkflow slot状態

ノード候補は全workflow nodeを表示する。tier 0〜1は同じ推奨グループ、tier 2〜4は選択可能な通常候補とする。候補には0〜100%の適合score badgeと一致根拠を表示する。順位更新は現在の対応付けを変更しない。

| Tier | 判定 | 推奨 |
|---|---|---|
| 0 | 登録classと登録titleの生文字完全一致 | はい |
| 1 | 登録class一致とtitle表記ゆれ一致 | はい |
| 2 | 登録class一致。title不一致 | いいえ |
| 3 | class不一致だが登録parameter名を持つ | いいえ |
| 4 | 上記以外。titleのみ一致も含む | いいえ |

表記ゆれ比較ではASCII英字の大小、ASCII空白、`_`、ASCII `-`だけを正規化する。typo、翻訳、regex、Unicode記号の同一視はしない。推奨グループは75〜100点、class候補50〜74、parameter候補20〜49、その他0〜19とし、各group内はstageとtitleの近似score降順、同点ID文字列順にする。正規化stage全文包含は最大、共有文字bigramのDice近似は部分加点する。FaceDetailerに対するFace DetailerはHand Detailerより高い。登録/リマッピング/Settingsは全variantのtitle登録・fallback parameter・stage集合を共通判定へ渡す。scoreは規則による適合度を表示する。

登録・リマッピング画面では入力slotのDOMと位置を維持する。空欄は未割当としてその場で編集でき、未検出専用の別エリアへ移動しない。有効チェックOFFはrole/node欄を減光し、再有効化まで入力不可。表示・生成へ反映する際は未割当と同じ対象外として扱い、保存ID/文字列は保持する。空欄や入力値の存在でOFFを上書きしない。selectorは欄全体をクリックして候補を開け、IDを先頭に1回だけ表示し、title/class/scoreを同じ欄内へ置く。直接入力・選択後のfocus維持とreadonly操作拒否を保つ。ワークフロー単位の無効化はvariant slot key `v:<variant_id>`、legacy slot key `m:<master_id>`を持つ `mapping_slot_states` に保存する。key欠落またはtrueは有効、falseは明示無効。再スキャンは最新GET完了後に一度だけ状態を初期化し、保存中に編集へ戻さない。旧null variantは単一slotかrole完全一致の一意なslotへ解決し、旧と新の同じmappingを重複保存しない。slot state/候補scoreの重複再計算はcacheで避け、toggleからHTTPは送らず、保存は二重発火を防ぐ。

既存マッピングが存在するワークフローのリマッピング（`RescanModal` 等）では、保存済みマッピングが存在しない未割当スロットにスキャン結果を自動入力せず空欄（未割当）のまま維持し、候補リスト（推奨・通常候補）のみを提示する。新規ワークフロー登録（`UploadWorkflowModal` 等）ではスキャン一致候補を自動初期化する。また、保存・リマッピング時に保持する非表示マッピングは、現行の `mapping_masters` / `mapping_variants`（非活性バリアントや `default_enabled=false` を含む実在定義）に属するものに限る。削除済み `master_id` や存在しない `variant_id` を参照する孤立マッピング（Orphaned Mappings）はフロントエンドの保存ペイロードおよびバックエンドのワークフロー作成・更新・コピー・ロールバック時に除外し、マイグレーション `Step 031` で既存 DB から浄化する（REQ-369）。

現状のStage ManagerはActive=falseで配下variantを一括falseへ変更し、false→trueで一括trueへ復帰する。以前の個別OFFまでONになる既知の制約は、利用者指示でREQ-360へ分離して扱う。既にActive=trueのname編集やtrue→true更新では各variantの個別状態を変更しない。workflow mappingやworkflow固有slot stateは保持する。

`MappingMaster.default_enabled` は新規workflowへの初回取込既定で、省略時はtrue。falseのmaster/variantは新規slotとして表示・取込しない。保存stateまたは既存mappingがあるworkflow slotは、masterを後からfalseにしても残す。MappingMaster一覧/APIは基本無効を含む全件を保持する。

workflow JSON version 1では `mapping_slot_states` をoptionalで扱う。importで省略された場合は既存stateを保ち、明示 `{}` は空snapshotとして置換し、`null`や不正形式は拒否する。workflow copy、history、rollbackは対応状態をmappingと一緒に保存・復元する。既存workflow JSONにfieldがない場合は従来slotを有効として扱う。

標準の `input_type: 'seed'` は32bit unsigned Seed専用の入力型であり、`ParamTypeMaster.widget_type` に追加するカスタム型ではない。値は既存のrole別パラメータ保存領域に10進文字列として保存し、固定値またはランダムの選択モードはmaster/variantの安定したslot単位の予約JSONメタデータに保存する。Seed型の割当・編集はMappingMasterの既存操作を使い、手動の型変更を除き、データベースmigrationや自動移行は行わない。既存のmappingとlegacy global Seedの保存・動作は維持する。

### 4-2. BaseModel & CheckpointMapping

```typescript
interface BaseModel {
  id: number;
  name: string;
  description?: string;
}

interface CheckpointMapping {
  id: number;
  checkpoint_name: string;
  base_model_id: number;
  base_model?: BaseModel;
}
```

### 4-3. SpeechTonePreset

```typescript
interface SpeechTonePreset {
  id: number;
  name: string;
  prompt: string;
  description?: string;
  sort_order: number;
}
```

### 4-4. TranslationSettings

```typescript
interface TranslationSettings {
  provider: 'fugumt' | 'google' | 'deepl' | 'llm';
  api_key?: string;
  api_url?: string;
}
```

- **FuguMT 特記事項**:
  - `provider: 'fugumt'` 選択時は、API キーおよびカスタム API URL の入力が不要（UI 上で入力欄非表示、保存ペイロードにも含めない）。
  - 初回使用時に Hugging Face より `jkawamoto/fugumt-en-ja-ct2` がローカルの `models/fugumt-en-ja` へ自動ダウンロード・配置される。
  - CTranslate2 による完全 CPU 常駐推論（約 20-30ms の超低レイテンシ）で動作し、VRAM を消費せず画像生成と並行して安定稼働する。
  - **ハイブリッド和訳アーキテクチャ**:
    - Danbooru 辞書（`danbooruTagCompleteCsv_v1020250919.zip` 等）の先行照会（ハッシュ引き・O(1)）により、登録タグは即時変換。
    - ピリオド・改行等で文ブロックを分割し、辞書非マッチの自然文節はカンマ区切りを再結合した文単位で FuguMT に渡すことで、関係詞や分詞構文などの文脈を維持した高精度な和訳を行う。
    - 強調構文（`((...:1.2))`）は一時プレースホルダー化またはカッコ内個別処理により構文破壊を防止し、`repack: true` 指定時にカンマ区切りおよびピリオド区切りで安全に再パッキングする。

---

## 5. 接続ステータス (Connections)

- **FastAPI Backend**: メインアプリの現在のオリジン（通常 `http://<PCホスト名>:8000`）にある `/api/config` で疎通確認（タイムアウト: 5000ms、4xx/5xx は切断判定）。生成状態とイベントは同じバックエンドの `/api/ws` を利用する。
- **ComfyUI**: バックエンドが保持する読み取り専用 `COMFY_URL` の接続状態を表示する。生成状態の取得・イベント受信はバックエンド経由で行い、ブラウザーやスマートフォンが `8188` へ直接接続する要件はない。
- **Web Manager**: 設定ページのsystem欄からは、同一ホスト名・ポート `8899` の `/api/status`、`/api/action`、`/api/logs` を利用する。これはポート `8000` のアプリ/APIとは別オリジンの管理サービスであり、`8000` 停止時のPC向け復旧入口は既存のポート `8899` 画面である。

---

## 6. API 呼び出し

`docs/openapi.yaml`はバックエンドOpenAPIから生成される契約ファイルで、現行生成物は117 pathを持つ。この一覧はSettings画面が利用するAPIの抜粋であり、OpenAPI全体の代替ではない。

| 操作 | エンドポイント | ペイロード / パラメータ |
|---|---|---|
| マッピングマスタ一覧・管理 | `GET/POST/PUT/DELETE /api/mapping-masters` | `{ "role": string, ... }` |
| マッピングマスタ並び替え | `PUT /api/mapping-masters/reorder` | `{ "item_ids": number[] }` |
| パラメータ型マスタ一覧・管理 | `GET/POST/PUT/DELETE /api/param-type-masters` | |
| ベースモデル一覧・管理 | `GET/POST/PUT/DELETE /api/base-models` | |
| チェックポイントマッピング一覧・管理 | `GET/POST/DELETE /api/checkpoint-mappings` | `GET /api/comfy/checkpoints` |
| ワークフロー一覧・削除 | `GET/DELETE /api/workflows` | |
| ワークフロー差分推測・トポロジー解析 | `POST /api/workflows/{id}/diff-analyze` | `{ "json_body": object }` |
| ワークフロー置換確定（自動履歴バックアップ） | `PUT /api/workflows/{id}` | `{ "json_body": object, "mappings": array }` |
| ワークフロー直前スナップショット復元（ロールバック） | `POST /api/workflows/{id}/rollback` | |
| ワークフロー履歴状態確認 | `GET /api/workflows/{id}/history-status` | |
| LLM プロンプト一覧・更新 | `GET/PUT /api/llm-prompts/{key}` | |
| LLM モデル一覧取得・現在モデル切替 | `GET /api/llm-prompts/models`, `GET/PUT /api/llm-prompts/current-model` | |
| 翻訳設定・テスト・キャッシュクリア | `POST /api/translate/prompt`, `POST /test`, `GET /stats`, `POST /clear-cache` | プロバイダー種別: `fugumt`（推奨・APIキー不要・`jkawamoto/fugumt-en-ja-ct2` 初回自動配置）, `google`, `deepl`, `llm` |
| セリフ口調プリセット一覧・管理・テスト | `GET/POST/PUT/DELETE /api/speech-tone-presets` | `POST /rewrite` |
| セリフ口調プリセット並び替え | `PUT /api/speech-tone-presets/reorder` | `{ "ordered_ids": number[] }` |

---

## 7. コンポーネント構成

```
pages/SettingsPage/
  index.tsx                      — メインページ・セクション開閉状態管理
  components/
    LlmSettingsSection.tsx       — LLM モデル選択・プロンプト・パラメータ
    TranslationSettingsSection.tsx — プロンプト翻訳設定・統計・テスト
    BubbleDetectionSection.tsx   — フキダシ自動検出パラメータ
    SpeechToneSection.tsx        — 口調プリセット管理 & 書き換えテスト
    MappingMasterSection.tsx     — マッピングマスタ & パラメータ型マスタ
    BaseModelSection.tsx         — BaseModel & Checkpoint マッピング
    VramGuardSection.tsx         — VRAMガード（メーター＋閾値スライダー）
    ServiceConnectionCard.tsx    — サービス行の死活ランプ・インラインログ
    ThumbnailSettingsSection.tsx — サムネイル表示アスペクト比
    WorkflowConnectionSection.tsx— 長押し設定、ワークフロー削除、接続確認
      AdaptiveWorkflowWiring.tsx — stage別wire group、未設定enabled候補、専用scroll領域

components/
  ParamTypeMasterManagerModal.tsx — カスタム型マスタ一覧モーダル（作成/編集フォームへ排他遷移）
```

---

*本ドキュメントはSettings画面の承認済み仕様と実装契約の正本です。この記述だけでREQ-334の全体QAや3-Gate完了を示すものではありません。*
