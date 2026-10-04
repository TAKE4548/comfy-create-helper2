# REQ-316 検証 walkthrough

## 判定と対象

改訂設計・テスト計画・T1〜T15は2026-10-04（Asia/Tokyo）にユーザー承認済み。T1〜T18とT8仕様同期を完了した。Gate 1/2/buildはPASS。Gate 3ではdesktop/mobile表示、実ComfyUIの6画像で5欄とactual seed一致、T16/T17後のimage/webp取得、T18欄単位開閉を確認した。ユーザー報告でclipboardの手動確認も完了し、AC-24をPASSとした。監査指摘についてユーザーの許容承認を得てPBIをarchiveした。

<execution_evidence>

## 3-Gate証拠

| Gate | 結果 | 証拠 |
|---|---|---|
| Gate 1: typecheck/static | PASS | frontend typecheck exit 0、backend cwdで `.venv/Scripts/python -m mypy app` 71 files / 0 errors。 |
| Gate 2: automated tests | PASS | frontend Vitest 106 files / 1063 tests PASS（[final log](../../logs/REQ-316-frontend-full-tests-final.log)）。backend pytest 413 passed, 2 warnings（[log](../../logs/REQ-316-backend-full-tests-mime.log)）。 |
| Build | PASS | 最新frontend build exit 0、[index.html](../../frontend/dist/index.html)、[CSS](../../frontend/dist/assets/index-9G6nN4kg.css)、[JS](../../frontend/dist/assets/index-D8EF0bX1.js)を確認。 |
| Gate 3: browser / manual | PASS（記録済みシナリオ） | desktop 1280×900、mobile 390×844、T18欄開閉両方向、実ComfyUI 6画像の5欄/seed、保存後別origin再読込、同一browser image/webpを確認。ユーザー報告でclipboard手動確認も完了。 |


| QA check | 結果 | 証拠 |
|---|---|---|
| Application log inspection | PASS | `python scripts/inspect_logs.py --clean-check 10` exit 0: `No errors or warnings found in the last 10 minutes.`（[final log](REQ-316-clean-log-check-final.log)）。 |

## ブラウザー確認

| 操作/表示 | 結果 | 証拠・制約 |
|---|---|---|
| デスクトップの画像＋情報パネル | PASS | [desktop screenshot](../../logs/REQ-316-ui-desktop.png)（1280×900）。 |
| 狭幅で画像の下に情報を配置 | PASS | [mobile screenshot](../../logs/REQ-316-ui-mobile.png)（390×844）。mobile修正後のscrollWidth/clientWidthは303/303。 |
| 狭幅で長文末尾marker | PASS | [mobile long screenshot](../../logs/REQ-316-ui-long-end-mobile.png)。Quality欄scrollHeight 3620/clientHeight 256、末尾scroll差<2、scrollWidth/clientWidth 262/262、marker可視。 |
| Prompts欄、書記素数、空欄 | PASS | QAブラウザーで4欄、grapheme count、empty stateを確認。全体frontend testsにも対応testsあり。 |
| 2000文字超の全文と末尾 | PASS | ブラウザー内の実欄をスクロールし、2364書記素（JavaScript length 3444、Python文字数3084）の末尾marker `REQ316_LONG_END_20261004` を確認（[screenshot](../../logs/REQ-316-ui-long-end.png)）。 |
| Parameters & Assets / JSON値 | PASS | false/0/nullとJSON表示を確認。追加の全任意mapping/旧記録ケースはautomated testsで確認。 |
| 寸法・比率 | PASS | 832×1216pxを13:19として表示（2:3へ丸めない）。 |
| 保存画像の形式 | PASS | 元のHEAD応答は200 `application/octet-stream`。T16でgeneric MIME時に実ファイル形式を検出し、T17でHEAD cacheを回避。T16局所4 tests、backend全413 tests、mypy71 files PASS。修正前に汎用headerをcacheした同一browserを再読込後、`image/webp`取得を確認。 |
| LoRA各強度 | PASS | 3種類のLoRA strength値を別々に表示。 |
| タブ/keyboard | PASS | keyboardでtabsを操作。 |
| generic tag draft | PASS | 削除後cancelで元の関連を維持し、再度削除して保存。 |
| trigger関連/facts保護 | PASS（対象シナリオ） | 保存操作中も既存trigger関連と生成factsが維持されることを確認。追加/削除・失敗系の契約はfrontend/backend testsで検証。 |
| clipboard | PASS（ユーザー報告） | 手動でコピー動作を確認完了との報告。許可/拒否時のUI処理はunit tests PASS。以前のCUA virtual clipboard readbackは空だったが、これはツール制約の歴史的証拠として残す。OS byte比較およびseedコピー個別確認は実施済みと主張しない。 |
| 実生成→保存→別origin再読込 | PASS（成功経路） | 初回Prompt ID `e7a2d286-2aaf-4794-bc07-0be46c27a47d` は5欄graph/record/snapshot/reload DOM完全一致、actual seed `1548941896`。追加5件（random 1、fixed 4）はすべてcompleted、5欄一致、graph seed一致。fixed seed入力を後から316999へ変えても4画像は元の316000/316001を維持（[matrix](../../logs/REQ-316-real-seed-matrix.json)）。計6画像で成功経路を確認。 |

