# REQ-084: 生成ページにおける不要機能廃止と履歴複数選択操作の改善 設計仕様書

## 1. 目的と概要
生成ページのワークフロー選択部に存在する、古い機能の名残である「過去スナップショットからの反映用ドロップダウン」を廃止し、生成履歴における複数選択（Ctrl+click）および範囲選択（Shift+click）の操作性を改善します。また、複数選択状態から一括でスナップショット保存を実行できるようにし、プレビュー表示が最後に選択・操作された画像に追従するようにします。

## 2. 変更内容

### 2.1 スナップショット選択ドロップダウンの廃止
- **ファイル**: 
  - `frontend/src/pages/GeneratePage/components/DesktopLayout.tsx`
  - `frontend/src/pages/GeneratePage/components/MobileLayout.tsx`
  - `frontend/src/pages/GeneratePage/hooks/useGeneratePageState.ts`
- **内容**: 
  - Desktop / Mobile レイアウトから `<select id="snapshot-history-select">` および `<select id="snapshot-history-select-mobile">` のマークアップを削除。
  - `useGeneratePageState.ts` から `selectedSnapshotId` / `setSelectedSnapshotId` の状態管理を削除。

### 2.2 複数選択および範囲選択操作の改善
- **ファイル**: 
  - `frontend/src/hooks/useMultiSelect.ts`
  - `frontend/src/pages/GeneratePage/components/DesktopLayout.tsx`
  - `frontend/src/pages/GeneratePage/components/MobileLayout.tsx`
- **内容**:
  - `useMultiSelect.ts` の `handleItemClick` で、マルチ選択モードではない状態での `shiftKey` クリックでも、直前のクリック画像（`lastSelectedIdRef.current`）または現在アクティブな画像を起点とした範囲選択でマルチ選択モードに入るように修正。
  - 通常のクリック（修飾キーなし）でも `handleItemClick` を通すことで、`lastSelectedIdRef.current` が常に更新され、直後の Shift クリックの起点となるようにする。
  - 各レイアウトファイルのサムネイルクリックイベントハンドラを、修飾キーの有無に関わらず `handleItemClick` を常に呼び出す形に更新。

### 2.3 プレビューの追従性向上
- **ファイル**:
  - `frontend/src/pages/GeneratePage/hooks/useGeneratePageState.ts`
- **内容**:
  - 複数選択状態でもメインプレビューエリアには最後に選択（アクティブに）した画像が継続して表示されるようにするため、`selectedIds`（Set型）の挿入順序に基づき、一番最後に追加されたインデックスの画像を `selectedImg` に設定する `useEffect` を追加する。

### 2.4 保存ボタンの制御解除
- **ファイル**:
  - `frontend/src/pages/GeneratePage/components/DesktopLayout.tsx`
  - `frontend/src/pages/GeneratePage/components/MobileLayout.tsx`
- **内容**:
  - アクションバーの「Save Snapshot」ボタンを複数選択モード時でも無効化せず、選択アイテム数が1以上であればクリック可能にする (`disabled={isMultiSelectMode ? selectedIds.size === 0 : !selectedImg}`)。

## 3. 影響範囲と移行計画
- データベースマイグレーション: 不要
- 既存APIへの影響: なし (保存処理はすでに複数パスの保存に対応しているため、フロントエンドの制御のみ)

## 4. トレードオフとリスク (Trade-off Disclosure)
- **リスク**: 履歴画像がない状態で Shift + クリックを行った場合、範囲の起点となる `lastSelectedIdRef.current` が null のため正しく動作しない可能性があります。
- **対策**: `lastSelectedIdRef.current` が null の場合、デフォルトとして現在のアクティブ画像インデックス (`sortedDisplayImages.indexOf(selectedImg)`) を起点にするフォールバック処理を実装します。
