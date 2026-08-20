# REQ-151 テスト計画書 (Test Plan)

## 1. 自動テスト (Automated Unit Tests)

### テスト実行コマンド
```bash
npm test -- src/components/TagChipEditor/__tests__/useChipParser.test.ts src/components/TagChipEditor/__tests__/TagChip.test.tsx --run
```

### テスト対象と定量的判定基準 (Test Cases & Assertions)

#### 1. `useChipParser.test.ts` (タグ強度パーサー & フォーマッター)
- **`parseTagWeight`**:
  - `parseTagWeight('1girl')` -> `expect(result).toEqual({ baseText: '1girl', weight: null })`
  - `parseTagWeight('(1girl:1.2)')` -> `expect(result).toEqual({ baseText: '1girl', weight: 1.2 })`
  - `parseTagWeight('(masterpiece:0.8)')` -> `expect(result).toEqual({ baseText: 'masterpiece', weight: 0.8 })`
  - `parseTagWeight('(invalid)')` -> `expect(result).toEqual({ baseText: '(invalid)', weight: null })`
  - `parseTagWeight('  (solo:1.5)  ')` -> `expect(result).toEqual({ baseText: 'solo', weight: 1.5 })`
- **`formatTagWeight`**:
  - `formatTagWeight('1girl', null)` -> `expect(result).toBe('1girl')`
  - `formatTagWeight('1girl', 1.0)` -> `expect(result).toBe('1girl')`
  - `formatTagWeight('1girl', 1)` -> `expect(result).toBe('1girl')`
  - `formatTagWeight('1girl', 1.2)` -> `expect(result).toBe('(1girl:1.2)')`
  - `formatTagWeight('1girl', 1.200000000002)` -> `expect(result).toBe('(1girl:1.2)')`
  - `formatTagWeight('1girl', 0.85)` -> `expect(result).toBe('(1girl:0.85)')`
- **`adjustWeight`**:
  - `adjustWeight(null, 0.1)` -> `expect(result).toBe(1.1)` (nullは1.0とみなす)
  - `adjustWeight(null, -0.1)` -> `expect(result).toBe(0.9)`
  - `adjustWeight(1.5, 1.0)` -> `expect(result).toBe(2.5)`
  - `adjustWeight(0.5, -1.0)` -> `expect(result).toBe(0.0)` (0未満は0にクランプ)
  - `adjustWeight(0.3, -1.0)` -> `expect(result).toBe(0.0)`
  - `adjustWeight(1.1, 0.1)` -> `expect(result).toBe(1.2)` (浮動小数点誤差なく1.2を返す)

#### 2. `TagChip.test.tsx` (サブメニュー UI & 操作)
- **サブメニュー展開と表示**:
  - `fireEvent.click(screen.getByText('1girl'))`
  - `expect(screen.getByRole('button', { name: '有効' })).toBeInTheDocument()`
  - `expect(screen.getByRole('spinbutton')).toHaveValue(1.0)` (未設定時は1.0)
- **サブメニュー外クリック/Escでのクローズ**:
  - `fireEvent.mouseDown(document.body)` -> `expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()`
  - `fireEvent.keyDown(chipContainer, { key: 'Escape' })` -> `expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()`
- **有効/無効トグル**:
  - サブメニュー内「有効」ボタンクリック -> `expect(mockOnToggle).toHaveBeenCalledWith('1')`
  - チップにフォーカスしてSpaceキー押下 -> `expect(mockOnToggle).toHaveBeenCalledWith('1')`
- **ステップ増減操作**:
  - `+0.1` ボタンクリック -> `expect(mockOnEdit).toHaveBeenCalledWith('1', '(1girl:1.1)')`
  - `+1.0` ボタンクリック -> `expect(mockOnEdit).toHaveBeenCalledWith('1', '(1girl:2)')` (または `(1girl:2)`)
  - `-0.1` ボタンクリック -> `expect(mockOnEdit).toHaveBeenCalledWith('1', '(1girl:0.9)')`
  - `-1.0` ボタンクリック -> `expect(mockOnEdit).toHaveBeenCalledWith('1', '(1girl:0)')`
- **数値直接入力**:
  - `fireEvent.change(input, { target: { value: '1.3' } })`
  - `fireEvent.blur(input)`
  - `expect(mockOnEdit).toHaveBeenCalledWith('1', '(1girl:1.3)')`

---

## 2. 手動検証 (Manual Verification)

### 手動テストシナリオ
1. **タグチップクリックによるサブメニュー展開**:
   - 生成画面でタグチップ「1girl」をクリックし、サブメニューが表示されることを確認。
   - 初期強度入力欄に `1.0` が表示され、ステータスボタンが「有効」であることを確認。
2. **ステップ増減操作**:
   - `+0.1` ボタンをクリックし、チップテキストが `(1girl:1.1)` に更新されることを確認。
   - `+1.0` ボタンをクリックし、チップテキストが `(1girl:2.1)` に更新されることを確認。
   - `-1.0` / `-0.1` で減少し、`1.0` に戻すと `1girl`（括弧なし）に復帰することを確認。
3. **有効・無効トグル操作**:
   - サブメニュー内のトグルボタンをクリックし、チップがグレーアウト＋取り消し線表示に変化し、プロンプトから除外されることを確認。
4. **サブメニューのクローズ**:
   - メニュー外の何もないエリアをクリックするか `Escape` キーを押すとサブメニューが非表示になることを確認。
