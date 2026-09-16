# バックエンド（FastAPI / SQLAlchemy）潜在デグレリスク・リファクタリング監査レポート

**実施日時**: 2026-08-30  
**対象範囲**: `backend/app` 全域（エントリーポイント、モデル定義、ルーター群、サービス層、DBセッション管理、マイグレーション）  
**監査手法**: ローカルモデル（Qwen3.5）による静的コードスキャン、pytest回帰テスト実行（204テスト）、およびアーキテクチャ構造解析  

---

## 1. 監査の総評

バックエンドコードベースは機能ごとにモジュール化され、204件の単体/結合テストが完備されていますが、**「今後の機能拡張やPython/ライブラリ更新時に予期せぬデグレを引き起こす構造的脆弱性」**が検出されました。

主な課題は以下の4点です。

1. **DBセッション管理の漏洩・手動生成と同期ブロッキングI/O (`speech_batch.py`, `llm_service.py`)**:
   - 非同期タスク内で `SessionLocal()` が手動生成され、例外時のセッション破棄・プール管理が不完全。
   - グローバルな非同期タスク・ジョブ辞書の排他制御不足とメモリリークの温床。
2. **`main.py` への手動SQLマイグレーションの肥大化と二重管理 (`main.py`)**:
   - `run_migrations()` 内に180行以上の手続き型生SQLが直書きされており、Alembic等のバージョン管理がない。`models.py` との定義乖離リスクが高い。
3. **Python 3.12 / Pydantic V2 互換性警告の大量蓄積 (414件の `DeprecationWarning`)**:
   - 非推奨の `datetime.utcnow()` が全テーブル・全ルーターで多用され、タイムゾーン事故や将来バージョン破壊のリスク。
4. **ルーター層への重いファイル/トランザクション操作の集中とエラー隠蔽 (`routers/snapshots.py`, `routers/comfy.py`)**:
   - ファイル保存とDB書き込みの原子性（Atomicity）不足による孤立ファイル発生リスク。
   - ComfyUI通信エラーの握りつぶし（空辞書返却）によるサイレント障害。

---

## 2. 重点ターゲット別の監査詳細とデグレリスク分析

### 2.1 DBセッション管理・非同期バッチ処理: `routers/speech_batch.py` & `services/llm_service.py`
- **潜在デグレリスク (High / P1)**:
  - **セッションリークとコネクションプール枯渇**: `_process_single_item` 等で `SessionLocal()` が都度手動生成されており、非同期例外発生時にセッションが閉じられない。
  - **モジュールグローバル状態の競合とメモリリーク**: `_batch_jobs` と `_job_tasks` がプレーンな辞書で管理され、ロック機構がない。完了済みタスクの参照が解放されずメモリを圧迫する。
  - **イベントループのブロッキング**: 非同期ルートハンドラ内で同期的な画像ディスク読み込みやDBクエリを実行し、サーバー全体のレスポンス遅延を誘発。
- **推奨リファクタリング**:
  - `with SessionLocal() as db:` コンテキストマネージャへの統一。
  - `asyncio.Lock()` によるスレッドセーフ化と完了タスクの明示的クリーンアップ。
  - 同期I/Oの `asyncio.to_thread` ラップ。

### 2.2 マイグレーション管理: `backend/app/main.py`
- **潜在デグレリスク (High / P1)**:
  - **スキーマの二重管理**: `models.py` のクラス定義と `main.py` の生SQL `ALTER TABLE` が二重に存在し、変更漏れが発生しやすい。
  - **ロールバック不能**: 手続き型SQLがアプリ起動時に実行されるため、マイグレーション失敗時にアプリがクラッシュし、復旧が困難。
- **推奨リファクタリング**:
  - `main.py` から生SQLマイグレーションを分離。
  - Alembicまたは専用の独立マイグレーションモジュールへ移行。

