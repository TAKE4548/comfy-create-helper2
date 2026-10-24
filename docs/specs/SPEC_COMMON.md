# Prompt Surgeon — 共通仕様書 (SPEC_COMMON)

**バージョン**: 2.8
**最終更新**: 2026-10-20
**ステータス**: 現行実装と承認済み契約を記載（全体QA状況は検証計画を参照）。§1-6・§5-6のモバイルUI共通規約は採用済みだが、導入状況が「導入前」の規則は現行の挙動を表さない

> 関連仕様書: [SPEC_SUMMARY.md](./SPEC_SUMMARY.md) / [REQ-332設計](../design/REQ-332.md) / [REQ-332検証計画](../design/REQ-332-test-plan.md) / [REQ-334設計](../design/REQ-334.md) / [REQ-334検証計画](../design/REQ-334-test-plan.md) / [REQ-334-T10正本同期](../backlog/task/archive/REQ-334-T10.md) / [REQ-365設計](../design/REQ-365.md) / [REQ-346設計](../design/REQ-346.md) / [REQ-378設計](../design/REQ-378.md)

---

## 1. デザインシステム

### 1-1. カラーパレット（Design Tokens）

| トークン名 | 値 | 用途 |
|---|---|---|
| `base-bg` | `#09090B` | 最背面の背景色 |
| `surface` | `#121215` | 主要面・サイドバー・ヘッダーパネル背景 |
| `surface-2` | `#18181C` | カード・入力欄の背景 |
| `surface-3` | `#202024` | 共通ダイアログの外側サーフェス |
| `accent-green` | `#3ecf8e` | 主要アクション・アクティブ状態・成功色 |
| `accent-purple` | `#7C6FDD` | AI支援（限定使用） |
| `border` | 白10% | カード・入力境界。区切り6%、強調18%、カード上辺8% |
| `text-primary` | `#F4F4F5` / `#D4D4D8` | 見出し / 本文 |
| `text-muted` | `#A1A1AA` / `#71717A` | 補助 / 非活性 |

### 1-2. タイポグラフィ

- フォントファミリ: Inter、数値はJetBrains Monoとtabular-nums
- ヘッダー・ラベル: `text-xs font-semibold` / `text-sm font-medium`
- ボディテキスト: `text-sm text-zinc-300`
- ミュートテキスト: `text-xs text-zinc-400`、非活性は`text-zinc-500`
- 通常UIの最小文字サイズは11px。ID、プロンプトID、技術値は読みやすさが必要な場面で等幅フォント（`font-mono`）を使う。

### 1-3. 共通 UI ルール

- ボーダー: 白10%（カード・入力）、区切り6% / 選択時: 緑枠・チェック
- 角丸: 共通Modalの外枠16px（`Modal.tsx` の `rounded-t-2xl` / `md:rounded-2xl`。従来の12pxから実装に合わせて修正）、ボタン・入力・カード8px、チップ・バッジ6px。Settingsの管理系・編集系モーダルはすべて共通Modal（モバイルでボトムシート、§1-4参照）。`.modal-backdrop` を直接使うレガシーモーダルは12pxのまま（§1-4参照）
- 共通Modalはモバイルで上端16px・下端0、768px以上（デスクトップ）でも四隅16pxとし、ダイアログrole/name、focus管理、Escape/backdrop制御を共通化する。
- スクロールバー: `.custom-scrollbar` クラスでカスタムスタイル適用（OS 標準非表示・細いダークスタイル）
- トランジション: `transition-all` / `transition-colors`（ホバー・アクティブの変化）
- アニメーション: `animate-pulse`（生成中インジケータ）/ `animate-fade-in`（モーダル等出現時）
- モバイル操作対象は最小44×44pxを確保する。操作対象の意味・状態は色だけで伝えず、名称や状態テキストも併用する。
- 上記の44×44pxは、モバイルUI共通規約（§1-6のMUI-06）でも最小値として維持する。画面ごとの例外はMUI-06の補足に従う。

### 1-4. 共通モーダルとレスポンシブ境界（REQ-334）

- 通常の共通Modalは幅768px未満で画面下部のsheetとなり、上端ハンドル、safe-area余白、フォーカス復帰を提供する。768px以上は中央配置し、要求サイズに応じて最大580px（sm）、640px（md）、680px（lg）とする。幅768–1023pxはビューポート幅の90%を上限にする。
- 共通Modalのモバイル最大高さは既定で `calc(100dvh - env(safe-area-inset-top))` とし、利用側は `sheetMaxHeightClass` で上限（例: `max-h-[85dvh]`）を指定できる。
  - 反映されるのは単一の任意値クラス `max-h-[<値>]`（値内の `_` は空白に変換）のみで、複数クラスや他形式の指定は既定の `calc(100dvh - env(safe-area-inset-top))` のままとなる。85dvhは §1-5 のプリセット（75/90dvh）の中間値であり、Settingsの管理系モーダルが採用する。
  - 上端ハンドルは実要素1つで、`data-testid="modal-sheet-handle"` を持つ（テスト契約）。`index.css` の疑似要素ハンドル（幅767px以下）は `.modal-backdrop` 直下のレガシーパネルにのみ適用され、対象は次の2系統である。(a) `.modal-backdrop` 直下の `[role='dialog']:not([data-radius-exempt])::before`。(b) `.modal-backdrop` 直下で `role="dialog"` を持たず、`max-w-md`〜`max-w-7xl` のいずれかのクラスを持つパネルの `::before`（36x4px）。共通Modal（`data-radius-exempt`）にはどちらも適用せず、`.modal-backdrop` を使わない独自overlayにも疑似ハンドルは適用されない。共通Modalが表示するハンドルは実要素（`data-testid="modal-sheet-handle"`）の1つだけとする。
  - 上端角丸は16px（`rounded-t-2xl`）で §1-3 と一致する。角丸16pxは共通Modalに限る。共通Modalのダイアログは `data-radius-exempt` を持ち、`index.css` の一律角丸補正（モーダル12px／`rounded-*` 8px）から除外される。`.modal-backdrop` を使うレガシーモーダルは `--ux-radius-modal`（12px）のまま下部シート化される。
- Settingsから到達するモーダルはすべて共通Modal（実ハンドル、上端16px、`max-h-[85dvh]`）で実装する（grep確認 2026-10-15、`frontend/src/pages/SettingsPage` ほか Settings 関連コンポーネント）: ParamTypeMasterManagerModal、ParamTypeMasterModal、BaseModelSectionの各モーダル、MappingMasterEditModal、StageManagerModal、SpeechTonePresetModal、MappingMasterDeleteModal、WorkflowDeleteConfirmDialog、WorkflowManageModal、WorkflowNodePicker、WorkflowDiffReplaceModal（最後の1件は高さ指定なしで既定高さ）。WorkflowManageModal は GeneratePage からも使われる共有コンポーネントで、同画面でも同じボトムシートとなる。MappingMasterDeleteModal / WorkflowDeleteConfirmDialog の role は `dialog` のまま（共通Modalは `alertdialog` 非対応）。
  - Settingsに独自overlay（`fixed inset-0` + `role="dialog"`）として残るものはない。`SettingsComponents.tsx` の `MappingMasterModal`（`fixed inset-0`）は本番コードから未参照（テストのみ）で、Settingsから到達しない。`ServiceConnectionCard` / `SpeechToneSection` の `role="alertdialog"` は行内の確認ブロックでオーバーレイではない。
  - `.modal-backdrop` を直接使うレガシーdialog（非テスト、2026-10-15 grep）: BulkEditModal、BypassSettingsModal、CategoryManagerModal、HistoryModalPreview、LoraDetailModal、LoraRegisterModal、ParamSyncModal、ProfileBulkEditModal（本体と BulkEditConfirmView）、RescanModal、SceneGeneratorModal、SpeechBubbleEditorModal、TagSetCreateModal / TagSetDetailModal / TagSetEditModal、UploadWorkflowModal、DatasetStudioPage の OutfitMasterModal / CreateProjectModal、GeneratePage の AddAssetModal。これらにはレガシーsheet規則（下部寄せ・疑似要素ハンドル・角丸12px）が適用され、Settingsからは到達しない（UploadWorkflowModal は GeneratePage から使用）。共通Modal自身も `.modal-backdrop` 要素を用いるが、`data-radius-exempt` により疑似ハンドル・12px補正の対象外である。
