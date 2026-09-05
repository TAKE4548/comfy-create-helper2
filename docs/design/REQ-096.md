# 設計書 - REQ-096: snapshots.pyにおけるビジネスロジックのサービスレイヤー分離

## 1. 目的と概要
`snapshots.py` のルーターハンドラ内に記述されているビジネスロジック（外部 URL からの画像ダウンロード・保存、アップロード画像の保存、トランザクション内での複数リレーション作成・更新・削除など）をサービス層 (`app/services/snapshot_service.py`) へ分離します。
これにより、ルーターの役割を HTTP リクエストの受け取り、パラメータの依存関係の注入、およびレスポンスのスキーマ変換（シリアライズ）のみに限定し、コードの保守性と再利用性を向上させます。

## 2. 変更方針と設計

### 2.1 対象モジュール
- **新規サービス層**: `backend/app/services/snapshot_service.py` [NEW]
- **ルーターハンドラ**: `backend/app/routers/snapshots.py` [MODIFY]
- **ユニットテスト**: `backend/tests/test_snapshots.py` (動作検証のみ、リファクタリング後も全テストが正常にパスすること)

### 2.2 サービス層の設計
`SnapshotService` クラスを定義し、以下のメソッドを提供します。
各メソッドは `db: Session` を引数として受け取り、データベースのトランザクション管理（コミット、ロールバック、クリーンアップ）を行います。

```python
class SnapshotService:
    @staticmethod
    def list_snapshots(
        db: Session,
        workflow_id: Optional[int] = None,
        lora_id: Optional[int] = None,
        tag_set_id: Optional[int] = None
    ) -> list[models.Snapshot]:
        # フィルタリングクエリのロジック

    @staticmethod
    def get_snapshot(db: Session, snapshot_id: int) -> Optional[models.Snapshot]:
        # スナップショットの取得ロジック

    @staticmethod
    def create_snapshot(db: Session, payload: schemas.SnapshotCreate) -> models.Snapshot:
        # トランザクション処理
        # 1. アルバムの検索・作成
        # 2. 画像のダウンロードとローカル保存
        # 3. Snapshot のレコード作成
        # 4. アルバムアイテムの作成と順序設定
        # 5. SnapshotLora, SnapshotTagSet の関連レコード作成
        # 6. エラー発生時はダウンロードした画像ファイルを削除し、トランザクションをロールバックするクリーンアップ処理の追加

    @staticmethod
    def update_snapshot(db: Session, snapshot_id: int, payload: schemas.SnapshotUpdate) -> models.Snapshot:
        # 1. スナップショットの存在検証
        # 2. Lora, TagSet の存在検証 (存在しない場合は HTTPException または ValueError)
        # 3. 既存の関連レコードの削除と新規関連レコードの作成
        # 4. トランザクション制御

    @staticmethod
    def delete_snapshot(db: Session, snapshot_id: int) -> bool:
        # スナップショットの削除とトランザクション制御

    @staticmethod
    def save_uploaded_image(file_content: bytes, original_filename: str) -> str:
        # アップロード画像の検証・保存ロジック
```

### 2.3 エラー時のクリーンアップ (AC-3)
`create_snapshot` 内で画像のダウンロードおよび保存が成功した後にデータベースのインサートやコミットで例外が発生した場合、ディスク上に保存された画像ファイルを削除（クリーンアップ）して不整合を防ぎます。
また、例外発生時は `db.rollback()` を明示的に呼び出します。

## 3. 影響範囲と移行計画
- ルーター `app/routers/snapshots.py` は、`SnapshotService` のメソッドを呼び出し、戻り値の SQLAlchemy オブジェクトを Pydantic スキーマへマッピングするだけの薄いハンドラになります。
- 既存の API シグネチャ（OpenAPI のパス、メソッド、入力スキーマ、出力スキーマ）および動作は一切変更しません。

## 4. トレードオフとリスク
- **ディスク書き込みとDBの不整合**: 画像をディスクに保存した後にDB処理が失敗した場合、ディスク上のファイルを削除するクリーンアップを実装しますが、OSのファイル削除エラー等により稀にゾンビファイルが残るリスクがあります。これは `try ... except OSError` でログを残すことで対応します。
