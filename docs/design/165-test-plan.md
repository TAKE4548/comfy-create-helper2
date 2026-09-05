# Test Plan: PBI-165 プロンプト翻訳機能の外部APIプロキシ化・チャンクキャッシュおよび手動反映UI/UXの刷新

## 1. 概要 (Test Overview)
本テスト計画は、PBI-165におけるバックエンドプロキシ・マルチプロバイダー・チャンクキャッシュ機能、およびフロントエンドの手動反映・確認プレビューUI、設定画面の整合性と動作を検証するものである。

---

## 2. 自動テスト計画 (Automated Tests)

### 2.1 バックエンド単体・統合テスト (`backend/tests/test_translation_proxy.py`)
実行コマンド:
```bash
cd backend && pytest tests/test_translation_proxy.py -v
```

テストケースと明確な判定基準:
1. `test_sanitize_and_restore_lora_and_weights`:
   - 入力: `"1girl, <lora:face_v1:0.8>, (silver hair:1.2), {blue eyes}, cinematic lighting"`
   - 期待値:
     - サニタイズ後: `"1girl, __TOKEN_0__, __TOKEN_1__, __TOKEN_2__, cinematic lighting"`
     - 抽出トークン辞書: `{"__TOKEN_0__": "<lora:face_v1:0.8>", "__TOKEN_1__": "(silver hair:1.2)", "__TOKEN_2__": "{blue eyes}"}`
     - 復元後: 入力と完全一致 (`assert restored == original`)
2. `test_chunk_splitting_and_deduplication`:
   - 入力: `"1girl, solo,  silver hair , 1girl, solo"`
   - 期待値: チャンク一覧 `["1girl", "solo", "silver hair"]` （空白トリム済み・重複排除）
3. `test_cache_hit_and_miss_accounting`:
   - 1回目リクエスト: `"red dress, blue shoes"` $\rightarrow$ `meta.total_chunks == 2`, `meta.cached_chunks == 0`, `meta.api_requested_chunks == 2`, `meta.billed_characters == 19`
   - 2回目リクエスト: `"red dress, green hat"` $\rightarrow$ `meta.total_chunks == 2`, `meta.cached_chunks == 1`, `meta.api_requested_chunks == 1`, `meta.billed_characters == 9` (`"green hat"` のみ消費)
4. `test_prompt_translate_endpoint_full_flow`:
   - `POST /api/translate/prompt` リクエスト: `{"prompt": "1girl, silver hair", "source_lang": "en", "target_lang": "ja"}`
   - 期待値: HTTP 200, `response.json()["translated_prompt"]` が空でなく、`meta.total_chunks == 2` であること。
5. `test_empty_and_whitespace_prompt`:
   - 入力: `""` または `"   \n  "`
   - 期待値: HTTP 200, `translated_prompt == ""`, `meta.total_chunks == 0`, `meta.api_requested_chunks == 0`
6. `test_connection_endpoint`:
   - `POST /api/translate/test` リクエスト: `{"provider": "google_free"}`
   - 期待値: HTTP 200, `success == True`, `sample_translation` が空でない文字列であること。

---

### 2.2 フロントエンド単体テスト (`frontend/src/pages/GeneratePage/hooks/__tests__/usePromptTranslation.test.ts`)
実行コマンド:
```bash
cd frontend && npm run test -- src/pages/GeneratePage/hooks/__tests__/usePromptTranslation.test.ts
```

テストケースと明確な判定基準:
1. `test_open_and_close_translation`:
   - `openTranslation('positive', '1girl, solo')` 呼び出し時: `isOpen === true`, `activeRole === 'positive'`, `mode === 'en_to_ja'`, `sourceText === '1girl, solo'`, `translatedText === ''` であること。
   - `closeTranslation()` 呼び出し時: `isOpen === false`, `activeRole === null` であること。