- モーダルは相互に排他とし、ネスト表示しない（list→form は一覧を閉じてからフォームを開く）。唯一の例外は MappingMasterEditModal 内の WorkflowNodePicker で、共通Modalの中に共通Modalをネストして開く。このとき外側は `closeOnEsc={!isNodePickerOpen}` により Esc を無視し、Esc は内側（WorkflowNodePicker）のみを閉じる。
- **モバイル画像確認シートと全画面ビューア (REQ-372)**:
  - 画像閲覧・確認を目的とするモバイル下端起点シート（`MobileImageSheet`）は、上部セーフエリア侵食防止のため最大高さ `max-h-[88dvh]`（角丸 `rounded-t-2xl`）とし、`overscroll-contain` を適用する。操作ボタン（閉じる、ダウンロード、スナップショット保存）は最小44×44pxのHit-Slopを確保する。
  - シート内タップから移行する全画面ビューアは、シートクロームを隠蔽して画面全面（`fixed inset-0 z-50 bg-black`）に画像を展開する没入表示契約とする。Fullscreen API非対応環境（iOS Safari等）や拒否時は CSS 100dvh 全画面へ安全に縮退フォールバックする。全画面表示中はScreen Wake Lock APIで画面消灯を抑止し、全画面解除時またはタブ切替時に直ちに解放する。
- 画像閲覧を目的とする全画面プレビューだけは通常モーダル幅の上限を使わず、画像表示用の全画面契約を維持する。
- モバイルUI共通規約（§1-6）のMUI-03・MUI-04・MUI-05は、共通Modalと`.modal-backdrop`のレガシーモーダルのどちらにも適用する。LoRAおよびTag Set詳細モーダル（`LoraDetailModal`, `TagSetDetailModal`）はREQ-377により実画面検証を経て上端角丸16px（`rounded-t-2xl`）・固定フッター・単一縦スクロールボトムシート構造へ更新済み。その他のレガシーモーダルの一覧と規則は各担当PBIが実画面を確認して更新するまで維持する。

### 1-5. UI/UX アンチパターンカタログ & 4大コンポーネントプリセット

#### 1-5-1. モバイル特有のアンチパターン 10 選 & 防御策 (Mobile 10)
1. **Global Font Floor (CSS一括フォント底上げ)**
   - 現象・リスク: CSSで `html, body` やセレクタに対して `font-size: max(11px, ...)` 等を一括強制。小さなバッジやボタン枠を文字が突き破り、テキスト衝突や予期せぬ改行を招く。
   - 防御策: CSS一括上書きを全面禁止。コンポーネント側で `text-[11px]` または `text-xs` を最小トークンとして設計する。
2. **Missing min-w-0 (Flex内 truncate 不発)**
   - 現象・リスク: Flexbox内で `truncate` を付与しても、CSS Flex初期値 `min-width: auto` により子要素が縮まず、画面横幅を突き破って横スクロールが発生する。
   - 防御策: `min-w-0 flex-1 truncate` のように、Flexコンテナおよびtruncateを持つ要素自身に `min-w-0` を付与する。
3. **Centered Modal Trap (中央配置モーダルの流用)**
   - 現象・リスク: PC向けの中央ダイアログを流用。上部がアドレスバーに潜り込み、下部は仮想キーボードで潰され操作不能になる。
   - 防御策: モバイルは原則ボトムシート（上限 `max-h-[75dvh]` / `max-h-[90dvh]`、画像確認シート `max-h-[88dvh]`）に倒し、最下部に固定操作ドックを常駐させる。
4. **Double Padding (二重パディングの蓄積)**
   - 現象・リスク: 親（AppShell）が `pb-[54px+env(safe-area)]` を持っているのに、子画面が `h-[100dvh]` や `pb-24` を重ね、下部に巨大な虚無空間が生じる。
   - 防御策: 最外層コンテナがSafe Areaとバー高さを一元管理。子画面内部での全画面高さ指定（`h-[100dvh]`）や過剰な `pb` 重複を禁止（既知の例外: Settingsの `pb-[calc(6rem+env(safe-area-inset-bottom))]`、§2-4参照）。
5. **Hit Target Distortion (タッチ領域の密集・誤肥大化)**
   - 現象・リスク: 44px判定を満たすためにボタン外形を `h-11`（44px）にして画面を埋めるか、逆に小さすぎる判定（28px）が密集して誤タップする。
   - 防御策: 外形サイズと判定領域を分離（Hit-Slop拡張）。外形は `h-6 text-[11px]` のまま、`relative before:absolute before:-inset-2 before:content-['']` で透明判定のみを44pxに拡張。
6. **Virtual Keyboard Collision (キーボード起動時のfixed浮上・遮蔽)**
   - 現象・リスク: キーボード起動時、下部固定バーが画面中央に跳ね上がったり、入力中のTextareaやカーソルを覆い隠す。
   - 防御策: metaに `interactive-widget=resizes-content` 指定。入力フォーカス時に固定バーを退避（`hidden`）し、`scrollIntoView()` を発火。
7. **Input Type Misjudgment (input属性の判定雑駁)**
   - 現象・リスク: `tag === 'input'` だけでテキスト入力中と判定し、チェックボックスやラジオボタンをタップしただけでアクションバーが誤消失する。
   - 防御策: `target.tagName === 'TEXTAREA' || (target.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes(target.type))` を厳格適用。
8. **Unbroken Long String (長大英単語・ファイル名の突き抜け)**
   - 現象・リスク: LoRAファイル名やハッシュ値が1単語として扱われ、画面幅を突き抜けてページ全体を左右にガタつかせる。
   - 防御策: 長い文字列を表示する要素には、必ず `break-words` または `break-all` と `min-w-0` を付与する。
9. **Gesture Hijacking (ブラウザ標準ジェスチャー競合)**
   - 現象・リスク: スライダー操作やプレビュースワイプ時に、画面上の「引っ張って更新（Pull-to-refresh）」が誤発火して作業中のプロンプトが消える。
   - 防御策: スクロールコンテナに `overscroll-behavior-y: contain`、タップ・ドラッグ要素に `touch-action: pan-y / manipulation` を指定。
10. **Backdrop Blur Choke (過剰なブラーによるGPU酷使)**
    - 現象・リスク: デスクトップ用の `backdrop-blur-md/xl` を多用し、スマホGPUの描画負荷でスクロールが60fpsを切って激しくカクつく。
    - 防御策: モバイル時は `backdrop-blur-sm` に抑えるか、透明度付き単色背景（`bg-zinc-950/95`）で代用。

#### 1-5-2. デスクトップ特有のアンチパターン 8 選 & 防御策 (Desktop 8)
1. **Ultra-Wide Sprawl (超ワイド画面での視認性崩壊)**
   - 現象・リスク: 2560pxや4Kモニターでフォームやテキストが横一面に伸び、視線移動で著しい疲労を生む。
   - 防御策: メインコンテンツやフォームには必ず `max-w-7xl mx-auto` 等の上限コンテナ幅を設ける。
2. **DPI Blindspot (OSスケーリング崩れ)**
   - 現象・リスク: WindowsノートPCの125%/150%拡大時に、固定pxで組まれたモーダルが画面外へ見切れ、保存ボタンが押せなくなる。
   - 防御策: 固定高さを廃止し、`max-h-[85vh] overflow-y-auto` で内部スクロールさせる。
3. **Inflexible Splitter (ペイン分割幅の固定化)**
   - 現象・リスク: プレビュー画像やプロンプト欄の幅が固定され、画像を大きく見たい時やプロンプトを広く書きたい時に調整できない。
   - 防御策: Resizable Splitter（ドラッグ伸縮境界線）または折りたたみ（Collapse）ボタンを導入。
4. **Hover-Only Mystery Meat (マウスホバー依存UI)**
   - 現象・リスク: ホバーしないと「削除」「設定」ボタンが表示されず、タッチ対応PC等で操作不能になる。
   - 防御策: 重要アクションは常時薄く露出。ホバーはあくまで「色の強調」にとどめる。
5. **Keyboard Inaccessible (ショートカット・Esc欠落)**
   - 現象・リスク: 頻繁に生成を繰り返すクリエイター向けツールなのに `Ctrl+Enter`（生成）や `Esc`（閉じる）が効かない。
   - 防御策: グローバルショートカット（`Ctrl/Cmd + Enter`, `Esc`）と `focus-visible:ring-2` を担保。
6. **Missing Bulk Patterns (一括操作の欠落)**
   - 現象・リスク: 多数のアイテムがあるのに範囲選択や全選択ができず、1個ずつクリックを強要される。
   - 防御策: 一覧管理UIではネイティブな `Shift` 範囲選択と全選択ショートカットをサポート。
7. **Nested Scroll Chaining (多重スクロールバーの競合)**
   - 現象・リスク: ウィンドウ全体のスクロールとペイン内部スクロールが混在し、ホイール操作が引っかかる。
   - 防御策: `body` は `overflow-hidden` で固定し、スクロールが必要な各ペイン内部のみに `overflow-y-auto` を適用。
8. **Modal upon Modal Hell (モーダルの多重ネスト)**
   - 現象・リスク: 設定ダイアログの上でプリセット編集を開き、さらに削除確認が重なる。Escを押すと背面ごと全部閉じる。
   - 防御策: モーダルの重ね表示を禁止。確認はインライン展開にするかドロワーで階層分離。

