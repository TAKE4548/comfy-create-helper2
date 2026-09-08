# REQ-230 実行可能テスト計画

## 1. 自動テスト (CLI Verification)

### 1-1. バックエンドテスト (pytest)
- **コマンド**: `pytest backend/tests/test_comfy_proxy.py -v`
- **対象ケース**:
  - `test_get_comfy_object_info_all_success`: ComfyUI正常稼働時に200 OKとスキーマ辞書を返却し、キャッシュされること。
  - `test_get_comfy_object_info_all_cached`: キャッシュ存在時にComfyUIへのリクエストを行わずにキャッシュを即時返却すること。
  - `test_get_comfy_object_info_all_failure_503`: キャッシュ未存在かつComfyUI接続失敗時に、空辞書の200ではなく 503 Service Unavailable を返却すること。
- **期待値**: 全テスト PASS。

### 1-2. フロントエンド単体テスト (vitest)
- **コマンド**: `npm --prefix frontend test -- src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts src/utils/__tests__/bypassUtils.test.ts`
- **対象ケース**:
  - `handleGenerateSets with active bypass`:
    - `comfyObjectInfo` が提供されている場合、`applyBypass` が適用されたワークフローJSONが `queuePrompt` に渡されること。
    - `comfyObjectInfo` が空（`{}`）または未ロードの場合、`queuePrompt` が呼ばれず、生成が中断されて `setErrorToast` が呼ばれること。
  - `bypassUtils`:
    - 正常なスキーマに基づくバイパス結線テストが全件 PASS すること。
- **期待値**: 全テスト PASS。

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### 2-1. 結合操作シナリオ
1. **ComfyUI未起動からの復旧シナリオ**:
   - ComfyUI未起動状態でブラウザから画面（`http://localhost:5173`）にアクセス。
   - `/api/comfy/object_info` が503を返却してもアプリがクラッシュせず、空キャッシュで固着しないことを確認。
   - ComfyUIを起動し、WebSocketが接続（`isConnected: true`）された瞬間に `comfy-object-info` が自動再取得され、2000件以上のノードクラス情報がストアに格納されることを確認。
2. **バイパス適用生成シナリオ**:
   - ワークフロー57を選択し、バイパスプロファイル（例: `detailers`）をトグルONにする。
   - 生成ボタンを押下し、ComfyUIのHistory API（`GET /api/comfy/history`）で投入されたプロンプトJSONを確認。
   - バイパス対象ノード（`1283:1216` 等）が確実に除外され、結線が直結されていることを確認。

### 2-2. Red Teaming (境界値・異常系検証)
- **手順**:
  - バイパスプロファイルを1件以上有効化（ON）した状態にする。
  - 意図的に `comfyObjectInfo` を空オブジェクト `{}` に設定した状態で生成ボタンを押下する。
- **期待される挙動**:
  - ComfyUIへのプロンプト送信（`/api/comfy/prompt`）が一切実行されないこと。
  - UI画面に「ComfyUIのノードスキーマ情報を取得できていないため、バイパス処理を実行できません。ComfyUIの接続を確認してください。」のエラートーストが即時表示されること。

---

## 3. ツール主導監査 (Tool-Driven Audit)
- **コマンド**: `python ${GLOBAL_SCRIPTS}\artifact_linter.py docs/design/REQ-230.md`
- **期待値**: 違反なし（PASS）。
