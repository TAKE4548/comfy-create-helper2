# REQ-356 既存テスト検証項目対応表 (移行前ベースライン)

本ドキュメントは REQ-356 (テスト再構成および高速化・Seam Map 準拠) の移行前ベースラインとして、
リファクタ前の全テスト（Backend / Frontend）が担保している検証項目を機械抽出した対応表である。

## 1. 全体サマリー

| 項目 | 件数 | 備考 |
|---|---|---|
| Backend テストファイル数 | 77 | `backend/tests/**/*.py` |
| Frontend テストファイル数 | 263 | `frontend/src/**/*.{test,spec}.{ts,tsx}` |
| 抽出テストケース総数 | 3427 | Python 関数 + TS it/test |
| PBI 紐づけありテスト数 | 1118 | `REQ-xxx` 関連 |
| PBI 紐づけなしテスト数 | 2309 | 汎用ユニット・ガバナンステスト (AC-15準拠) |
| ファイル名規約違反数 (AC-1) | 0 | `req\d+` をパスに含むファイル |
| テスト名規約違反数 (AC-15) | 19 | `[REQ-xxx/AC-n]` 未準拠 |

## 2. ファイル名規約違反一覧 (移行対象: AC-1)

違反なし（全テストファイル名が規約に準拠しています）。

## 3. PBI別テストケース対応一覧 (トレーサビリティ基準)

### REQ-048 (計 8 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `backend/tests/integration/models/test_migrations.py` | test_seed_initial_data_populates_base_models: [REQ-048/AC-5] seed_initial_data populates default base models (Illus, Noob, Anima). | AC-5 | PASS |
| `backend/tests/integration/models/test_migrations.py` | test_existing_lora_migration_to_illus: [REQ-048/AC-5] _migrate_existing_loras migrates legacy Loras without base models to Illus. | AC-5 | PASS |
| `backend/tests/integration/models/test_model_relations.py` | test_base_model_crud_and_checkpoint_mappings: [REQ-048/AC-1][REQ-048/AC-2] BaseModel and CheckpointMapping relationships and cascade. | AC-1 | PASS |
| `backend/tests/integration/models/test_model_relations.py` | test_lora_many_to_many_base_models: [REQ-048/AC-3] Lora many-to-many relationship with BaseModel through association table. | AC-3 | PASS |
| `backend/tests/integration/models/test_model_relations.py` | test_workflow_target_base_model_relation: [REQ-048/AC-4] Workflow target_base_model relation. | AC-4 | PASS |
| `backend/tests/unit/test_helpers.py` | test_llm_parser_extracts_interference_tags: [REQ-048/AC-1] LLM parser extracts interference tags and reasons from XML block. | AC-1 | PASS |
| `backend/tests/unit/test_helpers.py` | test_llm_parser_extracts_vocabulary_suggestions: [REQ-048/AC-2] LLM parser extracts vocabulary suggestion items from XML block. | AC-2 | PASS |
| `backend/tests/unit/test_helpers.py` | test_llm_parser_extracts_physical_evaluation: [REQ-048/AC-3] LLM parser extracts physical evaluation ratings and alternatives. | AC-3 | PASS |

### REQ-112 (計 7 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/pages/GeneratePage/__tests__/GeneratePage.test.tsx` | [REQ-112/AC-1] renders Desktop layout by default and shows workflows | AC-1 | PASS |
| `frontend/src/pages/GeneratePage/__tests__/GeneratePage.test.tsx` | [REQ-112/AC-2] toggles workflow actions menu when workflow actions button is clicked | AC-2 | PASS |
| `frontend/src/pages/GeneratePage/__tests__/GeneratePage.test.tsx` | [REQ-112/AC-3] supports switching to mobile mode based on innerWidth | AC-3 | PASS |
| `frontend/src/pages/GeneratePage/__tests__/GeneratePage.test.tsx` | [REQ-112/AC-4] header does not contain removed UI elements | AC-4 | PASS |
| `frontend/src/pages/GeneratePage/__tests__/GeneratePage.test.tsx` | [REQ-112/AC-5] manage-presets-btn opens preset manager modal | AC-5 | PASS |
| `frontend/src/pages/GeneratePage/__tests__/GeneratePage.test.tsx` | [REQ-112/AC-6] workflow actions menu contains workflow management items | AC-6 | PASS |
| `frontend/src/pages/GeneratePage/__tests__/GeneratePage.test.tsx` | [REQ-112/AC-7] renders error boundary fallback UI when a child component throws an error | AC-7 | PASS |

### REQ-159 (計 3 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx` | [REQ-159/AC-1] should compute totalQueueCount based purely on ComfyUI queue running and pending | AC-1 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx` | [REQ-159/AC-2] should consider isGeneratingHere true when filterOwnSession is true and activeBatch has pending/generating jobs | AC-2 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx` | [REQ-159/AC-3] should sync queue without refetching history for a restored nonempty baseline on visibilitychange | AC-3 | PASS |

### REQ-161 (計 2 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/pages/GeneratePage/__tests__/GeneratePage.test.tsx` | [REQ-161/AC-1] Generate Batch button is disabled when workflow is not loaded (Desktop) | AC-1 | PASS |
| `frontend/src/pages/GeneratePage/__tests__/GeneratePage.test.tsx` | [REQ-161/AC-2] Generate Batch button is disabled when workflow is not loaded (Mobile) | AC-2 | PASS |

### REQ-163 (計 3 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `backend/tests/integration/models/test_model_relations.py` | test_workflow_preset_relationships: [REQ-163/AC-1] Workflow and WorkflowPreset foreign key relationship and ordering. | AC-1 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx` | [REQ-163/AC-1] should maintain independent prompts when switching presets | AC-1 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx` | [REQ-163/AC-2] should handle OCC conflict (409) in updatePresetMutation | AC-2 | PASS |

### REQ-180 (計 5 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `backend/tests/integration/models/test_model_relations.py` | test_speech_preset_relations: [REQ-180/AC-1] SpeechBubblePreset and SpeechTonePreset model persistence and constraints. | AC-1 | PASS |
| `frontend/src/components/__tests__/SpeechBubbleControls.test.tsx` | [REQ-180/AC-1] renders style-only presets section before with-text presets section in DOM order | AC-1 | PASS |
| `frontend/src/components/__tests__/SpeechBubbleControls.test.tsx` | [REQ-180/AC-1] handles scale flipping and path flipping in manga fx section | AC-1 | PASS |
| `frontend/src/utils/__tests__/speechBubbleRenderer.test.ts` | [REQ-180/AC-2] flips path points correctly for vertical and horizontal orientations | AC-2 | PASS |
| `frontend/src/utils/__tests__/speechBubbleRenderer.test.ts` | [REQ-180/AC-1] calculates tail base position and respects fine-tuning parameters | AC-1 | PASS |

### REQ-186 (計 3 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/pages/GeneratePage/__tests__/GeneratePage.test.tsx` | [REQ-186/AC-1] keeps preset manager modal open when selecting a preset to open as tab | AC-1 | PASS |
| `frontend/src/pages/GeneratePage/__tests__/GeneratePage.test.tsx` | [REQ-186/AC-2] allows closing tabs directly from preset manager modal | AC-2 | PASS |
| `frontend/src/pages/GeneratePage/__tests__/GeneratePage.test.tsx` | [REQ-186/AC-3] closes preset manager modal when explicitly clicking close button | AC-3 | PASS |

### REQ-188 (計 6 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/components/__tests__/SpeechBubbleControls.test.tsx` | [REQ-188/AC-1] synchronizes default pathPoints when pathPreset or orientation changes | AC-1 | PASS |
| `frontend/src/components/__tests__/SpeechBubbleControls.test.tsx` | [REQ-188/AC-2] falls back to default path points before flipping if pathPoints is empty | AC-2 | PASS |
| `frontend/src/utils/__tests__/speechBubbleRenderer.test.ts` | [REQ-188/AC-1] reverses order when flipping center/straight line points | AC-1 | PASS |
| `frontend/src/utils/__tests__/speechBubbleRenderer.test.ts` | [REQ-188/AC-2] maps vertical punctuation using verticalCharMap when drawing vertical path text | AC-2 | PASS |
| `frontend/src/utils/__tests__/speechBubbleRenderer.test.ts` | [REQ-188/AC-3] distributes multiple characters within the same step in stepped preset | AC-3 | PASS |
| `frontend/src/utils/__tests__/speechBubbleRenderer.test.ts` | [REQ-188/AC-4] applies proportional advancement when scale varies | AC-4 | PASS |

### REQ-202 (計 1 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx` | [REQ-202/AC-1] should correctly update and remove tags with commonTagOps in handleBulkEditApply | AC-1 | PASS |

### REQ-206 (計 5 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/components/__tests__/SpeechBubbleEditorModal.test.tsx` | [REQ-206/AC-1] supports tail fine-tuning mode toggle and contact reset | AC-1 | PASS |
| `frontend/src/components/__tests__/SpeechBubbleEditorModal.test.tsx` | [REQ-206/AC-2] preserves full tail properties when moving or duplicating bubble | AC-2 | PASS |
| `frontend/src/utils/__tests__/speechBubbleRenderer.test.ts` | [REQ-206/AC-1] clamps tail apex outside bubble boundary | AC-1 | PASS |
| `frontend/src/utils/__tests__/speechBubbleRenderer.test.ts` | [REQ-206/AC-2] calculates 2 contact positions independently and supports legacy options | AC-2 | PASS |
| `frontend/src/utils/__tests__/speechBubbleRenderer.test.ts` | [REQ-206/AC-3] draws 2 contact handles in fine-tuning mode | AC-3 | PASS |

### REQ-216 (計 1 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/components/__tests__/BatchSpeechTransformModal.test.tsx` | [REQ-216/AC-1] renders with modal-backdrop class ensuring mobile safe stacking and padding | AC-1 | PASS |

### REQ-218 (計 2 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx` | [REQ-218/AC-1] should correctly prepend prefix with normalized comma delimiter in handleBulkEditApply | AC-1 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx` | [REQ-218/AC-2] should correctly append suffix with normalized comma delimiter in handleBulkEditApply | AC-2 | PASS |

### REQ-260 (計 5 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `backend/tests/governance/test_vram_guard.py` | test_app_settings_persistence: [REQ-260/AC-1] Test AppSetting persistence and reload logic. | AC-1 | PASS |
| `backend/tests/governance/test_vram_guard.py` | test_get_put_vram_settings: [REQ-260/AC-2] Test GET /api/settings/vram and PUT /api/settings/vram with dynamic threshold update. | AC-2 | PASS |
| `backend/tests/governance/test_vram_guard.py` | test_vram_status_dynamic_threshold: [REQ-260/AC-3] Test dynamic threshold effect on safe flag. | AC-3 | PASS |
| `backend/tests/governance/test_vram_guard.py` | test_ws_broadcast_includes_vram_fields: [REQ-260/AC-4] Verify /api/ws includes vram_free_gb, vram_safe, and vram_min_free_gb in SYSTEM_STATS. | AC-4 | PASS |
| `backend/tests/governance/test_vram_guard.py` | test_vram_recovered_broadcast_event: [REQ-260/AC-5] Verify VRAM_RECOVERED event is broadcast when transitioning from unsafe to safe. | AC-5 | PASS |

### REQ-267 (計 18 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `backend/tests/integration/api/test_snapshots.py` | test_create_and_get_snapshot: [REQ-267/AC-2] POST /api/snapshots creates a snapshot and GET /api/snapshots/{id} retrieves it. | AC-2 | PASS |
| `backend/tests/integration/api/test_snapshots.py` | test_snapshot_delete: [REQ-267/AC-3] DELETE /api/snapshots/{id} removes the snapshot and returns 204. | AC-3 | PASS |
| `backend/tests/integration/models/test_model_relations.py` | test_snapshot_album_and_association_relations: [REQ-267/AC-1][REQ-316/AC-1] Snapshot, Album, AlbumItem, SnapshotLora, and SnapshotTagSet relationships. | AC-1 | PASS |
| `backend/tests/integration/services/test_snapshot_service.py` | test_resolve_internal_comfy_url_rewrites_external_host: [REQ-267/AC-1] resolve_internal_comfy_url rewrites external host to internal comfy base URL. | AC-1 | PASS |
| `backend/tests/integration/services/test_snapshot_service.py` | test_resolve_internal_comfy_url_preserves_non_comfy_urls: [REQ-267/AC-1] resolve_internal_comfy_url preserves non-comfy URLs unchanged. | AC-1 | PASS |
| `backend/tests/integration/services/test_snapshot_service.py` | test_resolve_relative_and_absolute_manager_view_urls_to_upstream_view: [REQ-267/AC-1][REQ-333/AC-1] resolve_internal_comfy_url resolves manager view URLs to upstream view stripping t param. | AC-1 | PASS |
| `backend/tests/integration/services/test_snapshot_service.py` | test_snapshot_service_create_and_query: [REQ-267/AC-1] SnapshotService creates snapshot in SAVEPOINT session and queries it back. | AC-1 | PASS |
| `backend/tests/integration/services/test_snapshot_service.py` | test_create_snapshot_with_external_comfy_url_saves_webp_and_thumbnail: [REQ-267/AC-1][REQ-267/AC-2] SnapshotService downloads external Comfy image and generates webp + thumbnail in isolated sandbox. | AC-1 | PASS |
| `backend/tests/integration/services/test_snapshot_service.py` | test_create_snapshot_downloads_relative_view_without_forwarding_metadata_key: [REQ-267/AC-1] SnapshotService downloads relative /view URL stripping metadata query param 't'. | AC-1 | PASS |
| `backend/tests/integration/services/test_snapshot_service.py` | test_create_snapshot_downloads_absolute_manager_view_url: [REQ-267/AC-1] SnapshotService downloads absolute manager view URL. | AC-1 | PASS |
| `backend/tests/integration/services/test_snapshot_service.py` | test_database_error_cleans_both_downloaded_original_and_thumbnail: [REQ-267/AC-4] Database commit error triggers rollback and cleans up downloaded images from disk. | AC-4 | PASS |
| `backend/tests/integration/services/test_snapshot_service.py` | test_create_snapshot_downloads_generic_external_image_url: [REQ-267/AC-1] SnapshotService downloads generic external image URL. | AC-1 | PASS |
| `backend/tests/integration/services/test_snapshot_service.py` | test_generic_external_download_files_are_cleaned_when_database_commit_fails: [REQ-267/AC-4] Generic external download cleans up files if commit fails. | AC-4 | PASS |
| `backend/tests/integration/services/test_snapshot_service.py` | test_create_snapshot_download_failure_raises_502_and_rolls_back: [REQ-267/AC-4] SnapshotService raises 502 HTTPException when image download fails and creates no DB records. | AC-4 | PASS |
| `backend/tests/integration/services/test_snapshot_service.py` | test_snapshot_service_list_and_filter: [REQ-267/AC-1] SnapshotService.list_snapshots filters by workflow_id, lora_id, tag_set_id. | AC-1 | PASS |
| `frontend/src/pages/__tests__/HistoryPage.test.tsx` | [REQ-267/AC-1] should render thumbnail with toThumbnailUrl fallback when ComfyUI direct URL is present | AC-1 | PASS |
| `frontend/src/pages/__tests__/HistoryPage.test.tsx` | [REQ-267/AC-2] should preserve normal relative thumbnail path when present | AC-2 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useSnapshotActions.test.ts` | [REQ-267/AC-1] should call setErrorToast when snapshotsApi.create fails | AC-1 | PASS |

### REQ-277 (計 1 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx` | [REQ-277/AC-1] ensures handleGenerateSets wires onBeforeGenerate with flushAutoSave | AC-1 | PASS |

### REQ-278 (計 1 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx` | [REQ-278/AC-1] preserves in-memory edited parameters in setSets on preset sync | AC-1 | PASS |

### REQ-286 (計 4 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-286/AC-1] shows speech tone presets by default and allows collapsing the section | AC-1 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-286/AC-2] opens create modal, fills form and submits new tone preset | AC-2 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-286/AC-3] opens edit modal and updates existing tone preset | AC-3 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-286/AC-4] cancels inline tone preset confirmation without mutation and deletes only after explicit confirmation | AC-4 | PASS |

### REQ-291 (計 8 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-291/AC-1] mounts all five tab panels and makes only the selected panel visible and focusable | AC-1 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-291/AC-2] retains an open tone preset draft when switching tabs | AC-2 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-291/AC-3] uses only v2 detail flags and preserves them across tab changes | AC-3 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-291/AC-4] ignores malformed legacy and v2 disclosure data | AC-4 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-291/AC-5] preserves the exact legacy section-expansion value on mount and section toggle | AC-5 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-291/AC-6] keeps the settings page usable when browser storage access is denied | AC-6 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-291/AC-7] subscribes to system stats for the page lifetime and cleans up on unmount | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/SettingsTabBar.test.tsx` | [REQ-291/AC-1][REQ-381/AC-9] renders the five tabs with associated panels and a single roving tab stop | AC-1 | PASS |

### REQ-294 (計 5 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/components/__tests__/SpeechBubbleEditorModal.test.tsx` | [REQ-294/AC-1] default stream API receives progress and advances to review | AC-1 | PASS |
| `frontend/src/components/__tests__/SpeechBubbleEditorModal.test.tsx` | [REQ-294/AC-2] default stream rejection reaches the error and retry UI | AC-2 | PASS |
| `frontend/src/components/__tests__/SpeechBubbleEditorModal.test.tsx` | [REQ-294/AC-3] closing progress cancels the stream and discards its late result | AC-3 | PASS |
| `frontend/src/components/__tests__/SpeechBubbleEditorModal.test.tsx` | [REQ-294/AC-4] 生成結果の選択分だけをキャンバスへ反映する | AC-4 | PASS |
| `frontend/src/components/__tests__/SpeechBubbleEditorModal.test.tsx` | [REQ-294/AC-5] 結果を閉じた場合は生成バブルを反映しない | AC-5 | PASS |

### REQ-304 (計 4 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/components/TagChipEditor/__tests__/TagChip.test.tsx` | [REQ-304/AC-2] applies w-[360px] max-w-[calc(100vw-24px)] class to submenu container | AC-2 | PASS |
| `frontend/src/components/TagChipEditor/__tests__/TagChip.test.tsx` | [REQ-304/AC-2] renders translation button in submenu header | AC-2 | PASS |
| `frontend/src/components/TagChipEditor/__tests__/TagChip.test.tsx` | [REQ-304/AC-3] toggles TagChipTranslationCard when translation button is clicked | AC-3 | PASS |
| `frontend/src/components/TagChipEditor/__tests__/TagChip.test.tsx` | [REQ-304/AC-8] unmounts translation card when parent submenu is closed | AC-8 | PASS |

### REQ-309 (計 58 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/e2e/prod/buildGuard.spec.ts` | [REQ-309/AC-2] build-log-has-no-large-chunk-warning | AC-2 | PASS |
| `frontend/e2e/prod/buildGuard.spec.ts` | [REQ-309/AC-2] config-has-no-suppression | AC-2 | PASS |
| `frontend/e2e/prod/buildGuard.spec.ts` | [REQ-309/AC-2] all-js-chunks-below-limit | AC-2 | PASS |
| `frontend/e2e/prod/buildGuard.spec.ts` | [REQ-309/AC-1] initial-graph-excludes-lazy-boundaries | AC-1 | PASS |
| `frontend/e2e/prod/failure.spec.ts` | [REQ-309/AC-5] route-chunk-abort-${r} | AC-5 | PASS |
| `frontend/e2e/prod/failure.spec.ts` | [REQ-309/AC-5] navigate-while-chunk-delayed | AC-5 | PASS |
| `frontend/e2e/prod/failure.spec.ts` | [REQ-309/AC-3] modal-chunk-abort-${m} | AC-3 | PASS |
| `frontend/e2e/prod/failure.spec.ts` | [REQ-309/AC-5] stale-chunk-after-redeploy | AC-5 | PASS |
| `frontend/e2e/prod/generate.spec.ts` | [REQ-309/AC-3] prompt-edit-keeps-value-${vp} | AC-3 | PASS |
| `frontend/e2e/prod/generate.spec.ts` | [REQ-309/AC-4] checkpoint-select-and-generate | AC-4 | PASS |
| `frontend/e2e/prod/generate.spec.ts` | [REQ-309/AC-3] modals-open-close-reopen-${m.name} | AC-3 | PASS |
| `frontend/e2e/prod/generate.spec.ts` | [REQ-309/AC-3] viewport-switch-keeps-prompt-and-modals | AC-3 | PASS |
| `frontend/e2e/prod/initialJsCompare.spec.ts` | [REQ-309/AC-1] compare-before-after-${vp} | AC-1 | PASS |
| `frontend/e2e/prod/initialJsTransfer.spec.ts` | [REQ-309/AC-1] ${caseId} | AC-1 | PASS |
| `frontend/e2e/prod/routes.spec.ts` | [REQ-309/AC-5] route-operable-${r} | AC-5 | PASS |
| `frontend/e2e/prod/routes.spec.ts` | [REQ-309/AC-5] history-items-browsable | AC-5 | PASS |
| `frontend/e2e/prod/routes.spec.ts` | [REQ-309/AC-6] settings-items-browsable | AC-6 | PASS |
| `frontend/e2e/prod/routes.spec.ts` | [REQ-309/AC-5] all-routes-tour-no-errors | AC-5 | PASS |
| `frontend/e2e/prod/routes.spec.ts` | [REQ-309/AC-6] leave-guard-lazy-cancel | AC-6 | PASS |
| `frontend/e2e/prod/routes.spec.ts` | [REQ-309/AC-6] leave-guard-lazy-discard | AC-6 | PASS |
| `frontend/src/__tests__/App.persistence.test.tsx` | [REQ-309/AC-5] restore-completes-while-lazy-chunk-pending | AC-5 | PASS |
| `frontend/src/__tests__/App.routing.test.tsx` | [REQ-309/AC-1] initial-route-loads-only-generate | AC-1 | PASS |
| `frontend/src/__tests__/App.routing.test.tsx` | [REQ-309/AC-5] direct-entry-${route.key} | AC-5 | PASS |
| `frontend/src/__tests__/App.routing.test.tsx` | [REQ-309/AC-5] route-preserved-${route.key} | AC-5 | PASS |
| `frontend/src/__tests__/App.routing.test.tsx` | [REQ-309/AC-5] history-route-lazy-visible | AC-5 | PASS |
| `frontend/src/__tests__/App.routing.test.tsx` | [REQ-309/AC-6] settings-route-lazy-visible | AC-6 | PASS |
| `frontend/src/__tests__/App.routing.test.tsx` | [REQ-309/AC-3] initial-route-shows-fallback-then-content | AC-3 | PASS |
| `frontend/src/__tests__/App.routing.test.tsx` | [REQ-309/AC-5] chunk-load-failure-${route.key} | AC-5 | PASS |
| `frontend/src/__tests__/App.routing.test.tsx` | [REQ-309/AC-5] navigate-during-lazy-load | AC-5 | PASS |
| `frontend/src/__tests__/App.routing.test.tsx` | [REQ-309/AC-6] leave-guard-blocks-before-lazy-fetch | AC-6 | PASS |
| `frontend/src/__tests__/App.routing.test.tsx` | [REQ-309/AC-6] leave-guard-cancel-keeps-draft | AC-6 | PASS |
| `frontend/src/__tests__/App.routing.test.tsx` | [REQ-309/AC-6] leave-guard-discard-then-lazy-load | AC-6 | PASS |
| `frontend/src/__tests__/App.routing.test.tsx` | [REQ-309/AC-6] leave-guard-inflight-disables-discard | AC-6 | PASS |
| `frontend/src/__tests__/App.routing.test.tsx` | [REQ-309/AC-6] leave-guard-pop | AC-6 | PASS |
| `frontend/src/__tests__/App.routing.test.tsx` | [REQ-309/AC-6] leave-guard-beforeunload | AC-6 | PASS |
| `frontend/src/__tests__/App.routing.test.tsx` | [REQ-309/AC-6] leave-guard-same-settings-allowed | AC-6 | PASS |
| `frontend/src/__tests__/App.routing.test.tsx` | [REQ-309/AC-6] leave-guard-direct-entry | AC-6 | PASS |
| `frontend/src/__tests__/App.routing.test.tsx` | [REQ-309/AC-6] leave-guard-not-armed-while-chunk-pending | AC-6 | PASS |
| `frontend/src/components/common/__tests__/LazyBoundary.test.tsx` | [REQ-309/AC-1] latch-not-loaded-until-open | AC-1 | PASS |
| `frontend/src/components/common/__tests__/LazyBoundary.test.tsx` | [REQ-309/AC-3] latch-keeps-mounted-after-close | AC-3 | PASS |
| `frontend/src/components/common/__tests__/LazyBoundary.test.tsx` | [REQ-309/AC-3] while-open-unmounts-on-close | AC-3 | PASS |
| `frontend/src/components/common/__tests__/LazyBoundary.test.tsx` | [REQ-309/AC-3] close-while-loading | AC-3 | PASS |
| `frontend/src/components/common/__tests__/LazyBoundary.test.tsx` | [REQ-309/AC-3] rapid-toggle | AC-3 | PASS |
| `frontend/src/components/common/__tests__/LazyBoundary.test.tsx` | [REQ-309/AC-3] load-failure-local-alert | AC-3 | PASS |
| `frontend/src/components/common/__tests__/LazyBoundary.test.tsx` | [REQ-309/AC-3] non-chunk-error-propagates | AC-3 | PASS |
| `frontend/src/components/common/__tests__/LazyBoundary.test.tsx` | [REQ-309/AC-3] host-state-machine-properties | AC-3 | PASS |
| `frontend/src/pages/GeneratePage/__tests__/GeneratePage.test.tsx` | [REQ-309/AC-1] closed-modals-not-loaded: initial render evaluates none of the 10 modal modules | AC-1 | PASS |
| `frontend/src/pages/GeneratePage/__tests__/GeneratePage.test.tsx` | [REQ-309/AC-3] lazy-modal-open-close-keeps-prompt: prompt value survives opening and closing the job modal | AC-3 | PASS |
| `frontend/src/pages/GeneratePage/__tests__/GeneratePage.test.tsx` | [REQ-309/AC-3] modal-open-close-while-loading: fallback shows while the chunk is pending and no duplicate mounts after it resolves | AC-3 | PASS |
| `frontend/src/pages/GeneratePage/__tests__/GeneratePage.test.tsx` | [REQ-309/AC-3] modal-load-failure-keeps-prompt: chunk failure shows a local alert and keeps the prompt and Generate screen | AC-3 | PASS |
| `frontend/src/pages/GeneratePage/__tests__/GeneratePage.test.tsx` | [REQ-309/AC-3] latch-modal-state-lifetime-preserved: AddSnapshotToAlbumModal resets per open; JobManagementModal clears confirmation on close | AC-3 | PASS |
| `frontend/src/pages/GeneratePage/__tests__/GeneratePage.test.tsx` | [REQ-309/AC-4] selected-checkpoint-submitted-after-lazy-load: the checkpoint chosen in the UI is the ckpt_name sent to the batch API | AC-4 | PASS |
| `frontend/src/pages/GeneratePage/sections/__tests__/GenerateModalsOverlay.test.tsx` | [REQ-309/AC-1] closed-overlay-modals-not-loaded | AC-1 | PASS |
| `frontend/src/pages/GeneratePage/sections/__tests__/GenerateModalsOverlay.test.tsx` | [REQ-309/AC-3] copy-dialog-and-toast-stay-synchronous | AC-3 | PASS |
| `frontend/src/pages/GeneratePage/sections/__tests__/GenerateModalsOverlay.test.tsx` | [REQ-309/AC-3] overlay-modal-lazy-open-translation | AC-3 | PASS |
| `frontend/src/pages/GeneratePage/sections/__tests__/GenerateModalsOverlay.test.tsx` | [REQ-309/AC-3] overlay-modal-lazy-open-translation-empty-fixture | AC-3 | PASS |
| `frontend/src/pages/GeneratePage/sections/__tests__/GenerateModalsOverlay.test.tsx` | [REQ-309/AC-3] overlay-load-failure-local-alert | AC-3 | PASS |
| `frontend/src/pages/GeneratePage/sections/__tests__/GenerateModalsOverlay.test.tsx` | [REQ-309/AC-3] overlay-close-while-loading | AC-3 | PASS |