#### 1-5-3. 4大コンポーネントプリセット (4 Component Presets with Tailwind)
1. **🪟 Preset 1: Modals & Overlays (モーダル・オーバーレイ)**
   - モバイル: 原則ボトムシート化 (`fixed inset-x-0 bottom-0 rounded-t-2xl max-h-[75dvh] overflow-y-auto`)。画像確認シートは上部余白を確保した `max-h-[88dvh]`。最下部固定アクションバー必須。中央配置は禁止。
   - 全画面ビューア: `fixed inset-0 z-50 bg-black` による全面没入表示。Fullscreen API非対応時は 100dvh 全画面へ安全に縮退。Screen Wake Lockによる画面消灯抑止と終了時の自動解放を徹底。
   - スクロール制御: `overscroll-behavior-y: contain` (`overscroll-contain`) で親ブラウザ競合を遮断。
   - GPU負荷抑制: `backdrop-blur-sm` (<=8px) または `bg-black/60` (半透明ベタ塗り)。
   - デスクトップ: 中央配置 (`sm:max-w-lg sm:mx-auto sm:my-auto sm:rounded-xl`)、多重モーダル禁止・スタック一元化。
2. **📑 Preset 2: Tabs, Chips & Grids (タブ・チップ・グリッド)**
   - 横スクロールチップ/タブ: 折り返し防止と幅維持 (`flex overflow-x-auto shrink-0 whitespace-nowrap gap-2 no-scrollbar`)。
   - Flex テキスト省略防御: `min-w-0 flex-1 truncate` を必須化。
   - 英単語・ID突き抜け防御: `break-words` / `overflow-wrap: anywhere`。
   - レスポンシブグリッド: 固定幅を排除し、DPI拡大率に対応 (`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`)。
3. **🎛️ Preset 3: Forms & Controls (フォーム・コントロール)**
   - Hit-Slop タッチ判定拡張: 見た目はコンパクトのまま透明判定を44x44pxに拡張 (`relative before:absolute before:-inset-2 before:content-['']`)。
   - ジェスチャー保護: `touch-action: pan-y / manipulation` を指定しピンチ/ダブルタップ誤動作を抑止。
   - 入力ガード: テキスト入力検知でバーを隠す際、`checkbox / radio / button` を厳格除外。
   - キーボード操作: `Ctrl+Enter`（生成）および `Esc`（閉じる）を実装。ホバーのみで押せる隠しボタンを排除。
4. **📐 Preset 4: Shell & Page Layout (シェル・ページレイアウト)**
   - ビューポート単位規約: 生の `100vh` を禁止し、`100dvh` または `min-h-[100dvh]` を使用。
   - Safe Area: 固定バーに `pb-[env(safe-area-inset-bottom)]` を組み込み、子画面の二重 `pb` を排除。
   - デスクトップ最大幅上限: `max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8`。
   - 多重スクロールバー抑止: スクロールコンテナを一元化し、親要素に `overflow-hidden` を適用。

#### 1-5-4. 重要情報の非省略ルール (Critical Information Non-Truncation Rule)
- エラーメッセージ、ID（Prompt ID, Job ID）、ステータス表示（`<code>`, `<span class="status">`, `data-id` 等）に対して安易な `truncate` を適用することを禁止する。
- 代替策: 折り返し（`break-all` / `break-words`）、複数行表示、またはクリック展開/コピー導線。

### 1-6. モバイルUI共通規約

幅767px以下（§2-4の「768px未満」と同じ境界）のモバイル表示で、複数の画面に共通して適用する規約を定める。画面固有の仕様は各画面の仕様書（SPEC_GENERATE／SPEC_HISTORY／SPEC_LORAS／SPEC_TAGS／SPEC_SETTINGS）に置き、本節は画面横断の規則だけを扱う。提案段階の資料（`docs/design/mobile-ui-redesign/`）は採否の経緯を示すものであり、規則の正本は本節とする。設計: [REQ-378設計](../design/REQ-378.md)。

#### 1-6-1. 導入状況の読み方

- 本節の規則は採用済み（規則の方向性は承認済み）である。実装への導入状況は、規則ごとに「導入前」または「導入済み」で示す。
- **導入前**: 規則として採用したが、適用PBIの完了までは適用画面の実装に反映しない。導入前の規則は現行の挙動を表さず、適用画面の現行の挙動は各画面の仕様書と本書の他の節に従う。
- **導入済み**: 適用PBIがすべて完了し、適用画面の実装と画面別の仕様書へ反映した状態を指す。
- 適用PBIの一部だけが完了した規則は「導入前」のままとし、導入を完了した画面を1-6-3の補足に記載する。
- 適用PBIは、完了時に該当する規則の導入状況を更新し、画面別の仕様書を本節に整合させる。
- 導入前の規則と画面別の仕様書が食い違う場合は、画面別の仕様書の現行記述を優先する。

#### 1-6-2. 規則一覧

| 規則ID | テーマ | 規則 | 適用画面 | 適用PBI | 導入状況 |
|---|---|---|---|---|---|
| MUI-02 | スクロール | 主要コンテンツの縦スクロールはページ全体で行い、無用な入れ子スクロール（内容を切り詰めるための子要素の独立スクロール）を作らない。独立スクロールは、その必要性を当該画面の仕様に明記した場合に限る。 | Generateの本文、LoRA・Tag Setのカード一覧、Tag SetのSubsets、Settingsの本文 | REQ-373、REQ-376、REQ-377、REQ-381 | 導入前（Tag Set SubsetsはREQ-377で導入済み。SettingsはREQ-381でページ縦スクロールを適用済み。専用workflow配線・長いinfo等の必要な内部スクロールは画面仕様に従う） |
| MUI-03 | 固定操作 | 決定・保存・生成など重要なアクションを固定表示する場合は、本文のスクロールで失われないようにし、表示階層（MUI-07）、下部余白（§2-4）、セーフエリア、キーボード表示時の挙動（§1-5-1の6・7）を一組で設計する。 | Generateの固定生成バー、LoRA・Tag Set詳細の固定フッター、Settingsの口調プリセットシート | REQ-373、REQ-377、REQ-381 | 導入前（LoRA・Tag Set画面はREQ-377で導入済み） |
| MUI-04 | アクション配置 | 同種の詳細・編集シートでは、左に戻る・取消（Close／Cancel）、右に進む・確定（Edit／Save）を配置する。用途の異なるボタンには機械的に適用しない。 | LoRA・Tag SetおよびSettingsの詳細・編集シート | REQ-377、REQ-381 | 導入前（LoRA・Tag SetはREQ-377で導入済み。SettingsはREQ-381を実装中） |
| MUI-05 | シート／画像 | 文字作業を主目的とする画面では、画像が領域を常時占有しないようにする。画像の拡大・一覧・Cover変更は、本文とは別の明確な導線で提供する。 | Generateの画像確認、LoRA・Tag SetのCover・Snapshot | REQ-372、REQ-377 | 導入前（Generate画像確認はREQ-372、LoRA・Tag Set画面はREQ-377で導入済み） |
| MUI-06 | 操作領域 | 主要操作の有効タップ領域は§1-3の最小44×44pxを維持し、隣接する操作と誤タップしない間隔とフォーカスの視認性を確保する。見た目の外形を小さくする場合は§1-5-3のHit-Slopで有効領域を保ち、誤タップと操作効率を実機で確認する。 | Generateのタブ・チップ、LoRA・Tag Setの削除／編集・フッター・ドラッグ、Historyのカード操作・選択操作、Settingsの操作 | REQ-372、REQ-373、REQ-374、REQ-375、REQ-376、REQ-377、REQ-381 | 導入前 |
| MUI-07 | 表示階層 | 通常の本文・チップ・ドラッグ対象は固定操作を覆わない。モーダル・シート・ポップオーバーは用途に応じた階層とし、既存の重なり順（§4-4-1）と排他規則（§1-4）を変更しない。 | Generateのタグと生成バー、LoRA・Tag SetおよびGenerateのシート・画像ギャラリー、Settingsのinfo／シート | REQ-372、REQ-377、REQ-381 | 導入前 |
| MUI-08 | 情報階層 | 一覧では識別に必要な情報を優先し、詳細データは詳細画面に置く。行数制限や省略で隠れる情報には、全文を確認できる経路（詳細表示・展開・コピー等）を残す。§1-5-4の重要情報は省略の対象にしない。 | LoRA・Tag Setの固定サイズカード、Settingsのinfo化する補足説明 | REQ-376、REQ-381 | 導入前 |
| MUI-09 | 入口の一貫性 | 同じ編集対象・目的に入る複数の導線は、開く画面の状態・見た目・確定動作を揃える。 | Tag Setのカードからの編集と詳細からの編集 | REQ-377 | 導入済み |
| MUI-10 | ジェスチャー | 横移動（スワイプ・横スクロール）、縦スクロール、ドラッグ、チップ操作、入力、支援技術の操作が競合しないようにする。ジェスチャーでのみ実行できる操作を作らず、タップ操作の代替経路を残す。§1-5-1の9の保護を維持する。 | Generateのスワイプ、一覧の並べ替え・選択、Settingsの本文tab swipe | REQ-373、REQ-375、REQ-376、REQ-381 | 導入前 |
| MUI-11 | 複数選択 | モバイルの複数選択では、上部に「×＋選択件数＋補助選択操作」、下部に画面固有の一括操作を表示し、状態表示と操作の役割を分離する。詳細は§5-6。 | History一覧・アルバム詳細、Generate履歴 | REQ-375 | 導入前 |

