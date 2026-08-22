# インシデントレポート: タッチ操作端末における並び替えドラッグ操作とOS/ブラウザ挙動（ロングタップ・スクロール）の競合不具合

## 概要 (Overview)
タグセット一覧（`TagsPage`）、LoRA一覧（`LoRAsPage`）、履歴・アルバム一覧（`HistoryPage`）、プリセット一覧（`PresetManagerPanel`）、マッピングマスター一覧（`SettingsPage`）などの各種並び替え可能コンポーネントにおいて、スマートフォンやタブレット（特にAndroid端末）などのタッチ操作環境で以下の深刻な操作競合・動作不良が発生している。

1. **OS/ブラウザのロングタップ判定との競合・誤爆**:
   - カード全体に `@dnd-kit` の `TouchSensor`（長押し遅延）と `useMultiSelect` の長押しタイマー（一括選択モード移行）が多重に割り振られており、さらにOS/ブラウザ標準の長押しメニュー（コンテキストメニュー、テキスト選択、拡大鏡）が同時にトリガーされる。
   - 長押し時間の調整機能（`SettingsPage`）が存在するものの、微小な指のブレ（5px超過）によるキャンセルや、複数機能（並び替え・一括選択・OSメニュー）のタイマー競合により、根本的な誤爆回避ができていない。

2. **Android端末におけるスクロール優先とドラッグ不発**:
   - Android（Chrome等）において、長押し後に指を動かしてもカードが追従せず、背景の画面スクロールが優先されてしまう（iPadOSとは挙動差が生じている）。
   - 原因として、ドラッグ対象要素に対するCSS `touch-action: none` の欠落、および非ドラッグ時（長押し待機中）の `touch-action: pan-y` 指定により、Androidのブラウザエンジンが即座に縦スクロールジェスチャーとして制御を奪う（ポインタを奪取する）構造になっていることが判明した。

---

## 再現手順 (Reproduction Steps)

### ケース1: Android端末 / モバイルエミュレータ（タッチ操作）での並び替え
1. Android端末（Chromeブラウザ）またはDevToolsのモバイルタッチエミュレーションで `TagsPage` または `LoRAsPage` を開く。
2. 任意のカードを指で長押し（500ms以上保持）し、そのまま上下左右にドラッグしようとする。
3. **観測事象**:
   - カードがドラッグ状態にならず、画面全体の縦スクロールが発生する。
   - または、長押し直後にOS標準のテキスト選択・画像保存・コンテキストメニューが表示され、ドラッグ操作が中断される。

### ケース2: タッチ環境での一括選択と並び替えの長押し競合
1. `TagsPage` や `LoRAsPage` でカードを長押しする。
2. **観測事象**:
   - 並び替えドラッグ判定（設定値: 例500ms）と一括選択モード突入（設定値: 例800ms）が同じカード領域に重なっており、意図せず一括選択モードに切り替わる、あるいは並び替えを開始しようとした瞬間に一括選択チェックボックスが表示されUIが乱れる。

---

## 影響範囲 (Affected Area)

### 影響コンポーネント・ファイル一覧
1. **タグセット一覧 (`TagsPage`)**:
   - `frontend/src/pages/TagsPage.tsx` (`SortableTagSetCard`, `sensors`, `useMultiSelect` バインド)
2. **LoRA一覧 (`LoRAsPage`)**:
   - `frontend/src/pages/LoRAsPage.tsx` (`SortableLoraCard`, `sensors`, `useMultiSelect` バインド)
3. **履歴 / アルバム一覧 (`HistoryPage`)**:
   - `frontend/src/pages/HistoryPage.tsx` (`SortableItem` の `touchAction` 指定, `sensors`)
4. **プリセット管理パネル (`PresetManagerPanel`)**:
   - `frontend/src/components/PresetManagerPanel.tsx` (`SortablePresetRow`, `DndContext` のセンサー未設定, ドラッグハンドルの `touch-action`)
5. **設定画面 / マッピングマスター一覧 (`SettingsPage` / `SettingsComponents`)**:
   - `frontend/src/pages/SettingsPage.tsx`
   - `frontend/src/components/SettingsComponents.tsx` (`SortableMasterRow` のドラッグハンドルと `longPressHandlers`)
6. **タグチップエディタ (`TagChipEditor`)**:
   - `frontend/src/components/TagChipEditor/index.tsx` (`TouchSensor` 設定)
   - `frontend/src/components/TagChipEditor/TagChip.tsx` (ドラッグハンドルの `touch-action` 欠落)
7. **一括選択フック (`useMultiSelect`)**:
   - `frontend/src/hooks/useMultiSelect.ts` (`getLongPressHandlers` のタッチイベント処理)

---

## 原因分類 (Root Cause Classification)

