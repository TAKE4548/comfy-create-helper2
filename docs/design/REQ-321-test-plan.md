---
id: REQ-321
title: Test Plan for Fix Dataset Studio Node Remapping Save Failure and Incomplete State Update
status: draft
tags:
  - test-plan
  - dataset-studio
  - node-remapping
---

# REQ-321 実行可能テスト計画 (Executable Test Plan)

## 1. 自動テスト (CLI Verification)

### 1.1 静的型検査 (Typecheck)
- **コマンド**: `cd frontend; npm run typecheck`
- **期待値**: エラー0件 (exit code 0)。TypeScript 型検査が完全にパスすること。

### 1.2 単体・統合テスト (Unit & Integration Vitest)
- **コマンド**: `cd frontend; npx vitest run src/pages/DatasetStudioPage/__tests__/MatrixGenerationStep.test.tsx`
- **期待値**: 全テストケースが PASS すること。

### 1.3 フロントエンド全体リグレッション (Full Test Suite)
- **コマンド**: `cd frontend; npm test`
- **期待値**: 全テストスイートが PASS すること。

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### シナリオ 1: マッピング未定義（初期状態）ワークフローのノード再割当・保存フロー
- **事前条件**:
  - `workflow.mappings` が空配列 `[]` のワークフローを選択。
  - `mappingMastersApi.list()` が `Main_Positive_Prompt` (id: 1) と `Negative_Prompt` (id: 2) を返却する状態。
- **実行手順**:
  1. `open-remap-modal-button` をクリックして `NodeRemapModal` を開く。
  2. Positiveノードに候補ノード `#6`、Negativeノードに候補ノード `#7` を選択する。
  3. `save-remap-button` をクリックする。
- **期待結果**:
  - `workflowsApi.update(workflow.id, { mappings: [{ master_id: 1, node_id: '6' }, { master_id: 2, node_id: '7' }] })` が呼び出されること。
  - `workflowsApi.get(workflow.id)` が再取得され、返却された最新 Workflow で `onSaved` が実行されること。
  - モーダルが閉じ、`MatrixGenerationStep` 上のバッジが `Positive:#6` および `Negative:#7` に即時更新されること。

### シナリオ 2: 既存他マッピング保持検証
- **事前条件**:
  - `workflow.mappings` に KSampler などの別マッピング (`master_id: 3, node_id: '3'`) が既に存在する。
- **実行手順**:
  1. モーダルで Positiveノードのみを `#8` に変更して保存する。
- **期待結果**:
  - `workflowsApi.update` のペイロードに `master_id: 3, node_id: '3'` が欠落せず保持され、Positiveノードのみ `#8` に更新されること。

---

## 3. Red Teaming (境界値・異常系)

### Red Teaming 1: `mappingMastersApi.list` 取得エラー（ネットワーク障害）
- **試験内容**: `mappingMastersApi.list` が `Promise.reject(new Error('Network error'))` を返す状態にする。
- **期待結果**:
  - アプリケーションがクラッシュせず、モーダル内にエラーメッセージが表示されること。
  - 不正な `master_id: undefined` などの無効なペイロードで `workflowsApi.update` が送信されないこと。

### Red Teaming 2: `workflowsApi.update` 保存失敗（サーバーエラー 500）
- **試験内容**: `workflowsApi.update` がエラーを投げる状態にする。
- **期待結果**:
  - モーダルは閉じずに留まり、エラーメッセージ「マッピングの保存に失敗しました」が表示されること。
  - 親コンポーネント（MatrixGenerationStep）の `currentWorkflow` は破損・更新されないこと。

### Red Teaming 3: `workflowsApi.get` 再取得失敗時のエラーハンドリング
- **試験内容**: `workflowsApi.update` は成功するが、その直後の `workflowsApi.get` が失敗する状態にする。
- **期待結果**:
  - 不完全なローカル状態を親に流し込まず、エラーメッセージ「最新状態の取得に失敗しました」が表示されること。
  - 親コンポーネントの状態が不整合なデータで上書きされないこと。

---

## 4. ツール主導監査 (Tool-Driven Audit)
- **コマンド**: `python C:\Users\audih\.gemini\antigravity\scripts\local_model_adapter.py ba-audit`
- **期待値**: Task Card と設計の整合性、受入基準の充足性が証明されること。

