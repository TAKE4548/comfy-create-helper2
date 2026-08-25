# REQ-190: テスト計画書

## 1. 単体テスト (Frontend Unit Tests)

### テスト対象ファイル
- `frontend/src/store/__tests/useGenerationStore.test.ts`

### 実行コマンド
```bash
npm --prefix frontend test src/store/__tests/useGenerationStore.test.ts
```

### 検証項目
1. **`cancelJob` (Pending Job)**:
   - `queuePending` から対象ジョブが即座に除外（楽観的更新）されること
   - `comfyApi.deleteQueue` が `{ delete: [promptId] }` で呼ばれること
   - `comfyApi.deleteHistory` が呼ばれないこと（Pendingジョブの場合）
   - `fetchQueue` の明示呼び出しが行われないこと
2. **`cancelJob` (Running Job)**:
   - `comfyApi.interrupt` が呼ばれること
   - 実行中ジョブに対しては `comfyApi.deleteHistory` が呼ばれること
   - `fetchQueue` の明示同期待ちが行われないこと
3. **`clearPendingQueue`**:
   - `queuePending` が即座に空になること
   - `comfyApi.deleteQueue({ clear: true })` が呼ばれること
   - 不要な `deleteHistory` や `fetchQueue` の明示呼び出しが行われないこと
4. **`cancelAllJobs`**:
   - `queuePending` および生成状態が即座にリセットされること
   - `comfyApi.deleteQueue` および `comfyApi.interrupt` が呼ばれること
   - 冗長な `fetchQueue` の明示同期待ちが行われないこと
5. **全体テスト実行**:
   ```bash
   npm --prefix frontend test
   ```\n