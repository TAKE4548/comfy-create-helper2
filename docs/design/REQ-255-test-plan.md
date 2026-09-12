# REQ-255 実行可能テスト計画

## 1. 自動テスト (CLI Verification)

### (1) フロントエンド単体テスト: TagChipEditor
- **コマンド**: `npm --prefix frontend test -- src/components/TagChipEditor/__tests__/TagChipEditor.test.tsx --run`
- **検証項目**:
  - `[AC-1]` テキスト入力モードで末尾カンマ `,` やスペースを入力した際、外部 `chipsProp` の更新があってもテキスト入力が消去・巻き戻されないこと。
  - `[AC-1]` テキスト入力モードで連続入力した際、`onChange` に生の入力テキストが即座に渡されること。
  - `[AC-2]` テキストモード ⇔ チップモードの切り替え時に、入力内容が正確に保持・変換されること。
- **期待値**: 全テスト PASS。

### (2) フロントエンド単体テスト: Preset State & 即時OCC (usePresetState)
- **コマンド**: `npm --prefix frontend test -- src/pages/GeneratePage/hooks/__tests__/usePresetState.test.ts --run`
- **検証項目**:
  - `[AC-3]` `handleSelectPresetTab`: サーバー変更がない場合、既に開いているタブなら `setActiveSetId` が実行されメモリ内のセット編集値が保持されること。
  - `[AC-3]` `handleSelectPresetTab`: サーバー `updated_at` が進んでおり自端末が未編集（Clean）の場合、サーバーの最新版が自動ロードされること。
  - `[AC-3]` `handleSelectPresetTab`: サーバー `updated_at` が進んでおり自端末でも編集中（Dirty）の場合、即座に `conflictData` が設定され競合モーダルが表示されること。
- **期待値**: 全テスト PASS。

### (3) Layout 単体テスト: MobileLayout & DesktopLayout
- **コマンド**: `npm --prefix frontend test -- src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx --run`
- **検証項目**:
  - `[AC-3]` Multi-Set タブクリック時に `handleSelectPresetTab` が正しく呼び出されること。
- **期待値**: 全テスト PASS。

### (4) 生成アクション単体テスト: useGenerateAction
- **コマンド**: `npm --prefix frontend test -- src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts --run`
- **検証項目**:
  - `[AC-4]` プリセットを編集した状態で生成ボタンを押下した際、編集されたパラメータが `queuePrompt` および ComfyUI 投入ペイロードに反映されること。
- **期待値**: 全テスト PASS。

---

## 2. 結合・E2E手動検証シナリオ

1. **テキストモード編集検証**:
   - 生成画面を開き、プリセットを選択。
   - 「テキスト入力モード切替」をクリック。
   - プロンプトの末尾に `, high quality, masterpiece` とタイピングし、末尾文字が消えたりカーソルが跳んだりしないことを確認。
2. **タブ切り替え時のローカル保持検証**:
   - プリセットAを選択し、プロンプトを編集（未保存状態）。
   - プリセットBのタブをクリックして切り替え。
   - 再度プリセットAのタブをクリックして戻る。
   - プリセットAで編集したプロンプトが古いDB値で消去されず、そのまま残っていることを確認。
3. **別端末変更時の競合検知（即時OCC）検証**:
   - プリセットAを編集（Dirty状態）。
   - 別ウィンドウ等でプリセットAを更新（サーバーの `updated_at` を進行）。
   - タブバーでプリセットAをクリックした際、即座に `PresetConflictModal` が開き、差分が提示されることを確認。
4. **生成投入検証**:
   - プリセットのプロンプトを編集した状態で「Generate Batch」をクリック。
   - ComfyUI の実行ログおよび画面の生成履歴で、編集後のプロンプトでジョブが実行されたことを確認。

---

## 3. Red Teaming (境界値・異常系シナリオ)

1. **連続高速タブ切り替え**:
   - 複数のプリセットタブを高速にクリックして行き来した際、`activeSetId` の同期ズレや白画面クラッシュが発生しないこと。
2. **テキストモードのまま未切替で生成**:
   - テキストモードでプロンプトを入力後、「チップモード切替」を押さずに直接「Generate Batch」をクリック。
   - テキストモードで入力された最新の文字列が生成プロンプトとして正しく ComfyUI に送信されること。