### REQ-314 (計 2 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-314/AC-1] keeps hash as the selected-tab source and synchronizes tab history and storage | AC-1 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-314/AC-2] starts prompt details closed and keeps an unsaved prompt edit across tab navigation | AC-2 | PASS |

### REQ-316 (計 13 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `backend/tests/integration/api/test_snapshots.py` | test_snapshot_association_types_update: [REQ-316/AC-2] PATCH /api/snapshots/{id} updates associations without changing generation facts. | AC-2 | PASS |
| `backend/tests/integration/api/test_snapshots.py` | test_snapshot_association_empty_clears_independently: [REQ-316/AC-3] Empty list clears only requested association type independently. | AC-3 | PASS |
| `backend/tests/integration/api/test_snapshots.py` | test_snapshot_association_only_role_isolation: [REQ-316/AC-4] Association-only role does not alter snapshot lora role or strength. | AC-4 | PASS |
| `backend/tests/integration/api/test_snapshots.py` | test_snapshot_record_remains_independent_after_prompt_metadata_deletion: [REQ-316/AC-1] Snapshot recorded metadata remains independent after prompt metadata deletion. | AC-1 | PASS |
| `backend/tests/integration/legacy/test_prompt_metadata.py` | test_save_and_get_prompt_metadata: [REQ-316/AC-2] POST /api/prompt-metadata saves metadata and GET /api/prompt-metadata/{prompt_id} retrieves it. | AC-2 | PASS |
| `backend/tests/integration/legacy/test_prompt_metadata.py` | test_upsert_prompt_metadata: [REQ-316/AC-3] POST /api/prompt-metadata updates existing prompt metadata (upsert). | AC-3 | PASS |
| `backend/tests/integration/legacy/test_prompt_metadata.py` | test_get_not_found: [REQ-316/AC-4] GET /api/prompt-metadata/{prompt_id} returns 404 when not found. | AC-4 | PASS |
| `backend/tests/integration/legacy/test_prompt_metadata.py` | test_req316_full_unicode_record_and_json_roundtrip: [REQ-316/AC-1] Full unicode prompt record and JSON roundtrip. | AC-1 | PASS |
| `frontend/src/components/__tests__/HistoryModalPreview.test.tsx` | [REQ-316/AC-1] treats empty saved params as authoritative and offers info even with missing metadata | AC-1 | PASS |
| `frontend/src/components/__tests__/HistoryModalPreview.test.tsx` | [REQ-316/AC-2] locks the image and close/navigation while saving tag associations | AC-2 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useSnapshotActions.test.ts` | [REQ-316/AC-1] keeps unrecorded params empty if server API fails | AC-1 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useSnapshotActions.test.ts` | [REQ-316/AC-2] saves each image from its own frozen record and initializes known trigger associations | AC-2 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useWorkflowParams.test.ts` | [REQ-316/AC-1] excludes both reserved keys from restored inputs, including unknown records | AC-1 | PASS |

### REQ-319 (計 5 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `backend/tests/unit/test_helpers.py` | test_speech_parser_is_valid_structured_response_tags: [REQ-319/AC-1] Speech parser recognizes valid XML-tagged dialogue output. | AC-1 | PASS |
| `backend/tests/unit/test_helpers.py` | test_speech_parser_is_valid_structured_response_json: [REQ-319/AC-1] Speech parser recognizes markdown JSON block dialogue output. | AC-1 | PASS |
| `backend/tests/unit/test_helpers.py` | test_speech_parser_is_valid_structured_response_invalid: [REQ-319/AC-1] Speech parser rejects invalid, empty, or plain text outputs. | AC-1 | PASS |
| `backend/tests/unit/test_helpers.py` | test_speech_parser_extracts_dialogue_and_metadata: [REQ-319/AC-2] Speech parser extracts dialogue, interpretation, and reasoning fields. | AC-2 | PASS |
| `backend/tests/unit/test_helpers.py` | test_speech_parser_strips_think_tags: [REQ-319/AC-2] Speech parser strips reasoning think tags before extracting dialogue. | AC-2 | PASS |

### REQ-321 (計 2 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/pages/DatasetStudioPage/__tests__/MatrixGenerationStep.test.tsx` | [REQ-321/AC-1] remaps and saves mappings when workflow initially has empty mappings, and updates node badges from fresh workflow | AC-1 | PASS |
| `frontend/src/pages/DatasetStudioPage/__tests__/MatrixGenerationStep.test.tsx` | [REQ-321/AC-2] displays error message and keeps modal open when workflowsApi.update fails | AC-2 | PASS |

### REQ-323 (計 1 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/pages/GeneratePage/__tests__/GeneratePage.test.tsx` | [REQ-323/AC-1] locks autosave before initial sync completes and preserves prompt without destructive empty save on server restart | AC-1 | PASS |

### REQ-330 (計 2 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/pages/DatasetStudioPage/__tests__/MatrixGenerationStep.test.tsx` | [REQ-330/AC-1] displays an error when batch acceptance fails | AC-1 | PASS |
| `frontend/src/pages/DatasetStudioPage/__tests__/MatrixGenerationStep.test.tsx` | [REQ-330/AC-2] reports server generation rejection without per-item POSTs | AC-2 | PASS |

### REQ-331 (計 3 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/pages/DatasetStudioPage/__tests__/useStudioStore.test.ts` | [REQ-331/AC-1] manages paramValues state | AC-1 | PASS |
| `frontend/src/pages/DatasetStudioPage/__tests__/useStudioStore.test.ts` | [REQ-331/AC-2] manages bypassedNodeIds state | AC-2 | PASS |
| `frontend/src/pages/DatasetStudioPage/__tests__/useStudioStore.test.ts` | [REQ-331/AC-3] clears paramValues and bypassedNodeIds on resetStudio | AC-3 | PASS |

### REQ-332 (計 11 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/pages/GeneratePage/__tests__/apiCacheStorage.test.tsx` | [REQ-332/AC-1] removes the legacy value and measures remaining localStorage in the visible gauge | AC-1 | PASS |
| `frontend/src/pages/GeneratePage/__tests__/apiCacheStorage.test.tsx` | [REQ-332/AC-15] excludes a stale preset until the server returns its latest value | AC-15 | PASS |
| `frontend/src/pages/GeneratePage/__tests__/apiCacheStorage.test.tsx` | [REQ-332/AC-18] refreshed list survives restart while next fetch is held | AC-18 | PASS |
| `frontend/src/pages/GeneratePage/__tests__/apiCacheStorage.test.tsx` | [REQ-332/AC-2] updates workflows with an exact 4 MiB UTF-16 byte-equivalent payload | AC-2 | PASS |
| `frontend/src/pages/GeneratePage/__tests__/apiCacheStorage.test.tsx` | [REQ-332/AC-10] desktop generation stays disabled until workflow 7 is fetched | AC-10 | PASS |
| `frontend/src/pages/GeneratePage/__tests__/apiCacheStorage.test.tsx` | [REQ-332/AC-13] same-tab restart restores every Studio field independently of API cache migration | AC-13 | PASS |
| `frontend/src/pages/GeneratePage/__tests__/queryCacheRecovery.test.tsx` | [REQ-332/AC-3] 31 submissions succeed without a metadata-prune notification | AC-3 | PASS |
| `frontend/src/pages/GeneratePage/__tests__/queryCacheRecovery.test.tsx` | [REQ-332/AC-4] every one of the newest 30 IDs retains its distinct record fields | AC-4 | PASS |
| `frontend/src/pages/GeneratePage/__tests__/queryCacheRecovery.test.tsx` | [REQ-332/AC-11] read rejection server fallback | AC-11 | PASS |
| `frontend/src/pages/GeneratePage/__tests__/queryCacheRecovery.test.tsx` | [REQ-332/AC-16] interrupted first migration leaves no snapshot and retry queues once | AC-16 | PASS |
| `frontend/src/pages/GeneratePage/__tests__/queryCacheRecovery.test.tsx` | [REQ-332/AC-17] deleting only the IDB database preserves browser storage and allows a server retry | AC-17 | PASS |

### REQ-334 (計 7 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `backend/tests/integration/api/test_presets.py` | test_preset_applied_assets_roundtrip: [REQ-334/AC-1] Preset applied assets persist across PUT and GET. | AC-1 | PASS |
| `backend/tests/unit/test_helpers.py` | test_replacement_rules_longest_first_and_non_cascading: [REQ-334/AC-9] Replacement rules are applied literal, longest first, and non-cascading. | AC-9 | PASS |
| `backend/tests/unit/test_helpers.py` | test_replacement_rules_empty_rules_or_text: [REQ-334/AC-9] Replacement rules handle empty text or empty rules gracefully. | AC-9 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-334/AC-1] keeps VRAM and thumbnail ratio under separate section headings | AC-1 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-334/AC-2] shows success only after save resolves and reports the exact success message | AC-2 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-334/AC-3] preserves a failed draft across query refresh and shows the reason and unsaved state | AC-3 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-334/AC-4] does not let an older in-flight save overwrite a newer draft | AC-4 | PASS |

### REQ-335 (計 69 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `backend/tests/integration/legacy/test_generation_api.py` | test_release_endpoint_contract_validation_and_typed_503: [REQ-335/AC-3] POST /api/generation/release returns ReleaseOperation, validates input, and returns typed 503 on failure. | AC-3 | PASS |
| `backend/tests/integration/legacy/test_generation_api.py` | test_cancel_endpoints_return_202_when_unconfirmed_items_remain: [REQ-335/AC-2] Bulk cancel returns 202 and reports unconfirmed items when unconfirmed records remain in scope. | AC-2 | PASS |
| `backend/tests/integration/legacy/test_generation_integration.py` | test_released_unconfirmed_survives_backend_restart_without_resubmission: [REQ-335/AC-3] A released unconfirmed record stays released after a backend restart and is never resubmitted. | AC-3 | PASS |
| `backend/tests/integration/legacy/test_generation_integration.py` | test_restart_converts_orphaned_submissions_to_unconfirmed_and_never_resubmits: [REQ-335/AC-1] Startup recovery converts orphaned queued/submitting rows to unconfirmed, idempotently, without upstream POST. | AC-1 | PASS |
| `backend/tests/integration/legacy/test_generation_integration.py` | test_recovered_unconfirmed_can_be_released_and_stays_released_after_restart: [REQ-335/AC-3] A recovered unconfirmed record is released with skipped_no_identity and stays released after restart. | AC-3 | PASS |
| `backend/tests/integration/legacy/test_generation_integration.py` | test_new_generation_completes_after_comfy_outage_with_unconfirmed_present: [REQ-335/AC-4] After a ComfyUI outage leaves an unconfirmed record, a new generation is submitted once and completes. | AC-4 | PASS |
| `backend/tests/integration/legacy/test_generation_jobs_migration.py` | test_step_032_adds_release_json_idempotently_and_preserves_rows: [REQ-335/AC-3] step_032 adds release_json to an existing 027 table, idempotently, keeping rows. | AC-3 | PASS |
| `backend/tests/integration/legacy/test_generation_repository.py` | test_unconfirmed_does_not_hold_normal_group_open: [REQ-335/AC-4] An unconfirmed normal job must not keep the normal group open for new acceptance. | AC-4 | PASS |
| `backend/tests/integration/legacy/test_generation_repository.py` | test_release_unconfirmed_is_compare_and_set_and_idempotent: [REQ-335/AC-3] release_unconfirmed is a CAS unconfirmed -> released, bumps revision once, keeps failure. | AC-3 | PASS |
| `backend/tests/integration/legacy/test_generation_repository.py` | test_released_is_terminal_and_survives_prune_with_independent_cap: [REQ-335/AC-3] released rows are terminal and pruned only by their own cap, never by the normal terminal cap. | AC-3 | PASS |
| `backend/tests/integration/legacy/test_generation_repository.py` | test_annotate_late_identity_keeps_released_status: [REQ-335/AC-5] A late prompt_id is attached to a released row without changing its status. | AC-5 | PASS |
| `backend/tests/integration/legacy/test_generation_repository.py` | test_job_view_tolerates_malformed_release_json: [REQ-335/AC-3] A malformed release_json is read as release=None instead of failing the snapshot. | AC-3 | PASS |
| `backend/tests/integration/legacy/test_generation_repository.py` | test_property_release_and_transitions_preserve_non_unconfirmed_rows: [REQ-335/AC-3] Random transitions keep terminal rows unchanged, release idempotently, and keep revision monotonic. | AC-3 | PASS |
| `backend/tests/integration/legacy/test_generation_schema.py` | test_release_contract_and_job_status_released: [REQ-335/AC-3] released is a JobStatus; release DTOs enforce 1..50 unique ids; JobView.release defaults to None. | AC-3 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_unconfirmed_job_keeps_failure_reason_and_is_not_queued_in_snapshot: [REQ-335/AC-1] A lost upstream POST stays unconfirmed with its reason and is never resubmitted. | AC-1 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_single_cancel_of_unconfirmed_without_prompt_id_is_unconfirmed_not_already_terminal: [REQ-335/AC-2] Cancelling an unconfirmed job without prompt_id reports unconfirmed and calls nothing upstream. | AC-2 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_single_cancel_of_unconfirmed_with_pending_prompt_follows_confirmed_cancel_flow: [REQ-335/AC-2] An unconfirmed job whose prompt is still pending follows the confirmed cancel flow. | AC-2 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_single_cancel_of_unconfirmed_absent_from_queue_stays_unconfirmed: [REQ-335/AC-2] Absence from the queue does not confirm cancellation of an unconfirmed job. | AC-2 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_cancel_queued_and_cancel_unsubmitted_never_report_already_terminal_for_unconfirmed: [REQ-335/AC-2] cancel_queued and cancel_unsubmitted report unconfirmed, never already_terminal. | AC-2 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_bulk_cancel_reports_leftover_unconfirmed_items_per_scope: [REQ-335/AC-2] Bulk cancel lists leftover unconfirmed items within its scope only. | AC-2 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_cancel_of_released_record_is_not_cancelled_and_calls_nothing_upstream: [REQ-335/AC-3] A released record is reported not_cancelled and no upstream call is made. | AC-3 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_reconcile_adopts_upstream_state_for_unconfirmed_with_prompt_id: [REQ-335/AC-5] Reconcile moves an unconfirmed job with prompt_id to the upstream-confirmed state. | AC-5 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_reconcile_unconfirmed_without_conclusion_is_noop_without_revision_churn: [REQ-335/AC-5] An unconfirmed job with no new conclusion causes no revision bump or publish. | AC-5 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_event_for_unconfirmed_with_prompt_id_resumes_running: [REQ-335/AC-5] An execution_start event for an unconfirmed job with prompt_id resumes it to running. | AC-5 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_new_generation_completes_while_unconfirmed_exists_without_resubmission: [REQ-335/AC-4] A new generation is submitted once while an older unconfirmed job remains untouched. | AC-4 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_single_cancel_of_unconfirmed_never_touches_unrelated_jobs: [REQ-335/AC-4] Cancelling an unconfirmed job leaves unrelated queued jobs and upstream untouched. | AC-4 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_startup_recovery_converts_orphaned_queued_and_submitting_without_prompt_id_to_unconfirmed: [REQ-335/AC-1] After restart, orphaned queued/submitting rows without prompt_id become unconfirmed, never resent. | AC-1 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_startup_recovery_touches_only_orphaned_submissions_exhaustive: [REQ-335/AC-1][REQ-335/AC-4] Only queued/submitting rows without prompt_id are recovered; all others are unchanged. | AC-1 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_startup_recovery_leaves_genuinely_pending_job_unconverted: [REQ-335/AC-4] A job accepted in this process (in _pending) is not converted by startup recovery. | AC-4 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_startup_recovery_is_idempotent_and_does_not_churn_revision: [REQ-335/AC-1] Repeated starts convert once; later starts neither bump revision nor publish. | AC-1 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_startup_recovery_runs_without_upstream_even_when_comfyui_is_down: [REQ-335/AC-1] Recovery completes without any upstream call even when ComfyUI queue reads fail. | AC-1 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_startup_recovery_failure_is_nonfatal_and_retried_by_worker: [REQ-335/AC-1] A failing commit does not fail start(); the worker retries and converts only the remaining row. | AC-1 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_same_process_restart_keeps_genuinely_pending_jobs_and_submits_once: [REQ-335/AC-4] Stop/start in the same process keeps vram-blocked pending jobs and submits them once. | AC-4 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_new_generation_after_startup_recovery_opens_new_group_and_submits_once: [REQ-335/AC-4] After recovery, a new generation opens a new normal group and is submitted once. | AC-4 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_request_replay_after_startup_recovery_does_not_requeue_or_resubmit: [REQ-335/AC-4] Replaying the same request after recovery returns the same jobs and submits nothing. | AC-4 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_cancel_of_startup_recovered_unconfirmed_reports_unconfirmed_without_upstream_calls: [REQ-335/AC-2] Cancelling a startup-recovered unconfirmed job reports unconfirmed with no upstream calls. | AC-2 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_release_makes_no_upstream_calls_and_publishes_once: [REQ-335/AC-3] Releasing a prompt-less unconfirmed record makes no upstream call and publishes once. | AC-3 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_release_only_affects_unconfirmed_and_reports_each_item: [REQ-335/AC-3] A mixed release request reports each item's outcome and leaves non-unconfirmed rows unchanged. | AC-3 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_cancel_or_release_of_unconfirmed_never_touches_unrelated_jobs: [REQ-335/AC-4] Releasing or cancelling an unconfirmed record leaves queued/running jobs and upstream calls unchanged. | AC-4 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_release_with_prompt_id_checks_upstream_and_refuses_when_active: [REQ-335/AC-5] A release with prompt_id re-checks upstream once and refuses when upstream became active. | AC-5 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_late_binding_after_release_annotates_identity_without_changing_status: [REQ-335/AC-5] A late prompt binding after release annotates prompt_id and late_prompt_id without changing status. | AC-5 | PASS |
| `frontend/src/api/domains/__tests__/generation.test.ts` | [REQ-335/AC-1] decodes released status and optional release record, rejecting unknown statuses | AC-1 | PASS |
| `frontend/src/api/domains/__tests__/generation.test.ts` | [REQ-335/AC-3] releaseJobs posts explicit job_ids and decodes ReleaseOperation | AC-3 | PASS |
| `frontend/src/components/__tests__/JobManagementModal.test.tsx` | [REQ-335/AC-1] shows 状態未確認 section separately from 待機中 and never labels it 待機中 | AC-1 | PASS |
| `frontend/src/components/__tests__/JobManagementModal.test.tsx` | [REQ-335/AC-2] single cancel of an unconfirmed row shows the unconfirmed message and keeps the row | AC-2 | PASS |
| `frontend/src/components/__tests__/JobManagementModal.test.tsx` | [REQ-335/AC-2] bulk result with unconfirmed leftovers keeps the modal open with confirmed/unconfirmed counts | AC-2 | PASS |
| `frontend/src/components/__tests__/JobManagementModal.test.tsx` | [REQ-335/AC-3] release requires confirmation that states it is not an upstream cancellation and reports per-item outcome | AC-3 | PASS |
| `frontend/src/components/__tests__/JobManagementModal.test.tsx` | [REQ-335/AC-1] RT-12 renders hostile HTML-like reason, set name, excerpt and ids as literal escaped text | AC-1 | PASS |
| `frontend/src/components/__tests__/JobManagementModal.test.tsx` | [REQ-335/AC-1] RT-12 keeps very long unbroken reason, excerpt and ids wrapped or truncated inside width-bounded rows | AC-1 | PASS |
| `frontend/src/components/__tests__/JobManagementModal.test.tsx` | [REQ-335/AC-3] RT-12 keeps the release dialog and result messages escaped and non-echoing for hostile ids and upstream messages | AC-3 | PASS |
| `frontend/src/pages/GeneratePage/__tests__/generationQueueSync.test.ts` | [REQ-335/AC-4] new generation proceeds while an unconfirmed record exists and queued clear does not touch it | AC-4 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/GenerationProgress.test.tsx` | [REQ-335/AC-1] unconfirmed-only normal group is not shown as waiting or in progress and the queue button shows the unconfirmed count | AC-1 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/GenerationProgress.test.tsx` | [REQ-335/AC-1] completed jobs plus an unconfirmed job still show 完了 with the unconfirmed chip | AC-1 | PASS |
| `frontend/src/store/__tests__/slices/connectionSlice.test.ts` | [REQ-335/AC-1] unconfirmed-only snapshot yields isGenerating=false and no active prompt | AC-1 | PASS |
| `frontend/src/store/__tests__/slices/connectionSlice.test.ts` | [REQ-335/AC-3] transition to released raises neither failure toast nor auto-follow image | AC-3 | PASS |
| `frontend/src/store/__tests__/slices/jobQueueSlice.test.ts` | [REQ-335/AC-1] projectQueue does not place unconfirmed jobs in queuePending and exposes upstream items of unconfirmed prompts | AC-1 | PASS |
| `frontend/src/store/__tests__/slices/jobQueueSlice.test.ts` | [REQ-335/AC-1] projectQueue treats released jobs like unconfirmed for projection | AC-1 | PASS |
| `frontend/src/store/__tests__/slices/jobQueueSlice.test.ts` | [REQ-335/AC-2] cancelJob propagates unconfirmed outcome without treating it as success | AC-2 | PASS |
| `frontend/src/store/__tests__/slices/jobQueueSlice.test.ts` | [REQ-335/AC-3] releaseUnconfirmed sends only given ids then refetches state | AC-3 | PASS |
| `frontend/src/store/__tests__/slices/jobQueueSlice.test.ts` | [REQ-335/AC-3] releaseUnconfirmed with empty ids does not call the API | AC-3 | PASS |
| `frontend/src/store/__tests__/slices/jobQueueSlice.test.ts` | [REQ-335/AC-3] releaseUnconfirmed splits 51 ids into two requests | AC-3 | PASS |
| `frontend/src/store/__tests__/slices/jobQueueSlice.test.ts` | [REQ-335/AC-4] fetchQueue does not keep activeBatch open for an unconfirmed item | AC-4 | PASS |
| `frontend/src/store/__tests__/slices/jobQueueSlice.test.ts` | [REQ-335/AC-5] unconfirmed that gains a prompt_id and becomes running moves to the running queue | AC-5 | PASS |
| `frontend/src/utils/__tests__/generationSelectors.test.ts` | [REQ-335/AC-1] counts queued, submitting and running blockers but ignores terminal, unconfirmed and released rows | AC-1 | PASS |
| `frontend/src/utils/__tests__/generationSelectors.test.ts` | [REQ-335/AC-1] excludes unconfirmed and released from normal N, F and wait counts | AC-1 | PASS |
| `frontend/src/utils/__tests__/generationSelectors.test.ts` | [REQ-335/AC-1] selectUnconfirmedJobs returns out-of-group rows and honours the session filter | AC-1 | PASS |
| `frontend/src/utils/__tests__/generationSelectors.test.ts` | [REQ-335/AC-1] selectReleasedJobs sorts newest first and applies the limit | AC-1 | PASS |
| `frontend/src/utils/__tests__/generationSelectors.test.ts` | [REQ-335/AC-4] unconfirmed rows never count as blockers for another scope wait | AC-4 | PASS |
| `frontend/src/utils/__tests__/generationSelectors.test.ts` | [REQ-335/AC-1] property: progress invariants hold for arbitrary status multisets | AC-1 | PASS |

### REQ-336 (計 10 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `backend/tests/integration/models/test_migrations.py` | test_legacy_data_migration_step_029: [REQ-336/AC-5] Step_029 migrates legacy mapping_master and workflow_mappings to normalized structure. | AC-5 | PASS |
| `backend/tests/integration/models/test_migrations.py` | test_step_029_idempotency: [REQ-336/AC-5] Step_029 is idempotent and safe when executed multiple times. | AC-5 | PASS |
| `backend/tests/integration/models/test_migrations.py` | test_step_029_atomic_rollback_on_failure: [REQ-336/AC-5] Red Teaming: verify that if a failure happens during step_029, changes are rolled back cleanly. | AC-5 | PASS |
| `backend/tests/integration/models/test_migrations.py` | test_seeder_initial_data_creates_groups_stages_masters_variants: [REQ-336/AC-5] Seeder populates groups, stages, masters, and default variants on fresh DB. | AC-5 | PASS |
| `backend/tests/integration/models/test_migrations.py` | test_legacy_database_full_migration: [REQ-336/AC-5] Legacy schema is fully upgraded with all modern columns and constraints while retaining data. | AC-5 | PASS |
| `backend/tests/integration/models/test_model_relations.py` | test_mapping_models_definitions_and_computed_role: [REQ-336/AC-1] MappingGroupMaster, StageMaster, MappingMaster, MappingVariant model relationships and computed_role. | AC-1 | PASS |
| `backend/tests/integration/services/test_mapping_service.py` | test_preview_cascade: [REQ-336/AC-1] MappingService.preview_cascade calculates affected variants, presets, and snapshots. | AC-1 | PASS |
| `backend/tests/integration/services/test_mapping_service.py` | test_execute_cascade_rename: [REQ-336/AC-2] MappingService.execute_cascade_rename updates variants, presets, snapshots, and records previous suffixes. | AC-2 | PASS |
| `backend/tests/integration/services/test_mapping_service.py` | test_previous_suffixes_cap_at_10: [REQ-336/AC-3] MappingService caps previous_suffixes history at 10 entries across multiple cascade renames. | AC-3 | PASS |
| `backend/tests/integration/services/test_mapping_service.py` | test_validate_stage_deletion_guards: [REQ-336/AC-4] MappingService.validate_stage_deletion guards against deleting builtin stages and active stages with usages. | AC-4 | PASS |

