# REQ-240 実行可能テスト計画 (QA Audit 改訂版)

## 1. 監査対象 Acceptance Criteria (AC) 定義
- **AC-1**: 他端末ジョブ完了時 (`executed`)、画面手動リロードなしで `comfyHistoryImages[0]` に新規画像URLが即座（同期処理）に挿入されること。
- **AC-2**: 複数端末から並行してジョブが完了した際、完了イベントを受信した時系列順序で `comfyHistoryImages` に先頭追加されること。
- **AC-3**: 詳細プレビューモーダル (`isModalPreviewOpen: true`) を開いている最中に新規画像が先頭挿入されても、現在閲覧中の画像 URL が維持され、モーダルインデックス (`modalPreviewIndex`) が正しく補正されること。
- **AC-4**: 他端末の生成完了によって、自端末の選択中画像 (`selectedImg`)、バッチ生成配列 (`batchImages`)、プレビュー画像 (`previewImage`)、生成フラグ (`isGenerating`) が意図せず変更・リセットされないこと。

---

## 2. 自動テスト (CLI Verification)

### テストスイート 1: 単体テスト (`connectionSlice.test.ts`)
- **事前条件**: `frontend/` ディレクトリ配下で vitest 実行環境が整っていること。
- **実行コマンド**: `npm test -- --run src/store/__tests__/slices/connectionSlice.test.ts`
- **判定基準 (機械的メトリクス)**:
  - 終了コード: 0 (Exit code 0)
  - 成功テスト数: 8 tests passed / 0 failed
  - アサーション内容:
    - 他端末ジョブ (`promptId !== currentPromptId`):
      - `state.comfyHistoryImages[0]` が受信画像の URL と一致 (`toBe(newUrl)`)
      - `state.selectedImg` が直前の値から変化しない (`Δ = 0`)
      - `state.isGenerating` が直前の値から変化しない (`toBe(false)`)

### テストスイート 2: 結合・E2Eテスト (`e2e_req240_multidevice.test.ts`)
- **実行コマンド**: `npm test -- --run src/test/e2e_req240_multidevice.test.ts`
- **判定基準 (機械的メトリクス)**:
  - 終了コード: 0 (Exit code 0)
  - 成功テスト数: 4 tests passed / 0 failed
  - アサーション内容:
    1. AC-1: 他端末 `executed` 受信後に `comfyHistoryImages[0] === expectedUrl` かつ `selectedImg === 'viewing_current.png'`
    2. AC-2 & AC-3: モーダル閲覧中に外部画像が挿入された際、`modalPreviewIndex` が 1 から 2 に自動シフトし、`sortedDisplayImages[modalPreviewIndex] === 'img_B.png'` が維持されること
    3. AC-4: 自端末ジョブ実行時のみ `selectedImg` が新規画像に更新され、`previewImage` が `null` に破棄されること
    4. Red Teaming: `output: {}`、`output: { images: [] }`、`data: {}` などの破損・空ペイロードを受信しても例外をスローせず (`not.toThrow()`)、`selectedImg` および `comfyHistoryImages` が維持されること

### テストスイート 3: リグレッションテスト (`useGeneratePageState.test.tsx`)
- **実行コマンド**: `npm test -- --run src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx`
- **判定基準 (機械的メトリクス)**:
  - 終了コード: 0 (Exit code 0)
  - 成功テスト数: 22 tests passed / 0 failed

---

## 3. ログ整合性検証 (Clean Log Verification)
- **コマンド**: `python scripts/inspect_logs.py --clean-check 1`
- **判定基準**:
  - テスト実行直後1分以内のエラー/警告ログが 0 件 (`[CLEAN] No error/warning entries found`) であること。

