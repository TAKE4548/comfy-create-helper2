# 設計書 - REQ-022: ワークフローごとの過去画像生成履歴スナップショットからの設定ロード機能

## 1. 目的と概要
過去に生成した画像と同じパラメータ設定やプロンプトを再利用したい場合、従来は履歴からテキストを手動でコピー＆ペーストするか、再入力する必要があり、時間と手間がかかっていました。
本設計では、生成ページで現在選択されているワークフローに紐づく過去のスナップショット（生成履歴）の一覧をドロップダウンUIとして提示し、選択時にそのスナップショットのテキストプロンプトおよび生成パラメータ（シード、ステップ数、CFG、モデルなど）の入力値のみを現在の入力フォームに自動的にロード（上書き反映）する機能を実装します。この際、ワークフローのノード構成（接続）自体は変更（上書き）しません。

## 2. 目的と概要
過去に生成した画像と同じパラメータ設定やプロンプトを再利用したい場合、従来は履歴からテキストを手動でコピー＆ペーストするか、再入力する必要があり、時間と手間がかかっていました。
本設計では、生成ページで現在選択されているワークフローに紐づく過去のスナップショット（生成履歴）の一覧をドロップダウンUIとして提示し、選択時にそのスナップショットのテキストプロンプトおよび生成パラメータ（シード、ステップ数、CFG、モデルなど）の入力値のみを現在の入力フォームに自動的にロード（上書き反映）する機能を実装します。この際、ワークフローのノード構成（接続）自体は変更（上書き）しません。

## 3. アーキテクチャ設計

### 3.1 バックエンドスキーマの拡張 (`backend/app/schemas.py`)
スナップショットの一覧取得時（`GET /api/snapshots`）に、各スナップショットのパラメータ情報（`params`）もフロントエンド側で取得できるようにするため、`SnapshotSummary` スキーマを拡張します。

- **`SnapshotSummary`**
  ```python
  class SnapshotSummary(BaseModel):
      model_config = ConfigDict(from_attributes=True)
      id: int
      workflow_id: int
      image_path: Optional[str] = None
      created_at: datetime
      params: Optional[dict[str, Any]] = None  # 追加
  ```

### 3.2 バックエンドルーターの更新 (`backend/app/routers/snapshots.py`)
SQLAlchemyの `Snapshot` モデル内の `params` フィールド（JSON文字列として保存）を、レスポンスの辞書型に適切にデシリアライズして返却するようにルーターのレスポンス構築ロジックを更新します。

- **`list_snapshots`**
  ```python
  @router.get("", response_model=list[schemas.SnapshotSummary])
  def list_snapshots(workflow_id: Optional[int] = None, db: Session = Depends(get_db)):
      q = db.query(models.Snapshot)
      if workflow_id is not None:
          q = q.filter(models.Snapshot.workflow_id == workflow_id)
      snapshots = q.order_by(models.Snapshot.created_at.desc()).all()
      return [
          schemas.SnapshotSummary(
              id=s.id,
              workflow_id=s.workflow_id,
              image_path=s.image_path,
              created_at=s.created_at,
              params=json.loads(s.params) if s.params else {}
          ) for s in snapshots
      ]
  ```
- **`create_snapshot`**
  ```python
  @router.post("", response_model=schemas.SnapshotSummary, status_code=status.HTTP_201_CREATED)
  def create_snapshot(payload: schemas.SnapshotCreate, db: Session = Depends(get_db)):
      # (既存のDB保存処理...)
      db.commit()
      db.refresh(s)
      return schemas.SnapshotSummary(
          id=s.id,
          workflow_id=s.workflow_id,
          image_path=s.image_path,
          created_at=s.created_at,
          params=json.loads(s.params) if s.params else {}
      )
  ```

### 3.3 フロントエンドの更新 (`frontend/src/pages/GeneratePage.tsx`)

#### A. 過去スナップショット履歴データの取得
React Queryを用いて、現在選択されている `selectedWorkflowId` に紐づく過去のスナップショットデータを取得します。
- `workflows` または `selectedWorkflowId` に依存するクエリとして `snapshots` を定義します。
- **クエリ定義**:
  ```typescript
  const { data: snapshots } = useQuery({
    queryKey: ['snapshots', selectedWorkflowId],
    queryFn: () => snapshotsApi.list(selectedWorkflowId!) as Promise<SnapshotSummary[]>,
    enabled: !!selectedWorkflowId,
  })
  ```

#### B. 履歴選択UIの配置
ワークフロー選択ドロップダウンのすぐ右隣に、スナップショット選択用ドロップダウンを追加します。
- **コンポーネント構成**:
  - `id="snapshot-history-select"` を付与した `<select>` 要素。
  - 現在のワークフローに紐づく過去スナップショットが存在しない（`snapshots.length === 0` または未選択）場合、`disabled` 状態にする（AC-5）。
  - 表示ラベルフォーマット:
    - 生成日時（ローカル形式）とポジティブプロンプトの冒頭（25文字）を連結したもの。
    - ポジティブプロンプトの抽出キー: `params` 内でキー名に `positive` または `prompt` が含まれ、かつ `negative` を含まないものを探索する。
    - 例: `2026/06/12 01:10:00 - a beautiful cyberp...`

#### C. プロンプト・パラメータのロード処理
スナップショットが選択された際、以下の処理を行います。
1. 選択されたスナップショットの `params`（`Record<string, string>`）を取得。
2. ストアの `setParamValues` アクションを呼び出して `paramValues` を上書き。
3. `params` に `Sampler_Seed`（シード値）が含まれている場合、ストアの `setSeed`（数値型に変換）および `setSeedMode('fixed')` を呼び出し、生成画面のシード入力を「固定」にしてスナップショットのシード値を復元します。
4. 選択後にセレクトボックスの表示状態を初期状態（プレースホルダー表示）にリセットできるよう、一時的な選択値制御用のローカルステート（`selectedSnapshotId`）を用いて制御します。

## 4. UI/UX 仕様
- **ドロップダウンの配置**:
  - デスクトップ表示時には、ワークフロー選択セレクトボックス of 右側、リスキャンボタン of 左側に配置します。
  - モバイル表示時にも崩れないよう、Flexコンテナ of 折り返しや配置を最適化します。
- **デザインの一貫性**:
  - 他のセレクトボックスと同様に `bg-surface-2` (背景)、`border-[rgba(255,255,255,0.08)]` (境界)、`text-zinc-300` を適用し、統一されたダークテーマを維持します。
