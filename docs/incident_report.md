# インシデントレポート

**日時**: 2026-09-12  
**報告者**: Incident Analyst  
**対象コンポーネント**: `useGenerateDisplayState.ts`, `App.tsx`  
**分類**: **Type A（実装バグ）**

---

## 1. 症状

- **再現ステップ**: 生成画面（GeneratePage）でブラウザをリロードする。
- **期待値**: 過去のComfyUI生成履歴が即座にギャラリー/ストリップに表示される。
- **実際の挙動**:
  1. リロード直後 → ギャラリーが空（履歴が見えない）。
  2. 新しい生成ジョブを実行し、画像が生成・完了した瞬間 → 過去分も含めて画像が一気に表示される。

---

## 2. ログエビデンス

### エラー①（2026-09-12T00:07:41）
```
ReferenceError: useRef is not defined
  at useGenerateDisplayState (useGenerateDisplayState.ts?t=1789139261186:104:30)
```
> （過去バージョンでの `useRef` 未定義エラーの痕跡）

### エラー②（2026-09-12T02:33:28）
```
Error: Should have a queue. This is likely a bug in React.
  at updateReducer → updateState → useState → useQuery
  at useGenerateDisplayState (useGenerateDisplayState.ts?t=1789148008663:39:47)
```
> React フックの呼び出し順・レンダリング整合性破壊によるエラーの痕跡。

---

## 3. 根本原因分析

### 関連ファイル
| ファイル | 役割 |
|---|---|
| [`useGenerateDisplayState.ts`](frontend/src/pages/GeneratePage/hooks/useGenerateDisplayState.ts) | `displayImages` の計算・同期・キャッシュ管理 |
| [`jobQueueSlice.ts`](frontend/src/store/slices/jobQueueSlice.ts) | `fetchHistory()` の実装（`comfyHistoryImages` を取得・更新） |
| [`App.tsx`](frontend/src/App.tsx) | `PersistQueryClientProvider` による React Query キャッシュ永続化 |

---

### バグ A: `useEffect` によるマウント時のキャッシュ破壊・初期化消去

**該当箇所**: [`useGenerateDisplayState.ts` L67-L81](frontend/src/pages/GeneratePage/hooks/useGenerateDisplayState.ts#L67-L81)

```ts
useEffect(() => {
  queryClient.setQueryData<string[]>(
    ['generateDisplayImages', { filterOwnSession: !!filterOwnSession }],
    (old) => {
      if (rawImages.length === 0) return []  // ← ★問題行
      ...
    }
  )
}, [rawImages, filterOwnSession, queryClient])
```

- `App.tsx` では `PersistQueryClientProvider` がローカルストレージから `generateDisplayImages` を復元する設定になっています。
- しかし、リロード直後の初期化時、Zustand の `comfyHistoryImages` は空配列 `[]`（`rawImages.length === 0`）です。
- この `useEffect` が初回マウント時に発火し、`return []` を実行することで、**復元されたキャッシュまたは既存データを即座に空配列 `[]` で上書き消去**してしまいます。

---

### バグ B: `history-fetched` イベント時の `invalidateQueries` による競合（Race Condition）

**該当箇所**: [`useGenerateDisplayState.ts` L118-L120](frontend/src/pages/GeneratePage/hooks/useGenerateDisplayState.ts#L118-L120)

```ts
} else if (customEvent.detail?.type === 'history-fetched') {
  queryClient.invalidateQueries({ queryKey: ['generateDisplayImages'] })
}
```

1. リロード後、`jobQueueSlice.ts:242` の `fetchHistory()` が非同期完了し、Zustand に `comfyHistoryImages` をセットします。
2. 同時に `comfy-job-event` (`history-fetched`) が発火され、`queryClient.invalidateQueries` が呼ばれます。
3. `invalidateQueries` がリフェッチをトリガーしますが、`useQuery` に渡されている `queryFn: () => rawImages` はレンダリングサイクルのタイミング次第で古いクロージャ（`rawImages = []`）をキャプチャしている場合があり、再度 `[]` をキャッシュに格納してしまいます。
4. この結果、リロード後にいくら `fetchHistory()` が完了しても、画面上は履歴が空のまま維持されます。

---

### バグ C: 新規ジョブ完了時に一気に表示されるメカニズム

**該当箇所**: [`useGenerateDisplayState.ts` L88](frontend/src/pages/GeneratePage/hooks/useGenerateDisplayState.ts#L88)

```ts
queryClient.setQueryData<string[]>(
  ['generateDisplayImages', { filterOwnSession: false }],
  (old = comfyHistoryImages) => {   // ← old が undefined の場合 comfyHistoryImages を使用
    return [imageUrl, ...(old || []).filter((x) => x !== imageUrl)].slice(0, 200)
  }
)
```

1. リロード後、キャッシュが正常に表示されない状態が続きます。
2. ユーザーが新規ジョブを投入し、ComfyUI で画像生成が完了して `executed` イベントが届きます。
3. `executed` ハンドラ内の `addHistoryImage` は `invalidateQueries` を使わず、直接 `setQueryData` でキャッシュを更新します。
4. この際、バックグラウンドの `fetchHistory()` で既に Zustand ストアに蓄積されていた `comfyHistoryImages` の全履歴が `addHistoryImage` やストアの再同期によって一気にギャラリーキャッシュへ反映されます。
5. このため、ユーザーから見ると「ジョブ完了時に過去の履歴が一気にドバッと表示される」という挙動になります。

---

## 4. 診断チェック

| 項目 | 判定結果 |
|---|---|
| **Root_Cause_Isolated** | **Yes** |
| **Classification** | **Type A: Implementation Bug** |
| **影響スコープ** | フロントエンド（`useGenerateDisplayState.ts`） |
| **禁止事項遵守** | コード修正・実装計画の提案は未実施（Read-Only 診断完了） |

---

## 5. 次のアクション

原因の特定が完了しました。次のステップを選択してください。

- **YES**: `/dev-design` へ進み、修正設計および実装タスクを作成する
- **NO**: 調査を継続する、または別の対応を行う
