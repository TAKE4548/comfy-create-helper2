# REQ-264 実行可能テスト計画

<!-- [LLM Audit Trace: Action=qa-audit | Model=qwen3.5-9b-claude-4.6-highiq-thinking-heretic-uncensored | Domain=reasoning | Params=9.0B | Quant=Q6_K] -->

## 1. 自動テスト (CLI Verification)
- **コマンド**: `npm test -- src/test/e2e_req264_preview_autofollow.test.ts` (Working Directory: `frontend`)
- **合否判定基準 (定量メトリクス)**:
  - Vitest 終了コード: `0` (FAIL 0 件)
  - テストケース総数: 最低 7 件以上（AC-1〜AC-6 および Red Team シナリオ）
  - 各 `it()` ブロックが `expect()` による機械的アサーションをパスし、テストランナー出力に `Test Files 1 passed (1), Tests 7 passed (7)`（または 7 件以上の passed）が出力されること。
  - フルテストスイート `npm test`（`frontend/` 配下）において、既存の全 76 テストファイル・734 件以上のテストにリグレッション（0 失敗）がないこと。

---

## 2. 結合・シナリオ検証 (Vitest ハーネスによる機械的検証)

### シナリオ 1: トグル操作 UI の存在とモード切替 (AC-1, AC-4, AC-5)
- **テスト関数名**: `it('REQ-264 AC-1 & AC-4: toggle button switches between auto-follow and lock with clear visual feedback', async () => ...)`
- **検証手順**:
  1. `renderHook` にて `useGenerateDisplayState` をマウント。
  2. 初期状態（`previewAutoFollow: true`）を確認。
  3. `togglePreviewAutoFollow()` を実行。
  4. `previewAutoFollow: false` に更新され、`localStorage.getItem(LS_KEYS.PREVIEW_AUTO_FOLLOW)` が `'false'` になることを確認。
  5. 再度トグルを実行し、`true` に復帰することを確認。
- **機械的判定アサーション**:
  - `expect(useGenerationStore.getState().previewAutoFollow).toBe(true)`
  - `expect(localStorage.getItem(LS_KEYS.PREVIEW_AUTO_FOLLOW)).toBe('false')`

### シナリオ 2: 自動追従有効時の新規生成画像自動フォーカス (AC-2)
- **テスト関数名**: `it('REQ-264 AC-2: when auto-follow is enabled, executed event for own session updates modal preview index to newest image', async () => ...)`
- **検証手順**:
  1. `previewAutoFollow: true`、初期画像リスト `['img_1.png', 'img_2.png']` でモーダルを `img_2.png`（Index 1）で開く。
  2. 自セッションジョブ完了イベント `comfy-job-event` (`type: 'executed', images: ['img_NEW.png'], isOwn: true`) をディスパッチ。
- **機械的判定アサーション**:
  - `await waitFor(() => { expect(result.current.sortedDisplayImages[0]).toBe('img_NEW.png') }, { timeout: 3000, interval: 50 })`
  - `expect(result.current.modalPreviewIndex).toBe(0)`
  - `expect(result.current.sortedDisplayImages[result.current.modalPreviewIndex]).toBe('img_NEW.png')`
  - `expect(useGenerationStore.getState().selectedImg).toBe('img_NEW.png')`

### シナリオ 3: 固定（ロック）有効時の画像固定維持 (AC-3)
- **テスト関数名**: `it('REQ-264 AC-3: when lock is enabled, new generation completions do not change currently viewed image', async () => ...)`
- **検証手順**:
  1. `useGenerationStore.getState().setPreviewAutoFollow(false)` に設定。
  2. モーダルを `img_2.png`（Index 1）で開く。
  3. 自セッションジョブ完了イベント `comfy-job-event` (`type: 'executed', images: ['img_NEW.png'], isOwn: true`) をディスパッチ。
- **機械的判定アサーション**:
  - `await waitFor(() => { expect(result.current.sortedDisplayImages[0]).toBe('img_NEW.png') }, { timeout: 3000, interval: 50 })`
  - `expect(result.current.sortedDisplayImages[result.current.modalPreviewIndex]).toBe('img_2.png')`
  - `expect(result.current.modalPreviewIndex).toBe(2)` // img_NEW が先頭に挿入されたため index が 1 -> 2 へ自動補正され閲覧画像は維持
  - `expect(useGenerationStore.getState().selectedImg).toBe('img_2.png')` // ロック中は selectedImg も維持

### シナリオ 4: セッション間・リロード後の状態永続化 (AC-6)
- **テスト関数名**: `it('REQ-264 AC-6: previewAutoFollow state persists in localStorage across unmount and reinitialization', () => ...)`
- **検証手順**:
  1. `setPreviewAutoFollow(false)` を実行。
  2. ストアを再初期化（リロードシミュレーション）。
- **機械的判定アサーション**:
  - `expect(useGenerationStore.getState().previewAutoFollow).toBe(false)`
  - `expect(localStorage.getItem(LS_KEYS.PREVIEW_AUTO_FOLLOW)).toBe('false')`

---

## 3. Red Teaming (境界値・異常系テスト)

### 境界・失敗テスト 1: ロック中に複数件連続生成された後の自動追従への切り替え
- **テスト関数名**: `it('REQ-264 RedTeam-1: toggling from lock to auto-follow immediately jumps to the newest image without lag', async () => ...)`
- **検証手順**:
  1. ロックモードで `img_A.png` を閲覧中に、連続して 3 枚の画像 (`img_B`, `img_C`, `img_D`) が生成される。
  2. ロック中は閲覧対象が `img_A.png` のまま維持されていることを確認。
  3. ユーザーがモーダル内でトグルボタンをクリックして「自動追従」へ切り替える。
- **期待値 (アサーション)**:
  - `expect(result.current.modalPreviewIndex).toBe(0)` // 最新画像 img_D へジャンプ
  - `expect(result.current.sortedDisplayImages[result.current.modalPreviewIndex]).toBe('img_D')`
  - `expect(useGenerationStore.getState().selectedImg).toBe('img_D')`

### 境界・失敗テスト 2: 自動追従中の他端末（external session）生成受信時の保護
- **テスト関数名**: `it('REQ-264 RedTeam-2: auto-follow for own session does not get hijacked by other devices external prompts', async () => ...)`
- **検証手順**:
  1. `previewAutoFollow: true`、`filterOwnSession: false` の状態でモーダルを開く。
  2. 他端末のプロンプト完了イベント (`type: 'executed', isOwn: false, images: ['img_EXTERNAL.png']`) を受信。
- **期待値 (アサーション)**:
  - `await waitFor(() => { expect(result.current.sortedDisplayImages[0]).toBe('img_EXTERNAL.png') }, { timeout: 3000, interval: 50 })`
  - `expect(result.current.sortedDisplayImages[result.current.modalPreviewIndex]).not.toBe('img_EXTERNAL.png')` // 画面ハイジャック防止

### 境界・失敗テスト 3: 画像リストが空の初期状態でのトグル操作
- **テスト関数名**: `it('REQ-264 RedTeam-3: toggling auto-follow with empty image list does not throw or cause undefined index', () => ...)`
- **検証手順**:
  1. 画像が 1 枚も存在しない状態で `togglePreviewAutoFollow()` を実行。
- **期待値 (アサーション)**:
  - `expect(() => result.current.handleToggleAutoFollow()).not.toThrow()`
  - `expect(result.current.modalPreviewIndex).toBe(0)`

---

## 4. ツール主導監査 (Tool-Driven Audit)
- **コード・テスト実行監査**: `local_model_adapter.py qa-audit` を実行し、PASS 基準を満たすこと。
