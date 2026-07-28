# インシデントレポート: プロファイル同期不具合（クロスデバイス / 新規タブ作成）

> 更新日: 2026-07-29

---

## 1. 概要

複数デバイス間、または同一デバイスでのプロファイル（プリセット）タブ操作において、編集内容が正しく同期・永続化されない不具合。既存プロファイルを元に新規タブを生成した際に、元のプロファイルも含めて古い状態に戻る現象と、デバイスをまたいだリロード時に他デバイスの最新編集が反映されずに古い状態が上書きされる現象が確認されている。

---

## 2. 現象（症状）

| # | 現象 | 再現頻度 |
|---|------|---------|
| A | 既存プロファイルを元に新規タブを生成した直後、元のプロファイルタブに切り替えると古い編集状態に戻る | 高 |
| B | 新規タブに複製された内容が、複製操作前の最新編集ではなく一つ前の保存済み状態になっている | 高 |
| C | 別デバイスでリロードすると、他デバイスで保存した最新内容ではなくローカルの古い内容が表示される | 中〜高 |
| D | 古い状態が表示されたまま編集するとオートセーブが発火し、サーバーの正しい最新データを古いデータで上書きしてしまう | 中 |

**再現手順（新規タブ生成のケース）:**
1. プロファイルAを開いて編集中（オートセーブ1秒待機中）
2. 「プロファイルAからコピーして新規タブ作成」を実行
3. 新規タブが開く
4. プロファイルAのタブに切り替える → 編集前の古い内容に戻っている

**再現手順（クロスデバイスのケース）:**
1. デバイスBでプロファイルAを編集・オートセーブ完了
2. デバイスAでページをリロード
3. デバイスAのUIにデバイスBの編集が反映されない（古い内容が表示）
4. デバイスAでそのまま編集するとデバイスBの変更を上書き

---

## 3. 根本原因の特定

### 根本原因 1（最重要）: 同一プリセットがアクティブな場合に `paramValues` が更新されない同期ロジックの欠陥

**ファイル・行**: `useGeneratePageState.ts` L873〜L919（同期 useEffect）

**詳細**:

Zustand ストアの初期化時（ページロード時）、`paramValues` は **localStorage** から復元される（`useGenerationStore.ts` L233〜L237）。その後 React Query がバックエンドから最新プリセットデータを取得し、L873 の同期 `useEffect` が実行される。

この `useEffect` は `setSets(mappedSets)` でストア内の sets 配列をバックエンド最新データで更新する。しかし `setActiveSetId` の呼び出し（= `paramValues` の更新）は、以下の条件を満たした場合のみ行われる:

```ts
// L904
if (isInvalidActive || String(activeSetId) !== String(targetActiveId)) {
  setActiveSetId(targetActiveId)  // ← paramValues がここで更新される
}
```

**問題**: リロード後、`activeSetId` が localStorage から復元されて既存プリセットIDと一致している場合、この条件が `false` となり `setActiveSetId` が呼ばれない。その結果、`paramValues` は **localStorage の古いデバイスローカル値のまま** となり、バックエンドの最新値が反映されない。

**影響**: `lastSavedStateRef` がこの古い値を基準として初期化され（L947）、変更なしと判定されオートセーブも発火しないため、古い状態がUIに残り続ける。ユーザーが編集を始めると古い値の上にオートセーブが発火し、バックエンドの正しいデータを破壊する。

---

### 根本原因 2: `setSets(mappedSets)` が未保存の編集デルタを破壊する

**ファイル・行**: `useGeneratePageState.ts` L894、L485〜L493

**詳細**:

任意の Mutation の `onSuccess` で `invalidateQueries` が呼ばれると、React Query が再フェッチを行い、同期 `useEffect` が実行される。この時 `setSets(mappedSets)` により、メモリ上の sets 配列が **バックエンドの現在値** で完全に置き換えられる。

新規タブを既存プロファイルからコピーする操作（`handleCreatePreset(name, copySourceId)`）の場合:

