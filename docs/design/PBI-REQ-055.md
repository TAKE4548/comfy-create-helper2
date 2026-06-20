# REQ-055 設計書: Generateページ マルチセット一括生成機能

## 1. 概要

本変更は、ユーザーが複数のプロンプトやパラメータ（セット）を個別に保持・編集し、それらを一括でキュー投入して生成できる「マルチセット一括生成機能」をデスクトップ向けに提供するためのものである。
既存の単一のパラメータ編集UIと下位互換性を完全に維持しつつ、状態管理ストア（Zustand）にセットの配列を追加し、アクティブなセットとパラメータ状態の同期制御を行う。
また、一括生成の際は非同期的なシーケンシャルキュー処理を行い、一部のセットで生成エラーが発生しても他のセットの生成を継続する仕組みを構築する。

---

## 2. システム設計

### 2-1. データ構造とZustand Storeの拡張設計

Zustandストア（`useGenerationStore.ts`）に、複数のセットを保持する `sets` 配列と、現在アクティブなセットを示す `activeSetId` を追加する。
既存の `paramValues`, `appliedAssets`, `batchSize`, `seedMode`, `seed` は「アクティブセットの値」を指す単一のプロパティとして維持し、値が更新された際に自動的に `sets` 配列内のアクティブセットの値とも同期させる。これにより、既存の入力パネルやコンポーネントのロジックに影響を与えない。

#### データ型定義 (`frontend/src/store/useGenerationStore.ts` に追加)
```typescript
export interface GenerationSet {
  id: string;
  name: string;
  paramValues: Record<string, string>;
  appliedAssets: Record<string, AppliedAsset[]>;
  batchSize: number;
  seedMode: 'random' | 'fixed';
  seed: number;
  checked: boolean; // 一括生成の対象選択状態
}
```

#### 追加されるストア状態とアクション
```typescript
export interface GenerationState {
  // ...既存の状態...
  sets: GenerationSet[]
  activeSetId: string | null

  // ...追加アクション...
  initSets: (workflowId: number) => void
  setActiveSetId: (id: string) => void
  addSet: () => void // 現在のアクティブセットを複製して新規追加
  removeSet: (id: string) => void
  renameSet: (id: string, name: string) => void
  toggleSetChecked: (id: string) => void
  setAllSetsChecked: (checked: boolean) => void
  updateActiveSet: (updates: Partial<Omit<GenerationSet, 'id' | 'name'>>) => void
}
```

### 2-2. 変更対象ファイル

| ファイルパス | 変更種別 | 内容 |
|---|---|---|
| `frontend/src/store/useGenerationStore.ts` | MODIFY | `GenerationSet` 型の追加、および `sets` / `activeSetId` に関連する状態とアクションの実装。`setSelectedWorkflowId` 時にセット状態を `localStorage` からロードする処理、および各セッター実行時に `sets` への同期処理を追加。 |
| `frontend/src/pages/GeneratePage/hooks/useGenerateAction.ts` | MODIFY | 一括生成（シーケンシャルにComfyUIキューへ投入しWebSocketの完了を待機するランナー）と、従来の単セット生成（現在のアクティブセットのみ）の分岐・実行処理を実装。 |
| `frontend/src/pages/GeneratePage.tsx` | MODIFY | プロンプト入力パネルの上部にセットチップタブバーを追加（チェックボックス、アクティブ切替、名称編集、追加/削除、全選択/全解除ボタン）。モバイル時は非表示。サムネイル内の画像バッジ表示（生成元セット名）。 |

---

## 3. 詳細ロジック設計

### 3-1. セットのデータ同期ロジック (Zustand)

`setSelectedWorkflowId(id)` 時に、ワークフロー個別のセット構成 `prompt-surgeon-sets-wf-{id}` が `localStorage` に存在すればロードし、無ければデフォルトの1セット（"Set 1"）を初期化する。

ストアのアクション（`setParamValues`, `setBatchSize` など）が呼び出された際、以下のようにアクティブセットに対して値を反映する：
```typescript
setParamValues: (values) => {
  set({ paramValues: values })
  // アクティブセットへ同期
  const { sets, activeSetId } = get()
  if (activeSetId) {
    const updated = sets.map(s => s.id === activeSetId ? { ...s, paramValues: values } : s)
    set({ sets: updated })
    localStorage.setItem(`${LS_KEYS.SETS_PREFIX}${get().selectedWorkflowId}`, JSON.stringify(updated))
  }
}
```