#### 1-6-3. 規則ごとの補足

- **MUI-02**: シート・モーダル本体の内部スクロール（§1-4）、横スクロールのタブ・チップ列（§1-5-3）、展開パネル内のスクロール（§4-4-1）は、従来どおりとし本規則の対象外とする。Tag Set詳細・編集のSubsets一覧の独立スクロールはREQ-377で撤廃し親コンテナ縦スクロールへ統合完了。Settingsの本文はページ縦スクロールとし、専用workflow配線や長いinfo等に必要な内部スクロールだけをSPEC_SETTINGSで定める。
- **MUI-03／MUI-07**: Generateの固定生成バーとタグチップの重なりの修正（REQ-371）は、本規則の導入PBIではなく先行する不具合修正である。その受け入れ条件を、MUI-03・MUI-07の回帰条件として扱う。LoRA・Tag Set詳細の固定フッターはREQ-377で導入完了。Settingsの口調プリセットシートはREQ-381で固定操作・keyboard時の到達性と共に適用し、info／シートは既存の重なり順と排他規則を保つ。
- **MUI-04**: Generateの用途の異なるボタン（生成・保存・画像操作など）には適用しない。LoRA・Tag Setの詳細・編集シート（左Close/Cancel、右Edit/Save）はREQ-377で導入完了。Settingsの口調プリセットシートも左Cancel／右Saveとする（REQ-381）。
- **MUI-05**: Generateの画像確認はREQ-372で導入済み。LoRA・Tag Set詳細における小型Cover行および画像ギャラリーサブビュー展開はREQ-377で導入完了。
- **MUI-06**: 有効タップ領域を44px未満にする例外は、画面別PBIで理由と影響を記録し、ユーザーの判断を得る。Settingsの主要操作も44×44px以上を保つ（REQ-381）。
- **MUI-08**: Generateには、同一のカード規則を強制しない。Settingsでは必要な詳細説明をinfoから全文確認できるようにし、警告・error・未保存を隠さない（REQ-381）。
- **MUI-09**: 導線を揃える方向（どちらの画面に統一するか）は、適用PBIの設計で決める。Tag Setではカード編集アイコンと詳細内Editボタンの双方から同一の `TagSetDetailModal` 編集モードを開くようREQ-377で統一完了。
- **MUI-10**: 既存の長押し起点の操作（§5-1と§5-6の長押しによる選択モードの開始、SPEC_HISTORYのタッチ操作による並べ替えなど各画面の仕様書に記載の操作）は、本規則の例外として従来どおりとする。理由は、これらが各画面の仕様書で定められた既存の操作であり、本規則の導入だけで変更すると画面別の仕様書と食い違うため。例外の範囲は上記の既存の操作に限り、新たに設けるジェスチャー起点の操作には本規則を適用する。タップ操作の代替経路の要否と内容は、適用PBI（REQ-375、REQ-376）の設計で決める。Settingsの本文swipeは縦scrollや操作対象と競合しないようSPEC_SETTINGSで限定し、直接tab選択を残す（REQ-381）。
- **MUI-11**: 対象画面の範囲とデスクトップとの違いは§5-6に定める。LoRA・Tag Set・Settingsの既存の複数選択は対象に含めない。

#### 1-6-4. 画面固有の値は共通トークンではない

各画面の提案で示された寸法・数値・行数（タブの高さ、一覧カードの高さと行数の配分、タグチップの余白、下部スクロールの余白、ナビゲーションの高さの扱いなど）は共通トークンではなく、各画面のPBI（REQ-372〜REQ-377）の設計で決める。本節の規則は原則だけを共有する。既存の共通値（§1-3の44px、§2-4のボトムナビの高さ）は、本節では変更しない。

#### 1-6-5. 共有部品に関する未承認事項

次は規則の採用とは別に判断する未承認事項である。現状の仕様や実装を変更するものとしては記載せず、各行の担当PBIの設計時に影響調査と個別の承認を経て決める。

| 項目 | 判断が必要な内容 | 影響画面 | 判断の場 | 状態 |
|---|---|---|---|---|
| `TagChipEditor`／`TagChip` のチップ密度 | チップの寸法・編集操作を変えるか。Generate限定の例外とするか、共有部品として全利用箇所で変えるか。MUI-06の有効タップ領域との両立。 | Generateのプロンプト、Tag Setの作成・編集（`TagSetFormFields` 経由）、LoRA、Studio（`MatrixGenerationStep`） | 担当: REQ-384 | 未承認 |
| `ImageCarousel` の中央配置 | カード画像の中央配置を共有部品のグローバルな変更とするか、一覧側の対応にとどめるか。 | LoRA・Tag Setの一覧、`ImageCarousel` の他の利用箇所（§4-2） | REQ-376の設計時（影響調査） | 未承認 |
| `MultiSelectToolbar` の統合 | モバイルの状態バー・下部ドック（§5-6）を共有部品（`MultiSelectToolbar`／`useMultiSelect`）へ統合するか、画面ごとの適用にとどめるか。Generateは画面内の独自の選択バーを使う。 | History一覧・アルバム詳細、Generate履歴、`MultiSelectToolbar` を使うLoRA・Tag Set・Settings | REQ-375の設計時（利用箇所の調査） | 未承認 |
| `TagSetFormFields` のスクロール仕様 | Subsetsの内部スクロール（`max-h-[160px] overflow-y-auto`）を廃止し親コンテナへ統合。全利用箇所（TagSetDetailModal, TagSetCreateModal, TagSetEditModal）への影響調査を経て承認・適用。 | Tag Setの作成・編集、`TagSetFormFields` の全利用箇所 | REQ-377 | 承認済み・導入完了 |
| その他の共有部品 | `TagChipInput`／`TagChipViewer` の視覚の統一、詳細シート・固定フッターの共有コンポーネント化、`PageHeader`／`AppShell`、ドラッグ・ポップオーバー基盤の変更。 | 各画面 | 各PBIの設計時（影響調査と回帰確認） | 未承認 |

#### 1-6-6. 既存の記述との関係

- **§1-3（操作対象44px）**: 44×44pxを最小値として維持する。MUI-06は同じ値を再確認するものであり、画面ごとの短縮は例外として扱う（MUI-06の補足）。
- **§1-4（共通モーダルとレガシーモーダル）**: MUI-03・MUI-04・MUI-05は、詳細・編集シートが共通Modalか`.modal-backdrop`を使うレガシーモーダルかを問わず適用する。LoRAおよびTag Set詳細モーダル（`LoraDetailModal`, `TagSetDetailModal`）はREQ-377により実画面検証を経て上端角丸16px（`rounded-t-2xl`）・固定フッター・単一縦スクロールボトムシート構造へ更新済み。その他のレガシーモーダルの分類と一覧は各担当PBIが実画面を確認して更新するまで維持する。
- **§2-4（モバイル: ボトムナビゲーション）**: ボトムナビの高さと下部余白は変更しない。ナビの直上に固定する要素（§5-6の一括操作ドック）は、ナビの実際の高さとセーフエリアに追従し、本書は別の高さの値を定義しない。
- **§5（複数選択UIパターン）**: モバイルの対象画面に限り、§5-6を§5-2の例外とする。デスクトップと対象外の画面は§5-1〜§5-5のままとする。

---

## 2. App Shell（共通レイアウト）

### 2-1. 構成ファイル

`frontend/src/components/layout/AppShell.tsx`

### 2-2. デスクトップ: サイドバー

- 画面幅1024px以上では左固定サイドバー（`w-56` / 224px、折り畳み時 `w-16` / 64px）を表示する。
- 300ms のスムーズなトランジションで折り畳み切り替え
- 折り畳み状態は localStorage キー `prompt-surgeon-sidebar-collapsed` で永続化
- トグルボタン ID: `#sidebar-toggle`
- ナビゲーションアイテム:

| アイコン | ラベル | ルート |
|---|---|---|
| Zap | Generate | `/` |
| Sparkles | Studio | `/studio` |
| Layers | LoRAs | `/loras` |
| Tag | Tags | `/tags` |
| Clock | History | `/history` |
| Settings | Settings | `/settings` |

アクティブ状態: テキスト・アイコンを `accent-green`（`#3ECF8E`）でハイライト

### 2-3. タブレット: レールナビゲーション

画面幅768–1023pxでは左側に幅56pxのコンパクトなナビゲーションレールを表示する。画面幅1024px未満ではフル幅224pxのサイドバーを表示しない。

### 2-4. モバイル: ボトムナビゲーション

