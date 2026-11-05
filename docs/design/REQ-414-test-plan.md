# REQ-414 実行可能テスト計画: ComfyUI Node許容Seed大整数範囲対応

## 1. 自動テスト Baseline 検証 (CLI Verification)

### Gate 1: 静的型チェック (Typecheck Baseline)
- **コマンド**: `cd frontend; npm run typecheck`
- **期待値**: TypeScript エラー 0 件 (Exit code 0)

### Gate 2: ユニット＆結合テスト (Unit / Full Suite Baseline)
- **コマンド**: `cd frontend; npm test` (局所検証: `npx vitest run src/utils/__tests__/seedModel.test.ts src/components/__tests__/SeedField.test.tsx src/utils/__tests__/seedBatch.test.ts`)
- **期待値**: 全テスト PASS (Exit code 0)

### Gate 3: シナリオ・境界値・Red Teaming 検証
- **コマンド**: `cd frontend; npx vitest run src/pages/GeneratePage/__tests__/dedicatedSeedIntegration.test.tsx`
- **期待値**: 大整数固定バッチ生成およびComfyUIノードパラメータ注入の完全成功 (Exit code 0)

---

## 2. 結合・単体・シナリオ検証 (Test Placement & AC Mapping)

### 2.1 テスト配置 (Existing Test Placement)
チケット番号名（REQ-xxx等）の新規テストファイル作成は厳禁。既存テストファイルへ `[REQ-414/AC-n]` タグを付与して追記する。
- `frontend/src/utils/__tests__/seedModel.test.ts` (AC-1, AC-5)
- `frontend/src/components/__tests__/SeedField.test.tsx` (AC-2)
- `frontend/src/utils/__tests__/seedBatch.test.ts` (AC-3, AC-4)
- `frontend/src/pages/GeneratePage/__tests__/dedicatedSeedIntegration.test.tsx` (AC-3, AC-4 統合)

### 2.2 AC 対応テストケース一覧
- AC-1 (seedModel.test.ts): ケース名 [REQ-414/AC-1]。4294967295超大整数（例: 1052824982390234, Number.MAX_SAFE_INTEGER, 64bit値）が安全にパースされること。
- AC-2 (SeedField.test.tsx): ケース名 [REQ-414/AC-2]。大整数Seedを持つmappingでSeedFieldがレンダリングされた際、エラー表示なく入力欄が有効状態であること。
- AC-3 (seedBatch.test.ts): ケース名 [REQ-414/AC-3]。大整数固定Seed（例: 1052824982390234）から複数枚バッチ（2枚）を生成したとき、連続する大整数Seed（N, N+1）が生成されること。
- AC-4 (seedBatch.test.ts): ケース名 [REQ-414/AC-4]。ランダムSeed生成において、ComfyUI互換範囲（0 〜 1125899906842624）の安全乱数が生成されること。
- AC-5 (seedModel.test.ts): ケース名 [REQ-414/AC-5]。負数、小数、空文字、文字列等の不正値が厳格に拒否されること。

---

## 3. Red Teaming (境界値・異常系シナリオ) [Gate 3 Baseline]
1. **MAX_SAFE_SEED 境界オーバーフロー**:
   - `setting.seed = Number.MAX_SAFE_INTEGER` で `batchSize = 2` の固定バッチ生成を要求した場合、バッチ全体が事前拒否され ComfyUI への不正値送信が阻止されること。
2. **64bit整数ワークフローノード取り込み**:
   - `seed: 18446744073709551615` (2^64-1) を持つワークフローJSONを取り込んだ場合、例外でクラッシュせず安全にフォールド（modulo）されて正常に読み込まれること。
3. **不正文字列・浮動小数点インジェクション**:
   - `"123.456"`, `"-100"`, `"1e10"`, `"undefined"`, `""` が投入された場合、`parseSeedValue` が適切なエラーメッセージとともに拒否すること。

---

## 4. リスク評価およびフォールバック条件
- **Risk Level**: Low (フロントエンドの数値制約緩和および乱数上限調整であり、バックエンドDBスキーマや外部破壊的変更は含まない)
- **Mandatory Fallback Triggers**:
  - 万一バックエンドDBやAPIスキーマに影響が生じた場合、または既存のレガシーグローバルSeedテストに1件でもリグレッションが発生した場合は、直ちに全スイート完全検出（Gate 2 Full Discovery Baseline）へフォールバックする。
