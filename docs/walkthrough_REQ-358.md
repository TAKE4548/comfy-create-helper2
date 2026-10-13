# REQ-358 統合検証 walkthrough

- 実施日: 2026-10-13 (Asia/Tokyo)
- 対象PBI SHA-256: 07d29b69f74ed5a3114641d1e1158b659964caa5eaad90eec2b21d4b25732329（2026-10-13のブラウザ指摘に伴うAC-14/表示要件の明確化後）、AC 38件
- 総合判定: ユーザー受入済み / クローズ（監査raw判定・検証制約は保持）
- BA監査: FAIL（維持） / 設計監査: INCONCLUSIVE（維持）
- QA監査: FAIL / HIGH

## 2026-10-14 クローズ承認

ユーザーの「OKこれでクローズに進めよう」によりREQ-358を受入済みとしてクローズする。
最新Frontend typecheck、232 files / 2,165 tests、T35/T36のブラウザ操作・性能確認はPASS。
初回表示19.0秒→579ms、切替中API通信0件、保存PUT1件を確認した。
履歴のQA監査raw FAIL/HIGHとtest-hygiene既存76件のraw FAILは上書きしない。
合成APIによるブラウザ確認は実DBの再起動永続化を証明しない。この制約を残したユーザー受入であり、全ACの機械的PASSや再監査を意味しない。
SettingsのStage再有効化で元々無効だったStageも有効になる課題は、別PBI REQ-360（new / 草案）へ分離した。

## 2026-10-14 最新確認追記 (T35/T36 scope)

### Gate 1 / Gate 2

| 対象 | 最新結果 |
|---|---|
| Frontend `npm run typecheck` | PASS、exit 0。T35/T36 row memo後に実行。 |
| Frontend `npm test -- --reporter=dot` | PASS、232/232 files、2,165/2,165 tests。出力末尾に失敗なし、Vitest duration 70.23s。 |
| Test hygiene | 既存raw FAIL 76件。以前ユーザーが受容したbaseline例外を維持し、再度のユーザー判断は求めない。 |

### Gate 3 / T35・T36 実ブラウザ性能・境界

- 合成fixtureを使ったheadless Chromeで、32 masters×9 stages（288 slot rows）と200 candidate nodesを表示。全画面の`/api/*`をCDP fixtureへ隔離し、実DB書込み・生成はなし。初回row表示579ms。
- 個別slot click→React/DOM commit 10回の中央値55.6ms/p95 68.2ms。一括stage切替は中央値73.0ms/p95 121.5ms。個別切替計測には2 animation frames（約33ms floor）を含む。計測中API request delta 0。
- selectorのmetadata・score・空欄クリックで候補を開く。readonlyの無効slotは開かず、値を保持する。他の有効slotは開く。metadataにIDの重複なし、候補200件のIDは一意。
- 保存PUTを1件に限定し応答を500ms遅延。保存中ボタンはdisabledのまま約541msまで観測。「保存中…」を表示。console/runtime errorsは0。
- 性能比較: 高密度rank関数12,186.08ms→250.34ms、hookの10回CPU切替481.05ms→11.27ms。別境界の測定値である。実ブラウザ初回UIは従前19.0秒→579ms。
- 詳細・画像・fixture request/timing: `docs/design/REQ-358-performance-recheck.md`。

### 最新スコープの判定

T35/T36の対象挙動、Red Team境界、Gate 1、Gate 2はPASS。全てのAPIがfixtureへ隔離されているため、ブラウザ試験はDB永続・再起動の証拠ではない。以前のQA audit raw verdict **FAIL / HIGH** とtest-hygiene raw FAILを保持し、再監査はしていない。以前のaudit結果やPBI全AC/process gateをこの追記で再判定しないため、この検証時点のREQ-358全体判定は**INCONCLUSIVE**。後続のユーザー受入によるクローズは上記承認記録を参照する。

## 2026-10-14 最新確認追記 (T32/T33/T34 scope)

この追記は最新の修正範囲を優先する。以下以前の実行時における未確認事項は当時の履歴として保持し、ここで得た証拠と区別する。

### Gate 1 / Gate 2

