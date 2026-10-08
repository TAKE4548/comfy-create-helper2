# REQ-325 実行可能テスト計画

## 1. 自動テスト Baseline 検証 (CLI Verification)

### Gate 1: 静的型チェック (Typecheck Baseline)
- **コマンド**: `cd frontend; npm run typecheck`
- **期待値**: 型エラー 0 件 (Exit code 0)

### Gate 2: ユニット＆結合テスト (Unit / Full Suite Baseline)
- **コマンド**: `cd frontend; npm test`
- **期待値**: 全テスト PASS (Exit code 0)。脳内推論代用は厳禁。

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### シナリオ 1: PromptTokenEngine 単体・結合検証 (AC-1, AC-2, AC-3)
- **コマンド**: `cd frontend; npx vitest run src/utils/prompt/__tests__/PromptTokenEngine.test.ts`
- **対象**:
  - `tokenize`: 平文プロンプト（重み付け `((cat ears:1.2))`、括弧ネスト、連続カンマ `,,`、空白・改行）の構造化パース
  - `serializeToComfyPrompt`: ComfyUI 準拠の平文文字列への再構成
  - `decoupleTags`: 除外タグの除去およびトリガーワード注入
  - `adjustWeight`: 重み倍率の加算・丸め・0下限保護

### シナリオ 2: captionDecoupler リファクタリング互換性検証 (AC-4)
- **コマンド**: `cd frontend; npx vitest run src/pages/DatasetStudioPage/__tests__/CuratorGrid.test.tsx src/test/e2e_req319_lora_studio.test.tsx src/pages/DatasetStudioPage/utils/__tests__/captionDecoupler.test.ts`
- **対象**:
  - デフォルト衣装スロット時：身体タグ・専用衣装タグの除去と `[characterTrigger, outfitTrigger]` 注入
  - 代替衣装スロット時：身体タグ除去、代替衣装維持、`characterTrigger` のみ注入

---

## 3. Red Teaming (境界値・異常系シナリオ) [Gate 3 Baseline]

### RT-1: 連続区切り文字・空文字列・空白のみの異常入力
- **手順**: `PromptTokenEngine.tokenize(' , , \n\t  ,, ')` および `PromptTokenEngine.serializeToComfyPrompt([])` を実行。
- **期待結果**: 例外なく空配列 `[]` が返却され、シリアライズ結果は空文字 `""` となること。

### RT-2: 括弧のネスト不整合 (閉じ括弧不足・余剰)
- **手順**: `((tag:1.2` や `tag))` などの不完全な構文をパース。
- **期待結果**: 無限ループや ReDoS、ランタイム例外を起こさず、安全にトークン化されること。

### RT-3: 大文字小文字・不要空白を含むタグのデカップリング
- **手順**: `rawPrompt: '1girl,  SILVER HAIR , red eyes'` に対し、`removeTags: ['silver hair']` を指定。
- **期待結果**: 大小文字や前後空白の違いを吸収し、確実に `SILVER HAIR` が除去されること。

---

## 4. ツール主導監査 (Tool-Driven Audit)
- **コマンド**: `python ${GLOBAL_SCRIPTS}/local_model_adapter.py ba-audit`
- **アンロード**: `python ${GLOBAL_SCRIPTS}/local_model_adapter.py unload`

