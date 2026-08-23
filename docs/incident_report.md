# インシデントレポート: デバイス間・セッション間におけるプリセットプロンプト混同・上書き不具合の調査報告書

## 1. 障害概要 (Overview)
異なるデバイス間（PCとスマホなど）の切り替えやページリロード時に、直近に編集したプリセットのプロンプトが別のプリセットのプロンプトに勝手に置き換わってしまったり、最新の編集内容が正しく復元されない事象が報告された。

本来の期待仕様：
- セッションやデバイスを跨いでも、各プリセットで直近に編集したプロンプトがバックエンドDBに正しく永続化されていること。
- リロード後や他デバイスで開いた際、あるいはタブをアクティブにした際に、各プリセット固有の最新プロンプトが確実に表示・復元されること。

本調査では、フロントエンド（Zustand Store / `useWorkflowParams` / `useGeneratePageState` / LocalStorage）およびバックエンド（`workflow_presets` API / DB）の状態同期ロジックを解析し、根本原因を特定した。

---

## 2. 再現手順・観測された挙動 (Reproduction & Observed Symptoms)

### 事象 1: デバイス切り替え時のプロンプト混同・上書き
- **再現手順**:
  1. 端末A（例: PC）で「Workflow 1」を選択し、「Set 1」のプロンプトを `A_prompt` に編集する（DBにオートセーブされる）。
  2. 端末Aでタブを「Set 2」に切り替え、プロンプト `B_prompt` を編集する。
  3. 端末B（例: スマホ）で同一の「Workflow 1」を開く（端末BのLocalStorageには以前のSet 1がアクティブとして記録されている）。
- **観測結果**:
  - 端末Bで「Set 1」が開かれた際、本来の `A_prompt` ではなく、端末Aで直近に保存されたLocalStorage値や端末Bローカルの古い値が一時的にロードされる。
  - さらにその直後（約1秒後）、オートセーブ機能が誤作動し、端末Bでアクティブな「Set 1」のDBレコードに対して混同されたプロンプトが上書き保存されてしまう。
  - 結果として、バックエンドDB上の「Set 1」のプロンプトが「Set 2」の内容で恒久的に破壊される。

### 事象 2: ページリロード時の他プリセットプロンプトの読み込み
- **再現手順**:
  1. 同一ブラウザで「Set 1」と「Set 2」を交互に編集する。
  2. 「Set 2」を編集した直後に「Set 1」にタブを切り替え、すぐにブラウザをリロードする。
- **観測結果**:
  - リロード直後に「Set 1」が表示されるが、プロンプト欄に「Set 2」の内容が一瞬または継続して表示され、DBにもその内容がオートセーブされる。

---

## 3. 影響範囲・該当コード (Affected Area & Source Locations)

| # | 対象ファイル | 該当行 / 関数 | 問題の詳細 |
|---|---|---|---|
| 1 | `frontend/src/pages/GeneratePage/hooks/useWorkflowParams.ts` | L109-131 (`useEffect`)<br>L270, L278 | ワークフロー単位の単一キー `LS_KEYS.PARAMS_PREFIX + workflow.id` から無条件にプロンプトを復元し、プリセットごとの独立性を無視して `setParamValues` を呼んでいる。 |
| 2 | `frontend/src/store/useGenerationStore.ts` | L257-260 (初期化)<br>L840-842 (`setSelectedWorkflowId`)<br>L885-892 (`setParamValues`)<br>L1297 (`initSets`) | プリセット単位ではなくワークフロー単位の `prompt-surgeon-params-wf-${workflowId}` および `prompt-surgeon-applied-assets_${workflowId}` を読み書きしている。 |
| 3 | `frontend/src/pages/GeneratePage/hooks/useGeneratePageState.ts` | L510-522 (`updatePresetMutation`)<br>L1050-1085 (`useEffect` オートセーブ) | `paramValues` の変更時に1秒デバウンスでDB更新するが、`updatePresetMutation` が現在アクティブなプリセットIDに対してスコープ内の `paramValues` をそのままPUTするため、初期化時の汚染データや切り替え直前の値が誤ったプリセットに保存される。 |
| 4 | `frontend/src/pages/GeneratePage/hooks/useGeneratePageState.ts` | L785-808 (`handleLoadPreset`)<br>L952-1047 (プリセット同期エフェクト) | プリセット切り替え時やバックエンドからの取得完了時、LocalStorageとバックエンドDB（SSoT）の優先度および同期順序の競合が発生している。 |

