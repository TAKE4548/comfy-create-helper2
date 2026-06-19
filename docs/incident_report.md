# インシデントレポート

---

## [解決済み] REQ-047: 生成中にモーダルが再描画されて操作できなくなる問題

*(詳細は省略 — REQ-047 にて修正済み・アーカイブ済み)*

- **Root Cause**: `GeneratePage` 内でネストした `function Modals()` を定義していたため、進捗更新ごとに全モーダルがアンマウント/再マウントされていた。
- **Fix**: ネストを廃止し、モーダルのJSXをインラインで直接展開。

---

## [NEW] REQ-049: 生成キャンセル用モーダルを開くと真っ黒（空）の画面になる問題

### 1. 現象・症状

生成ページの「Queue: N」ボタン（Progress Line 内）をクリックしてジョブ管理モーダル（`JobManagementModal`）を開こうとすると、モーダルが正常に表示されず、画面全体が真っ黒（空白）になる。

### 2. 再現手順

1. 生成ページ (`GeneratePage`) を開く。
2. Progress Line 内の「Queue: N」テキストをクリックする（または生成中に表示されるキャンセルボタンをクリックする）。
3. モーダルが表示される代わりに、画面全体が真っ黒になる。

### 3. 原因究明 (Root Cause Isolation)

#### 3-1. 直接原因：React Rules of Hooks 違反 in `JobManagementModal.tsx`

**該当ファイル**: [`frontend/src/components/JobManagementModal.tsx`](../frontend/src/components/JobManagementModal.tsx) L10–L26

```tsx
// L10: コンポーネント定義開始
export const JobManagementModal: React.FC<JobManagementModalProps> = ({ isOpen, onClose }) => {
  const { ... } = useGenerationStore()  // ← Hook 1（無条件に呼ばれる ✓）

  if (!isOpen) return null             // ← L20: 条件付き早期リターン ⚠️

  const filterJob = ...
  const visibleRunning = useMemo(...)  // ← L25: Hook 2（早期リターン「後」に呼ばれる ✗）
  const visiblePending  = useMemo(...)  // ← L26: Hook 3（早期リターン「後」に呼ばれる ✗）
```

**React の Rules of Hooks**: フック呼び出しは条件分岐や早期リターンより前に配置しなければならない。`useMemo` が `if (!isOpen) return null` の**後**に置かれているため、レンダリングごとのフック呼び出し数が変動する。

| `isOpen` 値 | 呼ばれるフック数 |
|---|---|
| `false` (初期状態) | 1 個（useGenerationStore のみ） |
| `true` (モーダル開く) | 3 個（useGenerationStore + useMemo × 2） |

同一コンポーネントインスタンスで `false → true` と遷移した瞬間、React が検出する：

> **"React has detected a change in the order of Hooks called by JobManagementModal."**

この React エラーがレンダーツリーをクラッシュさせ、Error Boundary がなければアプリ全体が真っ黒になる。

#### 3-2. なぜ REQ-047 以前は発現しなかったか

**REQ-047 以前（REQ-039 〜 REQ-046）**: `GeneratePage` 内に `function Modals()` というネストした関数コンポーネントが定義されていた。

```tsx
// 旧 GeneratePage.tsx（抜粋）
export function GeneratePage() {
  function Modals() {   // ← GeneratePage のレンダリング関数内でネスト定義
    return (
      <>
        ...
        <JobManagementModal isOpen={isJobModalOpen} onClose={...} />
      </>
    )
  }
  return ( ...<Modals />... )
}
```

ネストされた `Modals` は `GeneratePage` が再レンダリングされるたびに「新しい関数参照 = 新しいコンポーネント型」と見なされ、React が `JobManagementModal` を**完全アンマウント → 再マウント**していた。

- 再マウント時には `isJobModalOpen` の現在値（`true`）で初期マウントされる
- 初期マウント時は 3 フック全て呼ばれ、違反は発生しない

**REQ-047 修正後**: ネストした `Modals` を廃止し、`<JobManagementModal>` をインラインに移動した。

```tsx
// 現行 GeneratePage.tsx（REQ-047 適用後）
<JobManagementModal isOpen={isJobModalOpen} onClose={() => setIsJobModalOpen(false)} />
```

`JobManagementModal` は**安定したコンポーネントインスタンス**として保持されるようになった。これにより：

1. ページ初期マウント: `isOpen=false` → フック 1 個のみ実行
2. ユーザーがモーダルを開く: `isOpen=true` → 同一インスタンスで再レンダリング → フック 3 個が必要 → **React エラー発生** → 黒画面

#### 3-3. 因果チェーン

```
[REQ-039] JobManagementModal.tsx に useMemo の hooks 違反を含む実装が導入される
    ↓（潜在バグ）
[REQ-039〜046] ネストした function Modals() が毎回リマウントすることで違反がマスクされる
    ↓（副作用でモーダルが不安定）
[REQ-047] ネストを廃止してモーダルをインライン化（モーダル安定化の正当な修正）
    ↓（マスクが外れる）
[現在] JobManagementModal が安定インスタンスになり、isOpen 遷移時に hooks 違反が顕在化
    → React クラッシュ → 黒画面
```

### 4. 診断チェック (Diagnostic Check)

| 項目 | 値 |
|---|---|
| **Root Cause Isolated** | Yes |
| **Classification** | **Type A: Implementation Bug** |
| **バグ導入コミット** | `4a5da09` (REQ-039: JobManagementModal 新規作成) |
| **発現トリガーコミット** | `3597bf5` (REQ-047: GeneratePage モーダルインライン化) |
| **影響ファイル** | `frontend/src/components/JobManagementModal.tsx` L20, L25–26 |
| **Next Route** | `/dev-design` → `JobManagementModal.tsx` の hooks 順序修正 |

### 5. 修正方針（概要）

`useMemo` フックを早期リターンより**前**に移動する。`filterJob` 関数も `useMemo` の deps に含める形で `useCallback` または依存値を正しく宣言する。

```tsx
// 修正後イメージ（実装計画は /dev-design で策定）
export const JobManagementModal = ({ isOpen, onClose }) => {
  const { queueRunning, queuePending, clientId, filterOwnSession, ... } = useGenerationStore()

  // ← フックをすべて早期リターンより前に移動
  const visibleRunning = useMemo(
    () => queueRunning.filter(job => !filterOwnSession || job[3]?.client_id === clientId),
    [queueRunning, filterOwnSession, clientId]
  )
  const visiblePending = useMemo(
    () => queuePending.filter(job => !filterOwnSession || job[3]?.client_id === clientId),
    [queuePending, filterOwnSession, clientId]
  )

  if (!isOpen) return null  // ← 早期リターンはフックの後
  ...
}
```
