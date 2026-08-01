---
id: REQ-125
title: "REQ-125 テスト計画書"
status: design
---

# REQ-125 テスト計画書

## 1. 自動テスト (Unit Tests)

### テストコマンド
```bash
npm --prefix frontend test -- --run frontend/src/hooks/__tests__/useMasterMappingRows.test.ts
```

### テストケース
1. `initFromScan`: `existingMappings` が渡された際、有効なマッピング項目は既存の `node_id` を保持すること。
2. `initFromScan`: 既存マッピングの `node_id` がワークフロー上に存在しない/無効な場合、対象項目のみデフォルトのキー/候補値にフォールバックし、他の有効な項目は維持されること。
3. `initFromScan`: `existingMappings` が空または未指定の場合は、従来通りの自動検出初期値が設定されること。

## 2. ビルド・リンター検証

### 検証コマンド
```bash
npm --prefix frontend run build
```
