# REQ-156 テスト計画書: 履歴複数選択時の画像追加に伴う選択ズレ不具合の修正

## 1. 自動テスト (Automated Unit & Integration Tests)

### テストコマンド
```bash
npm --prefix frontend test frontend/src/hooks/__tests__/useMultiSelect.test.ts
npm --prefix frontend test frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx
npm --prefix frontend run test
```

### テストケース詳細
1. **`useMultiSelect.test.ts`**:
   - 文字列ID（画像URL等）をアイテムとして渡した際の選択・複数選択・解除動作の検証。
   - Shiftキーを用いた範囲選択が文字列IDでも正しく動作することの検証。
2. **`useGeneratePageState.test.tsx`**:
   - 履歴画像に対する複数選択が画像URLで管理されることの検証。
   - 履歴画像配列に新規画像が先頭に追加された際、既存選択画像（URL）の選択状態が維持されることの検証。

---

## 2. 手動検証 (Manual Verification)

1. ブラウザで生成画面を開き、数枚画像を生成する。
2. 履歴一覧で複数枚の画像を選択（Shift/Ctrlクリックまたは長押し）する。
3. 選択状態のまま、再度画像生成を実行（またはバッチ生成）し、新画像が先頭に追加された際、選択枠が選択した画像に正しく残り、新画像にずれないことを確認する。
4. 「選択した N 枚を保存」を押下し、保存モーダルで保存を実行。アルバムまたはスナップショットに、意図した画像のみが保存されることを確認する。
