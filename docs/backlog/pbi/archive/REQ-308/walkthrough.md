# REQ-308 検証ウォークスルー

## 判定

**PASS** — 3 Gate の証拠と承認済み AC を確認。T9 で前回不足していた完全一致アサーションが追加され、focused run がすべて成功した。

## Gate 1・2

- Gate 1: `cd frontend; npm run typecheck` — 今回再実行、exit 0。
- Gate 2: `cd frontend; npx vitest run` — coordinator 提供のコード変更後の記録、exit 0、99/99 files・1001/1001 tests。全体テストは再実行していない。

## Gate 3 実行証拠

以下の focused run を実行し、全7ファイル・181 tests が成功した（ファイルごとの合計）。

- `cd frontend; npx vitest run src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts src/pages/GeneratePage/hooks/__tests__/usePresetState.test.ts src/components/TagChipEditor/__tests__/useChipParser.test.ts` — exit 0、3 files・95 tests。
- `cd frontend; npx vitest run src/store/__tests__/slices/multiSetSlice.test.ts src/pages/GeneratePage/hooks/__tests__/usePresetStoreSync.test.ts src/components/TagChipEditor/__tests__/TagChip.test.tsx src/components/TagChipEditor/__tests__/TagChipEditor.test.tsx` — exit 0、4 files・86 tests。

### AC 照合

- **AC-1 — PASS。** `multiSetSlice.test.ts` は allowlist による textarea 限定を確認し、非textarea checkpoint/LoRA の値が `getEffectiveParamValues()` の戻り値で元の preset と完全一致することを確認する。`usePresetState.test.ts` では preset 復元・一括更新後も非textarea値を保持し、prompt role だけをチップ化する。`useGenerateAction.test.ts` は単独・multi-set 両方の queue payload 全体を `toEqual` で照合し、checkpoint=`model.v2.safetensors`、LoRA=`style.v1.2.safetensors` の全文字列が保持されることを確認する。非textarea role に壊れた stale chip を与える fail-closed ケースも成功。
- **AC-2 — PASS。** `useGenerateAction.test.ts` の単独・multi-set payload は prompt を `first. second, third.` と完全一致で検証する。`usePresetState.test.ts` は同じ prompt を preset update API に保存し、再読込後の chips が `['first.', 'second', 'third.']` で末尾ドット2個となることを確認する。
- **AC-3 — PASS。** `TagChip.test.tsx` ではサブメニューで `word.` を `word` に編集確定し、強度変更後も `onEdit` の値が `(word:1.5)`（末尾ドット0個）となる。明示ドットを残す対照ケースは `(word:1.5).`（末尾ドット1個）を確認する。`useChipParser.test.ts` はチップ文字列を `word, next` と直列化し、再パース後も `word`・`next` の2チップになること、および明示ドットありなら `word. next` となることを検証する。preset update API payload・再読込後も明示ドット2個を保持する。
- **AC-4 — PASS。** `TagChipEditor.test.tsx` の Anima text mode round-trip、`TagChip.test.tsx` の double-click edit、`useChipParser.test.ts` の非Animaカンマ結合が成功。
- **AC-5 — PASS。** `REQ-303.md`、`REQ-306.md`、`SPEC_COMMON.md` の仕様記述が textarea role 限定および明示末尾ドットによる区切り規則へ整合していることを確認。回帰テストも通過。

### 境界シナリオ

`usePresetStoreSync.test.ts` は workflow mapping 未ロード時の空 allowlist、mapping 到着後の clean active preset 再同期、dirty active preset のローカル編集保持を確認。dirty ケースでは `loadPresetData` の再呼び出しがなく、ローカル `paramValues` が維持される。すべて成功。

## 非阻害事項

既存の React `act(...)` 警告と、生成エラー処理のテストが意図的に出す console error があったが、Vitest は成功し、REQ-308 の失敗はない。未確認の受入条件は残っていない。
