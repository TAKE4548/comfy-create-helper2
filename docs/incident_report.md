# インシデントレポート: 生成中にスナップショット保存や生成キャンセルのモーダルが表示され、操作できなくなる問題

## 1. 現象・症状
画像生成処理（Generating）の進行中（progress値が順次更新されている状態）に、スナップショット保存モーダル（`AddSnapshotToAlbumModal`）や、その他のモーダル（JobManagementModal、LoRA設定等）を開くと、進捗率（progress）が更新されて画面が再レンダリングされるたびに、モーダルがアンマウント・再マウントされ、フォーカスが外れたり入力内容がリセットされたりして、正常に操作できない。

## 2. 再現手順
1. 生成ページにて画像生成（Generate Batch）を実行し、生成処理を開始する。
2. 生成進行中に「Save Snapshot」ボタンを押してスナップショット保存モーダルを開く。
3. または、ジョブ管理モーダル（生成キャンセル等の操作を含む）を開く。
4. WebSocket経由で進捗（`progress.percentage` 等）が更新され、背後の生成進捗表示が更新されるタイミングで、モーダルの入力欄やボタンのフォーカスが失われたり、アニメーションが再実行されてまともに操作できなくなる現象が発生する。

## 3. 原因究明 (Root Cause Isolation)
原因は、フロントエンドのページコンポーネント `GeneratePage.tsx` 内で、モーダル群をまとめる子コンポーネント `Modals` が **`GeneratePage` のレンダリング関数内でネストして定義されていること** です。

- **該当箇所**: [GeneratePage.tsx](../frontend/src/pages/GeneratePage.tsx#L1032-L1112)
  ```tsx
  export function GeneratePage() {
    ...
    function Modals() {
      return (
        <>
          {rescanOpen && workflow && ( ... )}
          ...
        </>
      )
    }
    ...
  }
  ```

- **詳細原因**:
  - Reactでは、親コンポーネントのレンダリング関数内で別の子コンポーネントを定義すると、親が再レンダリングされるたびに子コンポーネントの「関数オブジェクト（Component Type）」が新しく再生成されます。
  - Reactの差分検知（Reconciliation）アルゴリズムは、コンポーネントの型が変わったと判定するため、進捗更新(`progress`)等で `GeneratePage` が再レンダリングされるたびに `<Modals />` 配下の全コンポーネントツリーを一旦完全にアンマウントし、新しいコンポーネントとしてマウントし直します。
  - これにより、モーダルの内部状態やフォーカス、DOMノードそのものが毎秒のように破壊・再構築され、操作不能になります。

## 4. 対策方針 (Proposed Solution)
本インシデントは **Type A (Implementation Bug: 実装バグ)** に分類されます。

- **修正の方針**:
  - ネストした `function Modals` 定義を廃止し、`GeneratePage` のメインのJSXリターン内に直接モーダルのJSXをインラインで展開するか、あるいは `Modals` コンポーネントを `GeneratePage` の外（ファイルレベルまたは別ファイル）に切り出し、必要なprops（状態およびセッターなど）を明示的に渡すように変更します。
  - 今回は `GeneratePage` の状態変数が多いため、`Modals` 関数コンポーネントの定義を削除し、JSX自体をインラインで直接レンダリングする（あるいはコンポーネント化せず単純なヘルパー関数 or インライン評価にする）ことで、コンポーネントのアンマウント・再マウントを防ぎ、既存のDOMノードが再利用されるようにします。

---

## 5. 診断チェック (Diagnostic Check)
- **Root Cause Isolated**: Yes
- **Classification**: Type A (Implementation Bug)
- **Route**: `/dev-design` へ進み、フロントエンドの `GeneratePage.tsx` における `Modals` レンダリングのインライン化または外だし設計を行います。