</execution_evidence>

## AC別の証拠判定

「自動PASS」はGate 2とTask Cardの局所tests/API contract testsを根拠にした実装検証を指し、実ComfyUI生成E2EのPASSを意味しない。

| AC | 判定 | 根拠/制約 |
|---|---|---|
| AC-1 | PASS（自動＋実生成） | 実ComfyUI生成の5欄すべてでgraph/record/snapshot/reload DOMの全文一致。Prompt ID `e7a2d286-2aaf-4794-bc07-0be46c27a47d` の証拠を保存。 |
| AC-2 | PASS（自動） | negativeを含む全textarea記録・表示契約tests。実生成E2Eは未実施。 |
| AC-3 | PASS（browser） | 実欄をスクロールし2364書記素の全文と末尾markerを確認（[screenshot](../../logs/REQ-316-ui-long-end.png)）。 |
| AC-4 | PASS（自動＋実生成） | 生成後に現在入力を変更してSnapshot #2を保存。保存値は生成時5欄を保持。 |
| AC-5 | PASS（自動＋実生成） | 実生成後のSnapshot保存・別origin再読込で5欄を完全一致確認。 |
| AC-6 | PASS | 空文字と未記録区別tests、およびbrowser empty-state確認。 |
| AC-7 | PASS（自動） | 旧/不完全recordを未記録として扱うrecord resolution tests。 |
| AC-8 | PASS（自動＋実生成） | 元PromptMetadataを削除し、workflow名変更、localStorage共有なしの別originからreload。現在値で履歴を補完せず、Snapshot factsを保持。 |
| AC-9 | PASS（自動） | 有効promptとbypass状態の記録契約tests。 |
| AC-10 | PASS（自動） | promptとparameterの独立保存/表示契約tests。実生成E2Eは未実施。 |
| AC-11 | PASS（自動） | 生成時欄構成のrecording/resolution tests。 |
| AC-12 | PASS（自動） | incomplete/unknown record warning contract tests。 |
| AC-13 | PASS（browser） | デスクトップ/狭幅の画像＋panel構成をscreenshotsで確認。 |
| AC-14 | PASS（自動＋browser） | T18で全折畳み後の単独欄展開、および全展開後の単独欄折畳みで他欄の状態を保持。局所6 tests/typecheck PASS、ブラウザー両方向確認（[evidence](../../logs/REQ-316-ui-toggle-evidence.json)）。実clipboard値はAC-24参照。 |
| AC-15 | PASS | JSON false/0/nullとmapping表示、T16実ファイルMIME判定（局所4 tests）、backend 413 tests/mypy71、T17 no-store後の同browser `image/webp`表示を確認。 |
| AC-16 | PASS（自動＋実生成） | 初回seed `1548941896` と追加5画像（random 1、fixed 4）の全graph/record seed一致。全6画像completedかつ5欄一致（[matrix](../../logs/REQ-316-real-seed-matrix.json)、[first run](../../logs/REQ-316-real-comfy-history.json)）。 |
| AC-17 | PASS（自動） | Prompt ID、workflow、受付/保存時刻の区別と現在album表示のcontracts/UI確認。完了時刻は未記録表示。 |
| AC-18 | PASS（自動＋browser） | LoRA model/role/各strengthを別表示。browserで3強度確認、trigger/genericを分離。 |
| AC-19 | PASS（自動＋browser） | generic関連のdraft削除/save、trigger保持、限定PATCH/API contract tests。 |
| AC-20 | PASS（自動＋browser） | draft cancel維持をbrowser確認、保存失敗時draft保持をcomponent testsで確認。 |
| AC-21 | PASS（自動＋browser） | backend PATCH testsでrole/strength/facts保護、browserでtrigger/facts保持を確認。 |
| AC-22 | PASS（browser） | 832×1216から13:19を表示。 |
| AC-23 | PASS（自動＋browser） | grapheme countと件数をbrowser確認。 |
| AC-24 | PASS（手動＋自動） | ユーザー報告で実clipboardコピーの手動確認完了。success/rejection handling unit testsもPASS。CUAの以前の空readbackはツール側の制約で、OS byte比較やseedの個別コピー検証を意味しない。 |