### REQ-338 (計 4 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/components/TagChipEditor/__tests__/TagChip.test.tsx` | [REQ-338/AC-5] applies touch-manipulation, active scale, compact hit-slop, and focus ring to TagChip | AC-5 | PASS |
| `frontend/src/components/TagChipEditor/__tests__/TagChip.test.tsx` | [REQ-338/AC-5] opens submenu when clicking chip body / hit-slop outside text | AC-5 | PASS |
| `frontend/src/components/TagChipEditor/__tests__/TagChip.test.tsx` | [REQ-338/AC-5] disables active scale and hit-slop while in editing mode | AC-5 | PASS |
| `frontend/src/components/TagChipEditor/__tests__/TagChip.test.tsx` | [REQ-338/AC-5] TagChipViewer applies compact hit-slop, touch-manipulation, and handles proximity hit snap | AC-5 | PASS |

### REQ-342 (計 1 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/pages/DatasetStudioPage/components/__tests__/NodeRemapModal.test.tsx` | [REQ-342/AC-1] TC-COMP-03: renders candidate node options in parameter dropdown using unified format | AC-1 | PASS |

### REQ-346 (計 127 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/e2e/headerHoverCard.spec.ts` | [REQ-346/AC-1] A4 hover card opens below the header bottom without pushing the layout ${tag} | AC-1 | PASS |
| `frontend/e2e/headerHoverCard.spec.ts` | [REQ-346/AC-2] A4 hover continuity: moving the real pointer from the monitor through the gap into the card keeps it open ${tag} | AC-2 | PASS |
| `frontend/e2e/headerHoverCard.spec.ts` | [REQ-346/AC-4] A4 closes when the pointer leaves, when pressing outside, and has no click toggle ${tag} | AC-4 | PASS |
| `frontend/e2e/headerHoverCard.spec.ts` | [REQ-346/AC-5] A4 hover card stays inside the viewport and is not covered ${tag} | AC-5 | PASS |
| `frontend/e2e/headerHoverCard.spec.ts` | [REQ-346/AC-3] A4 hover card scrolls inside the viewport-capped height and the last row is reachable @1024x768 | AC-3 | PASS |
| `frontend/e2e/headerHoverCard.spec.ts` | [REQ-346/AC-6] A4 recomputes after resize while hovered and is hidden below 640px @1280x800 | AC-6 | PASS |
| `frontend/e2e/headerHoverCard.spec.ts` | [REQ-346/AC-1] A4 is not shown at 639px (A3 pill is responsible) @639x667 | AC-1 | PASS |
| `frontend/e2e/headerHoverCard.spec.ts` | [REQ-346/AC-3] A4 auto-closes when the remaining height is below 96px @1024x768 | AC-3 | PASS |
| `frontend/e2e/headerHoverCard.spec.ts` | [REQ-346/AC-4] rapid hover in/out ten times leaves no orphan panel @1024x768 | AC-4 | PASS |
| `frontend/e2e/headerHoverCard.spec.ts` | [REQ-346/AC-4] opening the header menu while the A4 card is open leaves only one body-level panel @1024x768 | AC-4 | PASS |
| `frontend/e2e/headerMenuOverlay.spec.ts` | [REQ-346/AC-1] ${tag}: 展開パネルはヘッダー下端+6pxに出て重ならない | AC-1 | PASS |
| `frontend/e2e/headerMenuOverlay.spec.ts` | [REQ-346/AC-1] ${tag}: 開いてもヘッダー・スクロール領域が押し広げられない | AC-1 | PASS |
| `frontend/e2e/headerMenuOverlay.spec.ts` | [REQ-346/AC-2] ${tag}: ヘッダー下の項目をクリックできる | AC-2 | PASS |
| `frontend/e2e/headerMenuOverlay.spec.ts` | [REQ-346/AC-4] ${tag}: トリガー再押下・外側クリックで閉じる | AC-4 | PASS |
| `frontend/e2e/headerMenuOverlay.spec.ts` | [REQ-346/AC-5] ${tag}: 画面内に収まり、重なり順で隠れず、末尾に到達できる | AC-5 | PASS |
| `frontend/e2e/headerMenuOverlay.spec.ts` | [REQ-346/AC-3] ${a.id} @1280x${h}: maxHeight内に収まり末尾に到達できる | AC-3 | PASS |
| `frontend/e2e/headerMenuOverlay.spec.ts` | [REQ-346/AC-8] future @${v.w}x${v.h}: 40項目の末尾まで到達し実クリックできる | AC-8 | PASS |
| `frontend/e2e/headerMenuOverlay.spec.ts` | [REQ-346/AC-6] workflow 1280x800→375x360 リサイズ中も開いたまま末尾到達・ヘッダー下+6px | AC-6 | PASS |
| `frontend/e2e/headerMenuOverlay.spec.ts` | [REQ-346/AC-6] pill 375x667→600x400 開いたまま、800x400 で閉じる(640px境界) | AC-6 | PASS |
| `frontend/e2e/headerMenuOverlay.spec.ts` | [REQ-346/AC-6] future 1280x800→768x1024→375x360 連続リサイズで末尾到達・ヘッダー下+6px | AC-6 | PASS |
| `frontend/e2e/headerMenuOverlay.spec.ts` | [REQ-346/RedTeam] 幅320: 全アクションのパネルが左右 >= 0 かつ画面内 | - | VIOLATION |
| `frontend/e2e/headerMenuOverlay.spec.ts` | [REQ-346/RedTeam] 高さ280: 全アクションで末尾到達 | - | VIOLATION |
| `frontend/e2e/headerMenuOverlay.spec.ts` | [REQ-346/RedTeam] 連続トグル10回後にパネルは1つ以下 | - | VIOLATION |
| `frontend/e2e/headerMenuOverlay.spec.ts` | [REQ-346/RedTeam] 別アクションを開くと前のアクションが閉じる | - | VIOLATION |
| `frontend/e2e/headerMenuOverlay.spec.ts` | [REQ-346/AC-5] A4 hover overlap @${w}: resource-hover-card がヘッダー下+6pxに出て隠れない | AC-5 | PASS |
| `frontend/e2e/headerMenuRoutes.spec.ts` | [REQ-346/AC-1] Generate ${w}x${h}: workflow menu top is header bottom + 6px and does not overlap the header | AC-1 | PASS |
| `frontend/e2e/headerMenuRoutes.spec.ts` | [REQ-346/AC-1] Generate 1280x800: kebab dropdown top is header bottom + 6px | AC-1 | PASS |
| `frontend/e2e/headerMenuRoutes.spec.ts` | [REQ-346/AC-1] Generate ${w}x${h}: VRAM pill overlay sits below the wrapped header (header bottom + 6px) | AC-1 | PASS |
| `frontend/e2e/headerMenuRoutes.spec.ts` | [REQ-346/AC-1] Generate 375x360 (red team): open menu follows header bottom when the route scrolls ${dy}px | AC-1 | PASS |
| `frontend/e2e/headerMenuRoutes.spec.ts` | [REQ-346/AC-2] Generate 1280x800: clicking 名前を変更 below the header runs the action and closes the menu | AC-2 | PASS |
| `frontend/e2e/headerMenuRoutes.spec.ts` | [REQ-346/AC-3] Generate 375x360: last item (ノード再スキャン) is reachable | AC-3 | PASS |
| `frontend/e2e/headerMenuRoutes.spec.ts` | [REQ-346/AC-5] Generate 1280x800: kebab dropdown stays inside viewport and not covered | AC-5 | PASS |
| `frontend/e2e/headerMenuRoutes.spec.ts` | [REQ-346/AC-5] Generate 375x667: VRAM overlay stays inside the viewport and its last control is not covered by bottom navigation | AC-5 | PASS |
| `frontend/e2e/headerMenuRoutes.spec.ts` | [REQ-346/AC-6] Generate (same layout): resize while workflow menu is open keeps it open and last item reachable @${from}->${to} | AC-6 | PASS |
| `frontend/e2e/headerMenuRoutes.spec.ts` | [REQ-346/AC-6] Generate (layout boundary 768px): crossing the boundary closes the menu and re-opening makes the last item reachable @${from}->${to} | AC-6 | PASS |
| `frontend/e2e/headerMenuRoutes.spec.ts` | [REQ-346/AC-4] Generate 1280x800: toggling the trigger twice closes the menu | AC-4 | PASS |
| `frontend/e2e/headerMenuRoutes.spec.ts` | [REQ-346/AC-5] Generate Desktop ${w}x${h}: A4 hover card is not covered by the preset tab bar | AC-5 | PASS |
| `frontend/e2e/headerMenuRoutes.spec.ts` | [REQ-346/AC-5] Generate 700x900 (wrapped header): A4 card top is header bottom + 6px and the hover bridge carries the pointer | AC-5 | PASS |
| `frontend/e2e/headerMenuRoutes.spec.ts` | [REQ-346/AC-5] Generate 375x667: A4 hover card is not shown and no hover bridge exists (A3 pill covers mobile) | AC-5 | PASS |
| `frontend/src/components/common/__tests__/PageHeader.test.tsx` | [REQ-346/AC-1] the PageHeader root element carries data-page-header-root exactly once so expand panels can anchor to the header bottom | AC-1 | PASS |
| `frontend/src/components/common/__tests__/PageHeader.test.tsx` | [REQ-346/AC-1] the attribute matches the placement module PAGE_HEADER_ROOT_SELECTOR | AC-1 | PASS |
| `frontend/src/components/common/__tests__/PageHeader.test.tsx` | [REQ-346/AC-1] the attribute does not change the header layout classes | AC-1 | PASS |
| `frontend/src/components/common/__tests__/unifiedHeaderIntegration.test.tsx` | [REQ-346/AC-1] A4 hover card is a body-level fixed layer below the monitor and outside the header container | AC-1 | PASS |
| `frontend/src/components/common/__tests__/unifiedHeaderIntegration.test.tsx` | [REQ-346/AC-2] A4 hover continuity: moving from the monitor or bridge into the card keeps it open | AC-2 | PASS |
| `frontend/src/components/common/__tests__/unifiedHeaderIntegration.test.tsx` | [REQ-346/AC-3] A4 hover card height is capped by the viewport (360px) and keeps in-panel scroll | AC-3 | PASS |
| `frontend/src/components/common/__tests__/unifiedHeaderIntegration.test.tsx` | [REQ-346/AC-4] A4 closes on leave and on outside pointerdown; it has no click toggle | AC-4 | PASS |
| `frontend/src/components/common/__tests__/unifiedHeaderIntegration.test.tsx` | [REQ-346/AC-5] A4 stays inside 640/768/1280 wide viewports | AC-5 | PASS |
| `frontend/src/components/common/__tests__/unifiedHeaderIntegration.test.tsx` | [REQ-346/AC-6] A4 recomputes maxHeight on resize while hovered | AC-6 | PASS |
| `frontend/src/components/common/__tests__/unifiedHeaderIntegration.test.tsx` | [REQ-346/AC-4] pressing another header trigger while the A4 card is open leaves only one body-level panel | AC-4 | PASS |
| `frontend/src/components/common/__tests__/unifiedHeaderIntegration.test.tsx` | [REQ-346/AC-8] a new header action with content taller than the header renders in a body-level layer outside the overflow-x-auto actions wrapper | AC-8 | PASS |
| `frontend/src/components/common/__tests__/unifiedHeaderIntegration.test.tsx` | [REQ-346/AC-4] rapid open/close/open of two different header menus does not leave two panels open | AC-4 | PASS |
| `frontend/src/components/common/__tests__/unifiedHeaderIntegration.test.tsx` | [REQ-346/AC-6] unmount while open leaves no body-level panel or listener | AC-6 | PASS |
| `frontend/src/components/common/__tests__/unifiedHeaderIntegration.test.tsx` | [REQ-346/AC-1] kebab hit-slop: the 44px button below the 28px wrapper keeps the panel below the button | AC-1 | PASS |
| `frontend/src/components/common/__tests__/unifiedHeaderIntegration.test.tsx` | [REQ-346/AC-2] A4 bridge spans the monitor bottom to the card top, lives outside the header, and keeps hover across the portal | AC-2 | PASS |
| `frontend/src/components/common/__tests__/unifiedHeaderIntegration.test.tsx` | [REQ-346/AC-6] header height change while open re-anchors the panel (ResizeObserver) | AC-6 | PASS |
| `frontend/src/components/common/__tests__/unifiedHeaderIntegration.test.tsx` | [REQ-346/AC-8] a future action placed in PageHeader actions is anchored to the header bottom without extra props | AC-8 | PASS |
| `frontend/src/components/common/header/__tests__/HeaderDropdown.test.tsx` | [REQ-346/AC-1] renders the panel through a portal under document.body with position fixed below the anchor | AC-1 | PASS |
| `frontend/src/components/common/header/__tests__/HeaderDropdown.test.tsx` | [REQ-346/AC-2] keeps interactive children clickable inside the panel | AC-2 | PASS |
| `frontend/src/components/common/header/__tests__/HeaderDropdown.test.tsx` | [REQ-346/AC-3] sets maxHeight from the viewport and enables in-panel scrolling | AC-3 | PASS |
| `frontend/src/components/common/header/__tests__/HeaderDropdown.test.tsx` | [REQ-346/AC-4] closes on outside pointerdown/mousedown but not on anchor or panel interactions | AC-4 | PASS |
| `frontend/src/components/common/header/__tests__/HeaderDropdown.test.tsx` | [REQ-346/AC-4] renders nothing when open is false | AC-4 | PASS |
| `frontend/src/components/common/header/__tests__/HeaderDropdown.test.tsx` | [REQ-346/AC-5] clamps left inside the viewport for 375, 768 and 1280 wide viewports | AC-5 | PASS |
| `frontend/src/components/common/header/__tests__/HeaderDropdown.test.tsx` | [REQ-346/AC-6] recomputes maxHeight on window resize while open | AC-6 | PASS |
| `frontend/src/components/common/header/__tests__/HeaderDropdown.test.tsx` | [REQ-346/AC-6] closes when the anchor scrolls off-screen | AC-6 | PASS |
| `frontend/src/components/common/header/__tests__/HeaderDropdown.test.tsx` | [REQ-346/AC-6] works when visualViewport is undefined | AC-6 | PASS |
| `frontend/src/components/common/header/__tests__/HeaderDropdown.test.tsx` | [REQ-346/AC-6] removes all listeners on unmount and under StrictMode double mount | AC-6 | PASS |
| `frontend/src/components/common/header/__tests__/HeaderDropdown.test.tsx` | [REQ-346/AC-8] accepts tall content (40 items) with the last item present in the panel | AC-8 | PASS |
| `frontend/src/components/common/header/__tests__/HeaderDropdown.test.tsx` | [REQ-346/AC-1] anchors the top to the header bottom + 6 when inside [data-page-header-root] (header 118, trigger 39 -> 124px) | AC-1 | PASS |
| `frontend/src/components/common/header/__tests__/HeaderDropdown.test.tsx` | [REQ-346/AC-1] falls back to the trigger bottom when there is no header ancestor | AC-1 | PASS |
| `frontend/src/components/common/header/__tests__/HeaderDropdown.test.tsx` | [REQ-346/AC-1] hit-slop: a trigger child extending below the wrapper moves the top below the child (wrapper bottom 36, button bottom 44, no header -> 50px; header bottom 40 -> 50px; header bottom 118 -> 124px) | AC-1 | PASS |
| `frontend/src/components/common/header/__tests__/HeaderDropdown.test.tsx` | [REQ-346/AC-3] maxHeight uses the header-based top (innerHeight 360 -> 228px; innerHeight 227 closes via onClose) | AC-3 | PASS |
| `frontend/src/components/common/header/__tests__/HeaderDropdown.test.tsx` | [REQ-346/AC-6] re-reads the header bottom on scroll and keeps following it | AC-6 | PASS |
| `frontend/src/components/common/header/__tests__/HeaderDropdown.test.tsx` | [REQ-346/AC-6] observes the header with ResizeObserver, re-measures from its callback and disconnects on close/unmount | AC-6 | PASS |
| `frontend/src/components/common/header/__tests__/HeaderDropdown.test.tsx` | [REQ-346/AC-6] works without ResizeObserver and does not observe when headerless | AC-6 | PASS |
| `frontend/src/components/common/header/__tests__/HeaderDropdown.test.tsx` | [REQ-346/AC-2] hoverBridge renders a fixed, aria-hidden, transparent bridge from the trigger bottom to the panel top (+1px) | AC-2 | PASS |
| `frontend/src/components/common/header/__tests__/HeaderDropdown.test.tsx` | [REQ-346/AC-2] headerless hoverBridge is 7px high; no bridge without hoverBridge or when the card is not rendered | AC-2 | PASS |
| `frontend/src/components/common/header/__tests__/HeaderDropdown.test.tsx` | [REQ-346/AC-2] hover continuity through the portal: moving between the anchor, bridge and panel does not fire the ancestor onMouseLeave; leaving to body does | AC-2 | PASS |
| `frontend/src/components/common/header/__tests__/HeaderDropdown.test.tsx` | [REQ-346/AC-4] pointerdown on the bridge does not close; pointerdown outside closes | AC-4 | PASS |
| `frontend/src/components/common/header/__tests__/HeaderDropdown.test.tsx` | [REQ-346/AC-6] removes the ResizeObserver and listeners symmetrically under StrictMode double mount | AC-6 | PASS |
| `frontend/src/components/common/header/__tests__/HeaderKebabMenu.test.tsx` | [REQ-346/AC-1] renders the dropdown in a body-level fixed layer below the trigger (portal) | AC-1 | PASS |
| `frontend/src/components/common/header/__tests__/HeaderKebabMenu.test.tsx` | [REQ-346/AC-3] limits the dropdown height to the viewport (maxHeight) so the last item stays reachable by in-menu scroll | AC-3 | PASS |
| `frontend/src/components/common/header/__tests__/HeaderKebabMenu.test.tsx` | [REQ-346/AC-4] toggles closed when the trigger is pressed again | AC-4 | PASS |
| `frontend/src/components/common/header/__tests__/HeaderKebabMenu.test.tsx` | [REQ-346/AC-5] keeps the 270px panel inside 375px and 1280px wide viewports (align end) | AC-5 | PASS |
| `frontend/src/components/common/header/__tests__/HeaderKebabMenu.test.tsx` | [REQ-346/AC-6] recomputes the maxHeight on window resize while open | AC-6 | PASS |
| `frontend/src/components/common/header/__tests__/headerMenuPlacement.test.ts` | [REQ-346/AC-5] align start clamps left to viewport right edge limit (375x667, panel 240) | AC-5 | PASS |
| `frontend/src/components/common/header/__tests__/headerMenuPlacement.test.ts` | [REQ-346/AC-5] align end aligns panel right edge to anchor right (375x667, panel 240) | AC-5 | PASS |
| `frontend/src/components/common/header/__tests__/headerMenuPlacement.test.ts` | [REQ-346/AC-3] maxHeight follows viewport height (height 360) | AC-3 | PASS |
| `frontend/src/components/common/header/__tests__/headerMenuPlacement.test.ts` | [REQ-346/AC-6] zero rect is not treated as offscreen (jsdom getBoundingClientRect) | AC-6 | PASS |
| `frontend/src/components/common/header/__tests__/headerMenuPlacement.test.ts` | [REQ-346/AC-5] Red Team: align end with anchor near left edge clamps left to edge margin | AC-5 | PASS |
| `frontend/src/components/common/header/__tests__/headerMenuPlacement.test.ts` | [REQ-346/AC-5] Red Team: viewport narrower than panel yields left === edge margin | AC-5 | PASS |
| `frontend/src/components/common/header/__tests__/headerMenuPlacement.test.ts` | [REQ-346/AC-1] headerBottom below the trigger wins: top === headerBottom + 6 (375x667, anchor.bottom 39, headerBottom 118 -> top 124, maxHeight 535) | AC-1 | PASS |
| `frontend/src/components/common/header/__tests__/headerMenuPlacement.test.ts` | [REQ-346/AC-1] trigger bottom wins when it is below the header bottom (hit-slop overflow): anchor.bottom 44, headerBottom 40 -> top 50 | AC-1 | PASS |
| `frontend/src/components/common/header/__tests__/headerMenuPlacement.test.ts` | [REQ-346/AC-1] headerBottom undefined, NaN and Infinity fall back to the trigger bottom (top 45) | AC-1 | PASS |
| `frontend/src/components/common/header/__tests__/headerMenuPlacement.test.ts` | [REQ-346/AC-6] zero header rect (headerBottom 0) with a zero anchor does not close and gives top 6 | AC-6 | PASS |
| `frontend/src/components/common/header/__tests__/headerMenuPlacement.test.ts` | [REQ-346/AC-6] header bottom beyond the viewport yields maxHeight 0 and shouldClose true | AC-6 | PASS |
| `frontend/src/components/common/header/__tests__/headerMenuPlacement.test.ts` | [REQ-346/AC-3] mobile wrapped header: 375x360 open, 375x228 open at the threshold, 375x227 closes | AC-3 | PASS |
| `frontend/src/components/common/header/__tests__/headerMenuPlacement.test.ts` | [REQ-346/AC-1] top is always at least anchor.bottom + 6 | AC-1 | PASS |
| `frontend/src/components/common/header/__tests__/headerMenuPlacement.test.ts` | [REQ-346/AC-3] top + maxHeight never exceeds viewport.height - 8 (maxHeight >= 0) | AC-3 | PASS |
| `frontend/src/components/common/header/__tests__/headerMenuPlacement.test.ts` | [REQ-346/AC-5] left stays within [8, viewport.width - width - 8] when the panel fits | AC-5 | PASS |
| `frontend/src/components/common/header/__tests__/headerMenuPlacement.test.ts` | [REQ-346/AC-5] left equals 8 when panelWidth exceeds the usable width | AC-5 | PASS |
| ... | *(他 27 件割愛)* | - | - |

### REQ-347 (計 15 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/pages/GeneratePage/__tests__/GeneratePage.test.tsx` | [REQ-347/AC-1] scopes stage headings to independent roots and keeps role edits independent in shared live state | AC-1 | PASS |
| `frontend/src/pages/GeneratePage/__tests__/GeneratePage.test.tsx` | [REQ-347/AC-2] preserves disabled role chips, supports collapsing one role, and omits an empty stage | AC-2 | PASS |
| `frontend/src/pages/GeneratePage/__tests__/GeneratePage.test.tsx` | [REQ-347/AC-3] loads the missing shared master metadata and renders both parameter stages alongside cached stages | AC-3 | PASS |
| `frontend/src/pages/GeneratePage/__tests__/GeneratePage.test.tsx` | [REQ-347/AC-4] recovers after uncached stage metadata fails and refetches, while cached metadata invalidation refetches once | AC-4 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-347/AC-1] keeps a re-edited draft when the previous save and its refetch finish, then saves the latest value | AC-1 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-347/AC-2] does not show an old save rejection over a newer draft and does not retry automatically | AC-2 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-347/AC-3] keeps a failed current snapshot marked unsaved and reports the failure | AC-3 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-347/AC-4] blocks a warm cached form until the first GET hydrates and resets saved state when reopened | AC-4 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-347/AC-5] isolates a completed save from a switched session and permits the new session to hydrate | AC-5 | PASS |
| `frontend/src/utils/__tests__/mappingStageGroups.test.ts` | [REQ-347/AC-1] groups interleaved explicit variants by active stage order and preserves mapping references | AC-1 | PASS |
| `frontend/src/utils/__tests__/mappingStageGroups.test.ts` | [REQ-347/AC-1] uses unique computed-role matches for legacy mappings, while leaving ambiguous matches unresolved | AC-1 | PASS |
| `frontend/src/utils/__tests__/mappingStageGroups.test.ts` | [REQ-347/AC-1] keeps unresolved explicit variants and inactive or undefined stages after active stages | AC-1 | PASS |
| `frontend/src/utils/__tests__/mappingStageGroups.test.ts` | [REQ-347/AC-1] supports empty metadata while retaining every mapping and reprojects metadata without mutation | AC-1 | PASS |
| `frontend/src/utils/__tests__/mappingStageGroups.test.ts` | [REQ-347/AC-1] uses stage definition names/order when variants share a stage, and preserves source order within groups | AC-1 | PASS |
| `frontend/src/utils/__tests__/mappingStageGroups.test.ts` | [REQ-347/AC-1] keeps distinct stage identities separate when their display names match | AC-1 | PASS |

### REQ-350 (計 13 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `backend/tests/integration/api/test_presets.py` | test_preset_put_get_roundtrip_preserves_seed_mode_json_and_role_value: [REQ-350/AC-3] PUT and GET on presets preserves seed mode JSON and role value. | AC-3 | PASS |
| `backend/tests/integration/api/test_presets.py` | test_preset_suffix_cascade_renames_role_value_and_keeps_slot_mode_key: [REQ-350/AC-4] Suffix cascade renames role value while keeping slot mode key. | AC-4 | PASS |
| `backend/tests/integration/api/test_workflows.py` | test_workflow_seed_alias_custom_mapping: [REQ-350/AC-2] GET /api/workflows returns seed alias for custom mappings. | AC-2 | PASS |
| `backend/tests/integration/api/test_workflows.py` | test_workflow_seed_type_roundtrip_keeps_variant: [REQ-350/AC-1] Workflow creation with seed input_type retains mapping variant associations. | AC-1 | PASS |
| `frontend/src/utils/__tests__/seedBatch.test.ts` | [REQ-350/AC-1] increments fixed seeds per batch item and only replaces seed roles | AC-1 | PASS |
| `frontend/src/utils/__tests__/seedBatch.test.ts` | [REQ-350/AC-2][REQ-350/AC-3] draws random values once per root per item and copies them to synchronized seed children | AC-2 | PASS |
| `frontend/src/utils/__tests__/seedBatch.test.ts` | [REQ-350/AC-4] randomizes independent slots independently and does not mutate workflow metadata | AC-4 | PASS |
| `frontend/src/utils/__tests__/seedBatch.test.ts` | [REQ-350/AC-5] validates the whole batch before drawing or returning partial results | AC-5 | PASS |
| `frontend/src/utils/__tests__/seedBatch.test.ts` | [REQ-350/AC-6] does not impose the dedicated-seed limit when no seed mapping exists | AC-6 | PASS |
| `frontend/src/utils/__tests__/seedBatch.test.ts` | [REQ-350/AC-5] rejects invalid random draw values | AC-5 | PASS |
| `frontend/src/utils/__tests__/seedBatch.test.ts` | [REQ-350/AC-3] rejects seed sync cycles, mixed types, and duplicate parents | AC-3 | PASS |
| `frontend/src/utils/__tests__/seedBatch.test.ts` | [REQ-350/AC-1][PBT] preserves sequential increment and 32-bit integer invariants across arbitrary base seeds and batch sizes | AC-1 | PASS |
| `frontend/src/utils/__tests__/seedBatch.test.ts` | [REQ-350/AC-2][PBT] generates random uint32 values within bounds without mutating workflow | AC-2 | PASS |

