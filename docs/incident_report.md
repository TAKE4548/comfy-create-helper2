# インシデントレポート: 端末間（複数デバイス）で編集したプリセットが同期で反映されない不具合

## 1. 事象概要 (Overview)

ユーザーより以下の事象が報告された。
- 端末を跨いだ時、別の端末で編集したプリセットが、同期で反映されない。

調査の結果、以下の複数の要因が重なり、別端末（端末A）で編集・保存されたプリセットのデータが、もう一方の端末（端末B）において破棄または無視され、古いローカルステートやキャッシュで上書きされ続ける現象が発生していることが判明した。

1. **プリセット更新時の優先マージ逆転とストア更新の欠落 (`usePresetState.ts`)**:
   - サーバーから最新の `presets` を再取得（refetch）した際、`rawMappedSets` の構築処理において `p.param_values` よりも手元の古い `existingSet?.paramValues` が優先マージされている。
   - さらに、初回同期以降（`isFirstSync === false`）はアクティブセットが手元の古い `currentStore.paramValues` で上書きされ、かつ `loadPresetData` が呼び出されないため、サーバーの更新値がストアおよびUIに一切反映されない。
2. **TanStack QueryのLocalStorageキャッシュと二重初期化競合 (`App.tsx`)**:
   - `PersistQueryClientProvider` により `workflow-presets` のクエリキャッシュが各端末の `window.localStorage` に保存されている。
   - 端末Bを開いた際、まず古いキャッシュデータで初期同期（`isFirstSync = true`）が完了してしまい、その直後にバックグラウンドで届いた最新のサーバーレスポンスが「2回目以降の同期」として判定され、上記1のロジックによって完全に破棄される。
3. **タブ表示管理（`openPresetIds`）の端末間非同期 (`multiSetSlice.ts`)**:
   - 開いているプリセットID一覧（`openPresetIds`）が各端末の `localStorage` にのみ保持されているため、端末Aで新規作成したプリセットが端末Bのタブバーに自動表示されない。
4. **タグチップ状態（`promptChips`）の残留更新漏れ (`multiSetSlice.ts`)**:
   - `loadPresetData` において既存の `promptChips` が存在する場合にそれが優先され、新しいサーバープロンプト文字列からの再パースが行われないため、UI（`TagChipEditor`）の表示が古いタグのまま残る。

---

## 2. 再現手順・観測された挙動 (Reproduction & Observed Symptoms)

### 再現手順:
1. **端末A**（PC等）の生成画面で、プリセット（例: `Set 1`）のプロンプトやパラメータを編集し、オートセーブまたは保存を完了させる（DBには正常に更新が反映される）。
2. **端末B**（スマートフォンまたは別ブラウザ）を開く（または既に開いている画面に切り替える）。
3. 端末Bにおいて、端末Aで編集した `Set 1` のプロンプトや設定内容を確認する。

### 観測結果:
1. **編集内容の不反映**:
   - 端末Bのプロンプト入力欄およびパラメータには、端末Aで編集した最新値ではなく、端末Bの過去の古い値（または空の初期値）が表示され続ける。
2. **リロード後も更新されない**:
   - 端末Bでブラウザを再読み込み（F5）しても、`window.localStorage` のクエリキャッシュから古いデータが即座に復元され、直後に取得されたサーバーの最新値が上書き破棄されるため、何度リロードしても端末Aの編集が反映されない。
3. **新規作成プリセットの不可視化**:
   - 端末Aで新しく追加したプリセットタブが、端末Bのタブバーに表示されない（端末B側の `openPresetIds` が端末固有の `localStorage` に閉じているため）。

---

## 3. 影響範囲・該当コード (Affected Area & Source Locations)

