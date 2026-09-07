# REQ-228 実行可能テスト計画

## 1. 自動テスト (CLI Verification)

### 1.1 単体テスト実行コマンド
```bash
npm --prefix frontend test -- src/components/__tests__/HistoryModalPreview.test.tsx --run
```
- **期待値**:
  - 既存の2件のテストケース（localStorageメタデータ表示、サーバーAPIメタデータフェッチ）が引き続き PASS すること。
  - 新規追加される「開閉遷移時（`isOpen: false -> true`）のフック整合性テスト」が PASS すること。
  - `Rendered more hooks than during the previous render.` エラーが一切送出されないこと。

### 1.2 フロントエンド全体ビルド検証
```bash
npm --prefix frontend run build
```
- **期待値**: TypeScriptコンパイルおよびViteビルドがエラーなく完了すること。

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### 2.1 シナリオ: プレビューモーダル開閉検証
1. 開発サーバー（http://localhost:5173/）にアクセス。
2. 生成画面（Generate）を開き、画像生成完了後（または履歴画像）のサムネイルをクリック。
3. 画像プレビューモーダル（`HistoryModalPreview`）がクラッシュせず正常に開き、画像およびコントロールが表示されること。
4. モーダルを閉じ、再度クリックして開く動作を複数回繰り返してもエラーが発生しないこと。
5. モーダル右下の `<Info />` アイコンをクリックし、パラメータ情報パネルが正常に展開されること。

### 2.2 Red Teaming (異常系・境界値検証)
- **テストケース**: `isOpen: false` の状態で複数回レンダリングされた後、動的に `isOpen: true` へ遷移した際の挙動検証。
- **検証手順**:
  1. React Testing Library の `rerender` を用い、`<HistoryModalPreview isOpen={false} ... />` を描画。
  2. 直後に `<HistoryModalPreview isOpen={true} ... />` で再描画。
- **期待値**:
  - React内部の `updateWorkInProgressHook` によるフック数チェックを無事通過し、例外なく描画が完了すること。

---

## 3. ツール主導監査 (Tool-Driven Audit)
- **コード監査**: `local_model_adapter.py qa-audit` を実行し、客観的証明を得ること。