- 画面幅768px未満では画面下部に高さ54pxのナビゲーションを固定し、safe-area insetを加味する。
- アイコン ＋ ラベルテキスト（Generate / Studio / LoRAs / Tags / History / Settings）を表示
- 全ページで同一のルーティング（`/`, `/studio`, `/loras`, `/tags`, `/history`, `/settings`）を共有
- ボトムナビは幅768px未満のみ表示する。ページ最下部の操作要素が隠れないよう下部余白を確保する。固定ボトムナビは高さ `54px + env(safe-area-inset-bottom)`、AppShellの`main`は同値の`pb-[calc(54px+env(safe-area-inset-bottom))]`（`md:pb-0`）を持つ。CSS変数 `--bottom-nav-height` は定義しない。Settingsは `pb-[calc(6rem+env(safe-area-inset-bottom))]`（768px以上で `md:pb-5`）を追加する。これは §1-5 の Double Padding 防止の既知の例外で、スクロール領域最終の操作要素をナビ上に確保するためSettingsに限り許容する。タブレットrail（768–1023px）とデスクトップsidebar（1024px以上）ではこの下部余白を適用しない。
- ナビの直上に固定する要素（§5-6の一括操作ドック）は、上記のナビの高さとセーフエリアに追従して配置する。本節は新しい高さの値やCSS変数を定義せず、そのドックを導入するまでの下部余白は上記のとおりとする（導入状況は§1-6-2に従う）。

設定ページ固有のタブ、responsive、localStorage契約は [SPEC_SETTINGS.md](./SPEC_SETTINGS.md) を参照する。ここでは共通AppShellのナビゲーション境界を定義し、設定内のタブ状態や詳細開閉状態は定義しない。

### 2-5. Generateの可変分割（REQ-334）

デスクトップGenerateは、入力を担う左ペインとプレビュー/アクションを担う右ペインを分割線で区切る。分割比率は利用者の変更に応じて保存し、再表示時に復元する。最大幅へ到達した状態で更にサイクル操作を行う場合は開始比率へ戻す。画面幅800pxでは左ペインを330pxとし、右側に永続ActionBarとプレビュー領域を配置する。モバイルGenerateはこの分割を使わない。詳細は[SPEC_GENERATE.md](./SPEC_GENERATE.md)を参照。

---

## 3. TagChipEditor コンポーネント

### 3-1. 概要と位置づけ

`mapping_master.input_type === "textarea"` のフィールドに適用するタグ入力コンポーネント。  
各タグをチップとして視覚的に表示し、有効/無効のトグル、並び替え、タグ強度（重み）調整を可能にする。

### 3-2. ファイル構成

```
frontend/src/components/TagChipEditor/
  index.tsx           — メインコンポーネント（テキスト/チップ切替、イベントリスナー）
  TagChip.tsx         — 1チップの UI（有効/無効/編集中/重み調整メニュー）
  TagInput.tsx        — 新規タグ入力フィールド（カンマ・Enter確定・ペースト一括入力）
  useChipHistory.ts   — Undo/Redo 管理フック
  useChipParser.ts    — テキスト文字列 ↔ TagChip[] 相互変換
  idGenerator.ts      — チップユニーク ID 生成
  tagChipEditor.css   — ドラッグ中スタイル等
  __tests__/          — ユニットテスト
```

### 3-3. データ構造

```typescript
type TagChip = {
  id: string;          // 衝突耐性のあるユニークID (idGenerator.ts により生成)
  text: string;        // タグ文字列（trim 済み、(tag:1.2) のような重み付き文字列も含む）
  enabled: boolean;    // false = 無効化（グレーアウト）
  converting?: boolean; // 変換処理中フラグ（過渡的一時状態。API送信や永続化時には除外）
};
```

### 3-4. Props

```typescript
interface TagChipEditorProps {
  id?: string;
  value?: string;                         // カンマ区切りプロンプト文字列（フォールバック用）
  onChange?: (val: string) => void;       // 有効チップのみをカンマ連結した文字列を返す
  chips?: TagChip[];                      // 構造体チップ配列（SSoT）
  onChipsChange?: (chips: TagChip[]) => void; // チップ変更通知（無効タグ保持）
  placeholder?: string;
  variant?: string;
  defaultTextMode?: boolean;              // テキストモード初期状態
  isAnimaMode?: boolean;                  // 自然言語/Anima向けモード
  onTextModeToggle?: (isTextMode: boolean) => void;
}
```

### 3-4-1. ライフサイクル保持仕様
- 画面遷移、アコーディオン開閉、モバイルタブ切替、Multi-Set切替において、無効タグ（`enabled: false`）を含めた完全なトークン配列が親ストア（`useGenerationStore.promptChips`）と `chips` / `onChipsChange` を介して双方向同期・保持される。
- `chips` prop が渡されている状態でも、親コンポーネントからの `value`（平文文字列）の更新（セクションコピペ機能 `PromptSectionClipboardMenu` や翻訳適用、履歴貼り付け等）が行われた場合、`chipsToString(state) !== value` を検知して最新の文字列を基にタグチップが再パース・更新される。
- 各レイアウト（`DesktopLayout`, `MobileLayout`）における `TagChipEditor` のキーには `key={`${activeSetId}-${role}`}` を適用し、プリセット切替時にコンポーネントが適切なキーで分離され、`multiSetSlice.loadPresetData` において `paramValues` から初期 `promptChips` が確実に補完・同期される。
- ComfyUI投入時およびスナップショット生成時は、機械的導出ヘルパー `getEffectiveParamValues`（`chipsToString`）により有効チップ（`enabled: true`）のみが平文マップ（`effectiveParamValues`）として抽出され、安全かつ確定的に送信・記録される。

### 3-5. チップのインタラクション

| 操作 | 動作 |
|---|---|
| クリック（テキスト部） | サブメニュー表示（タグ名直接編集、有効/無効トグル、**タグ強度（重み）スライダー調整**）。展開時に確定済み本文の和訳カードを自動表示する |
| サブメニュー内タグ名入力 | タグ単語のインライン編集（Enter/Blurで確定、既存重みを維持）。編集中は直前の確定本文に対応する和訳を維持し、確定後は新しい本文で自動取得してカードを更新する。Escapeでは入力を取り消してサブメニューを閉じる |
| 和訳カード | 取得中、失敗、空応答、タイムアウトの状態を表示する。新しい本文の取得中は直前の和訳を維持し、タイムアウト後も取得処理は継続する。本文が変わった後に到着した古い取得結果は表示しない |
| 翻訳ボタン | 和訳カードの表示を任意に切り替える |
| サブメニュー内強度スライダー | `(tag:0.5)` 〜 `(tag:2.0)` の範囲で強度をリアルタイム更新（1.0 の場合は通常タグに復帰） |
| `×` クリック | チップ削除 |
| ドラッグ&ドロップ | 並び替え（@dnd-kit/sortable、マウス最小8px移動 / タッチ最小5px移動、面積重複20%以上またはポインタ直下進入による即時スロットシフト判定、およびヒステリシスによるチャタリング抑止、半透明ゴースト表示） |
| ダブルクリック | チップ直接インライン編集モード |
| `Delete` / `Backspace`（チップ本体フォーカス中） | チップ削除（※サブメニュー展開中や強度入力欄フォーカス時は伝播遮断されチップ削除は抑止される） |
| `Space`（チップ本体フォーカス中） | 有効 ↔ 無効 トグル（※サブメニュー展開中は伝播遮断） |
| `Ctrl+D`（チップ本体フォーカス中） | チップ複製（※サブメニュー展開中は伝播遮断） |
| サブメニュー内でのキーボード操作 | キー伝播境界（`e.stopPropagation()`）により親チップショートカットへの漏洩を防止。強度直接入力欄での `Backspace`/`Delete` による数値編集が可能。`Escape` でサブメニュー終了。 |

### 3-6. 新規タグ入力（TagInput）

| 操作 | 動作 |
|---|---|
| カンマ / Enter / Tab | カーソル前テキストをチップ化・確定（カンマは除去） |
| ピリオド（Animaモード時） | `isAnimaMode: true` かつ括弧ネスト外の場合、末尾ピリオドを保持したままチップ化・確定（例: `a cat.` → `[a cat.]`） |
| ペースト（複合区切り） | 通常モード時はカンマ区切り、Animaモード時はカンマまたはピリオド（小数点除く）で複数チップを一括生成 |
| Backspace（フィールドが空） | 直前チップを削除 |

### 3-7. テキスト変換とパース規則

- **括弧・重み記法の保護**: `(tag:1.2)` や `(tag1, tag2:1.3)` のような括弧ネスト内のカンマおよびピリオドは分割せず、1つのタグトークンとして保持する。
- **Animaモード（自然言語・文構造）のピリオド分割**:
  - `isAnimaMode: true` の場合、括弧ネスト外のピリオド（`.`）を文区切りとして認識し、末尾にピリオドを保持したままチップ化する。
  - 数字に挟まれたピリオド（例: `1.5`、`0.05`）は小数点として判定され分割から保護される。
  - この変換は `mapping_master.input_type === "textarea"` の prompt role にだけ適用する。checkpoint、LoRA、数値など他のパラメータ値はプリセット読込・一括更新・生成時にチップ化またはチップ値で上書きしない。
  - チップの単語・強度編集は、編集後のチップ末尾に明示されたピリオドだけを保持する。Anima モード単独ではピリオドを補完しない。
