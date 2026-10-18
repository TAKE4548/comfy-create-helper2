# Test Plan: REQ-379 ComfyUIへの原画確認処理の完全廃止とBE自立キャッシュへの仕様整合

本テスト計画は、REQ-379で定義された「Gallery表示時のComfyUI原画実在確認（GET /api/comfy/image-availability）の完全廃止」「ComfyUI元画像削除時にもBEキャッシュにより試行履歴が不当に除外されないこと」「バックエンドrouter内のデッドコード（_check_comfy_exists）の除去」、および「SSoT仕様書の整合更新」を検証する。

## 1. テスト配置計画 (Test Placement Plan [MUST [W-DD-PLACE]])

チケット番号を含まない既存の配置先テストファイルを拡張する：

| 対象 AC | 検証テストファイル | テストケース名（タグ付き） |
| :--- | :--- | :--- |
| AC-1 | `frontend/src/pages/GeneratePage/sections/__tests__/GenerationGallerySection.probing.test.tsx` | `does not trigger image availability probe on thumbnail load [REQ-379/AC-1]` |
| AC-2 | `frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateDisplayState.availability.test.tsx` | `retains trial history image even if upstream ComfyUI original is missing [REQ-379/AC-2]` |
| AC-3 | `backend/tests/integration/legacy/test_comfy_proxy.py` | `test_comfy_router_dead_code_eliminated [REQ-379/AC-3]` |
| AC-4 | `docs/specs/SPEC_COMMON.md`, `docs/specs/SPEC_GENERATE.md` | ドキュメント照合検証（doc-verify） |

## 2. 実行コマンド (Verification Commands)

### Gate 1: 静的解析 & 単体検証
- UI不変条件検証: `backend\.venv\Scripts\python scripts/verify_ui_invariants.py`
- Frontend 型検査: `cd frontend; npm run typecheck`
- Backend 型検査: `mypy backend`
- Frontend 局所テスト: `cd frontend; npx vitest run src/pages/GeneratePage/sections/__tests__/GenerationGallerySection.probing.test.tsx src/pages/GeneratePage/hooks/__tests__/useGenerateDisplayState.availability.test.tsx`
- Backend 局所テスト: `backend\.venv\Scripts\python -m pytest backend/tests/integration/legacy/test_comfy_proxy.py -k "REQ-379"`

### Gate 2: 統合テストスイート
- Backend フルテスト: `backend\.venv\Scripts\python -m pytest backend/tests/integration/legacy/test_residual_history.py backend/tests/integration/legacy/test_comfy_proxy_fault.py`
- Frontend 関連テスト: `cd frontend; npx vitest run src/pages/GeneratePage/sections/__tests__ src/pages/GeneratePage/hooks/__tests__`

### Gate 3: 境界・フォールトインジェクション
- ComfyUI 404時保持テスト: 上流ComfyUIが404を返してもBEにWebPキャッシュが存在する限り、ギャラリーから画像が消えずに正常表示されること。
- サムネイルロード失敗時保持テスト: ネットワークエラー等でサムネイルが読み込めなかった場合、再試行バッジが表示されるのみで、試行履歴から項目が勝手に削除されないこと。

