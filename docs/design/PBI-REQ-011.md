# 設計書 - REQ-011: 編集ノードのマッピングマスタ設定（CRUD追加）

## 1. 目的と概要
現在、ノードのパラメータマッピング（`mapping_master`）テーブルのCRUD機能はバックエンド側で提供されていますが、フロントの設定画面（`SettingsPage.tsx`）に管理UIが存在しないため、マスタ情報の管理にSwagger UIなどの裏口利用やDB直接操作が必要となっています。
本設計では、設定画面に「ノードマッピングマスタの管理UI」を実装し、一覧表示、新規追加、編集、削除（関連マッピング警告付きカスケード削除）をUIから容易に行えるようにします。

## 2. アーキテイチャ設計

### 2.1 バックエンド（FastAPI / SQLAlchemy）
カスケード削除時の警告（AC-4）を適切に表示するために、指定したマッピングマスタがどのワークフローで利用されているか（WorkflowMappingとの関連）を調査するAPIエンドポイントを追加します。

- **エンドポイント**: `GET /api/mapping-masters/{master_id}/usages`
- **概要**: 指定された `master_id` に関連付けられている `WorkflowMapping` のリストと、属する `Workflow` の名前を取得する。
- **レスポンスモデル**:
  ```json
  [
    {
      "workflow_id": 1,
      "workflow_name": "SDXL Base Generator",
      "node_id": "10"
    }
  ]
  ```

### 2.2 フロントエンド（React + TypeScript）

#### 1. 設定ページの更新（SettingsPage.tsx）
- 新しいセクションとして「Node Mapping Masters」を追加します。
- 一覧表示にはテーブル（またはカードグリッド）を用い、以下の項目を表示します：
  - Display Name / Role
  - Parameter Name / Input Type
  - Expected Class Types (バッジ表示)
  - Title Patterns (バッジ表示)
  - 操作（編集ボタン、削除ボタン）
- 「+ Add Mapping Master」ボタンを右上に配置します。

#### 2. 新規追加・編集ダイアログ（MappingMasterModal.tsx）
- **役割**: 新規作成および既存マスタの編集。
- **入力項目**:
  - `role` (文字列、一意、必須)
  - `display_name` (文字列、必須)
  - `param_name` (文字列、必須)
  - `input_type` (セレクトボックス、`textarea` / `int` / `float` / `select`、必須)
  - `expected_class_types` (カンマ区切り入力、配列に変換して送信)
  - `title_patterns` (カンマ区切り入力、配列に変換して送信)
- **API通信**:
  - 新規: `POST /api/mapping-masters`
  - 編集: `PUT /api/mapping-masters/{id}`
  - 重複時（409 Conflictや一意性エラー等）はフォーム上に適切なエラーメッセージを表示します。

#### 3. 削除確認ダイアログ（DeleteConfirmModal）
- 削除ボタンが押された際、カスケードされる関連マッピングの有無を調べるため、`/api/mapping-masters/{master_id}/usages` を呼び出します。
- 使用中のワークフローが存在する場合：
  - 「警告：このマスタを削除すると、以下のワークフローの関連マッピングも自動的に削除されます」という警告と共に、対象ワークフローの一覧（ワークフロー名とノードID）を表示します。
- 物理削除は `DELETE /api/mapping-masters/{id}` を呼び出します。

---

## 3. UI/UX デザイン設計
デザインは monorepo 既存のダークテーマ、および `SettingsPage.tsx` のスタイルと調和させ、プレミアムな質感を持つボーダーラインとホバーエフェクトを採用します。

### 3.1 一覧テーブルデザイン
```
+---------------------------------------------------------------------------------+
|  Node Mapping Masters                                     [ + Add Master ]      |
+---------------------------------------------------------------------------------+
| Display Name    Role            Param / Type   Class Types      Patterns        |
+---------------------------------------------------------------------------------+
| ポジティブ      positive        text           [KSampler]       [positive]   ✏️ 🗑️|
|                                 (textarea)     [CLIPTextEncode]                 |
+---------------------------------------------------------------------------------+
```
クラスタイプやパターンは小さなバッジ形式で表示し、視認性を高めます。
