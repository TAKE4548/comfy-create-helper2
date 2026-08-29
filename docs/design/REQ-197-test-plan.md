# REQ-197: サムネイルのアスペクト比設定およびパン・ズームクロップ調整機能 テスト計画書

## 1. 自動テスト (Automated Unit & Component Tests)

### 1.1 アスペクト比ユーティリティ & Hook テスト (`frontend/src/utils/__tests__/aspectRatio.test.ts`, `frontend/src/hooks/__tests__/useThumbnailAspectRatio.test.tsx`)
- [ ] **TC-1**: `parseAspectRatio` がプリセット値（`1:1`, `3:4`, `9:16` 等）を正しい `numericRatio` と `ratioStr` にパースすること。
- [ ] **TC-2**: `parseAspectRatio` がカスタム値（`"5:7"`, `"5/7"`, `"16:10"`, `"0.75"`）を適切にパースし、無効な文字列（`"abc"`, `"-1:2"`, `"0:0"`）に対してデフォルト（`3:4`）を返すこと。
- [ ] **TC-3**: `useThumbnailAspectRatio` が `localStorage` から初期値を読み込み、`setPreset` / `setCustomRatio` で値が更新され、イベント発火を通じてリアクティブに状態が同期されること。

### 1.2 設定画面 UI テスト (`frontend/src/pages/SettingsPage/components/__tests__/ThumbnailSettingsSection.test.tsx`)
- [ ] **TC-4**: プリセット選択ボタン（1:1, 3:4, 4:3, 9:16 等）をクリックした際、アクティブ状態が切り替わり設定が保存されること。
- [ ] **TC-5**: 「カスタム入力」を選択した際にカスタム入力欄が表示され、比率を入力して保存できること。
- [ ] **TC-6**: プレビューカードが選択した比率に従って動的にサイズ・アスペクト比を変更して描画されること。

### 1.3 クロップエディタ テスト (`frontend/src/components/__tests__/ImageCropper.test.tsx`)
- [ ] **TC-7**: `ImageCropper` に渡された `aspectRatio` prop が正しく Cropper コンポーネントに反映されること。
- [ ] **TC-8**: 切り抜き確定時に `onCropComplete` コールバックが呼ばれ、Blob が渡されること。キャンセル時に `onCancel` が呼ばれること。

---

## 2. 手動・E2E検証 (Manual & Visual Verification)

- [ ] **MV-1**: 設定画面（Settings）でサムネイル比率を「3:4」から「1:1」や「9:16」、「カスタム（5:7）」に変更した際、LoRA一覧、タグセット一覧、履歴（スナップショット）一覧のカードサムネイル枠が即座に指定のアスペクト比に切り替わること。
- [ ] **MV-2**: LoRA / タグセットの編集モーダルでカバー画像をアップロード、または「クロップ調整」ボタンを押した際、`ImageCropper` が開き、ドラッグ（パン）とスライダー/ホイール（ズーム）で切り抜き枠を調整し、保存後に指定の構図でサムネイルが表示されること。
- [ ] **MV-3**: モバイル画面幅において、カードのサムネイル比率およびクロップ調整モーダルが崩れず快適に操作できること。
