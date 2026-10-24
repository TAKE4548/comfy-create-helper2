# REQ-381 文書設計 — モバイルSettingsの契約同期

## 目的と読者

Settingsの利用者、実装担当、独立検証担当が、幅767px以下の保存タイミングと操作規則、および両viewportのSettings離脱保護を同じ意味で読めるようにする。コード設計は [REQ-381.md](./REQ-381.md)、テスト計画は [REQ-381-test-plan.md](./REQ-381-test-plan.md) を参照する。本書は設計案であり、実装・受入・仕様同期の完了を示さない。

## 範囲と正本

- 更新対象は `docs/specs/SPEC_SETTINGS.md` と `docs/specs/SPEC_COMMON.md` のみ。実行カードは [REQ-381-T8](../backlog/task/active/REQ-381-T8.md)。
- Settings固有の保存分類、入力確定、離脱保護、サブメニュー、info、スワイプの正本はSPEC_SETTINGSとする。SPEC_COMMONは共通原則へのSettings適用範囲と導入状況だけを補足し、全画面共通のroute guardへ拡張しない。
- モバイル境界は768px未満。768px以上の既存レイアウト・手動保存を維持し、画面幅の変化だけで保存要求を起動しない。人間が選択した追加設計として、Settings限定の離脱保護だけはmobile/desktop両方へ適用する。
- API/DB、認証情報の形式、共通Modalの排他・フォーカス契約、Settings以外の共通部品の振る舞いは変更対象に含めない。

## 現行記述との意味の差分

| 現行の位置・意味 | 更新後の意味 | 保持する契約 |
|---|---|---|
| SPEC_SETTINGS §3-1: Bubble等の未保存draftでは遷移確認overlay。ただし限定source調査では既存route blockerを確認できない | 3保存分類とSettings限定の両viewport離脱保護を具体化する。同一Settingsのtab/hash/queryは許可し、別pathnameへのrouter遷移を確認する | 成功確認前の保存済み表示禁止、Cancel時のdraft保護、古い応答/refetchによる上書き禁止 |
| §3-1/§3-1-1: 縦積み・44px・横スクロールタブ | 5分類を保ちながら余白を整理し、本文スワイプを既存selectTabと同じ経路へ接続 | URL hash、戻る/進む、localStorageキー、直接タップ、専用workflow配線スクロール |
| §3-2: カスタム型マスタの直接ボタン | モバイルのMappingMasterヘッダーはAdd Masterを直接表示し、管理2項目を「管理 ⋯」へ集約 | 各モーダルの開き先、list→form→list排他遷移、desktopの既存導線 |
| 補足説明の常設 | 重複説明を削減し、必要な詳細説明だけを同一行のinfoへ移す | 警告・エラー・未保存は常時見える。全文への到達性 |
| SPEC_COMMON §1-6の適用画面にSettings記載なし | MUI-02/03/04/06/07/08/10にSettings適用と限定的な導入補足を追加 | 他画面の導入状況、44px、ボトムナビ高さ、共有部品の未承認事項 |

## 承認対象の保存契約

モバイルの分類をSPEC_SETTINGSに表として置く。タブ間で同じ設定が参照されても、サーバーの設定リソース単位で一貫させる。

| 分類 | 対象 | 保存契機 |
|---|---|---|
| 即時autosave | 既存スイッチ、LLMモデル選択、サムネイル比率、長押し判定時間、VRAMガード有効切替 | 利用者が値を確定変更したとき。初期表示・再取得・resizeでは送らない |
| 入力確定後autosave | LLM数値パラメータ、Bubble画像処理のmin_area/min_brightness、VRAM空きGB閾値、翻訳debounce | 数値欄はblur/Enter。rangeはpointerup、キーボードkeyupまたはblur。pointercancelは確定にしない。同一snapshotは重複送信しない |
| 明示保存/適用 | 長文LLMシステムプロンプト、翻訳providerと認証情報の一体フォーム、workflow一括適用、口調プリセット作成/編集 | 既存の保存/適用を利用者が押したとき。providerだけを先行保存しない |

入力確定後autosaveは編集中のローカルdraftを維持する。空欄・非有限数・不正値・既存範囲外は送信せず、未保存/validationを表示する。既存のmin/max/stepを変更しない。