### 3-2. 一括生成のシーケンシャル制御とエラーハンドリング

一括生成（`Generate Selected Sets`）では、チェックされた全セットに対して順番に生成を完了させながらキューを回す。

#### 制御ロジックの概要 (`useGenerateAction.ts`)
1. 一括生成実行時、現在チェックが入っているセットのリスト（`checkedSets`）を取得。
2. コントロール状態として、生成全体を管理する `isGenerating` フラグをストアに設定。
3. ループ内で各セットについて：
   - そのセットの `paramValues`, `appliedAssets`, `batchSize`, `seedMode`, `seed` に基づいてワークフローJSONのノードへパラメータやシードを注入。
   - `queuePrompt(wfJson)` を呼び出し、`promptId` を取得。
   - ストアが保持する ComfyUI WebSocket イベントを監視し、その `promptId` が `executed` / `execution_complete` / `execution_error` になるまで待機（`Promise` による待機処理）。
   - `execution_error` の場合はエラーログを出力しつつ、例外をキャッチして次のセットの処理へ進む（スキップして継続）。
4. すべての選択セットの処理が終了するか、ユーザーが中断操作を行った時点で全体の生成完了状態とする。

#### WebSocketの完了待機ヘルパー例
```typescript
const waitForPromptCompletion = (targetPromptId: string) => {
  return new Promise<void>((resolve, reject) => {
    // ストアのWebSocketイベント監視またはキューポーリングにより、
    // 対象の promptId が完了・失敗したことを検知して resolve する。
    // ※ WebSocketのonmessageにて、対象の promptId に対する完了イベントを受信したタイミングで通知を受ける
  })
}
```

### 3-3. サムネイル用セットバッジの表示と Snapshot 保存

#### サムネイル内の画像バッジ表示
ComfyUIから生成完了イベント（`executed`）が送られた際、または履歴取得時、成果物となる画像オブジェクトと生成時の `promptId` を紐づける。
また、フロントエンド側で各 `promptId` がどのセット（セット名）から生成されたかを一時的なメモリマップ（`promptIdToSetNameMap`）に記録する。
サムネイル描画時に、画像の `promptId` を解決してセット名が取得できれば、サムネイル上に小さなバッジ（例: `Set 1`）を表示する。

#### Save Snapshotの仕様
スナップショット保存時は従来通り「現在プレビュー表示中の1枚の画像」と「その画像が属するセットの設定値」のみを保存する。一括生成によってパラメータが混ざるのを防ぐため、画像が生成された時点のセットの `paramValues` を正確に保存する。

### 3-4. ローカルストレージ永続化設計

各ワークフロー（`id`）単位でセット情報を保存する。
- **キー名**: `prompt-surgeon-sets-wf-{id}`
- **値**: `GenerationSet[]` の JSON 文字列
- **アクティブセットキー名**: `prompt-surgeon-active-set-wf-{id}`

---

## 4. 懸念点・トレードオフ (Professional Dissent)

1. **並列キューイングとシーケンシャル待機の選択**:
   ComfyUIのキューに全セットを一度にすべて投入してしまうことも可能だが、それを行うと途中で生成をキャンセルした際の制御や、どのセットが現在生成中かというUI進捗（プログレスバー）の同期が難しくなる。フロントエンド側で1セットずつ同期を取りながらシーケンシャルにキュー投入することで、ユーザーフレンドリーな進捗表示とエラー時のスキップを確実に制御できる。よって、フロントエンド主導でのシーケンシャル制御を採用する。
2. **モバイルレイアウトでの制限**:
   仕様書通り、モバイル（`/mobile`）ではマルチセットの編集UIは提供しない。ただし、ストア内部 of データ構造（`sets`）は共通で動作するため、モバイルで生成する際は常に「唯一のアクティブセット（デフォルトで作成された最初のセット）」のみを編集・生成対象とすることで、コードの共通化とシンプル化を両立する。