1. ユーザーがプロファイルAを編集中（`paramValues` = 最新の未保存値）
2. コピー操作 → `createPresetMutation.mutate(...)` が実行
3. `source.param_values` は React Query キャッシュから取得されるが、**オートセーブ未完了のため古い値**（L692: `presets?.find(...)` → キャッシュデータ）
4. `onSuccess` → `invalidateQueries` → 再フェッチ → 同期 `useEffect` 実行
5. `setSets(mappedSets)` がプロファイルAの sets エントリをバックエンドの古い値で上書き
6. ユーザーがプロファイルAタブに戻ると `setActiveSetId` が `sets` 配列を参照し、古い値で `paramValues` を上書き → 編集消失

---

### 根本原因 3: `setActiveSetId` が新規プリセット未追加状態で空振りする

**ファイル・行**: `useGenerationStore.ts` L1171〜L1187、`useGeneratePageState.ts` L488〜L490

**詳細**:

`createPresetMutation.onSuccess`（L485〜L493）は `invalidateQueries` と同時に `setActiveSetId(newPreset.id)` を呼び出す。しかし、`setActiveSetId`（ストアL1175）は `sets.find(s => String(s.id) === String(id))` で新プリセットを検索するが、この時点では `sets` 配列に新プリセットが含まれていない（同期 `useEffect` がまだ実行されていない）。`targetSet` が `undefined` となるため **即時 return** し、`paramValues` は更新されない（L1176: `if (!targetSet) return`）。

---

## 4. 不具合の分類

| 項目 | 内容 |
|------|------|
| **分類** | **Type A (Implementation Bug)** / 実装不具合 |
| **理由** | 設計仕様（バックエンドを SSoT とし自動保存・永続化する）は正しい。同期ロジックの実装において「同一プリセットがアクティブな場合のバックエンド→ローカル同期の欠如」と「未保存デルタの消失」という実装上のミスが根本原因。 |
| **影響範囲** | フロントエンド: `useGeneratePageState.ts`（主要）、`useGenerationStore.ts`（副次的）|
| **深刻度** | 高（ユーザーデータの消失・上書きが発生する） |

---

## 5. 障害箇所サマリー

```
[useGeneratePageState.ts]
  L873-919  同期 useEffect
    └─ 問題: activeSetId が一致する場合に paramValues を更新しない
    └─ 問題: setSets(mappedSets) が未保存デルタを上書きする

  L461-493  createPresetMutation
    └─ 問題: コピー元の param_values が React Query キャッシュ（古い可能性）から取得される

[useGenerationStore.ts]
  L1171-1187  setActiveSetId
    └─ 問題: sets 配列に対象プリセットがない場合に early return し paramValues が更新されない
```

---

## 6. 推奨する次のステップ

- **分類**: Type A → `/dev-design` へ移行
- **修正方針（参考・実装計画は /dev-design にて策定）**:
  1. 同期 `useEffect` で `setSets(mappedSets)` 後に、アクティブプリセットの `paramValues` を必ずバックエンドデータで上書きするよう修正（`setActiveSetId` 呼び出し条件の緩和、または `paramValues` を直接 sets から読み替える）
  2. コピー操作時は React Query キャッシュではなく現在の Zustand `paramValues` を優先して使用する
  3. `createPresetMutation.onSuccess` での `setActiveSetId` は同期 `useEffect` の `setSets` 完了後に動作するよう順序を考慮する

---

## 付録: 旧インシデントレポート（一括編集機能不具合）

### 1. 検出された現象
- **現象 1 (ボタン無反応)**: 一括編集メニューからプリセットを選択し、「一括編集」ボタンを押してもモーダルが開かず、反応しない。
- **現象 2 (アクティブタブ未適用)**: 一括編集完了後、現在編集中のアクティブなプリセット（開いているタブ）に一括編集の内容が即座に反映されず、リロードするまで古い値が残る。
- **現象 3 (LoRA変更が適用できない)**: 一括編集モーダルのLoRAタブでLoRAを選択して適用しようとしても適用されない（またはLoRA選択ができない）。

### 2. 根本原因（旧）
- **原因 1**: `git checkout` によるロールバックでコード欠損
- **原因 2**: `handleBulkEditApply` 内でアクティブプリセットのローカルステート同期処理が欠如
- **原因 3**: `loras.find(l => l.filename === loraFilename)` の存在しないフィールド参照、および `loras={[]}` の渡し忘れ

### 3. 分類（旧）
- **Type A (Implementation Bug)** — 解決済み