| 対象 | 最新結果 |
|---|---|
| Frontend `npm run typecheck` | PASS、exit 0（最新のreasonラベル日本語化後はmainが再確認中） |
| Frontend `npm test -- --reporter=dot` | PASS、231/231 files、2,158/2,158 tests、exit 0、78.27s。ログ: `.tmp/req358-browser-verify/frontend-full-suite-final.log` |
| T32 修正後 `WorkflowModalEditing.test.tsx` | 全suiteを止めた文言期待の不一致を更新scopeに合わせ、「未割当」表示・非減光・`readOnly=false`で確認するようテスト修正。対象単体もPASS。 |
| 後続のreason文言日本語化 | `MappingNodeSelector.test.tsx` 2 tests PASSとの報告あり。全suiteとブラウザ画像はこの表記修正前のため、最新ラベル表現の全suite/browser証拠ではない。スコア順位・状態・操作への影響はないとの実装報告。 |
| Test hygiene | raw FAILを維持。既存のticket名test違反76件はユーザーが受容したbaseline exceptionであり、validator PASSを意味しない。 |

### Gate 3 / ブラウザとAPI証拠

- isolated headless Chromeで実Reactを確認し、全`/api/*`はfixtureへ隔離。再スキャンでstage一括無効→保存→閉じる→再表示を行い、false状態・ID/title/class/score保持・disabled行readonlyを確認。ブラウザruntime/console errorsは0件。
- 無効のlegacy null-variant `Sampler_Seed`に値があるケースで、Main v:false時に生成画面のglobal Seed欄から除外される一方、raw assignmentは保持されることを確認。
- FaceDetailer候補はFace Detailer 100% > Hand Detailer 62% > Main Sampler 55%。closed selector内のnode title/class/ID/score、空欄の「未割当」+編集可能、無効行の値保持+readonlyを確認。
- fixture UI試験は実DB書込・再起動後永続性の証拠ではない。別途backend `tests/test_req336_stage_api.py` 5 tests PASSで、SQLite-backed API false→true遷移、複数variantの有効化、別stageとmapping/state保持を確認（アプリ再起動試験ではない）。mypy stage router PASS報告あり。
- 画像・詳細結果: `docs/design/REQ-358-browser-recheck.md`。rank/state screenshotのreason英語文言は後続の日本語化前の表示。

### 最新スコープの判定

対象とした修正後の実装挙動、browser scenario、最新全frontend suiteはPASS。旧全suiteの単独失敗は、修正後scopeに適合するassertion更新を行い、修正後全suiteで解消した。既存のQA audit raw verdict **FAIL / HIGH** とtest hygiene raw FAIL（受容済みbaseline debt）は保持し、QA auditを再実施していない。したがって、修正対象を製品未解決として扱わず、REQ-358のformal overall verdictは既存監査・全AC/process gateの扱いを含めてINCONCLUSIVEのままとする。

<execution_evidence>

## Gate 1

| 対象・command | 結果 |
|---|---|
| Frontend npm run typecheck | PASS、exit 0 |
| Backend .venv/Scripts/python.exe -m mypy app | PASS、89 source files、issuesなし |

## Gate 2

| command | 結果・ログ |
|---|---|
| 初回 Frontend npm test -- --reporter=dot | 同時実行回でVitest collection error、230 files failed、tests 0。 |
| Backend .venv/Scripts/python.exe -m pytest -q | PASS、725 passed、3 warnings、22 subtests、224.40s |
| 再実行 Frontend npm test | PASS、230 files passed、2,138 passed、exit 0、58.64s |
| python GLOBAL_SCRIPTS/workflow_validator.py test-hygiene REQ-358 | FAIL、exit 1、76件のTEST_ACCRETION_VIOLATION。判定は既存ファイル名の規則違反を列挙したもの。Gate 2は規定どおり衛生ゲート未達でFAIL。 |

TEST_ACCRETION_VIOLATION対象path（validator出力）:

- backend/tests/test_e2e_req319.py
- backend/tests/test_manager_origin_req333.py
- backend/tests/test_req334_album_description.py
- backend/tests/test_req334_bubble_preview.py
- backend/tests/test_req334_dictionary.py
- backend/tests/test_req334_job_metadata.py
- backend/tests/test_req334_playground.py
- backend/tests/test_req334_workflow_import.py
- backend/tests/test_req336_cascade_service.py
- backend/tests/test_req336_e2e_integration.py
- backend/tests/test_req336_mapping_masters_api.py
- backend/tests/test_req336_models_migration.py
- backend/tests/test_req336_stage_api.py
- backend/tests/test_req340_backend_fallback.py
- backend/tests/test_req343_workflow_variant_scan.py
- backend/tests/test_req350_seed_mapping_api.py
- backend/tests/test_req350_seed_preset_roundtrip.py
- backend/tests/test_req353_openapi_contract.py
- backend/tests/test_req353_seed_mapping_api.py
- backend/tests/test_req_045.py
- backend/tests/test_req_048_t2.py
- backend/tests/test_req_087.py
- backend/tests/test_snapshots_req316_metadata.py
- backend/tests/test_snapshot_associations_req316.py
- backend/tests/test_snapshot_image_mime_req316.py
- backend/tests/test_snapshot_service_req267.py
- frontend/src/api/__tests__/req334PreviewApis.test.ts
- frontend/src/api/__tests__/req334QueuedCancel.test.ts
- frontend/src/components/layout/__tests__/AppShell.req334.test.tsx
- frontend/src/components/layout/__tests__/ResizableSplitLayout.req334.test.tsx
- frontend/src/components/LoraModals/__tests__/LoraDetailExamples.req334.test.tsx
- frontend/src/components/LoraModals/__tests__/LoraDetailModal.req334.test.tsx
- frontend/src/components/LoraModals/__tests__/LoraFormExamples.req334.test.tsx
- frontend/src/components/LoraModals/__tests__/LoraRegisterModal.req334.test.tsx
- frontend/src/components/TagSetModals/TagSetFormFields.req334.test.tsx
- frontend/src/components/__tests__/ImageCarousel.req334.test.tsx
- frontend/src/components/__tests__/JobManagementModal.req333.test.tsx
- frontend/src/components/__tests__/LazyThumbnail.req345.test.tsx
- frontend/src/components/__tests__/LoraStackEditor.req334.test.tsx
- frontend/src/pages/GeneratePage/components/__tests__/AddAssetModal.req334.test.tsx
- frontend/src/pages/GeneratePage/components/__tests__/GenerationProgress.req333.test.tsx
- frontend/src/pages/GeneratePage/components/__tests__/PromptTranslationModal.req334.test.tsx
- frontend/src/pages/GeneratePage/components/__tests__/SettingsPopover.req333.test.tsx
- frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateDisplayState.req345.test.tsx
- frontend/src/pages/GeneratePage/hooks/__tests__/useImageNavigation.req334.test.tsx
- frontend/src/pages/GeneratePage/sections/__tests__/GenerationGallerySection.req333.test.tsx
- frontend/src/pages/GeneratePage/sections/__tests__/GenerationGallerySection.req345.test.tsx
- frontend/src/pages/HistoryPage/components/__tests__/AlbumListView.req334.test.tsx
- frontend/src/pages/HistoryPage/hooks/__tests__/useAlbumOperations.req334.test.tsx
- frontend/src/pages/HistoryPage/views/__tests__/AlbumDetailView.req334.test.tsx
- frontend/src/pages/SettingsPage/components/__tests__/BubbleDetectionSection.req334.test.tsx
- frontend/src/pages/SettingsPage/components/__tests__/DictionaryPanel.req334.test.tsx
- frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.req336.test.tsx
- frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.req340.test.tsx
- frontend/src/pages/__tests__/AssetCardInteractions.req334.test.tsx
- frontend/src/pages/__tests__/SettingsPage.req314.test.tsx
- frontend/src/pages/__tests__/SettingsPage.req334.test.tsx
- frontend/src/test/e2e_req207.test.ts
- frontend/src/test/e2e_req240_multidevice.test.ts
- frontend/src/test/e2e_req260_vram_guard.test.ts
- frontend/src/test/e2e_req264_preview_autofollow.test.ts
- frontend/src/test/e2e_req317_storage.test.tsx
- frontend/src/test/e2e_req319_lora_studio.test.tsx
- frontend/src/test/e2e_req323_autosave_draft.test.tsx
- frontend/src/test/e2e_req332_recovery.test.tsx
- frontend/src/test/e2e_req332_storage.test.tsx
- frontend/src/test/e2e_req336_workflow_mapping.test.tsx
- frontend/src/test/e2e_req339_preview_layout.test.tsx
- frontend/src/test/e2e_req341_header_unification.test.tsx
- frontend/src/test/e2e_req345_residual_history.test.tsx
- frontend/src/test/e2e_req345_trial_availability.test.tsx
- frontend/src/test/e2e_req347_generate_stage_groups.test.tsx
- frontend/src/test/e2e_req347_settings_stage_groups.test.tsx
- frontend/src/test/e2e_req347_visual_polish.test.tsx
- frontend/src/test/e2e_req350_seed.test.tsx
- tests/unit/test_req244_scripts.py
### 衛生違反の帰属

