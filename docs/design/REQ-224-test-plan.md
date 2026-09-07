# REQ-224: プリセット一括編集におけるパラメータタブLoRA適用不具合解消およびLoRA適用機能の重複整理 テスト計画書

## 1. 自動テスト計画 (Automated Tests)

### 1.1 単体・統合テスト (Vitest)
以下のコマンドでフロントエンドのテストを実行し、リグレッションおよび新機能の動作を検証する。

```bash
# 1. ProfileBulkEditModal のテスト実行
npm test -- frontend/src/components/__tests__/ProfileBulkEditModal.test.tsx

# 2. usePresetState のテスト実行
npm test -- frontend/src/pages/GeneratePage/hooks/__tests__/usePresetState.test.ts

# 3. GeneratePage 全体テストの実行
npm test -- frontend/src/pages/__tests__/GeneratePage.test.tsx
```

### 1.2 テストケース項目と期待される検証式

#### TC-01: タブ構成の検証（2タブ化）
- `expect(screen.getByText('プロンプト')).toBeInTheDocument()` が PASS すること。
- `expect(screen.getByText('パラメータ')).toBeInTheDocument()` が PASS すること。
- `expect(screen.queryByText('LoRA')).not.toBeInTheDocument()` が PASS すること。
- `expect(screen.queryByText('アセット')).not.toBeInTheDocument()`（独立タブとしてのアセットが存在しないこと）が PASS すること。
- `expect(screen.queryByText('単一 LoRA 指定（従来機能）')).not.toBeInTheDocument()` が PASS すること。

#### TC-02: `computeCommonLoras` の純粋関数テスト
- プリセット1: `[loraA (0.8), loraB (0.5)]`、プリセット2: `[loraA (0.8), loraC (1.0)]` の場合、`computeCommonLoras` の戻り値が `[{ name: 'loraA', weight: '0.8', ... }]` となること。
- 共通LoRAが存在しない場合、空配列 `[]` が返ること。

#### TC-03: LoRA Stack 差分編集モードでの削除・追加ペイロード検証
- モード「差分編集」において、共通LoRA `loraA` の削除ボタンを押下し、新規追加スロットに `loraD`（強度 `1.0`）を設定して適用。
- `expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ loraStackOps: [expect.objectContaining({ role: 'lora_stack', mode: 'differential', commonOps: [{ name: 'loraA', action: 'remove', ... }], addSlots: [expect.objectContaining({ name: 'loraD', weight: '1.0' })] })] }))` が PASS すること。

#### TC-04: LoRA Stack 完全上書きモードでのペイロード検証
- モード「完全上書き」を選択し、`LoraStackEditor` でスロット1に `loraX`、スロット2に `loraY` を設定して適用。
- `expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ loraStackOps: [expect.objectContaining({ role: 'lora_stack', mode: 'overwrite', slots: [expect.objectContaining({ name: 'loraX' }), expect.objectContaining({ name: 'loraY' })] })] }))` が PASS すること。

#### TC-05: チェックボックス未選択（OFF）時の除外検証
- LoRA Stack のチェックボックスが OFF の場合、`payload.loraStackOps` が生成されないこと。

#### TC-06: `usePresetState.ts` における `loraStackOps` 適用ロジック
- 差分モード適用時、各プリセットの固有LoRA（例: `loraB`, `loraC`）が保持され、共通LoRA `loraA` が削除され、新規 `loraD` が追記されること。
- 上書きモード適用時、各プリセットの既存LoRAが全置換され、指定スロットのみになること。

---

## 2. 手動検証シナリオ (Manual Verification)

1. **MV-01: 2タブ構成の確認**:
   - プリセット一括編集モーダルを開き、タブが「プロンプト」「パラメータ」の2つのみであることを確認。
2. **MV-02: 共通LoRAの確認と削除（差分編集）**:
   - LoRA `detailer.safetensors` を共通して持つ2つのプリセットを選択し、「一括編集」を開く。
   - 「パラメータ」タブで「LoRA Stack」を有効化し、「差分編集」を選択。
   - 共通LoRAとして `detailer.safetensors` が表示されていることを確認し、ゴミ箱アイコンをクリック（削除指定）。
   - 適用後、両プリセットから `detailer.safetensors` が削除され、各プリセット固有の他のLoRAが残っていることを確認。
3. **MV-03: 新規LoRAの追記（差分編集）**:
   - 異なるLoRAを持つ2つのプリセットを選択し、「差分編集」で新規追加スロットに `style_cinematic.safetensors` を追加して適用。
   - 両プリセットの末尾に `style_cinematic.safetensors` が追記されていることを確認。
4. **MV-04: 完全上書き**:
   - 複数プリセットを選択し、「完全上書き」モードでLoRAを新規に1つだけ設定して適用。
   - 全プリセットの既存LoRAがすべて破棄され、新しく設定したLoRAのみになっていることを確認。
