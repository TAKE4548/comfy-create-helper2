# Test Plan: REQ-067 同一LoRA/タグセットを複数役割に指定した際のスナップショット保存失敗バグ

本テスト計画では、同一のLoRAやタグセットを異なる役割で複数適用した際のスナップショット保存がエラーなく成功すること、および既存データが正しくマイグレーションされることを厳密に検証します。

## 0. 事前準備と環境確認 (Pre-Test Setup)
テスト実行前に以下の環境要件とシードデータが満たされていることを確認します。

### 0.1 環境要件
- Python 3.9 以上
- SQLite データベースファイルが `db/prompt_surgeon.db` に存在すること
- テストデータとして LoRA が2つ以上、タグセットが2つ以上登録されていること

### 0.2 シードデータ検証コマンド
```bash
python -c "import sqlite3; conn = sqlite3.connect('db/prompt_surgeon.db'); print('LoRAs:', len(conn.execute('SELECT * FROM loras').fetchall())); print('Tag Sets:', len(conn.execute('SELECT * FROM tag_sets').fetchall())); conn.close()"
```
- **期待値**: LoRAs $\geq$ 2, Tag Sets $\geq$ 2 (満たさない場合はテスト実行不可)

### 0.3 テスト環境のクリーンアップ＆初期化 (Test Cleanup Protocol)
テスト実行の冪等性を確保するため、テスト実行前にテスト用スナップショットデータをクリアします。
```bash
python -c "import sqlite3; conn = sqlite3.connect('db/prompt_surgeon.db'); conn.execute('DELETE FROM snapshot_loras'); conn.execute('DELETE FROM snapshot_tag_sets'); conn.execute('DELETE FROM snapshots'); conn.commit(); print('DB reset complete'); conn.close()"
```

## 1. 自動テストとロジック検証 (Automated Logic Verification)

### 1.1 テストケースの追加 (`backend/tests/test_snapshots.py`)
以下のユニットテストを追加し、テストを実行します。

1. **`test_create_snapshot_with_duplicate_lora_different_roles`**:
   - 同一の `lora_id` を持ち、それぞれ異なる `role`（`positive` と `negative`）を持つ LoRA オブジェクトを `loras` リストに含めて `POST /api/snapshots` にリクエストします。
   - **ロジックの判定基準**:
     - ステータスコード `201 Created` が返ること。
     - レスポンスのJSONおよびDBの `snapshot_loras` テーブルに、同一の `snapshot_id` に対し、`role="positive"` (strength=0.8) と `role="negative"` (strength=-0.5) の2つのレコードが作成されていること。

2. **`test_create_snapshot_with_duplicate_tag_set_different_roles`**:
   - 同一の `tag_set_id` を持ち、それぞれ異なる `role`（`positive` と `negative`）を持つ タグセット オブジェクトを `tag_sets` リストに含めて `POST /api/snapshots` にリクエストします。
   - **ロジックの判定基準**:
     - ステータスコード `201 Created` が返ること。
     - レスポンスのJSONおよびDBの `snapshot_tag_sets` テーブルに、同一の `snapshot_id` に対し、`role="positive"` と `role="negative"` の2つのレコードが作成されていること。

### 1.2 自動テスト実行コマンド
```bash
# バックエンドのテストを実行
set PYTHONPATH=backend
.venv\Scripts\python -m pytest backend/tests/test_snapshots.py
```

### 1.3 データベース直接検証 (Strict DB Validation)
自動テスト実行完了後、以下の検証用 Python ワンライナーを実行して、直前に作成されたスナップショットに対する重複LoRAデータの登録状況を厳密にアサートします。
```bash
python -c "import sqlite3; conn = sqlite3.connect('db/prompt_surgeon.db'); cursor = conn.execute('SELECT id FROM snapshots ORDER BY id DESC LIMIT 1'); snapshot_id = cursor.fetchone()[0]; cursor = conn.execute('SELECT COUNT(*), SUM(strength) FROM snapshot_loras WHERE snapshot_id=?', (snapshot_id,)); count, sum_strength = cursor.fetchone(); assert count == 2, f'FAIL: Expected 2 rows, got {count}'; assert abs(sum_strength - 0.3) < 0.01, f'FAIL: Expected sum strength 0.3, got {sum_strength}'; print('PASS: DB Content assertion successful.'); conn.close()"
```

### 1.4 明示的な合否判定基準マトリクス (Failure Criteria)
自動テスト・DB検証における判定基準は以下の通りです。いずれか一つでも満たさない場合は FAIL (終了コード 1) とします。