- **空トークン除外**: 連続カンマ `,,` や空白のみ、または区切り文字（`.`, `,`）と空白のみで実質的内容を含まないトークンは自動的に除外される。
- **プロンプト文字列結合（chipsToString）**:
  - 通常モード（`isAnimaMode: false` / デフォルト）: 後方互換性を保ち、有効チップを一律 `", "` で結合。
  - Animaモード（`isAnimaMode: true`）: 直前の有効チップがピリオド（`.`）で終端している場合は半角空白 `" "` で後続チップと結合し、それ以外の場合は `", "` で結合。

```typescript
// 文字列分割（カンマ / Anima時ピリオド）
function splitTags(text: string, isAnimaMode: boolean = false): string[];

// 文字列 → チップ配列
function parseToChips(text: string, isAnimaMode: boolean = false): TagChip[];

// チップ配列 → 文字列（ComfyUI 投入・onChange 用）
function chipsToString(chips: TagChip[], isAnimaMode: boolean = false): string;
```

### 3-8. Undo/Redo

`useChipHistory.ts` で `useReducer` + `useRef` によりチップ列のスナップショット履歴を管理。履歴上限: 50件。

| ショートカット | 動作 |
|---|---|
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |
| `Ctrl+D`（フォーカス中） | チップ複製 |
| `Space`（フォーカス中） | 有効 / 無効 切り替え |
| `Delete`（フォーカス中） | チップ削除 |

### 3-9. テキスト入力モード（エスケープハッチ）

右上の「テキスト入力モードに切替」で `textarea` に戻せる。  
- チップ → textarea: 有効チップのみをカンマ連結して反映  
- textarea → チップ: テキストをカンマ分割して再チップ化（無効チップは復元されない）

### 3-10. Audit 機能との連携（カスタムイベント契約）

親（GeneratePage等）とチップエディタ間の疎結合を保つためにグローバルなカスタムイベントを利用して動的に連携する。

```typescript
// イベントペイロード型定義
interface TagChipEventDetail {
  tag: string;
}
```

- **干渉タグ診断結果（無効化）**:
  - 親側の無効化ボタン押下時に `window.dispatchEvent(new CustomEvent('tag-chip-editor:disable-tag', { detail: { tag } }))` が発行される。
  - チップエディタ側でこのイベントを検知し、一致するタグチップの `enabled` ステータスを `false` にトグル（無効化・グレーアウト）する。
- **語彙サジェスト結果（追加）**:
  - 親側の追加ボタン押下時に `window.dispatchEvent(new CustomEvent('tag-chip-editor:add-tag', { detail: { tag } }))` が発行される。
  - チップエディタ側でこのイベントを検知し、新規タグチップとして末尾に追加する。

---

## 4. 共通 UI コンポーネント & フック

### 4-1. ImageCropper (`components/ImageCropper.tsx`)
- LoRA / TagSet のサムネイル画像登録時に、プレビュー画像の自由なアスペクト比切り抜きを行うモーダルコンポーネント。

### 4-2. ImageCarousel (`components/ImageCarousel.tsx`)
- 複数枚のプレビュー画像やスナップショット画像を一覧表示・スライド切替する軽量カルーセル。

### 4-3. InlineCategorySelect (`components/InlineCategorySelect.tsx`)
- カード内やリスト内でカテゴリをワンクリックで直接切替可能なドロップダウン。

### 4-4. PageHeader (`components/common/PageHeader.tsx`)
- アイコン・ページタイトル・アクションボタンを一貫して配置する共通ヘッダーコンポーネント。
- ヘッダーの展開アクション（トリガーを押して開くメニュー／ポップオーバー）は §4-4-1 の契約に従う。

### 4-4-1. 共通ヘッダー展開アクション契約（REQ-346）

共通ヘッダー（`PageHeader` の `actions` スロットと右クラスタ）に置く展開アクションは、ヘッダー内の高さ制限で切り詰められず、ページ内容に重ねてヘッダー下へ展開する。実装の共通プリミティブは `components/common/header/HeaderDropdown.tsx`（配置計算は `headerMenuPlacement.ts`）。

| 項目 | 契約 |
|---|---|
| 重なり展開 | パネルは `document.body` へのポータルで `position: fixed` 描画し、ヘッダー高さ・ページ高さ・スクロール高さを押し広げない。`actions` スロットの `overflow-x-auto` に切り詰められない |
| 配置 | 上端は**ヘッダー下端＋6px**（ヘッダー＝`PageHeader` のルート要素。モバイルで 2 行目へ折り返した `actions` 行・`subtitle`・`children` を含む全体の下端）。トリガーがヘッダー内のどの行にあっても同じで、パネルはヘッダーに重ならない（トリガー下端がヘッダー下端より下に出る場合のみトリガー下端＋6px）。ヘッダーの外で使う場合（`PageHeader` の祖先がない場合）はトリガー下端＋6px へ縮退する。左右はトリガー基準（`align` は start／end）で 8px の余白を保ってビューポート内へクランプ。最大幅は `calc(100vw - 16px)` |
| ヘッダー基準 | `PageHeader` のルート要素に `data-page-header-root` 属性を付け、`HeaderDropdown` がトリガーの最寄り祖先のこの要素の下端を計測のたびに読み直す（sticky・モバイルでヘッダーがページとともにスクロールする構成でも追従）。トリガー下端は、アンカーラッパーと直接子要素（`-m-2` 等のヒットスロップ）の下端の最大で計測する |
| 高さの切り詰め禁止と末尾到達性 | ヘッダー高さで切り詰めない。最大高さは `visualViewport.height`（なければ `innerHeight`）−上端（ヘッダー下端＋6px）−8px で、超過分はパネル内スクロール（`overflow-y: auto`、`overscroll-behavior: contain`）により最後の項目へ画面内で到達・押下できる。内容が最大高さに収まるときはスクロール不要。ヘッダーが高い（モバイルの折り返し）ほど最大高さは小さくなる |
| 重なり順 | `--z-header-menu: 60`（ボトムナビ 50 より前面、共通Modal 100 より背面）。背景内容・固定ボトムナビに隠れない |
| 開閉（click 型） | トリガー再押下で閉じる。外側 `pointerdown`/`mousedown` で閉じる。開閉状態は呼出側が持つ（`HeaderDropdown` は制御型でトリガー種別に依存しない）。ウィンドウ resize／向き変更／スクロール中は再計測する。ヘッダー自身の高さ変化（折り返し行数の変化など）にも追従する（`ResizeObserver`。未対応環境では resize／スクロールのみ）。トリガーが画面外または残り高さが 96px 未満なら閉じる。ページがレイアウトを切り替える幅（Generate は 768px の Desktop／Mobile）を跨いで resize した場合は、ページ側がヘッダーごとトリガーを再マウントするためメニューが閉じる（正常）。新しいサイズで開き直せば最後の項目に到達・押下できる。同一レイアウト内の resize では開いたまま追従する |
| 開閉（hover 型） | ポインター進入で開き、ポインターがトリガー・ブリッジ・カードのいずれの上にも無くなると閉じる（遅延なし）。外側 `pointerdown`/`mousedown` でも閉じる。トリガーとカードの間の隙間は、`HeaderDropdown` の `hoverBridge` が描画する透明ブリッジ（`position: fixed`、`aria-hidden`。トリガー下端からカード上端までを埋める。上端がヘッダー下端基準のため隙間は可変で、1 行ヘッダーで約20px、折り返しヘッダー（640〜767px の Generate Mobile 等）で約80〜90px。カード非表示（640px 未満）では描画しない）で埋め、ポインターをカード内へ移動してもカードが閉じない（カード内スクロールのため）。クリックによるトグルは持たず、「再押下で閉じる」は「ポインター離脱／外側押下で閉じる」に読み替える。配置・高さ上限・スクロール・重なり順・追従は click 型と同一。640px 未満では表示しない |
| 将来の展開アクション | 共通ヘッダーへ追加する展開アクション（click 型・hover 型いずれも）は `HeaderDropdown` を使うか同等にこの契約を満たし、E2E の検証一覧（`frontend/e2e/` 配下の header 重なり検証スペック）へ追加する。ヘッダーより高い内容でも下端まで表示され末尾項目へ到達できること。hover 型は `HeaderDropdown` の `hoverBridge` を指定する |
| 非目標 | Escape キー、フォーカストラップ／復帰、ブラウザズーム対応、hover 型の開閉遅延やクリック開閉の追加、内容項目・保存動作の変更は本契約に含めない |

対象アクション（2026-10-16 時点。`HeaderDropdown` 適用）:

| 区分 | アクション | 実装 |
|---|---|---|
| 適用 | ワークフロー設定（`#workflow-actions-btn`、Generate Desktop／Mobile） | `pages/GeneratePage/components/WorkflowActionsMenu.tsx` |
| 適用 | ヘッダーメニュー（キャッシュ／ストレージ、`#header-kebab-btn`、全ページ） | `components/common/header/HeaderKebabMenu.tsx` |
| 適用 | モバイル VRAM ピル展開（640px 未満。640px 以上へ拡大すると閉じる） | `components/common/header/ResourceHoverMonitor.tsx` |
| 適用（hover 型） | デスクトップ資源ホバーカード（640px 以上、`role=tooltip`、`data-testid="resource-hover-card"`） | 同上（A3 と同一ファイル。ブリッジ `resource-hover-card-bridge`（`HeaderDropdown` が描画）を含む） |

検証幅（既存サポート範囲）: mobile 375／639／767、tablet 768／1023、desktop 1024／1280。短い高さ 360 でメニュー内スクロールを確認する。hover 型（640px 以上のみ表示）は 640／768／1024／1280 で確認する。全アクションで、開いたパネルの上端がヘッダー下端＋6px であることを確認する。開いたままの resize は同一レイアウト内（Desktop 内・Mobile 内）で確認し、レイアウト境界を跨ぐ場合は「閉じる→開き直して最後の項目に到達・押下できる」ことを確認する。

### 4-5. useThumbnailAspectRatio (`hooks/useThumbnailAspectRatio.ts`)
- アプリケーション全体（History、LoRAs、Tags）のサムネイル表示アスペクト比（1:1, 3:4, 4:3, 16:9 等）を localStorage で一元管理し、CSS クラス・スタイルを提供するフック。

---

## 5. 複数選択 UI パターン (Multi-Select UI Patterns)

各画面（LoRAsPage、TagsPage、HistoryPage、SettingsPage、GeneratePage）で統一して使用される複数選択および一括操作機能の共通設計仕様。

モバイル（幅767px以下）のHistory一覧・アルバム詳細・Generate履歴には、§5-6のモバイル複数選択パターン（MUI-11、導入前）を適用する。デスクトップと上記以外の画面は§5-1〜§5-5のとおりとし、§5-6の導入前の間は、モバイルを含めて各画面の現行の選択UI（§5-1〜§5-5と各画面の仕様書）が現行の挙動である。

### 5-1. useMultiSelect フック
- **状態管理**: `isMultiSelectMode`, `selectedIds` (Set) を管理。
- **操作トリガー**:
  - `Ctrl + クリック` / `Meta + クリック`: 対象アイテムを選択しつつ、複数選択モードをON。
  - `Shift + クリック`: 最後に選択したアイテムから、今回クリックしたアイテムまでの範囲をまとめて選択状態。
  - **長押し (Long Press)**: アイテムを 500ms 以上長押し（タッチ長押し含む）することで複数選択モードを起動。長押し時間は設定画面でカスタマイズ可能。
- **選択解除/終了**: `exitMultiSelectMode()` により選択モードをOFFにし、選択状態を全てクリア。

### 5-2. 複数選択ツールバー (MultiSelectToolbar)
- 複数選択モードが有効な際、画面上部にスライド表示される共通ツールバー。
- **表示内容**: 選択件数 / 全体件数、全選択、選択解除、選択モード終了ボタン、画面固有アクションボタン。
- **適用範囲**: 上記の構成（画面固有アクションを上部のツールバーに含める）は、デスクトップと§5-6の対象外の画面に適用する。§5-6の対象画面のモバイルでは、導入後は§5-6が優先し、画面固有アクションを下部の一括操作ドックへ分離する。

### 5-3. 一括編集モーダル (BulkEditModal)
- 複数選択されたアイテムのフィールドを一括で更新するためのモーダルダイアログ。
- カテゴリ、推奨強度範囲、テキスト入力、対象BaseModel等を一括更新（`Promise.all` で送信）。

### 5-4. プリセット一括編集モーダル (ProfileBulkEditModal) (REQ-283, REQ-297)
- 複数選択されたワークフロープリセット（`WorkflowPreset[]`）に対するプロンプト操作およびパラメータ一括更新モーダル。
- **REQ-297 機能拡張仕様**:
  - **ワンクリック入力クリア (AC-1)**: 検索・置換・追加・上書きテキストエリア右端にクリアボタンを配置。未クリア時はモーダル開閉中も入力値が保持される。
  - **パラメータ適用後の自動解除 (AC-2)**: 「一括適用」実行後、パラメータ項目のチェックボックスが自動的に全解除され、意図しない連続適用を防止。
  - **適用完了後のモーダル維持およびESC制御 (AC-3)**: 適用後もモーダルを閉じずに維持し連続編集を可能にする。モーダルは明示的なキャンセル/クローズボタンまたは `Escape` キー押下で閉じる。
  - **共通タグの動的サブセット抽出 (AC-4)**: 共通タグ編集時に対象プリセットの個別チェックボックス（全選択/全解除付き）で対象絞り込みを行い、選択サブセットの共通タグを即時再集計。`targetPresetIds` をペイロードに伝播。
  - **プロンプト対象欄のモード別排他制御 (AC-5)**: 「検索・置換」は複数対象フィールドの選択可（「すべて対象」チェックあり）。「全置換（上書き）」「先頭に追加」「末尾に追加」は単一排他的選択（ラジオボタン）。モード切替時は先頭1件にフォールバック。
  - **パラメータインクリメンタル検索 (AC-6)**: パラメータ一覧上部にインクリメンタル検索入力を備え、名称・役割の部分一致（大文字小文字無視・正規表現メタ文字安全）で絞り込み。非表示中アイテムのチェック状態も維持・適用。
  - **共通タグ編集サブメニュー統一 (AC-7)**: タグチップ本体クリックで詳細編集サブメニュー（ポップオーバー）を開き、文言編集・強度段階調整（±0.1, ±0.3）を実施。独立した `X` ボタンで削除対象へマーク。
- モジュール分割構成（`frontend/src/components/ProfileBulkEditModal/`）：
  - `index.tsx`: モーダル枠・タブ切替（Prompt / Params）・プレビュー確認遷移
  - `types.ts`: `BulkEditPayload`, `CommonTagItem`, `CommonLoraOp` 等の型定義
  - `utils.ts`: 純粋計算関数（`parseTagWeight`, `formatTagWithWeight`, `computeCommonTags`, `computeCommonLoras`）
  - `useProfileBulkEditState.ts`: モーダル内部状態管理フック
  - `buildPayload.ts`: 送信用 `BulkEditPayload` 構築
  - `BulkEditConfirmView.tsx`: 適用前変更サマリー確認画面
  - `tabs/PromptBulkEditTab/`: プロンプト検索置換・追加・上書き・共通タグ強度変更/削除
  - `tabs/ParamBulkEditTab/`: パラメータ型別一括編集・LoRAスタック（差分/上書き）・バッチサイズ
- 全構成ファイルは単体責務に分離され最大250行以下を遵守。

### 5-5. ドラッグ＆ドロップ（グループ移動オーバーレイ）
- 複数選択モード中のドラッグ操作時は、ドラッグ中アイテムに加えて `+N` バッジが浮遊表示され、選択アイテムが並び順を維持したまま一括で移動・並び替え（`reorder`）される。

### 5-6. モバイル複数選択パターン（MUI-11）

- **適用範囲**: 幅767px以下のHistory（スナップショット一覧・アルバム詳細）とGenerateの履歴。デスクトップ（768px以上）と、LoRAs・Tags・Settingsなど`MultiSelectToolbar`を使う既存の複数選択は、§5-1〜§5-5のままとする（適用の拡大は別途判断する）。
- **導入状況**: 導入前（適用PBI: REQ-375）。完了までは、各画面の現行の選択UI（§5-1〜§5-5と各画面の仕様書）が現行の挙動である。
- **役割の分離**: 上部は選択状態、下部は選択した対象への操作とする。

| 要素 | 位置 | 規則 | §5-2の既存パターンとの関係 |
|---|---|---|---|
| 選択状態バー | 画面上部 | 「×」と「N件（またはN枚）選択中」を主情報として横並びに表示し、補助の選択操作として「すべて選択」「選択解除」を置く。 | 件数・全選択・選択解除・終了を状態バーにまとめる。全体件数の表示は本節では規定しない。 |
| ×（選択モード終了） | 状態バー | 選択モードを終了し、選択をクリアする。アクセシブルな名前は「選択モード終了」とし、操作領域は§1-3に従う。 | §5-2の選択モード終了ボタンに相当する。 |
| すべて選択／選択解除 | 状態バー | 「すべて選択」は対象を全選択する。「選択解除」は選択を0件に戻すが、選択モードは終了しない。0件時の無効状態など選択のロジックは従来を維持する。 | 従来の全選択・選択解除に相当する。 |
| 一括操作ドック | ボトムナビの直上 | 選択中だけ固定表示し、選択モードの終了と画面離脱で取り除く。非表示のまま透明なタップ領域を残さない。ボタンは操作の結果が分かるラベルとし、破壊的操作・無効状態・実行中状態・確認ダイアログは各画面の既存の処理と連動させる。ナビとの間に隙間や重なりを作らない。 | §5-2の画面固有アクションボタンを、上部のツールバーから分離する。 |

