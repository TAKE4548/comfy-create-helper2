# REQ-219 実行可能テスト計画

## 1. 自動テスト (CLI Verification)

- **実行コマンド**:
  ```powershell
  cd frontend
  npm run test -- run src/store/__tests__/usePromptClipboardStore.test.ts src/components/TagChipEditor/__tests__/TagChip.test.tsx src/pages/GeneratePage/components/__tests__/PromptSectionClipboardMenu.test.tsx src/pages/GeneratePage/components/__tests__/SaveAsTagSetModal.test.tsx
  ```
- **判定基準**:
  - プロセス終了ステータスコードが `0` (Exit Code 0) であること。
  - テスト結果サマリーに `Test Files  4 passed (4)` および `FAIL` が 0 件であることが確認できること。

---

### テスト対象と期待される検証内容（コードレベル期待値）

#### 1. `src/store/__tests__/usePromptClipboardStore.test.ts`
- **`copyText` 正常系**:
  ```typescript
  const result = await usePromptClipboardStore.getState().copyText("1girl, solo");
  expect(result).toBe(true);
  expect(usePromptClipboardStore.getState().history[0]).toBe("1girl, solo");
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith("1girl, solo");
  ```
- **`copyText` 重複排除と上限（10件）**:
  ```typescript
  // 11件の異なる文字列を追加
  for (let i = 0; i < 11; i++) {
    await usePromptClipboardStore.getState().copyText(`prompt_${i}`);
  }
  expect(usePromptClipboardStore.getState().history).toHaveLength(10);
  expect(usePromptClipboardStore.getState().history[0]).toBe("prompt_10");
  expect(usePromptClipboardStore.getState().history).not.toContain("prompt_0");

  // 既存文字列の再コピー（先頭移動 & 重複なし）
  await usePromptClipboardStore.getState().copyText("prompt_5");
  expect(usePromptClipboardStore.getState().history).toHaveLength(10);
  expect(usePromptClipboardStore.getState().history[0]).toBe("prompt_5");
  expect(usePromptClipboardStore.getState().history.filter(h => h === "prompt_5")).toHaveLength(1);
  ```
- **`copyText` 空白ガード**:
  ```typescript
  const initialLen = usePromptClipboardStore.getState().history.length;
  const resEmpty = await usePromptClipboardStore.getState().copyText("   ");
  expect(resEmpty).toBe(false);
  expect(usePromptClipboardStore.getState().history).toHaveLength(initialLen);
  ```
- **`setPasteMode` モード切替**:
  ```typescript
  usePromptClipboardStore.getState().setPasteMode('overwrite');
  expect(usePromptClipboardStore.getState().pasteMode).toBe('overwrite');
  usePromptClipboardStore.getState().setPasteMode('append');
  expect(usePromptClipboardStore.getState().pasteMode).toBe('append');
  ```

#### 2. `src/components/TagChipEditor/__tests__/TagChip.test.tsx`
- **サブメニューのコピーボタン**:
  ```typescript
  // チップクリックでサブメニューオープン
  fireEvent.click(screen.getByText("masterpiece"));
  const copyBtn = screen.getByRole('button', { name: "タグをコピー" });
  expect(copyBtn).toBeInTheDocument();

  // コピーボタン押下
  fireEvent.click(copyBtn);
  expect(usePromptClipboardStore.getState().history[0]).toBe("masterpiece");
  // 視覚フィードバック
  expect(copyBtn.querySelector('svg')).toHaveClass('text-emerald-400');
  ```

#### 3. `src/pages/GeneratePage/components/__tests__/PromptSectionClipboardMenu.test.tsx`
- **セクションコピー**:
  ```typescript
  render(<PromptSectionClipboardMenu role="test_role" currentValue="outdoors, sky" onChangeValue={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: "プロンプトをコピー" }));
  expect(usePromptClipboardStore.getState().history[0]).toBe("outdoors, sky");
  ```
