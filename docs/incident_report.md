# インシデントレポート: プリセットプロンプトが別プリセットの内容で上書きされる不具合

**日時**: 2026-09-23  
**報告者**: Incident Analyst  
**対象コンポーネント**: 
- `frontend/src/pages/GeneratePage/hooks/usePresetState.ts`
  - L163-L176: `createPresetMutation.onSuccess` での `sets` 未同期による別プリセットへの誤上書き
  - L189-L198: `updatePresetMutation.mutationFn` の `param_values` フォールバックによる別プリセット上書き
  - L710-L757: `handleSelectPresetTab` でのタブ切替時オートセーブ未フラッシュおよび未追跡プリセットの stale 読込
  - L874-L892: `rawMappedSets` におけるサーバー DB 値に対するローカル既存値の無条件優先マージ（サーバー更新の上書き破棄）
  - L995-L1040: ポーリング時の非アクティブプリセット更新追跡漏れ（`presetUpdatedAtRef` 更新漏れ）
  - L1101-L1146: タブ切替時のデバウンスタイマークリアによる未保存差分の脱落
- `frontend/src/store/slices/multiSetSlice.ts`
  - L272-L289: `setActiveSetId` が未登録 ID に対して早期 return することによる `activeSetId` 不整合
**分類**: **Type A（実装バグ / Implementation Bug）**

---

## 1. 障害概要

- **症状**:
  1. **プリセット間でのパラメータ・プロンプト誤上書き**:
     プリセットの切り替えや新規作成、あるいは別端末との引き継ぎ操作を行った際、あるプリセットのプロンプトが別のプリセットの内容で上書き・保存されてしまう。
  2. **タブ切替時の未保存差分消失（別端末引き継ぎ時の同期不整合）**:
     プロンプト編集中にオートセーブ（1秒デバウンス）が完了する前に別のプリセットタブへ切り替えると、タイマーが破棄（clearTimeout）されサーバーへ送信されない。手元のメモリ上にのみ残った値が、別端末での編集・保存や定期ポーリングと衝突し、意図せぬ巻き戻りや上書きを引き起こす。
  3. **他端末での更新の取り込み阻害（サーバー SSoT の無効化）**:
     他端末で更新されたプリセットが存在しても、自端末の `rawMappedSets` がローカルのインメモリ値（`existingSet.paramValues`）を無条件に最優先マージするため、自端末側でサーバーの最新値が破棄される。

- **影響範囲**:
  - 複数プリセットを運用する全ユーザー。特に複数タブ・複数端末（PC・スマホ等）でプリセット編集・切り替えを行うユーザーにおいて、プリセットデータの破壊的消失リスクが存在する。

---

## 2. ログおよび実行フォレンジック検証

### ログ検証（Active Log Inspection: `logs/app.jsonl`）
- `python scripts/inspect_logs.py --summary` および `--errors --tail 10` の実行結果:
  - 総ログエントリ: 26,846件（すべて INFO）
  - 直近のエラーログ（ERROR レベル）: 0件
  - バックエンドサーバー自体は HTTP 200/204 等を正常に応答しており、サーバークラッシュや例外ではなく、**フロントエンドの状態管理・ライフサイクル制御に起因する論理的バグ**であることを確認。

---

## 3. 根本原因の分離とメカニズム

コードベースの静的解析およびデータフロー追跡により、以下の 4 つの結合的メカニズムが特定されました。

### メカニズム 1: 新規プリセット作成時の `activeSetId` 不整合による既存プリセット破壊（直接の上書き）
- **該当箇所**: `frontend/src/pages/GeneratePage/hooks/usePresetState.ts` (L163-L176) 及び `frontend/src/store/slices/multiSetSlice.ts` (L272-L289)
- **メカニズム**:
  1. `createPresetMutation.onSuccess` で `newPreset` が返却された際、`setActiveSetId(newPreset.id)` を呼び出す。
  2. しかし、この時点では `qc.invalidateQueries` が完了しておらず、Zustand ストアの `sets` 配列に `newPreset.id` はまだ存在しない。
  3. `multiSetSlice.ts` の `setActiveSetId` は `const targetSet = get().sets.find(...)` が見つからないため **早期 return** し、ストアの `activeSetId` は「直前に開いていたプリセット（Preset X）」のまま維持される。
  4. 直後に `setParamValues(newPreset.param_values)` が実行される。
  5. `setParamValues` はストア内の `updateActiveSet` を呼ぶが、`activeSetId` は Preset X のままであるため、**Preset X のパラメータが `newPreset` の内容で書き換えられる**。
  6. その後オートセーブが走り、Preset X が `newPreset` のプロンプトで DB に恒久保存される。