| 検査項目 | 検証コード / アサーション | パス条件 | 失敗時アクション |
| :--- | :--- | :--- | :--- |
| HTTP ステータス | `response.status_code == 201` | 201 Created | エラーログ出力の上、終了コード 1 で終了 |
| レスポンス構造 (LoRA数) | `len(response.json()['loras']) == 2` | 要素数 2 | エラーログ出力の上、終了コード 1 で終了 |
| ロール多様性 | `{l['role'] for l in response.json()['loras']} == {'positive', 'negative'}` | 双方のロールが存在 | エラーログ出力の上、終了コード 1 で終了 |
| DB レコード数 | `count == 2` (中間テーブル) | レコード数 2 | エラーログ出力の上、終了コード 1 で終了 |
| 強度合算値 | `abs(sum_strength - 0.3) < 0.01` | 合算値 0.3 (許容誤差内) | エラーログ出力の上、終了コード 1 で終了 |

## 2. マイグレーション整合性テスト (Migration Integrity)
すでに古いスキーマ（`role`なしユニーク制約）で構築されたデータベースファイルに対して、マイグレーション実行後にテーブルの `UNIQUE` 制約が正しく書き換わっていること、および既存のデータが破損・消失せずに移行されていることを、ハッシュベースで検証します。

### 2.1 スキーマ検証
以下のコマンドを実行し、テーブルスキーマに新しい複合ユニーク制約が含まれていることを確認します。
```bash
python -c "import sqlite3; conn = sqlite3.connect('db/prompt_surgeon.db'); print(conn.execute(\"SELECT sql FROM sqlite_master WHERE name='snapshot_loras'\").fetchone()[0])"
```
- **期待値**: スキーマ内に `UNIQUE (snapshot_id, lora_id, role)` が含まれていること。

### 2.2 データ整合性の検証（マルチテーブルハッシュ比較と外部キーチェック）
マイグレーションの実行前後のテーブル内容を、データハッシュ（IDを除外した各カラム値の順序付きダンプのハッシュ）で比較し、完全に一致することを確認します。
対象テーブルは、影響を受ける `snapshots`、`snapshot_loras`、`snapshot_tag_sets` の3つです。
```bash
python -c "
import sqlite3, shutil, hashlib, sys
sys.path.append('backend')

# 1. 現行データベースのバックアップ
shutil.copyfile('db/prompt_surgeon.db', 'db/prompt_surgeon.db.bak')

def get_full_db_hash(db_path):
    conn = sqlite3.connect(db_path)
    tables = ['snapshots', 'snapshot_loras', 'snapshot_tag_sets']
    table_hashes = {}
    for table in tables:
        # IDに依存しないように並び替えて全カラムを抽出
        cursor = conn.execute(f'SELECT * FROM {table} ORDER BY 1,2,3')
        rows = cursor.fetchall()
        table_hashes[table] = hashlib.sha256(str(rows).encode('utf-8')).hexdigest()
    conn.close()
    return str(sorted(table_hashes.items()))

# 2. 移行前ハッシュ取得
hash_before = get_full_db_hash('db/prompt_surgeon.db.bak')

# 3. マイグレーションの実行
from app.main import run_migrations
run_migrations()

# 4. 移行後ハッシュ取得と比較
hash_after = get_full_db_hash('db/prompt_surgeon.db')
assert hash_before == hash_after, f'FAIL: Data corruption or mismatch! Before={hash_before}, After={hash_after}'
print('PASS: Data Integrity Verified (Hash Match)')
"
```
- **期待値**: アサーションエラーが発生せず、`PASS: Data Integrity Verified (Hash Match)` が出力されること。
- **外部キー制約の検証**:
  ```bash
  python -c "import sqlite3; conn = sqlite3.connect('db/prompt_surgeon.db'); print('FK Violations:', conn.execute(\"PRAGMA foreign_key_check\").fetchall())"
  ```
  - **期待値**: 出力が空リスト `[]` であること（外部キーの整合性が完全に維持されていること）。

## 3. 実行タイムアウト規定 (Execution Timeouts)
各検証コマンドおよび実行プロセスは以下の最大処理時間（タイムアウト）内に完了する必要があります。タイムアウトを超過した場合は FAIL と判定します。

