# REQ-040: 生成履歴とスナップショットの並び替え機能 設計書

本機能は、生成履歴およびスナップショット一覧におけるソート順（新しい順・古い順）の切り替え機能を追加し、ユーザーが任意の並び順で履歴やスナップショットを確認できるようにするものです。

---

## 1. フロントエンド設計

### 1-1. GeneratePage.tsx (生成ページ)
*   **状態追加**:
    *   `sortOrder`: `'desc' | 'asc'` (デフォルト `'desc'`)
*   **ソート処理**:
    *   **履歴 (History)**: `displayImages` を `sortOrder` に基づいてソート（`'desc'` の場合はそのまま、`'asc'` の場合は反転（`.reverse()`））した `sortedDisplayImages` を作成します。
    *   **スナップショット (Snapshots)**: `snapshots` を `sortOrder` に基づいて `created_at` 基準でソート（`'desc'` の場合は降順、`'asc'` の場合は昇順）した `sortedSnapshots` を作成します。
    *   `snapshotIdsForDisplay` のマッピング処理も `sortedDisplayImages` をベースに計算するように変更します。
*   **UI変更 (Desktop & Mobile)**:
    *   サムネイルストリップのタブヘッダー右側に、セグメントコントロール（ボタングループ）を設置します。
    *   「新しい順」「古い順」のテキスト付きボタンを設置し、現在選択されている方を `bg-surface-2 text-zinc-200` 等でアクティブ表示し、非選択を `text-zinc-550 hover:text-zinc-350` などで非アクティブ表示します。

### 1-2. HistoryPage.tsx (スナップショット一覧ページ)
*   **状態追加**:
    *   `sortOrder`: `'desc' | 'asc'` (デフォルト `'desc'`)
*   **ソート処理**:
    *   `snapshots` を `sortOrder` に基づいて `created_at` 基準でソートした `sortedSnapshots` を作成します。
    *   ライトボックス（`lightboxImages`, `lightboxSnapshotIds`）の参照先を `sortedSnapshots` に変更します。
*   **UI変更**:
    *   「すべてのワークフロー」選択フィルターの右側に、セグメントコントロール（新しい順 / 古い順）を設置します。
    *   現在選択されているソート順をハイライトします。

---

## 2. 開発タスク分解 (Atomicity Audit)

### タスク1: GeneratePage.tsx の並び替え対応 [REQ-040-T1]
*   **対象ファイル**:
    1. [frontend/src/pages/GeneratePage.tsx](../frontend/src/pages/GeneratePage.tsx)
*   **内容**: `sortOrder` 状態の導入、履歴・スナップショットのソート処理追加、PC・モバイル双方へのソートボタン設置。

### タスク2: HistoryPage.tsx の並び替え対応 [REQ-040-T2]
*   **対象ファイル**:
    1. [frontend/src/pages/HistoryPage.tsx](../frontend/src/pages/HistoryPage.tsx)
*   **内容**: `sortOrder` 状態の導入、スナップショット一覧のソート処理追加、ソートボタン設置、ライトボックスとの連動。

---

## 3. Trade-off Disclosure (トレードオフとリスク)
*   **フロントエンドソートの採用**:
    *   バックエンド API 側でソートパラメータを追加する代わりに、フロントエンドで全件取得されたデータをソートする設計とします。
    *   これにより backend への余計な API 負荷を避け、クライアント側での高速な切り替え表示を実現します。現在のデータ量（最大数十〜数百件程度）であればメモリ上のソートでパフォーマンス影響は無視できます。