### メカニズム 2: タブ切り替え時のオートセーブ破棄によるデータ脱落
- **該当箇所**: `frontend/src/pages/GeneratePage/hooks/usePresetState.ts` (L710-L757, L1140-L1145)
- **メカニズム**:
  1. ユーザーが Preset A を編集中、1秒のオートセーブタイマー（`autoSaveTimerRef`）が起動する。
  2. 1秒経過前にユーザーが Preset B のタブをクリック（`handleSelectPresetTab(B)`）すると、`activeSetId` が切り替わる。
  3. `usePresetState` の `useEffect` クリーンアップにより `clearTimeout(autoSaveTimerRef.current)` が実行され、**Preset A の未保存データはサーバーに送信されずに破棄される**。
  4. `handleSelectPresetTab` 内で `flushAutoSave()` などの同期保存処理が一切呼ばれていない。
  5. これにより、Preset A は自端末のメモリ上にのみ残り、DB は古いままとなる。別端末で開いた際には古い値が表示され、別端末で編集・保存が行われると容易に同期不整合となる。

### メカニズム 3: `rawMappedSets` によるサーバー SSoT の無条件上書き
- **該当箇所**: `frontend/src/pages/GeneratePage/hooks/usePresetState.ts` (L874-L892)
- **メカニズム**:
  ```typescript
  paramValues: healLegacyParamKeys({
    ...defaultParams,
    ...(p.param_values || {}),
    ...(existingSet?.paramValues || {}), // ここでローカル値が無条件にサーバー値を上書き
  })
  ```
  1. REQ-278 で導入されたこのマージロジックは、未保存のローカル編集値を保護する目的であったが、「ローカル編集が行われたか（isDirty）」の判定を行わずに `existingSet?.paramValues` を無条件に最上位でスプレッドしている。
  2. 初回マウント以降、すべてのプリセットは `existingSets` に登録されるため、他端末でプリセットが更新されてサーバー DB の値 `p.param_values` が変化しても、自端末がポーリングした際に常に古い `existingSet.paramValues` で上書き破棄される。

### メカニズム 4: 非アクティブプリセットのタイムスタンプ追跡漏れ
- **該当箇所**: `frontend/src/pages/GeneratePage/hooks/usePresetState.ts` (L995-L1040)
- **メカニズム**:
  1. 5秒周期の定期ポーリング処理では、現在アクティブなプリセット（`targetActiveId`）についてのみ `presetUpdatedAtRef.current` を更新し、他端末での更新（`updated_at` の変化）を検知している。
  2. 非アクティブなプリセットについては `presetUpdatedAtRef.current` が更新されない。
  3. そのため、ユーザーが「ふと別のプリセットに切り替えた（`handleSelectPresetTab`）」際、`prevUpdatedAt` が存在しないか古いままとなり、サーバー更新判定や競合判定が正常に機能せず、メカニズム 3 の壊れたローカルメモリ値（stale data）のまま表示・編集が継続される。

---

## 4. 障害分類と判定理由

- **分類**: **Type A（実装バグ / Implementation Bug）**
- **判定理由**:
  - 仕様（複数端末でのプリセット同期、タブ切り替え、オートセーブ）自体に問題はなく、フロントエンドにおける以下の 4 点の実装欠陥に起因しているため：
    1. 新規作成時の `sets` 反映待ちを行わずに `setParamValues` を呼んでいること。
    2. タブ切り替え時にオートセーブをフラッシュ（`flushAutoSave`）していないこと。
    3. `rawMappedSets` で dirty 判定なしにローカル値を無条件優先マージしていること。
    4. ポーリング時に非アクティブプリセットの `updated_at` を同期していないこと。

---

## 5. 推奨する次のアクション

- **ルート**: **`/dev-design`**（開発設計・タスクカード作成）
- **PBI 対象スコープ**:
  1. `createPresetMutation.onSuccess` において `sets` に新プリセットを確実に挿入してから `activeSetId` を更新する、または `loadPresetData` を用いた原子的初期化への修正。
  2. `handleSelectPresetTab` におけるタブ切替前の `flushAutoSave` 呼出の徹底。
  3. `rawMappedSets` におけるマージロジックの是正（未編集のプリセットはサーバーの最新 `param_values` を忠実に反映し、自端末で真に dirty なプリセットのみ保護）。
  4. ポーリング時における全プリセットの `presetUpdatedAtRef` の確実な追跡同期。
