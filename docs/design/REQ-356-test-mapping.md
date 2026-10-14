# REQ-356 既存テスト検証項目対応表 (移行前ベースライン)

本ドキュメントは REQ-356 (テスト再構成および高速化・Seam Map 準拠) の移行前ベースラインとして、
リファクタ前の全テスト（Backend / Frontend）が担保している検証項目を機械抽出した対応表である。

## 1. 全体サマリー

| 項目 | 件数 | 備考 |
|---|---|---|
| Backend テストファイル数 | 74 | `backend/tests/**/*.py` |
| Frontend テストファイル数 | 232 | `frontend/src/**/*.{test,spec}.{ts,tsx}` |
| 抽出テストケース総数 | 2640 | Python 関数 + TS it/test |
| PBI 紐づけありテスト数 | 297 | `REQ-xxx` 関連 |
| PBI 紐づけなしテスト数 | 2343 | 汎用ユニット・ガバナンステスト (AC-15準拠) |
| ファイル名規約違反数 (AC-1) | 44 | `req\d+` をパスに含むファイル |
| テスト名規約違反数 (AC-15) | 89 | `[REQ-xxx/AC-n]` 未準拠 |

## 2. ファイル名規約違反一覧 (移行対象: AC-1)

| No | ファイルパス | 移行計画 (REQ-356 タスク) |
|---|---|---|
| 1 | `frontend/src/api/__tests__/req334PreviewApis.test.ts` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 2 | `frontend/src/api/__tests__/req334QueuedCancel.test.ts` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 3 | `frontend/src/components/__tests__/ImageCarousel.req334.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 4 | `frontend/src/components/__tests__/JobManagementModal.req333.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 5 | `frontend/src/components/__tests__/LazyThumbnail.req345.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 6 | `frontend/src/components/__tests__/LoraStackEditor.req334.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 7 | `frontend/src/components/layout/__tests__/AppShell.req334.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 8 | `frontend/src/components/layout/__tests__/ResizableSplitLayout.req334.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 9 | `frontend/src/components/LoraModals/__tests__/LoraDetailExamples.req334.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 10 | `frontend/src/components/LoraModals/__tests__/LoraDetailModal.req334.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 11 | `frontend/src/components/LoraModals/__tests__/LoraFormExamples.req334.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 12 | `frontend/src/components/LoraModals/__tests__/LoraRegisterModal.req334.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 13 | `frontend/src/components/TagSetModals/TagSetFormFields.req334.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 14 | `frontend/src/pages/__tests__/AssetCardInteractions.req334.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 15 | `frontend/src/pages/GeneratePage/components/__tests__/AddAssetModal.req334.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 16 | `frontend/src/pages/GeneratePage/components/__tests__/GenerationProgress.req333.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 17 | `frontend/src/pages/GeneratePage/components/__tests__/PromptTranslationModal.req334.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 18 | `frontend/src/pages/GeneratePage/components/__tests__/SettingsPopover.req333.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 19 | `frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateDisplayState.req345.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 20 | `frontend/src/pages/GeneratePage/hooks/__tests__/useImageNavigation.req334.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 21 | `frontend/src/pages/GeneratePage/sections/__tests__/GenerationGallerySection.req333.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 22 | `frontend/src/pages/GeneratePage/sections/__tests__/GenerationGallerySection.req345.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 23 | `frontend/src/pages/HistoryPage/components/__tests__/AlbumListView.req334.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 24 | `frontend/src/pages/HistoryPage/hooks/__tests__/useAlbumOperations.req334.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 25 | `frontend/src/pages/HistoryPage/views/__tests__/AlbumDetailView.req334.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 26 | `frontend/src/pages/SettingsPage/components/__tests__/BubbleDetectionSection.req334.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 27 | `frontend/src/pages/SettingsPage/components/__tests__/DictionaryPanel.req334.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 28 | `frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.req336.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 29 | `frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.req340.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 30 | `frontend/src/test/e2e_req207.test.ts` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 31 | `frontend/src/test/e2e_req240_multidevice.test.ts` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 32 | `frontend/src/test/e2e_req260_vram_guard.test.ts` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 33 | `frontend/src/test/e2e_req264_preview_autofollow.test.ts` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 34 | `frontend/src/test/e2e_req317_storage.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 35 | `frontend/src/test/e2e_req319_lora_studio.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 36 | `frontend/src/test/e2e_req323_autosave_draft.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 37 | `frontend/src/test/e2e_req332_recovery.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 38 | `frontend/src/test/e2e_req332_storage.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 39 | `frontend/src/test/e2e_req336_workflow_mapping.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 40 | `frontend/src/test/e2e_req339_preview_layout.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 41 | `frontend/src/test/e2e_req341_header_unification.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 42 | `frontend/src/test/e2e_req345_residual_history.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 43 | `frontend/src/test/e2e_req345_trial_availability.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |
| 44 | `frontend/src/test/e2e_req350_seed.test.tsx` | ドメイン別機能名へ統合リネーム (T2〜T10) |

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
| `frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx` | should compute totalQueueCount based purely on ComfyUI queue running and pending (REQ-159) | - | VIOLATION |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx` | should consider isGeneratingHere true when filterOwnSession is true and activeBatch has pending/generating jobs (REQ-159) | - | VIOLATION |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx` | should sync queue without refetching history for a restored nonempty baseline on visibilitychange (REQ-159) | - | VIOLATION |

### REQ-161 (計 2 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/pages/GeneratePage/__tests__/GeneratePage.test.tsx` | [REQ-161/AC-1] Generate Batch button is disabled when workflow is not loaded (Desktop) | AC-1 | PASS |
| `frontend/src/pages/GeneratePage/__tests__/GeneratePage.test.tsx` | [REQ-161/AC-2] Generate Batch button is disabled when workflow is not loaded (Mobile) | AC-2 | PASS |

