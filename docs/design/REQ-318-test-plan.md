# REQ-318 実行可能テスト計画 (Test Plan)

## 1. 自動テスト (CLI Verification)

### Gate 1: 静的型検査・Lint
- **コマンド**: ackend\\.venv\\Scripts\\python -m mypy backend/app/services/translation_service.py
- **期待値**: エラー 0 件 (Exit code 0)。型注釈の不整合がないこと。

### Gate 2: 単体テスト全件実行
- **コマンド**: ackend\\.venv\\Scripts\\python -m pytest backend/tests/test_translation_proxy.py -v
- **期待値**: 既存テスト全件 PASS、および以下の REQ-318 新規テストケース全件 PASS：
  1. 	est_sentence_rejoin_with_commas_for_natural_text: カンマを含む自然文が分断されず 1 文として FuguMT に渡されること。
  2. 	est_hybrid_prompt_tags_dict_and_natural_sentence: Danbooru タグ（辞書即答）と自然文（文単位推論）の混在プロンプトで順序が正しく保持されること。
  3. 	est_weighted_natural_sentence_unpack_and_repack: 強度構文付き自然文のアンパック・再ラップが正常に機能すること。
  4. 	est_period_boundary_multisentence_no_omission: ピリオドで区切られた複数文の境界が維持され脱落しないこと。
  5. 	est_trailing_period_missing_fallback: 末尾にピリオドがない自然文がカンマで細切れに分断されないこと。
  6. 	est_consecutive_and_trailing_commas_sanitized: 連続カンマや末尾カンマが安全に無視されること。

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### シナリオ検証
- **シナリオ 1 (純粋タグ列)**: 1girl, solo, silver_hair, cat_ears, masterpiece -> 全要素 Danbooru 辞書ヒット (0ms即答)。
- **シナリオ 2 (カンマ付き自然文)**: A cute girl with silver hair, who is reading a book under an oak tree, smiles gently. -> カンマで分断されず 1 つの英文として FuguMT へ送信され自然な和訳となる。
- **シナリオ 3 (ハイブリッド混在)**: masterpiece, 1girl, A girl wearing a white dress, sitting on a bench, looks at viewer. best quality -> タグは辞書引き、自然文は文単位推論、元の並び順で結合される。
- **シナリオ 4 (強度指定自然文)**: ((A girl holding a cat, smiling happily:1.2)), solo -> ((猫を抱いて幸せそうに微笑んでいる少女:1.2)), ソロ のように倍率・括弧が正確に維持される。

### Red Teaming (境界値・異常系検証)
- **テストケース R-1 (連続カンマ・末尾カンマ)**:
  - 入力: masterpiece, , 1girl, , 
  - 期待挙動: 空トークンが安全に除外され、クラッシュせず 傑作, 1人の少女 のみ返ること。
- **テストケース R-2 (特殊構文トークンとの競合)**:
  - 入力: <lora:add_detail:0.8>, A cute girl, smiling gently.
  - 期待挙動: メタトークン退避構文（__TOKEN_0__）が文境界やタグ解析で破壊されず、翻訳結果に正確に差し戻されること。
- **テストケース R-3 (ピリオドなし短文)**:
  - 入力: A girl sitting on a chair, reading a book
  - 期待挙動: 末尾ピリオドがなくともカンマで分断されず 1 文として推論されること。

---

## 3. ツール主導監査 (Tool-Driven Audit)
- **コマンド**: python \\local_model_adapter.py ba-audit --target docs/design/REQ-318.md
- **完了後クリーンアップ**: python \\local_model_adapter.py unload
