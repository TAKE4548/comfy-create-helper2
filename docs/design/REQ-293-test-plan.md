---
id: REQ-293
type: test-plan
tags: [bug-fix, type-a, frontend, regression]
---

# REQ-293 テスト計画

## 1. テスト戦略概要

| ゲート | 手法 | ツール |
|---|---|---|
| Gate 1 (TypeCheck) | 静的型検査 | npm run typecheck |
| Gate 2 (Unit) | 既存ユニットテスト + 新規回帰テスト | vitest |
| Gate 3 (Integration) | 手動 E2E 確認 | ブラウザ |

## 2. 既存テスト保護 (回帰確認)

### RT-1: TEST-UI-01
- **ファイル**: frontend/src/components/__tests__/SpeechBubbleEditorModal.test.tsx L1217-1230
- **内容**: primaryTagSetId 付きでレンダー時にボタンが存在する
- **期待**: PASS (変更なし)

### RT-2: TEST-UI-02
- **ファイル**: SpeechBubbleEditorModal.test.tsx L1233
- **期待**: PASS (モック注入のため、fallback 変更の影響なし)

### RT-3: TEST-UI-03 (重要)
- **ファイル**: SpeechBubbleEditorModal.test.tsx L1256
- **注意**: generateDraftApi を明示的に渡しているため Fix-1 の影響を受けない。**テスト変更不要**。
- **期待**: PASS

### RT-4: TEST-UI-04
- **ファイル**: SpeechBubbleEditorModal.test.tsx L1277
- **期待**: PASS (変更なし)

## 3. 新規ユニットテスト

### NT-1: fallback が実 fetch を呼ぶ (Fix-1 検証)
- **ファイル**: frontend/src/components/__tests__/SpeechBubbleEditorModal.test.tsx (追記)
- **説明**: generateDraftApi prop を渡さずレンダーし、ボタン押下時に fetch が /api/speech/scene-draft へ POST されることを確認

```tsx
it('NT-1: generateDraftApi未注入時でもfallbackがfetchを呼ぶ', async () => {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ bubbles: [] }),
  })
  vi.stubGlobal('fetch', mockFetch)
  renderWithQuery(
    <SpeechBubbleEditorModal
      snapshot={mockSnapshot}
      onClose={mockOnClose}
      onSaved={mockOnSaved}
    />
  )
  fireEvent.click(screen.getByTestId('scene-batch-generate-btn'))
  await waitFor(() => {
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/speech/scene-draft',
      expect.objectContaining({ method: 'POST' })
    )
  })
  vi.unstubAllGlobals()
})
```

### NT-2: HistoryPage が generateDraftApi を渡す (Fix-2 検証)
- **ファイル**: 新規 frontend/src/pages/HistoryPage/__tests__/HistoryPage.speech.test.tsx
- **説明**: HistoryPage -> setSelectedForSpeech -> SpeechBubbleEditorModal に generateDraftApi が prop として渡されることを確認
- **コマンド**: npx vitest run src/pages/HistoryPage/__tests__/HistoryPage.speech.test.tsx

## 4. 統合テスト (手動) IT-1

1. アプリを起動し HistoryPage を開く
2. スナップショットのセリフ編集ボタンをクリック
3. SpeechBubbleEditorModal が開いたことを確認
4. 「シーン一括生成」ボタンをクリック
5. 期待: DevTools で POST /api/speech/scene-draft が発火する
6. 期待: スピナー -> バブル追加 (またはエラー表示)

## 5. Red Team

### RD-1: fetch エラー時 -> useSceneSpeechGeneration catch -> console.error
### RD-2: ネットワーク断 -> setIsGenerating(false) でスピナー解除
### RD-3: 型チェック: cd frontend && npm run typecheck (エラーなし)

## 6. 全テスト実行コマンド

```bash
cd frontend && npm run typecheck
cd frontend && npx vitest run src/components/__tests__/SpeechBubbleEditorModal.test.tsx
cd frontend && npx vitest run src/hooks/__tests__/useSceneSpeechGeneration.test.ts
cd frontend && npx vitest run src/pages/HistoryPage/__tests__/HistoryPage.speech.test.tsx
```