| 操作対象 | タイムアウト制限値 | 検証方法 |
| :--- | :--- | :--- |
| API POST /api/snapshots リクエスト | 30 秒 | pytest もしくはクライアントのタイムアウト設定 |
| データベース SQL クエリ実行 | 10 秒 | sqlite3 デフォルトタイムアウト |
| マイグレーションスクリプト実行 | 60 秒 | シェル / Python プロセス監視タイムアウト |
| APIおよびパフォーマンスの客観的検証 | 60 秒 | 時間内にアサーションおよびパフォーマンス計測が完了しない場合は FAIL |

### 3.1 タイムアウト監視付き実行ラッパー例
すべてのスクリプト実行において、タイムアウト制限を以下のようにラップして実行します。（Windows環境のPowerShell/CMD対応のラッパー定義、または Python によるタイムアウト監視）。
```bash
# Python による実行時間監視の例
python -c "
import subprocess, sys
try:
    res = subprocess.run(['python', '-m', 'pytest', 'backend/tests/test_snapshots.py'], timeout=30, capture_output=True, text=True)
    print(res.stdout)
    if res.returncode != 0: sys.exit(res.returncode)
except subprocess.TimeoutExpired:
    print('FAIL: Execution timeout expired (30s limit)'); sys.exit(1)
"
```

## 4. APIおよびパフォーマンスの客観的検証 (API & Performance Verification)
手動動作確認および UI 操作に伴う「脳内テスト（Brain Test）」の余地を排除するため、以下の Python 検証スクリプトを実行し、API レベルでのデータ整合性とレスポンスレイテンシを定量的・客観的に検証します。

### 4.1 開発サーバー起動
バックエンドサーバー（FastAPI）を起動します。
```bash
# 別のシェルでバックエンドサーバーを起動
set PYTHONPATH=backend
.venv\Scripts\python -m uvicorn app.main:app --port 8000
```

### 4.2 API パフォーマンスおよびデータ整合性の自動アサーション
以下のスクリプトを実行して、実際に重複LoRAを含むスナップショットの保存をリクエストし、レイテンシ（500ms以内）およびDB書き込み後の取得データ整合性を全自動で検証します。
```bash
python -c "
import time, requests, sys

payload = {
    'workflow_id': 1,
    'image_path': 'test_dup_latency.png',
    'params': {},
    'loras': [
        {'lora_id': 1, 'strength': 0.8, 'role': 'positive'},
        {'lora_id': 1, 'strength': -0.5, 'role': 'negative'}
    ],
    'tag_sets': []
}

try:
    # 1. 保存リクエストの送信とレイテンシ計測
    start_time = time.perf_counter()
    response = requests.post('http://localhost:8000/api/snapshots', json=payload, timeout=30)
    end_time = time.perf_counter()
    
    latency_ms = (end_time - start_time) * 1000
    print(f'API Latency: {latency_ms:.2f} ms')
    
    # レイテンシ閾値 (500ms) アサーション
    assert latency_ms <= 500.0, f'FAIL: API Latency exceeded 500ms limit! Actual: {latency_ms:.2f} ms'
    
    # ステータスコード (201 Created) アサーション
    assert response.status_code == 201, f'FAIL: Expected status 201, got {response.status_code}'
    
    data = response.json()
    snapshot_id = data.get('id')
    
    # 2. 保存データの再取得検証
    get_res = requests.get('http://localhost:8000/api/snapshots?workflow_id=1', timeout=5)
    assert get_res.status_code == 200, f'FAIL: Get snapshot list failed with status {get_res.status_code}'
    
    # 作成された最新スナップショットのデータを取得
    snaps = get_res.json()
    target_snap = next(s for s in snaps if s['id'] == snapshot_id)
    loras = target_snap.get('loras', [])
    
    # 3. 中間テーブル構造および値の完全検証 (アサーション)
    assert len(loras) == 2, f'FAIL: Expected 2 LoRAs, found {len(loras)}'
    
    roles = {l['role'] for l in loras}
    assert roles == {'positive', 'negative'}, f'FAIL: Expected roles positive and negative, got {roles}'
    
    strengths = {l['role']: l['strength'] for l in loras}
    assert abs(strengths['positive'] - 0.8) < 0.01, f'FAIL: Positive strength mismatch! Got {strengths[\"positive\"]}'
    assert abs(strengths['negative'] - (-0.5)) < 0.01, f'FAIL: Negative strength mismatch! Got {strengths[\"negative\"]}'
    
    print('PASS: API validation and performance check successful.')
    sys.exit(0)
    
except Exception as e:
    print(f'FAIL: Verification failed: {str(e)}')
    sys.exit(1)
"
```
- **期待値**: アサーションエラーが発生せず、`PASS: API validation and performance check successful.` が出力されること。

