# 設計書 - REQ-013: スナップショットのメタデータ紐づけとアルバム保存

## 1. 目的と概要
現在、画像生成実行時の結果として保存される「スナップショット」は、生成画像パスと入力された生パラメータ（JSON文字列）のみを保持しています。そのため、「どのLoRAやタグセットを適用して生成したか」というアセットIDとの直接的なリレーションが存在せず、特定アセットを使用した画像を逆引き・整理することができません。
また、生成した画像をアルバム（フォルダ）へ整理するには、一度フラットに保存した後にアルバム管理UIに移動して仕分ける必要があり、保存と整理の体験が分断されています。

本設計では、スナップショット保存時に適用されていたアセット（LoRAモデル・タグセット）のIDリレーションを中間テーブルを介してDBに保存可能にし、同時に生成画面のスナップショット保存用モーダルから直接既存アルバムの選択または新規アルバム作成を行い、自動的に sequence_order の末尾へ追加される仕組みを導入します。

## 2. データベーススキーマの変更

適用されたLoRAモデル（LoRA ID、適用強度）およびタグセット（タグセットID）との多対多リレーションを表現するため、以下の中間テーブルを導入します。

### 2.1 新規テーブル: `snapshot_loras`
スナップショットと適用LoRAモデルの中間関係を定義します。

| カラム名 | データ型 | 制約 | 説明 |
|---|---|---|---|
| `id` | Integer | Primary Key, Autoincrement | 一意識別子 |
| `snapshot_id` | Integer | ForeignKey("snapshots.id", ondelete="CASCADE"), Nullable=False | スナップショットID |
| `lora_id` | Integer | ForeignKey("loras.id", ondelete="CASCADE"), Nullable=False | LoRAモデルID |
| `strength` | Float | Nullable=False | 適用強度 |

- ユニーク制約: `(snapshot_id, lora_id)` の複合ユニーク

### 2.2 新規テーブル: `snapshot_tag_sets`
スナップショットと適用タグセットの中間関係を定義します。

| カラム名 | データ型 | 制約 | 説明 |
|---|---|---|---|
| `id` | Integer | Primary Key, Autoincrement | 一意識別子 |
| `snapshot_id` | Integer | ForeignKey("snapshots.id", ondelete="CASCADE"), Nullable=False | スナップショットID |
| `tag_set_id` | Integer | ForeignKey("tag_sets.id", ondelete="CASCADE"), Nullable=False | タグセットID |

- ユニーク制約: `(snapshot_id, tag_set_id)` の複合ユニーク

---

## 3. バックエンド API 設計

### 3.1 Pydantic スキーマの更新 (`schemas.py`)

#### 新規追加スキーマ
```python
class SnapshotLoraCreate(BaseModel):
    lora_id: int
    strength: float

class SnapshotLoraRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    snapshot_id: int
    lora_id: int
    strength: float

class SnapshotTagSetCreate(BaseModel):
    tag_set_id: int

class SnapshotTagSetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    snapshot_id: int
    tag_set_id: int
```

#### 既存スキーマの変更
```diff
class SnapshotCreate(BaseModel):
    workflow_id: int
    image_path: Optional[str] = None
    params: dict[str, Any]
+   album_id: Optional[int] = None
+   new_album_name: Optional[str] = None
+   loras: list[SnapshotLoraCreate] = []
+   tag_sets: list[SnapshotTagSetCreate] = []

class SnapshotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    workflow_id: int
    params: dict[str, Any]
    image_path: Optional[str] = None
    created_at: datetime
+   loras: list[SnapshotLoraRead] = []
+   tag_sets: list[SnapshotTagSetRead] = []
```

### 3.2 保存APIの処理フロー (`POST /api/snapshots`)
`create_snapshot` 関数において、以下のトランザクションを実行します。