同じリソースの送信は1件ずつとし、送信中にさらに確定した場合は最新snapshotへ集約する。成功後に最新分を送信し、古い応答は新しいdraftを上書きしない。失敗後は後続送信を停止し、最新draftと失敗/未保存を残す。利用者の「再試行」で再送し、自動通信retryは行わない。通常の保存ボタンを再試行の代用として残さない。

保存中は小さく「保存中…」を表示し、対応するrevisionの成功確認後だけ一時的な成功表示（約2秒）を許す。通常の保存済みbadgeは常設しない。失敗と未保存の表示は解決まで保持する。タブ切替は非表示mounted panelを保持する。モバイルからdesktopへresizeしてもdraft・状態・送信中要求を失わず、desktopは数値フォームの既存手動保存を保つ。

## Settings限定の離脱保護契約

人間が選択した追加設計であり、現行実装済みとは扱わない。SPEC_SETTINGS §3-1をこの契約の正本とし、旧「保存/破棄の選択」の曖昧な表現を明確なCancel/Leaveへ置き換える。

- T0はrootを既存のBrowserRouter/RoutesからcreateBrowserRouter/createRoutesFromElements/RouterProviderへ最小限移行する。既存AppShellと6 route、QueryClient/persist/store起動、外側GlobalErrorBoundaryを保ち、loader/action等を追加しない。SettingsDraftBoundaryは `/settings` leafだけを囲み、他画面へguardを適用しない。
- mobile/desktop両方で、登録されたdirty/invalid/failed/queued/inFlightのいずれかが存在し、pathnameが `/settings` を離れるrouter PUSH/REPLACE/POPをuseBlockerで確認する。NavLink/useNavigate/戻る・進むを含む。同じSettings内のhash/query/tab変更は許可し、mounted panelとdraftを保持する。
- registryはinstance/resourceごとのflagsとcancelQueued/discardLocal callbackのみを保持し、入力値や認証情報を格納しない。LLM数値/長文prompt、Bubble、VRAM、翻訳provider/credentials/debounce、workflow/BaseModel、口調作成・編集、変更中master formのリスクを集約する。
- Cancelはblocker.resetを使い、現在URL・画面・draft・queueを保持する。確認を開いている間もinFlight保存は通常どおり継続する。Cancelを押した事実だけで保存や再試行を起動しない。
- inFlightの永続化要求が1件でもある間、Leaveは無効にする。要求が終わっても自動離脱せず、利用者が改めてLeaveを押す。inFlightがない時の明示Leaveは、未送信queueを同期的に取り消してローカルdraftを破棄し、blocker.proceedを1回だけ実行する。以前の成功保存を巻き戻さず、通信を自動retryしない。timeoutで結果不明となった要求がサーバーで取り消されたとは表現しない。
- reload/close/別documentへの移動はリスクがある場合だけnative beforeunload確認を登録する。文言はbrowser依存で、独自の確認文や非同期flushの完了を保証しない。モバイルOSによる強制終了を保護できるとは記載しない。修飾click/新規tabは現在のSettingsとdraftを保持するため、draftを消費しない。

内部router確認とnative beforeunloadは別の経路として記述する。保存成功によってリスクがなくなった場合は確認を不要にするが、dirty/invalid/failedが残る限り未保存を勝手に解除しない。

## モバイルUI契約

- 5タブ/全設定項目を維持し、375pxで横はみ出し・重なり・見切れを生じさせない。本文はページ縦スクロールとし、専用workflow配線、長いinfo、シート等の必要な内部スクロールは個別契約に従う。
- infoは必要な詳細説明のラベルと同一行に置き、不透明ダーク背景・全文表示・画面内配置・長文内部スクロールを備える。再タップ、外側タップ、Escape、スクロールで閉じる。グローバルな共通popover基盤の契約には拡張しない。
- 本文の意図的な横スワイプは隣接タブへ移動し、端で循環しない。縦スクロールを優先し、入力・range・button等の操作対象、独立スクロール、開いたoverlayを起点とするジェスチャーはタブ切替に使わない。直接タップを代替経路として残す。
- 口調プリセットは共通Modalのモバイルシートを使い、左キャンセル/右保存、キーボード表示時の到達性、44×44pxの有効領域とフォーカス可視性を保つ。
- SPEC_COMMON表へSettingsを追加しても、他画面を含む規則全体を一括で「導入済み」に変更しない。導入が確認されたSettingsの範囲を§1-6-3へ記載する。