- **ペースト（上書きモード）**:
  ```typescript
  const onChange = vi.fn();
  usePromptClipboardStore.getState().setPasteMode('overwrite');
  usePromptClipboardStore.setState({ history: ["scenery, mountain"] });
  render(<PromptSectionClipboardMenu role="test_role" currentValue="existing_tag" onChangeValue={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: "ペーストメニューを開く" }));
  fireEvent.click(screen.getByText("scenery, mountain"));
  expect(onChange).toHaveBeenCalledWith("scenery, mountain");
  ```
- **ペースト（追加モード）**:
  ```typescript
  const onChange = vi.fn();
  usePromptClipboardStore.getState().setPasteMode('append');
  usePromptClipboardStore.setState({ history: ["scenery, mountain"] });
  render(<PromptSectionClipboardMenu role="test_role" currentValue="existing_tag" onChangeValue={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: "ペーストメニューを開く" }));
  fireEvent.click(screen.getByText("scenery, mountain"));
  expect(onChange).toHaveBeenCalledWith("existing_tag, scenery, mountain");
  ```
- **タグセット保存モーダルトリガー**:
  ```typescript
  const onOpenSave = vi.fn();
  render(<PromptSectionClipboardMenu role="test_role" currentValue="tags" onChangeValue={vi.fn()} onOpenSaveAsTagSet={onOpenSave} />);
  fireEvent.click(screen.getByRole('button', { name: "ペーストメニューを開く" }));
  fireEvent.click(screen.getByText("タグセットとして保存"));
  expect(onOpenSave).toHaveBeenCalledTimes(1);
  ```

#### 4. `src/pages/GeneratePage/components/__tests__/SaveAsTagSetModal.test.tsx`
- **タグプレビュー表示**:
  ```typescript
  render(<SaveAsTagSetModal isOpen={true} onClose={vi.fn()} role="Background" promptText="1girl, solo, uniform" />);
  expect(screen.getByText("1girl")).toBeInTheDocument();
  expect(screen.getByText("solo")).toBeInTheDocument();
  expect(screen.getByText("uniform")).toBeInTheDocument();
  ```
- **新規登録の API 呼び出し**:
  ```typescript
  fireEvent.change(screen.getByPlaceholderText("タグセット名を入力"), { target: { value: "New Uniform Set" } });
  fireEvent.click(screen.getByRole('button', { name: "新規タグセットとして保存" }));
  expect(tagSetsApi.create).toHaveBeenCalledWith({
    name: "New Uniform Set",
    tags: ["1girl", "solo", "uniform"],
    category_id: null,
    description: null,
  });
  ```
- **既存上書きの API 呼び出し**:
  ```typescript
  fireEvent.click(screen.getByRole('tab', { name: "既存タグセットを上書き" }));
  fireEvent.click(screen.getByText("Existing TagSet A"));
  fireEvent.click(screen.getByRole('button', { name: "上書き保存を実行" }));
  expect(tagSetsApi.update).toHaveBeenCalledWith(10, expect.objectContaining({
    tags: ["1girl", "solo", "uniform"],
  }));
  ```

---

## 2. Red Teaming (境界値・異常系検証)

- **ケース 1 (空入力欄への append ペースト)**:
  - 入力: `currentValue = ""` に対し `append` モードで `"solo, smile"` をペースト。
  - アサーション: `expect(onChange).toHaveBeenCalledWith("solo, smile")`（先頭にカンマ `, ` が入らないこと）。
- **ケース 2 (OS クリップボード例外発生時の耐障害性)**:
  - 条件: `vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('Permission denied'))`
  - アサーション:
    - `await expect(usePromptClipboardStore.getState().copyText("text")).resolves.toBe(true)`
    - `expect(usePromptClipboardStore.getState().history[0]).toBe("text")` (OS例外時もアプリ内ストアには格納される)。
- **ケース 3 (タグセット上書きキャンセル時の非破壊性)**:
  - 操作: 上書き確認ダイアログまたはモーダルのキャンセルボタンを押下。
  - アサーション: `expect(tagSetsApi.update).not.toHaveBeenCalled()`

---

## 3. 総合リグレッションテスト (Regression Verification)

- **実行コマンド**:
  ```powershell
  cd frontend
  npm run test -- run
  ```
- **判定基準**:
  - Exit Code が 0 であること。
  - 全テストスイートが PASS すること。
