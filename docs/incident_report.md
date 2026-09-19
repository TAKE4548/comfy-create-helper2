# インシデントレポート: 生成パラメータ変更の未反映およびF5リロード依存の根本原因解明とクリーンアップ（REQ-276/277事後解析レポート）

**日時**: 2026-09-19  
**報告者**: Incident Analyst  
**対象コンポーネント**: 
- `frontend/src/pages/GeneratePage/hooks/usePresetState.ts`（プリセット同期・React Query・rawMappedSets によるインメモリ上書き破壊）
- `frontend/src/pages/GeneratePage/hooks/useGenerateAction.ts`（生成投入時の下流対症療法パッチ・isActive 判定・クリーンアップ対象）
- `frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateAction.test.ts` / `useGeneratePageState.test.tsx`（テストモックによる偽陽性検知ギャップ）
**分類**: **Type A（実装バグ / Implementation Bug）**

---

## 1. 障害概要

- **症状**:
  - 生成画面（Generate ページ）において各種生成パラメータ（`Sampler_Steps`, `Sampler_cfg`, `Resolution Selector`, `LoraStack` 等）を変更した後、ブラウザをリロード（F5）せずに「生成（Generate Batch）」を実行すると、変更前の古いパラメータ値のまま ComfyUI にプロンプトが投入される。
  - プロンプト入力欄（`promptChips`）で変更したテキストは、リロードなしでも即座に生成に反映されるが、パラメータのみが反映されない。
  - ブラウザを明示的に F5 リロードした直後に「生成」を実行すると、SQLite DB に保存されていた最新パラメータで正常に生成されるが、リロード後に再度弄ると再発する。
  - **特記事項**: REQ-276 および REQ-277 で「修正完了」と報告され、自動テストもすべて PASS していたにもかかわらず、本質的根本原因が見落とされ、下流に対症療法パッチが継ぎ足されていた。

- **影響範囲**:
  - プリセット機能を利用する全ワークフローおよびパラメータ変更操作。
  - ページをリロードせずにパラメータを変更して連続生成を行う全ユーザー操作。

---

## 2. ログおよび静的解析によるフォレンジック検証

### ログ証拠（Active Log Inspection: `logs/app.jsonl`）
- `logs/app.jsonl` において、`GET /api/workflow-presets` のポーリング（例: `[2026-09-19T12:22:15.251+09:00] [INFO ] [backend ] [req-6e8680fe42dd] GET /api/workflow-presets -> 200 (8.15ms)`）が 5 秒間隔で定期実行されている。
- パラメータ変更時のオートセーブ（`PUT /api/workflow-presets/:id`）は SQLite DB に正常保存（HTTP 200）されている。
- しかし、フロントエンド側でポーリングやオートセーブ後の再同期（React Query）が走るたびに、以下のメカニズムでインメモリ状態が旧 DB 値で破壊されていた。

---

## 3. 静的解析レポートに基づく根本原因分析（5大現象の符合検証）

静的解析レポート（`tmp/REQ-276_277_Static_Analysis_Report.pdf`）およびコード検証により、実機現象の発生メカニズムが完全に特定されました。

### ① パラメータ欄を変更して生成しても反映されない根本原因
- **該当箇所**: `frontend/src/pages/GeneratePage/hooks/usePresetState.ts` L827–L844 (`rawMappedSets`)
- **メカニズム**:
  ```typescript
  const rawMappedSets = presets.map((p) => {
    const existingSet = existingSetsMap.get(String(p.id))
    return {
      id: p.id,
      name: p.name,
      // defaultParams < サーバーDB最新値 (SSoT)
      paramValues: healLegacyParamKeys({
        ...defaultParams,
        ...(p.param_values || {}), // ← existingSet.paramValues を無視してサーバーDB値で上書き！
      }),
      appliedAssets: p.applied_assets || {}, // ← 既存インメモリを無視
      promptChips: existingSet?.promptChips, // ← ここだけ既存インメモリを保持！
      batchSize: p.batch_size || 1,
      seedMode: (p.seed_mode as 'random' | 'fixed') || 'random',
      seed: p.seed !== undefined ? p.seed : 42,
      checked: checkedPresets === null ? true : checkedPresets.includes(p.id),
    }
  })
  ```
  `rawMappedSets` 生成時、`promptChips` は `existingSet?.promptChips` を保持しているのに対し、`paramValues` は `existingSet?.paramValues` を完全に破棄し、サーバーDB値 `p.param_values` で強制上書きしている。
  さらに、`activeSetId` が未確定時や `isFirstSync` 時には `mappedSets = rawMappedSets` となり、ストアの `sets` 配列が旧値で破壊される。

### ② リロードを挟めば反映されるメカニズム
- パラメータ変更はバックグラウンドのオートセーブ（1 秒デバウンスの `updatePresetMutation`）により SQLite DB 側には正常に保存されている。
- リロードすると DB から最新値として `presets` が取得されるため、`p.param_values` 自体が最新値となり、一時的に正常反映される。

### ③ プロンプト欄だけはリロードしなくても反映されるメカニズム
- `rawMappedSets`（L838）において `promptChips: existingSet?.promptChips` と記述されており、プロンプト構造体のみ既存インメモリ値が温存される。
- さらに生成直前の `getEffectiveParamValues` で `promptChips` から平文が再生成され強制上書きされるため、旧値の影響を回避できていた。

