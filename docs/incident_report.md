# インシデントレポート: 翻訳プロバイダー設定の保存失敗

## 1. 事象概要 (Overview)
設定画面の翻訳設定（`TranslationSettingsSection`）において、翻訳プロバイダー（Google Cloud / DeepL / ローカルLLM）や APIキー、API URL を変更して「設定を保存」ボタンを押下しても設定が保存されない。

---

## 2. 再現手順・観測された挙動 (Reproduction & Observed Symptoms)

- **再現手順**:
  1. 設定画面（Settings）の「プロンプト翻訳設定」を開く。
  2. 翻訳プロバイダーを別のプロバイダー（例: `ローカルLLM`）に変更する。
  3. 「設定を保存」ボタンをクリックする。
  4. 画面をリロードすると元の設定に戻っており、保存が反映されていない。
- **観測結果**:
  - `PUT /api/llm-prompts/{key}` に対し、422 Unprocessable Entity または 404 Not Found が返却され保存に失敗する。

---

## 3. 影響範囲・該当コード (Affected Area & Source Locations)

| # | 対象ファイル | 該当行 / 関数 | 詳細 |
|---|---|---|---|
| 1 | `frontend/src/pages/SettingsPage/components/TranslationSettingsSection.tsx` | L73-L79 (`saveSettingsMutation`) | `llmPromptsApi.update` にオブジェクト（`{ content: ... }`）ではなく文字列を直接渡しているため 422 エラーが発生。 |
| 2 | `backend/app/routers/llm_prompts.py` | L70-L82 (`update_llm_prompt`) | キー未存在時に 404 Not Found を返す（アップサート未対応）。 |
| 3 | `backend/app/seed_data.py` | L295-L377 (`LLM_PROMPT_SEEDS`) | `translation_provider` などの初期シードデータが未登録。 |

---

## 4. 根本原因の分析 (Root Cause Analysis)

### (1) フロントエンドのペイロード形式不整合 (主因)
`frontend/src/pages/SettingsPage/components/TranslationSettingsSection.tsx` において、`llmPromptsApi.update` の呼び出しが以下のようになっています：

```typescript
// TranslationSettingsSection.tsx
await Promise.all([
  llmPromptsApi.update('translation_provider', provider),
  llmPromptsApi.update('translation_api_key', apiKey),
  llmPromptsApi.update('translation_api_url', apiUrl),
])
```

`llmPromptsApi.update` は `PUT /api/llm-prompts/{key}` に渡されたデータをそのまま JSON シリアライズして送信します。
バックエンドは `LlmPromptUpdate`（`{ content: string, description?: string }`）を要求するため、文字列がそのまま渡されると 422 Unprocessable Entity となります。

### (2) バックエンドのキー未登録時の 404 エラー
`backend/app/routers/llm_prompts.py` の `update_llm_prompt` では、対象キーが DB に存在しない場合に 404 を返します。
`seed_data.py` に `translation_provider` / `translation_api_key` / `translation_api_url` の初期レコードが定義されていないため、未登録状態の環境では 404 エラーとなります。

---

## 5. 原因分類 (Classification)

<diagnostic_check>
- Root_Cause_Isolated: Yes
- Classification: Type_A: Implementation Bug
- Scope_Restriction: Read-only phase. Code modification or fix proposals are strictly PROHIBITED during this turn.
- Route: Direct to /dev-design
</diagnostic_check>

* **分類**: **Type A (Implementation Bug - 実装バグ)**
  * API ペイロード形式の不整合および初期データ・アップサート処理の不足による実装バグです。

---

## 6. バックログ登録とルーティング (Backlog Registration & Routing)

- **登録 PBI**: `docs/backlog/pbi/active/REQ-193.md`
- **タイトル**: `翻訳設定（プロバイダー・APIキー・URL）の保存不具合修正`
- **次のワークフロー**: `/dev-design REQ-193`