### REQ-351 (計 16 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `backend/tests/integration/legacy/test_param_sync_groups.py` | test_stage_qualified_roles_round_trip: [REQ-351/AC-6] Stage-qualified computed roles persist and reload unchanged. | AC-6 | PASS |
| `frontend/src/components/__tests__/ParamSyncModal.test.tsx` | [REQ-351/AC-1] shows same-role other stages and same-type other roles with stage names as sub candidates | AC-1 | PASS |
| `frontend/src/components/__tests__/ParamSyncModal.test.tsx` | [REQ-351/AC-2] excludes the representative Main/Steps itself from sub candidates | AC-2 | PASS |
| `frontend/src/components/__tests__/ParamSyncModal.test.tsx` | [REQ-351/AC-4] lets the same-type other role Rough/OtherSteps be selected as a sync target | AC-4 | PASS |
| `frontend/src/components/__tests__/ParamSyncModal.test.tsx` | [REQ-351/AC-1] keeps different input types out of sub candidates | AC-1 | PASS |
| `frontend/src/components/__tests__/ParamSyncModal.test.tsx` | [REQ-351/AC-6] restores saved stage-qualified sync targets as checked when the modal is reopened | AC-6 | PASS |
| `frontend/src/components/__tests__/ParamSyncModal.test.tsx` | [REQ-351/AC-6] keeps stage-qualified sync targets when the representative changes to a same-type role | AC-6 | PASS |
| `frontend/src/components/__tests__/ParamSyncModal.test.tsx` | [REQ-351/AC-1] keeps candidates when stage master loading fails | AC-1 | PASS |
| `frontend/src/components/__tests__/ParamSyncModal.test.tsx` | [REQ-351/AC-1] keeps candidates by workflow input_type when mapping master loading fails | AC-1 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts` | [REQ-351/AC-3] syncs only the selected Rough stage and keeps Detail at its own value | AC-3 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts` | [REQ-351/AC-4] syncs the same-type other role Rough/OtherSteps to the representative value | AC-4 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts` | [REQ-351/AC-5] stops syncing an unselected Detail stage and keeps its value at release | AC-5 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts` | [REQ-351/AC-3] does not sync stage-qualified targets when the group is disabled | AC-3 | PASS |
| `frontend/src/utils/__tests__/mappingStageGroups.test.ts` | [REQ-351/AC-1] builds stage-qualified candidates for every mapped role in stage order | AC-1 | PASS |
| `frontend/src/utils/__tests__/mappingStageGroups.test.ts` | [REQ-351/AC-1] dedupes duplicate roles and skips null roles without mutating inputs | AC-1 | PASS |
| `frontend/src/utils/__tests__/mappingStageGroups.test.ts` | [REQ-351/AC-1] leaves stageName null when a mapping cannot be resolved to a stage | AC-1 | PASS |

### REQ-353 (計 7 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `backend/tests/governance/test_openapi_contract.py` | test_workflow_mapping_read_fallback_param_names_matches_openapi_snapshot: [REQ-353/AC-1] WorkflowMappingRead schema fallback_param_names matches openapi snapshot. | AC-1 | PASS |
| `backend/tests/integration/api/test_workflows.py` | test_workflow_mapping_returns_ordered_fallbacks: [REQ-353/AC-1] GET /api/workflows/{id} returns ordered fallbacks for master and variant mapping. | AC-1 | PASS |
| `backend/tests/integration/api/test_workflows.py` | test_workflow_preserves_null_and_empty_fallbacks: [REQ-353/AC-2] GET /api/workflows/{id} preserves null and empty fallback lists. | AC-2 | PASS |
| `backend/tests/integration/api/test_workflows.py` | test_workflow_missing_returns_404: [REQ-353/AC-3] GET /api/workflows/{id} returns 404 for nonexistent workflow. | AC-3 | PASS |
| `frontend/src/utils/__tests__/seedBatch.test.ts` | [REQ-353/AC-1] rejects graph-reference seed inputs and missing node/role mappings | AC-1 | PASS |
| `frontend/src/utils/__tests__/seedBatch.test.ts` | [REQ-353/AC-2] resolves registered fallback inputs and rejects missing or conflicting destinations | AC-2 | PASS |
| `frontend/src/utils/__tests__/seedBatch.test.ts` | [REQ-353/AC-3] rejects a graph reference at the primary even when a scalar fallback exists | AC-3 | PASS |

### REQ-356 (計 15 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `backend/tests/governance/test_no_req_naming.py` | test_backend_tests_hierarchy_and_no_req_naming: [REQ-356/AC-1][REQ-356/AC-2] backend/tests only contains conftest.py, unit/, integration/, governance/. | AC-1 | PASS |
| `backend/tests/governance/test_no_req_naming.py` | test_no_req_files_in_backend_tests: [REQ-356/AC-1] No test files in backend/tests contain req[0-9]+ or REQ-[0-9]+ in their path. | AC-1 | PASS |
| `backend/tests/integration/api/test_presets.py` | test_create_and_get_preset: [REQ-356/AC-2] POST /api/workflow-presets creates preset and GET /api/workflow-presets retrieves it. | AC-2 | PASS |
| `backend/tests/integration/api/test_presets.py` | test_preset_reorder_endpoint: [REQ-356/AC-2] PUT /api/workflow-presets/reorder updates preset sort order. | AC-2 | PASS |
| `backend/tests/integration/api/test_presets.py` | test_preset_delete_and_bulk_delete: [REQ-356/AC-2] DELETE endpoints remove individual and multiple presets. | AC-2 | PASS |
| `backend/tests/integration/api/test_workflows.py` | test_workflow_copy_duplicates_workflow: [REQ-356/AC-2] Workflow copy creates duplicate with mappings and presets. | AC-2 | PASS |
| `backend/tests/integration/models/test_migrations.py` | test_schema_parity_between_fresh_and_migrated_db: [REQ-356/AC-2] Verify schema parity between freshly created DB and fully migrated legacy DB. | AC-2 | PASS |
| `backend/tests/integration/models/test_migrations.py` | test_red_team_migration_step_failure_rolls_back_cleanly: [REQ-356/AC-4] Red Teaming: unintended exception in migration step aborts transaction cleanly. | AC-4 | PASS |
| `backend/tests/integration/services/test_snapshot_service.py` | test_snapshot_service_zero_production_file_leak: [REQ-356/AC-4][REQ-356/AC-5] Verify snapshot creation strictly writes to isolated tmp_path and never touches production db/snapshots. | AC-4 | PASS |
| `backend/tests/unit/test_config.py` | test_settings_default_values_and_types: [REQ-356/AC-11] Settings loads default configuration with correct types. | AC-11 | PASS |
| `backend/tests/unit/test_config.py` | test_settings_cors_origins_list_parsing: [REQ-356/AC-11] Settings parses comma-separated cors_origins into trimmed list. | AC-11 | PASS |
| `backend/tests/unit/test_config.py` | test_settings_cors_origins_single_entry: [REQ-356/AC-11] Settings handles single CORS origin without comma. | AC-11 | PASS |
| `backend/tests/unit/test_config.py` | test_settings_custom_overrides: [REQ-356/AC-11] Settings accepts custom constructor overrides. | AC-11 | PASS |
| `backend/tests/unit/test_config.py` | test_settings_snapshot_path_resolves: [REQ-356/AC-11] snapshot_path property returns created directory Path object. | AC-11 | PASS |
| `frontend/e2e/stickyHeader.spec.ts` | [REQ-356/AC-8] sticky header remains in view on scroll (${vp.name}) | AC-8 | PASS |

### REQ-357 (計 3 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/components/TagChipEditor/__tests__/TagChip.test.tsx` | [REQ-357/AC-1] keeps the drag handle, text, and delete button above the hit-slop layer | AC-1 | PASS |
| `frontend/src/components/TagChipEditor/__tests__/TagChip.test.tsx` | [REQ-357/AC-1] keeps the submenu open while step buttons and the enabled toggle are used | AC-1 | PASS |
| `frontend/src/components/TagChipEditor/__tests__/TagChip.test.tsx` | [REQ-357/AC-1] does not toggle menu when clicking drag handle | AC-1 | PASS |

### REQ-358 (計 91 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `backend/tests/governance/test_openapi_contract.py` | test_req358_openapi_workflow_mapping_slot_states_matches_runtime_and_snapshot: [REQ-358/AC-19] Workflow slot state schemas stay aligned with the runtime OpenAPI contract. | AC-19 | PASS |
| `backend/tests/governance/test_openapi_contract.py` | test_req358_openapi_workflow_slot_states_defaults_and_update_null_rejection: [REQ-358/AC-31] Read defaults to empty, update omission is distinguishable, and null is rejected. | AC-31 | PASS |
| `backend/tests/governance/test_openapi_contract.py` | test_req358_openapi_master_routes_match_runtime_and_both_snapshots_AC_26: [REQ-358/AC-26] Mapping master routes expose the runtime V2 request and response schemas. | AC-26 | PASS |
| `backend/tests/governance/test_openapi_contract.py` | test_req358_openapi_master_default_enabled_contract_AC_28_AC_30_AC_31: [REQ-358/AC-28][REQ-358/AC-30][REQ-358/AC-31] Verify mapping master default_enabled OpenAPI contract. | AC-28 | PASS |
| `backend/tests/integration/api/test_workflows.py` | test_workflow_state_create_get_and_update_roundtrip: [REQ-358/AC-19] Workflow slot state persists across POST, GET, and omitted PUT. | AC-19 | PASS |
| `backend/tests/integration/api/test_workflows.py` | test_workflow_state_rollback: [REQ-358/AC-28] Rollback restores prior workflow slot states. | AC-28 | PASS |
| `backend/tests/integration/models/test_migrations.py` | test_mapping_slot_state_migration_step_030: [REQ-358/AC-19][REQ-358/AC-26][REQ-358/AC-31] Verify step_030 adds mapping_slot_states and default_enabled idempotently. | AC-19 | PASS |
| `backend/tests/integration/models/test_migrations.py` | test_run_migrations_on_empty_db_is_idempotent: [REQ-358/AC-19] Running migrations multiple times on an empty database is safe and idempotent. | AC-19 | PASS |
| `backend/tests/unit/test_schemas.py` | test_workflow_slot_state_contract_defaults_and_strict_values: [REQ-358/AC-19] Workflow slot states default empty and require strict booleans. | AC-19 | PASS |
| `backend/tests/unit/test_schemas.py` | test_workflow_slot_state_keys_must_be_valid: [REQ-358/AC-19] Slot state keys use positive variant or legacy master IDs. | AC-19 | PASS |
| `backend/tests/unit/test_schemas.py` | test_workflow_update_distinguishes_omitted_and_empty_slot_states: [REQ-358/AC-19] Omitted slot states stay unset while an empty object replaces them. | AC-19 | PASS |
| `backend/tests/unit/test_schemas.py` | test_workflow_read_parses_slot_state_json: [REQ-358/AC-19] Read schemas normalize persisted slot state JSON objects. | AC-19 | PASS |
| `backend/tests/unit/test_schemas.py` | test_mapping_master_default_enabled_defaults_true: [REQ-358/AC-31] Legacy mapping masters default to enabled. | AC-31 | PASS |
| `frontend/src/api/__tests__/mappingApi.test.ts` | [REQ-358/AC-19] preserves optional master default_enabled types | AC-19 | PASS |
| `frontend/src/api/__tests__/mappingApi.test.ts` | [REQ-358/AC-26] allows optional mapping_slot_states and false values | AC-26 | PASS |
| `frontend/src/api/__tests__/mappingApi.test.ts` | [REQ-358/AC-31] supports legacy read defaults without making state required | AC-31 | PASS |
| `frontend/src/components/__tests__/WorkflowMappingPreview.test.tsx` | [REQ-358/AC-7] ranks candidates and keeps non-recommended nodes selectable | AC-7 | PASS |
| `frontend/src/components/__tests__/WorkflowModalEditing.test.tsx` | REQ-358/UPLOAD_CLEAN [REQ-358/AC-16] [REQ-358/AC-17] [REQ-358/AC-18] keeps the same input while typing, clearing and retyping | AC-16 | PASS |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | [REQ-358/AC-13] caches ranks during edits and locks one deferred save | AC-13 | PASS |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | [REQ-358/AC-13] upload edits reuse candidates and keep create locked until completion | AC-13 | PASS |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | REQ-358/EDITOR [REQ-358/AC-8] keeps the editable node ID input mounted and shows ranked reasons | AC-8 | PASS |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | REQ-358/EDITOR [REQ-358/AC-14] displays selected node metadata and stage confidence in distinct text | AC-14 | PASS |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | REQ-358/EDITOR [REQ-358/AC-13] renders ordered slot rows and keeps empty slots selectable | AC-13 | PASS |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | REQ-358/EDITOR [REQ-358/AC-22] marks a partly enabled stage as mixed and labels the disabled role | AC-22 | PASS |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | [REQ-358/AC-13] renders ordered slots and saves mappings with explicit slot states | AC-13 | PASS |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | [REQ-358/AC-14] preserves an explicitly empty slot and its enabled state | AC-14 | PASS |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | [REQ-358/AC-15] saves all slot states when mappings are empty | AC-15 | PASS |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | [REQ-358/AC-21] keeps disabled slot mappings and persists the opt-out state | AC-21 | PASS |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | [REQ-358/AC-19][REQ-358/AC-34] waits for refetch before restoring disabled assignments and preserves them across save and reopen | AC-19 | PASS |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | [REQ-358/AC-16] shows unresolved roles in the same mapping list | AC-16 | PASS |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | [REQ-358/AC-17] keeps direct input mounted while typing | AC-17 | PASS |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | [REQ-358/AC-18] keeps master order across matched and unresolved rows | AC-18 | PASS |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | [REQ-358/AC-29][REQ-369/AC-1] drops orphaned mappings for deleted masters while keeping valid disabled variants | AC-29 | PASS |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | [REQ-358/AC-33] retains a saved non-default node present in the graph | AC-33 | PASS |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | [REQ-358/AC-35] preserves a saved mapping whose node is missing from the workflow graph | AC-35 | PASS |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | [REQ-358/AC-19] saves remapped nodes and persisted slot states | AC-19 | PASS |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | [REQ-358/AC-20] preserves explicit empty slot values and identifiers | AC-20 | PASS |
| `frontend/src/hooks/__tests__/useMasterMappingRows.test.ts` | REQ-358/HOOK [REQ-358/AC-33] preserves a saved ID outside scan candidates and marks its mismatch | AC-33 | PASS |
| `frontend/src/hooks/__tests__/useMasterMappingRows.test.ts` | [REQ-358/AC-16] keeps row and slot identity stable while editing | AC-16 | PASS |
| `frontend/src/hooks/__tests__/useMasterMappingRows.test.ts` | [REQ-358/AC-17] keeps a cleared slot unused after scan updates | AC-17 | PASS |
| `frontend/src/hooks/__tests__/useMasterMappingRows.test.ts` | [REQ-358/AC-18] marks typed values as used without changing the slot | AC-18 | PASS |
| `frontend/src/hooks/__tests__/useMasterMappingRows.test.ts` | [REQ-358/AC-31] restores saved IDs and enabled state when state was omitted | AC-31 | PASS |
| `frontend/src/hooks/__tests__/useMasterMappingRows.test.ts` | [REQ-358/AC-23][REQ-358/AC-34] associates legacy master role with exactly one stage without duplicating the assignment | AC-23 | PASS |
| `frontend/src/hooks/__tests__/useMasterMappingRows.test.ts` | [REQ-358/AC-23][REQ-358/AC-34] migrates a single variant legacy assignment once and retains explicit disabled permission | AC-23 | PASS |
| `frontend/src/hooks/__tests__/useMasterMappingRows.test.ts` | [REQ-358/AC-23][REQ-358/AC-34] toggles slots without losing values or unknown state | AC-23 | PASS |
| `frontend/src/hooks/__tests__/useMasterMappingRows.test.ts` | [REQ-358/AC-24][REQ-358/AC-29] retains explicit disabled slots and omits a newly added disabled master | AC-24 | PASS |
| `frontend/src/hooks/__tests__/useMasterMappingRows.test.ts` | [REQ-358/AC-27] omits a basic-disabled master on first import | AC-27 | PASS |
| `frontend/src/hooks/__tests__/useMasterMappingRows.test.ts` | [REQ-358/AC-28] keeps a saved mapping when the master default is disabled | AC-28 | PASS |
| `frontend/src/hooks/__tests__/useMasterMappingRows.test.ts` | [REQ-358/AC-33] keeps a saved noncandidate ID across scan updates | AC-33 | PASS |
| `frontend/src/hooks/__tests__/useMasterMappingRows.test.ts` | [REQ-358/AC-35] preserves saved IDs and marks missing graph references | AC-35 | PASS |
| `frontend/src/hooks/__tests__/useMasterMappingRows.test.ts` | [REQ-358/AC-16] memoizes a realistic mapping grid and reports toggle CPU time | AC-16 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/ParamPanel.test.tsx` | [REQ-358/AC-25] hides the generation Seed control when its Sampler_Seed mapping is inactive | AC-25 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useWorkflowManagement.seed.test.ts` | [REQ-358/GENERATION] [REQ-358/AC-25] derives generation mappings from slot state while retaining raw workflow for mutation | AC-25 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useWorkflowManagement.seed.test.ts` | [REQ-358/AC-25][REQ-359/AC-2] resolves a legacy disabled slot after delayed master loading while preserving raw data and stable references | AC-25 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useWorkflowManagement.seed.test.ts` | [REQ-358/AC-25] resolves a multistage legacy seed only by exact persisted role, including inactive variants | AC-25 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.modals.test.tsx` | [REQ-358/AC-26] saves the new mapping default-enabled choice | AC-26 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.modals.test.tsx` | [REQ-358/AC-27] treats legacy defaults as enabled and locks the control while saving | AC-27 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.modals.test.tsx` | [REQ-358/AC-30] preserves an existing disabled default on save | AC-30 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.modals.test.tsx` | [REQ-358/AC-28][REQ-365/AC-3] keeps disabled masters visible and editable | AC-28 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/WorkflowAdaptiveStaging.test.tsx` | [REQ-358/WIRING] [REQ-358/AC-14] class候補と選択中node metadataを表示する | AC-14 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/WorkflowAdaptiveStaging.test.tsx` | [REQ-358/AC-23] slot無効状態を保持し、保存時にstateを渡す | AC-23 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/WorkflowAdaptiveStaging.test.tsx` | [REQ-358/AC-23][REQ-358/AC-34] keeps a legacy single-variant ID while disabled and saves its canonical permission | AC-23 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/WorkflowConnectionSection.config.test.ts` | [REQ-358/AC-19] mapping_slot_statesが省略された旧JSONは状態フィールドを追加しない | AC-19 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/WorkflowConnectionSection.config.test.ts` | [REQ-358/AC-19] 明示された空のmapping_slot_statesを置換値として保持する | AC-19 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/WorkflowConnectionSection.config.test.ts` | [REQ-358/AC-19] 有効なslot stateをJSON往復用に保持する | AC-19 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/WorkflowConnectionSection.config.test.ts` | [REQ-358/AC-19] null・非boolean・不正keyのslot stateを拒否する | AC-19 | PASS |
| `frontend/src/utils/__tests__/wiringStageGroups.test.ts` | [REQ-358/AC-20] hydrates explicit states, saved mappings, then defaults | AC-20 | PASS |
| `frontend/src/utils/__tests__/wiringStageGroups.test.ts` | [REQ-358/AC-21] updates only exact stage slots and preserves unknown keys | AC-21 | PASS |
| `frontend/src/utils/__tests__/wiringStageGroups.test.ts` | [REQ-358/AC-22] enables all displayed slots, including default-disabled slots | AC-22 | PASS |
| `frontend/src/utils/__tests__/wiringStageGroups.test.ts` | [REQ-358/AC-21] handles an empty stage and adds only displayed missing keys | AC-21 | PASS |
| `frontend/src/utils/__tests__/wiringStageGroups.test.ts` | [REQ-358/AC-23] filters only explicit false states without mutating frozen inputs | AC-23 | PASS |
| `frontend/src/utils/__tests__/wiringStageGroups.test.ts` | [REQ-358/AC-31] keeps all mappings when state is absent or empty | AC-31 | PASS |
| `frontend/src/utils/__tests__/wiringStageGroups.test.ts` | [REQ-358/AC-23] returns a new empty mapping array when all mappings are disabled | AC-23 | PASS |
| `frontend/src/utils/__tests__/wiringStageGroups.test.ts` | [REQ-358/AC-20] uses canonical variant and legacy slot keys | AC-20 | PASS |
| `frontend/src/utils/__tests__/wiringStageGroups.test.ts` | [REQ-358/AC-21] preserves non-target stage values across generated slot sets | AC-21 | PASS |
| `frontend/src/utils/__tests__/wiringStageGroups.test.ts` | [REQ-358/AC-23] preserves source mapping order for generated workflow records | AC-23 | PASS |
| `frontend/src/utils/__tests__/workflowNodeUtils.test.ts` | [REQ-358/AC-1] keeps all nodes available and sorts by tier, stage rank, then id | AC-1 | PASS |
| `frontend/src/utils/__tests__/workflowNodeUtils.test.ts` | [REQ-358/AC-2] reads API prompts, node dictionaries, and UI node arrays | AC-2 | PASS |
| `frontend/src/utils/__tests__/workflowNodeUtils.test.ts` | [REQ-358/AC-3] matches parameter names from object keys or named arrays | AC-3 | PASS |
| `frontend/src/utils/__tests__/workflowNodeUtils.test.ts` | [REQ-358/AC-4] assigns stage rank for Main candidates | AC-4 | PASS |
| `frontend/src/utils/__tests__/workflowNodeUtils.test.ts` | [REQ-358/AC-5] assigns stage rank for Upscaler candidates | AC-5 | PASS |
| `frontend/src/utils/__tests__/workflowNodeUtils.test.ts` | [REQ-358/AC-6] assigns stage rank for FaceDetailer candidates | AC-6 | PASS |
| `frontend/src/utils/__tests__/workflowNodeUtils.test.ts` | [REQ-358/AC-7] uses continuous normalized stage containment only | AC-7 | PASS |
| `frontend/src/utils/__tests__/workflowNodeUtils.test.ts` | [REQ-358/AC-8] keeps non-recommended tiers at stage rank 1 and node id order | AC-8 | PASS |
| `frontend/src/utils/__tests__/workflowNodeUtils.test.ts` | [REQ-358/AC-9] prefers current stage even when another registered stage also matches | AC-9 | PASS |
| `frontend/src/utils/__tests__/workflowNodeUtils.test.ts` | [REQ-358/AC-10] never gives an empty current stage rank zero | AC-10 | PASS |
| `frontend/src/utils/__tests__/workflowNodeUtils.test.ts` | [REQ-358/AC-11] treats a title without a stage match as unknown | AC-11 | PASS |
| `frontend/src/utils/__tests__/workflowNodeUtils.test.ts` | [REQ-358/AC-12] does not mutate the workflow and is independent of object insertion order | AC-12 | PASS |
| `frontend/src/utils/__tests__/workflowNodeUtils.test.ts` | [REQ-358/AC-36] does not infer a Main stage from Main (V2) | AC-36 | PASS |
| `frontend/src/utils/__tests__/workflowNodeUtils.test.ts` | [REQ-358/AC-37] normalizes stage case, whitespace, underscore, and hyphen | AC-37 | PASS |
| `frontend/src/utils/__tests__/workflowNodeUtils.test.ts` | [REQ-358/AC-38] checks current stage before another matching stage | AC-38 | PASS |

### REQ-359 (計 4 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/pages/GeneratePage/hooks/__tests__/useWorkflowManagement.seed.test.ts` | [REQ-359/AC-1] converges after both queries under whole-store subscription | AC-1 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useWorkflowManagement.seed.test.ts` | [REQ-359/AC-2] preserves workflow identity and avoids repeat writes after unrelated store update | AC-2 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useWorkflowManagement.seed.test.ts` | [REQ-359/AC-3] detects Anima and non-Anima workflow switches, including same-model reselection | AC-3 | PASS |
| `frontend/src/utils/__tests__/wiringStageGroups.test.ts` | [REQ-359/AC-4] keeps raw mappings and slot states unchanged while preserving generated mapping order | AC-4 | PASS |

### REQ-362 (計 8 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `backend/tests/integration/legacy/test_comfy_generation_bridge.py` | test_eager_full_webp_cache_on_executed_req362_ac3: [REQ-362/AC-3] ジョブ完了時 (executed)、フルサイズWebPが先行非同期生成されてディスクキャッシュに保存されること。 | AC-3 | PASS |
| `backend/tests/integration/legacy/test_comfy_proxy.py` | test_comfy_view_cache_hit_zero_probe_req362_ac1: [REQ-362/AC-1] キャッシュヒット時、ComfyUI への HTTP 通信が発生せず 5ms 未満で WebP が返却されること。 | AC-1 | PASS |
| `backend/tests/integration/legacy/test_comfy_proxy.py` | test_comfy_thumbnail_skips_probe_on_cache_hit_req362_ac2: [REQ-362/AC-2] サムネイルキャッシュヒット時、ComfyUI への存在確認プローブ (HEAD) が発生しないこと。 | AC-2 | PASS |
| `backend/tests/integration/legacy/test_comfy_proxy.py` | test_comfy_view_cache_miss_converts_to_webp_req362_ac4: [REQ-362/AC-4] キャッシュミス時、ComfyUI から元画像を取得して WebP (Quality 90) に変換・ディスク保存されること。 | AC-4 | PASS |
| `backend/tests/integration/legacy/test_comfy_proxy.py` | test_prune_full_cache_if_needed_req362_ac5: [REQ-362/AC-5] 220件超過時に古い順にファイルが間引かれ、200件以下に維持されること。 | AC-5 | PASS |
| `backend/tests/integration/legacy/test_prompt_metadata.py` | test_prompt_metadata_200_limit_pruning_req362_ac6: [REQ-362/AC-6] prompt_metadata が 200件を超過した際、アクティブジョブを除外した古いレコードからパージされること。 | AC-6 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/GenerateParallelPreview.test.tsx` | renders progressive thumbnail placeholder first and transitions to full-size WebP [REQ-362/AC-7] | AC-7 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/GenerateParallelPreview.test.tsx` | maintains thumbnail fallback if full-size WebP fails to load [REQ-362/AC-7] | AC-7 | PASS |