### REQ-163 (計 3 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `backend/tests/integration/models/test_model_relations.py` | test_workflow_preset_relationships: [REQ-163/AC-1] Workflow and WorkflowPreset foreign key relationship and ordering. | AC-1 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx` | should maintain independent prompts when switching presets (REQ-163) | - | VIOLATION |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx` | should handle OCC conflict (409) in updatePresetMutation (REQ-163) | - | VIOLATION |

### REQ-180 (計 5 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `backend/tests/integration/models/test_model_relations.py` | test_speech_preset_relations: [REQ-180/AC-1] SpeechBubblePreset and SpeechTonePreset model persistence and constraints. | AC-1 | PASS |
| `frontend/src/components/__tests__/SpeechBubbleControls.test.tsx` | renders style-only presets section before with-text presets section in DOM order (REQ-180 AC-1) | - | VIOLATION |
| `frontend/src/components/__tests__/SpeechBubbleControls.test.tsx` | handles scale flipping and path flipping in manga fx section (REQ-180 AC-1, AC-2, AC-3) | - | VIOLATION |
| `frontend/src/utils/__tests__/speechBubbleRenderer.test.ts` | flips path points correctly for vertical and horizontal orientations (REQ-180 AC-2) | - | VIOLATION |
| `frontend/src/utils/__tests__/speechBubbleRenderer.test.ts` | calculates tail base position and respects fine-tuning parameters (REQ-180 AC-1, AC-2) | - | VIOLATION |

### REQ-186 (計 3 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/pages/GeneratePage/__tests__/GeneratePage.test.tsx` | [REQ-186/AC-1] keeps preset manager modal open when selecting a preset to open as tab | AC-1 | PASS |
| `frontend/src/pages/GeneratePage/__tests__/GeneratePage.test.tsx` | [REQ-186/AC-2] allows closing tabs directly from preset manager modal | AC-2 | PASS |
| `frontend/src/pages/GeneratePage/__tests__/GeneratePage.test.tsx` | [REQ-186/AC-3] closes preset manager modal when explicitly clicking close button | AC-3 | PASS |

