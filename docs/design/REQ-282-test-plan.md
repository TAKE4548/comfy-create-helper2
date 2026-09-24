# REQ-282 実行可能テスト計画

<!-- [LLM Audit Trace: Action=qa-audit | Model=qwen3.5-9b-claude-4.6-highiq-thinking-heretic-uncensored | Domain=reasoning | Params=9.0B | Quant=Q6_K] -->

## 1. 自動テスト (CLI Verification)

### Gate 1: 静的型検査
- **コマンド**: `cd frontend && npm run typecheck`（tsc -b --noEmit）
- **合格基準**: 終了コード = 0、型エラー出力 = 0件。

### Gate 2: 全量ユニット・コンポーネントテスト
- **コマンド**: `cd frontend && npx vitest run`
- **合格基準**: 全 77 テストファイル、750 件以上のテスト全件 PASS（Failed: 0 件）。
- **主要対象テストスイート**:
  - `src/pages/GeneratePage/components/__tests__/MobileLayout.test.tsx`
  - `src/pages/__tests__/GeneratePage.test.tsx`
  - `src/pages/GeneratePage/hooks/__tests__/useGenerateDisplayState.test.tsx`

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### シナリオ 1: 共通オーバーレイ（GenerateModalsOverlay）の動作検証
- **対象**: Desktop / Mobile 両画面
- **検証手順と定量的合格条件**:
  1. バイパス設定ボタン押下時: DOM上に `BypassSettingsModal` がマウントされ、閉じるボタン押下で DOM からアンマウントされること。
  2. パラメータ同期設定ボタン押下時: DOM上に `ParamSyncModal` がマウントされ、閉じるボタン押下で DOM からアンマウントされること。
  3. 各プロンプトセクションの「翻訳」ボタン押下時: `promptTranslation.isOpen === true` となり `PromptTranslationModal` が表示されること。
  4. プロンプトセクションから「TagSetとして保存」選択時: `saveAsTagSetRole` に対象ロール名がセットされ、`SaveAsTagSetModal` が表示されること。
  5. 新規セット追加（Add Set）押下時: `showCopyModal === true` となり新規プロファイル作成ダイアログが表示され、作成実行時に `handleCreatePreset` が呼び出されモーダルが閉じること。

### シナリオ 2: セットタブバー（SetTabsBar）の動作検証
- **対象**: Desktop画面
- **検証手順と定量的合格条件**:
  1. タブクリック時: `handleSelectPresetTab(id)` が発火し、選択タブのクラスに `text-accent-green` が付与されること。
  2. バッチチェックボックストグル時: `toggleSetChecked(id)` が発火し、`checked` 属性が反転すること。
  3. プロンプト編集後: `undo` / `redo` ボタンの `disabled` 属性が解除され、クリック時にそれぞれのハンドラが実行されること。
  4. 「📑 管理」ボタン押下時: `isPresetManagerOpen === true` となること。

### シナリオ 3: ギャラリー部（GenerationGallerySection）の動作検証
- **対象**: Desktop / Mobile 両画面
- **検証手順と定量的合格条件**:
  1. タブ切り替え: `thumbnailTab` が `'history'` から `'snapshots'` に切り替わり、表示リスト要素が切り替わること。
  2. ソート順切り替え: `sortOrder` が `'desc'` から `'asc'` に変更され、画像配列の順序が逆転すること。
  3. セッションフィルタ: `filterOwnSession` チェックボックスのトグルで他セッション除外状態が即座に反映されること。
  4. 複数選択: `isMultiSelectMode === true` 時にチェックボックス付きサムネイルが表示され、選択枚数バッジ（`selectedIds.size`）が一致すること。

### シナリオ 4: Red Teaming (境界値・異常系・回帰防止)
- **テストケース 1 (REQ-264 プレビュー追従ロックの維持)**:
  - 自動追従トグルボタン（`#preview-autofollow-toggle-desktop` または `#preview-autofollow-toggle-mobile`）をクリックし、`previewAutoFollow` を `false`（一時停止アイコン Pause 表示）にする。
  - 新規画像生成完了イベント（WebSocket / store 更新）が発生した際、`selectedImg` の値が生成前と**完全に一致（不変）**であることをアサートする。
- **テストケース 2 (自セッション0件・他セッション存在時のフォールバック)**:
  - 自セッション画像が0件で `otherSessionCount > 0` かつ `filterOwnSession === true` の場合、「他セッションの履歴（{n}件）があります」メッセージと「自セッションのみ表示を解除」ボタンが表示され、クリックで `filterOwnSession === false` となり画像が表示されること。

---

## 3. ツール主導監査 (Tool-Driven Audit)
- **コード監査**: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py qa-audit docs/design/REQ-282-test-plan.md` を実行し、合格判定を得ること。