### REQ-363 (計 7 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/components/common/header/__tests__/ResourceHoverMonitor.test.tsx` | [REQ-363/AC-6] displays dropdown card with proportional VRAM and RAM gauges anchored below pill | AC-6 | PASS |
| `frontend/src/pages/GeneratePage/__tests__/GeneratePage.test.tsx` | [REQ-363/AC-4] renders preset manager as bottom sheet with 75dvh max-height and fixed action dock | AC-4 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/AddAssetModal.test.tsx` | [REQ-363/AC-8] applies tightened padding (p-3.5) on mobile viewport | AC-8 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx` | [REQ-363/AC-1] renders prompt tabs with shrink-0 and whitespace-nowrap preventing overlap | AC-1 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx` | [REQ-363/AC-2] keeps mobile action bar visible when tapping checkboxes or radio buttons | AC-2 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx` | [REQ-363/AC-3] applies bottom padding ensuring last tag chips scroll clear of action bar | AC-3 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/ParamPanel.test.tsx` | [REQ-363/AC-7] renders parameter steppers and selects in compact 1-row layout on mobile | AC-7 | PASS |

### REQ-364 (計 17 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/components/common/__tests__/SystemStatusBadge.test.tsx` | [REQ-364/AC-1] displays dynamic DEV :${currentPort} tag on desktop in dev mode | AC-1 | PASS |
| `frontend/src/components/common/__tests__/SystemStatusBadge.test.tsx` | [REQ-364/AC-2] does not display DEV tag in prod mode or in dot variant | AC-2 | PASS |
| `frontend/src/components/common/__tests__/SystemStatusBadge.test.tsx` | [REQ-364/AC-3] opens popover when clicked and renders all sections | AC-3 | PASS |
| `frontend/src/components/common/__tests__/SystemStatusBadge.test.tsx` | [REQ-364/AC-4] renders right-aligned vertical status format with dynamic ports | AC-4 | PASS |
| `frontend/src/components/common/__tests__/SystemStatusBadge.test.tsx` | [REQ-364/AC-5] navigates to production port while preserving URL parts in DEV mode | AC-5 | PASS |
| `frontend/src/components/common/__tests__/SystemStatusBadge.test.tsx` | [REQ-364/AC-6] navigates to development port while preserving URL parts in PROD mode | AC-6 | PASS |
| `frontend/src/components/common/__tests__/SystemStatusBadge.test.tsx` | [REQ-364/LC-1] shows start button and calls systemManagerApi.action in PROD when frontend is stopped | - | VIOLATION |
| `frontend/src/components/common/__tests__/SystemStatusBadge.test.tsx` | [REQ-364/LC-2] disables action button while lifecycle action is in flight | - | VIOLATION |
| `frontend/src/components/common/__tests__/SystemStatusBadge.test.tsx` | [REQ-364/LC-3] calls stop frontend action and navigates to prod URL in DEV mode | - | VIOLATION |
| `frontend/src/components/common/__tests__/SystemStatusBadge.test.tsx` | [REQ-364/RT-1] preserves complex URL parameters, queries, and hashes during switch URL generation | - | VIOLATION |
| `frontend/src/components/common/__tests__/SystemStatusBadge.test.tsx` | [REQ-364/RT-2] dynamically reflects custom ports for all services in badge and monitor without layout distortion | - | VIOLATION |
| `frontend/src/components/common/__tests__/SystemStatusBadge.test.tsx` | [REQ-364/RT-3] recovers from ServerManager action errors gracefully and disables controls when managerAvailable is false | - | VIOLATION |
| `frontend/src/components/common/__tests__/unifiedHeaderIntegration.test.tsx` | [REQ-364/AC-1] desktop header rendering: PageHeader in desktop mode shows SystemStatusBadge (slim) with dynamic DEV :${port} tag | AC-1 | PASS |
| `frontend/src/components/common/__tests__/unifiedHeaderIntegration.test.tsx` | [REQ-364/AC-2] mobile header rendering: PageHeader in mobile mode shows SystemStatusBadge (dot) and suppresses DEV :port badge | AC-2 | PASS |
| `frontend/src/components/common/__tests__/unifiedHeaderIntegration.test.tsx` | [REQ-364/AC-3] popover interaction: clicking status badge opens system monitor popover without breaking adjacent header elements | AC-3 | PASS |
| `frontend/src/components/common/header/__tests__/HeaderDropdown.test.tsx` | [REQ-364/AC-3] closes the dropdown when Escape key is pressed | AC-3 | PASS |
| `frontend/src/components/common/header/__tests__/HeaderDropdown.test.tsx` | [REQ-364/AC-3] does not close on Escape if closeOnEsc is false | AC-3 | PASS |

### REQ-365 (計 113 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-365/AC-1] 1280px: dual pane | AC-1 | PASS |
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-365/AC-1] 1279px: single column order | AC-1 | PASS |
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-365/AC-2] 767px: horizontal swipe tablist with numbered compact labels | AC-2 | PASS |
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-365/AC-2] 768px: grid tabs with long labels | AC-2 | PASS |
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-365/AC-2] 375px: interactive controls are >=44px | AC-2 | PASS |
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-365/AC-3] 375px: mapping master cards | AC-3 | PASS |
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-365/AC-9] 375px: param type manager opens as bottom sheet | AC-9 | PASS |
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-365/AC-9] 768px: same dialog is centered, not a sheet | AC-9 | PASS |
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-365/AC-9] 375px: ${target.name} opens as bottom sheet (one handle, 16px top radius, <=85dvh, no legacy ::before) | AC-9 | PASS |
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-365/AC-9] 1280px: ${target.name} is centered, not a sheet | AC-9 | PASS |
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-365/AC-9] 375px: ${target.name} opens as bottom sheet (one handle, 16px top radius, <=85dvh, no legacy ::before) | AC-9 | PASS |
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-365/AC-9] 1280px: ${target.name} is centered, not a sheet | AC-9 | PASS |
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-365/AC-9] ${vw}px: ${target.name} backdrop covers the full viewport and blocks the header | AC-9 | PASS |
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-365/AC-9] 375px: sheet backdrop is not shrunk (modal-backdrop covers the full viewport height) | AC-9 | PASS |
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-365/AC-2] 375px: content bottom padding clears the bottom nav | AC-2 | PASS |
| `frontend/src/components/__tests__/MappingMasterEditModal.test.tsx` | [REQ-365/AC-9] renders in the common bottom-sheet Modal (single handle, max-h-[85dvh], exactly one dialog) | AC-9 | PASS |
| `frontend/src/components/__tests__/MappingMasterEditModal.test.tsx` | [REQ-365/AC-9] closes via Escape, backdrop click and close/cancel buttons | AC-9 | PASS |
| `frontend/src/components/__tests__/MappingMasterEditModal.test.tsx` | [REQ-365/AC-9] does not close on Escape while the workflow node picker is open | AC-9 | PASS |
| `frontend/src/components/__tests__/MappingMasterEditModal.test.tsx` | [REQ-365/AC-9] nested node picker backdrop is not inside the space-y form (no sibling margin) | AC-9 | PASS |
| `frontend/src/components/__tests__/MappingMasterEditModal.test.tsx` | [REQ-365/AC-9] form submit and validation are unchanged inside the sheet | AC-9 | PASS |
| `frontend/src/components/__tests__/MappingMasterEditModal.test.tsx` | [REQ-365/AC-9] touch targets: close/cancel/save expose min-h-[44px]; chip delete and candidate buttons have hit-slop | AC-9 | PASS |
| `frontend/src/components/__tests__/MappingMasterEditModal.test.tsx` | [REQ-365/AC-9] renders nothing when isOpen is false | AC-9 | PASS |
| `frontend/src/components/__tests__/ParamTypeMasterManagerModal.test.tsx` | [REQ-365/AC-4] renders as a single dialog listing param types with create/edit/delete callbacks | AC-4 | PASS |
| `frontend/src/components/__tests__/ParamTypeMasterManagerModal.test.tsx` | [REQ-365/AC-4] shows empty message and still offers create | AC-4 | PASS |
| `frontend/src/components/__tests__/ParamTypeMasterManagerModal.test.tsx` | [REQ-365/AC-4] closes on Escape and backdrop click via onClose, and delete requires inline confirmation | AC-4 | PASS |
| `frontend/src/components/__tests__/ParamTypeMasterManagerModal.test.tsx` | [REQ-365/AC-9] uses the common bottom-sheet Modal (modal-backdrop, rounded-t-2xl, modal-sheet-handle, max-h-[85dvh]) | AC-9 | PASS |
| `frontend/src/components/__tests__/ParamTypeMasterManagerModal.test.tsx` | [REQ-365/AC-4] Tab key keeps focus inside the dialog and focus returns to the opener on close | AC-4 | PASS |
| `frontend/src/components/__tests__/ParamTypeMasterManagerModal.test.tsx` | [REQ-365/AC-4] keeps full 200-char name in aria-label and title while truncating visually (RT-11) | AC-4 | PASS |
| `frontend/src/components/__tests__/ParamTypeMasterModal.test.tsx` | [REQ-365/AC-9] renders inside the common bottom-sheet Modal with handle and 85dvh cap | AC-9 | PASS |
| `frontend/src/components/__tests__/ParamTypeMasterModal.test.tsx` | [REQ-365/AC-4] keeps create validation and submit contract | AC-4 | PASS |
| `frontend/src/components/__tests__/ParamTypeMasterModal.test.tsx` | [REQ-365/AC-9] closes on Escape and backdrop click | AC-9 | PASS |
| `frontend/src/components/__tests__/ParamTypeMasterModal.test.tsx` | [REQ-365/AC-9] close button has accessible label and 44px target | AC-9 | PASS |
| `frontend/src/components/__tests__/ParamTypeMasterModal.test.tsx` | [REQ-365/AC-4] toggles the Auto-Fill section | AC-4 | PASS |
| `frontend/src/components/__tests__/StageManagerModal.test.tsx` | [REQ-365/AC-9] renders in the common bottom-sheet Modal (single handle, max-h-[85dvh], exactly one dialog) | AC-9 | PASS |
| `frontend/src/components/__tests__/StageManagerModal.test.tsx` | [REQ-365/AC-9] closes via Escape, backdrop click and both close buttons | AC-9 | PASS |
| `frontend/src/components/__tests__/StageManagerModal.test.tsx` | [REQ-365/AC-9] inline delete guard and add form stay inside the single dialog | AC-9 | PASS |
| `frontend/src/components/__tests__/StageManagerModal.test.tsx` | [REQ-365/AC-9] touch targets: close/edit/delete/footer buttons expose min-h-[44px] | AC-9 | PASS |
| `frontend/src/components/__tests__/StageManagerModal.test.tsx` | [REQ-365/AC-9] renders nothing when isOpen is false | AC-9 | PASS |
| `frontend/src/components/__tests__/WorkflowManageModal.test.tsx` | [REQ-365/AC-9] renders in the common bottom-sheet Modal (single dialog, one handle, max-h-[85dvh], no legacy overlay) | AC-9 | PASS |
| `frontend/src/components/__tests__/WorkflowManageModal.test.tsx` | [REQ-365/AC-9] input is focused and selected on open; Escape calls onClose exactly once | AC-9 | PASS |
| `frontend/src/components/__tests__/WorkflowManageModal.test.tsx` | [REQ-365/AC-9] backdrop click, close button and cancel close; submit passes the trimmed name | AC-9 | PASS |
| `frontend/src/components/__tests__/WorkflowManageModal.test.tsx` | [REQ-365/AC-9] shows conflict message on 409 error | AC-9 | PASS |
| `frontend/src/components/__tests__/WorkflowManageModal.test.tsx` | [REQ-365/AC-9] touch targets expose min-h-[44px] | AC-9 | PASS |
| `frontend/src/components/__tests__/WorkflowNodePicker.test.tsx` | [REQ-365/AC-9] picker renders in the common bottom-sheet Modal (one handle, max-h-[85dvh], no own overlay) | AC-9 | PASS |
| `frontend/src/components/__tests__/WorkflowNodePicker.test.tsx` | [REQ-365/AC-9] nested in another Modal: Escape closes only the picker and backdrop click does not close it | AC-9 | PASS |
| `frontend/src/components/__tests__/WorkflowNodePicker.test.tsx` | [REQ-365/AC-9] picker close button and cancel call onClose; touch targets expose min-h-[44px] | AC-9 | PASS |
| `frontend/src/components/common/__tests__/Modal.test.tsx` | [REQ-365/AC-9] renders the sheet handle with testid and applies sheetMaxHeightClass | AC-9 | PASS |
| `frontend/src/components/common/__tests__/Modal.test.tsx` | [REQ-365/AC-9] falls back to the default max-height class when sheetMaxHeightClass is empty | AC-9 | PASS |
| `frontend/src/components/common/__tests__/Modal.test.tsx` | [REQ-365/AC-9] keeps rounded-t-2xl and items-end bottom-sheet classes on mobile | AC-9 | PASS |
| `frontend/src/components/common/__tests__/Modal.test.tsx` | [REQ-365/AC-9] exempts the sheet from the global radius override and keeps responsive radius classes | AC-9 | PASS |
| `frontend/src/components/common/__tests__/Modal.test.tsx` | [REQ-365/AC-9] exposes sheetMaxHeightClass max-h-[...] value to the mobile sheet CSS only when provided | AC-9 | PASS |
| `frontend/src/components/common/header/__tests__/HeaderKebabMenu.test.tsx` | [REQ-365/AC-2] keeps a 28x28px visual box with a 44px (w-11 h-11) touch target below md | AC-2 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-365/AC-1] renders workflows tab as a dual-pane grid with WF/Base left and Mapping right at xl | AC-1 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-365/AC-1] orders cards workflow, mapping, base model below xl | AC-1 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-365/AC-2] keeps bottom-nav safe padding below md and releases it from md | AC-2 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-365/AC-3] ships the mobile card and table CSS contract | AC-3 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-365/AC-9] SettingsResponsive.css no longer shrinks role=dialog elements | AC-9 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/BaseModelSection.test.tsx` | [REQ-365/AC-3] checkpoint mapping rows expose data-cell=actions and keep thead as accessible hidden header | AC-3 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/BaseModelSection.test.tsx` | [REQ-365/AC-3] model master list lives only inside the manager dialog with 44px actions | AC-3 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/BaseModelSection.test.tsx` | [REQ-365/AC-9] model master manager and create/edit/mapping dialogs render in the common bottom-sheet Modal (handle, rounded-t-2xl, max-h-[85dvh]) | AC-9 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/BaseModelSection.test.tsx` | [REQ-365/AC-9] dialogs are not rendered inside a space-y/divide wrapper (backdrop must not receive a margin) | AC-9 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/BaseModelSection.test.tsx` | [REQ-365/AC-9] manager -> edit -> manager transition keeps exactly one dialog open | AC-9 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/BaseModelSection.test.tsx` | [REQ-365/AC-9] Escape and backdrop close the manager dialog | AC-9 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/BaseModelSection.test.tsx` | [REQ-365/AC-9] keeps mapping create and checkpoint refresh actions available with 44px targets | AC-9 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/BaseModelSection.test.tsx` | [REQ-365/AC-3] keeps empty states visible without model master list inline | AC-3 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/llmSettingsGroups.test.ts` | [REQ-365/AC-5] maps each of the six prompt editor keys to a param group contained in GROUP_PARAMS.prompt | AC-5 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/llmSettingsGroups.test.ts` | [REQ-365/AC-5] every PROMPT_EDITOR_KEYS entry equals GROUP_PROMPTS.prompt in order | AC-5 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/llmSettingsGroups.test.ts` | [REQ-365/AC-5] PBT: returns null for any string outside PROMPT_EDITOR_KEYS and never throws | AC-5 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/llmSettingsGroups.test.ts` | [REQ-365/AC-5] PBT: result is total over PROMPT_EDITOR_KEYS (non-null) and idempotent | AC-5 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/llmSettingsGroups.test.ts` | [REQ-365/AC-5] two param groups are both reachable | AC-5 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/LlmSettingsSection.test.tsx` | [REQ-365/AC-5] switches the prompt body textarea immediately when the type selector changes | AC-5 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/LlmSettingsSection.test.tsx` | [REQ-365/AC-5] links Temperature and Max Tokens to the selected type param group | AC-5 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/LlmSettingsSection.test.tsx` | [REQ-365/AC-5] keeps unsaved body and param drafts when switching types and back | AC-5 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/LlmSettingsSection.test.tsx` | [REQ-365/AC-5] saves params of the selected group with the exact existing payload | AC-5 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/LlmSettingsSection.test.tsx` | [REQ-365/AC-5] shows the shared model read-only and does not add a per-type model save | AC-5 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/LlmSettingsSection.test.tsx` | [REQ-365/AC-5] still routes the details toggle through onTogglePrompts | AC-5 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/LlmSettingsSection.test.tsx` | [REQ-365/AC-5] disables the textarea when the selected prompt record is not fetched | AC-5 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.modals.test.tsx` | [REQ-365/AC-3] renders each master as a settings-mobile-card with pinned actions, hidden target node and contextual aria-label | AC-3 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.modals.test.tsx` | [REQ-365/AC-3] shows +N classes and +N stages compact badges without duplicating variant names | AC-3 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.modals.test.tsx` | [REQ-365/AC-4] opens ParamTypeMaster manager as a dialog from the カスタム型マスタ button and no longer renders the always-on bar | AC-4 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.modals.test.tsx` | [REQ-365/AC-4] transitions list -> create form -> back to list with exactly one dialog at a time | AC-4 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.modals.test.tsx` | [REQ-365/AC-9] param type dialogs use the bottom-sheet Modal | AC-9 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.test.tsx` | [REQ-365/AC-9] delete dialogs render in the common bottom-sheet Modal (single dialog, one handle, max-h-[85dvh], role stays dialog) | AC-9 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.test.tsx` | [REQ-365/AC-9] MappingMasterDeleteModal: backdrop click does not close; Cancel closes; Delete is not initially focused | AC-9 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.test.tsx` | [REQ-365/AC-9] WorkflowDeleteConfirmDialog: delete stays disabled until acknowledged; backdrop closes unless pending | AC-9 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.test.tsx` | [REQ-365/AC-9] delete dialogs: close/cancel/confirm controls expose min-h-[44px] | AC-9 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/ServiceConnectionCard.test.tsx` | [REQ-365/AC-7] expands the log accordion directly under the clicked service row and fetches that service | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/ServiceConnectionCard.test.tsx` | [REQ-365/AC-7] toggles closed on second click without refetching | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/ServiceConnectionCard.test.tsx` | [REQ-365/AC-7] keeps logs collapsed initially and disables log buttons when the manager is unavailable | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/ServiceConnectionCard.test.tsx` | [REQ-365/AC-7] shows the failure reason (RT-7: 504/timeout) and allows retry | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/ServiceConnectionCard.test.tsx` | [REQ-365/AC-7] renders a very large log inside a bounded scroll region | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/ServiceConnectionCard.test.tsx` | [REQ-365/AC-7] service status lamps expose accessible state text | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/SettingsTabBar.test.tsx` | [REQ-365/AC-2] shows numbered compact labels below md while keeping unnumbered aria-labels | AC-2 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/ThumbnailSettingsSection.test.tsx` | [REQ-365/AC-2] renders a single select with all presets and reflects the persisted selection | AC-2 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/ThumbnailSettingsSection.test.tsx` | [REQ-365/AC-2] select has min-h-11 and touch-manipulation | AC-2 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/ThumbnailSettingsSection.test.tsx` | [REQ-365/AC-2] custom input appears only for custom | AC-2 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/ThumbnailSettingsSection.test.tsx` | [REQ-365/AC-2] switches preset when the select changes | AC-2 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/ThumbnailSettingsSection.test.tsx` | [REQ-365/AC-2] shows persistence error without crashing when localStorage throws; keeps the session choice and reports that it is unsaved | AC-2 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/VramGuardSection.test.tsx` | [REQ-365/AC-8] moves the threshold line and tag immediately while dragging, without calling updateVram | AC-8 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/VramGuardSection.test.tsx` | [REQ-365/AC-8] switches meter state: safe(green) / approaching(amber) / below(red) | AC-8 | PASS |
| ... | *(他 13 件割愛)* | - | - |

### REQ-366 (計 7 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `backend/tests/governance/test_ui_invariants.py` | test_ui_invariants_detects_global_font_floor: [REQ-366/AC-4] Detects font-size: 11px floor on global and attribute selectors. | AC-4 | PASS |
| `backend/tests/governance/test_ui_invariants.py` | test_ui_invariants_detects_raw_100vh: [REQ-366/AC-4] Detects raw 100vh in CSS and TSX/JSX, but allows dvh and 100%. | AC-4 | PASS |
| `backend/tests/governance/test_ui_invariants.py` | test_ui_invariants_detects_important_abuse: [REQ-366/AC-4] Detects !important in CSS declarations, ignores in comments. | AC-4 | PASS |
| `backend/tests/governance/test_ui_invariants.py` | test_ui_invariants_honors_ignore_comments: [REQ-366/AC-4] Inline comments on the same or preceding line suppress violations. | AC-4 | PASS |
| `backend/tests/governance/test_ui_invariants.py` | test_ui_invariants_allowlist: [REQ-366/AC-4] Allowlisted paths are skipped without violations. | AC-4 | PASS |
| `backend/tests/governance/test_ui_invariants.py` | test_ui_invariants_cli_exit_code: [REQ-366/AC-4] CLI exits with code 1 on violations and code 0 when clean. | AC-4 | PASS |
| `backend/tests/governance/test_ui_invariants.py` | test_ui_invariants_clean_on_compliant_code: [REQ-366/AC-4] Fully compliant CSS and TSX return 0 violations. | AC-4 | PASS |

### REQ-369 (計 6 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `backend/tests/integration/api/test_workflows.py` | test_workflow_save_filters_orphaned_master_and_variant_mappings: [REQ-369/AC-4] Workflow save/update/copy/rollback filters out orphaned master and variant mappings. | AC-4 | PASS |
| `backend/tests/integration/api/test_workflows.py` | test_step_031_cleanup_orphaned_workflow_mappings: [REQ-369/AC-5] Migration step 031 idempotently removes orphaned workflow_mappings rows. | AC-5 | PASS |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | [REQ-369/AC-2] does not auto-populate unassigned stage slots when rescanning existing workflow | AC-2 | PASS |
| `frontend/src/hooks/__tests__/useMasterMappingRows.test.ts` | [REQ-369/AC-1] drops orphaned mappings for nonexistent masters and variants while keeping valid disabled variants | AC-1 | PASS |
| `frontend/src/hooks/__tests__/useMasterMappingRows.test.ts` | [REQ-369/AC-2] keeps unassigned stage slots empty during rescan of existing workflow without auto-assigning | AC-2 | PASS |
| `frontend/src/hooks/__tests__/useMasterMappingRows.test.ts` | [REQ-369/AC-3] auto-populates scan defaults on new workflow without existing mappings | AC-3 | PASS |

### REQ-370 (計 4 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateDisplayState.residual.test.tsx` | [REQ-370/AC-4] calls store.loadSnapshot on visibilitychange and updates query cache with newly completed images | AC-4 | PASS |
| `frontend/src/services/__tests__/residualHistory.test.ts` | [REQ-370/AC-3] places initial residual batch at the front of existing history | AC-3 | PASS |
| `frontend/src/services/__tests__/residualHistory.test.ts` | [REQ-370/AC-2] accepts new candidates via FIFO up to 200 items even when already holding 200 items | AC-2 | PASS |
| `frontend/src/store/__tests__/slices/connectionSlice.test.ts` | [REQ-370/AC-1] merges historical succeeded jobs from a snapshot even on initial load or epoch change | AC-1 | PASS |

### REQ-372 (計 24 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/e2e/generateMobileGallery.spec.ts` | [REQ-372/AC-1] Mobile 375px: persistent preview does NOT exist | AC-1 | PASS |
| `frontend/e2e/generateMobileGallery.spec.ts` | [REQ-372/AC-2] Mobile 375px: history section has 3-column square grid, no horizontal scroll reel | AC-2 | PASS |
| `frontend/e2e/generateMobileGallery.spec.ts` | [REQ-372/AC-3] Mobile 375px: tapping thumbnail opens bottom sheet (MobileImageSheet) | AC-3 | PASS |
| `frontend/e2e/generateMobileGallery.spec.ts` | [REQ-372/AC-4] Mobile 375px: tapping sheet image transitions to black fullscreen viewer with chrome hidden | AC-4 | PASS |
| `frontend/e2e/generateMobileGallery.spec.ts` | [REQ-372/AC-5] Mobile 375px: tapping close button returns from fullscreen to bottom sheet | AC-5 | PASS |
| `frontend/e2e/generateMobileGallery.spec.ts` | [REQ-372/AC-6] Mobile 375px: closing bottom sheet returns to gallery | AC-6 | PASS |
| `frontend/e2e/generateMobileGallery.spec.ts` | [REQ-372/AC-7] Mobile 375px: empty state displayed when 0 images | AC-7 | PASS |
| `frontend/e2e/generateMobileGallery.spec.ts` | [REQ-372/AC-14] Desktop 1280px: persistent preview remains intact on desktop | AC-14 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/MobileImageSheet.test.tsx` | [REQ-372/AC-3] renders bottom sheet container and image with original aspect ratio when open | AC-3 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/MobileImageSheet.test.tsx` | [REQ-372/AC-4] transitions to fullscreen viewer on sheet image tap with black background and hidden sheet chrome | AC-4 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/MobileImageSheet.test.tsx` | [REQ-372/AC-5] returns from fullscreen to sheet on tapping image, floating close button, or pressing Escape | AC-5 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/MobileImageSheet.test.tsx` | [REQ-372/AC-6] closes bottom sheet on backdrop tap, sheet close button, or Escape key | AC-6 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/MobileImageSheet.test.tsx` | [REQ-372/AC-8] provides download button (#download-btn-mobile) and snapshot save button inheriting preview features | AC-8 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/MobileImageSheet.test.tsx` | [REQ-372/AC-11] shows fallback error state with ImageOff icon when image fails to load | AC-11 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/MobileImageSheet.test.tsx` | [REQ-372/AC-12] requests Wake Lock on entering fullscreen and releases on exiting fullscreen or page visibility hidden | AC-12 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/MobileImageSheet.test.tsx` | [REQ-372/AC-13] degrades gracefully without errors when Fullscreen API or Wake Lock API is not supported or rejected | AC-13 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx` | [REQ-372/AC-1] removes persistent main preview container in mobile layout | AC-1 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx` | [REQ-372/AC-9] displays sticky status header with progress and shows completion navigation on job end | AC-9 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx` | [REQ-372/AC-11] maintains sticky status header layout and text truncation on 360px viewport | AC-11 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx` | [REQ-372/AC-3] opens MobileImageSheet on clicking thumbnail and closes properly | AC-3 | PASS |
| `frontend/src/pages/GeneratePage/sections/__tests__/GenerationGallerySection.cache.test.tsx` | [REQ-372/AC-2] renders 3-column vertical grid container and square thumbnails on mobile | AC-2 | PASS |
| `frontend/src/pages/GeneratePage/sections/__tests__/GenerationGallerySection.cache.test.tsx` | [REQ-372/AC-7] displays empty state and no fake images when history is empty | AC-7 | PASS |
| `frontend/src/pages/GeneratePage/sections/__tests__/GenerationGallerySection.cache.test.tsx` | [REQ-372/AC-8] renders previewAutoFollow toggle button with correct id and handles click | AC-8 | PASS |
| `frontend/src/pages/GeneratePage/sections/__tests__/GenerationGallerySection.cache.test.tsx` | [REQ-372/AC-10] protects multi-select mode so thumbnail tap toggles selection and does not trigger open modal preview | AC-10 | PASS |