2. `test_no_automatic_prompt_overwrite`:
   - 初期プロンプト `paramValues.positive = '1girl, solo'`
   - `executeTranslate()` を実行し、API成功レスポンス（`'1人の女の子, ソロ'`）を受信。
   - **検証**: `paramValues.positive` が `'1girl, solo'` のままであり、一切書き換わっていないこと (`expect(paramValues.positive).toBe('1girl, solo')`)。
3. `test_manual_append_action`:
   - 初期プロンプト `paramValues.positive = '1girl, solo'`
   - 翻訳結果 `translatedText = 'kimono, shrine'`
   - `applyToPrompt('append')` 実行後: `paramValues.positive === '1girl, solo, kimono, shrine'` であること。
4. `test_manual_replace_action`:
   - 初期プロンプト `paramValues.positive = '1girl, solo'`
   - 翻訳結果 `translatedText = 'kimono, shrine'`
   - `applyToPrompt('replace')` 実行後: `paramValues.positive === 'kimono, shrine'` であること。
5. `test_mode_switching`:
   - `setMode('ja_to_en')` 呼び出し時: `mode === 'ja_to_en'`, `sourceText === ''`, `translatedText === ''` であること。

---

## 3. 定量・構造的手動テストシナリオ (Measurable Manual Verification)

### シナリオ 1: 英→日 プロンプト確認プレビューの非破壊性検証
1. Positiveプロンプト入力欄に `"1girl, solo, silver hair, glowing eyes"` を入力。
2. 入力欄右上の「翻訳」ボタンをクリック $\rightarrow$ モーダルが開く。
3. 「翻訳して確認」ボタンをクリック $\rightarrow$ 2.0秒以内に日本語プレビュー欄に訳文（例: `"1人の女の子, ソロ, 銀髪, 輝く瞳"`）が表示される。
4. モーダルの「✕」ボタンまたは外部クリックでモーダルを閉じる。
5. **合否判定基準**:
   - Positiveプロンプト入力欄のテキストが `"1girl, solo, silver hair, glowing eyes"` と完全一致（1文字の相違もなし）であること。

### シナリオ 2: 日→英 自由入力からの末尾追記・上書き検証
1. Positiveプロンプト入力欄が `"masterpiece, best quality"` の状態で「翻訳」ボタンをクリック。
2. モーダル上部タブで「日→英 作成・追記」をクリック。
3. 日本語テキストエリアに `"着物, 神社"` と入力し、「英語へ翻訳」をクリック。
4. 英語プレビュー欄に `"kimono, shrine"` が表示される。
5. 「末尾に追記」ボタンをクリック。
6. **合否判定基準**:
   - Positiveプロンプト入力欄の値が `"masterpiece, best quality, kimono, shrine"` に更新されていること。
7. 再度「日→英」モードで `"サイバーパンク, ネオン街"` を翻訳 $\rightarrow$ 「入力欄を上書き」をクリック。
8. **合否判定基準**:
   - Positiveプロンプト入力欄の値が `"cyberpunk, neon city"`（置換後の英語のみ）になっていること。

### シナリオ 3: 画像生成中の並行動作およびレスポンス時間検証
1. バッチサイズ `4` で画像生成を開始。
2. 生成進行中（プログレスバーが稼働中）にプロンプト翻訳モーダルを開き、「翻訳して確認」を実行。
3. **合否判定基準**:
   - 翻訳リクエストの完了（レスポンス受信）が **2.5秒以内** であること。
   - 画像生成プロセスのWebSocket接続および進捗が途切れず、VRAM枯渇エラー（CUDA Out of Memory）が発生しないこと。

### シナリオ 4: 設定画面（SettingsPage）でのプロバイダー変更と接続テスト
1. 設定画面（`/settings`）の「Translation Settings」を開く。
2. プロバイダーで「Google 翻訳 (無料)」を選択し、「接続テスト」ボタンをクリック。
3. **合否判定基準**:
   - 「✓ 疎通成功」の緑色バッジが表示され、サンプル訳文が表示されること。
4. プロバイダーを「DeepL API」に切り替え、APIキーが未入力の状態でテスト実行 $\rightarrow$ 「エラー: APIキーを入力してください」が明示されること。
