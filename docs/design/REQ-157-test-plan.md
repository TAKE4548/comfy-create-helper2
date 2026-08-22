# REQ-157 テスト計画書 (Test Plan)

## 1. 自動テスト (Automated Tests)

### ユニットテスト実行
- **テストファイル**: `frontend/src/pages/GeneratePage/components/__tests__/ParamPanel.test.tsx`
- **コマンド**:
  ```bash
  npm --prefix frontend test -- src/pages/GeneratePage/components/__tests__/ParamPanel.test.tsx
  ```

### 検証項目
1. **初期レンダリングと展開状態**:
   - 初期状態（`localStorage` に該当キーがない場合）、3つのセクション（Parameters, Param Sync, Bypasses）がすべて展開（`expanded: true`）されていること。
   - `Parameters` 内の `paramMappings` 各入力欄、`Batch Size`、`Seed` がDOM上に存在すること。
   - `Param Sync` のグループ一覧（または空メッセージ）、`Bypasses` のプロファイル一覧（または空メッセージ）がDOM上に存在すること。
2. **Parameters セクションの折りたたみ/展開**:
   - `#parameters-section-toggle` をクリックすると、内部のコントロール（`paramMappings`, `Batch Size`, `Seed`）がアンマウント/非表示となること。
   - トグルボタン内のアイコン表示が展開（下向き）から折りたたみ（右向き）に切り替わること。
   - 再度クリックすると再びコントロール群が表示され、入力値の変更が反映されること。
3. **Param Sync セクションの折りたたみ/展開**:
   - `#paramsync-section-toggle` をクリックすると同期グループリストが非表示となり、右向きアイコンに切り替わること。
   - 折りたたみ状態においても `#param-sync-settings-btn` のクリックイベント（`onOpenParamSyncSettings` コールバック）が正常に発火すること。
4. **Bypasses セクションの折りたたみ/展開**:
   - `#bypass-section-toggle` をクリックするとバイパスプロファイルリストが非表示となり、右向きアイコンに切り替わること。
   - 折りたたみ状態においても `#bypass-settings-btn` のクリックイベント（`onOpenBypassSettings` コールバック）が正常に発火すること。
5. **LocalStorage による永続化**:
   - セクション折りたたみ操作時に `localStorage.getItem('prompt-surgeon-generate-sections-expanded')` に `{ "parameters": false, "paramSync": true, "bypass": true }` 等のJSONが即時保存されること。
   - 事前に `localStorage` に保存された状態で初期化された際、その開閉状態（例: `parameters: false`）が初期レンダリング時に正しく復元されること。

---

## 2. 手動検証 (Manual Verification)

| 検証ステップ | 操作手順 | 期待される判定基準 (Pass/Fail) |
|---|---|---|
| 1. デスクトップ表示での開閉 | デスクトップ画面で `Parameters` ヘッダーをクリック | `Batch Size` 等の入力欄が非表示になり、ヘッダー行のみの高さ（約30px程度）に縮小されること |
| 2. モーダル起動の独立性 | `Param Sync` および `Bypasses` を折りたたんだ状態で `Settings` ボタンをクリック | セクション自体は閉じたまま、設定モーダルが即座に開くこと |
| 3. モバイル画面でのスクロール削減 | モバイル表示（幅 400px）で `Parameters` を折りたたむ | スクロールすることなく画面上部から `Prompt` と `Bypasses` が同一画面内に収まること |
| 4. 状態永続化の確認 | `Parameters` を閉じた状態でブラウザをリロード（F5） | 再読み込み後も `Parameters` が折りたたまれた状態（右矢印アイコン）で復元されること |
