# REQ-313 実行可能テスト計画: Prompt Surgeon FuguMT翻訳エンジンの高度化

## 1. 3-Gate ベースライン検証計画

| ゲート | 検証項目 | 実行コマンド | 合否判定基準 |
|---|---|---|---|
| **Gate 1**<br>静的型検査・Lint | 型整合性 & 構文チェック | `mypy backend`<br>`cd frontend; npm run typecheck` | エラー 0 件 (Exit code 0) |
| **Gate 2**<br>単体テスト | 文分割・アンパック・辞書引き・再パック・メタ保護 | `backend\.venv\Scripts\python -m pytest backend/tests/test_translation_proxy.py`<br>`cd frontend; npx vitest run src/components/TagChipEditor/__tests__/TagChipTranslationCard.test.tsx` | 全テスト PASS (Exit code 0) |
| **Gate 3**<br>結合・E2E・Red Team | プロンプト翻訳結合シナリオ & 異常系耐性 | `backend\.venv\Scripts\python -m pytest backend/tests/test_translation_proxy.py -k "e2e or redteam or scenario"` | AC 100% 準拠・クラッシュ 0 件 |

---

## 2. 自動単体テスト仕様 (Unit Test Specs)

### 2-1. `backend/tests/test_translation_proxy.py` テストケース群
1. **`test_split_pattern_with_periods_and_weights` (AC-1 準拠)**:
   - 入力: `"A girl smiles. She reads a book."`
   - 検証: ピリオド直後の空白で 2 文に分割され、文末ピリオド構造が維持されること。
   - 入力: `"((cat_ears:1.2)), [smile]"`
   - 検証: `:1.2` 内のピリオドが分割されず、2 チャンクとして維持されること。
   - 入力: `"waiting... She walks."`
   - 検証: 三点リーダー `...` が `waiting..` などに壊されずに保持されること。
   - 入力: `",, 1girl ,, , solo .."`
   - 検証: 連続区切りによる空チャンクが排除されること。
2. **`test_unpack_and_repack_weight_tags` (AC-2, AC-5 準拠)**:
   - 入力: `"((cat_ears:1.2))"`
   - 検証: `unpack_tag` で `prefix='(('`, `cleaned_core='cat ears'`, `weight=1.2`, `suffix='))'` が得られること。
   - 検証: `repack_tag("猫耳", "((" , 1.2, "))")` で `"((猫耳:1.2))"` が復元されること。
   - 入力: `"[smile]"`
   - 検証: `unpack_tag` で `prefix='['`, `cleaned_core='smile'`, `weight=None`, `suffix=']'` が得られること。
3. **`test_danbooru_dict_lookup_priority` (AC-3, AC-4 準拠)**:
   - 事前準備: モックまたは実 ZIP 辞書をロード。
   - 入力: `"ahoge, cat_ears"`
   - 検証: FuguMT の `translate_batch` が一切呼び出されず（0 回）、辞書ヒットで即座（0ms）に `"アホ毛, 猫耳"` が返されること。`meta.cached_chunks == 2`, `meta.api_requested_chunks == 0` であること。
   - 入力: `"cat_ears, A girl smiles"`
   - 検証: `cat_ears` は辞書から取得され、未登録の `"A girl smiles"` のみ（1 件）が FuguMT に渡され、元の順序でマージされること。
4. **`test_repack_parameter_control` (AC-5 準拠)**:
   - 入力: `"((ahoge:1.2))"`, `repack=False`（タグカード用途）
   - 検証: 括弧と数値が除去された `"アホ毛"` のみが返ること。
   - 入力: `"((ahoge:1.2))"`, `repack=True`（プロンプト全文置換用途）
   - 検証: 元の強度括弧と重みが再パックされた `"((アホ毛:1.2))"` が返ること。
5. **`test_missing_dictionary_fallback_to_fugumt` (AC-6 準拠)**:
   - 事前準備: 辞書パスが存在しない状態をシミュレート（`load_danbooru_dict` が 0 件）。
   - 入力: `"ahoge, 1girl"`
   - 検証: エラーを発生させず、全チャンクが FuguMT バッチ推論にフォールバックして処理されること。