- **選択の開始**: 画像の長押し（§5-1の500ms、設定画面で変更可）で選択モードに入り、最初の対象を選択する。以降はタップで選択・解除する。選択中のカードは、チェックや輪郭など色だけに依存しない形で識別できるようにする。
- **ドックの操作領域**: 各ボタンの有効タップ領域は§1-3に従う。狭幅や回転でボタンが折り返しても、サムネイルやナビの操作を妨げない。
- **画面固有アクション**: 種類とラベルは本節では固定せず、各画面の仕様書と適用PBIが定める。各画面の既存の画面固有アクション（SPEC_HISTORYに記載の一括操作など）を欠落させない。
- **用語**: 本節の「一括操作ドック」は、§1-5-1の3でいうシート最下部の固定操作ドック（§1-5-3では「最下部固定アクションバー」）とは別のものである。
- **共有部品**: `MultiSelectToolbar`／`useMultiSelect`の統合や変更は§1-6-5の未承認事項であり、本節は表示と操作のパターンだけを定める。

---

## 6. フロントエンドキャッシュ・データフェッチ仕様

### 6-1. キャッシュ基本方針
- TanStack Query v5 の成功query cacheは、`PersistQueryClientProvider` と custom IndexedDB persisterで永続化する。localStorageはAPI query cacheの保存先に使わない。
- IndexedDB契約はDB `prompt-surgeon-api-cache-v1` v1、object store `client`、key `prompt-surgeon-rq-cache`、envelope `schemaVersion: 1`、buster `prompt-surgeon-api-cache-v1`。snapshotの `maxAge` は600000ms（10分）。これはqueryごとの `staleTime` と別の期限である。
- Persister factory作成時にlocalStorageの完全一致キー `prompt-surgeon-rq-cache` を同期削除する。旧payloadは読み込まず、旧API cacheをfallbackに使わない。IndexedDBの拒否・quota・timeout時は永続cacheをskipし、通常のquery実行によるserver取得へ進む。全容量の保証や全データ削除後のAPI以外からの復元はしない。
- dehydrated snapshotには既定の成功query条件を維持し、次のqueryを追加除外する。mutationsは永続化しない。
  - `comfy-object-info`: ComfyUIの動的ノード定義。
  - `snapshots`一覧: 頻繁に更新されるsnapshot。
  - `workflow-presets`: 複数端末同期時の古いcacheによる初期化状態の上書きを避ける。
  - `prompt-metadata`: 生成時metadata cacheは別の保存契約を持つ。
  - Generation snapshot/event: epoch/revisionで更新する実行中状態であり、IndexedDB query cacheやページ再読込後のBE再起動復元へ保存しない。
- Stale-While-Revalidateにより、利用可能なquery cacheを初回表示に使い、stale queryは通常のquery動作で再検証する。`config` と `fonts` の `staleTime: Infinity` は別途記載の通りである。
- ブラウザー保存量モニターは引き続きlocalStorage（現在origin全体）とsessionStorage（現在tab）を対象に、キーと値のUTF-16長×2 bytesで推定する。可視時2.5秒周期で計測し、1 MiB未満はKiB、それ以上はMiBで小数1桁表示する。拒否時等は「取得不可」とする。IndexedDBの使用量は測定せず、ブラウザー割当量を保証しない。詳細は[SPEC_GENERATE](./SPEC_GENERATE.md)を参照。
- Studioのsession draft、同期済み状態、競合・復元の契約はAPI query cacheと独立し、sessionStorage上の既存動作を維持する。Studio draftをこのIndexedDB cacheへ移さない。

### 6-2. staleTime 定数テーブル (`frontend/src/constants/staleTimes.ts`)

| データ分類 | 該当データ・API | `staleTime` |
|---|---|---|
| 静的・不変 | `config`, `fonts` | `Infinity` |
| 準静的マスター | `base-models`, `lora-categories`, `tagset-categories`, `llm-prompts` | 10分 (`10 * 60 * 1000`) |
| マスター設定 | `param-type-masters`, `mapping-masters`, `speech-bubble-presets`, `snapshots/:id` (詳細) | 5分 (`5 * 60 * 1000`) |
| 頻出アセット | `workflows`, `loras`, `tag-sets`, `albums`, `presets` | 1分 (`60 * 1000`) |
| 動的データ | `snapshots` (一覧), `speech-batch-active-job` | 15秒 (`15 * 1000`) |

## 7. Generate API・WebSocket・Manager境界 (REQ-333)

- メインアプリのAPIとブラウザー向けWebSocket `/api/ws` は8000番を使う。ブラウザーの生成要求・進捗はメインAPI経由で扱い、ブラウザーからComfyUI上流WebSocketへ別接続しない。バックエンドはComfyUI上流に接続し、その `client_id` を利用者session identityから分離する。
- Manager管理UIはメインアプリ設定ページのシステム欄から利用する。メインアプリ8000番が停止している場合は、既存8899番Managerの埋め込みFEから復旧操作する。Managerの存在はメインAPIのsession/job状態を置き換えない。
- batch受付時にworkflow、graph、param values、applied assetsを凍結し、GenerationJobと受付情報を同一DB transactionで保存する。commit成功後に202を返す。上流送信結果不明はunconfirmedであり、POSTを自動再送しない。Comfy prompt IDの初回確認時に凍結metadataを同一transactionでprompt metadataへ永続化する。metadataのローカル30件・サーバー1000件保持、Snapshot `params` の独立性は既存契約を維持する。
- Generation snapshot/eventは version・epoch・revisionと全snapshot dataを持つ。FEは同一epochで新しいrevisionだけを採用し、epoch切替時は全体置換する。SYSTEM_STATSとVRAM_RECOVEREDの既存message形式およびSYSTEM_STATSの2.5秒配信は独立して保持する。Generation stateは可視化用の同期状態であり、全stateのブラウザー永続化やバックエンド再起動後の完全復元を意味しない。
- 利用者session ID、通常生成group ID、Studio project ID、Studio batch IDは異なるscopeである。履歴の自session filterは表示だけに作用する。一括取消の既定scopeは全生成（Studioを含む）で、通常生成のみは追加選択scopeとする。通常生成のみの一括取消は全sessionの識別可能なnormal jobを対象にし、Studio/未分類を保持する。
- 待機jobは取消前にpendingであること、上流ACK、成功した取消後queueでrunning/pending双方からの不在、成功したhistoryでterminal記録がないことを合わせて確認できたときだけ取消確定とする。queue不在のみ、ACKのみ、照会エラー、または実行への競合は未確認である。実行中割り込みはterminal状態を確認する。empty-allも取消前後queueが成功応答で空でありACKを得た場合だけ確定する。未確認または保護scopeによるskippedを完了扱いにしない。
- 試行履歴の表示可否はPrompt Surgeonバックエンドが保持する最新200件のWebPフルサイズキャッシュ（`db/full_cache/`）、サムネイルWebPキャッシュ、およびSQLiteメタデータ（`prompt_metadata`）を一意の正本（SSoT）とし、Gallery rowのサムネイル描画時を含め上流ComfyUIへの原画実在確認プローブ（HEAD/GET存在確認）は一切行わない（ゼロプローブ）。上流ComfyUI側の一時ファイル削除・フォルダ整理にかかわらず、BEにキャッシュが存在する試行画像は不意に履歴から除外されることなく安定して表示・再利用される。保存Snapshot branchも同様に独立して保持され、Snapshotデータとサムネイルcache品質/上限は変えない。
- document reload epochのhistory差分同期は、persisted query復元後の非空baselineに対して一度だけ行い、BEの最新200件候補窓を対象とする。filename/subfolder/type identityで既表示項目を維持し、BE presentの未表示候補だけを追加する。上限・partial状態を含む詳細は[SPEC_GENERATE](./SPEC_GENERATE.md)を参照する。


---

*本ドキュメントは共通仕様の正本です。キャッシュ実装は [`App.tsx`](../../frontend/src/App.tsx) と [`queryCachePersister.ts`](../../frontend/src/utils/queryCachePersister.ts) を参照する。*


## REQ-334 共通表示の最終補正

選択枠はhover中も3ECF8Eを維持する。手動作成・保存は緑/暗い文字、AI支援だけ紫、データ属性badgeは中立色。768〜1023pxでは下部nav余白をModal backdropへ加えず16px paddingで中央配置し、標準:fullscreenで画像全画面を除外する。mobile rangeとsummaryの操作領域も44px。資源容量と秒数はJetBrains Mono/tabular-nums。