| # | 対象ファイル | 該当行 | 詳細 |
|---|---|---|---|
| 1 | `frontend/src/pages/GeneratePage/hooks/usePresetState.ts` | L684-702 | `paramValues: { ...defaultParams, ...(p.param_values \|\| {}), ...(existingSet?.paramValues \|\| {}) }`<br>サーバー取得値（`p.param_values`）の上に古い手元の値（`existingSet?.paramValues`）がマージされ、サーバーの変更が握りつぶされる。 |
| 2 | `frontend/src/pages/GeneratePage/hooks/usePresetState.ts` | L704-722 | `if (!isFirstSync && currentActiveSetId !== null)` にて、最新のサーバーデータ受信時にもアクティブセットが古い `currentStore.paramValues` で強制上書きされる。 |
| 3 | `frontend/src/pages/GeneratePage/hooks/usePresetState.ts` | L739-774 | `isFirstSync` が `false` の場合、`loadPresetData` が呼ばれず、サーバーの最新プリセットデータがストアの `paramValues` 等に反映されない。 |
| 4 | `frontend/src/pages/GeneratePage/hooks/usePresetState.ts` | L57-61 | `useQuery(['workflow-presets', ...])` にポーリング（`refetchInterval`）や端末間同期通知の連携がなく、受動的な再取得トリガーが不足している。 |
| 5 | `frontend/src/App.tsx` | L24-27, L37-50 | `PersistQueryClientProvider` の永続化除外キーに `workflow-presets` が含まれておらず、端末B起動時に古いキャッシュが同期復元されて初回復旧フラグを消費してしまう。 |
| 6 | `frontend/src/store/slices/multiSetSlice.ts` | L59-65, L348-351 | `openPresetIds` がブラウザ端末固有の `localStorage` に依存しており、他端末での追加・構成変更が追従されない。 |
| 7 | `frontend/src/store/slices/multiSetSlice.ts` | L313, L353-356 | `loadPresetData` において `promptChips` の既存オブジェクトが優先され、新サーバー値に基づくチップ再生成が行われない。 |

---

## 4. 根本原因の分析 (Root Cause Analysis)

### 発生メカニズム:

1. **SSoTとローカルマージ順序の破綻**:
   - PBI-163（`docs/design/163.md`）の基本設計では「バックエンドDB（`workflow_presets`）が真のSSoTであり、クライアントはサーバー最新値を取得して画面を安全に最新化する」と規定されていた。
   - しかし直近の実装（`usePresetState.ts`）において、「ローカル編集中の保護」を意図した `existingSet?.paramValues` のマージ処理が、ダーティ管理（未保存フラグ等）を持たないまま常に `p.param_values` の後ろに展開される形となっていた。
   - このため、端末AがDBを更新しても、端末B側で `presets` クエリが最新データを受け取った瞬間に、手元にある古い `existingSet.paramValues` が最新値を上書きし、サーバーの更新が完全に消失する。

2. **React Query永続化キャッシュによる初期同期ロジックの機能不全**:
   - `App.tsx` の `PersistQueryClientProvider` は、`window.localStorage` に `workflow-presets` を最大10分間キャッシュする。
   - 端末Bを立ち上げた際、まずこの古いキャッシュデータを用いて `usePresetState` の初回マウント処理（`isFirstSync = true`）が完了し、`isInitialSyncRef.current = true` となる。
   - その数十ミリ秒後にバックエンドへのHTTP通信が完了し最新のプリセット一覧が届いても、既に `isFirstSync` は `false` であるため、`loadPresetData` は実行されず、かつ上記1のローカル優先マージにより、届いた最新データが破棄される。

3. **端末間同期アーキテクチャの未完備**:
   - 端末Aでの変更を端末Bが即時に検知するためのWebSocket通知やポーリングが存在せず、ウィンドウフォーカス時等のReact Queryの再取得時にも上記の握りつぶしバグにより反映されないため、ユーザーから見ると「端末を跨いだ同期が一切機能していない」状態となっている。

---

## 5. 原因分類 (Classification)

<diagnostic_check>
- Root_Cause_Isolated: Yes
- Classification: Type_A: Implementation Bug
- Scope_Restriction: Read-only phase. Code modification or fix proposals are strictly PROHIBITED during this turn.
- Route: Direct to /dev-design
</diagnostic_check>

* **分類**:
  * **Type A (Implementation Bug)**:
    - 仕様（PBI-163）ではバックエンドDBをSSoTとし、他端末の更新を反映・同期することが明確に定義されている。
    - しかしフロントエンド（`usePresetState.ts`, `App.tsx`, `multiSetSlice.ts`）の実装において、ローカル優先マージの逆転、キャッシュ永続化による初期化判定破壊、ストア更新漏れが存在していることによる純粋な実装上の不具合である。

---

## 6. バックログ登録とルーティング提案 (Backlog Registration & Routing)

- **推奨対応**:
  - 本事象は実装バグ（Type A）であり、原因となるコード行およびメカニズムが完全に特定されています。
  - 次のステップとして `/dev-design` へ進み、詳細な修正タスクカードを作成して修正に着手することを提案します。
- **次のワークフロー**: `/dev-design`

---

**ユーザー確認事項 (Approval Gate)**:
上記インシデントレポートの内容で合意いただける場合、PBIとしてバックログに登録し、`/dev-design` に進みますか？ (YES / NO)
