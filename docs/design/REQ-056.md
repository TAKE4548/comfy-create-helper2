# REQ-056 設計書: セット構成のプリセット保存・呼び出し機能

## 1. 概要

本機能は、ユーザーが作成したマルチセット生成の個別セットの構成（プロンプト、各種パラメータ、適用されたLoRA/タグセット等のアセット、バッチサイズ、シードモード、シード値）をデータベースに保存し、同じワークフロー内でいつでも呼び出して再利用（読み込み・上書き更新・削除）できるようにするものである。

---

## 2. システム設計

### 2-1. データベース設計

プリセット情報を SQLite DB に保存するため、新規テーブル `workflow_presets` を追加する。

#### `WorkflowPreset` モデル (SQLAlchemy)
- `id`: `Integer` (主キー, autoincrement)
- `workflow_id`: `Integer` (外部キー `workflows.id`, `ondelete="CASCADE"`, nullable=False)
- `name`: `String` (プリセット名, nullable=False)
- `param_values`: `Text` (各パラメータ入力値の JSON 文字列: `Record<string, string>`, nullable=False)
- `applied_assets`: `Text` (適用アセット情報の JSON 文字列: `Record<string, AppliedAsset[]>`, nullable=False)
- `batch_size`: `Integer` (バッチサイズ, nullable=False)
- `seed_mode`: `String` (`'random' | 'fixed'`, nullable=False)
- `seed`: `Integer` (シード値, nullable=False)
- `created_at`: `DateTime` (作成日時, default=utcnow)

#### リレーションシップ
- `Workflow` (1) ── (多) `WorkflowPreset`

---

### 2-2. API エンドポイント設計

FastAPI 側に新しいルーター `/api/workflow-presets` を定義する。

| HTTPメソッド | パス | 説明 |
|---|---|---|
| `GET` | `/api/workflow-presets` | 指定された `workflow_id` に紐づくプリセット一覧を取得する |
| `POST` | `/api/workflow-presets` | 新規プリセットを作成・保存する |
| `PUT` | `/api/workflow-presets/{preset_id}` | 指定された ID のプリセット情報を更新（名前・パラメータの上書き）する |
| `DELETE` | `/api/workflow-presets/{preset_id}` | 指定された ID のプリセットを削除する |

---

### 2-3. フロントエンド状態管理と UI 設計

#### 状態管理の変更・追加
- `frontend/src/api/client.ts` および `types.ts` にプリセット用 API 関数・型定義を追加。
- プリセットの読み込み時、現在アクティブなセット（Zustand ストアの `sets` 配列における `activeSetId` の要素）に対して、プリセットに記録された値を反映し、同時に `localStorage` への永続化も実行する。

#### UI（`GeneratePage.tsx`）
- マルチセットタブバーの右側（「新規セット」ボタンの隣など）に「プリセット」ドロップダウンボタン（ポップオーバー、またはダイアログ）を追加する。
- プリセットのドロップダウンには以下の機能を提供する：
  1. **プリセット一覧の表示**: 現在のワークフローに紐づくプリセットをリスト表示。
  2. **プリセット読み込み**: リスト内の項目をクリックまたは「適用」ボタンを押すことで、現在のアクティブなセットへプリセット内容を上書き反映（AC-3）。
  3. **プリセット上書き更新**: 既存プリセットの更新ボタンから、現在のアクティブなセットの状態をそのプリセットに上書き保存（AC-4）。
  4. **プリセット削除**: ゴミ箱アイコンからプリセットを削除（AC-4）。
  5. **新規保存フォーム**: テキスト入力欄に名前を入れて「保存」ボタンをクリックすることで、現在のアクティブなセットの状態を新規プリセットとして DB に保存（AC-1）。
