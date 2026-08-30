# REQ-201: 生成プリセット一括編集機能の強化 テスト計画書

## 1. 自動テスト計画 (Automated Tests)

### 1.1 単体・統合テスト (Vitest)
以下のコマンドでフロントエンドのテストを実行し、リグレッションおよび新機能の動作を検証する。

```bash
# 1. useMultiSelect のテスト実行
npm test -- frontend/src/hooks/__tests__/useMultiSelect.test.ts

# 2. GeneratePage および関連 Hook のテスト実行
npm test -- frontend/src/pages/GeneratePage/hooks/__tests__/useGeneratePageState.test.tsx

# 3. 新規コンポーネント・ユニットテストの実行
npm test -- frontend/src/components/__tests__/ProfileBulkEditModal.test.tsx
```

### 1.2 テストケース項目
1. **範囲選択（Shift + クリック）**:
   - `PresetManagerPanel` において項目Aを選択後、項目CをShift+クリックした際に項目A, B, Cが全て選択状態になること。
2. **型安全パラメータ入力**:
   - `ProfileBulkEditModal` のパラメータタブで `select_sampler`, `select_scheduler`, `boolean`, `int/float`, カスタム型が正しく描画され、値が `paramPatch` に設定されること。
   - 「変更しない」を選択した項目はペイロードに含まれないこと。
3. **共通タグ抽出・削除**:
   - 複数プリセット間で共通するタグが正しく算出・列挙されること。
   - 共通タグを選択して `remove_tags` オペレーションを実行した際、対象プリセットのプロンプトから指定タグのみが除外され、固有タグは維持されること。
4. **タグチップUI**:
   - `ProfileBulkEditModal` のプロンプト入力欄でタグを入力・貼り付けした際にチップとして描画され、個別削除できること。

---

## 2. 手動検証シナリオ (Manual Verification)

1. **プリセット一覧の範囲選択**:
   - プリセットが5件以上ある状態で一括操作モードにし、1件目をクリック後、4件目をShift+クリックする。1〜4件目が一括選択されることを確認。
2. **パラメータ一括編集**:
   - 選択したプリセットで「一括編集」を開き、パラメータタブでサンプラーを `euler`、CFGを `7.5` に変更して適用。
   - 各プリセットのパラメータが正しく一括更新されることを確認。
3. **共通タグ抽出と削除**:
   - `1girl, solo, black hair, jacket, smile` と `1girl, solo, black hair, jacket, standing` を持つ2つのプリセットを選択。
   - 一括編集を開くと共通タグ（`1girl`, `solo`, `black hair`, `jacket`）が表示されることを確認。
   - `jacket` を削除対象に選択して適用。各プリセットから `jacket` のみが削除され、他のタグが残ることを確認。
4. **タグチップ入力**:
   - プロンプト追加欄に `hat, sunglasses` と入力してEnterまたはペースト。タグチップとして追加されることを確認。