### REQ-376 (計 23 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/pages/__tests__/AssetCardInteractions.test.tsx` | [REQ-376/AC-6] isolates edit and delete touch targets (>= 44x44px) without overlapping and stops card click bubbling | AC-6 | PASS |
| `frontend/src/pages/__tests__/LoRAsPage.test.tsx` | [REQ-376/AC-1] maintains fixed 320px card height without overflow | AC-1 | PASS |
| `frontend/src/pages/__tests__/LoRAsPage.test.tsx` | [REQ-376/AC-2] displays exactly 3 items in order in mobile area (title, description, base model) | AC-2 | PASS |
| `frontend/src/pages/__tests__/LoRAsPage.test.tsx` | [REQ-376/AC-3] clamps multi-line titles and descriptions with line-clamp-2 and break-words | AC-3 | PASS |
| `frontend/src/pages/__tests__/LoRAsPage.test.tsx` | [REQ-376/AC-4] removes card-internal scroll in mobile view using overflow-hidden | AC-4 | PASS |
| `frontend/src/pages/__tests__/LoRAsPage.test.tsx` | [REQ-376/AC-5] sticks category section header with pt-0 container and removes category badge from mobile card | AC-5 | PASS |
| `frontend/src/pages/__tests__/LoRAsPage.test.tsx` | [REQ-376/AC-7] applies centering classes to ImageCarousel for mobile thumbnail alignment | AC-7 | PASS |
| `frontend/src/pages/__tests__/LoRAsPage.test.tsx` | [REQ-376/AC-8] keeps triggers, strength, and file path accessible via detail modal on card click | AC-8 | PASS |
| `frontend/src/pages/__tests__/LoRAsPage.test.tsx` | [REQ-376/AC-9] formats base models with delimiter and validates properties with fast-check | AC-9 | PASS |
| `frontend/src/pages/__tests__/LoRAsPage.test.tsx` | [REQ-376/AC-10] preserves existing search, filter, and accordion functionality | AC-10 | PASS |
| `frontend/src/pages/__tests__/LoRAsPage.test.tsx` | [REQ-376/AC-11] renders safely on 360px viewport, missing descriptions, missing thumbnail, and uncategorized cards | AC-11 | PASS |
| `frontend/src/pages/__tests__/LoRAsPage.test.tsx` | [REQ-376/AC-12] preserves full desktop baseline layout with card-internal scroll and triggers | AC-12 | PASS |
| `frontend/src/pages/__tests__/TagsPage.test.tsx` | [REQ-376/AC-1] maintains fixed 320px card height without overflow | AC-1 | PASS |
| `frontend/src/pages/__tests__/TagsPage.test.tsx` | [REQ-376/AC-2] displays exactly 3 items in order in mobile area (title, description, base model) | AC-2 | PASS |
| `frontend/src/pages/__tests__/TagsPage.test.tsx` | [REQ-376/AC-3] clamps multi-line titles and descriptions with line-clamp-2 and break-words | AC-3 | PASS |
| `frontend/src/pages/__tests__/TagsPage.test.tsx` | [REQ-376/AC-4] removes card-internal scroll in mobile view using overflow-hidden | AC-4 | PASS |
| `frontend/src/pages/__tests__/TagsPage.test.tsx` | [REQ-376/AC-5] sticks category section header with pt-0 container and removes category badge from mobile card | AC-5 | PASS |
| `frontend/src/pages/__tests__/TagsPage.test.tsx` | [REQ-376/AC-7] applies centering classes to ImageCarousel for mobile thumbnail alignment | AC-7 | PASS |
| `frontend/src/pages/__tests__/TagsPage.test.tsx` | [REQ-376/AC-8] keeps tag set tags accessible via detail modal on card click | AC-8 | PASS |
| `frontend/src/pages/__tests__/TagsPage.test.tsx` | [REQ-376/AC-9] formats base models with delimiter and validates properties with fast-check | AC-9 | PASS |
| `frontend/src/pages/__tests__/TagsPage.test.tsx` | [REQ-376/AC-10] preserves existing search, filter, and accordion functionality | AC-10 | PASS |
| `frontend/src/pages/__tests__/TagsPage.test.tsx` | [REQ-376/AC-11] renders safely on 360px viewport, missing descriptions, missing thumbnail, and uncategorized cards | AC-11 | PASS |
| `frontend/src/pages/__tests__/TagsPage.test.tsx` | [REQ-376/AC-12] preserves full desktop baseline layout with card-internal scroll and tags | AC-12 | PASS |

### REQ-377 (計 24 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/components/__tests__/LoraModals.test.tsx` | [REQ-377/AC-1] keeps detail as a labelled mobile sheet and caps its centered desktop width | AC-1 | PASS |
| `frontend/src/components/__tests__/LoraModals.test.tsx` | [REQ-377/AC-3] opens directly in edit mode when initialEditing is true and displays Cancel and Save footer | AC-3 | PASS |
| `frontend/src/components/__tests__/TagSetModals.test.tsx` | [REQ-377/AC-1] renders as mobile bottom sheet with drag handle, single scrollable body, and fixed footer | AC-1 | PASS |
| `frontend/src/components/__tests__/TagSetModals.test.tsx` | [REQ-377/AC-2] displays Close on left and Edit on right in view mode footer and responds to clicks | AC-2 | PASS |
| `frontend/src/components/__tests__/TagSetModals.test.tsx` | [REQ-377/AC-3] displays Cancel on left and Save Changes on right in edit mode footer with pending and validation states | AC-3 | PASS |
| `frontend/src/components/__tests__/TagSetModals.test.tsx` | [REQ-377/AC-4] includes safe area bottom padding and 44px min touch target on mobile footer | AC-4 | PASS |
| `frontend/src/components/__tests__/TagSetModals.test.tsx` | [REQ-377/AC-5] displays compact Cover image and snapshot count row at body top on mobile | AC-5 | PASS |
| `frontend/src/components/__tests__/TagSetModals.test.tsx` | [REQ-377/AC-6] opens gallery subview on cover tap and respects Cancel / Save timing for cover changes | AC-6 | PASS |
| `frontend/src/components/__tests__/TagSetModals.test.tsx` | [REQ-377/AC-7] gracefully handles missing images and empty snapshot lists without breaking layout | AC-7 | PASS |
| `frontend/src/components/__tests__/TagSetModals.test.tsx` | [REQ-377/AC-12] preserves full metadata editing, subsets, copy, and save in TagSetDetailModal | AC-12 | PASS |
| `frontend/src/components/__tests__/TagSetModals.test.tsx` | [REQ-377/AC-13] supports Escape key navigation returning from gallery subview or closing modal | AC-13 | PASS |
| `frontend/src/components/__tests__/TagSetModals.test.tsx` | [REQ-377/AC-14] maintains desktop 2-column layout and right-pane action buttons | AC-14 | PASS |
| `frontend/src/components/LoraModals/__tests__/LoraDetailModal.test.tsx` | [REQ-377/AC-1] renders bottom sheet with backdrop, handle, header, single scrollable body, and fixed footer | AC-1 | PASS |
| `frontend/src/components/LoraModals/__tests__/LoraDetailModal.test.tsx` | [REQ-377/AC-2] view mode fixed footer displays Close on left and Edit on right | AC-2 | PASS |
| `frontend/src/components/LoraModals/__tests__/LoraDetailModal.test.tsx` | [REQ-377/AC-3] edit mode fixed footer displays Cancel on left and Save on right with validation and pending state | AC-3 | PASS |
| `frontend/src/components/LoraModals/__tests__/LoraDetailModal.test.tsx` | [REQ-377/AC-4] fixed footer includes safe area padding and hit-slop | AC-4 | PASS |
| `frontend/src/components/LoraModals/__tests__/LoraDetailModal.test.tsx` | [REQ-377/AC-5] displays compact cover row at top of body without large preview on mobile | AC-5 | PASS |
| `frontend/src/components/LoraModals/__tests__/LoraDetailModal.test.tsx` | [REQ-377/AC-6] tapping compact cover opens gallery subview; cover selection persists on save and reverts on cancel | AC-6 | PASS |
| `frontend/src/components/LoraModals/__tests__/LoraDetailModal.test.tsx` | [REQ-377/AC-7] gracefully handles missing image, empty snapshots, and image load errors | AC-7 | PASS |
| `frontend/src/components/LoraModals/__tests__/LoraDetailModal.test.tsx` | [REQ-377/AC-11] preserves trigger words copy, strength range, file path, and base models | AC-11 | PASS |
| `frontend/src/components/LoraModals/__tests__/LoraDetailModal.test.tsx` | [REQ-377/AC-13] closes on Escape key, backdrop click, or close button | AC-13 | PASS |
| `frontend/src/components/LoraModals/__tests__/LoraDetailModal.test.tsx` | [REQ-377/AC-14] desktop layout maintains 2-column grid and right pane buttons | AC-14 | PASS |
| `frontend/src/components/TagSetModals/__tests__/TagSetFormFields.test.tsx` | [REQ-377/AC-9][REQ-377/AC-10] renders subsets container without internal scroll constraints to allow natural expansion in parent | AC-9 | PASS |
| `frontend/src/pages/__tests__/TagsPage.test.tsx` | [REQ-377/AC-8] Card edit button and detail edit button open identical TagSetDetailModal edit state | AC-8 | PASS |

### REQ-379 (計 6 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `backend/tests/integration/legacy/test_comfy_proxy.py` | test_comfy_router_dead_code_eliminated_req379_ac3: [REQ-379/AC-3] comfy.py の get_comfy_thumbnail 内から _check_comfy_exists が完全除去されていること。 | AC-3 | PASS |
| `backend/tests/integration/legacy/test_residual_history.py` | test_residual_history_deduplicates_and_returns_unseen_page_req379_ac3: [REQ-379/AC-3] ComfyUIへの原画プローブを行わず、未表示の候補ページを直接 items として返却すること。 | AC-3 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateDisplayState.availability.test.tsx` | retains trial history image even if upstream ComfyUI original is missing [REQ-379/AC-2] | AC-2 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateDisplayState.availability.test.tsx` | retains snapshot identity even if marked missing in job output [REQ-379/AC-2] | AC-2 | PASS |
| `frontend/src/pages/GeneratePage/sections/__tests__/GenerationGallerySection.probing.test.tsx` | does not trigger image availability probe on thumbnail load [REQ-379/AC-1] | AC-1 | PASS |
| `frontend/src/pages/GeneratePage/sections/__tests__/GenerationGallerySection.probing.test.tsx` | retries thumbnail reload on retry click without probing ComfyUI [REQ-379/AC-1] | AC-1 | PASS |

### REQ-380 (計 17 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/e2e/serverManager.spec.ts` | [REQ-380/AC-1] idle request reaches native free once and reports acceptance only | AC-1 | PASS |
| `frontend/e2e/serverManager.spec.ts` | [REQ-380/AC-2] repeated clicks and another client share the Manager lock | AC-2 | PASS |
| `frontend/e2e/serverManager.spec.ts` | [REQ-380/AC-3] queued, executing, and unknown Comfy states fail closed | AC-3 | PASS |
| `frontend/e2e/serverManager.spec.ts` | [REQ-380/AC-4] stopped ComfyUI is disabled and never receives native free | AC-4 | PASS |
| `frontend/e2e/serverManager.spec.ts` | [REQ-380/AC-1] error and unconfirmed native response do not retry or imply completion | AC-1 | PASS |
| `frontend/e2e/serverManager.spec.ts` | [REQ-380/AC-1] native timeout is unconfirmed and does not resend the action POST | AC-1 | PASS |
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-380/AC-1] [REQ-381/AC-11] 375/767/768/1280px: Manager action stays accessible and contained | AC-1 | PASS |
| `frontend/src/api/domains/__tests__/systemManager.test.ts` | [REQ-380/AC-1] posts the fixed free-memory Manager request and accepts only explicit acknowledgement | AC-1 | PASS |
| `frontend/src/api/domains/__tests__/systemManager.test.ts` | [REQ-380/AC-1] classifies a validated unsent denial and an unconfirmed gateway response separately | AC-1 | PASS |
| `frontend/src/api/domains/__tests__/systemManager.test.ts` | [REQ-380/AC-1] keeps invalid Comfy execution metadata fail-closed | AC-1 | PASS |
| `frontend/src/api/domains/__tests__/systemManager.test.ts` | [REQ-380/AC-1] PBT: invalid queue counts never preserve an idle execution state | AC-1 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/ServiceConnectionCard.test.tsx` | [REQ-380/AC-2] drains a pre-POST status GET and a fresh post-ACK GET before unlocking | AC-2 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/ServiceConnectionCard.test.tsx` | [REQ-380/AC-2] gates free-memory on known idle Comfy status, sends once, acknowledges, and refetches | AC-2 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/VramGuardSection.test.tsx` | [REQ-380/AC-5] reflects the next connected SYSTEM_STATS VRAM sample exactly | AC-5 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/VramGuardSection.test.tsx` | [REQ-380/AC-5] reflects fallback VRAM telemetry within five seconds after WebSocket disconnect | AC-5 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/VramGuardSection.test.tsx` | [REQ-380/AC-4] shows a refresh error when the disconnected WebSocket VRAM query fails | AC-4 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/VramGuardSection.test.tsx` | [REQ-380/AC-5] preserves a dirty threshold when a disconnected refresh returns server values | AC-5 | PASS |

### REQ-381 (計 89 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-381/AC-9] 375px: direct #system selection scrolls the selected tab fully into view | AC-9 | PASS |
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-381/AC-1] 375px: all Settings tabs and representative values survive tab changes | AC-1 | PASS |
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-381/AC-2] 320/375/767px: every Settings panel stays within viewport and cards do not overlap | AC-2 | PASS |
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-381/AC-3] 375px: Add Master remains directly available beside the management menu | AC-3 | PASS |
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-381/AC-4] 375px: mapping management menu opens and Escape restores focus | AC-4 | PASS |
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-381/AC-5] 375px: info explanations stay inline while validation text remains visible | AC-5 | PASS |
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-381/AC-6] 375px: info popup has opaque readable content and closes on Escape | AC-6 | PASS |
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-381/AC-7] 375px: numeric draft is not sent until commit and repeated blur is idempotent | AC-7 | PASS |
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-381/AC-7] 375px: a 503 commit preserves the numeric draft and exposes failure | AC-7 | PASS |
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-381/AC-8] 375px: prompt and translation drafts wait for explicit Save | AC-8 | PASS |
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-381/AC-8] 375px: workflow import preview requires the final explicit apply | AC-8 | PASS |
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-381/AC-9] 375px: Settings tab buttons support direct keyboard selection | AC-9 | PASS |
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-381/AC-9] 375px: native Chromium touch swipe honors distance threshold and changes tabs | AC-9 | PASS |
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-381/AC-10] 375x450: tone create modal keeps Cancel and Save visible | AC-10 | PASS |
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-381/AC-10] 375px: tone edit Cancel keeps draft local until explicit Save | AC-10 | PASS |
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-381/AC-10] 375x812: simulated visualViewport keeps tone footer above the keyboard boundary | AC-10 | PASS |
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-381/AC-12] 767/768: resize preserves numeric draft without saving | AC-12 | PASS |
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-381/AC-12] dirty native reload beforeunload Cancel keeps the latest draft | AC-12 | PASS |
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-381/AC-12] dirty POP Cancel after real Settings history navigation preserves draft | AC-12 | PASS |
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-381/AC-12] in-flight Save ${outcome.label} keeps Leave disabled until settle without auto-navigation | AC-12 | PASS |
| `frontend/e2e/settingsResponsive.spec.ts` | [REQ-381/AC-12] 768/1024/1280px: desktop layout, Settings hash history and History navigation work | AC-12 | PASS |
| `frontend/src/__tests__/App.routing.test.tsx` | [REQ-381/AC-12] preserves all existing routes and mounts Settings below its draft boundary | AC-12 | PASS |
| `frontend/src/__tests__/App.routing.test.tsx` | [REQ-381/AC-12] rethrows route render failures to an outer React error boundary | AC-12 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsAutosave.integration.test.tsx` | [REQ-381/AC-7] sends a real bubble update after a mobile number field is confirmed | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsAutosave.integration.test.tsx` | [REQ-381/AC-7] keeps an invalid bubble number raw and prevents an API request | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsAutosave.integration.test.tsx` | [REQ-381/AC-7] keeps the draft and error visible after the real API rejects a save | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsAutosave.integration.test.tsx` | [REQ-381/AC-7] waits for a mobile range release before sending the translation debounce value | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsAutosave.integration.test.tsx` | [REQ-381/AC-7] retains a failed translation debounce draft until explicit retry | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsAutosave.integration.test.tsx` | [REQ-381/AC-7] keeps the workflow long-press value in memory and reports denied storage | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsAutosave.integration.test.tsx` | [REQ-381/AC-12] confirms unsaved base-model form edits before navigation | AC-12 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsAutosave.integration.test.tsx` | [REQ-381/AC-7] commits the VRAM threshold on mobile release with one real API payload | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsAutosave.integration.test.tsx` | [REQ-381/AC-7] retains the VRAM threshold draft and error after a 503 response | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsAutosave.integration.test.tsx` | [REQ-381/AC-7] preserves desktop VRAM explicit Save behavior | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsAutosave.integration.test.tsx` | [REQ-381/AC-7] sends a guard toggle with the last valid threshold while preserving invalid threshold text | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsAutosave.integration.test.tsx` | [REQ-381/AC-7] property-checks threshold boundaries, invalid zero, and duplicate release events | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsAutosave.integration.test.tsx` | [REQ-381/AC-7] keeps the newest VRAM revision when an older delayed save acknowledges | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-381/AC-2] applies mobile density only to explicit Settings shell and Base Model wrappers | AC-2 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/LlmSettingsSection.test.tsx` | [REQ-381/AC-7] commits valid mobile numeric edits on blur and Enter only once | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/LlmSettingsSection.test.tsx` | [REQ-381/AC-7] preserves explicit desktop numeric Save | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/LlmSettingsSection.test.tsx` | [REQ-381/AC-7] does not commit an empty invalid numeric draft | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/LlmSettingsSection.test.tsx` | [REQ-381/AC-7] keeps exact numeric text until blur and sends the parsed number once | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/LlmSettingsSection.test.tsx` | [REQ-381/AC-7] blocks the whole resource while any numeric field is invalid | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/LlmSettingsSection.test.tsx` | [REQ-381/AC-7] commits mobile ranges on pointerup or keyboard release but not pointercancel | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/LlmSettingsSection.test.tsx` | [REQ-381/AC-8] keeps prompt drafts explicit-save on mobile | AC-8 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.test.tsx` | [REQ-381/AC-3] mobile keeps Add Master visible and opens existing stage dialog from the management menu | AC-3 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.test.tsx` | [REQ-381/AC-4] choosing a custom type action closes the menu and opens its existing manager dialog | AC-4 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.test.tsx` | [REQ-381/AC-3] menu supports Home/End/Escape, outside dismissal and desktop keeps direct controls | AC-3 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.test.tsx` | [REQ-381/AC-4] MappingMaster create draft blocks route exit; Cancel retains it and Leave discards it | AC-4 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.test.tsx` | [REQ-381/AC-4] ParamType form input capture blocks a real Settings route exit | AC-4 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.test.tsx` | [REQ-381/AC-4] MappingMaster keeps route blocked after close while save is pending, then releases on success | AC-4 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.test.tsx` | [REQ-381/AC-4] ParamType create mutation exposes pending blocking and failed-settled protection | AC-4 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/ServiceConnectionCard.test.tsx` | [REQ-381/AC-11] wraps service status before its accessible 44px log action while keeping the desktop row | AC-11 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/SettingInfoPopover.test.tsx` | [REQ-381/AC-5] desktop keeps the existing description inline without an info trigger | AC-5 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/SettingInfoPopover.test.tsx` | [REQ-381/AC-5] mobile opens one accessible nonmodal portal and toggles it closed | AC-5 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/SettingInfoPopover.test.tsx` | [REQ-381/AC-6] Escape restores focus, outside click and viewport resize close, internal scroll stays open | AC-6 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/SettingInfoPopover.test.tsx` | [REQ-381/AC-6] closes when its Settings tabpanel becomes hidden and when an ancestor scrolls | AC-6 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/SettingInfoPopover.test.tsx` | [REQ-381/AC-6] clamps to the visible viewport and releases portal/listeners on visualViewport change and unmount | AC-6 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/SettingsDraftBoundary.test.tsx` | [REQ-381/AC-7] blocks a dirty route exit and Cancel preserves the current Settings screen | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/SettingsDraftBoundary.test.tsx` | [REQ-381/AC-7] allows same Settings hash/query navigation and clean exits | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/SettingsDraftBoundary.test.tsx` | [REQ-381/AC-7] blocks navigation when draft update and navigate happen in the same event | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/SettingsDraftBoundary.test.tsx` | [REQ-381/AC-7] invokes queue cancellation and local discard once on explicit Leave | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/SettingsDraftBoundary.test.tsx` | [REQ-381/AC-7] registers beforeunload only while risky and removes it on unmount | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/SettingsDraftBoundary.test.tsx` | [REQ-381/AC-7] treats a trailing-slash Settings route as protected | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/SettingsDraftBoundary.test.tsx` | [REQ-381/AC-7] preserves the draft and uses the latest destination after repeated navigation | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/SpeechToneSection.test.tsx` | [REQ-381/AC-8] real draft registration blocks route navigation and Cancel preserves the unsaved modal draft | AC-8 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/SpeechToneSection.test.tsx` | [REQ-381/AC-8] an untouched empty create form does not block navigation | AC-8 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/SpeechToneSection.test.tsx` | [REQ-381/AC-8] successful explicit Save sends normalized real-client payload and closes the modal | AC-8 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/SpeechToneSection.test.tsx` | [REQ-381/AC-10] modal keeps its common bottom sheet, scroll body, and left Cancel/right Save actions | AC-10 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/SpeechToneSection.test.tsx` | [REQ-381/AC-10] tone sheet follows the visual viewport height and top offset | AC-10 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/SpeechToneSection.test.tsx` | [REQ-381/AC-2] keeps the existing responsive preset card and mobile touch targets | AC-2 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/SpeechToneSection.test.tsx` | [REQ-381/AC-8] failed Save keeps the real modal draft and exposes the server error | AC-8 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/SpeechToneSection.test.tsx` | [REQ-381/AC-8] deferred Save keeps route Leave disabled and prevents an old acknowledgement from clearing a newer edit | AC-8 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/ThumbnailSettingsSection.test.tsx` | [REQ-381/AC-7] preserves the selected aspect ratio when mobile localStorage rejects the save | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/ThumbnailSettingsSection.test.tsx` | [REQ-381/AC-7] clears the mobile success message after its transient interval | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/context/__tests__/SettingsDraftContext.test.tsx` | [REQ-381/AC-7] aggregates registered draft risk without retaining values | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/hooks/__tests__/useSettingsCommit.test.tsx` | [REQ-381/AC-7] stages raw snapshots without saving until explicit commit | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/hooks/__tests__/useSettingsCommit.test.tsx` | [REQ-381/AC-7] allows only one request per key and coalesces queued snapshots to the latest | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/hooks/__tests__/useSettingsCommit.test.tsx` | [REQ-381/AC-7] suppresses an identical snapshot submitted while that snapshot is in flight | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/hooks/__tests__/useSettingsCommit.test.tsx` | [REQ-381/AC-7] keeps different resource keys independent | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/hooks/__tests__/useSettingsCommit.test.tsx` | [REQ-381/AC-7] rejects invalid null snapshots without sending | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/hooks/__tests__/useSettingsCommit.test.tsx` | [REQ-381/AC-7] keeps a newer revision after the older in-flight request resolves | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/hooks/__tests__/useSettingsCommit.test.tsx` | [REQ-381/AC-7] stops after failure until explicit retry | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/hooks/__tests__/useSettingsCommit.test.tsx` | [REQ-381/AC-7] property: arbitrary committed snapshots never overlap per key and finish at the latest | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/hooks/__tests__/useSettingsCommit.test.tsx` | [REQ-381/AC-7] ignores queued completions after unmount without starting another save or timer | AC-7 | PASS |
| `frontend/src/pages/SettingsPage/hooks/__tests__/useSettingsSwipe.test.tsx` | [REQ-381/AC-9] resolves only a neighboring tab for a qualifying horizontal swipe and does not wrap at either end | AC-9 | PASS |
| `frontend/src/pages/SettingsPage/hooks/__tests__/useSettingsSwipe.test.tsx` | [REQ-381/AC-9] rejects pointer, vertical-first, interactive, horizontal-scroll, and open-overlay states | AC-9 | PASS |
| `frontend/src/pages/SettingsPage/hooks/__tests__/useSettingsSwipe.test.tsx` | [REQ-381/AC-9] PBT: protected inputs and non-qualifying geometry never select a tab | AC-9 | PASS |
| `frontend/src/pages/SettingsPage/hooks/__tests__/useSettingsSwipe.test.tsx` | [REQ-381/AC-9] changes once on a primary touch swipe and ignores pointercancel, a second pointer, buttons, and overlays | AC-9 | PASS |
| `frontend/src/pages/SettingsPage/hooks/__tests__/useSettingsSwipe.test.tsx` | [REQ-381/AC-2] uses the 767px media query, responds to changes, and removes its listener | AC-2 | PASS |