### 2.3 Python 3.12 / Pydantic V2 互換性: `models.py`, `routers/`, `config.py`
- **潜在デグレリスク (Medium / P2)**:
  - **`datetime.utcnow()` 非推奨（414件の警告）**: Python 3.12で廃止予定の `datetime.utcnow()` がデフォルト値や更新処理で使われており、将来のランタイムエラーおよび時差ズレの原因となる。
  - **Pydantic V1 Config警告**: `app/config.py` の `class Config:` による非推奨警告。
- **推奨リファクタリング**:
  - `datetime.now(timezone.utc)` への一括置換。
  - `SettingsConfigDict` への移行。

### 2.4 ルーター・サービス層境界とエラーハンドリング: `routers/snapshots.py` & `routers/comfy.py`
- **潜在デグレリスク (Medium / P2)**:
  - **孤立ファイルの蓄積**: `snapshots.py` で画像保存後にDB書き込みが失敗した場合、またはその逆のケースでロールバックされずディスクが圧迫される。
  - **エラー隠蔽（Silent Failure）**: `comfy.py` でComfyUI通信エラー時に `{}` を返却するため、クライアントが障害を検知できない。
- **推奨リファクタリング**:
  - `snapshot_service.py` へのファイルI/O・トランザクション移譲と補償クリーンアップ。
  - `HTTPException(502)` の明示的送出。

---

## 3. 作成されたバックエンドPBI一覧

本監査に基づき、バックエンドの保守性・安全性を向上させる4件のPBIをバックログに新規登録しました。

| PBI ID | タイトル | 優先度 | 対象モジュール | 主なデグレリスク |
| :--- | :--- | :---: | :--- | :--- |
| [**REQ-212**](docs/backlog/pbi/active/REQ-212.md) | バックエンドDBセッション管理の統一（DI化/リーク防止）および非同期バッチ処理（speech_batch）の排他制御・メモリ解放 | **P1 (High)** | `routers/speech_batch.py`, `services/llm_service.py` | セッションリーク、プール枯渇、非同期競合・メモリリーク |
| [**REQ-213**](docs/backlog/pbi/active/REQ-213.md) | データベースマイグレーションの堅牢化（Alembic移行またはマイグレーション分離）とモデル定義SSoT化 | **P1 (High)** | `main.py`, `models.py` | 生SQL密結合、スキーマ定義二重管理、ロールバック不能 |
| [**REQ-214**](docs/backlog/pbi/active/REQ-214.md) | Python 3.12 / Pydantic V2 互換性対応（datetime.UTC標準化・ConfigDict移行）による非推奨警告の一掃 | **P2 (Medium)** | `models.py`, `routers/`, `config.py` | 414件のDeprecationWarning、Python3.13破壊リスク |
| [**REQ-215**](docs/backlog/pbi/active/REQ-215.md) | スナップショット/ComfyUIルーターのサービス層分離とトランザクション整合性・エラー伝播の適正化 | **P2 (Medium)** | `routers/snapshots.py`, `routers/comfy.py` | 孤立画像ファイル、ComfyUIエラー隠蔽、接続プール管理 |

---

## 4. 総括と推奨する着手ロードマップ

1. **第1段階 (最優先・安定化): [REQ-212](docs/backlog/pbi/active/REQ-212.md) & [REQ-213](docs/backlog/pbi/active/REQ-213.md)**
   - 非同期バッチ処理におけるセッションリーク・メモリリークを塞ぎ、`main.py` から生SQLマイグレーションを分離してスキーマのSSoTを確立します。
2. **第2段階 (互換性・健全性向上): [REQ-214](docs/backlog/pbi/active/REQ-214.md)**
   - `datetime.now(timezone.utc)` への統一と Pydantic V2 ConfigDict 移行を行い、414件の警告を一掃します。
3. **第3段階 (ルーター層の責務純化): [REQ-215](docs/backlog/pbi/active/REQ-215.md)**
   - スナップショット処理のサービス層完全移譲と、ComfyUIプロキシにおけるエラー伝播を正常化します。
