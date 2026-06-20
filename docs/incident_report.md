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

---

## [NEW] REQ-053: 全画面表示で真っ黒の画面になる問題およびモバイル表示時のオーバーレイ問題

### 1. 現象・症状
1. 履歴画像などをクリックして全画面表示（拡大プレビュー）にした際、画面が真っ黒になり画像が表示されず、閉じるボタンなどの操作も受け付けないためリロードしないと戻らない。
2. モバイルなどのレスポンシブ表示でサイドバーが下のメニューバー（ボトムナビゲーション）になった際、メインコンテンツの下部がメニューバーの背後に潜り込み、操作できない領域が発生する。

### 2. 再現手順

#### 不具合1 (全画面表示のクラッシュ)
1. 生成ページ (`GeneratePage`) または履歴ページ (`HistoryPage`) で、スナップショット画像をクリックして `HistoryModalPreview` モーダル（全画面プレビュー）を開く。
2. 画面が真っ黒になり、画像が表示されない。右上のクローズボタンや背景クリックによるクローズも反応せず、ブラウザのリロードが必要となる。

#### 不具合2 (レスポンシブ時の下部オーバーレイ)
1. ブラウザのウィンドウ幅を縮小し、モバイル表示（幅 `1024px` 未満）にする。
2. サイドバーが消え、下部にボトムナビゲーションバーが表示される。
3. ページの最下部にあるスクロール領域やボタン等のコンテンツが、ボトムナビゲーションバーの下に重なり、操作できなくなる。

### 3. 原因究明 (Root Cause Isolation)

