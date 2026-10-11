# Walkthrough: REQ-342 ワークフロー登録・リマップ候補ノードラベルのタイトル/クラス併記統一

## 1. 概要と完了実績
本改修では、`REQ-342` に基づき、ワークフロー登録モーダル（`UploadWorkflowModal`）、ワークフロー再スキャンモーダル（`RescanModal`）、およびデータセットスタジオのノードリマッピングモーダル（`NodeRemapModal`）における候補ノードのドロップダウン表示不整合（IDのみの表示、空の `[]`、マスタロール名の誤表示など）を根本解消しました。

新設した共通解決ユーティリティ `frontend/src/utils/workflowNodeUtils.ts` (`resolveNodeMetadata`, `getNodeLabel`) により、ComfyUIのAPI辞書形式およびUIグラフ配列形式の双方からタイトルとクラス名を安全に解決し、統一フォーマット `${id} - [${title}] (${classType})` で表示するように統合しました。

---

## 2. 3-Gate Baseline 検証結果

### Gate 1: 静的型検査 (Static Typecheck)
- **コマンド**: `cd frontend; npm run typecheck` (`tsc -b --noEmit`)
- **結果**: **PASS (0 型エラー)**
- **実行証跡**:
  ```text
  > frontend@0.0.0 typecheck
  > tsc -b --noEmit
  (Exit code: 0)
  ```

### Gate 2: フルテストスイートベースライン (Full Discovery Test Suite)
- **コマンド**: `cd frontend; npx vitest run` (全件実行)
- **結果**: **PASS (197テストスイート全件合格、1,854テスト全件合格、0件失敗)**
- **実行証跡**:
  ```text
  Test Files  197 passed (197)
       Tests  1854 passed (1854)
    Duration  74.89s
  (Exit code: 0)
  ```

### Gate 3: シナリオ & レッドチーミング検証
- **新規単体テスト**: `frontend/src/utils/__tests__/workflowNodeUtils.test.ts` (15 tests PASS)
  - TC-UTIL-01〜06: API辞書形式、UIグラフ形式、タイトル未設定（クラス名補完）、直接 `node.title` 設定、ノード不在、`null/undefined` 安全性。
  - TC-RED-01: 数値文字列ID vs 数値IDの相互マッチング検証。
  - TC-RED-02: 破損・nullノードオブジェクトに対する安全フォールバック検証。
- **コンポーネント統合テスト**: `frontend/src/pages/DatasetStudioPage/components/__tests__/NodeRemapModal.test.tsx` (6 tests PASS)
  - TC-COMP-03: パラメータドロップダウン選択肢における統一ラベル形式 `${id} - [${title}] (${classType})` のレンダリング検証。

---

## 3. 受入基準 (AC) 適合性マトリクス

| AC ID | 要件 / 受入基準 | 判定 / ステータス | 検証内容 / Evidence |
| :--- | :--- | :---: | :--- |
| **AC-1** | `RescanModal` において、複数候補が存在するロール（duplicated や複数 candidate_node_ids）のドロップダウン選択肢すべてに、ノードID・ノードタイトル・ノードクラス（ロール名ではなくclass_type）が `${id} - [${title}] (${classType})` の形式で正しく表示されること。 | **PASS** | 不完全な先頭1件のみの `nodeTitleMap` を廃止し、`getNodeLabel(id, workflowJson)` を `<option>` レンダリングに適用。タイトルおよびクラス名がすべての候補IDで解決されるように改修。 |
| **AC-2** | `UploadWorkflowModal` において、候補ノード選択肢に `_meta.title` だけでなく `node.title` や `class_type` がフォールバックされ、`${id} - [] (${classType})` のような空ブラケットや情報欠落が生じないこと。 | **PASS** | ローカルの `getNodeLabel` を共通関数 `getNodeLabel(id, workflowJson)` に差し替え。カスタムタイトル未設定時は `class_type` へ自動フォールバックし、空の `[]` を完全に排除。 |
| **AC-3** | `NodeRemapModal` において、パラメータマッピング選択肢およびプロンプトノード選択肢で一貫したノード情報フォーマットが表示されること。 | **PASS** | ローカル関数を共通関数 `getNodeLabel` のインポートおよび再エクスポートに統一。パラメータマッピング側のドロップダウンでも `${id} - [${title}] (${classType})` で描画されることを TC-COMP-03 で検証。 |
| **AC-4** | 既存テストおよび新規追加されるノードラベル解決テストがすべてグリーン（PASS）であること。 | **PASS** | `workflowNodeUtils.test.ts` (15/15 PASS), `NodeRemapModal.test.tsx` (6/6 PASS) を含むフルスイート 197 ファイル・1,854 テスト全件 PASS (0 failures)。 |

---

## 4. ローカルモデル QA 監査所見とトリアージ
- **監査モデル**: `qwen3.5-9b-claude-4.6-highiq-thinking-heretic-uncensored` (Reasoning Domain)
- **監査判定**: ⚠️ **Conditional Pass**
- **所見内容**:
  - コンポーネントテストの記述において、DOMテキストの検証に正規表現（`\[\w+\]`）などの明示的アサーションをより厳密に指定することで、AIエージェントによる意味論的な近似合格を防ぐ余地があるとの指摘。
- **実装・テストでの対応状況**:
  - 実際のテストコードでは `expect(options).toContain('10 - [Positive Prompt] (CLIPTextEncode)')` のように完全一致の文字列リテラルを用いて検証済みであり、正規表現よりもさらに厳格な完全一致アサーションが行われています。
  - 実装ロジックでも `.trim()` により空白文字による空ブラケットの偽装抜けを防止しています。
  - VRAMは監査完了直後に `local_model_adapter.py unload` により100%解放済みです。

---

## 5. 変更対象ファイル一覧
- `[LOCAL NEW]` [`frontend/src/utils/workflowNodeUtils.ts`](file:///c:/Users/audih/ws/comfy-create-helper2/frontend/src/utils/workflowNodeUtils.ts)
- `[LOCAL NEW]` [`frontend/src/utils/__tests__/workflowNodeUtils.test.ts`](file:///c:/Users/audih/ws/comfy-create-helper2/frontend/src/utils/__tests__/workflowNodeUtils.test.ts)
- `[LOCAL MODIFY]` [`frontend/src/components/RescanModal.tsx`](file:///c:/Users/audih/ws/comfy-create-helper2/frontend/src/components/RescanModal.tsx)
- `[LOCAL MODIFY]` [`frontend/src/components/UploadWorkflowModal.tsx`](file:///c:/Users/audih/ws/comfy-create-helper2/frontend/src/components/UploadWorkflowModal.tsx)
- `[LOCAL MODIFY]` [`frontend/src/pages/DatasetStudioPage/components/NodeRemapModal.tsx`](file:///c:/Users/audih/ws/comfy-create-helper2/frontend/src/pages/DatasetStudioPage/components/NodeRemapModal.tsx)
- `[LOCAL MODIFY]` [`frontend/src/pages/DatasetStudioPage/components/__tests__/NodeRemapModal.test.tsx`](file:///c:/Users/audih/ws/comfy-create-helper2/frontend/src/pages/DatasetStudioPage/components/__tests__/NodeRemapModal.test.tsx)