### REQ-188 (計 6 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/components/__tests__/SpeechBubbleControls.test.tsx` | synchronizes default pathPoints when pathPreset or orientation changes (REQ-188) | - | VIOLATION |
| `frontend/src/components/__tests__/SpeechBubbleControls.test.tsx` | falls back to default path points before flipping if pathPoints is empty (REQ-188) | - | VIOLATION |
| `frontend/src/utils/__tests__/speechBubbleRenderer.test.ts` | reverses order when flipping center/straight line points (REQ-188) | - | VIOLATION |
| `frontend/src/utils/__tests__/speechBubbleRenderer.test.ts` | maps vertical punctuation using verticalCharMap when drawing vertical path text (REQ-188) | - | VIOLATION |
| `frontend/src/utils/__tests__/speechBubbleRenderer.test.ts` | distributes multiple characters within the same step in stepped preset (REQ-188) | - | VIOLATION |
| `frontend/src/utils/__tests__/speechBubbleRenderer.test.ts` | applies proportional advancement when scale varies (REQ-188) | - | VIOLATION |

### REQ-202 (計 1 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx` | should correctly update and remove tags with commonTagOps in handleBulkEditApply (REQ-202) | - | VIOLATION |

### REQ-206 (計 5 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/components/__tests__/SpeechBubbleEditorModal.test.tsx` | supports tail fine-tuning mode toggle and contact reset (REQ-206 T2) | - | VIOLATION |
| `frontend/src/components/__tests__/SpeechBubbleEditorModal.test.tsx` | preserves full tail properties when moving or duplicating bubble (REQ-206 T2) | - | VIOLATION |
| `frontend/src/utils/__tests__/speechBubbleRenderer.test.ts` | clamps tail apex outside bubble boundary (REQ-206 T1) | - | VIOLATION |
| `frontend/src/utils/__tests__/speechBubbleRenderer.test.ts` | calculates 2 contact positions independently and supports legacy options (REQ-206 T1) | - | VIOLATION |
| `frontend/src/utils/__tests__/speechBubbleRenderer.test.ts` | draws 2 contact handles in fine-tuning mode (REQ-206 T1) | - | VIOLATION |

### REQ-216 (計 1 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/components/__tests__/BatchSpeechTransformModal.test.tsx` | renders with modal-backdrop class ensuring mobile safe stacking and padding (AC-1/REQ-216) | - | VIOLATION |

### REQ-218 (計 2 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx` | should correctly prepend prefix with normalized comma delimiter in handleBulkEditApply (REQ-218) | - | VIOLATION |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx` | should correctly append suffix with normalized comma delimiter in handleBulkEditApply (REQ-218) | - | VIOLATION |

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
| `frontend/src/pages/__tests__/HistoryPage.test.tsx` | REQ-267: should render thumbnail with toThumbnailUrl fallback when ComfyUI direct URL is present | - | VIOLATION |
| `frontend/src/pages/__tests__/HistoryPage.test.tsx` | REQ-267: should preserve normal relative thumbnail path when present | - | VIOLATION |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useSnapshotActions.test.ts` | REQ-267: should call setErrorToast when snapshotsApi.create fails | - | VIOLATION |

### REQ-277 (計 1 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx` | REQ-277: ensures handleGenerateSets wires onBeforeGenerate with flushAutoSave | - | VIOLATION |

### REQ-278 (計 1 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx` | REQ-278: preserves in-memory edited parameters in setSets on preset sync | - | VIOLATION |

### REQ-286 (計 4 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-286/AC-1] shows speech tone presets by default and allows collapsing the section | AC-1 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-286/AC-2] opens create modal, fills form and submits new tone preset | AC-2 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-286/AC-3] opens edit modal and updates existing tone preset | AC-3 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-286/AC-4] cancels inline tone preset confirmation without mutation and deletes only after explicit confirmation | AC-4 | PASS |

