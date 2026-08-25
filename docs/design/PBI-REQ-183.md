# PBI-REQ-183: 生成プリセットのタブ切り替え高速化・多重レンダリング解消

## 1. 概要 (Overview)
本設計は、生成画面（GeneratePage）の Multi-Set Tab Bar において、プリセット（Set）タブをクリックした際に発生している 2〜3 秒の体感遅延・UI フリーズを解消し、**200ms 以内（目標 50ms〜100ms）の瞬時切り替え** を実現するための最適化設計である。

---

## 2. 課題とボトルネックの分析

### 2.1 課題の構造
```
【従来の切り替え時の処理フロー（問題の構造）】
[ユーザーがタブをクリック]
  │
  ├─► handleLoadPreset 実行
  │     ├─ setActiveSetId(id)           ──► Zustand set (レンダリング 1)
  │     ├─ setParamValues(...)          ──► Zustand set (レンダリング 2)
  │     ├─ setAppliedAssets(...)        ──► Zustand set (レンダリング 3)
  │     ├─ setBatchSize(...)            ──► Zustand set (レンダリング 4)
  │     ├─ setSeedMode(...)             ──► Zustand set (レンダリング 5)
  │     ├─ setSeed(...)                 ──► Zustand set (レンダリング 6)
  │     └─ updateActiveSet(...)         ──► Zustand set (レンダリング 7)
  │
  ├─► Presets 同期 useEffect (L853) が activeSetId 変化を検知して発火
  │     ├─ 全プリセットのパラメータ再マッピング (getInitialParams)
  │     └─ setSets(mappedSets)          ──► Zustand set (レンダリング 8)
  │
  ├─► TagChipEditor (各プロンプト欄) の内部同期
  │     ├─ 毎描画時の parseToChips(value) (CPU負荷 & チップID再生成)
  │     ├─ useEffect で setChips(newChips) ──► 子ステート更新 (レンダリング 9)
  │     └─ 次フレーム useEffect で chipsToString(state) !== value を誤判定
  │          └─ onChange(newStr) 発火   ──► 親の setParamValues 逆流 (レンダリング 10)
  │
  └─► メモ化されていない DesktopLayout / ParamPanel / @dnd-kit の多重再描画
        └─ 合計 10 回近い全画面再計算が同期的に走り、2〜3 秒間メインスレッドを占有
```

---

## 3. 最適化アーキテクチャ設計 (Optimization Architecture)

### 3.1 解決策 1: Zustand Store へのアトミックなプリセット切替アクション導入
- `useGenerationStore` に `loadPresetData(preset: WorkflowPreset, defaultParams: Record<string, string>)` を新設。
- 1 回の `set(...)` 呼び出しで以下を同時にアトミック更新する：
  - `activeSetId`
  - `paramValues` (初期値とプリセット値のマージ済みオブジェクト)
  - `appliedAssets`
  - `batchSize`
  - `seedMode`
  - `seed`
  - `sets` 内のアクティブセット情報
  - `localStorage` の active set キー
- これにより、個別 setter による 7 回の Zustand 通知を **1 回** に圧縮する。

### 3.2 解決策 2: Presets 同期 `useEffect` の重複発火・二重同期の抑止
- `useGeneratePageState.ts` の Presets 同期 `useEffect`（L853-959）について：
  - `activeSetId` を依存配列から除外するか、プリセット一覧（`presets` 配列そのものの変更やワークフロー切り替え）時のみ同期処理を行うよう条件分岐を整理。
  - 単なるアクティブタブ切り替えによって `setSets(mappedSets)` が再実行されるループを完全に遮断。

### 3.3 解決策 3: `TagChipEditor` のパース最適化と `onChange` 逆流遮断
- **パース最適化**: `useChipHistory(parseToChips(value))` の初期値計算をメモ化し、毎レンダリングごとの文字列パースを排除。
- **逆流遮断**: 外部からの `value` プロパティ変更（プリセット切り替え時）と、ユーザーによるチップ編集（チップ追加・削除・並び替え）を明確に区別。
  - 外部 `value` 反映時に `prevChipsString.current = value` を同期し、`chipsToString(state) !== value` の微小差異による不要な `onChange` 逆流を完全に防止。

### 3.4 解決策 4: Multi-Set Tab Bar および主要セクションのメモ化
- Multi-Set Tab Bar の各タブアイテムやコンポーネントを `React.memo` 化。
- タブクリック時に変化しないコンポーネント（ヘッダー、モーダル群、プレビュー領域など）への不要な再レンダリング伝播を抑制。

---

## 4. 影響ファイルとスコープ

| ファイルパス | 修正内容 |
|---|---|
| `frontend/src/store/useGenerationStore.ts` | `loadPresetData` アトミックアクションの追加 |
| `frontend/src/pages/GeneratePage/hooks/useGeneratePageState.ts` | `handleLoadPreset` のアトミック化、Presets 同期 `useEffect` の最適化 |
| `frontend/src/components/TagChipEditor/index.tsx` | パース最適化、外部 value 更新時の `onChange` 逆流防止ガード |
| `frontend/src/pages/GeneratePage/components/DesktopLayout.tsx` | タブバー部分のメモ化・再レンダリング最適化 |

---

## 5. 性能・動作目標 (Acceptance Criteria Alignment)

1. **切り替え速度**: 複数プロンプト・多数タグを含むプリセット間を切り替えた際、200ms 以内にアクティブタブ表示および入力値が更新されること（目標 < 50ms）。
2. **自動保存の安定性**: タブ切り替えによって不要な `onChange` や自動保存（`updatePresetMutation`）の誤発火が発生しないこと。
3. **既存機能の完全互換**: パラメータ編集、Undo/Redo、LoRA スタック、パラメータ同期、バッチ生成等の全機能が既存どおり動作すること。