---

## 4. 根本原因の分析 (Root Cause Analysis)

### 根本原因 1: プリセット単位ではなく「ワークフロー単位」の単一LocalStorageキーによるプロンプト汚染 (SSoT破壊)
- `useWorkflowParams.ts` および `useGenerationStore.ts` では、パラメータ（プロンプト含む）を `prompt-surgeon-params-wf-${workflowId}` というキーでLocalStorageに保存している。
- このキーは「ワークフロー単位」で1つしか存在しないため、「Set 1」「Set 2」など複数のプリセットが存在する場合、直近にアクティブだったプリセットのプロンプトが常に同じキーへ上書き保存される。
- 結果として、LocalStorage内のプロンプト値は「最後に触ったプリセットの値」に一本化されてしまい、プリセットごとの独立性が失われている。

### 根本原因 2: マウント時の LocalStorage 優先読み込みによるステート汚染
- `useWorkflowParams.ts` (L109-130) の `useEffect` は、バックエンドDBのプリセット一覧が読み込まれる前に、上記単一キーのLocalStorageから `savedParams` を取得して `setParamValues(savedParams)` を実行する。
- このため、現在アクティブなプリセットが「Set 1」であるにもかかわらず、「Set 2」で保存されたプロンプトが `paramValues` に注入される。

### 根本原因 3: オートセーブ機能による汚染ステートのDB破壊的書き込み
- `useGeneratePageState.ts` (L1050-1085) は `paramValues` の変更を検知し、1秒後に `updatePresetMutation.mutate({ id: activePreset.id, name: activePreset.name })` を実行する。
- `updatePresetMutation` (L510-522) は、現在の `paramValues` を `PUT /api/workflow-presets/{id}` に送信してDBを更新する。
- 根本原因2によって `paramValues` に別プリセットのプロンプトが入った状態でオートセーブが発火すると、**「Set 1」のDBレコードに対して「Set 2」のプロンプトが上書き保存されてしまう**。
- これにより、他端末で開いた際やリロードした際に「勝手に別プリセットのプロンプトになっている」「DBのデータ自体が書き換わってしまう」という致命的な障害が発生する。

---

## 5. 原因分類 (Classification)

<diagnostic_check>
- Root_Cause_Isolated: Yes
- Classification: Type_A: Implementation Bug
- Scope_Restriction: Read-only phase. Code modification or fix proposals are strictly PROHIBITED during this turn.
- Route: Direct to /dev-design for Type_A
</diagnostic_check>

* **分類**: **Type A (実装不備・状態管理および永続化ロジックの不整合)**
  * バックエンドDB（`workflow_presets`）を真のSSoT（Single Source of Truth）として扱い、LocalStorageへの保存キーをプリセット単位に分離（または不要なLocalStorageプロンプト同期を廃止してDB同期を主軸化）し、オートセーブ時の競合を防ぐ実装修正が必要です。

---

## 6. 改善方針（参考）

1. **SSoTの明確化とLocalStorage依存の排除/分離**:
   - プロンプトおよびパラメータのマスターデータは、バックエンドDBの `workflow_presets`（`param_values`, `applied_assets`, `batch_size`, `seed` 等）を絶対的なSSoTとする。
   - ワークフロー単位の単一キー `LS_KEYS.PARAMS_PREFIX` によるプロンプト読み込みを廃止し、プリセット単位（`preset_id` 基準）で状態を管理・同期する。
2. **初期化シーケンスの適正化**:
   - ページ初期化時およびワークフロー切り替え時は、バックエンドから取得したアクティブプリセットのデータを優先して `paramValues` にセットし、LocalStorageの不整合データによる上書きを防止する。
3. **オートセーブの安全性向上**:
   - プリセット切り替え時や初期同期中の未確定ステートでオートセーブが誤発火しないようガードを追加し、現在編集中のプリセットIDと保存先ID・データが完全に一致している場合のみDB更新を行う。

---

## 7. 次のステップ提案 (Next Action)

根本原因の特定および分類が完了しました。
修正設計（状態遷移図、LocalStorageキーの見直し、オートセーブガードの実装、テスト計画）を行うため、**`/dev-design` ワークフロー** への移行を推奨します。
