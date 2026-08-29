# インシデントレポート: プロンプト編集の未保存・巻き戻り（過去帰り）およびプリセット一括編集時の更新不整合

## 1. 事象概要 (Overview)
1. **生成画面におけるプロンプト編集の未保存・巻き戻り**:
   Generate 画面でプロンプト（テキストエリア等）を編集した際、変更内容が正しくバックエンド（DB）へ保存されず、ブラウザのリロードや別画面からの遷移時に入力内容が過去の状態に巻き戻る（過去帰りする）事象が発生する。
2. **プリセット管理モーダルからの一括編集時の未反映・巻き戻り**:
   プリセット管理モーダルから「一括編集（ProfileBulkEditModal）」を複数回連続して実行した際、一部の変更が未反映のままとなったり、以前の編集内容が上書きされて過去の状態へ巻き戻る事象が発生する。

---

## 2. 再現手順・観測された挙動 (Reproduction & Observed Symptoms)

### 事象 1: プロンプト編集の保存漏れ・巻き戻り
- **再現手順**:
  1. Generate 画面でワークフローと対象プリセットを選択する。
  2. プロンプト入力欄（TagChipEditor / テキストエリア）で文章を編集・追記する。
  3. 短い間隔で連続して文字入力を行う、または入力完了後すぐにブラウザをリロード（F5）する。
- **観測結果**:
  - バックエンドへの保存リクエスト（`PUT /api/workflow-presets/{id}`）が `409 Conflict` となりサイレントに失敗する。
  - フロントエンド側ではローカルの保存済み参照値（`lastSavedStateRef`）のみが更新されるため、画面上は保存されたように見えるが、リロード時に DB の古いデータが読み込まれて変更が巻き戻る。

### 事象 2: プリセット一括編集の複数回実行時の未反映・上書き
- **再現手順**:
  1. Generate 画面の「プリセット管理」モーダルを開き、一括操作モードで複数プリセットを選択する。
  2. 「一括編集」ボタンを押し、プロンプトの置換・追加やパラメータ変更を行って適用する。
  3. 直後に再度「一括編集」を開き、別の置換や追記を実行して適用する。
- **観測結果**:
  - 1回目の編集内容が2回目の編集によって打ち消されて古い値に戻る、または一部のプリセットに変更が反映されない。
  - アクティブなプリセットが含まれていた場合、一括編集後にオートセーブが旧タイムスタンプで誤発火し、競合（409）または意図しない上書きが発生する。

---

## 3. 影響範囲・該当コード (Affected Area & Source Locations)

| # | 対象ファイル | 該当行 / 関数 | 詳細 |
|---|---|---|---|
| 1 | `frontend/src/pages/GeneratePage/hooks/useGeneratePageState.ts` | L378-L404 (`updatePresetMutation`) | 更新成功時に `qc.invalidateQueries` のみを行い、React Query キャッシュを同期更新（`setQueryData`）していない。そのため非同期再取得完了までの間に次の保存が走ると古い `updated_at` が送信されて `409 Conflict` が発生する |
| 2 | `frontend/src/pages/GeneratePage/hooks/useGeneratePageState.ts` | L947-L1002 (Autosave `useEffect`) | デバウンス発火時に `activePreset.updated_at` をそのまま `base_updated_at` として送信。連続入力時や直前に別更新があった場合に古いタイムスタンプが送信され、`409 Conflict` が発生する。またエラー時にローカルの `lastSavedStateRef` と DB 実態の乖離が発生する |
| 3 | `frontend/src/pages/GeneratePage/hooks/useGeneratePageState.ts` | L459-L581 (`handleBulkEditApply`) | コンポーネント内の古い `presets` クロージャを参照して `newParamValues` を構築しているため、連続実行時に前回の更新結果が反映される前の古い値で上書きされる。またアクティブプリセット更新時に `lastSavedStateRef` やクエリキャッシュが適切に同期されない |
| 4 | `backend/app/routers/presets.py` | L78-L109 (`update_preset`) | `base_updated_at` による楽観的ロック（OCC）判定において、クライアント側のキャッシュ遅延による stale timestamp を検知して `409 Conflict` を返却するが、フロントエンド側で自動リトライ・再同期する仕組みが欠落している |

---

## 4. 根本原因の分析 (Root Cause Analysis)

### (1) オートセーブ時の OCC（楽観的排他制御）タイムスタンプ更新遅延とエラー処理の不整合
- `PBI-163` により、プリセット更新 API（`PUT /api/workflow-presets/{id}`）に `base_updated_at` による排他制御（OCC）が導入されました。
- しかし、フロントエンドの `updatePresetMutation` では、保存成功時に `qc.invalidateQueries` でバックグラウンド再取得をトリガーするのみで、API が返却した最新の `updated_at` を即時に React Query キャッシュやローカル状態へ反映（`setQueryData`）していません。
- ユーザーが連続してプロンプトを入力した場合、1回目のオートセーブ（t=1.0s）がバックエンドで成功して DB の `updated_at` が更新されても、フロントエンドの `presets` 配列はまだ古い `updated_at` を保持したままです。
- この状態で2回目のオートセーブ（t=2.0s）が発火すると、古い `base_updated_at` が送信され、バックエンドは `db_updated_at > base_updated_at` と判定して **`409 Conflict`** を返します。
- `updatePresetMutation.onError` はこの 409 エラーを単に握りつぶして再取得を呼ぶだけですが、直前の `lastSavedStateRef.current[activeSetId]` は既に更新されたものとしてセットされています。
- この結果、フロントエンドは「最新状態が保存された」と誤認し、DB には未保存のまま残るため、リロード時（初回同期 `isFirstSync`）に DB の過去データへ巻き戻ります。

### (2) プリセット一括編集におけるクロージャ内ステートの参照と非同期クエリ反映の競合
- `handleBulkEditApply` は、コンポーネントスコープの `presets` 変数から選択されたプリセットを取り出して編集処理（`newParamValues` の生成）を行っています。
- 一括編集完了時にも `qc.invalidateQueries` を呼ぶのみであるため、ユーザーが連続して一括編集モーダルを操作した場合、React の状態が更新される前に前回の古い `presets` をベースにプロンプト演算が行われます。
- その結果、2回目の一括編集が「1回目の編集前の古い文字列」を加工して DB を更新してしまい、1回目の編集結果が消失します。
- さらに、一括編集でアクティブなプリセットが変更された際、`lastSavedStateRef` が同期されないため、直後にオートセーブの `useEffect` が古い `base_updated_at` で余計な更新を試みて 409 を誘発します。

---

## 5. 原因分類 (Classification)

<diagnostic_check>
- Root_Cause_Isolated: Yes
- Classification: Type_A: Implementation Bug
- Scope_Restriction: Read-only phase. Code modification or fix proposals are strictly PROHIBITED during this turn.
- Route: Direct to /dev-design
</diagnostic_check>

* **分類**: **Type A (Implementation Bug - 実装バグ)**
  * PBI-163 で導入された OCC（`base_updated_at`）機構と、フロントエンド側の非同期クエリキャッシュ更新（`setQueryData` / `invalidateQueries`）・デバウンスオートセーブ・一括編集ステート管理の同期不整合に起因する実装上のバグです。

---

## 6. バックログ登録とルーティング (Backlog Registration & Routing)

- **登録推奨 PBI**: `docs/backlog/pbi/active/REQ-198.md`
- **タイトル**: `プリセット・プロンプト編集のオートセーブおよび一括編集における状態同期・OCC競合解消（過去帰り・未反映防止）`
- **次のワークフロー**: `/dev-design REQ-198`
