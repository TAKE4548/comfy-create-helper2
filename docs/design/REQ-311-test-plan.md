# REQ-311 実行可能テスト計画: FuguMT翻訳実行時のsentencepiece依存欠落によるエンジン初期化失敗の修正

## 1. 自動テスト (CLI Verification)

### 1-1. 静的型検査 (Gate 1 Baseline)
- **バックエンド型チェック**:
  ```bash
  mypy backend
  ```
  - **期待値**: エラー 0 件（Exit code 0）。`FuguMTService._init_error` および `_init_lock` の型アノテーション整合性。

### 1-2. 単体テスト & 回帰テスト (Gate 2 Baseline)
- **バックエンド FuguMT サービス単体テスト**:
  ```bash
  backend\.venv\Scripts\python -m pytest backend/tests/test_fugumt_service.py backend/tests/test_translation_proxy.py -v
  ```
  - **検証項目**:
    1. `test_sentencepiece_installed`: `sentencepiece` が正常にインポート可能であり、MarianTokenizer に対応可能であること（AC-1）。
    2. `test_fugumt_tokenizer_encoding_functionality`: 実モデルディレクトリ存在時に `AutoTokenizer` によるトークナイズエンコードが例外なく動作すること（AC-2, AC-4）。
    3. `test_init_error_message_propagation`: `initialize()` 失敗時に `_init_error` に原因が記録され、二重修飾なく `translate_batch()` が詳細付き `RuntimeError` を送出すること（AC-3）。
    4. `test_model_dir_fallback_resolution`: CWD 差異（ルート / backend）に左右されずモデルディレクトリが正しく解決されること。

### 1-3. 全テストスイート回帰 (Gate 2 Baseline Discovery)
- **バックエンド全テストスイート**:
  ```bash
  backend\.venv\Scripts\python -m pytest
  ```
  - **期待値**: 全テスト PASS（エラー 0 件）。

---

## 2. シナリオテスト & Red Teaming (Gate 3 Baseline)

### 2-1. シナリオ検証
- **シナリオ 1: 実稼働環境での FuguMT 和訳推論の正常動作 (AC-2)**
  - `backend/models/fugumt-en-ja` が配置された状態で `FuguMTService.get_instance().translate_batch(["master piece, 1girl, smiling"])` を実行。
  - **期待値**: 例外なく和訳リスト `["傑作、1人の女の子、笑顔"]`（または同等の自然な和訳）が返却されること。
- **シナリオ 2: 異常系時のエラーメッセージ明瞭化 (AC-3)**
  - 存在しないダミーパスを指定して `FuguMTService(model_dir="invalid_dummy_path", auto_download=False)` を実行。
  - `translate_batch(["hello"])` を呼び出す。
  - **期待値**: `RuntimeError: FuguMT engine is not available` に加えて、具体的エラー詳細が含まれること。

### 2-2. Red Teaming (境界値・異常系)
- **RT-1: sentencepiece 未インポート検出**:
  - `python -c "import sentencepiece; print(sentencepiece.__version__)"`
  - **期待値**: Exit code 0 でバージョン番号が出力されること。
- **RT-2: CWD 不整合に対するパス堅牢性**:
  - カレントディレクトリが `backend` でもルートでも `FuguMTService().initialize()` がモデルを正しく見つけられること。
