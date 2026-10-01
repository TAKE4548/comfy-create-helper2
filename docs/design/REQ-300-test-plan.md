# REQ-300 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **型チェック**:
  ```bash
  cd frontend; npm run typecheck
  ```
  - 期待値: エラー 0 件。
- **単体・回帰テスト**:
  ```bash
  cd frontend; npx vitest run src/pages/GeneratePage/components/__tests__/DesktopLayout.tabs.test.tsx
  cd frontend; npx vitest run src/pages/__tests__/GeneratePage.test.tsx
  ```
  - 期待値: 全テスト PASS（100% 成功）。
- **フロントエンド全テストスイート (Gate 2)**:
  ```bash
  cd frontend; npm test
  ```
  - 期待値: 全テスト PASS。

## 2. 結合・E2E検証 (Integration & E2E Verification)
- **シナリオ 1: 全幅タブバーの画面配置と階層検証 (AC-1)**
  - 操作: デスクトップ表示（`DesktopLayout`）でワークフローを選択した状態のDOM構造を検証。
  - 期待値: `#desktop-preset-tabs-bar` が `ResizableSplitLayout` の上位に全幅要素として配置され、左右両ペイン（入力ペイン・プレビューペイン）の上端を横断していること。
- **シナリオ 2: 複数プリセット登録時の一覧性と横スクロール (AC-2)**
  - 操作: 3つ以上の名前付きプリセットが登録された状態を表示。
  - 期待値: 各タブが省略されずに広く表示され、コンテナが `overflow-x-auto` を持ちウィンドウ外へはみ出さずに横スクロール可能であること。
- **シナリオ 3: 操作ボタンの左ペイン集約とモーダル起動 (AC-3)**
  - 操作: `#left-pane-toolbar` 内に `#add-set-btn` と `#manage-presets-btn` が配置されていることを確認し、それぞれをクリック。
  - 期待値: Add Set クリックで新規作成モーダルが表示され、管理クリックでプリセット管理モーダルが開くこと。
- **シナリオ 4: タブ切り替え・Undo/Redo・チェックボックスの完全維持 (AC-4)**
  - 操作: 全幅タブバー上のタブクリックによる切り替え、チェックボックス操作、左ペイン側での Undo/Redo クリック。
  - 期待値: アクティブプリセットの切り替え・状態復元・チェック状態の連動が正しく動作すること。
- **シナリオ 5: モバイルレイアウトの現状維持と分離性 (AC-5)**
  - 操作: モバイル表示（`isMobile: true`）で生成画面を表示。
  - 期待値: `#desktop-preset-tabs-bar` は描画されず、モバイル専用のプリセットタブ・操作構成がそのまま動作すること。

## 3. Red Teaming (境界値・異常系)
- **Case 1: プリセットが空または未選択の境界状態**
  - 手順: `openPresetIds` が空配列、または `activeSetId` が一致しない状態で `DesktopLayout` をレンダリング。
  - 期待値: クラッシュせず、左ペインツールバーの `#add-set-btn` / `#manage-presets-btn` から正常に新規プリセット追加が行えること。
- **Case 2: 10個以上の長大名プリセット同時登録時のレイアウト崩れ防止**
  - 手順: 長い名称のプリセットを多数登録。
  - 期待値: 各タブが `max-w-[140px]` で適切に truncate され、親要素を突き破ったり縦スクロールを誘発したりせず、`overflow-x-auto` 内で安全にスクロールできること。
- **Case 3: 高速連続タブ削除・切替時の状態整合性**
  - 手順: アクティブタブを削除した際、ストア側のフォールバック選択が正常に行われ、左ペインの activeSet 表示および入力値が正しく同期すること。

## 4. ツール主導監査 (Tool-Driven Audit)
- **BA Audit**: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py ba-audit` による要求網羅性と論理的整合性の検証。
- **QA Audit**: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py qa-audit` による実装品質の客観的検証。
