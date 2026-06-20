# REQ-054 テスト計画

- **PBI**: REQ-054 — 全画面表示で真っ黒の画面になる問題（再発）
- **対象ファイル**: `frontend/src/components/HistoryModalPreview.tsx`

---

## 自動テスト

```bash
# TypeScript エラーの詳細も出力可能にする
cd frontend
npx tsc --noEmit; if [ $? -eq 0 ]; then echo '{"status":"PASS","message":"No TypeScript errors"}'; else echo '{"status":"FAIL","message":"TypeScript compilation failed"}'; fi

# ESLint ルールの標準形式を使用し、結果を検証
npx eslint src/components/HistoryModalPreview.tsx --rule 'react-hooks/rules-of-hooks: error' > /dev/null 2>&1; if [ $? -eq 0 ]; then echo '{"status":"PASS","message":"No React hooks violations"}'; else echo '{"status":"FAIL","message":"React hooks violations found"}'; fi
```

---

## 手動および検証手順の厳密な定義

### TC-01: 全画面プレビューの表示検証 (AC-1)
1. 生成ページまたは履歴ページを開く
2. 画像サムネイルをクリック
3. **期待結果と客観的検証**: 
   - モーダル要素が DOM に存在すること（`document.querySelector('.fixed.inset-0.z-50') !== null`）
   - モーダルの表示状態が visible であること（`getComputedStyle(element).display !== 'none'`）
   - 画像要素が正しくレンダリングされていること（`img`タグの `src` がクリックしたサムネイルの画像URLと一致）

### TC-02: 全画面プレビューの閉じ動作検証 (AC-2)
1. 全画面プレビューを開く
2. 右上の × ボタン（または `onClose` トリガー要素）をクリック
3. **期待結果と客観的検証**:
   - モーダル要素が DOM から削除されること（`document.querySelector('.fixed.inset-0.z-50') === null`）
4. 手順 1-2 を繰り返し、今度は背景（外側）をクリック
5. **期待結果と客観的検証**:
   - モーダル要素が DOM から削除されること（親要素の `onClick={onClose}` ハンドラが正しく機能していること）

### TC-03: React Hooks エラーがコンソールに出力されない (AC-3)
1. ブラウザの DevTools > Console を開く
2. 全画面プレビューを開く → 閉じる → 再度開く（3往復）
3. **期待結果と客観的検証**: 
   - コンソールログおよびエラーに `React has detected a change in the order of Hooks` が出力されていないこと

### TC-04: LoRA スタック情報の正確性検証 (AC-4)
1. 以下のテストデータを準備：`lora_name="test_lora_v2"`, `weight=0.75` などのLoRAスタック付きスナップショット画像をクリックして全画面プレビューを開く
2. 右下のインフォボタン（ℹ）をクリックして情報パネルを表示
3. **期待結果と客観的検証**: 
   - LoRA Stack セクションに `test_lora_v2 (0.75)` が正確に表示されること
   - 複数のLoRAが存在する場合、それらがリスト形式で重なりなく一覧表示されていること
   - ウェイト値が小数点以下2桁で表示され、設定値と完全に一致すること（許容誤差：±0.005）
4. **検証方法**: 表示されたテキストを抽出し、期待値の文字列と比較して完全一致することを確認する。