### REQ-383 (計 37 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/e2e/generateMobileGallery.spec.ts` | [REQ-383/AC-1..3] Desktop: continuous horizontal reel, initial center alignment with edge margins, and wheel inertia snap | - | VIOLATION |
| `frontend/e2e/generateMobileGallery.spec.ts` | [REQ-383/AC-4] Desktop: mixed aspect ratios maintain native proportions without distortion or container overflow | AC-4 | PASS |
| `frontend/e2e/generateMobileGallery.spec.ts` | [REQ-383/AC-5..6] Desktop: latest and oldest jump buttons cancel inertia and center target tiles | - | VIOLATION |
| `frontend/e2e/generateMobileGallery.spec.ts` | [REQ-383/AC-7..8] Desktop: history thumbnail click centers preview in normal mode, suppressed in multi-select mode | - | VIOLATION |
| `frontend/e2e/generateMobileGallery.spec.ts` | [REQ-383/AC-9] Desktop: boundary close bar collapses history and restores preview to full height | AC-9 | PASS |
| `frontend/e2e/generateMobileGallery.spec.ts` | [REQ-383/AC-10..11] Desktop: auto-follow and session filter bidirectional sync between reel toolbar and history pane | - | VIOLATION |
| `frontend/e2e/generateMobileGallery.spec.ts` | [REQ-383/AC-12] Desktop: tile click opens HistoryModalPreview and Escape closes it | AC-12 | PASS |
| `frontend/e2e/generateMobileGallery.spec.ts` | [REQ-383/AC-13] Desktop: preserves history bulk actions and snapshot tab switching in desktop history pane | AC-13 | PASS |
| `frontend/e2e/generateMobileGallery.spec.ts` | [REQ-383/AC-14] Desktop: document.body does not overflow horizontally during reel interactions | AC-14 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/DesktopLayout.test.tsx` | [REQ-383/AC-12] clicking tile in desktop preview invokes onOpenModal | AC-12 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/DesktopLayout.test.tsx` | [REQ-383/AC-13] preserves history bulk actions and snapshot tab switching in desktop layout | AC-13 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/GenerateParallelPreview.test.tsx` | [REQ-383/AC-1] renders images in latest-first order (index 0 is newest) without pagination buttons | AC-1 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/GenerateParallelPreview.test.tsx` | [REQ-383/AC-2] applies non-compressing edge margins (marginLeft/marginRight) so first and last tiles can center | AC-2 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/GenerateParallelPreview.test.tsx` | [REQ-383/AC-3] accumulates wheel impulse smoothly and snaps nearest tile to center after inertia decay | AC-3 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/GenerateParallelPreview.test.tsx` | [REQ-383/AC-4] preserves portrait, square, and 2:1 landscape aspect ratios within viewport bounds | AC-4 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/GenerateParallelPreview.test.tsx` | [REQ-383/AC-5] shows return-to-latest button when scrolled into history and immediately stops inertia to center newest tile | AC-5 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/GenerateParallelPreview.test.tsx` | [REQ-383/AC-6] jump-to-oldest button immediately stops inertia and centers oldest tile | AC-6 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/GenerateParallelPreview.test.tsx` | [REQ-383/AC-7] centers requested image when centerRequest is received in normal mode | AC-7 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/GenerateParallelPreview.test.tsx` | [REQ-383/AC-8] does not jump or change scroll when isMultiSelectMode is active despite centerRequest | AC-8 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/GenerateParallelPreview.test.tsx` | [REQ-383/AC-10] renders auto-follow toggle in reel toolbar and invokes onToggleAutoFollow | AC-10 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/GenerateParallelPreview.test.tsx` | [REQ-383/AC-11] renders session filter toggle in reel toolbar and invokes onToggleFilterOwnSession | AC-11 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/GenerateParallelPreview.test.tsx` | [REQ-383/AC-12] clicking reel tile selects image and calls onOpen for detail modal | AC-12 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/GenerateParallelPreview.test.tsx` | [REQ-383/AC-14] constrains reel container with min-w-0 and overflow-hidden to prevent body overflow | AC-14 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/GenerateParallelPreview.test.tsx` | [REQ-383/RT-1] handles empty images array without NaN or crashing | - | VIOLATION |
| `frontend/src/pages/GeneratePage/components/__tests__/GenerateParallelPreview.test.tsx` | [REQ-383/RT-4] anchors scroll position on prepended new image when previewAutoFollow is false | - | VIOLATION |
| `frontend/src/pages/GeneratePage/components/__tests__/previewLayoutIntegration.test.tsx` | [REQ-383/AC-7] centers main preview when clicking history thumbnail in normal mode | AC-7 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/previewLayoutIntegration.test.tsx` | [REQ-383/AC-8] keeps scrollLeft unchanged during multi-select thumbnail clicks | AC-8 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/previewLayoutIntegration.test.tsx` | [REQ-383/AC-9] boundary close button collapses history and restores height | AC-9 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/previewLayoutIntegration.test.tsx` | [REQ-383/AC-10] bidirectional auto-follow sync between reel toolbar and history pane | AC-10 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/previewLayoutIntegration.test.tsx` | [REQ-383/AC-11] bidirectional session filter sync between reel toolbar and history pane | AC-11 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateDisplayState.test.tsx` | [REQ-383/AC-1] keeps sortedDisplayImages fixed to newest-first order | AC-1 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateDisplayState.test.tsx` | [REQ-383/AC-8] does not overwrite selectedImg when selecting items in multi-select mode | AC-8 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx` | should integrate with useMultiSelect state without synchronizing preview image on modifier click (REQ-383/AC-8) | - | VIOLATION |
| `frontend/src/pages/GeneratePage/sections/__tests__/GenerationGallerySection.cache.test.tsx` | [REQ-383/AC-1] does not render sort order toggle button in desktop history toolbar | AC-1 | PASS |
| `frontend/src/pages/GeneratePage/sections/__tests__/GenerationGallerySection.cache.test.tsx` | [REQ-383/AC-7] triggers onCenterPreviewImage and selects image on normal thumbnail click | AC-7 | PASS |
| `frontend/src/pages/GeneratePage/sections/__tests__/GenerationGallerySection.cache.test.tsx` | [REQ-383/AC-8] does not trigger preview center scroll when clicking thumbnail in multi-select mode or with modifier keys | AC-8 | PASS |
| `frontend/src/pages/GeneratePage/sections/__tests__/GenerationGallerySection.cache.test.tsx` | [REQ-383/AC-13] preserves multi-select checkboxes, bulk save, clear selection, and snapshots tab operations | AC-13 | PASS |

### REQ-385 (計 5 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `backend/tests/integration/legacy/test_comfy_generation_bridge.py` | test_single_interrupt_preflights_target_once_and_never_interrupts_wrong_prompt: [REQ-385/AC-2] Single preflight check ensures fast interrupt dispatch without redundant queue reads. | AC-2 | PASS |
| `backend/tests/integration/legacy/test_comfy_generation_bridge.py` | test_single_interrupt_posts_immediately_when_target_matches: [REQ-385/AC-2] When target matches uniquely running prompt, /interrupt POST is sent with single queue check. | AC-2 | PASS |
| `backend/tests/integration/legacy/test_comfy_generation_bridge.py` | test_executing_null_node_clears_latest_preview: [REQ-385/AC-2] Executing event with node: null clears ephemeral preview cache. | AC-2 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_executing_null_node_immediately_completes_job_and_publishes_snapshot: [REQ-385/AC-1] ComfyUI executing event with node: null signals prompt completion. | AC-1 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_cancel_running_job_with_executing_null_node_transitions_to_cancelled: [REQ-385/AC-3] Cancelled running job transitioning via executing(node: null) is confirmed as cancelled. | AC-3 | PASS |

### REQ-386 (計 11 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `backend/tests/integration/legacy/test_generation_service.py` | test_progress_event_without_prompt_id_binds_to_single_active_job: [REQ-386/AC-1] progress event without prompt_id falls back to single active running job. | AC-1 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_progress_event_with_integer_node_id_updates_node_progress: [REQ-386/AC-1] progress event with integer node ID safely normalizes to string and updates progress. | AC-1 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_progress_event_boundary_zero_division_and_clamp: [REQ-386/AC-1] progress event boundary: zero max or zero value does not raise ZeroDivisionError and safely updates node. | AC-1 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_progress_event_multiple_jobs_without_prompt_id_dropped: [REQ-386/AC-1] progress event without prompt_id is safely ignored when multiple running jobs exist. | AC-1 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/GenerationProgress.test.tsx` | [REQ-386/AC-1] displays individual node progress percentage and name with store fallback when managed job lacks node | AC-1 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/GenerationProgress.test.tsx` | [REQ-386/AC-2] immediately renders newly completed auto-follow image in desktop preview without waiting for next batch job | AC-2 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/GenerationProgress.test.tsx` | [REQ-386/AC-3] displays 100 percent completion and latest image preview upon batch completion | AC-3 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/GenerationProgress.test.tsx` | [REQ-386/AC-3] keeps 100 percent progress and does not revert to 0 on final event | AC-3 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateDisplayState.test.tsx` | [REQ-386/AC-2] preserves pendingAutoFollowUrl until image is confirmed in sortedDisplayImages | AC-2 | PASS |
| `frontend/src/store/__tests__/slices/connectionSlice.test.ts` | [REQ-386/AC-2] clears obsolete previewImage immediately upon autoFollowImage transition even if next job has no preview frame | AC-2 | PASS |
| `frontend/src/store/__tests__/slices/connectionSlice.test.ts` | [REQ-386/AC-2] safely skips autoFollowImage when outputs array is empty upon completion | AC-2 | PASS |

### REQ-387 (計 20 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `backend/tests/integration/legacy/test_generation_api.py` | test_req387_ac1_state_is_typed_503_when_key_read_fails_with_warm_snapshot_cache: [REQ-387/AC-1] A failing revision/normal_group_id read gives a typed 503 even when a snapshot is cached. | AC-1 | PASS |
| `backend/tests/integration/legacy/test_generation_api.py` | test_req387_ac4_out_of_window_terminal_job_keeps_preview_and_availability_results: [REQ-387/AC-4] A terminal job outside the snapshot window still resolves preview/availability; unknown IDs are 404. | AC-4 | PASS |
| `backend/tests/integration/legacy/test_generation_integration.py` | test_req387_ac3_event_loop_lag_and_preview_latency_with_1000_terminal_jobs: [REQ-387/AC-3] 1000件の終端jobがある状態でプレビューを連続受信しても、ループ遅延とAPI応答が閾値内に収まる. | AC-3 | PASS |
| `backend/tests/integration/legacy/test_generation_integration.py` | test_req387_ac2_preview_frames_do_not_reload_generation_jobs: [REQ-387/AC-2] プレビューフレームの連続受信区間で generation_jobs の SELECT がフレーム数に比例して増えない. | AC-2 | PASS |
| `backend/tests/integration/legacy/test_generation_integration.py` | test_req387_ac4_cancel_returns_within_budget_while_previews_stream: [REQ-387/AC-4] プレビュー受信中でも単件・一括の取消が2秒以内に既知の outcome で応答する. | AC-4 | PASS |
| `backend/tests/integration/legacy/test_generation_repository.py` | test_req387_ac1_snapshot_window_contains_active_group_recent_batches_and_released_top10: [REQ-387/AC-1] The snapshot window keeps the active group, non-terminal batches, latest 20 batches and released top 10 per session. | AC-1 | PASS |
| `backend/tests/integration/legacy/test_generation_repository.py` | test_req387_ac8_window_progress_matches_full_snapshot: [REQ-387/AC-8] Window results match the full-table definition for group, batch, unconfirmed and released top-10 sets. | AC-8 | PASS |
| `backend/tests/integration/legacy/test_generation_repository.py` | test_req387_ac1_snapshot_cache_hit_skips_job_rows_and_every_write_invalidates: [REQ-387/AC-1] A cache hit issues no generation_jobs SELECT, and every write path invalidates the cached snapshot. | AC-1 | PASS |
| `backend/tests/integration/legacy/test_generation_repository.py` | test_req387_ac8_snapshot_time_budget_with_1000_terminal_jobs: [REQ-387/AC-8] With 1000 terminal jobs of ~27KB metadata, a cache miss is <= 150ms, a hit <= 10ms, and the window stays bounded. | AC-8 | PASS |
| `backend/tests/integration/legacy/test_generation_repository.py` | test_req387_ac1_get_job_and_find_job_by_prompt_read_out_of_window_rows: [REQ-387/AC-1] get_job and find_job_by_prompt return terminal rows outside the window and None for unknown IDs. | AC-1 | PASS |
| `backend/tests/integration/legacy/test_generation_repository.py` | test_req387_ac1_snapshot_with_empty_normal_group_id_has_no_group_condition: [REQ-387/AC-1] An absent or empty normal_group_id adds no group condition and snapshot() does not raise. | AC-1 | PASS |
| `backend/tests/integration/legacy/test_generation_repository.py` | test_req387_ac1_released_ranking_survives_invalid_release_json_and_falls_back_to_job_id_desc: [REQ-387/AC-1] Invalid or non-object release_json ranks last (job_id DESC) without failing the snapshot query. | AC-1 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_req387_ac2_preview_frame_reads_snapshot_once_and_advances_revision: [REQ-387/AC-2] One preview frame reads the snapshot at most three times, advances the wire revision, and publishes once. | AC-2 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_req387_ac4_cancel_and_release_for_out_of_window_jobs_keep_results: [REQ-387/AC-4] Out-of-window jobs resolve by id or prompt and give the same result as in-window jobs. | AC-4 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_req387_ac4_unknown_job_is_rejected_as_not_found: [REQ-387/AC-4] An unknown job id is rejected with 'job not found' for cancel and release. | AC-4 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_req387_ac6_reconcile_failure_log_schedule_is_bounded: [REQ-387/AC-6] Reconcile failure counts that are logged at WARNING level are exactly the backoff points. | AC-6 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_req387_ac6_reconcile_failure_logs_once_then_backoff_and_recovery: [REQ-387/AC-6] Repeated reconcile failures warn once with a traceback, then one recovery INFO is logged. | AC-6 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_req387_ac6_five_consecutive_connect_errors_log_one_warning_and_one_recovery: [REQ-387/AC-6] Five or more consecutive ConnectError failures log one traceback WARNING and one recovery INFO. | AC-6 | PASS |
| `backend/tests/unit/test_config.py` | test_req387_ac7_sqlite_file_engine_uses_wal_and_busy_timeout: [REQ-387/AC-7] SQLite file engine gets WAL journal mode and busy_timeout=5000 on connect. | AC-7 | PASS |
| `backend/tests/unit/test_config.py` | test_req387_ac7_httpx_logger_is_warning_after_setup_logging: [REQ-387/AC-7] setup_logging raises httpx and httpcore loggers to WARNING. | AC-7 | PASS |

### REQ-394 (計 5 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `backend/tests/governance/test_pytest_collection.py` | test_root_pytest_ini_declares_testpaths_for_backend_and_tests: [REQ-394/AC-3] The root ini limits a no-argument run to backend/tests and tests. | AC-3 | PASS |
| `backend/tests/governance/test_pytest_collection.py` | test_collection_without_args_skips_db_docs_frontend_dirs: [REQ-394/AC-3] Same-basename tests under db/, docs/, frontend/ are not walked; the control collides. | AC-3 | PASS |
| `backend/tests/integration/legacy/test_comfy_proxy.py` | test_prune_disk_cache_if_needed | - | VIOLATION |
| `frontend/src/test/utils/queryHelpers.test.ts` | [REQ-394/AC-1] node-environment files run without a DOM | AC-1 | PASS |
| `frontend/src/test/utils/storeHelpers.test.ts` | [REQ-394/AC-1] files without a docblock keep the jsdom default | AC-1 | PASS |

### REQ-395 (計 1 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/e2e/generateMobileGallery.spec.ts` | [REQ-395/AC-3] Mobile 375px: app WebSocket /api/ws is served by the stub and never reaches the backend | AC-3 | PASS |

### REQ-401 (計 9 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `backend/tests/integration/legacy/test_generation_api.py` | test_req401_ac2_single_cancel_updates_db_status_to_unconfirmed: [REQ-401/AC-2] Single cancel on a job missing from upstream queue returns 202 unconfirmed and updates DB status to unconfirmed. | AC-2 | PASS |
| `backend/tests/integration/legacy/test_generation_integration.py` | test_req401_ac1_integration_reconcile_upstream_lost_job_releases_normal_group: [REQ-401/AC-1] When an active normal job with prompt_id is lost from upstream, reconcile marks it unconfirmed and normal group closes in real DB. | AC-1 | PASS |
| `backend/tests/integration/legacy/test_generation_integration.py` | test_req401_ac3_integration_bulk_cancel_transitions_upstream_lost_jobs_to_unconfirmed: [REQ-401/AC-3] Bulk cancellation marks upstream-lost active jobs as unconfirmed in DB and returns HTTP 202 with unconfirmed items. | AC-3 | PASS |
| `backend/tests/integration/legacy/test_generation_integration.py` | test_req401_ac4_integration_released_unconfirmed_job_is_cleared: [REQ-401/AC-4] A job transitioned to unconfirmed via upstream loss can be released via POST /api/generation/release. | AC-4 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_req401_ac1_reconcile_upstream_lost_job_transitions_to_unconfirmed_and_closes_normal_group: [REQ-401/AC-1] When a prompt_id-bound active job is absent from upstream queue and history is empty, reconcile marks it unconfirmed and normal group closes. | AC-1 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_req401_ac2_single_and_queued_cancel_when_upstream_lost_transitions_to_unconfirmed: [REQ-401/AC-2] When a prompt_id-bound job is cancelled while absent from upstream queue, outcome is unconfirmed and DB status is updated to unconfirmed. | AC-2 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_req401_ac4_unconfirmed_transitioned_job_can_be_released: [REQ-401/AC-4] A job transitioned to unconfirmed via upstream loss can be released to status released. | AC-4 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_req401_ac3_bulk_cancel_normal_with_stale_running_job_transitions_to_unconfirmed: [REQ-401/AC-3] When a normal job has prompt_id and running status in DB but upstream queue is empty, bulk cancel marks it unconfirmed. | AC-3 | PASS |
| `backend/tests/integration/legacy/test_generation_service.py` | test_req401_ac3_bulk_cancel_global_with_upstream_lost_jobs_transitions_to_unconfirmed: [REQ-401/AC-3] When a job has prompt_id and running status in DB but upstream queue is empty, global cancel marks it unconfirmed. | AC-3 | PASS |

### REQ-402 (計 35 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/e2e/generatePresetTabs.spec.ts` | [REQ-402/AC-2] close-others | AC-2 | PASS |
| `frontend/e2e/generatePresetTabs.spec.ts` | [REQ-402/AC-3] close-left-offscreen | AC-3 | PASS |
| `frontend/e2e/generatePresetTabs.spec.ts` | [REQ-402/AC-4] close-right-offscreen | AC-4 | PASS |
| `frontend/e2e/generatePresetTabs.spec.ts` | [REQ-402/AC-9] reopen-preserves-preset | AC-9 | PASS |
| `frontend/e2e/generatePresetTabs.spec.ts` | [REQ-402/AC-10] reload-persists-tabs | AC-10 | PASS |
| `frontend/e2e/generatePresetTabs.spec.ts` | [REQ-402/AC-11] cancel-focus | AC-11 | PASS |
| `frontend/e2e/generatePresetTabs.spec.ts` | [REQ-402/AC-12] gesture-preservation | AC-12 | PASS |
| `frontend/e2e/generatePresetTabs.spec.ts` | [REQ-402/AC-13] tap-menu | AC-13 | PASS |
| `frontend/e2e/generatePresetTabs.spec.ts` | [REQ-402/AC-7] [REQ-402/AC-8] save-abort-retains-draft-and-tabs | AC-7 | PASS |
| `frontend/e2e/generatePresetTabs.spec.ts` | [REQ-402/AC-6] active-fallback | AC-6 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/DesktopLayout.tabs.test.tsx` | [REQ-402/AC-1] context-open-preserves-state and tap-menu | AC-1 | PASS |
| `frontend/src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx` | [REQ-402/AC-5] no-target-disabled and tap-menu does not select tab | AC-5 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/usePresetTabClose.integration.test.tsx` | [REQ-402/AC-7] waits-for-ack | AC-7 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/usePresetTabClose.integration.test.tsx` | [REQ-402/AC-7] active-target-flushes-editor | AC-7 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/usePresetTabClose.integration.test.tsx` | [REQ-402/AC-7] initial-load-does-not-autosave | AC-7 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/usePresetTabClose.integration.test.tsx` | [REQ-402/AC-7] autosave-flush-preserves-history-and-active-snapshot-on-failure | AC-7 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/usePresetTabClose.integration.test.tsx` | [REQ-402/AC-7] new-preset-ack-is-not-overwritten-by-old-editor | AC-7 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/usePresetTabClose.integration.test.tsx` | [REQ-402/AC-8] close-abort-retains-current-params-and-invalid-chip | AC-8 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/usePresetTabClose.integration.test.tsx` | [REQ-402/AC-8] partial-save-abort | AC-8 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/usePresetTabClose.integration.test.tsx` | [REQ-402/AC-8] failed-active-target-close-keeps-retry-notice-after-debounce | AC-8 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/usePresetTabClose.integration.test.tsx` | [REQ-402/AC-8] inactive-target-failure-does-not-pause-active-editor-autosave | AC-8 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/usePresetTabClose.integration.test.tsx` | [REQ-402/AC-8] conflict-keeps-draft-without-retry | AC-8 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/usePresetTabClose.integration.test.tsx` | [REQ-402/AC-8] disconnect-keeps-draft | AC-8 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/usePresetTabClose.integration.test.tsx` | [REQ-402/AC-7] edit-during-save-aborts | AC-7 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/usePresetTabClose.integration.test.tsx` | [REQ-402/AC-7] workflow-switch-invalidates-late-ack | AC-7 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/usePresetTabClose.integration.test.tsx` | [REQ-402/AC-7] unmount-invalidates-late-ack | AC-7 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/usePresetTabClose.integration.test.tsx` | [REQ-402/AC-12] open-order-change-aborts | AC-12 | PASS |
| `frontend/src/store/__tests__/slices/multiSetSlice.test.ts` | [REQ-402/AC-10] reload-persists-tabs | AC-10 | PASS |
| `frontend/src/store/__tests__/slices/multiSetSlice.test.ts` | [REQ-402/AC-3] close-left-offscreen | AC-3 | PASS |
| `frontend/src/store/__tests__/slices/multiSetSlice.test.ts` | [REQ-402/AC-4] close-right-offscreen | AC-4 | PASS |
| `frontend/src/store/__tests__/slices/multiSetSlice.test.ts` | [REQ-402/AC-2] close-others | AC-2 | PASS |
| `frontend/src/store/__tests__/slices/multiSetSlice.test.ts` | [REQ-402/AC-6] activate-trigger-when-active-closes | AC-6 | PASS |
| `frontend/src/store/__tests__/slices/multiSetSlice.test.ts` | [REQ-402/AC-5] storage-error-no-memory-commit | AC-5 | PASS |
| `frontend/src/store/__tests__/slices/multiSetSlice.test.ts` | [REQ-402/AC-6] plan-properties | AC-6 | PASS |
| `frontend/src/store/__tests__/slices/multiSetSlice.test.ts` | [REQ-402/AC-5] no-target-disabled | AC-5 | PASS |

### REQ-414 (計 6 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/components/__tests__/SeedField.test.tsx` | [REQ-414/AC-2] renders large integer seed values without error and keeps input enabled | AC-2 | PASS |
| `frontend/src/pages/GeneratePage/__tests__/dedicatedSeedIntegration.test.tsx` | [REQ-414/AC-3] submits large integer seeds (> UINT32_MAX) successfully in fixed batch | AC-3 | PASS |
| `frontend/src/utils/__tests__/seedBatch.test.ts` | [REQ-414/AC-3] increments large fixed seeds sequentially across batch items | AC-3 | PASS |
| `frontend/src/utils/__tests__/seedBatch.test.ts` | [REQ-414/AC-4] generates random seeds within ComfyUI random range [0, 1125899906842624] by default | AC-4 | PASS |
| `frontend/src/utils/__tests__/seedModel.test.ts` | [REQ-414/AC-1] parses safe integers up to MAX_SAFE_SEED, ComfyUI large seeds, and uint32 boundaries | AC-1 | PASS |
| `frontend/src/utils/__tests__/seedModel.test.ts` | [REQ-414/AC-1] folds seeds exceeding MAX_SAFE_SEED into safe integer range via modulo | AC-1 | PASS |

### REQ-415 (計 5 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/components/__tests__/PatternTagInput.test.tsx` | [REQ-415/AC-1] adds tag and clears input when clicking "追加" button | AC-1 | PASS |
| `frontend/src/components/__tests__/PatternTagInput.test.tsx` | [REQ-415/AC-2] has enterKeyHint="done" and adds tag on Enter preventing default | AC-2 | PASS |
| `frontend/src/components/__tests__/PatternTagInput.test.tsx` | [REQ-415/AC-3] automatically commits tag on blur | AC-3 | PASS |
| `frontend/src/components/__tests__/PatternTagInput.test.tsx` | [REQ-415/AC-4] guards against IME composition when pressing Enter | AC-4 | PASS |
| `frontend/src/components/__tests__/PatternTagInput.test.tsx` | [REQ-415/AC-5] disables "追加" button and suppresses add on empty or duplicate text | AC-5 | PASS |