### REQ-291 (計 7 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-291/AC-1] mounts all five tab panels and makes only the selected panel visible and focusable | AC-1 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-291/AC-2] retains an open tone preset draft when switching tabs | AC-2 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-291/AC-3] uses only v2 detail flags and preserves them across tab changes | AC-3 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-291/AC-4] ignores malformed legacy and v2 disclosure data | AC-4 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-291/AC-5] preserves the exact legacy section-expansion value on mount and section toggle | AC-5 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-291/AC-6] keeps the settings page usable when browser storage access is denied | AC-6 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-291/AC-7] subscribes to system stats for the page lifetime and cleans up on unmount | AC-7 | PASS |

### REQ-294 (計 5 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/components/__tests__/SpeechBubbleEditorModal.test.tsx` | REQ-294 T16: default stream API receives progress and advances to review | - | VIOLATION |
| `frontend/src/components/__tests__/SpeechBubbleEditorModal.test.tsx` | REQ-294 T16: default stream rejection reaches the error and retry UI | - | VIOLATION |
| `frontend/src/components/__tests__/SpeechBubbleEditorModal.test.tsx` | REQ-294 T16: closing progress cancels the stream and discards its late result | - | VIOLATION |
| `frontend/src/components/__tests__/SpeechBubbleEditorModal.test.tsx` | REQ-294: 生成結果の選択分だけをキャンバスへ反映する | - | VIOLATION |
| `frontend/src/components/__tests__/SpeechBubbleEditorModal.test.tsx` | REQ-294: 結果を閉じた場合は生成バブルを反映しない | - | VIOLATION |

### REQ-304 (計 4 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/components/TagChipEditor/__tests__/TagChip.test.tsx` | [REQ-304/AC-2] applies w-[360px] max-w-[calc(100vw-24px)] class to submenu container | AC-2 | PASS |
| `frontend/src/components/TagChipEditor/__tests__/TagChip.test.tsx` | [REQ-304/AC-2] renders translation button in submenu header | AC-2 | PASS |
| `frontend/src/components/TagChipEditor/__tests__/TagChip.test.tsx` | [REQ-304/AC-3] toggles TagChipTranslationCard when translation button is clicked | AC-3 | PASS |
| `frontend/src/components/TagChipEditor/__tests__/TagChip.test.tsx` | [REQ-304/AC-8] unmounts translation card when parent submenu is closed | AC-8 | PASS |

### REQ-314 (計 2 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-314/AC-1] keeps hash as the selected-tab source and synchronizes tab history and storage | AC-1 | PASS |
| `frontend/src/pages/SettingsPage/__tests__/SettingsPage.test.tsx` | [REQ-314/AC-2] starts prompt details closed and keeps an unsaved prompt edit across tab navigation | AC-2 | PASS |

### REQ-316 (計 9 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `backend/tests/integration/api/test_snapshots.py` | test_snapshot_association_types_update: [REQ-316/AC-2] PATCH /api/snapshots/{id} updates associations without changing generation facts. | AC-2 | PASS |
| `backend/tests/integration/api/test_snapshots.py` | test_snapshot_association_empty_clears_independently: [REQ-316/AC-3] Empty list clears only requested association type independently. | AC-3 | PASS |
| `backend/tests/integration/api/test_snapshots.py` | test_snapshot_association_only_role_isolation: [REQ-316/AC-4] Association-only role does not alter snapshot lora role or strength. | AC-4 | PASS |
| `backend/tests/integration/api/test_snapshots.py` | test_snapshot_record_remains_independent_after_prompt_metadata_deletion: [REQ-316/AC-1] Snapshot recorded metadata remains independent after prompt metadata deletion. | AC-1 | PASS |
| `frontend/src/components/__tests__/HistoryModalPreview.test.tsx` | REQ-316 treats empty saved params as authoritative and offers info even with missing metadata | - | VIOLATION |
| `frontend/src/components/__tests__/HistoryModalPreview.test.tsx` | REQ-316 locks the image and close/navigation while saving tag associations | - | VIOLATION |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useSnapshotActions.test.ts` | REQ-316: keeps unrecorded params empty if server API fails | - | VIOLATION |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useSnapshotActions.test.ts` | REQ-316 saves each image from its own frozen record and initializes known trigger associations | - | VIOLATION |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useWorkflowParams.test.ts` | REQ-316 excludes both reserved keys from restored inputs, including unknown records | - | VIOLATION |

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
| `frontend/src/pages/DatasetStudioPage/__tests__/MatrixGenerationStep.test.tsx` | REQ-321-T3: remaps and saves mappings when workflow initially has empty mappings, and updates node badges from fresh workflow | - | VIOLATION |
| `frontend/src/pages/DatasetStudioPage/__tests__/MatrixGenerationStep.test.tsx` | REQ-321-T3 (Red Teaming): displays error message and keeps modal open when workflowsApi.update fails | - | VIOLATION |

### REQ-323 (計 1 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/pages/GeneratePage/__tests__/GeneratePage.test.tsx` | [REQ-323/AC-1] locks autosave before initial sync completes and preserves prompt without destructive empty save on server restart | AC-1 | PASS |

