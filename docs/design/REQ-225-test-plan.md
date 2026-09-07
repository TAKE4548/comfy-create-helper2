# REQ-225 検証計画書 (Test Plan)

## 1. 自動テスト計画 (Automated Tests)

### 1.1 コンポーネントテスト (`ProfileBulkEditModal.test.tsx`)
以下のシナリオを網羅するテストケースを追加・検証する：

1. **未登録ComfyUI LoRAの描画と選択**:
   - `comfyModels` として未登録LoRA（`is_registered: false`, `file_path: 'unregistered/style.safetensors'`）が存在する場合、`ProfileBulkEditModal` のパラメータタブ差分編集「新規追加LoRA」のドロップダウン内に当該LoRAが表示され、`Unregistered` バッジが付与されていること。
   - 当該未登録LoRAを選択した際、スロットの入力値として `unregistered/style.safetensors` が設定されること。
2. **登録済みLoRAの登録名称優先表示**:
   - `comfyModels` のうち登録済みLoRA（`is_registered: true`, `lora_id: 1`）であり、`loras` に該当するエントリ（`model_name: 'reg_lora'`, `description: '美少女アニメ風'`）が存在する場合、ドロップダウンに `description`（'美少女アニメ風'）が優先してラベル表示されること。
3. **未登録LoRAを含む一括適用のペイロード生成**:
   - 未登録LoRAを追加した状態で一括編集の「適用」を実行した際、`onApply` に渡される `loraStackOps` の `addSlots` に未登録LoRAのファイルパスおよび指定した強度設定が含まれること。
4. **ComfyUIがオフライン（comfyModelsが空）時のフォールバック**:
   - `comfyModels` の取得に失敗または空配列の場合でもエラーでクラッシュせず、DB登録済み `loras` の一覧を用いて正常に選択・適用が行えること。

### 1.2 実行コマンド (CLI)

```bash
npm test -- src/components/__tests__/ProfileBulkEditModal.test.tsx
```

---

## 2. レッドチーミング / 境界値シナリオ

1. **BaseModel フィルタリングの整合性**:
   - `activeBaseModelId` が指定されている場合、対象 BaseModel に合致しない登録済み LoRA が除外され、未登録 LoRA は全件表示されること。
2. **特殊文字やサブディレクトリを含むファイルパス**:
   - `subfolder/nested/custom_lora.safetensors` のような階層構造を持つパスであっても、値が破損せずそのまま `param_values` のスロットに保存されること。
3. **同一プリセットへの重複指定防止**:
   - 既存のプリセットに既に存在する LoRA と同一の未登録 LoRA を差分追加しようとした場合でも、重複して二重登録されないこと。

