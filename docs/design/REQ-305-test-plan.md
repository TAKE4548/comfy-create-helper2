# REQ-305 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **コマンド**: `cd frontend; npx vitest run src/pages/GeneratePage/components/__tests__/DesktopLayout.tabs.test.tsx`
- **フルスイート回帰**: `cd frontend; npm test`
- **型チェック**: `cd frontend; npm run typecheck`
- **期待値**: 全テストケース PASS (0 errors, 0 failures)。

## 2. 検証シナリオと受入基準マッピング

### AC-1: グローバルヘッダーの画面最上部全幅配置
- **対象**: `DesktopLayout.tabs.test.tsx`
- **検証手順**:
  - `DesktopLayout` をレンダリング。
  - ルートコンテナの最初の子要素としてグローバルヘッダー（`#workflow-select`, `#settings-toggle-btn` を内包）が存在することを確認。
  - グローバルヘッダーが `#desktop-preset-tabs-bar` および `ResizableSplitLayout` よりも前に配置されていることをDOM順序で検証。

### AC-2: プリセットタブバーの全幅・ヘッダー直下配置
- **対象**: `DesktopLayout.tabs.test.tsx`
- **検証手順**:
  - `#desktop-preset-tabs-bar` がグローバルヘッダーの直後、かつ `ResizableSplitLayout` の直前に配置されていることをDOM順序で検証。
  - タブコンテナが `overflow-x-auto` クラスを有し全幅でレンダリングされていることを検証。

### AC-3: 左ペインツールバーの左寄せ連続配置と順序
- **対象**: `DesktopLayout.tabs.test.tsx`
- **検証手順**:
  - `#left-pane-toolbar` を取得し、`justify-start` および `gap-2` クラスが付与されていることを確認（`justify-between` が存在しないことを検証）。
  - `#left-pane-toolbar` 内の要素順序が、左から「プリセット名バッジ」→「Undo/Redoボタングループ」→「#add-set-btn」→「#manage-presets-btn」の完全な並び順であることをDOMセレクタ順序で検証。

### AC-4: リサイズ時の近接維持と折り返し防止
- **対象**: `DesktopLayout.tabs.test.tsx`
- **検証手順**:
  - `#left-pane-toolbar` が `flex-nowrap` クラスを有し、各ボタンが `flex-shrink-0` を保持していることを検証。
  - プリセット名バッジに `truncate` および `max-w-[110px]` が適用されていることを確認。

### AC-5: 各ボタン・機能の完全維持と未選択時安全性
- **対象**: `DesktopLayout.tabs.test.tsx`
- **検証手順**:
  - Undo/Redoボタン、Add Setボタン、管理ボタンのクリックイベントが正常に発火し、各コールバックが呼ばれることを検証。
  - `activeSet` が null の場合でもクラッシュせず、`#add-set-btn` と `#manage-presets-btn` が正常に描画・クリック可能であることを検証。

### AC-6: モバイルレイアウト非干渉
- **対象**: `GeneratePage.test.tsx`
- **検証手順**:
  - モバイル画面切り替え時のレンダリングおよび既存テストがすべて成功することを確認。

## 3. Red Teaming (境界値・異常系検証)

1. **プリセット0件および未選択 (sets = [], activeSet = null)**:
   - プリセットが全く存在しない、または未選択の初期状態において、ルートのグローバルヘッダーとタブバーがクラッシュせず、左ペインツールバーの `#add-set-btn` および `#manage-presets-btn` が安全にクリック可能であることを検証。
2. **極長プリセット名による横幅圧迫**:
   - 非常に長いプリセット名（50文字以上）を設定した際、バッジが `max-w-[110px] truncate` により安全に省略され、後続の Undo/Redo、Add Set、管理ボタンが左ペイン外へ押し出されたり改行されたりしないことを検証。

## 4. ツール主導監査 (Tool-Driven Audit)
- **コード監査**: `local_model_adapter.py qa-audit` を実行し、客観的証明を得て VRAM を完全解放すること。