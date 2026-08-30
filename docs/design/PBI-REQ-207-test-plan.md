# PBI-REQ-207 実行可能テスト計画

## 1. ユニットテスト / リグレッションテスト
```bash
# ストアテスト単体実行
npm run test -- frontend/src/store/__tests/useGenerationStore.test.ts

# 全テスト実行
npm test
```

## 2. 検証対象 (Acceptance Criteria)
- [ ] AC-1: `useGenerationStore` のロジックが各ドメインスライス（`connectionSlice`, `bypassSlice`, `paramSyncSlice`, `multiSetSlice`, `jobQueueSlice`）に分割され、各ファイルの行数が適切な規模（300行以内）に収まっていること。
- [ ] AC-2: `ws`, `reconnectTimer` 等のモジュール外シングルトン変数が排除され、ライフサイクル管理が安全にカプセル化されていること。
- [ ] AC-3: `bypassProfilesCache` や `paramSyncGroupsCache` の二重管理が整理され、状態更新時にキャッシュ不整合やStale表示が発生しないこと。
- [ ] AC-4: 既存の全テストスイート（`npm test`）が修正なし、またはより堅牢なスライステストによってすべてパスすること。