#### 3-1. 不具合1の直接原因：`HistoryModalPreview.tsx` での Temporal Dead Zone (TDZ) 参照エラー
**該当ファイル**: [`frontend/src/components/HistoryModalPreview.tsx`](../frontend/src/components/HistoryModalPreview.tsx#L100-L110)

```tsx
  const getParamValue = (keys: string[], excludeKeys: string[] = []): string => {
    if (!snapshot?.params) return ''
    const matchKey = Object.keys(snapshot.params).find((key) => {
      const k = key.toLowerCase()
      const matchesInclude = keys.some((target) => k.includes(target.toLowerCase()))
      const matchesExclude = excludeKeys.some((target) => k.includes(target.toLowerCase()))
      return matchKey ? String(snapshot.params[matchKey]) : '' // ⚠️ 未初期化の matchKey を find() コールバック内で参照している
    })
    return matchKey ? String(snapshot.params[matchKey]) : ''
  }
```

- **エラーのメカニズム**: `const matchKey = Object.keys(...).find(...)` の右辺の評価中に、そのコールバック関数の中で `matchKey` 変数自身を参照しています。JavaScript (TypeScript) の仕様上、`const` で宣言された変数は代入が完了するまで **Temporal Dead Zone (TDZ)** にあるため、未初期化の状態で参照すると `ReferenceError: Cannot access 'matchKey' before initialization` がスローされます。
- **影響**: この `ReferenceError` は React のレンダリング中に発生するため、React のレンダーツリー全体がクラッシュし、イベントハンドラー（`onClose` など）が一切動作しないフリーズ状態（真っ黒なプレビュー画面が残った状態）になります。

#### 3-2. 不具合2の直接原因：`AppShell.tsx` でのモバイル用ボトムパディングの欠如
**該当ファイル**: [`frontend/src/components/layout/AppShell.tsx`](../frontend/src/components/layout/AppShell.tsx#L110-L138)

- **レイアウト構造の欠陥**: モバイル用ボトムナビゲーションは `fixed bottom-0 z-50` で画面最下部に固定配置されていますが、メインコンテンツ領域である `main` 要素 (`className="flex-1 flex flex-col min-w-0 overflow-hidden"`) や、各ページコンポーネントに対して、ボトムナビゲーションの高さ（約 `64px` 分）を考慮した下部パディング（例: `pb-16 lg:pb-0` や `pb-[calc(64px+env(safe-area-inset-bottom))]`）が設定されていません。
- **影響**: このため、メインコンテンツがボトムナビゲーションの裏側に回り込んで表示され、下部にあるボタンやフォームが操作不可になります。

### 4. 診断チェック (Diagnostic Check)

| 項目 | 値 |
|---|---|
| **Root Cause Isolated** | Yes |
| **Classification** | **Type A: Implementation Bug** (実装バグ) |
| **影響ファイル** | [`HistoryModalPreview.tsx`](../frontend/src/components/HistoryModalPreview.tsx#L102-L107) L102-L107<br>[`AppShell.tsx`](../frontend/src/components/layout/AppShell.tsx#L110) L110 |
| **Next Route** | `/dev-design` |

### 5. 修正方針（概要）
1. **`HistoryModalPreview.tsx`**: `find` コールバック内での `matchKey` の誤った再帰参照を修正し、正しくマッチング条件（boolean）を返すように変更します。
2. **`AppShell.tsx`**: モバイル表示時にメインコンテンツ領域の下部にナビゲーションバーの高さ分（および `safe-area-inset-bottom`）のパディングを確保します。

```

---

## [NEW] REQ-054: 全画面表示で真っ黒の画面になる問題（再発）

### 1. 現象・症状

履歴画像や生成プレビューをクリックして `HistoryModalPreview` を開くと、画面が真っ黒になり操作不能になる。右上の閉じるボタン（×）および背景クリックも反応しない。ブラウザのリロードが必要。

### 2. 再現手順

1. 生成ページ (`GeneratePage`) または履歴ページ (`HistoryPage`) を開く。
2. 画像サムネイルをクリックして全画面プレビュー（`HistoryModalPreview`）を開く。
3. 画面が真っ黒になり、操作が一切受け付けられない。

### 3. 原因究明 (Root Cause Isolation)

#### 3-1. 直接原因：`useMemo` フックが条件付き早期リターンより後に配置（React Rules of Hooks 違反）

**該当ファイル**: [`frontend/src/components/HistoryModalPreview.tsx`](../frontend/src/components/HistoryModalPreview.tsx)

| 行 | 内容 |
|---|---|
| **L71** | `if (!isOpen \|\| images.length === 0) return null` ← **早期リターン** |
| L100–116 | `getParamValue` 関数定義（通常関数。フックではないため問題なし）|
| **L117** | `const loraStacks = useMemo(...)` ← **フック呼び出し（早期リターンより後）⚠️** |

React の Rules of Hooks により、フックは条件分岐や早期リターンより前に配置しなければならない。

**レンダリングごとのフック数の変動**:

| `isOpen` | `images.length` | 呼ばれるフック数 |
|---|---|---|
| `false` | any | 7個（`useMemo` は実行されない）|
| `true` | `0` | 7個（`useMemo` は実行されない）|
| `true` | `> 0` | **8個**（`useMemo` が実行される）|

同一インスタンスで `false → true` に遷移した瞬間、React がフック呼び出し順の変動を検出し、レンダーツリー全体がクラッシュ → Error Boundary なし → 真っ黒画面。

#### 3-2. なぜ REQ-053 で解決されなかったか

| PBI | 内容 |
|---|---|
| **REQ-052** | LoraStack 対応追加。`useMemo(loraStacks)` を `HistoryModalPreview.tsx` に追加したが、早期リターン（L71）の**後**に配置してしまった |
| **REQ-053** | TDZ バグ（`matchKey` 自己参照）を修正。`useMemo` の位置問題は検出・修正されなかった |
| **現在** | `useMemo` の位置違反が残存 → 黒画面が再発 |

### 4. 診断チェック (Diagnostic Check)

| 項目 | 値 |
|---|---|
| **Root Cause Isolated** | Yes |
| **Classification** | **Type A: Implementation Bug** |
| **影響ファイル** | [`HistoryModalPreview.tsx`](../frontend/src/components/HistoryModalPreview.tsx) L71, L117 |
| **バグ導入** | REQ-052（`loraStacks` useMemo 追加時） |
| **未検出原因** | REQ-053 の修正スコープが TDZ バグのみに限定されていた |
| **Next Route** | `/dev-design` |

### 5. 修正方針（概要）

`HistoryModalPreview.tsx` の `loraStacks = useMemo(...)` をL71の早期リターンより**前**（既存の `useEffect` などと同列）に移動する。`useMemo` の依存値（`snapshot?.params`, `loras`）はモーダルが閉じていても安全に評価できるため、早期リターン前への移動で副作用はない。