6. **`test_meta_syntax_protection_intact` (AC-7 準拠)**:
   - 入力: `"<lora:animestyle:0.8>, ((cat_ears:1.2)), embedding:easynegative"`
   - 検証: `<lora:...>` と `embedding:...` は翻訳されずにそのまま復元され、`((cat_ears:1.2))` のみが和訳されて再パックされること。

### 2-2. フロントエンド単体テスト (`TagChipTranslationCard.test.tsx`)
1. **`fetches translation with repack: false`**:
   - `TagChipTranslationCard` 表示時に `translateApi.translatePrompt` が `repack: false` を含めて呼び出されることを検証。
   - 重みタグ（例: `((ahoge:1.2))`）を渡した際に、カード上に括弧のないクリーンな日本語（`アホ毛`）が表示されることを検証。

---

## 3. 結合・E2E 検証シナリオ (Integration & E2E Scenarios)

### シナリオ 1: 複数文の自然文プロンプトの訳抜け検証 (AC-1)
1. バックエンドサーバー（FastAPI）を起動。
2. `POST /api/translate/prompt` に以下を送信：
   ```json
   {
     "prompt": "A girl smiles. She reads a book in the library.",
     "source_lang": "en",
     "target_lang": "ja"
   }
   ```
3. レスポンスの `translated_prompt` に後半文（「彼女は図書館で本を読む」等）が確実に含まれ、文末ピリオドで区切られて返ることを確認。

### シナリオ 2: タグカードとプロンプト全文の表示差別化検証 (AC-5)
1. タグカード表示: `POST /api/translate/prompt` に `{"prompt": "((cat_ears:1.2))", "repack": false}` を送信。
   - 期待値: `"猫耳"` （純粋日本語のみ）
2. プロンプト置換: `POST /api/translate/prompt` に `{"prompt": "((cat_ears:1.2))", "repack": true}` を送信。
   - 期待値: `"((猫耳:1.2))"` （強度構文が維持）

### シナリオ 3: 辞書・自然文・メタ構文の複合プロンプト検証 (AC-3, AC-4, AC-7)
1. `POST /api/translate/prompt` に以下を送信：
   ```json
   {
     "prompt": "<lora:my_lora:0.7>, ((ahoge:1.1)), 1girl. She holds a blue flower.",
     "repack": true
   }
   ```
2. 期待値:
   - `<lora:my_lora:0.7>` がそのまま先頭に復元される。
   - `ahoge` は辞書（0ms）から「アホ毛」となり、`((アホ毛:1.1))` に再パックされる。
   - 自然文「She holds a blue flower.」が FuguMT で正しく和訳される。

---

## 4. Red Teaming (境界値・異常系シナリオ)

### Red-1: 壊れた括弧・不整なコロン構文の入力 (不正構文耐性)
- **入力例**: `"(cat_ears"`, `"((cat_ears:))"`, `":::cat_ears"`, `"cat_ears:abc"`
- **期待挙動**: `unpack_tag` が正規表現不一致としてフォールバックし、例外をスローせず raw core として安全に FuguMT または辞書に渡し、システムクラッシュを回避する。

### Red-2: 辞書 ZIP ファイルの消失・権限エラー (Graceful Degradation)
- **手順**: `tmp/danbooruTagCompleteCsv_v1020250919.zip` を一時的に退避またはリネームした状態で `load_danbooru_dict(force_reload=True)` を実行。
- **期待挙動**: エラー 500 やプロセスダウンを起こさず、`0` 件ロードとして警告ログを出力し、FuguMT 単独推論へ安全にフォールバックすること。

### Red-3: 連続句読点と小数点・三点リーダーの同時出現 (境界値耐性)
- **入力例**: `",,, ... waiting... 1.5, :1.2 ... end."`
- **期待挙動**: 空チャンクがすべて排除され、`:1.2` や `...` が破壊されず、不要な空トークンによる FuguMT エラーが発生しないこと。

---

## 5. ツール主導監査 (Tool-Driven Audit)
1. **BA 監査**: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py ba-audit` による要求カバレッジおよび整合性の検証。
2. **GPU メモリ解放**: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py unload` による VRAM 100% 解放の確認。
3. **コミット前 Linter**: `python ${GLOBAL_SCRIPTS}\pre_commit_linter.py` および `backlog_linter.py` による UTF-8 No-BOM / LF / 機密情報の監査。
