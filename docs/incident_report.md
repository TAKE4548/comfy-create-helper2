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
