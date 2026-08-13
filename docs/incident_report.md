# インシデント調査レポート: param sync の設定状態がリロードで解除される & ワークフローコピー時にコピーされない件

## 1. 概要
「param sync（パラメータ同期グループ）」の設定において、以下の2つの不具合が報告された。
1. **ページリロード時の設定解除**: ページをリロードすると param sync の設定状態（有効/無効やグループ定義）が反映されなくなる。ただしデータは保持されており、設定（`ParamSyncModal`）を開いて閉じると復旧する。
2. **ワークフローコピー時の設定未引継ぎ**: ワークフローをコピー作成した際、元のワークフローに設定されていた param sync の設定がコピー先に引き継がれず、再設定が必要になる。

---

## 2. 再現手順

### 不具合1: ページリロード時の設定解除
1. 任意のワークフローを選択し、param sync 設定モーダルからパラメータ同期グループを作成・有効化する。
2. ブラウザをリロード（F5 / ページ再読み込み）する。
3. **実際の結果**: パラメータパネル上で Synced 表示が消え、同期が機能しなくなる。設定モーダルを一度開いて閉じると復旧する。

### 不具合2: ワークフローコピー時の設定未引継ぎ
1. param sync グループが設定されているワークフローを開く。
2. 「ワークフローのコピー」を実行して新しいワークフローを作成する。
3. **実際の結果**: コピーされた新ワークフローの param sync グループ一覧が空（未設定）になり、同期設定が引き継がれない。

---

## 3. 根本原因 (Root Cause) — 確定

### 不具合1の主因: 初期ロード時に Store の `paramSyncGroups` が取得されない
- **該当ファイル**: `frontend/src/store/useGenerationStore.ts` および `frontend/src/pages/GeneratePage/hooks/useGeneratePageState.ts`
- **メカニズム**:
  - `useGenerationStore` は初期起動時に `localStorage` から `selectedWorkflowId`（例: `1`）を復元するが、`paramSyncGroups` は `[]`（空配列）として初期化される。
  - `fetchParamSyncGroups(workflowId)` は `setSelectedWorkflowId(id)` の内部でのみ実行される設計になっている。
  - ページリロード時、`selectedWorkflowId` は既に store 上に存在するため `setSelectedWorkflowId` は再呼び出しされず、`paramSyncGroups` が空 `[]` のまま保持される。
  - そのため `ParamPanel` 等の UI 判定（`activeSlaveMap`）が空となり、連動状態が解除されたように見える。
  - 設定モーダル（`ParamSyncModal`）を開くと、モーダル内の `useEffect` により `fetchParamSyncGroups(selectedWorkflowId)` が発火して Zustand store が更新されるため、モーダルを閉じた後に設定が「復旧」する。

### 不具合2の主因: バックエンドの `copy_workflow` エンドポイントにおける `ParamSyncGroup` のコピー処理漏れ
- **該当ファイル**: `backend/app/routers/workflows.py` (`copy_workflow` 関数: Line 20-53)
- **メカニズム**:
  - バックエンドのワークフローコピー処理において、`mappings`（マッピング）、`presets`（プリセット）、`bypass_profiles`（バイパスプロファイル）のコピー処理はループで記述されているが、`param_sync_groups`（`models.ParamSyncGroup`）の複製ループ処理が存在しない。
  - このため、コピー作成された新ワークフローには同期グループが一切生成されない。

---

## 4. 障害分類
- **分類**: **Type A (Implementation Bug / 実装バグ)**
- **該当ファイル**:
  - フロントエンド: `frontend/src/pages/GeneratePage/hooks/useGeneratePageState.ts` または `frontend/src/store/useGenerationStore.ts`
  - バックエンド: `backend/app/routers/workflows.py` (Line 20-53)

---

## 5. 修正の方向性 (参考：/dev-design で正式設計)
1. **フロントエンド**:
   - `useGeneratePageState`（またはワークフローロード時の `useEffect`）にて、`selectedWorkflowId` が確定した初期ロード時にも `fetchParamSyncGroups(selectedWorkflowId)` を確実に実行して store に同期グループを保持させる。
2. **バックエンド**:
   - `backend/app/routers/workflows.py` の `copy_workflow` 関数内に `src.param_sync_groups` のコピー処理を追加し、新ワークフロー ID で同期グループ（`ParamSyncGroup`）を複製生成する。

---

## 6. 次のステップ
調査完了につき、ユーザーの承認後に `/dev-design` Workflow を実行して詳細設計および実装タスクの分割を行います。