### REQ-417 (計 15 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `backend/tests/governance/test_openapi_contract.py` | test_req417_openapi_binding_rules_and_node_selectors_contract_AC_5: [REQ-417/AC-5] Verify binding rules and node selectors routes and schemas in OpenAPI contract. | AC-5 | PASS |
| `backend/tests/integration/api/test_workflows.py` | test_req417_ac5_binding_rules_crud_and_referencing_roles_guard: [REQ-417/AC-5] BindingRuleSet / NodeSelector CRUD and referencing roles deletion guard. | AC-5 | PASS |
| `backend/tests/integration/legacy/test_workflow_scanner.py` | test_req417_ac2_lexicographical_scan_stages_and_input_name: [REQ-417/AC-2] Lexicographical scan stages 1-4, priorities, node_id order, and input_name. | AC-2 | PASS |
| `backend/tests/integration/legacy/test_workflow_scanner.py` | test_req417_ac3_multi_stage_conflict_specificity_resolution: [REQ-417/AC-3] Multi-stage conflict resolution by specificity (exact > contains, longer pattern) and confirmed pair elimination. | AC-3 | PASS |
| `backend/tests/integration/legacy/test_workflow_scanner_property.py` | test_req417_candidate_sort_key_determinism: [REQ-417/AC-2] Candidate sorting is strictly deterministic and invariant to input permutation. | AC-2 | PASS |
| `backend/tests/integration/models/test_migrations.py` | test_req417_ac1_phase2_migration_lossless_conversion: [REQ-417/AC-1] Phase 2 migration losslessly converts legacy master data into rule sets, entries, and selectors. | AC-1 | PASS |
| `backend/tests/integration/models/test_migrations.py` | test_req417_ac6_phase5_unique_role_physical_constraint: [REQ-417/AC-6] Physical UNIQUE(role) constraint rejects duplicate role insertions. | AC-6 | PASS |
| `backend/tests/integration/models/test_migrations.py` | test_req417_ac7_phase5_composite_unique_constraints_and_null_selector: [REQ-417/AC-7] Composite constraints UNIQUE(master_id, stage_id), UNIQUE(master_id, node_selector_id) and NULL coexistence. | AC-7 | PASS |
| `frontend/src/components/__tests__/MappingMasterEditModal.test.tsx` | [REQ-417/AC-5] renders 3 sections (Master属性, BindingRuleSet, and NodeSelector) via tabs and switches content | AC-5 | PASS |
| `frontend/src/components/__tests__/MappingMasterEditModal.test.tsx` | [REQ-417/AC-5] displays referencing roles and duplicate-and-edit button when referenced_roles.length > 1 | AC-5 | PASS |
| `frontend/src/components/__tests__/MappingMasterEditModal.test.tsx` | [REQ-417/AC-5] duplicate-and-edit forks shared definition into a dedicated stage copy | AC-5 | PASS |
| `frontend/src/components/__tests__/MappingMasterEditModal.test.tsx` | [REQ-417/AC-5] displays in-use error guidance with referenced_roles when deletion fails | AC-5 | PASS |
| `frontend/src/utils/__tests__/workflowParamInjector.test.ts` | [REQ-417/AC-4] directly injects seed into node.inputs.noise_seed when input_name is noise_seed even if param_name is seed | AC-4 | PASS |
| `frontend/src/utils/__tests__/workflowParamInjector.test.ts` | [REQ-417/AC-4] directly injects general parameter using input_name over param_name | AC-4 | PASS |
| `frontend/src/utils/__tests__/workflowParamInjector.test.ts` | [REQ-417/AC-4] gracefully falls back to legacy resolution when input_name is omitted or empty | AC-4 | PASS |

### REQ-418 (計 52 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `backend/tests/integration/api/test_presets.py` | test_variant_ref_ac4_list_reflects_renamed_variant_role: [REQ-418/AC-4] GET preset list reflects updated variant role. | AC-4 | PASS |
| `backend/tests/integration/api/test_presets.py` | test_variant_ref_ac4_list_includes_latest_variant_refs: [REQ-418/AC-4] GET preset list includes latest variant refs and variant_param_values. | AC-4 | PASS |
| `backend/tests/integration/api/test_presets.py` | test_variant_ref_ac4_post_put_role_and_v_keys_roundtrip: [REQ-418/AC-4] Role key and v: key roundtrip with derived and reserved keys. | AC-4 | PASS |
| `backend/tests/integration/api/test_presets.py` | test_variant_ref_ac4_write_drops_unresolved_key_with_warning: [REQ-418/AC-4] Unresolved parameter keys are dropped with warning log. | AC-4 | PASS |
| `backend/tests/integration/api/test_presets.py` | test_variant_ref_ac4_put_bumps_updated_at_and_keeps_conflict_detection: [REQ-418/AC-4] Value-only PUT bumps updated_at and detects concurrency conflict. | AC-4 | PASS |
| `backend/tests/integration/api/test_presets.py` | test_variant_ref_ac4_read_skips_orphan_value_row: [REQ-418/AC-4] GET endpoint skips orphan preset value row and returns 200. | AC-4 | PASS |
| `backend/tests/integration/api/test_presets.py` | test_variant_ref_ac4_workflow_copy_duplicates_values_and_sync_groups: [REQ-418/AC-4] copy_workflow duplicates WorkflowPresetValue and sync groups. | AC-4 | PASS |
| `backend/tests/integration/api/test_presets.py` | test_preset_create_and_get_populates_variant_values_and_variants_list: [REQ-418/AC-4] Preset create populates WorkflowPresetValue records and variants list. | AC-4 | PASS |
| `backend/tests/integration/api/test_presets.py` | test_preset_get_reflects_updated_variant_role_and_master_display_name: [REQ-418/AC-4] Preset GET reflects updated variant role and master display_name. | AC-4 | PASS |
| `backend/tests/integration/api/test_presets.py` | test_copy_workflow_duplicates_preset_values: [REQ-418/AC-4] copy_workflow duplicates preset values. | AC-4 | PASS |
| `backend/tests/integration/api/test_snapshots.py` | test_variant_ref_ac2_get_missing_variant_key_warns_and_leaves_field_unset: [REQ-418/AC-2] GET /api/snapshots/{id} resolves mapped keys, warns for unmapped keys, and omits them. | AC-2 | PASS |
| `backend/tests/integration/api/test_snapshots.py` | test_variant_ref_ac2_stored_variant_snapshot_follows_role_rename: [REQ-418/AC-2] Stored variant snapshot returns updated role and display_name after rename. | AC-2 | PASS |
| `backend/tests/integration/api/test_snapshots.py` | test_variant_ref_ac2_list_uses_same_resolver: [REQ-418/AC-2] GET /api/snapshots populates params, variant_params, and variants using the same resolver. | AC-2 | PASS |
| `backend/tests/integration/api/test_snapshots.py` | test_variant_ref_ac2_patch_params_normalized: [REQ-418/AC-2] PATCH /api/snapshots/{id} stores v: keys and returns resolved role keys. | AC-2 | PASS |
| `backend/tests/integration/legacy/test_param_sync_groups.py` | test_variant_ref_ac3_create_with_variant_ids_persists_master_and_members: [REQ-418/AC-3] Create sync group with master_variant_id and slave_variant_ids persists members. | AC-3 | PASS |
| `backend/tests/integration/legacy/test_param_sync_groups.py` | test_param_sync_group_create_with_variant_ids_persists_members: [REQ-418/AC-3] Param sync group create with variant IDs persists members in DB. | AC-3 | PASS |
| `backend/tests/integration/legacy/test_param_sync_groups.py` | test_variant_ref_ac3_create_with_roles_fallback_resolves_ids: [REQ-418/AC-3] Create sync group with legacy master_role and slave_roles resolves variant IDs. | AC-3 | PASS |
| `backend/tests/integration/legacy/test_param_sync_groups.py` | test_variant_ref_ac3_invalid_payload_returns_422: [REQ-418/AC-3] Invalid payload returns 422 Unprocessable Entity. | AC-3 | PASS |
| `backend/tests/integration/legacy/test_param_sync_groups.py` | test_param_sync_group_rejects_unknown_variant_id: [REQ-418/AC-3] Rejects unknown variant ID with 422 Unprocessable Entity. | AC-3 | PASS |
| `backend/tests/integration/legacy/test_param_sync_groups.py` | test_variant_ref_ac3_update_replaces_members_and_dedupes: [REQ-418/AC-3] Update replaces members, deduplicates, and excludes master_variant_id. | AC-3 | PASS |
| `backend/tests/integration/legacy/test_param_sync_groups.py` | test_variant_ref_ac3_delete_group_removes_members: [REQ-418/AC-3] Deleting a sync group removes its members via cascade. | AC-3 | PASS |
| `backend/tests/integration/legacy/test_param_sync_groups.py` | test_variant_ref_ac4_list_reflects_renamed_role_and_display_name: [REQ-418/AC-4] Param sync groups immediately reflect updated variant role and display_name. | AC-4 | PASS |
| `backend/tests/integration/legacy/test_param_sync_groups.py` | test_param_sync_group_reflects_updated_variant_role_and_master_display_name: [REQ-418/AC-4] Updated variant role and master display name are reflected immediately. | AC-4 | PASS |
| `backend/tests/integration/models/test_migrations.py` | test_variant_ref_ac1_missing_mapping_variants_aborts_unchanged: [REQ-418/AC-1] step_035 aborts when mapping_variants table is missing. | AC-1 | PASS |
| `backend/tests/integration/models/test_migrations.py` | test_variant_ref_ac1_empty_tables_create_schema_only: [REQ-418/AC-1] step_035 on empty tables creates schema and commits without data. | AC-1 | PASS |
| `backend/tests/integration/models/test_migrations.py` | test_variant_ref_ac1_all_resolved_populates_values_and_clears_legacy_json: [REQ-418/AC-1] step_035 migrates resolved preset values and leaves reserved in param_values. | AC-1 | PASS |
| `backend/tests/integration/models/test_migrations.py` | test_variant_ref_ac1_unresolved_row_rolls_back_all_unchanged: [REQ-418/AC-1] step_035 aborts without mutating DB when preset has unresolved key. | AC-1 | PASS |
| `backend/tests/integration/models/test_migrations.py` | test_variant_ref_ac1_unresolved_error_lists_all_keys: [REQ-418/AC-1] step_035 error message lists all unresolvable keys. | AC-1 | PASS |
| `backend/tests/integration/models/test_migrations.py` | test_variant_ref_ac1_step_is_idempotent_on_rerun: [REQ-418/AC-1] step_035 can be re-run safely without errors or data duplication. | AC-1 | PASS |
| `backend/tests/integration/models/test_migrations.py` | test_variant_ref_ac1_step_schema_matches_models: [REQ-418/AC-1] step_035 schema matches SQLAlchemy model column definitions. | AC-1 | PASS |
| `backend/tests/integration/models/test_migrations.py` | test_variant_ref_ac1_variant_delete_cascades_children: [REQ-418/AC-1] deleting a variant cascades to delete child preset values and sync members. | AC-1 | PASS |
| `backend/tests/integration/models/test_migrations.py` | test_variant_ref_ac3_sync_group_migration_sets_master_and_members: [REQ-418/AC-3] step_035 migrates sync group master_role and slave_roles to variant refs. | AC-3 | PASS |
| `backend/tests/integration/models/test_migrations.py` | test_variant_ref_ac3_sync_group_unresolved_role_aborts_unchanged: [REQ-418/AC-3] step_035 aborts without mutating DB when sync group has unknown role. | AC-3 | PASS |
| `backend/tests/integration/models/test_migrations.py` | test_step_035_aborts_when_mapping_variants_missing: [REQ-418/AC-1] Alias: test_step_035_aborts_when_mapping_variants_missing. | AC-1 | PASS |
| `backend/tests/integration/models/test_migrations.py` | test_step_035_empty_tables_commits_schema_only: [REQ-418/AC-1] Alias: test_step_035_empty_tables_commits_schema_only. | AC-1 | PASS |
| `backend/tests/integration/models/test_migrations.py` | test_step_035_happy_path_migrates_preset_and_sync_group: [REQ-418/AC-1][REQ-418/AC-3] Alias: test_step_035_happy_path_migrates_preset_and_sync_group. | AC-1 | PASS |
| `backend/tests/integration/models/test_migrations.py` | test_step_035_unresolved_role_aborts_without_mutation: [REQ-418/AC-1] Alias: test_step_035_unresolved_role_aborts_without_mutation. | AC-1 | PASS |
| `backend/tests/integration/models/test_migrations.py` | test_step_035_idempotent: [REQ-418/AC-1] Alias: test_step_035_idempotent. | AC-1 | PASS |
| `backend/tests/integration/services/test_snapshot_service.py` | test_variant_ref_ac2_create_persists_variant_keys: [REQ-418/AC-2] create_snapshot persists variant keys, derived keys, reserved keys, and omits unknown keys with warning. | AC-2 | PASS |
| `backend/tests/integration/services/test_snapshot_service.py` | test_variant_ref_ac2_legacy_snapshot_expands_mapped_only: [REQ-418/AC-2] expand_stored_params resolves legacy role keys to current role and warns for unknown keys. | AC-2 | PASS |
| `backend/tests/unit/test_variant_keys.py` | test_variant_ref_schema_instantiation: [REQ-418/AC-1] Test VariantRef schema creation and field access. | AC-1 | PASS |
| `backend/tests/unit/test_variant_keys.py` | test_variant_ref_ac1_classify_priority_order: [REQ-418/AC-1] Test classification priority order (RESERVED -> VARIANT -> ROLE -> DERIVED_ROLE -> UNRESOLVED). | AC-1 | PASS |
| `backend/tests/unit/test_variant_keys.py` | test_variant_ref_ac1_exact_role_beats_derived_suffix: [REQ-418/AC-1] Test that an exact role match beats the derived suffix pattern. | AC-1 | PASS |
| `backend/tests/unit/test_variant_keys.py` | test_variant_ref_ac1_encode_decode_roundtrip_pbt: [REQ-418/AC-1] Hypothesis test for encode_variant_key / decode_variant_key round-trip. | AC-1 | PASS |
| `backend/tests/unit/test_variant_keys.py` | test_variant_ref_ac1_classify_never_raises_pbt: [REQ-418/AC-1] Hypothesis test that VariantIndex.classify never raises for arbitrary string keys. | AC-1 | PASS |
| `backend/tests/unit/test_variant_keys.py` | test_variant_ref_ac1_normalize_params_values_and_unresolved: [REQ-418/AC-1] Test normalize_params stringification, collision order, and unresolved keys. | AC-1 | PASS |
| `backend/tests/unit/test_variant_keys.py` | test_variant_ref_ac2_expand_legacy_role_keys_maps_and_reports_missing: [REQ-418/AC-2] Test expand_stored_params role mapping, current role expansion, and missing keys. | AC-2 | PASS |
| `backend/tests/unit/test_variant_keys.py` | test_variant_ref_ac2_expand_warns_with_owner_label: [REQ-418/AC-2] Test expand_stored_params warning emissions with caplog and owner_label. | AC-2 | PASS |
| `backend/tests/unit/test_variant_keys.py` | test_variant_ref_ac2_to_storage_params_variant_keys_and_reserved_passthrough: [REQ-418/AC-2] Test to_storage_params produces v: keys and passes reserved keys unmodified. | AC-2 | PASS |
| `frontend/src/components/__tests__/ParamSyncModal.test.tsx` | [REQ-418/AC-3] sends master_variant_id when creating a group | AC-3 | PASS |
| `frontend/src/components/__tests__/ParamSyncModal.test.tsx` | [REQ-418/AC-3] slave toggle and master change send variant ids | AC-3 | PASS |
| `frontend/src/components/__tests__/ParamSyncModal.test.tsx` | [REQ-418/AC-3] falls back to role fields when mapping has no variant_id | AC-3 | PASS |

### PBI紐づけなし (汎用/ガバナンス) (計 2309 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `backend/tests/governance/test_pytest_collection.py` | test_root_pytest_ini_excludes_docs_logs_and_keeps_pytest_defaults | - | PASS |
| `backend/tests/governance/test_pytest_collection.py` | test_collection_skips_docs_logs_copies_with_duplicate_basenames | - | PASS |
| `backend/tests/governance/test_pytest_collection.py` | test_docs_logs_has_no_tracked_files | - | PASS |
| `backend/tests/integration/api/test_presets.py` | test_workflow | - | PASS |
| `backend/tests/integration/legacy/test_albums.py` | test_delete_album_items | - | PASS |
| `backend/tests/integration/legacy/test_albums.py` | test_add_album_items | - | PASS |
| `backend/tests/integration/legacy/test_albums.py` | test_list_and_create_album_sort_order | - | PASS |
| `backend/tests/integration/legacy/test_albums.py` | test_reorder_albums | - | PASS |
| `backend/tests/integration/legacy/test_albums.py` | test_update_album_rename_and_sort_order | - | PASS |
| `backend/tests/integration/legacy/test_api_config_network.py` | test_get_config_localhost | - | PASS |
| `backend/tests/integration/legacy/test_api_config_network.py` | test_get_config_127_0_0_1 | - | PASS |
| `backend/tests/integration/legacy/test_api_config_network.py` | test_get_config_lan_ip | - | PASS |
| `backend/tests/integration/legacy/test_api_config_network.py` | test_get_config_cors_header | - | PASS |
| `backend/tests/integration/legacy/test_assets_base_models.py` | test_lora_creation_and_update_with_base_models | - | PASS |
| `backend/tests/integration/legacy/test_assets_base_models.py` | test_lora_listing_filters | - | PASS |
| `backend/tests/integration/legacy/test_assets_base_models.py` | test_tag_set_creation_and_update_with_base_models | - | PASS |
| `backend/tests/integration/legacy/test_assets_base_models.py` | test_tag_set_listing_filters | - | PASS |
| `backend/tests/integration/legacy/test_base_models_api.py` | test_create_and_list_base_model | - | PASS |
| `backend/tests/integration/legacy/test_base_models_api.py` | test_update_base_model | - | PASS |
| `backend/tests/integration/legacy/test_base_models_api.py` | test_delete_base_model | - | PASS |
| `backend/tests/integration/legacy/test_base_models_api.py` | test_create_or_update_checkpoint_mapping | - | PASS |
| `backend/tests/integration/legacy/test_base_models_api.py` | test_get_comfy_checkpoints | - | PASS |
| `backend/tests/integration/legacy/test_base_models_api.py` | test_scan_workflow_estimation | - | PASS |
| `backend/tests/integration/legacy/test_base_models_api.py` | test_create_workflow_auto_estimation | - | PASS |
| `backend/tests/integration/legacy/test_base_models_migration.py` | test_base_model_crud | - | PASS |
| `backend/tests/integration/legacy/test_base_models_migration.py` | test_checkpoint_mapping_crud | - | PASS |
| `backend/tests/integration/legacy/test_base_models_migration.py` | test_seed_initial_data_populates_base_models | - | PASS |
| `backend/tests/integration/legacy/test_base_models_migration.py` | test_lora_many_to_many_base_models | - | PASS |
| `backend/tests/integration/legacy/test_base_models_migration.py` | test_existing_lora_migration_to_illus | - | PASS |
| `backend/tests/integration/legacy/test_base_models_migration.py` | test_workflow_base_model_relation | - | PASS |
| `backend/tests/integration/legacy/test_benchmark_service.py` | test_generate_stress_test_prompts_count_and_seed | - | PASS |
| `backend/tests/integration/legacy/test_benchmark_service.py` | test_generate_stress_test_prompts_axes_content | - | PASS |
| `backend/tests/integration/legacy/test_benchmark_service.py` | test_calculate_sweet_spot | - | PASS |
| `backend/tests/integration/legacy/test_benchmark_service.py` | test_benchmark_router_endpoints | - | PASS |
| `backend/tests/integration/legacy/test_bypass_profiles.py` | test_create_bypass_profile | - | PASS |
| `backend/tests/integration/legacy/test_bypass_profiles.py` | test_list_bypass_profiles | - | PASS |
| `backend/tests/integration/legacy/test_bypass_profiles.py` | test_update_bypass_profile | - | PASS |
| `backend/tests/integration/legacy/test_bypass_profiles.py` | test_delete_bypass_profile | - | PASS |
| `backend/tests/integration/legacy/test_comfy_generation_bridge.py` | test_http_ports_use_backend_client_id_and_exact_normalized_contracts | - | PASS |
| `backend/tests/integration/legacy/test_comfy_generation_bridge.py` | test_submit_validation_400_returns_definitive_rejection_without_retry | - | PASS |
| `backend/tests/integration/legacy/test_comfy_generation_bridge.py` | test_submit_validation_422_non_json_returns_rejection_message | - | PASS |
| `backend/tests/integration/legacy/test_comfy_generation_bridge.py` | test_submit_prompt_id_with_partial_node_errors_is_confirmed | - | PASS |
| `backend/tests/integration/legacy/test_comfy_generation_bridge.py` | test_submit_without_prompt_id_requires_explicit_rejection_or_is_unknown | - | PASS |
| `backend/tests/integration/legacy/test_comfy_generation_bridge.py` | test_submit_timeout_remains_unknown_and_is_not_retried | - | PASS |
| `backend/tests/integration/legacy/test_comfy_generation_bridge.py` | test_submit_server_error_remains_ambiguous_and_is_not_retried | - | PASS |
| `backend/tests/integration/legacy/test_comfy_generation_bridge.py` | test_upstream_health_preserves_first_failure_and_resets_after_http_success | - | PASS |
| `backend/tests/integration/legacy/test_comfy_generation_bridge.py` | test_ws_reconnect_uses_existing_backoff_and_reuses_backend_client_id | - | PASS |
| `backend/tests/integration/legacy/test_comfy_generation_bridge.py` | test_binary_frame_without_unique_running_job_is_not_cross_associated | - | PASS |
| `backend/tests/integration/legacy/test_comfy_generation_bridge.py` | test_ws_uses_ipv4_only_for_windows_localhost_without_changing_uri | - | PASS |
| `backend/tests/integration/legacy/test_comfy_generation_bridge.py` | test_resident_ws_routes_json_and_latest_binary_preview_to_verified_running_job | - | PASS |
| `backend/tests/integration/legacy/test_comfy_generation_bridge.py` | test_binary_preview_uses_big_endian_and_ignores_truncated_or_unknown_headers | - | PASS |
| `backend/tests/integration/legacy/test_comfy_proxy.py` | test_get_comfy_client_singleton | - | PASS |
| `backend/tests/integration/legacy/test_comfy_proxy.py` | test_close_comfy_client | - | PASS |
| `backend/tests/integration/legacy/test_comfy_proxy.py` | test_get_comfy_object_info_success | - | PASS |
| `backend/tests/integration/legacy/test_comfy_proxy.py` | test_get_comfy_object_info_error_fallback | - | PASS |
| `backend/tests/integration/legacy/test_comfy_proxy.py` | test_get_object_info_cached | - | PASS |
| `backend/tests/integration/legacy/test_comfy_proxy.py` | test_get_object_info_failure_503 | - | PASS |
| `backend/tests/integration/legacy/test_comfy_proxy.py` | test_post_prompt_proxy_success | - | PASS |
| `backend/tests/integration/legacy/test_comfy_proxy.py` | test_get_queue_proxy | - | PASS |
| `backend/tests/integration/legacy/test_comfy_proxy.py` | test_post_queue_clear_proxy | - | PASS |
| `backend/tests/integration/legacy/test_comfy_proxy.py` | test_post_interrupt_proxy | - | PASS |
| `backend/tests/integration/legacy/test_comfy_proxy.py` | test_get_history_proxy | - | PASS |
| `backend/tests/integration/legacy/test_comfy_proxy.py` | test_get_history_proxy_with_max_items | - | PASS |
| `backend/tests/integration/legacy/test_comfy_proxy.py` | test_get_prompt_history_proxy | - | PASS |
| `backend/tests/integration/legacy/test_comfy_proxy.py` | test_get_comfy_thumbnail_success | - | PASS |
| `backend/tests/integration/legacy/test_comfy_proxy.py` | test_get_comfy_thumbnail_preserves_large_original_aspect_ratio | - | PASS |
| `backend/tests/integration/legacy/test_comfy_proxy.py` | test_get_comfy_thumbnail_not_found | - | PASS |
| `backend/tests/integration/legacy/test_comfy_proxy.py` | test_get_comfy_thumbnail_disk_cache_hit | - | PASS |
| `backend/tests/integration/legacy/test_comfy_proxy.py` | test_get_comfy_thumbnail_disk_cache_corrupt_recovery | - | PASS |
| `backend/tests/integration/legacy/test_comfy_proxy_fault.py` | test_original_view_preserves_bytes_mime_and_fixed_upstream | - | PASS |
| `backend/tests/integration/legacy/test_comfy_proxy_fault.py` | test_original_availability_identity_without_job_uuid | - | PASS |
| `backend/tests/integration/legacy/test_comfy_proxy_fault.py` | test_original_availability_network_failure_is_unknown | - | PASS |
| `backend/tests/integration/legacy/test_comfy_proxy_fault.py` | test_missing_original_does_not_immediately_delete_orphan_thumbnail | - | PASS |
| `backend/tests/integration/legacy/test_comfy_proxy_fault.py` | test_original_view_distinguishes_missing_from_upstream_failure | - | PASS |
| `backend/tests/integration/legacy/test_comfy_proxy_fault.py` | test_original_view_timeout_is_bad_gateway | - | PASS |
| `backend/tests/integration/legacy/test_comfy_proxy_fault.py` | test_comfy_object_info_connect_timeout | - | PASS |
| `backend/tests/integration/legacy/test_comfy_proxy_fault.py` | test_comfy_object_info_read_timeout | - | PASS |
| `backend/tests/integration/legacy/test_comfy_proxy_fault.py` | test_comfy_object_info_corrupted_json | - | PASS |
| `backend/tests/integration/legacy/test_comfy_proxy_fault.py` | test_comfy_prompt_connect_timeout | - | PASS |
| `backend/tests/integration/legacy/test_comfy_proxy_fault.py` | test_comfy_prompt_read_timeout | - | PASS |
| `backend/tests/integration/legacy/test_dataset_db.py` | test_models_orm_crud | - | PASS |
| `backend/tests/integration/legacy/test_dataset_db.py` | test_migration_and_seed_presets | - | PASS |
| `backend/tests/integration/legacy/test_dataset_db.py` | test_pydantic_schemas_validation_and_from_attributes | - | PASS |
| `backend/tests/integration/legacy/test_dataset_router.py` | test_project_crud | - | PASS |
| `backend/tests/integration/legacy/test_dataset_router.py` | test_get_outfits | - | PASS |
| `backend/tests/integration/legacy/test_dataset_router.py` | test_get_project_items_restores_saved_order_status_and_metadata_without_writes | - | PASS |
| `backend/tests/integration/legacy/test_dataset_router.py` | test_generate_matrix | - | PASS |
| `backend/tests/integration/legacy/test_dataset_router.py` | test_patch_item | - | PASS |
| `backend/tests/integration/legacy/test_dataset_router.py` | test_export_project | - | PASS |
| `backend/tests/integration/legacy/test_deprecation_clean.py` | test_zero_deprecation_warnings_on_models_and_config | - | PASS |
| `backend/tests/integration/legacy/test_fonts.py` | test_list_fonts | - | PASS |
| `backend/tests/integration/legacy/test_fonts.py` | test_get_font_invalid_name | - | PASS |
| `backend/tests/integration/legacy/test_fonts.py` | test_get_font_not_found | - | PASS |
| `backend/tests/integration/legacy/test_fonts.py` | test_get_font_existing | - | PASS |
| `backend/tests/integration/legacy/test_fugumt_service.py` | test_normalize_input_scenarios | - | PASS |
| `backend/tests/integration/legacy/test_fugumt_service.py` | test_translate_batch_empty_list | - | PASS |
| `backend/tests/integration/legacy/test_fugumt_service.py` | test_set_translator_and_mock_inference | - | PASS |
| `backend/tests/integration/legacy/test_fugumt_service.py` | test_translate_batch_special_tokens_preservation | - | PASS |
| `backend/tests/integration/legacy/test_fugumt_service.py` | test_translate_batch_chunking_over_max_batch_size | - | PASS |
| `backend/tests/integration/legacy/test_fugumt_service.py` | test_initialize_non_existent_directory | - | PASS |
| ... | *(他 2209 件割愛)* | - | - |

### UNKNOWN (計 1 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `backend/tests/integration/models/test_migrations.py` | test_req417_seed_initial_data_creates_rulesets_and_variants | - | VIOLATION |