- 76/76 pathはgit追跡済みで、違反path内に新規ファイルは0件。validatorは現在の作業差分と無関係に、ticket番号を含む既存test filenameも一律でTEST_ACCRETION_VIOLATIONとして列挙する。
- REQ-358のapproved Task Card/Test Planが変更対象としている既存pathは4件: backend/tests/test_req334_workflow_import.py (T4)、backend/tests/test_req336_mapping_masters_api.py (T3)、backend/tests/test_req353_openapi_contract.py (T19/T20)、frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.req336.test.tsx (T16)。それぞれ差分にREQ-358 AC付きtest caseを追加。新しいticket名ファイルは作成していない。
- frontend/src/pages/GeneratePage/components/__tests__/GenerationProgress.req333.test.tsx も作業差分あり（QueryClientProvider test helperの追加とrender call変更）が、REQ-358のTask Card/Test Planに記載がなく、REQ-358 AC testの追加もない。PBIへの帰属は確認できないためunattributedとする。
- frontend/src/components/__tests__/WorkflowModalEditing.test.tsx はREQ-358 T10の新規test fileだが中立的なmodule-derived filenameで、76件の違反には含まれない。
- よってREQ-358の新規testをhygiene ruleに適合させるためのscope changeや移動は不要。現行validatorの既存file誤検出は残るためGate 2 statusはFAILのまま。

## Gate 3

| scenario / command | result |
|---|---|
| REQ-358選別9 files、-t REQ-358 | PASS、9 files、71 passed、41 skipped |
| Upload回帰 WorkflowModalEditing.test.tsx -t REQ-358/UPLOAD_CLEAN | PASS、1 passed。未使用slotへ入力→全消去→同slot再入力を検証したfailure/recovery scenario。 |
| AC-19専用 pytest tests/test_req334_workflow_import.py -k 'req358 and AC_19' | INCONCLUSIVE、5 deselected/0 selected、exit 1。 |
| OpenAPI POST /api/workflows | PASS、openapi_parser.pyでmapping_slot_states object<boolean> |
| OpenAPI PUT /api/workflows/{workflow_id} | PASS、optional mapping_slot_states object<boolean> |
| OpenAPI GET /api/workflows/{workflow_id} | PASS、WorkflowReadにmapping_slot_states object<boolean> |
| Browser B1 / AC-16〜18 | INCONCLUSIVE、CUA getState timeout/reset、focus/rect/scrollの実測なし。 |
| Browser B2 / AC-19/23/34 | INCONCLUSIVE、再起動・永続往復・readonly画面を未確認。 |
| Browser B3 / AC-13〜15/25 | INCONCLUSIVE、3 surface・badge・その他選択保存・生成入力をbrowser未確認。 |

OpenAPI parserのmethodは小文字、pathは引用して実行した。初回の大文字method指定はCLI引数エラー。

## Local model QA audit

- elevated qa-audit command: python GLOBAL_SCRIPTS/local_model_adapter.py --context-length 32768 qa-audit docs/design/REQ-358-test-plan.md
- exit 0、model qwen/qwen3.5-9b、判定FAIL / HIGH。
- 所見: 実行でなくsource inspectionへ逃げられる曖昧さ、browser指標の定義不足、backend command/filter曖昧さ、AC-13/23/35のruntime比較不足、重要経路のmock排除条件不足。
- 直後にelevated unload、exit 0、LM Studio reports no models loaded。GPU全メモリの解放は主張しない。

## AC対応表

