# REQ-220 実行可能テスト計画

## 1. 自動テスト (CLI Verification)
- **コマンド**:
  ```bash
  npm test -- TagChipEditor.test.tsx
  npm test -- workflowParamInjector.test.ts
  ```
- **期待値**:
  - `TagChipEditor.test.tsx`:
    - `chips: TagChip[]` プロップスによる無効タグ（`enabled: false`）の初期化・レンダリングが PASS すること。
    - タグを無効化した際、`onChange` に更新された `TagChip[]` 配列（`enabled: false` を含む）が直接渡されること。
    - 外部からの `chips` プロップス変化に対して内部状態が再パースを介さず同期されること。
  - `workflowParamInjector.test.ts` / ストア単体テスト:
    - `getEffectiveParamValues(paramValues, promptChips)` において、`promptChips` に無効化タグが存在する場合でも、導出された平文には有効タグのみが含まれ、ComfyUIワークフローJSONに有効タグのみが注入されること（AC-5保証）。
  - 全テストケースが 100% PASS すること。脳内推論での代用は厳禁。

## 2. 結合・E2E検証 (Integration & E2E Verification)
- **シナリオ**:
  1. **AC-1 (画面切替保持)**:
     - 生成画面を開き、プロンプトに `masterpiece, 1girl, smile` がある状態で `smile` をクリックして無効化（グレーアウト）。
     - 左サイドメニューから「History」または「Tags」ページへ移動。
     - 再度「Generate」ページに戻る。
     - **期待値**: `smile` がグレーアウト（取り消し線・無効化）のままチップ列内に復元されていること。
  2. **AC-2 (アコーディオン開閉保持)**:
     - プロンプトセクション上部のアコーディオン閉じるボタンを押下（非表示化）。
     - 再度開くボタンを押下して展開。
     - **期待値**: `smile` が無効状態のまま保持されていること。
  3. **AC-3 (モバイルタブ切替保持)**:
     - ビューポートをモバイル幅（<768px）にする。
     - 「Positive」タブでタグを無効化。
     - 「Negative」タブへ切り替えた後、再度「Positive」タブへ戻る。
     - **期待値**: 無効化したタグが消えずに保持されていること。
  4. **AC-4 (Multi-Set切替保持)**:
     - 「Set 1」でタグ `smile` を無効化。
     - 「Set 2」を選択し、別のタグを無効化。
     - 再度「Set 1」を選択。
     - **期待値**: 「Set 1」の `smile` が無効状態のまま復元されていること。
  5. **AC-5 (ComfyUI投入時の有効チップ分離)**:
     - `smile` を無効化した状態で「Generate」を実行。
     - 開発者ツールの Network タブまたは ComfyUI WebSocket/API 送信ペイロードの `prompt` ノード inputs を確認。
     - **期待値**: 送信プロンプト文字列に `smile` が含まれておらず、有効なタグのみがカンマ区切りで送信されていること。

## 3. Red Teaming (境界値・異常系)
- **シナリオ**:
  1. **テキストモード切替時の境界挙動**:
     - 無効タグが存在する状態で「テキスト入力モードに切替」を押下。
     - textarea には `chipsToString` による有効タグのみが展開されることを確認。
     - 再度「チップモードに切替」を押下した際、エラーにならず有効タグのみが正常に再チップ化されること。
  2. **非制御モード（`chips` プロップス未指定時）の後方互換性**:
     - `chips` プロップスを渡さない単体コンポーネント（LoRAモーダル等）において、従来の `value` / `onChange` による動作が破壊されずに正常に機能すること。

## 4. ツール主導監査 (Tool-Driven Audit)
- **コード監査**: `python ${GLOBAL_SCRIPTS}\local_model_adapter.py qa-audit docs/design/REQ-220-test-plan.md` を実行し、客観的証明を得ること。
