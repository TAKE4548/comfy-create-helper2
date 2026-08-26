# インシデントレポート: LLMプロバイダー選択時の翻訳疎通テスト・プロンプト翻訳エラー

## 1. 事象概要 (Overview)
翻訳機能においてプロバイダーを `LLM` に設定して疎通テスト（`POST /api/translate/test`）またはプロンプト翻訳（`POST /api/translate/prompt`）を実行すると、バックエンドで以下のエラーが発生し、テストおよび翻訳処理が失敗する。

```text
TypeError: call_llm() got an unexpected keyword argument 'db'
```

---

## 2. 再現手順・観測された挙動 (Reproduction & Observed Symptoms)

- **再現手順**:
  1. 翻訳設定（または API リクエスト）で `provider` を `"llm"` に指定する。
  2. `POST /api/translate/test` を実行する。
  3. `translation_service.py` の `test_connection` -> `translate_prompt` -> `translate_llm` が呼び出される。
- **観測結果**:
  - `translation_service.py: L179` にて `await call_llm(prompt, db=db)` が実行される。
  - `call_llm` が `db` 引数を受け付けず、また `user_prompt` の必須引数が渡されていないため、`TypeError` がスローされ接続テストが `success: false`（error: `call_llm() got an unexpected keyword argument 'db'`）となる。

---

## 3. 影響範囲・該当コード (Affected Area & Source Locations)

| # | 対象ファイル | 該当行 / 関数 | 詳細 |
|---|---|---|---|
| 1 | `backend/app/services/translation_service.py` | L165-L181 (`translate_llm`) | `call_llm` のシグネチャと異なる引数（単一 prompt、未対応の `db=db`）で呼び出している。 |
| 2 | `backend/app/services/llm_request.py` | L10 (`call_llm`) | `async def call_llm(system_prompt: str, user_prompt: str, timeout: float = 180.0, model: str = None, llm_params: dict = None) -> str:` の定義。 |

---

## 4. 根本原因の分析 (Root Cause Analysis)

`backend/app/services/translation_service.py` (L165-L181) の `translate_llm` では以下のように記述されていました：

```python
async def translate_llm(
    text: str,
    source_lang: str = "en",
    target_lang: str = "ja",
    db: Optional[Session] = None,
) -> str:
    """Local LLM translation using existing call_llm service."""
    from app.services.llm_request import call_llm

    prompt = (
        f"Translate the following stable diffusion prompt from {source_lang} to {target_lang}. "
        f"Preserve all tokens like __TOKEN_0__, commas, and structure. Output ONLY the translated prompt without explanations.\n\n"
        f"Input:\n{text}"
    )
    result = await call_llm(prompt, db=db)
    return result.strip() if result else text
```

1. `call_llm` は `system_prompt` と `user_prompt` の 2 つの位置引数を要求するシグネチャですが、上記では単一の `prompt` のみが第 1 引数として渡されていました。
2. `call_llm` は `db` キーワード引数を受け付けない設計となっていますが、呼び出し側で `db=db` を渡していました。
3. これにより Python の引数検証で `TypeError: call_llm() got an unexpected keyword argument 'db'` が発生していました。

---

## 5. 原因分類 (Classification)

<diagnostic_check>
- Root_Cause_Isolated: Yes
- Classification: Type_A: Implementation Bug
- Scope_Restriction: Read-only phase. Code modification or fix proposals are strictly PROHIBITED during this turn.
- Route: Direct to /dev-design
</diagnostic_check>

* **分類**: **Type A (Implementation Bug - 実装バグ)**
  * 関数インターフェース定義と呼び出しコードの引数不整合による実装上のバグです。

---

## 6. バックログ登録とルーティング (Backlog Registration & Routing)

- **登録 PBI**: `docs/backlog/pbi/active/REQ-192.md`
- **タイトル**: `LLMプロバイダー選択時の翻訳疎通テスト・プロンプト翻訳エラー修正`
- **次のワークフロー**: `/dev-design REQ-192`
