# PBI-REQ-192 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **コマンド**: `pytest backend/tests/test_translation_proxy.py backend/tests/test_translation.py`
- **期待値**: 全テストケースが PASS すること。

```bash
pytest backend/tests/test_translation_proxy.py backend/tests/test_translation.py -v
```

## 2. 追加テスト項目
1. `test_llm_translation_mock`: `call_llm` をモックして `translate_prompt`（`provider="llm"`）の実行結果を検証。
2. `test_connection_service_llm`: `test_connection(provider="llm")` が `success=True` を返すことを検証。

## 3. 手動 / API検証
- **エンドポイント**: `POST /api/translate/test`
  - ペイロード: `{"provider": "llm"}`
  - 判定基準: `{"success": true, "sample_translation": "...", "error": null}`