### REQ-330 (計 2 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/pages/DatasetStudioPage/__tests__/MatrixGenerationStep.test.tsx` | REQ-330-T1 (Red Teaming): displays an error when batch acceptance fails | - | VIOLATION |
| `frontend/src/pages/DatasetStudioPage/__tests__/MatrixGenerationStep.test.tsx` | REQ-330-T1 (Red Teaming): reports server generation rejection without per-item POSTs | - | VIOLATION |

### REQ-331 (計 3 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/pages/DatasetStudioPage/__tests__/useStudioStore.test.ts` | manages paramValues state (REQ-331) | - | VIOLATION |
| `frontend/src/pages/DatasetStudioPage/__tests__/useStudioStore.test.ts` | manages bypassedNodeIds state (REQ-331) | - | VIOLATION |
| `frontend/src/pages/DatasetStudioPage/__tests__/useStudioStore.test.ts` | clears paramValues and bypassedNodeIds on resetStudio (REQ-331) | - | VIOLATION |

### REQ-332 (計 11 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `frontend/src/test/e2e_req332_recovery.test.tsx` | REQ-332-T10 AC3: 31 submissions succeed without a metadata-prune notification | - | VIOLATION |
| `frontend/src/test/e2e_req332_recovery.test.tsx` | REQ-332-T10 AC4: every one of the newest 30 IDs retains its distinct record fields | - | VIOLATION |
| `frontend/src/test/e2e_req332_recovery.test.tsx` | REQ-332-T11 AC11 read rejection server fallback | - | VIOLATION |
| `frontend/src/test/e2e_req332_recovery.test.tsx` | REQ-332-T9 AC16: interrupted first migration leaves no snapshot and retry queues once | - | VIOLATION |
| `frontend/src/test/e2e_req332_recovery.test.tsx` | REQ-332-T10 AC17: deleting only the IDB database preserves browser storage and allows a server retry | - | VIOLATION |
| `frontend/src/test/e2e_req332_storage.test.tsx` | REQ-332-T10 AC1: removes the legacy value and measures remaining localStorage in the visible gauge | - | VIOLATION |
| `frontend/src/test/e2e_req332_storage.test.tsx` | REQ-332-T10 AC15: excludes a stale preset until the server returns its latest value | - | VIOLATION |
| `frontend/src/test/e2e_req332_storage.test.tsx` | REQ-332-T11 AC18 refreshed list survives restart while next fetch is held | - | VIOLATION |
| `frontend/src/test/e2e_req332_storage.test.tsx` | REQ-332-T12 AC2: updates workflows with an exact 4 MiB UTF-16 byte-equivalent payload | - | VIOLATION |
| `frontend/src/test/e2e_req332_storage.test.tsx` | REQ-332-T9 AC10: desktop generation stays disabled until workflow 7 is fetched | - | VIOLATION |
| `frontend/src/test/e2e_req332_storage.test.tsx` | REQ-332-T9 AC13: same-tab restart restores every Studio field independently of API cache migration | - | VIOLATION |

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
| `frontend/src/pages/DatasetStudioPage/components/__tests__/NodeRemapModal.test.tsx` | TC-COMP-03: renders candidate node options in parameter dropdown using unified format (REQ-342) | - | VIOLATION |

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
| `backend/tests/governance/test_openapi_contract.py` | test_req358_openapi_master_default_enabled_contract_AC_28_AC_30_AC_31 | - | VIOLATION |
| `backend/tests/integration/api/test_workflows.py` | test_workflow_state_create_get_and_update_roundtrip: [REQ-358/AC-19] Workflow slot state persists across POST, GET, and omitted PUT. | AC-19 | PASS |
| `backend/tests/integration/api/test_workflows.py` | test_workflow_state_rollback: [REQ-358/AC-28] Rollback restores prior workflow slot states. | AC-28 | PASS |
| `backend/tests/integration/models/test_migrations.py` | test_mapping_slot_state_migration_step_030: [REQ-358/AC-19][REQ-358/AC-26][REQ-358/AC-31] Verify step_030 adds mapping_slot_states and default_enabled idempotently. | AC-19 | PASS |
| `backend/tests/integration/models/test_migrations.py` | test_run_migrations_on_empty_db_is_idempotent: [REQ-358/AC-19] Running migrations multiple times on an empty database is safe and idempotent. | AC-19 | PASS |
| `backend/tests/unit/test_schemas.py` | test_workflow_slot_state_contract_defaults_and_strict_values: [REQ-358/AC-19] Workflow slot states default empty and require strict booleans. | AC-19 | PASS |
| `backend/tests/unit/test_schemas.py` | test_workflow_slot_state_keys_must_be_valid: [REQ-358/AC-19] Slot state keys use positive variant or legacy master IDs. | AC-19 | PASS |
| `backend/tests/unit/test_schemas.py` | test_workflow_update_distinguishes_omitted_and_empty_slot_states: [REQ-358/AC-19] Omitted slot states stay unset while an empty object replaces them. | AC-19 | PASS |
| `backend/tests/unit/test_schemas.py` | test_workflow_read_parses_slot_state_json: [REQ-358/AC-19] Read schemas normalize persisted slot state JSON objects. | AC-19 | PASS |
| `backend/tests/unit/test_schemas.py` | test_mapping_master_default_enabled_defaults_true: [REQ-358/AC-31] Legacy mapping masters default to enabled. | AC-31 | PASS |
| `frontend/src/api/__tests__/mappingApi.test.ts` | REQ-358/AC-19 preserves optional master default_enabled types | - | VIOLATION |
| `frontend/src/api/__tests__/mappingApi.test.ts` | REQ-358/AC-26 allows optional mapping_slot_states and false values | - | VIOLATION |
| `frontend/src/api/__tests__/mappingApi.test.ts` | REQ-358/AC-31 supports legacy read defaults without making state required | - | VIOLATION |
| `frontend/src/components/__tests__/WorkflowMappingPreview.test.tsx` | REQ-358/PREVIEW REQ-358/AC-7 ranks candidates and keeps non-recommended nodes selectable | - | VIOLATION |
| `frontend/src/components/__tests__/WorkflowModalEditing.test.tsx` | REQ-358/UPLOAD_CLEAN [REQ-358/AC-16] [REQ-358/AC-17] [REQ-358/AC-18] keeps the same input while typing, clearing and retyping | AC-16 | PASS |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | REQ-358/T35 caches ranks during edits and locks one deferred save | - | VIOLATION |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | REQ-358/T35 upload edits reuse candidates and keep create locked until completion | - | VIOLATION |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | REQ-358/EDITOR [REQ-358/AC-8] keeps the editable node ID input mounted and shows ranked reasons | AC-8 | PASS |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | REQ-358/EDITOR [REQ-358/AC-14] displays selected node metadata and stage confidence in distinct text | AC-14 | PASS |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | REQ-358/EDITOR [REQ-358/AC-13] renders ordered slot rows and keeps empty slots selectable | AC-13 | PASS |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | REQ-358/EDITOR [REQ-358/AC-22] marks a partly enabled stage as mixed and labels the disabled role | AC-22 | PASS |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | REQ-358/UPLOAD_CLEAN REQ-358/AC-13 renders ordered slots and saves mappings with explicit slot states | - | VIOLATION |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | REQ-358/UPLOAD_CLEAN REQ-358/AC-14 preserves an explicitly empty slot and its enabled state | - | VIOLATION |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | REQ-358/UPLOAD_CLEAN REQ-358/AC-15 saves all slot states when mappings are empty | - | VIOLATION |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | REQ-358/UPLOAD_CLEAN REQ-358/AC-21 keeps disabled slot mappings and persists the opt-out state | - | VIOLATION |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | [REQ-358/AC-19][REQ-358/AC-34] waits for refetch before restoring disabled assignments and preserves them across save and reopen | AC-19 | PASS |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | REQ-358/RESCAN_CLEAN REQ-358/AC-16 shows unresolved roles in the same mapping list | - | VIOLATION |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | REQ-358/RESCAN_CLEAN REQ-358/AC-17 keeps direct input mounted while typing | - | VIOLATION |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | REQ-358/RESCAN_CLEAN REQ-358/AC-18 keeps master order across matched and unresolved rows | - | VIOLATION |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | REQ-358/RESCAN_CLEAN REQ-358/AC-29 keeps mappings for masters absent from current settings | - | VIOLATION |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | REQ-358/RESCAN_CLEAN REQ-358/AC-33 retains a saved non-default node present in the graph | - | VIOLATION |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | REQ-358/RESCAN_CLEAN REQ-358/AC-35 preserves a saved mapping whose node is missing from the workflow graph | - | VIOLATION |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | REQ-358/RESCAN_CLEAN REQ-358/AC-19 saves remapped nodes and persisted slot states | - | VIOLATION |
| `frontend/src/components/__tests__/WorkflowModalMultiStage.test.tsx` | REQ-358/RESCAN_CLEAN REQ-358/AC-20 preserves explicit empty slot values and identifiers | - | VIOLATION |
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
| `frontend/src/hooks/__tests__/useMasterMappingRows.test.ts` | REQ-358/T35 memoizes a realistic mapping grid and reports toggle CPU time | - | VIOLATION |
| `frontend/src/pages/GeneratePage/components/__tests__/ParamPanel.test.tsx` | [REQ-358/AC-25] hides the generation Seed control when its Sampler_Seed mapping is inactive | AC-25 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useWorkflowManagement.seed.test.ts` | [REQ-358/GENERATION] [REQ-358/AC-25] derives generation mappings from slot state while retaining raw workflow for mutation | AC-25 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useWorkflowManagement.seed.test.ts` | [REQ-358/AC-25][REQ-359/AC-2] resolves a legacy disabled slot after delayed master loading while preserving raw data and stable references | AC-25 | PASS |
| `frontend/src/pages/GeneratePage/hooks/__tests__/useWorkflowManagement.seed.test.ts` | [REQ-358/AC-25] resolves a multistage legacy seed only by exact persisted role, including inactive variants | AC-25 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.req336.test.tsx` | REQ-358/MASTER_UI REQ-358/AC-26 saves the new mapping default-enabled choice | - | VIOLATION |
| `frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.req336.test.tsx` | REQ-358/MASTER_UI REQ-358/AC-27 treats legacy defaults as enabled and locks the control while saving | - | VIOLATION |
| `frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.req336.test.tsx` | REQ-358/MASTER_UI REQ-358/AC-30 preserves an existing disabled default on save | - | VIOLATION |
| `frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.req336.test.tsx` | REQ-358/MASTER_UI REQ-358/AC-28 keeps disabled masters visible and editable | - | VIOLATION |
| `frontend/src/pages/SettingsPage/components/__tests__/WorkflowAdaptiveStaging.test.tsx` | [REQ-358/WIRING] [REQ-358/AC-14] class候補と選択中node metadataを表示する | AC-14 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/WorkflowAdaptiveStaging.test.tsx` | [REQ-358/WIRING] slot無効状態を保持し、保存時にstateを渡す | - | VIOLATION |
| `frontend/src/pages/SettingsPage/components/__tests__/WorkflowAdaptiveStaging.test.tsx` | [REQ-358/AC-23][REQ-358/AC-34] keeps a legacy single-variant ID while disabled and saves its canonical permission | AC-23 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/WorkflowConnectionSection.config.test.ts` | [REQ-358/AC-19] mapping_slot_statesが省略された旧JSONは状態フィールドを追加しない | AC-19 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/WorkflowConnectionSection.config.test.ts` | [REQ-358/AC-19] 明示された空のmapping_slot_statesを置換値として保持する | AC-19 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/WorkflowConnectionSection.config.test.ts` | [REQ-358/AC-19] 有効なslot stateをJSON往復用に保持する | AC-19 | PASS |
| `frontend/src/pages/SettingsPage/components/__tests__/WorkflowConnectionSection.config.test.ts` | [REQ-358/AC-19] null・非boolean・不正keyのslot stateを拒否する | AC-19 | PASS |
| `frontend/src/utils/__tests__/wiringStageGroups.test.ts` | [REQ-358/AC-20] hydrates explicit states, saved mappings, then defaults | AC-20 | PASS |
| `frontend/src/utils/__tests__/wiringStageGroups.test.ts` | [REQ-358/AC-21] updates only exact stage slots and preserves unknown keys | AC-21 | PASS |
| `frontend/src/utils/__tests__/wiringStageGroups.test.ts` | [REQ-358/AC-22] enables all displayed slots, including default-disabled slots | AC-22 | PASS |
| `frontend/src/utils/__tests__/wiringStageGroups.test.ts` | [REQ-358/AC-21/22] handles an empty stage and adds only displayed missing keys | - | VIOLATION |
| `frontend/src/utils/__tests__/wiringStageGroups.test.ts` | [REQ-358/AC-23/31] filters only explicit false states without mutating frozen inputs | - | VIOLATION |
| `frontend/src/utils/__tests__/wiringStageGroups.test.ts` | [REQ-358/AC-31] keeps all mappings when state is absent or empty | AC-31 | PASS |
| `frontend/src/utils/__tests__/wiringStageGroups.test.ts` | [REQ-358/AC-23/31] returns a new empty mapping array when all mappings are disabled | - | VIOLATION |
| `frontend/src/utils/__tests__/wiringStageGroups.test.ts` | [REQ-358/AC-20] uses canonical variant and legacy slot keys | AC-20 | PASS |
| `frontend/src/utils/__tests__/wiringStageGroups.test.ts` | [REQ-358/AC-21/22] preserves non-target stage values across generated slot sets | - | VIOLATION |
| `frontend/src/utils/__tests__/wiringStageGroups.test.ts` | [REQ-358/AC-23/31] preserves source mapping order for generated workflow records | - | VIOLATION |
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

### PBI紐づけなし (汎用/ガバナンス) (計 2343 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
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
| `backend/tests/integration/legacy/test_comfy_generation_bridge.py` | test_single_interrupt_preflights_target_twice_and_never_interrupts_wrong_prompt | - | PASS |
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
| `backend/tests/integration/legacy/test_comfy_proxy.py` | test_prune_disk_cache_if_needed | - | PASS |
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
| `backend/tests/integration/legacy/test_fugumt_service.py` | test_initialize_auto_download_success | - | PASS |
| ... | *(他 2243 件割愛)* | - | - |

### UNKNOWN (計 1 件)

| ファイルパス | テストケース名 / 検証項目 | AC ID | 規約適合 |
|---|---|---|---|
| `backend/tests/integration/legacy/test_prompt_metadata.py` | test_req316_full_unicode_record_and_json_roundtrip | - | VIOLATION |

