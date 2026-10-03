# Walkthrough - REQ-311: FuguMT翻訳実行時のsentencepiece依存欠落によるエンジン初期化失敗の修正

本検証では、REQ-311「FuguMT翻訳実行時のsentencepiece依存欠落によるエンジン初期化失敗の修正」の実装に対し、Automated Baseline 3-Gate 検証（型検査、全体テストスイート回帰、シナリオ・Red Teaming検証）およびローカルモデルによる QA 監査を実施しました。

## 1. 受入基準（AC）検証結果

| AC番号 | 受入基準 (Acceptance Criteria) | 検証結果 | 検証エビデンス・テスト項目 |
| :--- | :--- | :---: | :--- |
| **AC-1** | `backend/requirements.txt` に `sentencepiece>=0.2.0` が追加され、実稼働環境で正常にインポート・利用可能であること | **PASS** | `test_fugumt_service.py` -> `test_sentencepiece_installed`<br/>`sentencepiece` バージョン `0.2.2` の正常ロードを確認 |
| **AC-2** | `backend/models/fugumt-en-ja` が存在する環境において、`FuguMTService.initialize()` が例外なく成功し、`translate_batch` による和訳推論が正常に実行されること | **PASS** | `test_fugumt_service.py` -> `test_fugumt_tokenizer_encoding_functionality`<br/>実モデル `fugumt-en-ja` からのロード、および Gate 3 実和訳推論（「名作 女の子1人 笑顔」「庭のかわいい白い猫」）の正常出力を確認 |
| **AC-3** | `FuguMTService.initialize()` が何らかの理由で失敗した際、根本原因の例外詳細が保持され、ログおよびエラーレスポンスへ伝達されること | **PASS** | `test_fugumt_service.py` -> `test_init_error_message_propagation`<br/>`_init_error` に例外詳細が記録され、二重修飾なく `RuntimeError: FuguMT engine is not available: ...` が送出されることを確認 |
| **AC-4** | `sentencepiece` を含むトークナイザー依存のロード健全性をモックなしで検証する回帰テストが配備され、全自動テストを通過すること | **PASS** | `test_fugumt_service.py` に 4 件の実体依存・パス解決回帰テストを追加配備し、全件 PASS を確認 |

---

## 2. Red Teaming & 境界値検証 (Gate 3)

| ID | テスト観点 / 失敗シナリオ | 結果 | 検証詳細 |
| :--- | :--- | :---: | :--- |
| **RT-1** | `sentencepiece` 単体インポート健全性 | **PASS** | `python -c "import sentencepiece; print(sentencepiece.__version__)"` により Exit code 0 で 0.2.2 を出力 |
| **RT-2** | CWD 不整合に対するパス堅牢性 | **PASS** | `test_model_dir_fallback_resolution` により、カレントディレクトリがルート / `backend` のいずれでもモデルディレクトリを正しく解決 |
| **RT-3** | 実稼働パイプラインでのプロンプト和訳推論 | **PASS** | 実モデル配置環境下で `FuguMTService.get_instance().translate_batch(...)` を実行し、即座に自然な和訳配列が返却されることを確認 |

---

## 3. Automated Baseline 3-Gate 検証結果

- **Gate 1: Static Typecheck**
  - コマンド: `mypy backend`
  - 結果: **PASS** (Success: no issues found in 135 source files)
- **Gate 2: Unit & Discovery Regression Tests**
  - コマンド: `pytest` (backend directory)
  - 結果: **PASS** (378 passed, 0 failed in 44.39s)
- **Gate 3: Scenario & Red Teaming**
  - 結果: **PASS** (AC 100% 達成、実モデル推論確認)

---

## 4. 変更ファイル一覧

- `backend/requirements.txt`: `sentencepiece>=0.2.0` を追加。
- `backend/app/services/fugumt_service.py`: `_init_error` 記録・伝播、`_init_lock` スレッドセーフ化、CWD 依存を排除したフォールバックパス解決、MarianTokenizer フォールバックを実装。
- `backend/tests/test_fugumt_service.py`: `sentencepiece` インポート検証、実トークナイザー動作検証、例外メッセージ伝播検証、パス解決検証テストを追加。
- `backend/tests/conftest.py`: テスト間の `app.dependency_overrides` クリーンアップ fixture を追加し、テスト分離性を強化。
- `backend/tests/test_snapshots_webp.py`: teardown 時に `dependency_overrides` を確実に解除するよう堅牢化。
