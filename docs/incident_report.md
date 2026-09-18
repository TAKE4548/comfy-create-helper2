# インシデントレポート: 生成パラメータ（アスペクト比）変更の遅延反映および巻き戻り事象

**日時**: 2026-09-18  
**報告者**: Incident Analyst  
**対象コンポーネント**: 
- `frontend/src/pages/GeneratePage/hooks/usePresetState.ts`（プリセット同期・`updated_at` 比較ロジック）
- `backend/app/routers/presets.py`（プリセット更新 API・日時シリアライズ）
- `frontend/src/pages/GeneratePage/hooks/useWorkflowParams.ts`（ワークフローパラメータ補完・フォールバック）
- `db/prompt_surgeon.db`（`workflow_presets`, `workflow_mappings`）
**分類**: **Type A（実装バグ / Implementation Bug）**

---

## 1. 障害概要

- **症状**:
  - 生成画面においてアスペクト比（`aspect_ratio`）などの生成パラメータを変更した直後に「生成」ボタンを押しても変更が反映されず、以前の比率のまま画像が生成される。
  - その後、何度か生成を繰り返していると、遅れて変更後のアスペクト比で生成されることがある。
- **影響範囲**:
  - ワークフロー 61（および `Resolution Selector` 等のプリセット連動パラメータを持つワークフロー全般）。
  - パラメータ変更直後に即座に生成を実行した全セッション。

---

## 2. 再現手順

1. 生成画面（Generate ページ）でワークフローおよびプリセット（例: プリセット 1506 "Set 1"）を選択する。
2. アスペクト比パラメータを `9:16 (Portrait Widescreen)` から `16:9 (Widescreen)` に変更する。
3. オートセーブ（1秒デバウンス）の完了前、あるいは生成中のポーリング（5秒間隔）やウィンドウフォーカス復帰のタイミングで「生成」ボタンを押下する。
4. **結果**:
   - フロントエンドのストア値がサーバー側の旧データで上書き再同期され、`9:16` のまま ComfyUI にプロンプトが投入される。
   - 数回生成を試行している間にバックエンドへのオートセーブ `PUT` が完了し、その後のリフェッチタイミングと合致したタイミングでようやく `16:9` で生成される。

---

## 3. 調査結果およびエビデンス

### エビデンス①: プロンプト投入履歴とパラメータ巻き戻り（`logs/app.jsonl`, `db/prompt_surgeon.db`）
- `prompt_metadata` テーブルの投入履歴を抽出：
  - 16:50〜16:54 のジョブ: `16:9 (Widescreen)` として投入されていた。
  - 17:02 以降のジョブ: ユーザーが意図した `16:9` ではなく、`9:16 (Portrait Widescreen)` に巻き戻って投入されていた。
- `logs/app.jsonl` のリクエストログより、アスペクト比変更操作後の `PUT /api/workflow-presets/1506`（オートセーブ）と `POST /api/comfy/prompt`（生成投入）の間に微細なタイムラグが存在し、オートセーブが完了する前に旧値で投入されたり、再同期によってフロントのステートが旧値に巻き戻されていた痕跡を確認。

### エビデンス②: ComfyUI 側の実行履歴（`/history` API）
- ComfyUI の実行履歴（`/history`）を直接照合：
  - ノード `1270:807`（`ResolutionSelector`）の投入パラメータ `aspect_ratio` が、実際に ComfyUI 内部へ `9:16` として渡されていたことを確認。
  - ノード仕様として `width` / `height` を出力し `EmptyLatentImage`（ノード `1270:1231`）へ正常に伝搬するパイプライン接続となっており、ComfyUI 側のノード不具合ではなく、Prompt Surgeon から送信されたリクエストパラメータそのものが巻き戻っていたことを実証。

### エビデンス③: プリセットデータ内の旧ロールキー残存
- `db/prompt_surgeon.db` の `workflow_presets` を調査したところ、過去の設計・実装で発生した17文字切り捨てキー `'Resolution Selecto'` と正規キー `'Resolution Selector'` が同一プリセット内に混在（DB内 636 件のプリセットに残存）。
- フロントエンドのパラメータロード時（`useWorkflowParams.ts`）において、キーの表記揺れによる意図しないフォールバックや初期値復帰が誘発されやすい土台となっていた。

---

## 4. 根本原因分析（Root Cause Analysis）