### ④ 入力欄の見た目上の巻き戻りが起きていないメカニズム
- 画面の入力欄（`ParamPanel.tsx`）がバインドしているのは Zustand のルートプロパティ `state.paramValues` である。
- `rawMappedSets` による上書き破壊は `state.sets` 配列にのみ作用し、`state.paramValues` は直接書き換えられないため、画面表示上は最新値が維持されていた。

### ⑤ リロード後に再度弄った場合も再発するメカニズム
- リロード直後は「DB 保存値 ＝ 画面値」となるため一度は反映されるが、再編集した瞬間に「クライアント編集値」と「rawMappedSets が保持する旧 DB 値」に乖離が生じ、同様の上書きサイクルに突入するため再発する。

---

## 4. REQ-276 / REQ-277 の改修全量監査（妥当改修と余計な対症療法改修）

| 対象ファイル | 改修内容 | 判定 | 監査所見 |
| :--- | :--- | :--- | :--- |
| `backend/app/routers/presets.py` (REQ-276) | `updated_at` の UTC 付与（`_ensure_utc`）、ISO8601 シリアライズ統一 | 【妥当】 | SQLite の naive datetime に起因するタイムゾーンズレを根絶する必須の基盤修正。 |
| `backend/app/routers/mapping_masters.py` (REQ-276) | ロール名変更時、全プリセットの JSON キーを自動置換するカスケード更新 | 【妥当】 | ロール名タイポ修正時のキー孤立を防止する恒久防壁。 |
| `frontend/.../usePresetState.ts` (REQ-276: タイムスタンプ比較) | `isTimestampDifferent` 導入（1秒閾値・Z補正）、`setQueryData` による自己再フェッチ抑止 | 【妥当】 | 表記差異による不要な誤再同期を防止。他端末検知は維持されており健全。 |
| `frontend/.../usePresetState.ts` (REQ-276/277: `flushAutoSave`) | クロージャ参照を排除し `useGenerationStore.getState()` から最新取得 | 【妥当】 | React の再レンダリング待ちクロージャトラップを回避する必須修正。 |
| `frontend/.../multiSetSlice.ts` (REQ-277: `updateActiveSet`) | `activeSetId` 未確定時、`sets.length === 1` であれば唯一のセットを更新対象とする | 【妥当】 | 単一セット利用時の防御的フォールバックとして安全かつ有益。 |
| `frontend/.../useGenerateAction.ts` (REQ-277: `isActive` 判定) | `checkedSets.length === 1` や非存在チェックによる複雑な `isActive` 判定と強制マージ | **【余計・過剰】（対症療法）** | **問題の改修**。本来 `sets` が最新値を保持していれば不要な下流パッチ。上流の `rawMappedSets` 破壊を放置したため、下流で無理やり `currentParamValues` をマージしようとしてロジックが肥大化・複雑化している。 |
| `frontend/.../usePresetState.ts` (REQ-277: 片手落ちフォールバック) | `flushAutoSave` には単一セット保護を入れたが、メインの `useEffect` (L817/848) には入れず放置 | **【片手落ち】（不完全改修）** | **問題の改修**。同一ファイル内で `activeSetId` の解決方針が分裂。`useEffect` 側が `null` のまま `rawMappedSets` でセット全体を上書きする致命的隙間を残した。 |

---

## 5. テスト検証の偽陽性（Test Gap）

- `REQ-277` の検証テスト（`useGenerateAction.test.ts: L1120`）では、先行オートセーブを検証するシナリオにおいて、実際の `usePresetState` フックを協調させず、テストコード内で手動で `mockStore.sets[0].paramValues = { ...latest.paramValues };` とストアへ直接代入していた。
- このため、実機で発生していた「`useEffect` が走って `sets` を旧値で上書きする」というクリティカルな破壊現象をテストが完全にバイパスし、オールグリーン（偽陽性 PASS）となっていた。

---

## 6. 是正アクション要件（PBI 登録への申し送り事項）

1. **Step 1: 上流の根本原因是正 (`usePresetState.ts` L827–L844)**
   - `rawMappedSets` 生成時、`existingSet?.paramValues` が存在する場合はローカル編集値を最優先で継承（`...defaultParams`, `...(p.param_values || {})`, `...(existingSet?.paramValues || {})`）。
   - `appliedAssets`, `batchSize`, `seedMode`, `seed` についても `existingSet` の値を安全にフォールバック・優先継承する。
2. **Step 2: `usePresetState.ts` L817 の `activeSetId` 解決フォールバック**
   - `currentActiveSetId` が `null` / `undefined` かつ `existingSets.length === 1` の場合、`existingSets[0].id` をアクティブとみなす保護を追加し、`flushAutoSave` との方針分裂を解消する。
3. **Step 3: `useGenerateAction.ts` の過剰な対症療法コード整理（クリーンアップ）**
   - Step 1 & 2 により `sets` の完全性が担保されるため、`useGenerateAction.ts` 内の肥大化したフォールバック判定（`checkedSets.length === 1` 時の無理やりなマージ等）を整理・一本化する。
4. **Step 4: ライフサイクル結合テストの追加**
   - ストア直接書き換えモックではなく、`usePresetState` の同期サイクルと `handleGenerateSets` を連携させた再現テスト・リグレッションテストを追加し、偽陽性を防ぐ。
