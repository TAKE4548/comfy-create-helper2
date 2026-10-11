# REQ-340: Prompt Surgeon: Settingsマッピングマスタ編集のUX強化 テスト計画書

## 1. 概要 (Overview)
本テスト計画書は、REQ-340において導入されるマッピングマスタ編集UX強化機能（タイトル検索パターンコピペ・インライン編集、パラメータ表記ゆれフォールバック、コンテキスト連動リアルタイムプレビュー、逆引きノード登録）の品質保証を定義する。
Baseline 3-Gate Verification（Gate 1: 静的型検査, Gate 2: 自動ユニットテストスイート, Gate 3: シナリオ・Red Team検証）に完全適合させる。

---

## 2. Gate 1: 静的型検査 (Static Typecheck)
- **Frontend**:
  - コマンド: `cd frontend; npm run typecheck`
  - 対象: `MappingMaster`, `MappingMasterV2Create`, `MappingMasterV2Update`, `PatternTagInput`, `FallbackParamsInput`, `WorkflowMappingPreview`, `WorkflowNodePicker` の型エラーが0件であること。
- **Backend**:
  - コマンド: `mypy backend`
  - 対象: `MappingMaster` モデル、マイグレーションスクリプト、Pydanticスキーマ、`workflow_scanner.py` の型エラーが0件であること。

---

## 3. Gate 2: フルユニットテストスイート (Unit Test Discovery)
- **Frontend**:
  - コマンド: `cd frontend; npm test` (または `npx vitest run`)
  - テストファイル:
    - `frontend/src/components/__tests__/PatternTagInput.test.tsx`:
      - パターンチップの追加・カンマ区切りペースト・引用符トリム・重複排除
      - ダブルクリック/編集アイコンによるインライン編集・Enter確定・Escape破棄
      - クリップボードへの一括コピー
    - `frontend/src/components/__tests__/FallbackParamsInput.test.tsx`:
      - フォールバックパラメータ名のチップ追加・削除・順序変更
    - `frontend/src/components/__tests__/WorkflowMappingPreview.test.tsx`:
      - ワークフロー選択時・JSON貼付時のマッチング評価と結果表示
    - `frontend/src/components/__tests__/WorkflowNodePicker.test.tsx`:
      - ノード一覧の表示・検索フィルタ・ノード/引数選択時のフォーム反映
    - `frontend/src/pages/SettingsPage/components/__tests__/MappingMasterSection.req340.test.tsx`:
      - モーダル統合、保存ペイロード検証
- **Backend**:
  - コマンド: `backend\.venv\Scripts\python -m pytest`
  - テストファイル:
    - `backend/tests/test_req340_backend_fallback.py`:
      - `fallback_param_names` カラムのCRUDとDBマイグレーションの冪等性
      - `workflow_scanner.py` におけるプライマリ優先および `fallback_param_names` の順次解決検証

---

## 4. Gate 3: シナリオ統合 & Red Team境界値検証 (Scenario & Boundary Test)

### 4.1 正常系統合シナリオ (Happy Path Scenarios)
- **SC-1 (パターンコピペ＆インライン編集)**:
  - ユーザーが既存ロールのタイトルパターン `positive, prompt, CLIPTextEncode` をコピーし、別ロールのモーダルでペースト。3つのチップとして一括展開される。
  - `prompt` チップをダブルクリックして `main_prompt` に修正して確定。モーダル保存時にDBへ正常に保存される。
- **SC-2 (パラメータ表記ゆれフォールバック)**:
  - プライマリ `param_name` を `seed` とし、フォールバックに `noise_seed, random_seed` を登録。
  - `seed` を持たず `noise_seed` を持つノードに対してマッピング評価を実行した際、フォールバックとして `noise_seed` に正常バインドされる。
- **SC-3 (コンテキスト連動プレビュー & 逆引き登録)**:
  - 既存ワークフローを選択すると、ワークフロー内のノードに対して合致したノードID・タイトルが表示される。
  - 「ワークフローからノード選択」を開き、KSamplerノードの `steps` を選択すると、クラス名・タイトルパターン・パラメータ名がフォームに安全に自動転記される。

### 4.2 Red Team 境界・異常系検証 (Boundary & Anomaly Red Team Cases)
- **RT-1 (クリップボード制限・巨大文字列)**:
  - クリップボード権限が拒否されたブラウザ環境でコピー・ペーストを試みた際、UIがクラッシュせず手動入力フォールバック（またはエラー通知）が提示されること。
  - 100件以上のカンマ区切りパターンや超長文文字列（1000文字超）をペーストした際、適切にトリムされ、メモリ枯渇や無限ループが発生しないこと。
- **RT-2 (壊れたワークフローJSON・10MB超過)**:
  - 不正なJSON構文、または辞書/リスト構造ではない不正なJSONファイルをプレビューに渡した際、UIがクラッシュせず「無効なワークフローJSONです」と表示されること。
  - 10MBを超える巨大ファイルを投入した際、即座に「ファイルサイズ上限（10MB）を超えています」と拒否されること。
- **RT-3 (既存入力値の非破壊性ガード)**:
  - すでに手動で `param_name` や `expected_class_types` が入力されている状態で、逆引きノード選択を実行した際、無警告で上書きされず、確認ダイアログで「キャンセル」を選択した場合は元の入力値が完全に保持されること。
- **RT-4 (フォールバック順序の一貫性)**:
  - 1つのノードが複数のフォールバックパラメータ（例: `noise_seed` と `random_seed` の両方）を持っている場合、登録された配列のインデックス順（先頭の `noise_seed`）が厳格に優先バインドされること。