本不具合は、以下の 3 つの複合要因によって発生している **Type A（実装バグ）** です。

### 根本原因 1: `updated_at` のシリアライズ形式不一致による不要なプリセット再同期（主因）
- **該当箇所**: 
  - `frontend/src/pages/GeneratePage/hooks/usePresetState.ts` L931
  - `backend/app/routers/presets.py` L106
- **メカニズム**:
  1. プリセット更新時、バックエンドは `preset.updated_at = datetime.now(timezone.utc)` を保存し、API レスポンスとして ISO 文字列（末尾 `Z` または `+00:00` 付き）を返却する。
  2. 一方、`GET /api/workflow-presets` 取得時は、SQLite から naive datetime として読み出されるため、末尾に `Z` のない文字列としてシリアライズされる。
  3. フロントエンドの `usePresetState.ts` において、以下の比較ロジックが実行される：
     ```typescript
     if (presetUpdatedAtRef.current[activePreset.id] !== activePreset.updated_at)
     ```
  4. 「末尾 `Z` あり」と「末尾 `Z` なし」の違いにより、**常に別端末・他セッションからの更新があったと誤判定**される。
  5. この結果、`!isDirty` 判定時やポーリング・フォーカス復帰時に `currentStore.loadPresetData(activePreset, defaultParams)` が発火し、UI 上で変更したパラメータがサーバー側の古い/遅延した値で強制上書きされる。

### 根本原因 2: オートセーブ（1秒デバウンス）と即座の生成ボタン押下のタイミング競合
- **該当箇所**:
  - `frontend/src/pages/GeneratePage/hooks/usePresetState.ts`
- **メカニズム**:
  - アスペクト比を変更した後、オートセーブがバックエンドに送信されるまで 1 秒のデバウンス待機時間がある。
  - この 1 秒以内にユーザーが「生成」ボタンを押下するか、あるいは生成中に 5 秒間隔のプリセット一覧ポーリングやウィンドウフォーカスイベント（`refetchOnWindowFocus: true`）が発生すると、根本原因 1 の誤同期がトリガーされ、変更前の状態に巻き戻される。

### 根本原因 3: 旧ロール名キー（`Resolution Selecto`）の混在
- **該当箇所**:
  - `frontend/src/pages/GeneratePage/hooks/useWorkflowParams.ts` L50-54
  - `db/prompt_surgeon.db`（`workflow_presets`）
- **メカニズム**:
  - `'Resolution Selecto'`（末尾 r 欠落）と `'Resolution Selector'` の 2 重キーが存在し、プリセットロード時の初期値解決において、旧キーまたはデフォルト値へのフォールバックが誘発されやすい状態となっている。

---

## 5. 「遅れて反映される」メカニズムの解明

1. ユーザーがアスペクト比を変更する。
2. 変更直後に生成ボタンを押すと、オートセーブ未完了または誤再同期により旧アスペクト比で生成される。
3. 生成中または生成完了後に、1秒デバウンスを経た `PUT` リクエストがバックエンドに到達し、DB 側がようやく更新される。
4. その後、何回か生成を繰り返すうちに、リフェッチされた最新データ（新アスペクト比）とフロントエンドの状態が一致し、以降の生成ジョブには変更後のアスペクト比が ComfyUI に送信されるようになる。

---

## 6. 是正方針（設計フェーズへの申し送り）

1. **`updated_at` 比較の正規化（タイムスタンプ値比較またはフォーマット統一）**:
   - `usePresetState.ts` において、単純な文字列完全一致比較（`!==`）ではなく、`new Date(...).getTime()` によるエポックミリ秒比較を行うか、バックエンド側での ISO8601 シリアライズ（UTC `Z` 付与）を統一し、同一日時の誤検知を完全に防止する。
2. **生成実行時の即時同期保証（フラッシュ処理）**:
   - 「生成」ボタン押下時に、デバウンス待機中の未保存パラメータが存在する場合は即座に保存（フラッシュ）を完了させてからプロンプト投入を行うか、あるいは投入用ペイロードにはフロントエンドの最新ストア値を直接使用して送信を担保する。
3. **プリセットデータのクリーンアップおよびキー正規化**:
   - データベース内の `'Resolution Selecto'` を正規の `'Resolution Selector'` に統合するマイグレーションまたは補正処理を適用し、キーの揺らぎによるフォールバック発生を防止する。
