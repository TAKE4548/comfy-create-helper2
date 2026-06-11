# 設計書 - REQ-010: 生成ワークフローのプロンプト、パラメータ初期値更新機能

## 1. 目的と概要
現在、生成ワークフローを新規にロードした際、各入力パラメータ（プロンプト、シード、ステップ数、CFG、Denoise等）はDBマスタ上の固定された定義値または空の状態で初期化されます。ユーザーが特定のワークフローに適合した好みのプロンプトや最適パラメータ設定を「ワークフロー単位の初期値」として保存し、次回ロード時にその最適状態から開始する機能が存在しません。

本機能では以下の要件を実現します：
1. 画面上の入力パラメータの現在値を、そのワークフローの「デフォルト初期値」としてDBに直接保存するUIと機能。新規テーブルは追加せず、FastAPIの既存のワークフロー更新API（`PUT /api/workflows/{id}`）を通じて、ワークフローJSON（`json_body`）内の該当するノードのウィジェット値を直接上書き保存します。
2. ユーザーが入力したパラメータのセッション履歴を、ワークフローごとに個別に localStorage に保存し、ページのリロード時にも保持されるようにします。
3. ユーザーが「デフォルト値にリセット」をクリックした際、あるいはセッション履歴が localStorage に存在しない初回ロード時に、DB上の `json_body` から抽出された最適パラメータ値で入力フィールドを初期化します。

## 2. アーキテクチャ設計

### 2.1 Zustandストアの更新 (`frontend/src/store/useGenerationStore.ts`)
ユーザーが選択中のワークフローの入力状態（セッション履歴）を個別キーで保持・更新できるようにするため、ストア内の永続化ロジックを拡張します。

- **`storedParams` の初期化**
  - ストア起動時、`prompt-surgeon-workflow-id` に格納されている選択中ワークフロー ID を取得し、それに対応する個別パラメータキー `prompt-surgeon-params-wf-{workflowId}` から初期値を取得するようにします。
- **`setSelectedWorkflowId`**
  - ワークフロー選択時、対応する localStorage キー `prompt-surgeon-params-wf-{workflowId}` を読み込み、データが存在すれば `paramValues` にセットし、なければ一旦空の `{}` で初期化します。
- **`setParamValues`**
  - パラメータ値更新時、現在選択中の `selectedWorkflowId` があれば、対応する個別キー `prompt-surgeon-params-wf-{selectedWorkflowId}` に対して JSON 文字列として永続化します。

### 2.2 フロントエンド画面 of 更新 (`frontend/src/pages/GeneratePage.tsx`)
- **デフォルト保存用の API ミューテーション (`saveDefaultParamsMutation`)**
  - React Query の `useMutation` を用いて、`workflowsApi.update(workflowId, { json_body: wfJson })` を呼び出すミューテーションを追加します。
- **ワークフロー初期ロード時の `useEffect` の変更**
  - コンポーネントマウント時、または `workflow` がフェッチされた際に動作する `useEffect` で、`localStorage` 上に対応するワークフローのパラメータ履歴 `prompt-surgeon-params-wf-{workflow.id}` が既に存在する場合は、それを優先して `paramValues` にセットします。
  - 履歴が存在しない場合にのみ、`workflow.json_body` のノードマッピングからデフォルト値を抽出し、`paramValues` および `localStorage` を初期化します。
- **「現在のパラメータをデフォルトとして保存」機能 (`handleSaveDefaultParams`)**
  - 現在の `workflow.json_body` をディープコピーし、`mappings` 定義に基づいて、ユーザーが現在入力している `paramValues` の値を各ノードの `inputs` (もしくは `value`) に上書きします。
  - `saveDefaultParamsMutation` を実行して、ワークフローの `json_body` をDB上に更新・保存します。
  - 同時に、localStorage にも最新の `paramValues` をデフォルト保存されたセッション履歴としてセットします。
- **「デフォルト値にリセット」機能 (`handleResetDefaultParams`)**:
  - DBから読み込まれた最新の `workflow.json_body` から、各パラメータの値を再抽出します。
  - 抽出したデフォルト初期値を `paramValues` にセットし、`localStorage` の値もそのデフォルト値で上書き更新します。

## 3. UI/UX 仕様

- **ボタン配置**:
  - 左カラムの入力エリア上部（LLM Auditパネルのすぐ下）に、現在選択されているワークフローの設定管理カードを追加します。
  - カード内には「デフォルト保存」「デフォルトにリセット」ボタンを配置します。
  - 各ボタンには、ツールチップや動作説明を追加し、ローディング中（保存中）はローディングスピナーを表示しつつ二重送信を防止します。
- **スタイルデザイン**:
  - `bg-surface-2/60` 背景、`border-[rgba(255,255,255,0.06)]` 境界のカードデザイン。
  - 「デフォルト保存」ボタンは `bg-accent-green/10 text-accent-green hover:bg-accent-green/20` で、デフォルトのアクションよりも控えめに表示（プレミアムカラーを活かした調和）。
  - 「デフォルトにリセット」ボタンは `bg-zinc-800 text-zinc-350 hover:bg-zinc-700` で控えめな無彩色デザイン。
