# REQ-292 実行可能テスト計画

## 1. 自動テスト (CLI Verification)

### 1.1 Unit Tests — TEST-UI-01〜04

**コマンド**:
```bash
cd frontend
npx vitest run src/components/__tests__/SpeechBubbleEditorModal.test.tsx
```

| テストID | 説明 | 期待値 |
|---|---|---|
| TEST-UI-01 | `primaryTagSetId` 付きでレンダーしたとき「シーン一括生成」ボタンが存在する | `getByTestId('scene-batch-generate-btn')` が見つかる |
| TEST-UI-02 | ボタンクリックで `handleBatchGenerateClick` が発火する | `generateDraftApi` が呼ばれる (モック検証) |
| TEST-UI-03 | `primaryTagSetId=null` でもボタンクリック後 `generateDraftApi` が `{target_tag_set_id: null}` で呼ばれる | サイレント終了しない |
| TEST-UI-04 | モバイル「編集設定」タブで生成完了後、`activeMobileTab` が `'preview'` に遷移する | DOM クラス / state 変化 |

### 1.2 Hook Unit Tests

**コマンド**:
```bash
cd frontend
npx vitest run src/hooks/__tests__/useSceneSpeechGeneration.test.ts
```

追加ケース:
- `primaryTagSetId=null` 時、`generateDraftApi` が `{snapshot_id, target_tag_set_id: null}` で呼ばれる
- `isGenerating` が true → false に正しく遷移する

### 1.3 型チェック

**コマンド**:
```bash
cd frontend
npm run typecheck
```
**期待値**: エラー 0 件

## 2. 結合・E2E検証 (Integration & E2E Verification)

### シナリオ A: primaryTagSetId あり → 通常ルート
1. ブラウザで SpeechBubbleEditorModal を開く（primaryTagSetId=1 渡す）
2. ヘッダー右に「シーン一括生成」ボタンが表示される
3. クリック → Sparkles が Loader2 に切り替わる
4. API 完了後、Loader2 が Sparkles に戻り、吹き出しが追加される

### シナリオ B: primaryTagSetId = null → null ルート
1. SpeechBubbleEditorModal を primaryTagSetId なし（または null）で開く
2. ボタンクリック → API が `target_tag_set_id: null` で呼ばれる
3. 吹き出しが追加される（サイレント終了しない）

### シナリオ C: モバイルタブ自動遷移
1. 画面幅 < 768px 環境で「編集設定」タブを選択
2. 「シーン一括生成」クリック
3. 生成完了後、タブが「プレビュー」に自動切替

## 3. Red Team (境界値・異常系)

| ケース | 手順 | 期待エラーハンドリング |
|---|---|---|
| RT-1: 生成中に再クリック | `isSceneGenerating=true` 中にボタン連打 | `disabled` により無効化、二重呼出しなし |
| RT-2: API エラー (null ルート) | `generateDraftApi` を reject に設定、`primaryTagSetId=null` でクリック | `isGenerating` が false に戻る、`console.error` 出力、アプリクラッシュなし |
| RT-3: generateDraftApi 未注入 | prop を渡さずにクリック | fallback `() => Promise.resolve({ bubbles: [] })` が動作、エラーなし |
| RT-4: primaryTagSetId=undefined (BA Audit追加) | prop 未注入（undefined）でクリック | null ルートに流れ `target_tag_set_id: null` で API 呼出。`getByTagSetId` は呼ばれない |
| RT-5: API エラー (通常ルート) | `generateDraftApi` を reject に設定、`primaryTagSetId=1` でクリック | `isGenerating` が false に戻る（既存 finally により保証） |

## 4. ツール主導監査 (Tool-Driven Audit)

```bash
python ${GLOBAL_SCRIPTS}\local_model_adapter.py ba-audit
```
