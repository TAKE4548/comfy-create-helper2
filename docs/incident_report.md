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

---

## [NEW] REQ-059: 生成完了後に履歴画像からのプレビュー切り替え機能が動作しなくなる問題

### 1. 現象・症状

生成を1枚完了するたびに、プレビューは最新の画像に更新されるが、その後履歴のサムネイルを選択してもメインプレビューが選択した画像に切り替わらなくなる。ページをリロードすると一時的に動作が復元するが、再度生成を行うと再発する。

### 2. 再現手順

1. 生成ページ (`GeneratePage`) を開く。
2. 画像生成を実行し、完了させる（プレビューが生成画像に更新される）。
3. 画面下部または履歴一覧から、過去に生成した画像（サムネイル）をクリックして選択する。
4. メインプレビュー画像が切り替わらず、直前に生成された画像のままになる。
5. ページをリロードすると、選択していた画像がメインプレビューに正しく表示され、切り替えも可能になるが、再度生成を行うと再び切り替えできなくなる。

### 3. 原因究明 (Root Cause Isolation)

#### 3-1. 直接原因：`previewImage` と `selectedImg` の状態優先度および `setSelectedImg` 時のクリア漏れ

**該当ファイル**:
- [`frontend/src/store/useGenerationStore.ts`](../frontend/src/store/useGenerationStore.ts#L676-L683) L676–683 (`setSelectedImg` アクション)
- [`frontend/src/pages/GeneratePage.tsx`](../frontend/src/pages/GeneratePage.tsx#L962-L964) L962–964, L1472–1474 (メインプレビュー描画部分)

`GeneratePage.tsx` のメインプレビュー描画部分では、表示する画像ソースとして以下のように `previewImage || selectedImg` を指定しています。

```tsx
// GeneratePage.tsx (L962-L964)
{(previewImage || selectedImg) ? (
  <div className="relative w-full h-full flex items-center justify-center cursor-pointer" onClick={handleOpenModalPreview}>
    <img src={previewImage || selectedImg!} alt="Generated" className="w-full h-full object-contain" />
```

- **状態の挙動**:
  - 画像生成完了時（`useGenerationStore.ts` の `executed` イベントハンドラ内）、`previewImage` に生成された画像のURL (`firstUrl`) が代入されます。
  - ユーザーが履歴から別の画像を選択すると、`setSelectedImg(img)` が呼び出され、`selectedImg` の状態は選択された画像のURLに更新されます。
  - しかし、`setSelectedImg` 内では `previewImage` を `null` にクリアする処理が行われていません。
  - その結果、`previewImage` に値（直前の生成画像URL）が残ったままとなるため、`previewImage || selectedImg` の評価値は常に `previewImage` が優先され、画面上のメインプレビュー画像が切り替わなくなります。
- **リロードで直る理由**:
  - ページをリロードすると、React Store の状態が初期化され、`previewImage` は初期値の `null` に戻ります。
  - 一方、`selectedImg` は `localStorage` から復元されるため、リロード直後は `previewImage (null) || selectedImg` となり、正しく `selectedImg` が表示され、履歴切り替えも機能するようになります。

### 4. 診断チェック (Diagnostic Check)

| 項目 | 値 |
|---|---|
| **Root Cause Isolated** | Yes |
| **Classification** | **Type A: Implementation Bug** (実装バグ) |
| **影響ファイル** | [`useGenerationStore.ts`](../frontend/src/store/useGenerationStore.ts) L676-683 |
| **Next Route** | `/dev-design` (実装設計へ移行) |

### 5. 修正方針（概要）

`useGenerationStore.ts` の `setSelectedImg` アクションにおいて、`selectedImg` を更新すると同時に `previewImage` を `null` にクリアするように修正します。これにより、ユーザーが手動で履歴画像を選択した際にプレビュー用の古い一時状態が破棄され、選択した画像が優先してメインプレビューに表示されるようになります。

---

## [NEW] REQ-062 (不具合修正): LoRA管理・タグセット管理でドラッグ＆ドロップの導入によりカードのクリック・タップ操作が機能しなくなる問題

### 1. 現象・症状

LoRA管理画面（`LoRAsPage.tsx`）およびタグセット管理画面（`TagsPage.tsx`）において、ドラッグ＆ドロップ（D&D）によるカード移動を有効化した後、カードのクリックやタップによる詳細表示（`LoraDetailModal` / `TagSetDetailModal`）、および編集・削除ボタンの操作が機能しなくなっている（クリックイベントがD&Dのドラッグ開始イベントに吸い取られてしまう）。

### 2. 再現手順

1. LoRA管理画面またはタグセット管理画面を開く。
2. 任意のカードをクリックする。
3. 詳細モーダルが表示されず、編集ボタンや削除ボタンをクリックしても反応しない。

### 3. 原因究明 (Root Cause Isolation)

#### 3-1. 直接原因：ドラッグイベントのしきい値（`activationConstraint`）未設定によるイベント排他

**該当ファイル**:
- [`frontend/src/pages/LoRAsPage.tsx`](../frontend/src/pages/LoRAsPage.tsx)
- [`frontend/src/pages/TagsPage.tsx`](../frontend/src/pages/TagsPage.tsx)

両画面では `@dnd-kit/core` および `@dnd-kit/sortable` を利用してD&D移動を実装しています。
しかし、`DndContext` に対して `sensors` の設定（特にマウスやタッチイベントに対するドラッグ開始までの最小移動距離 `distance` や長押し時間 `delay` などのしきい値）が定義されていません。

`@dnd-kit` のデフォルトの挙動では、`listeners` がバインドされた要素を押下した瞬間に即座にドラッグ状態へと移行します。このとき、ドラッグイベントの開始によってクリックイベント（`click`）がキャンセルされ、下位要素の `onClick` やボタンの操作イベントが一切発火しなくなっていました。

（`HistoryPage.tsx` では既に `MouseSensor` の `distance: 8` および `TouchSensor` の `delay: 500, tolerance: 5` が設定されており、クリックとドラッグが適切に判別されています。）

### 4. 診断チェック (Diagnostic Check)

| 項目 | 値 |
|---|---|
| **Root Cause Isolated** | Yes |
| **Classification** | **Type A: Implementation Bug** (実装バグ) |
| **影響ファイル** | [`LoRAsPage.tsx`](../frontend/src/pages/LoRAsPage.tsx), [`TagsPage.tsx`](../frontend/src/pages/TagsPage.tsx) |
| **Next Route** | `/dev-design` (実装設計へ移行) |

### 5. 修正方針（概要）

1. `LoRAsPage.tsx` および `TagsPage.tsx` に `@dnd-kit/core` から `useSensors`, `useSensor`, `MouseSensor`, `TouchSensor` をインポートします。
2. 両コンポーネント内に以下のようなセンサー設定を定義します。
   ```typescript
   const sensors = useSensors(
     useSensor(MouseSensor, {
       activationConstraint: {
         distance: 8 // クリックとドラッグを識別するためのしきい値
       }
     }),
     useSensor(TouchSensor, {
       activationConstraint: {
         delay: 250, // モバイル環境での誤作動防止とタップ判別のための長押し時間
   ```
 3. 各ページの `<DndContext>` に `sensors={sensors}` を設定します。

---

## [NEW] REQ-060 (不具合修正): マッピング確認UIにおいて検出された候補のドロップダウンが表示されず直接入力しかできない問題

### 1. 現象・症状
ワークフローのアップロードモーダル（`UploadWorkflowModal`）および再スキャンモーダル（`RescanModal`）において、マッピングマスタの項目毎の入力欄が表示された際、自動検出された候補のドロップダウン（datalist）が表示されず、ノードIDを直接キーボード入力するしかできない状態になっている。

### 2. 再現手順
1. 新規ワークフロー（複数候補が存在するようなノードを含むJSON）をアップロードする。
2. もしくは、既存のワークフローに対して「再スキャン」ボタンをクリックして再スキャンモーダルを開く。
3. 各役割の「候補から選択または直接入力…」というプレースホルダーが表示された入力欄をクリックまたはダブルクリックしても、候補ノードIDのドロップダウンが表示されない。

### 3. 原因究明 (Root Cause Isolation)

#### 3-1. 直接原因：`useMasterMappingRows.ts` での条件分岐の不備（警告情報の隠蔽）
**該当ファイル**: [`frontend/src/hooks/useMasterMappingRows.ts`](../frontend/src/hooks/useMasterMappingRows.ts#L31-L40)

`useMasterMappingRows` の `buildRows` 内で、スキャン結果の `matched` （マッチ成功）と `warnings` （複数候補などの警告）のマッピングを行っています：

```typescript
    const matchedMap = new Map(scanResult.matched.map(m => [m.master_id, m]))
    const warningMap = new Map(scanResult.warnings.map(w => [w.master_id, w]))

    ...

    for (const master of masters) {
      const matched = matchedMap.get(master.id)
      const warning = warningMap.get(master.id)

      if (matched) { // ⚠️ ここが問題
        // ok マッチ
        mainRows.push({
          master,
          node_id: rowState[master.id] ?? matched.node_id,
          candidates: [], // ⚠️ 常に空配列がセットされる
          status: 'ok',
          node_title: matched.node_title,
        })
      } else if (warning) {
        // ... (warning 側の処理)
      }
```

- **挙動の分析**:
  - バックエンドのスキャンロジック（`workflow_scanner.py`）では、同一の役割に対して複数候補が存在する（`duplicated`）場合、1つ目のノードを `matched` （`status: "ok"`）に追加しつつ、同時に `warnings` にも `status: "duplicated"`、`node_ids`（全候補リスト）を含めて追加します。
  - しかし、フロントエンドの `useMasterMappingRows.ts` では、`if (matched)` の分岐が優先されているため、`matched` と `warning` の両方が存在する（`duplicated` の）役割において、`if (matched)` ブランチに入って処理されてしまいます。
  - その結果、`warning`（複数候補）のブランチである `else if (warning)` の処理がスキップされ、`candidates` は空配列 (`[]`)、`status` は `"ok"` としてリストに積まれてしまいます。
  - これにより、フロントエンドの入力欄 (`input list="..."`) に紐づく `<datalist>` の中身が空になり、ドロップダウンが一切表示されなくなっていました。

### 4. 診断チェック (Diagnostic Check)

| 項目 | 値 |
|---|---|
| **Root Cause Isolated** | Yes |
| **Classification** | **Type A: Implementation Bug** (実装バグ) |
| **影響ファイル** | [`useMasterMappingRows.ts`](../frontend/src/hooks/useMasterMappingRows.ts#L31-L64) |
| **Next Route** | `/dev-design` |

### 5. 修正方針（概要）
`useMasterMappingRows.ts` の `buildRows` において、`matched` の有無に関わらず `warning` (特に `duplicated` などの複数候補) が存在する場合は、その警告情報（`node_ids`）を `candidates` として正しく抽出し、表示ステータスも `warning.status`（`duplicated` など）を優先するように条件判定フローを整理します。
具体的には、`warning`（警告）が存在する場合は先に警告として処理するか、または `matched` 処理の中で `warning` の情報（候補リストなど）をブレンドしてマージするように変更します。また、1:1マッチングの場合でも、ドロップダウンの選択肢にそのノードID自体を候補として含めるようにします。

---

## [NEW] REQ-065: 複数選択後のアクション（並び替え・一括編集・マッピングマスタ並び替え）が機能しない問題

### 1. 現象・症状
1. **並び替えグループ移動の挙動不審**: LoRAやTagセットページにおいて、複数選択（マルチセレクト）した状態でカードをドラッグ＆ドロップすると、ドロップ先によっては選択中の全カードがリストの最前面（インデックス 0）に勝手に移動してしまったり、挿入位置がずれたりする。
2. **一括編集が反映されない**: 一括編集モーダルからカテゴリや数値を変更して適用ボタンを押しても、変更内容が保存されず画面に反映されない。
3. **マッピングマスタの並び替えが不可**: マッピングマスタ管理（SettingsPage）において、複数選択モードに切り替えると、並び替えのドラッグ用グリップアイコンが消えてチェックボックスになり、ドラッグ自体が不可能になる。

### 2. 再現手順

#### 不具合1 (LoRA / Tagセットの並び替えのバグ)
1. LoRAページまたはTagセットページを開く。
2. カードを長押し、またはチェックボックスをクリックして複数枚選択する（例: ID 3 と ID 4）。
3. 選択したカードのいずれか（例: ID 3）をドラッグして、同じく選択中である他のカード（例: ID 4）の上にドロップする。
4. 選択されたカード群全体がリストの先頭（1番目）に移動してしまう。

#### 不具合2 (一括編集の反映バグ)
1. 複数選択モードでいくつかのアイテムを選択し、「一括編集」をクリックする。
2. カテゴリを別のカテゴリに変更し、「適用する」をクリックする。
3. ローディング表示後、モーダルは閉じるが、アイテムのカテゴリは更新されず元の状態のままになる。

#### 不具合3 (マッピングマスタの並び替え制限バグ)
1. 設定ページ (`SettingsPage`) を開く。
2. マッピングマスタの行を長押しまたはCtrlキー等で複数選択モードにする。
3. ドラッグ用のグリップアイコン (`GripVertical`) がチェックボックスに置き換わり、各行の並び替えアクションが不可能になる。

### 3. 原因究明 (Root Cause Isolation)

#### 3-1. 不具合1の直接原因：`handleDragEnd` 内のインデックス判定の不備
**該当ファイル**: 
- [`LoRAsPage.tsx`](frontend/src/pages/LoRAsPage.tsx#L215-L223)
- [`TagsPage.tsx`](frontend/src/pages/TagsPage.tsx#L196-L203)

```typescript
    if (isMultiSelectMode && selectedIds.has(active.id as number) && selectedIds.size > 1) {
      // グループ移動
      const selected = items.filter(i => selectedIds.has(i.id))
      const nonSelected = items.filter(i => !selectedIds.has(i.id))
      const insertAt = nonSelected.findIndex(i => i.id === over.id) + 1  // ⚠️ over.id が選択中の場合 -1 + 1 = 0 になる
      const newOrder = [...nonSelected.slice(0, insertAt), ...selected, ...nonSelected.slice(insertAt)]
```

- **エラーのメカニズム**:
  - ドロップ先 `over.id` が同じく選択中のアイテムである場合、`over.id` は `nonSelected` 配列に含まれていません。
  - そのため、`nonSelected.findIndex(...)` は `-1` を返し、`insertAt` は `-1 + 1 = 0` となります。結果として、選択されたグループ全体がリストの先頭（インデックス 0）に強制的に移動します。
  - また、上方向への移動時と下方向への移動時で、挿入位置のオフセット（常に `+ 1`）が統一されているため、移動方向によって直感的ではない位置へ挿入される問題が生じています。

#### 3-2. 不具合2の直接原因：一括編集APIリクエストのスキーマ不一致
**該当ファイル**:
- [`LoRAsPage.tsx`](frontend/src/pages/LoRAsPage.tsx#L163-L174)
- [`TagsPage.tsx`](frontend/src/pages/TagsPage.tsx#L148-L159)
- [`SettingsPage.tsx`](frontend/src/pages/SettingsPage.tsx#L148-L159)
- バックエンドAPI: `PUT /api/loras/{lora_id}`, `PUT /api/tag-sets/{tag_set_id}`, `PUT /api/mapping-masters/{master_id}`

- **エラーのメカニズム**:
  - フロントエンドの一括編集処理は、変更があったプロパティ（例: `{"category_id": 3}`）のみを含む部分的なオブジェクト（`values`）を各 `update` APIに送信しています。
  - しかし、バックエンドの `PUT` エンドポイントはフル更新用のスキーマ（`schemas.LoraCreate` や `schemas.MappingMasterCreate`）を要求しており、`model_name` や `role` などの必須フィールドがリクエストボディに含まれていないとバリデーションエラー（422 Unprocessable Entity）になります。
  - 結果として、一括編集のAPIリクエストがエラーになり、データが更新されません。

#### 3-3. 不具合3の直接原因：`isMultiSelectMode` 時のドラッグ機能およびUIの無効化
**該当ファイル**:
- [`SettingsComponents.tsx`](frontend/src/components/SettingsComponents.tsx#L220)
- [`SettingsComponents.tsx`](frontend/src/components/SettingsComponents.tsx#L245-L259)

- **エラーのメカニズム**:
  - `SortableMasterRow` コンポーネント内の `useSortable` フックにおいて、`disabled: isMultiSelectMode` と指定されているため、複数選択中はドラッグが無効化されます。
  - さらに、JSXレンダリング部分において、`isMultiSelectMode` の時はドラッグ用グリップボタン (`GripVertical`) を非表示にし、代わりに静的なチェックボックスを表示しています。グリップボタンにドラッグイベントのリスナー (`{...attributes} {...listeners}`) が紐づいているため、このボタンが消えることでドラッグ操作のトリガー自体が存在しなくなっています。

### 4. 診断チェック (Diagnostic Check)

| 項目 | 値 |
|---|---|
| **Root Cause Isolated** | Yes |
| **Classification** | **Type A: Implementation Bug** (実装バグ) |
| **影響ファイル** | `frontend/src/pages/LoRAsPage.tsx`<br>`frontend/src/pages/TagsPage.tsx`<br>`frontend/src/pages/SettingsPage.tsx`<br>`frontend/src/components/SettingsComponents.tsx` |
| **Next Route** | `/dev-design` |

### 5. 修正方針（概要）
1. **並び替えロジックの改善**: `handleDragEnd` のグループ移動ロジックにおいて、ドロップ先が選択中のアイテムである場合は移動をスキップするか、直前・直後の非選択アイテムをターゲットにするようにロジックを修正。また、移動方向（上下）を判別して挿入先インデックスを正しく計算します。
2. **一括更新リクエストの修正**: フロントエンドで既存のアイテム情報を取得し、一括編集の変更対象プロパティとマージした完全なオブジェクトを作成してから更新APIへ送信するように変更します。
3. **マッピングマスタ並び替えの有効化**: `SortableMasterRow` の `useSortable` で `disabled: false` とし、複数選択モード時でもチェックボックスの横にグリップボタンを並べて配置することで、ドラッグ操作を可能にします。

---

## [NEW] REQ-067 (不具合修正): 同一LoRA/タグセットを複数役割に指定した際のスナップショット保存失敗バグ

### 1. 現象・症状

生成ページにおいて、同一のLoRAやタグセットを複数の役割（例: `positive` と `negative`）に適用して画像を生成し、その状態のスナップショットを保存しようとすると、サーバーエラー（500 Internal Server Error）が発生し、スナップショットの保存に失敗する。

### 2. 再現手順

1. 任意のワークフローを開く。
2. 同一のLoRA（例: `test_lora.safetensors`）を、`positive` 役割と `negative` 役割の双方に適用し、値を調整する。
3. 生成を実行する。
4. 生成結果画面から「スナップショットを保存」モーダルを開き、保存を実行する。
5. サーバー側で `IntegrityError`（UNIQUE制約違反）が発生し、保存処理全体が失敗する。

### 3. 原因究明 (Root Cause Isolation)

#### 3-1. 直接原因：データベースおよびORM定義のユニーク制約の不備
**該当ファイル**:
- [`backend/app/models.py`](../backend/app/models.py#L204-L228) L206, L220
- SQLite テーブル `snapshot_loras`, `snapshot_tag_sets`

`SnapshotLora` および `SnapshotTagSet` の各モデルおよびデータベース構造において、以下のユニーク制約が設定されています。

```python
# models.py
class SnapshotLora(Base):
    __tablename__ = "snapshot_loras"
    __table_args__ = (UniqueConstraint("snapshot_id", "lora_id"),) # ⚠️ role が考慮されていない

class SnapshotTagSet(Base):
    __tablename__ = "snapshot_tag_sets"
    __table_args__ = (UniqueConstraint("snapshot_id", "tag_set_id"),) # ⚠️ role が考慮されていない
```

- **エラーのメカニズム**:
  - 先行のアップデートにより、`snapshot_loras` および `snapshot_tag_sets` テーブルには `role` カラム（`positive` / `negative` 等を識別）が追加されました。これにより、同一の LoRA/タグセット を異なる役割で複数適用することが仕様上許容されるようになりました。
  - しかし、データベースのユニーク制約は `(snapshot_id, lora_id)` のままであるため、1つのスナップショットに対して同一の `lora_id` を持つ複数のレコード（例: `role='positive'` と `role='negative'`）を保存しようとすると、`sqlite3.IntegrityError: UNIQUE constraint failed: snapshot_loras.snapshot_id, snapshot_loras.lora_id` が発生します。
  - これにより、トランザクション全体がロールバックされ、スナップショットの保存がエラーで失敗します。

### 4. 診断チェック (Diagnostic Check)

| 項目 | 値 |
|---|---|
| **Root Cause Isolated** | Yes |
| **Classification** | **Type A: Implementation Bug** (実装バグ) |
| **影響ファイル** | [`backend/app/models.py`](../backend/app/models.py#L204-L228) L206, L220<br>[`backend/app/main.py`](../backend/app/main.py#L40-L52) (マイグレーション処理) |
| **Next Route** | `/dev-design` |

### 5. 修正方針（概要）

1. **ユニーク制約の更新**: `models.py` の `SnapshotLora` および `SnapshotTagSet` における `UniqueConstraint` を、`role` を含めた複合制約に変更します。
   - `UniqueConstraint("snapshot_id", "lora_id", "role")`
   - `UniqueConstraint("snapshot_id", "tag_set_id", "role")`
2. **マイグレーションの実施**: `backend/app/main.py` の `run_migrations` にて、既存の `snapshot_loras` および `snapshot_tag_sets` テーブルの古いユニーク制約を削除（またはテーブルの再作成・データ移行）し、新制約 `(snapshot_id, lora_id, role)` / `(snapshot_id, tag_set_id, role)` を持つテーブル構造へ移行させます。

---

## [NEW] REQ-069: LoraStackの編集がワークフローに反映されない（キャラLoRAが変更されない）不具合

### 1. 現象・症状
生成ページのパラメータ欄にて、`easy loraStack` などのLoRAスタック（`LoraStack`役割）に含まれるキャラLoRAを別のものに入れ替えたりウェイトを調整したりしても、生成された画像にはワークフローのアップロード時に設定されていた元キャラクターの特徴が強く残り、編集内容が反映されない。

### 2. 再現手順
1. `easy loraStack` ノードを含むワークフローをアップロードして選択する。
2. `LoraStack` UI上で、LoRAモデルを別のキャラLoRAに入れ替え、生成ボタン（Generate）をクリックする。
3. 生成された画像が、編集した新キャラではなく、アップロード当初のワークフローに登録されていたキャラクターのままで生成される。

### 3. 原因究明 (Root Cause Isolation)

#### 3-1. 直接原因：ComfyUIの `easy loraStack` ノードとパラメータインジェクションキーの不一致
**該当ファイル**:
- [`useWorkflowParams.ts`](../frontend/src/pages/GeneratePage/hooks/useWorkflowParams.ts#L18-L47) L18–L47, L148–L166
- [`useGenerateAction.ts`](../frontend/src/pages/GeneratePage/hooks/useGenerateAction.ts#L38-L56) L38–L56

Zustandの `paramValues` やローカルストレージ内では、動的LoRAスタックのパラメータは以下のキーで管理されています。
- `[role]_lora_count`
- `[role]_lora_name_X`
- `[role]_lora_wt_X`
- `[role]_model_str_X`
- `[role]_clip_str_X`

しかし、ComfyUIのカスタムノード `easy loraStack`（および関連スタックノード）が受け取る実際の入力パラメータ名は以下のように定義されています。
- `num_loras` (数)
- `lora_X_name` (モデル名、Xは1〜10)
- `lora_X_strength` (ウェイト)
- `lora_X_model_strength` (モデル強度)
- `lora_X_clip_strength` (CLIP強度)

**不整合の挙動**:
`useGenerateAction.ts` および `useWorkflowParams.ts` では、プロンプト送信時やデフォルト保存時に以下のようにJSONに書き込んでいます。
```typescript
inputs['lora_count'] = loraCount
inputs[`lora_name_${idx}`] = ...
inputs[`lora_wt_${idx}`] = ...
inputs[`model_str_${idx}`] = ...
inputs[`clip_str_${idx}`] = ...
```
これらは `easy loraStack` ノードが認識しないフィールド（`lora_count`, `lora_name_X`等）であるため、ComfyUI側で完全に無視されます。結果として、アップロード時のJSONにあらかじめ保存されていた `lora_1_name`, `lora_1_strength`（アップロード時のキャラLoRA設定）がそのまま適用され続けていました。

### 4. 診断チェック (Diagnostic Check)

| 項目 | 値 |
|---|---|
| **Root Cause Isolated** | Yes |
| **Classification** | **Type A: Implementation Bug** (実装バグ) |
| **影響ファイル** | [`useWorkflowParams.ts`](../frontend/src/pages/GeneratePage/hooks/useWorkflowParams.ts)<br>[`useGenerateAction.ts`](../frontend/src/pages/GeneratePage/hooks/useGenerateAction.ts) |
| **Next Route** | `/dev-design` |

### 5. 修正方針（概要）
`useWorkflowParams.ts` のパラメータ初期化・保存ロジック、および `useGenerateAction.ts` のインジェクションロジックにおいて、マッピング先のノードが `easy loraStack`（または `num_loras` や `lora_1_name` 等のキーを持つノード）である場合、正しいComfyUI側のキー名（`num_loras`, `lora_X_name`, `lora_X_strength`等）に対して値を書き込むように修正します。また、未使用のスロットについては自動的に名前に `'None'` を設定し、強度を `1.0` に初期化することで、不要なLoRAの残存を防ぎます。

---

## [NEW] REQ-070: モバイル・タブレットでの全画面プレビュー時の画像縮小およびナビゲーションバーのオーバーレイ問題

### 1. 現象・症状
1. スマートフォンやタブレット等のモバイル端末において、生成履歴やプレビュー画像を全画面で表示（全画面プレビュー）した際、画像の縦横比を保ったまま画面内に収まる（長辺基準でのスケール調整）ように表示されず、画面幅に合わせて画像が横いっぱいに拡大され、縦長の画像などで上下が見切れて全体が表示されない。
2. モバイル表示時、画面下部にレスポンシブ配置されるボトムナビゲーションバー（モバイル用サイドバーの代替）が、全画面プレビューモーダルの前面に重なって表示（オーバーレイ）されてしまう。

### 2. 再現手順
1. スマートフォンまたはタブレット端末（あるいはブラウザのデベロッパーツールでモバイル表示モードにする）でアプリを開く。
2. 生成履歴などの画像をタップして全画面プレビューを開く。
3. 縦に長い画像の場合、画像の幅が画面幅に強制的に合わせられ、上下がはみ出して見えなくなる。また、画面下部にボトムナビゲーションバーがプレビューを覆う形で表示されたままになる。

### 3. 原因究明 (Root Cause Isolation)

#### 3-1. 画像が長辺基準で縮小されない原因（Flexboxのレイアウト挙動）
**該当ファイル**: [`frontend/src/components/HistoryModalPreview.tsx`](../frontend/src/components/HistoryModalPreview.tsx) L166–L179

全画面プレビューの親要素は `fixed inset-0 flex flex-col` であり、ビューポート全体の高さを持ちます。
その中の画像を表示するコンテナー（L166）は `viewMode === 'full'` の場合に `flex-1` が適用されますが、`min-height`（`min-h-0`）が明示的に設定されていません。
CSSの仕様上、flexコンテナーの子要素（flexアイテム）はデフォルトで `min-height: auto` が設定されます。このため、子要素である `<img>` の元のサイズやアスペクト比計算に基づいてコンテナー自体の高さがビューポートを突き抜けて自動的に引き伸ばされてしまいます。
結果として、画像（`<img>`）に設定されている `max-h-full`（親コンテナーの高さに対する最大値）が効かなくなり、画像の幅が優先され、画面外へはみ出します。

#### 3-2. ボトムナビゲーションバーがプレビューにオーバーレイする原因（Z-Indexの競合）
**該当ファイル**:
- [`frontend/src/components/layout/AppShell.tsx`](../frontend/src/components/layout/AppShell.tsx) L115
- [`frontend/src/components/HistoryModalPreview.tsx`](../frontend/src/components/HistoryModalPreview.tsx) L153

- モバイル用ボトムナビゲーション (`AppShell.tsx` 内) のクラス指定: `z-50`
- 全画面プレビューモーダル (`HistoryModalPreview.tsx` 内) のクラス指定: `z-50`

両要素ともに `z-50` が適用されています。HTMLドキュメント構造において、ナビゲーションバーはメインコンテンツ（`Outlet`）の外側に配置され、DOMの後半で描画されるため、同一 z-index の場合はナビゲーションバーがプレビューモーダルの前面にレンダリングされます。

### 4. 診断チェック (Diagnostic Check)

| 項目 | 値 |
|---|---|
| **Root Cause Isolated** | Yes |
| **Classification** | **Type A: Implementation Bug** (実装バグ) |
| **影響ファイル** | [`frontend/src/components/HistoryModalPreview.tsx`](../frontend/src/components/HistoryModalPreview.tsx#L153) L153, L166 |
| **Next Route** | `/dev-design` |

### 5. 修正方針（概要）
1. **画像の長辺基準スケーリング**: `HistoryModalPreview.tsx` 内の画像表示領域コンテナー（L166）のクラスに `min-h-0` を追加します。これにより、コンテナーの高さが画面外にはみ出して拡張されるのを防ぎ、`<img>` の `max-h-full object-contain` が想定通り動作し、長辺基準でのフィット表示が行われます。
2. **z-indexの修正**: `HistoryModalPreview.tsx` の最外周 `div`（L153）の z-index を `z-50` から `z-[60]` もしくはそれ以上に引き上げ、モバイルナビゲーションバー（`z-50`）よりも前面に描画されるようにします。

---

## [NEW] REQ-071 (不具合修正): アルバム画面等での並び替え操作時に長押し複数選択が誤発火して並び替えができない問題

### 1. 現象・症状

アルバム画面やLoRA、Tagセット画面などの並び替え可能なカード・アイテム一覧において、アイテムをドラッグして並び替えようとした際、ボタンを離す前に長押し判定時間（デフォルト800ms）が経過すると、複数選択モードが誤発火（誤爆）してしまい、並び替え操作が完了できない。

### 2. 再現手順

1. 並び替え可能なアイテム一覧（例：アルバム、LoRA、Tagセット画面など）で、アイテムをドラッグするためにクリック/タップして押下した状態にする（`MouseDown` / `TouchStart`）。
2. そのままマウスや指を動かしてドラッグ操作を行う。
3. マウスボタンを離す（`MouseUp`）またはタッチを終了（`TouchEnd`）する前に、押下開始から800ms以上が経過する。
4. ドラッグ中（移動中）であるにもかかわらず、複数選択モードが発動（チェックボックスが表示され、並び替えモードが阻害）される。

### 3. 原因究明 (Root Cause Isolation)

#### 3-1. 直接原因：移動操作（`MouseMove` / `TouchMove`）発生時の長押しタイマーのキャンセル漏れ

**該当ファイル**: [`frontend/src/hooks/useMultiSelect.ts`](../frontend/src/hooks/useMultiSelect.ts#L109-L140) L109–140 (`getLongPressHandlers` 内)

```typescript
  const getLongPressHandlers = useCallback(
    (id: number) => {
      let timer: ReturnType<typeof setTimeout> | null = null;

      const start = (e: React.MouseEvent | React.TouchEvent) => {
        // Prevent trigger on right click
        if ('button' in e && e.button !== 0) return;
        const stored = localStorage.getItem(LS_KEYS.LONG_PRESS_DELAY_MULTI_SELECT);
        const parsed = stored !== null ? parseFloat(stored) : NaN;
        const delay = !isNaN(parsed) ? parsed * 1000 : 800;
        timer = setTimeout(() => {
          enterMultiSelectMode(id);
        }, delay);
      };

      const clear = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      };

      return {
        onMouseDown: start,
        onMouseUp: clear,
        onMouseLeave: clear,
        onTouchStart: start,
        onTouchEnd: clear,
      };
    },
    [enterMultiSelectMode]
  );
```

- **挙動の分析**:
  - `onMouseDown` または `onTouchStart` イベント発生時に長押し判定のタイマー（`delay` ミリ秒）が起動します。
  - タイマーがクリアされる条件は `onMouseUp`, `onMouseLeave`, `onTouchEnd` のみとなっています。
  - `onMouseMove` や `onTouchMove` に対するイベントハンドラがバインドされておらず、マウスやタッチの位置が移動（ドラッグ）した際にタイマーをクリアする仕組みがありません。
  - そのため、ユーザーが並び替えのためにドラッグして移動させている最中でも、ボタンを離すまでの時間が `delay`（800msなど）を超えると、タイマーが発火して `enterMultiSelectMode(id)` が実行されてしまいます。

### 4. 診断チェック (Diagnostic Check)

| 項目 | 値 |
|---|---|
| **Root Cause Isolated** | Yes |
| **Classification** | **Type A: Implementation Bug** (実装バグ) |
| **影響ファイル** | [`useMultiSelect.ts`](../frontend/src/hooks/useMultiSelect.ts#L109-L140) L109-140 |
| **Next Route** | `/dev-design` |

### 5. 修正方針（概要）

1. **移動イベントのハンドリング**: `getLongPressHandlers` 内で、移動操作を検出するための `onMouseMove` および `onTouchMove` イベントをハンドリングします。
2. **しきい値判定によるタイマー解除**:
   - `start` (MouseDown/TouchStart) 時に開始座標（`clientX`, `clientY`）を記録します。
   - 移動イベント発生時に現在の座標と開始座標の距離（ユークリッド距離など）を計算し、軽微な手ブレ防止用しきい値（例: 10px）を超えて移動した場合は、長押しではない（ドラッグ操作である）と判定して `timer` をクリアします。
   - タッチデバイスでのスクロールやドラッグ操作も同様に、一定以上の移動を検知したらタイマーをクリアします。

---

## [NEW] スナップショット保存時の LoRA・タグセットのメタデータ不整合問題

### 1. 現象・症状
- Add Asset で LoRA やタグセットを適用して画像生成を行った後、スナップショットとして保存した際、スナップショットに紐づくアセット（LoRA/タグセット）のメタデータが、実際にその画像を生成した時のものではなく、他のアセット（ずれた状態）になってしまう、あるいは登録されない場合がある。
- 特に、複数のプロファイルやジョブ（Multi-Set 連続生成など）を切り替えて連続生成を行った場合に頻発する。

### 2. 再現手順
1. 生成画面（`GeneratePage`）で、「Set 1」に LoRA A と タグセット A を適用する。
2. 「Set 2」に LoRA B と タグセット B を適用する。
3. 「Set 1」と「Set 2」の両方にチェックを入れて一括生成（`handleGenerateSets`）を行う。
4. 生成中または生成完了後に、UI 上のチェック状態やアクティブな Set（ストア内の `appliedAssets` や `paramValues`）を変更する（例: Set 2 を選択状態にする）。
5. 「Set 1」の生成結果のサムネイルを選択し、スナップショットとして保存する。
6. 保存されたスナップショットのメタデータを確認すると、「Set 1」の LoRA A / タグセット A ではなく、「Set 2」の LoRA B / タグセット B（または現在 UI で選択されているアセット）が紐づいている。

### 3. 原因究明 (Root Cause Isolation)
- **影響を受けるソースコード**:
  - [`frontend/src/pages/GeneratePage/hooks/useSnapshotActions.ts`](../frontend/src/pages/GeneratePage/hooks/useSnapshotActions.ts#L11-L52) L11, L22-52
  - [`frontend/src/store/useGenerationStore.ts`](../frontend/src/store/useGenerationStore.ts#L442-L465) L442-465, L748-768
- **根本原因**:
  - スナップショットを保存する際、`useSnapshotActions.ts` の `saveSnapshot` ミューテーションは、**保存対象の画像が生成された時点のメタデータではなく、Zustand ストアの現在の状態（`appliedAssets`, `paramValues`）を参照している。**
  - そのため、一括生成時やパラメータ変更後に過去のサムネイルを選択して保存しようとすると、その画像生成時に使われたアセット情報ではなく、**現在 UI でアクティブなアセット情報**が API に送信され、メタデータがずれたり、消えたりする。

### 4. 診断チェック (Diagnostic Check)

| 項目 | 値 |
|---|---|
| **Root Cause Isolated** | Yes |
| **Classification** | **Type A: Implementation Bug** (実装バグ) |
| **影響ファイル** | [`useSnapshotActions.ts`](../frontend/src/pages/GeneratePage/hooks/useSnapshotActions.ts) L11, L22-L52<br>[`useGenerationStore.ts`](../frontend/src/store/useGenerationStore.ts) L442-L465, L748-L768 |
| **Next Route** | `/dev-design` |

### 5. 修正方針（概要）
1. **生成メタデータの保存**:
   - ComfyUI のジョブキュー送信時（`queuePrompt`）に、その生成ジョブ（`prompt_id`）に適用されていた `paramValues` と `appliedAssets` をキャッシュ（例: `localStorage` 内に `prompt-surgeon-meta-{promptId}` などのキーで保存）します。
   - 生成結果の画像 URL にクエリパラメータとして `t={promptId}` を埋め込むことで、どの画像がどの `promptId` で生成されたかを一意に特定可能にします（現在 websocket の `executed` イベント時は `t={Date.now()}` となっているため、これを `t={promptId}` に統一します）。
2. **スナップショット保存時のメタデータ復元**:
   - `saveSnapshot` ミューテーション実行時、対象画像の URL から `promptId`（クエリパラメータ `t`）を抽出します。
   - キャッシュが存在する場合はその `promptId` に紐づく `paramValues` と `appliedAssets` を使用して API に送信します。
   - キャッシュが存在しない場合は、従来通り現在の UI ストア状態をフォールバックとして使用します。
3. **キャッシュのクリーンアップ**:
   - `localStorage` が肥大化しないよう、`queuePrompt` 時に古いキャッシュメタデータを自動で削除するプルーニング機構（最大200件など）を実装します。

---

## [NEW] REQ-080 (不具合修正): 新規プロファイル作成時にワークフローのデフォルト設定を選択すると全パラメータが空欄になる問題

### 1. 現象・症状
新規プロファイル作成（Add Set）モーダルにおいて、コピー元（ベース設定）として「ワークフローのデフォルト設定」を選択して作成すると、作成されたプロファイルのパラメータ（`paramValues`）および適用アセット（`appliedAssets`）が全て空欄（空オブジェクト `{}`）で作成され、そのプロファイルを選択すると入力欄が全てクリアされて空になってしまう。

### 2. 再現手順
1. 生成ページ（`GeneratePage`）で、任意のワークフローを選択する。
2. プロファイル選択欄の横にある「プロファイルを追加」（または「Setを追加」などのボタン）をクリックして「新規プロファイル作成 (Add Set)」モーダルを開く。
3. コピー元（ベース設定）で「ワークフローのデフォルト設定」を選択し、任意のプロファイル名を入力して「作成」ボタンをクリックする。
4. 作成された新規プロファイルを選択すると、全てのパラメータ入力欄および適用アセットの表示が消え、空欄になってしまう。

### 3. 原因究明 (Root Cause Isolation)

#### 3-1. 直接原因：`useGeneratePageState.ts` 内の `handleCreatePreset` におけるデフォルト値生成ロジックの欠如
**該当ファイル**:
- [`useGeneratePageState.ts`](../frontend/src/pages/GeneratePage/hooks/useGeneratePageState.ts#L369-L377) L369–L377

`useGeneratePageState.ts` の `handleCreatePreset` 内で、`copySourceId` が `'default'` の場合、以下のようにハードコードされた空のオブジェクトを API に送信してプリセット（プロファイル）を作成しています：

```typescript
    } else if (copySourceId === 'default') {
      createPresetMutation.mutate({
        name: finalName.trim(),
        paramValues: {}, // ⚠️ 空のオブジェクトになっている
        appliedAssets: {}, // ⚠️ 空のオブジェクトになっている
        batchSize: 1,
        seedMode: 'random',
        seed: 42,
      })
```

- **挙動の分析**:
  - `useWorkflowParams.ts` 内には、ワークフローの設定（`json_body`）やマッピング定義から初期パラメータを算出する `getInitialParams` という関数が存在します。
  - しかし、`useGeneratePageState.ts` 側の `handleCreatePreset` ではこの関数（あるいは算出ロジック）が参照されておらず、単純に空の `paramValues: {}` および `appliedAssets: {}` が設定されたプリセットがデータベースに登録されてしまいます。
  - これをロード（`handleLoadPreset`）した際に、`setParamValues({})` および `setAppliedAssets({})` が呼び出され、フロントエンド上のパラメータが全て消え去り空欄になってしまいます。

### 4. 診断チェック (Diagnostic Check)

| 項目 | 値 |
|---|---|
| **Root Cause Isolated** | Yes |
| **Classification** | **Type A: Implementation Bug** (実装バグ) |
| **影響ファイル** | [`useGeneratePageState.ts`](../frontend/src/pages/GeneratePage/hooks/useGeneratePageState.ts) L355-400<br>[`useWorkflowParams.ts`](../frontend/src/pages/GeneratePage/hooks/useWorkflowParams.ts) L13-65 (エクスポートの必要性) |
| **Next Route** | `/dev-design` |

### 5. 修正方針（概要）
1. `useWorkflowParams.ts` で定義されている初期パラメータ算出関数 `getInitialParams` を `export` するように変更します。
2. `useGeneratePageState.ts` にて `getInitialParams` をインポートし、`handleCreatePreset` 内で `copySourceId === 'default'` の場合に、`getInitialParams(workflow)` を呼び出してワークフローのデフォルトパラメータを取得して設定します。
3. `appliedAssets` に関しても、`workflow.default_applied_assets` が存在する場合はそれをパースして設定し、存在しない場合のみ空のオブジェクト `{}` を設定するようにします。

---

## [NEW] ワークフローアップロード時のスマートノードマッピング（一意判定）の漏れ

### 1. 現象・症状
PBI 081（ワークフローアップロード時のノードIDマッピング機能の改善）で実装された「スマート初期値選択」において、同一タイプのノードが複数存在し、タイトルまで一致するノードが複数存在する場合（競合状態）に、タイトルが一致しない無関係なノード（クラスタイプのみ一致するノード）が初期値として自動選択されてしまう。

### 2. 再現手順
1. マッピングマスタにおいて、ある役割のタイトルパターン（例: `"MainSampler"`) が定義されている。
2. 同一の期待されるクラスタイプ（例: `KSampler`）を持つノードが複数含まれるワークフローをアップロードする。
3. ワークフロー内に、タイトルパターンに一致するノードが2つ以上存在し（例: ノード10, ノード20）、かつタイトルパターンに一致しない同一タイプのノード（例: ノード5）が存在するとき、「複数候補」警告が発生する。
4. この際、ドロップダウンの初期値として、タイトルが一致しているノード（10 or 20）ではなく、タイトルが一致しないノード（5）が自動選択されてしまう。

### 3. 原因究明 (Root Cause Isolation)

#### 3-1. 直接原因：バックエンド `workflow_scanner.py` におけるフォールバック時の選択ロジック of 不備
**該当ファイル**:
- [`workflow_scanner.py`](../backend/app/services/workflow_scanner.py#L115-L121) L115–L121

```python
        is_smart_match = False
        if len(perfect_matches) == 1:
            selected_node_id, selected_class_type, selected_node_title = perfect_matches[0]
            is_smart_match = True
        else:
            selected_node_id, selected_class_type, selected_node_title = candidates[0]
```

- **分析：競合発生時（`len(perfect_matches) >= 2`）のフォールバック対象の誤り**:
  クラスタイプとタイトルパターンの両方に一致するノード（`perfect_matches`）が複数件ある場合、`len(perfect_matches) == 1` は `False` と評価され、`else` ブロックに入ります。
  しかし、`else` ブロックではタイトルの一致・不一致にかかわらず、クラスタイプやパラメータ名だけで抽出された全候補リスト `candidates` の先頭要素（`candidates[0]`）を初期値（`selected_node_id`）として設定してしまいます。
  この結果、タイトルが一致しているノードが複数ある（競合している）にもかかわらず、初期値にはタイトルが一致しない別のノード（IDが若いだけのノードなど）が選ばれてしまう問題が発生します。

### 4. 診断チェック (Diagnostic Check)

| 項目 | 値 |
|---|---|
| **Root Cause Isolated** | Yes |
| **Classification** | **Type A: Implementation Bug** (実装バグ) |
| **影響ファイル** | [`workflow_scanner.py`](../backend/app/services/workflow_scanner.py) L115-L121 |
| **Next Route** | `/dev-design` |

### 5. 修正方針（概要）
1. **競合発生時における `perfect_matches` 内でのフォールバック**:
   クラスタイプとタイトルパターンの両方に一致するノードが複数（2つ以上）ある場合は、`perfect_matches` の中から最初の要素（ID順にソートされた先頭のノードなど）を初期値（`selected_node_id`）として選択するように修正します。これにより、複数候補状態であっても、タイトルが一致しているノードの中から初期値が選択されるようになります。
   - `perfect_matches` が 1 件以上の場合は、`perfect_matches[0]` を `selected_node_id` に設定。
   - `perfect_matches` が 0 件の場合のみ、従来の `candidates[0]` へフォールバック。
2. **`expected_class_types` が空の場合のバグ修正**:
   `expected_class_types` が空（指定なし）の場合は、クラスタイプチェックを常にパス（`class_type_ok = True`）するように修正し、タイトルパターンのみで一意特定を行おうとするマスタでもスマートマッチや優先選択が正常に動作するようにします。

---

## [NEW] モバイル表示（サイドバー下部配置）時のモーダルおよびページ下部要素の被り問題

### 1. 現象・症状
モバイル端末や低解像度画面（`lg:hidden`）において、画面下部に固定配置されるメニューバー（ボトムナビゲーションバー）が、全画面表示や縦長になるモーダル（例: `AddAssetModal`）の下部フッター（ボタン領域）と重なり、モーダル下部のボタンがタップ・クリックできなくなる。また、セーフエリア（iPhoneのホームインジケーターなど）が存在する場合、通常のページ下部要素もメニューバーと重なって隠れてしまうリスクがある。

### 2. 再現手順
1. ブラウザのデベロッパーツール等で画面幅をモバイルサイズ（1024px未満など）にし、下部にボトムナビゲーションバーが表示されている状態にする。
2. 「Add Asset (アセット追加)」などの縦長のモーダルを開く。
3. モーダルのフッター（「キャンセル」「追加」ボタンが配置されている領域）が、下部のボトムナビゲーションバーの背後または手前で重なってしまい、ボタンが押せなくなっていることを確認する。

### 3. 原因究明 (Root Cause Isolation)

#### 3-1. 直接原因1：z-index の競合（モーダルとボトムナビゲーション）
- **影響ファイル**: 
  - [`frontend/src/components/layout/AppShell.tsx`](file:///frontend/src/components/layout/AppShell.tsx#L115) L115
  - [`frontend/src/pages/GeneratePage/components/AddAssetModal.tsx`](file:///frontend/src/pages/GeneratePage/components/AddAssetModal.tsx#L195) L195 等のモーダル各種
- **詳細**:
  ボトムナビゲーションバーが `z-50` で指定されている一方で、モーダル各種のコンテナー backdrop も `z-50` と同一の z-index を使用している。これにより、DOMの記述順やスタッキングコンテキストの影響でボトムナビがモーダルの上層に描画されてしまい、ボタンへのクリックイベントを遮ってしまう。

#### 3-2. 直接原因2：固定余白設定（メインページ領域）におけるセーフエリアの考慮漏れ
- **影響ファイル**:
  - [`frontend/src/components/layout/AppShell.tsx`](file:///frontend/src/components/layout/AppShell.tsx#L110) L110
- **詳細**:
  ボトムナビゲーションバーは `pb-safe`（セーフエリアを考慮した下部パディング）を設定しているため、高さが `4rem (64px) + セーフエリアの高さ` になる。しかし、メインコンテンツを囲む `<main>` タグは `pb-16`（64px固定）のパディングしか持たないため、セーフエリアを持つモダン端末においてページ下部のコンテンツがボトムナビゲーションバーに被ってしまう。

#### 3-3. 直接原因3：モーダルの高さ上限とモバイル向け位置調整の欠如
- **詳細**:
  モーダルの多くは `max-h-[85vh]` や `max-h-[60vh]` などの高さ制限を持ち、`flex items-center justify-center` で画面中央に配置されている。モバイル表示において、ボトムナビゲーションバーが占有する領域（高さ `4rem + safe-area`）を考慮した下部パディングがモーダルの親コンテナー（backdrop）に設定されていないため、モーダル自体の高さがボトムナビの領域を避けるように縮小されず、位置的にも重なってしまう。

### 4. 診断チェック (Diagnostic Check)

| 項目 | 値 |
|---|---|
| **Root Cause Isolated** | Yes |
| **Classification** | **Type A: Implementation Bug** (実装バグ) |
| **影響ファイル** | [`AppShell.tsx`](file:///frontend/src/components/layout/AppShell.tsx), [`AddAssetModal.tsx`](file:///frontend/src/pages/GeneratePage/components/AddAssetModal.tsx) および他各種モーダル |
| **Next Route** | `/dev-design` |

### 5. 修正方針（概要）
1. **z-index の見直し**:
   すべてのモーダルの外枠コンテナー（backdrop）の z-index を `z-[100]` （または `z-50` より十分高い値）に変更し、ボトムナビゲーションバー（`z-50`）よりも常に前面に表示されるようにする。
2. **モーダルのモバイル表示用配置・高さの最適化**:
   モーダル各種の外枠コンテナー（`fixed inset-0`）において、モバイル表示時は下部にボトムナビゲーションとセーフエリア分のパディング `pb-[calc(4rem+env(safe-area-inset-bottom)+1rem)] lg:pb-4` などを適用し、表示可能領域の中央にモーダルを配置・最大高さを自動制限する。
3. **メインページのボトムパディングの安全化**:
   `<main>` タグの下部パディングを `pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0` に修正し、セーフエリア搭載端末でもページ最下部コンテンツがボトムナビと重ならないようにする。

---

## [NEW] スナップショット保存時の重複LoRAによるユニーク制約エラー (500 Internal Server Error)

### 1. 現象・症状
スナップショットを保存しようとすると、APIリクエスト `POST /api/snapshots` がステータスコード `500 Internal Server Error` で失敗し、スナップショットを保存できない。
バックエンドのログには以下の例外が出力される：
`sqlite3.IntegrityError: UNIQUE constraint failed: snapshot_loras.snapshot_id, snapshot_loras.lora_id, snapshot_loras.role`

### 2. 再現手順
1. アセット（LoRA）として、同一のLoRA（同じ `lora_id`）を同じ役割（例: `Prompt_Char_Lora_Other`）で複数適用した状態にする（または、ストアの `appliedAssets` 内に同一の `lora_id` と役割を持つLoRA情報が複数重複して存在している状態にする）。
2. 画像を生成する。
3. 生成された画像のスナップショットを保存ボタンから保存しようとする。
4. APIが `500 Internal Server Error` を返し、保存に失敗する。

### 3. 原因究明 (Root Cause Isolation)
- **影響を受けるソースコード**:
  - `backend/app/services/snapshot_service.py` L114–122
  - `frontend/src/pages/GeneratePage/hooks/useSnapshotActions.ts` L46-63
- **詳細**:
  - フロントエンドで適用されているアセットの中に、同一の `lora_id` と `role` を持つLoRAが複数含まれている場合、フロントエンドはそれらをすべて `loras` リストに追加して `POST /api/snapshots` に送信します。
  - バックエンドの `SnapshotService.create_snapshot` では、受け取った `payload.loras` の各項目をループでそのまま `models.SnapshotLora` としてデータベースセッションに追加（`db.add`）します。
  - しかし、データベース（`snapshot_loras` テーブル）には `UNIQUE(snapshot_id, lora_id, role)` というユニーク制更新が設定されています。そのため、同一スナップショットIDに対して同一の `lora_id` および `role` の組み合わせを持つレコードが複数挿入されようとすると、`sqlite3.IntegrityError`（一意制約違反）が発生し、トランザクションがロールバックされて 500 エラーとなります。
  - これは `snapshot_tag_sets` テーブルの `UNIQUE(snapshot_id, tag_set_id, role)` においても同様に発生し得る問題です。

### 4. 診断チェック (Diagnostic Check)

| 項目 | 値 |
|---|---|
| **Root Cause Isolated** | Yes |
| **Classification** | **Type A: Implementation Bug** (実装バグ) |
| **影響ファイル** | `backend/app/services/snapshot_service.py` L114-122<br>`frontend/src/pages/GeneratePage/hooks/useSnapshotActions.ts` L46-63 |
| **Next Route** | `/dev-design` |

### 5. 修正方針（概要）
- バックエンドの `SnapshotService.create_snapshot` において、`payload.loras` および `payload.tag_sets` の登録処理を行う前に、`lora_id` と `role`（および `tag_set_id` と `role`）の重複を排除（デデュープ）してデータベースに登録するように修正します。
- または、フロントエンド側でスナップショットの登録用ペイロードを作成する段階（`useSnapshotActions.ts`）において、同一アセットIDかつ同一役割の重複を除外して送信するようにします。



---

## [NEW] モバイルレイアウトでの Scheduler/Sampler 選択肢の欠落問題（ローカルループバック接続の解決漏れ）

### 1. 現象・症状
モバイル端末（またはモバイルレイアウト表示中に PC の IP アドレスなどを介して別デバイスからアクセスした場合）において、生成画面のパラメータパネル（`ParamPanel`）の Scheduler または Sampler のドロップダウンを開いた際、`beta` などの選択肢が表示されず、PCレイアウトで表示される選択肢よりも極端に少なくなる。

### 2. 再現手順
1. ComfyUI を起動しておく。
2. モバイル端末（または PC 以外のデバイス）から、サーバーの外部IPアドレス（例: `http://192.168.x.x:5173/`）を使用してアプリケーションにアクセスする。
3. パラメータ設定領域内の `Scheduler` ドロップダウンを開く。
4. `beta` などの選択肢が存在せず、デフォルトの限定的な選択肢のみが表示される。

### 3. 原因究明 (Root Cause Isolation)

#### 3-1. 直接原因：`useGeneratePageState.ts` における `comfyUrl` の解決漏れ
- **影響ファイル**: [`frontend/src/pages/GeneratePage/hooks/useGeneratePageState.ts`](file:///frontend/src/pages/GeneratePage/hooks/useGeneratePageState.ts#L163-L172)
- **詳細**:
  `comfyObjectInfo` を取得する React Query フック（L163）において、ストアから取得した `comfyUrl` をそのまま使用して `fetch(comfyUrl + '/object_info')` を呼び出している。
  
  ```typescript
  const { data: comfyObjectInfo } = useQuery({
    queryKey: ['comfy-object-info', comfyUrl],
    queryFn: async () => {
      const res = await fetch(comfyUrl + '/object_info', { signal: AbortSignal.timeout(3000) })
      if (!res.ok) throw new Error('Failed to fetch object info')
      return res.json()
    },
    enabled: !!comfyUrl,
    retry: false,
  })
  ```

  PC からのアクセス（または localhost）では、`comfyUrl` のデフォルト値 `http://localhost:8188` に直接アクセスできるため成功する。
  しかし、モバイルデバイスなど外部の端末からアクセスした場合、モバイルデバイスにとっての `localhost` は自分自身を指すため、ComfyUI への接続が失敗（タイムアウト）する。
  
  本来、このようなループバック接続を回避するために Vite プロキシ（`/comfy`）を経由させるヘルパー関数 `resolveComfyUrl` が定義されているが、`useGeneratePageState.ts` 内ではこれを使用し忘れている。

#### 3-2. フォールバック時の選択肢不足
- **影響ファイル**: [`frontend/src/pages/GeneratePage/components/ParamPanel.tsx`](file:///frontend/src/pages/GeneratePage/components/ParamPanel.tsx#L12-L14)
- **詳細**:
  `comfyObjectInfo` の取得に失敗すると、`ParamPanel.tsx` はデフォルトのフォールバック値である `DEFAULT_SCHEDULERS` を使用する。しかし、この `DEFAULT_SCHEDULERS` 配列には `beta` やその他の新しい ComfyUI スケジューラーが含まれていない。

### 4. 診断チェック (Diagnostic Check)

| 項目 | 値 |
|---|---|
| **Root Cause Isolated** | Yes |
| **Classification** | **Type A: Implementation Bug** (実装バグ) |
| **影響ファイル** | `frontend/src/pages/GeneratePage/hooks/useGeneratePageState.ts` L163-L172 |
| **Next Route** | `/dev-design` |

### 5. 修正方針（概要）
1. `useGeneratePageState.ts` の `comfyObjectInfo` 取得処理において、`comfyUrl` を `resolveComfyUrl(comfyUrl)` で解決した上で `fetch` を行うように修正する。
2. `ParamPanel.tsx` の `DEFAULT_SCHEDULERS` および `DEFAULT_SAMPLERS` 配列について、ComfyUI でよく使われる主要なスケジューラー/サンプラー（`beta`等）をデフォルト値として追加し、仮に接続が切れてフォールバックした場合でも選択できるようにする。

---

## [NEW] タブレット等のフルスクリーン表示時、下部メニューGAPが適用されて最大化されない問題

### 1. 現象・症状
タブレットやモバイル端末（画面幅1024px未満）において、画像履歴プレビューなどのモーダル（`HistoryModalPreview`）でフルスクリーン表示を行った際、画面下部にボトムナビゲーションバー（約4rem分）の余白（GAP）が考慮されたままとなり、画像表示エリアが最大化されず縮小して表示される。

### 2. 再現手順
1. タブレット端末またはブラウザのデベロッパーツールで画面幅を1024px未満（例: 768px または 820px）にする。
2. 履歴画面などから画像プレビューモーダル（`HistoryModalPreview`）を開く。
3. 画像をクリックまたはフルスクリーンボタンを押してフルスクリーン表示にする。
4. 下部ナビゲーションメニューが非表示になるにもかかわらず、下部にメニューの高さ分の余白（GAP）が残り、画像が画面いっぱいに表示されない。

### 3. 原因究明 (Root Cause Isolation)

#### 3-1. 直接原因：`index.css` における `.modal-backdrop` の `padding-bottom` 指定
- **影響ファイル**: [`frontend/src/index.css`](../frontend/src/index.css#L138-L156)
- **詳細**:
  `index.css` の `.modal-backdrop` では、モバイル・タブレット向け（幅1024px未満）に下部ナビゲーションメニューを避けるためのパディングが常時設定されている。

  ```css
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal);
    padding: 1rem;
    padding-bottom: calc(var(--mobile-nav-height) + 1rem + env(safe-area-inset-bottom));
  }

  @media (min-width: 1024px) {
    .modal-backdrop {
      padding-bottom: 1rem;
    }
  }
  ```

  この `modal-backdrop` クラスを持つコンテナー（`HistoryModalPreview.tsx` のルート要素）が HTML5 Fullscreen API を介してフルスクリーン化された際、`:fullscreen` 状態になってもこの `padding-bottom` がクリアされないため、下部にGAP（余白）が生じ、内側の画像表示領域が最大化されない。

### 4. 診断チェック (Diagnostic Check)

| 項目 | 値 |
|---|---|
| **Root Cause Isolated** | Yes |
| **Classification** | **Type A: Implementation Bug** (実装バグ) |
| **影響ファイル** | `frontend/src/index.css` L138-156 |
| **Next Route** | `/dev-design` |

### 5. 修正方針（概要）
- `.modal-backdrop` 要素がフルスクリーン状態になった時（CSSの `:fullscreen` または `-webkit-full-screen` などの疑似クラス、あるいは JS で管理している `isFullscreen` 状態によるクラス付与など）、すべての `padding` （特に下部の `padding-bottom`）を `0` にリセットするように CSS もしくはコンポーネントクラスを修正する。