### 実生成E2E artifacts

実ComfyUI request history、PromptMetadata、Snapshot、ブラウザー観測の各JSONとUI画像を保持する。

- [History](../../logs/REQ-316-real-comfy-history.json)
- [Prompt metadata](../../logs/REQ-316-real-prompt-metadata.json)
- [Snapshot](../../logs/REQ-316-real-snapshot.json)
- [Browser evidence](../../logs/REQ-316-real-browser-evidence.json)
- [Generated preview](../../logs/REQ-316-ui-real-generated.png)
- [Saved snapshot reload](../../logs/REQ-316-ui-real-saved-reload.png)
- [Additional seed matrix](../../logs/REQ-316-real-seed-matrix.json)
- [T18 browser toggle evidence](../../logs/REQ-316-ui-toggle-evidence.json)

## 実行・分割記録

DAGに沿ってrootがT9/T1/T2/T3等の生成・record経路を進め、engineerがT15/T14のUIを並行実装した。UI担当枠が空いた後、独立backend T11を実施（T11に先行依存なし）。T4はT4a（旧関連UI撤去）/T4b（旧表示撤去）/T4c（新panel接続）に内部分割。T16/T17は画像MIMEのbackend判定とHTTP cache回避、T18はAC-14の個別欄状態保持を補正し、外部DAGと承認範囲を維持した。T18後にGate 1/2/buildとbrowser確認を完了。

## QA test-plan audit

`local_model_adapter.py --timeout 300 --unload-after qa-audit docs/design/REQ-316-test-plan.md` を2回実行。初回session 29042、再監査session 21831、両方exit 0かつ終了直前にadapterが`All models unloaded from LM Studio. VRAM freed.`を出力。[初回log](REQ-316-qa-audit-execution.log)、[再監査log](REQ-316-qa-audit-rerun.log)。両方の原文判定は `REQUIRES MODIFICATION BEFORE EXECUTION`。AC定義リンク、INT厳密比較、実行ログ/timeout、viewport markerの明確化を追記したが、追加の再監査は行わず、QA audit PASSとはしない。Hash/EXIF/evidence manifest等の追加process要求は承認要件外として不採用。詳細は[triage](REQ-316-qa-audit-triage.md)。

## 残件と状態

- 失敗経路の実ComfyUI E2Eは未実施。成功経路のrandom/fixed seed matrixは6画像で確認済み。
- ユーザー報告により実clipboardの手動確認はPASS。以前のbrowser tool virtual clipboard readback空/Ctrl+V拒否は歴史的なツール制約として保持し、アプリcopy失敗とは扱わない。OS byte比較とseedコピーの個別確認は主張しない。
- AC-3は当初ブラウザー未確認だったが、その後2364書記素の実欄を末尾markerまで確認しPASSへ更新。以前の未確認記録は監査triage履歴に保持。
- QA auditは2回ともREQUIRES MODIFICATIONのまま、追加再監査なし。拡張BA auditもINCONCLUSIVE。
- ユーザーは監査の追加プロセス指摘を許容すると明示承認した。原判定は保持し、全ACの既存PASS証拠とclipboard手動確認報告に基づきREQ-316を完了・archiveする。実ComfyUI失敗経路、OS byte比較、seedコピー個別検証は実施済みと主張しない。
