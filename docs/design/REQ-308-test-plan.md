# REQ-308 テスト計画

## 自動テスト
- `cd frontend; npx vitest run src/store/__tests__/slices/multiSetSlice.test.ts`: `getEffectiveParamValues` の戻り値で textarea role はチップ文字列、非textarea role は入力文字列と完全一致する。例: `model.v2.safetensors` と `style.v1.2.safetensors` は全コードポイント一致。
- `cd frontend; npx vitest run src/pages/GeneratePage/hooks/__tests__/usePresetState.test.ts`: preset 復元・一括更新後の `paramValues.checkpoint` / `paramValues.lora_name` は入力と完全一致し、prompt chip serialization と再パース後の末尾ドット数が元の値と一致する。
- `cd frontend; npx vitest run src/pages/GeneratePage/hooks/__tests__/usePresetStoreSync.test.ts`: workflow mapping 未ロード時は allowlist `[]`、到着後は `['positive_prompt']`。clean active preset は次の effect flush 後に再チップ化し、dirty active preset は `loadPresetData` で上書きしない。
- `cd frontend; npx vitest run src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts`: 単独・複数セット双方の `queuePrompt` workflow parameter payload で checkpoint/LoRA は入力文字列と完全一致、prompt は `first. second, third.` と完全一致。
- `cd frontend; npx vitest run src/components/TagChipEditor/__tests__/useChipParser.test.ts`: `formatTagWeight` の出力末尾ドット数は入力 `baseText` のドット状態に従う（入力0個なら0個、入力1個以上なら正規化後1個）。weight null、1.0、1.3 を含める。
- `cd frontend; npx vitest run src/components/TagChipEditor/__tests__/TagChip.test.tsx`: サブメニューで `word.` を `word` に編集して Enter 確定し、その後の強度変更後も `onEdit` 値の末尾ドット数は0。`word.` のまま強度変更する対照では末尾ドット数1。

## 結合・E2E AC
1. Anima workflow で checkpoint=`model.v2.safetensors`、LoRA=`style.v1.2.safetensors` を持つ preset を開く。`paramValues` および queue payload の両値が入力値と完全一致する。
2. textarea prompt `first. second, third.` を読み込み、chip serialization と queue payload が同一文字列 `first. second, third.` であることを確認する。
3. `word.` チップの submenu で `word` に編集して確定し、次タグとの serialization が `word, next` と完全一致することを確認する。重み変更後も末尾ドット数は0。元チップを `word.` のまま強度変更する対照は末尾ドット数1。preset 文字列への保存・再パース後も末尾ドット数が一致する。
4. 既存ベースライン `src/components/TagChipEditor/__tests__/TagChipEditor.test.tsx` の text mode round-trip と `TagChip.test.tsx` の double-click edit assertions が引き続き PASS し、非Animaの `useChipParser.test.ts` cases が既存のカンマ結合文字列と完全一致することを確認する。

## Red Team 境界・異常系
- checkpoint `model.v2.safetensors`、LoRA `style.v1.2.safetensors`、textarea prompt に同一入力を置く。境界は store `paramValues` と queue payload `paramValues`。非textarea値は入力との完全文字列一致、textarea role だけが chips に反映される。
- textarea mapping が空または未ロードの場合、`paramValues` の各 role を入力値と完全一致で比較する。chip serialization が非textarea role に影響しない。
- mapping 未ロード中に preset を選んだ後、mapping が到着した rerender の effect flush 後に clean active preset の prompt chips が生成される。同期前にユーザー編集済みならその `paramValues` と chips を保持し、`loadPresetData` の再呼び出し回数は0。
- `word...` を編集後にドットなしで確定し、強度を `1.0` / `1.3` に変えた各結果の末尾ドット数が0。
- 混在チップ `sentence.`, `tag`, `ending.` の有効/無効切替・順序変更で、期待する完全文字列（例: `sentence. tag, ending.`）が一致する。

## 完了条件
Gate 1 typecheck 成功、Gate 2 frontend 全 Vitest 成功、Gate 3 上記 AC 全件を対応テスト名と期待される完全文字列・末尾ドット数で照合し PASS。証跡はコマンドの終了コード、Vitest 件数、失敗0件、各 AC に対応する assert を walkthrough に記録する。画面キャプチャや任意の時間上限は受入条件にしない。