| AC | 判定 | 根拠または制約 |
|---|---|---|
| 1 | PASS | class一致test |
| 2 | PASS | title完全一致tier |
| 3 | PASS | 表記ゆれtier |
| 4 | PASS | typo下位class候補 |
| 5 | PASS | parameterなしclass候補 |
| 6 | PASS | class違い＋own parameter候補 |
| 7 | PASS | titleのみ非推奨候補 |
| 8 | PASS | tier順・その他選択 |
| 9 | PASS | Main stage rank |
| 10 | PASS | Upscaler stage rank |
| 11 | PASS | FaceDetailer stage rank |
| 12 | PASS | 入力順非依存 |
| 13 | INCONCLUSIVE | B3実browser DOM比較なし |
| 14 | INCONCLUSIVE | B3 badgeと根拠の画面確認なし |
| 15 | INCONCLUSIVE | B3の実選択後POST/PUT/GETなし |
| 16 | INCONCLUSIVE | Upload 1 passed、B1物理観測なし |
| 17 | INCONCLUSIVE | Upload 1 passed、B1全消去物理観測なし |
| 18 | INCONCLUSIVE | Upload 1 passed、B1再入力位置観測なし |
| 19 | INCONCLUSIVE | filter 0 selected、B2未実施 |
| 20 | PASS | workflow間状態分離・保存tests |
| 21 | PASS | stage一括false tests |
| 22 | PASS | stage再有効化 tests |
| 23 | INCONCLUSIVE | 自動state保持あり、B2永続往復なし |
| 24 | PASS | 無効空欄の除外とrow/key保持 |
| 25 | INCONCLUSIVE | generation clone test成功、B3 UI未確認 |
| 26 | PASS | master CRUD/OpenAPI/UI |
| 27 | PASS | default falseと新規slot除外 |
| 28 | PASS | 既存state/node保持 |
| 29 | PASS | 初回falseの取込除外 |
| 30 | PASS | master再有効化 |
| 31 | PASS | migration/schema/legacy fallback |
| 32 | PASS | class＋steps候補 |
| 33 | PASS | 保存済み非推奨ID保持 |
| 34 | INCONCLUSIVE | hook/UI test成功、B2 readonly画面なし |
| 35 | PASS | 参照nodeなしでも保存ID保持/missing flag |
| 36 | PASS | stage包含境界 |
| 37 | PASS | ASCII正規化境界 |
| 38 | PASS | current stage優先 |

自動AC testsでは新たな具体的製品欠陥を確認しなかった。AC-19 filterは検証ギャップで、製品不具合の再現ではない。browser必須AC、衛生failure、QA audit findingが残るため総合PASSにしない。PBI SHA/38 AC、BA監査FAIL、設計監査INCONCLUSIVEを維持する。

</execution_evidence>



## User disposition (2026-10-13)

The user accepted the 76 `TEST_ACCRETION_VIOLATION` entries as existing repository test-name debt pending the planned governance update/refactor. This is a user-accepted baseline limitation, not a claim that the hygiene validator passed; the raw validator result and paths above remain unchanged.

## Browser feedback and follow-up (2026-10-13)

The user completed browser checks and reported B1=OK, B2=FAIL, B3=FAIL. These are pre-fix observations; no post-fix browser evidence is available yet.

| Item | Finding | Follow-up / current evidence |
|---|---|---|
| B1 | User reported stable input behavior as OK. | Preserve PASS as the user's reported browser result. |
| B2 | Bulk stage disable removed assignments from all roles in the stage; enabling again did not restore them. | Type A path confirmed: GeneratePage passed generation-filtered mappings into RescanModal as source mappings. GeneratePage now passes rawWorkflow.mappings so the remap hook starts from saved IDs. RescanModal persistence tests and browser re-test are still required before AC-23 can be PASS. |
| B3 | User reported that disabling/re-enabling Seed had no effect. | Root cause remains INCONCLUSIVE. Ordinary generation filtering and the m: slot Seed path have unit coverage; the user-observed V2/variant Seed path was not reproduced. A browser re-test and the exact observed surface are needed to close this finding. |
| Mapping editor | Stage state appeared inverted; selected rows showed only node ID; stage confidence was not visible; role/stage hierarchy, bulk layout, and tier colors were hard to read. | Stage aggregate now reflects all-enabled / mixed / all-disabled accurately; disabled roles visibly say 無効. Upload/Rescan, Settings wiring, and master preview now share tier names/colors and stage-fit wording; selected node metadata appears in the normal row; stage controls use a compact horizontal layout; role remains the primary label. Tests: editor 16 passed, Settings AC-14 1 passed, preview 2 passed. |

Follow-up verification on this code state: `npm run typecheck` PASS; `npx vitest run src/components/__tests__/WorkflowModalMultiStage.test.tsx` PASS (16 tests); `npx vitest run src/pages/GeneratePage/hooks/__tests__/useWorkflowManagement.seed.test.ts` PASS (4 tests). The CUA browser surface could not initialize in this turn (`failed to write kernel assets: path not found`), so no post-fix physical browser claim is made. Overall REQ-358 remains INCONCLUSIVE pending B2/B3 browser re-test and the unresolved Seed observation.