## AC-11の外部前提

調査時点でREQ-380のPBI frontmatterはready。現行ServiceConnectionCardには死活・ログ・起動/停止/再起動があるが、メモリ解放ボタンは存在しない。REQ-381はREQ-380のAPIや解放機能を代わりに実装しない。

コード設計のT6はREQ-380の実在するコントロールを前提とするservice/AC-11カードであり、外部前提が満たされるまでblockedとする。AC-11の最終受入は、その実装が存在し、375pxで死活/ログ/メモリ解放を実際に確認できるまでpendingとする。placeholderやmockだけの配置確認を本番機能の受入にしない。T8はT7の完了後に実行し、未導入機能を現行仕様として追記しない。

## 文書検証計画

コードACのPASSとは分離し、doc-reviewer/doc-verifyが次の意味・矛盾・参照を独立評価する。

| AC | 正常ケース | 失敗・境界ケース | 維持ケース |
|---|---|---|---|
| AC-1/2 | 5タブ/375px密度の記述がある | 767/768境界、長いラベル、値の欠落 | 全設定項目・desktop・既存配線scroll |
| AC-3/4 | Add Master/管理2項目/開き先を明記 | 狭幅でメニューが画面外へ出ない説明 | desktop導線・Modal排他 |
| AC-5/6 | 必要な詳細説明のinfo化と全文到達 | 長文、画面端、閉じる4契機 | エラー/警告/未保存を隠さない |
| AC-7 | 3分類と対象・確定契機を一意に記載 | 不正数、失敗、旧応答、同一値、連続確定、resize | draftとdesktop手動保存 |
| AC-8 | 明示保存対象とprovider/credentials一体性 | 認証不備時に自動確定しない | workflow/口調/長文promptの保存 |
| AC-7/8/12の追加設計 | 両viewportでPUSH/REPLACE/POP時のCancel/Leaveを明記 | saving中Leave無効、完了後自動離脱なし、timeout不明、native beforeunload限界 | Cancel後のURL/draft/queue、Settings内tab/hash/query、他画面のroute挙動 |
| AC-9 | selectTab経路・直接タップの代替 | 縦scroll、range、入力、overlay、端タブ | hash/履歴/保存済タブ |
| AC-10 | 左取消/右保存とシート | キーボード表示・長文 | 共通Modal/44px |
| AC-11 | 実在するREQ-380導線の配置を同期 | 未導入時pending、mock受入禁止 | 既存死活・ログ・サービス安全契約 |
| AC-12 | desktopの保存/レイアウト維持と選択済み離脱保護の追加範囲を明記 | resizeで新規autosaveを発火しない | 現行保存/レイアウト/API、他画面はguard対象外 |

構造チェックはUTF-8 without BOM/LF、diffの空白検査、見出し・相対参照・AC対応を対象とする。文書だけのAPI/type/TDDは要求しない。プロジェクトのコードbaselineやrequired auditは別途coordinatorが収集し、文書検証で代替しない。

## 所有権・DAG・取捨選択

T8はdoc-editor/doc-taskがSPEC_SETTINGS/SPEC_COMMONのみを所有する。コードのT0〜T7はarchitect/engineer側が所有し、同じファイルを並行編集しない。T0がrouter seamとSettings registryを担当し、T1はT0へ依存する。T7はT2〜T6をjoinし、T8は引き続きT7へ依存する。コード側の実装・局所確認が揃ってから仕様を同期し、全追跡対象編集を完了してから独立最終verificationを行う。

保存分類と共通適用範囲は意味が密接であるため、一つの文書カードへ統合する。先に仕様を現行化すると未実装の契約を現行と誤読するため、実装完了後の同期を選ぶ。並列化の効果はunknownとし、コード設計と文書設計だけを独立所有で並行準備する。再作業リスクは保存分類またはAC-11外部前提の変更であり、承認後に契約が変われば設計レビューへ戻す。

## 監査・承認状態

Settings限定離脱確認を設計する方針は人間が選択済み。更新された具体設計/カードによる実装の承認はpending。文書のBA/semantic auditは全体設計の必須監査対象としてcoordinatorへ渡す。本担当はモデル監査を実行しておらず、監査PASSや文書受入PASSを宣言しない。
