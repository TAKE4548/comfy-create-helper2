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