1. **アルバムの処理**:
   - `payload.new_album_name` が提供されている場合:
     - `models.Album` テーブルから同名（unique）のアルバムを検索。
     - 存在しなければ新規作成してDBに追加。存在すればそれを使用。
     - 解決されたアルバムオブジェクトから `album_id` を確定。
   - `payload.new_album_name` がなく、`payload.album_id` が提供されている場合:
     - 指定された `album_id` が存在するか検証（なければ 404 エラー）。
     - 解決された `album_id` を使用。
2. **スナップショットの登録**:
   - `models.Snapshot` インスタンスを作成し、DBに追加 (`db.flush()` によりIDを確定)。
3. **アセット紐付けの登録**:
   - `payload.loras` 内の各LoRAについて、`models.SnapshotLora` レコードを作成して追加。
   - `payload.tag_sets` 内の各タグセットについて、`models.SnapshotTagSet` レコードを作成して追加。
4. **アルバムへの紐付けと並び順 (sequence_order) 整合性**:
   - 紐づけるアルバムが確定している場合、`album_items` テーブルへ追加。
   - 末尾への追加とするため、既存の該当アルバム内の最大 `sequence_order` を取得し、それに `+1` したインデックス（存在しない場合は `0`）を自動設定。
     ```python
     max_order = db.query(func.max(models.AlbumItem.sequence_order)).filter(models.AlbumItem.album_id == target_album_id).scalar()
     next_order = (max_order + 1) if max_order is not None else 0
     ```
5. コミットして作成したスナップショット（Summaryスキーマ）を返却。

---

## 4. フロントエンド設計

### 4.1 API クライアント・型定義の更新
- `api/types.ts` に `SnapshotLoraCreate`, `SnapshotLoraRead`, `SnapshotTagSetCreate`, `SnapshotTagSetRead` インターフェースを追加。
- `SnapshotCreate` および `Snapshot` インターフェースに、新規追加フィールド（`album_id`, `new_album_name`, `loras`, `tag_sets`）を追加。

### 4.2 保存用モーダルダイアログ (`SaveSnapshotModal.tsx`) の導入
「Save Snapshot」ボタンを押した際に、即時保存するのではなく、保存先アルバムを決定するためのポップアップモーダルを新規実装します。

- **表示要素**:
  - **アルバム選択 (ドロップダウン)**: `albumsApi.list()` から取得した既存アルバムの一覧。追加先を1つ選択可能。デフォルトは「アルバムを選択しない (None)」。
  - **新規アルバム名入力 (インプット)**: テキスト入力。入力がある場合、ドロップダウンの選択を無視して新規にアルバムが作成され、そこに追加される。
  - **保存 / キャンセル ボタン**: 「保存」ボタンは API リクエスト中はローディング状態（disabled）にする。
- **適用中アセットの自動解決ロジック**:
  - グローバルストア `useGenerationStore` 内の `appliedAssets` から、`enabled === true` のアセットを抽出します。
  - **LoRA の解決**: `type === 'lora'` のアセットの `assetId`（LoRA ID）と `strength`（`loraPromptString` のコロン区切り `<lora:filename:strength>` からパース、またはデフォルト `1.0`）を取得し、`loras` 配列パラメータとして組み立てます。
  - **タグセット の解決**: `type === 'tagset'` のアセットの `assetId`（タグセット ID）を取得し、`tag_sets` 配列パラメータとして組み立てます。

---

## 5. UI/UX イメージ
```
+---------------------------------------------+
| スナップショットを保存                        [X] |
+---------------------------------------------+
| 保存先アルバム:                               |
| [ 既存のアルバムから選択...             [V] ] |
|                                             |
| または新規アルバムを作成:                     |
| [ 新規アルバム名を入力...                 ] |
|                                             |
+---------------------------------------------+
|                             [キャンセル] [保存] |
+---------------------------------------------+
```
- ダイアログは背景オーバーレイを伴うモーダルで、Vite + Vanilla CSS (既存のダイアログ共通の CSS スタイルまたは Tailwind) に準拠し、プレミアムな外観（ダークモード背景 `surface-2`、`border`、`accent-green`）で実装します。
