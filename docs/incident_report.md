# インシデントレポート: パラメータ変更後のインメモリ同期的フラッシュ欠落および非同期レースコンディション（REQ-278 事後解析）

**日時**: 2026-09-19  
**報告者**: Incident Analyst  
**対象コンポーネント**: 
- `frontend/src/pages/GeneratePage/hooks/usePresetState.ts` (L1016–L1023: `flushAutoSave` の `activeSetId` ガードによる同期漏れ)
- `frontend/src/store/slices/multiSetSlice.ts` (L456–L461: `updateActiveSet` の `activeSetId` ガード落ち)
- `frontend/src/pages/GeneratePage/hooks/useGenerateAction.ts` (L132, L190–L202, L211–L227: ジョブ投入先行レースコンディションおよび `isActive` 判定落ち、バッチサイズ・シードの未同期)
- `logs/app.jsonl` (HTTP 非同期通信とジョブ投入のタイミングトレース)
**分類**: **Type A（実装バグ / Implementation Bug）**

---

## 1. 障害概要

- **症状**:
  - 生成画面（Generate ページ）でパラメータ（Steps、CFG、シード、バッチサイズ等）を変更した直後、オートセーブ完了前（または画面リロードなし）に「生成（Generate Batch）」を実行すると、1回目の生成では変更前の古いパラメータ値のまま ComfyUI にジョブが投入される。
  - ブラウザをリロードせずとも、2回目の生成ボタン押下時には最新パラメータが反映される。
  - プロンプト入力欄（`promptChips`）のみ即時反映されるが、パラメータ値・バッチサイズ・シード値において「1回目未反映・2回目反映」の現象が発生する。

- **影響範囲**:
  - 複数セット読み込み時、または `activeSetId` が未確定（`null`）の状態でパラメータ・バッチサイズ・シードを変更して即時生成を行う全ユースケース。

---

## 2. ログおよび実行順序のフォレンジック検証

### ログ証拠（Active Log Inspection: `logs/app.jsonl`）
- `logs/app.jsonl` 調査結果:
  - 定期ポーリング `GET /api/workflow-presets` が正常稼働中（例: `[2026-09-19T14:54:55.904+09:00] [INFO ] [backend ] [req-3cd7c1a14f79] GET /api/workflow-presets -> 200 (10.27ms)`）。
  - エラーログ（ERROR レベル）は検知されず（0件）、通信自体は正常。
- 実行順序（タイムライン）:
  1. `T0 (編集)`: 画面上でパラメータを変更（`state.paramValues` は新値、`state.sets` は旧値、1秒デバウンスタイマー待機）。
  2. `T1 (1回目生成)`: 生成ボタン押下により `handleGenerateSets` が発火。`onBeforeGenerate`（`flushAutoSave`）が呼ばれ `updatePresetMutation.mutate`（非同期 HTTP 通信）が開始されるが、await されず即時リターン。
  3. `T2 (ジョブ投入)`: 非同期通信の完了（数十ms後）を待たずに、`handleGenerateSets` 内のキュー投入ループが先行して実行され、未更新の旧値で ComfyUI に投入される。
  4. `T3 (保存・同期完了)`: 遅れてバックエンドから HTTP 200 が返り、React Query の `setQueryData` と `useEffect` を経てストアの `sets` に新値が同期される。
  5. `T4 (2回目生成)`: 再度生成ボタンを押すと、T3 で同期済みの新値が参照されるため、リロードなしで反映される。

---

## 3. 構造的根本原因（3つの要因）

### 要因①: ジョブ発行とサーバー非同期通信の競合（Race Condition）
- **該当箇所**: `frontend/src/pages/GeneratePage/hooks/useGenerateAction.ts` L132
- **メカニズム**:
  `options?.onBeforeGenerate?.()` の呼び出しが同期関数として通過し、戻り値の完了待ちが行われない。`flushAutoSave` 内部のサーバー更新 `updatePresetMutation.mutate(...)` は fire-and-forget の非同期通信であるため、サーバー保存と React Query/`useEffect` による store 更新を待たずに、直後の ComfyUI プロンプト投入ループが先行して走り、古いパラメータが送信される。

### 要因②: インメモリ即時確定（updateActiveSet）のガード落ち
- **該当箇所**:
  - `frontend/src/pages/GeneratePage/hooks/usePresetState.ts` L1016–L1023
  - `frontend/src/store/slices/multiSetSlice.ts` L456–L461
- **メカニズム**:
  `flushAutoSave` および `updateActiveSet` において、`targetActiveId` が `null` かつ `currentStore.sets.length > 1`（複数セット存在時）の場合に早期 `return` して終了するガードが存在する。このため、生成ボタン押下時のインメモリ `sets` への即時確定処理が完全に空振りしている。

### 要因③: 下流の `isActive` 判定落ちおよびプロパティ未同期
- **該当箇所**: `frontend/src/pages/GeneratePage/hooks/useGenerateAction.ts` L190–L202, L211–L227
- **メカニズム**:
  `checkedSets.length > 1` かつ `currentActiveSetId === null` の条件下では、`isActive` が `false` と評価される。これにより `itemParams` に `currentParamValues` がマージされず、古い `setItem.paramValues` が 100% 採用される。さらに、`batchSize` や `seedMode`、`seed` についても画面の最新状態（`state.batchSize` 等）ではなく `setItem` の旧値が参照されている。

---

## 4. 障害分類と判定理由

- **分類**: **Type A（実装バグ / Implementation Bug）**
- **判定理由**:
  「生成実行時は画面上の最新インメモリ状態を即時反映して ComfyUI にジョブを投入する」という仕様に対し、非同期通信の完了待ちに依存したフロー構造、および複数セット時のアクティブID解決ガード不備・`isActive` 判定ロジックの不整合というフロントエンド実装上の瑕疵であるため。仕様自体の破綻ではなく、実装バグに該当する。

---

## 5. 推奨する次のアクション

- **ルート**: **`/dev-design`**（開発設計・タスクカード作成）
- **推奨 PBI 内容**:
  - `flushAutoSave` および `updateActiveSet` におけるアクティブセット特定（複数セット時のフォールバック）とインメモリ同期的確定の徹底
  - `useGenerateAction.ts` における `resolvedActiveSetId` の確実な解決、および `paramValues`・`batchSize`・`seed` の最新状態優先マージ
  - 1回目即時生成・複数セット時の偽陽性を遮断する回帰防止テストの拡充