- **分類**: **Type B (仕様・インタラクション設計不備) ＋ Type A (実装不備: CSS touch-action 制御欠落)**
- **詳細理由**:
  1. **仕様・UI/UX設計面 (Type B)**:
     - 1つのカード要素に対して「通常タップ（詳細モーダル表示）」「長押し①（並び替えD&D）」「長押し②（一括選択モード移行）」「スワイプ（画面スクロール）」という4つの相反するジェスチャーを同一タッチターゲットに重複定義している。
     - モバイル/タッチ端末において、長押しのミリ秒差（500ms vs 800ms）だけでこれらを識別・制御することはOSごとのタイマー仕様や指のマイクロジッター（5px未満の保持が困難）により原理的に破綻しやすい。
  2. **ブラウザ/CSS実装面 (Type A)**:
     - Android Chrome等のWebkit/Blink系ブラウザは、要素に `touch-action: none` が明示されていない場合、タッチ移動開始時にブラウザのネイティブスクロール（Compositorスレッド）を優先発動し、JS側のPointer/Touchイベントをキャンセル（`touchcancel`）する。
     - 現在の実装では、ドラッグ中（`isDragging === true`）になるまで `touchAction: none` が適用されない、またはクラス自体が一切指定されていないため、長押し待機中・ドラッグ開始判定の瞬間にAndroid側でスクロール判定が確定してしまい、D&Dが一切発火しない。

---

## 調査詳細 (Deep Dive Analysis)

### 1. Androidでスクロールが優先されるメカニズム
- `HistoryPage.tsx` (L80):
  ```tsx
  touchAction: isDragging ? 'none' : 'pan-y'
  ```
  - `@dnd-kit` の `TouchSensor` は、指が触れてから `delay` (500ms) の間、移動量が `tolerance` (5px) 以内であることを監視してドラッグを開始する。
  - しかし `isDragging` が `false` の間は `touchAction: 'pan-y'` であるため、ユーザーが500ms経過直後に指を動かした際、Androidはこれを縦スクロールとして処理を開始し、ブラウザがタッチストリームを奪う。
- `TagsPage.tsx` (L46-L58) / `LoRAsPage.tsx` (L45-L57):
  - `SortableTagSetCard` や `SortableLoraCard` には `touch-action` のスタイル指定自体が存在しないため、ブラウザデフォルト（`auto`）となり、タッチ移動はすべてスクロールとして消費される。

### 2. OSロングタップメニューおよび複数長押しタイマーの競合
- `useMultiSelect.ts` (L181-L224):
  - `onTouchStart` で `setTimeout(..., delay)` を起動し、`5px` 以上の移動でキャンセルする。
- `@dnd-kit/core` `TouchSensor`:
  - 内部で `delay` と `tolerance: 5` のタイマーを独自に起動する。
- モバイルOS（iOS / Android）:
  - `user-select: none` や `-webkit-touch-callout: none`、`contextmenu` イベントの抑止がない場合、OS標準のコンテキストメニューやテキスト選択が約500msで発火する。
- 結果として、わずかな指のブレやタイマーの前後関係によって、どれか1つが誤爆またはキャンセルされ、安定した操作が不可能となっている。

### 3. ドラッグハンドル方式との差異
- `PresetManagerPanel` や `TagChip` には `<GripVertical />`（ドラッグハンドルアイコン）が存在するものの、ハンドル要素に `touch-action: none` が適用されておらず、DndContextのセンサー定義も最適化されていない。
- 一方、カード型UI（`TagsPage`, `LoRAsPage`, `HistoryPage`）ではカード全体がドラッグターゲットとなっており、タッチ操作時の「タップ」「スクロール」「ドラッグ」「長押し選択」の分離がなされていない。

---

## 根本対策の方向性（技術的考察）
本インシデントを根本解決するためには、単なる長押し判定時間（ms）の微調整ではなく、以下の組み合わせによる抜本的な設計・実装見直しが必要となる：

1. **タッチ操作における明示的ドラッグ領域（ハンドル）または編集モードの導入**:
   - カード全体での長押しドラッグを廃止または整理し、明示的なドラッグハンドル（`<GripVertical>`）経由でのドラッグ、あるいは「並び替えモード」時のドラッグに限定する。
2. **ドラッグハンドル/ドラッグ可能要素への `touch-action: none` の恒常適用**:
   - ドラッグ操作の起点となる要素に `touch-action: none` を常時適用し、Android/iOSにおけるスクロールジェスチャーの誤奪取を完全に遮断する。
3. **不要なOS標準ジェスチャーの抑止**:
   - ドラッグ可能領域における `-webkit-touch-callout: none`、`user-select: none`、`onContextMenu={(e) => e.preventDefault()}` 等の適用。
4. **`PointerSensor` / `TouchSensor` の適切な統合とコンフリクト解消**:
   - `@dnd-kit` の推奨プラクティスに基づき、タッチデバイスとデスクトップ（マウス）で競合しないセンサー設定とアクティベーション制約を再構築する。

---

## 次のステップ提案 (Next Action)
本インシデントは **Type B (仕様・インタラクション設計不備) ＋ Type A (実装不備)** の複合要因です。
調査結果をご確認いただき、承認いただける場合は、`/dev-design`（または `/sys-design`）へ進み、UI/UXインタラクション仕様の整理および実装修正のタスク（PBI）を作成します。
