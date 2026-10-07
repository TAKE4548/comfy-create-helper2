# REQ-330 実行可能テスト計画

## 1. 自動テスト Baseline 検証 (CLI Verification)

### Gate 1: 静的型チェック (Typecheck Baseline)
- **コマンド**: `cd frontend; npm run typecheck`
- **期待値**: 型エラー 0 件 (Exit code 0)

### Gate 2: ユニット＆結合テスト (Unit / Full Suite Baseline)
- **TDD / 対象コンポーネントテスト**:
  - コマンド: `cd frontend; npx vitest run src/pages/DatasetStudioPage/__tests__/MatrixGenerationStep.test.tsx`
  - 期待値: AC-1〜AC-4 を含む全テストケース PASS (Exit code 0)
- **フルスイート回帰検証**:
  - コマンド: `cd frontend; npm test`
  - 期待値: 既存機能の破損なく 100% PASS (Exit code 0)

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### シナリオ 1: マトリクス算出後のバッチ投入正常系 (AC-1, AC-2)
- **前提**: 直交マトリクス算出済み（20件の `items` がストアに存在）。
- **操作**: 「ComfyUIに20件直接投入」ボタンをクリック。
- **検証項目**:
  1. `comfyApi.queuePrompt` が20回呼び出されること。
  2. 各呼び出しの引数 `prompt` に `item.raw_prompt`, `item.seed`, ポジティブノード、ネガティブノード（`negativePrompt`）が注入されていること。
  3. 各呼び出しの `client_id` が渡されていること。
  4. プログレスバーが進行し、完了後に `ComfyUIへの20件の直接バッチ投入が完了しました！` のメッセージが表示されること。

---

## 3. Red Teaming (境界値・異常系シナリオ) [Gate 3 Baseline]

### 異常系シナリオ 1: ComfyUI プロキシ通信障害・拒絶時 (AC-3)
- **手順**: `comfyApi.queuePrompt` が例外（502 Bad Gateway / Connection Error）をスローする状態をシミュレートし、「ComfyUIに20件直接投入」をクリック。
- **期待結果**:
  1. `ComfyUI直接投入エラー: <エラー詳細>` が `statusMessage` にセットされ、エラーバナーが表示されること。
  2. `isSubmitting` が `false` に復帰し、UIがフリーズしないこと。

### 異常系シナリオ 2: アイテム未算出状態での投入試行
- **手順**: `items` が空の状態でバッチ投入を試行。
- **期待結果**: 「マトリクスアイテムが生成されていません。先に「直交マトリクス再計算」を実行してください。」のエラーが表示され、`comfyApi.queuePrompt` は呼び出されないこと。

---

## 4. ツール主導監査 (Tool-Driven Audit)
- **コマンド**: `python ${GLOBAL_SCRIPTS}/local_model_adapter.py qa-audit docs/design/REQ-330-test-plan.md`
- **アンロード**: `python ${GLOBAL_SCRIPTS}/local_model_adapter.py unload`
