# 障害調査報告書 (Incident Report)

## 1. 障害概要
LoRA管理・タグセット管理画面において、以下の4件のUI/UXおよび機能不整合の不具合が発生している。

1. **モバイルモードでの編集モーダル操作不能**: モバイル表示時、編集モーダルの保存・キャンセルボタンが下部ナビゲーションバーに被り、操作できない。
2. **編集モーダルの項目不整合・欠落**: サムネイル上の編集アイコンから開く編集モーダルと、詳細モーダル内の「Edit」から遷移する編集画面で実装が異なり、詳細モーダル経由の方で対象ベースモデルやサブセット（バリエーション）などの編集項目が欠落している。
3. **モバイルでのサムネ上アイコン視認不可**: サムネイル上の編集・削除アイコンが `group-hover` による表示制御となっているため、タッチ操作（モバイル）時に非表示のまま手探りでタップする必要がある（またドラッグハンドルとの位置競合もある）。
4. **カバーサムネ設定時の候補画像サムネイル非表示**: タグセットの編集モーダル（`LocalTagSetEditModal`）に候補サムネイル一覧が存在せず画像送りでしか選択できない。また詳細モーダル（`LoraDetailModal` / `TagSetDetailModal`）でもモバイル表示時にレイアウト崩れ・領域圧迫により候補サムネイル一覧が見切れる/表示されない。

---

## 2. 再現手順

### 事象 1 (モバイル下部メニュー被り)
1. スマートフォン実機またはブラウザのレスポンシブモード（幅 < 1024px）でアプリを開く。
2. 「Tags」または「LoRAs」画面を開く。
3. タグセットまたはLoRAの編集モーダルを開く。
4. モーダル下部の「保存（Save Changes）」および「キャンセル（Cancel）」ボタンが画面最下部のモバイルナビゲーションバーの背面に隠れ、押下できない。

### 事象 2 (編集項目の欠落・不整合)
1. 「Tags」画面で登録済みタグセットカードをクリックして「詳細モーダル（TagSetDetailModal）」を開く。
2. 右下の「Edit」ボタンを押下して編集モードに入る。
3. サムネイル上のペンアイコンから開いた編集モーダル（`LocalTagSetEditModal`）と比較すると、「Target Base Models」および「Subsets（バリエーション）」の入力・編集欄が存在しない。

### 事象 3 (サムネ上操作アイコンのモバイル視認不可)
1. モバイルモードで「LoRAs」または「Tags」画面を開く。
2. カードのサムネイル部分を確認する。
3. 編集（Pencil）・削除（Trash2）ボタンが透明（`opacity-0`）のままで表示されず、タップするまで視認できない。

### 事象 4 (候補サムネイル一覧の欠落・不可視)
1. 「Tags」画面でサムネイル上のペンアイコンからタグセット編集モーダルを開く。
2. スナップショット画像が複数存在しても、候補画像グリッドが表示されず、左右の矢印送りでしか画像を選択できない。
3. また、詳細モーダルをモバイル画面で開いた際にも、メインプレビューに縦幅が圧迫され、候補サムネイル一覧（Related Snapshots）が見えなくなる。

---

## 3. 根本原因 (Root Cause Analysis)

### 1. モバイルモードでの編集モーダル操作不能
- **該当箇所**: 
  - `frontend/src/pages/TagsPage.tsx:L816, L880` (`LocalTagSetCreateModal`, `LocalTagSetEditModal`)
  - `frontend/src/components/layout/AppShell.tsx:L115`
  - `frontend/src/index.css:L138-L150`
- **原因**: 
  - `TagsPage.tsx` 内の独自モーダルコンテナに `fixed inset-0 ... z-50 p-4` が指定されている。
  - モバイルボトムナビゲーション（`AppShell.tsx`）も `z-50` (`--z-mobile-nav: 50`) であり、DOM上でモーダルより後にレンダリングされるため、ナビゲーションバーがモーダルより前面に重なって表示される。
  - また、共通クラス `.modal-backdrop`（`z-index: 100` かつ `padding-bottom: calc(var(--mobile-nav-height) + ...)`）が適用されておらず、モーダル全体のスクロール構造もモバイルビューに適合していない。

### 2. 編集モーダルの項目不整合・欠落
- **該当箇所**: 
  - `frontend/src/pages/TagsPage.tsx:L276-L290, L502-L506, L586-L596, L834-L981`
  - `frontend/src/components/TagSetModals.tsx:L286-L578`
- **原因**: 
  - タグセット編集に関して、サムネイルペンアイコン用（`TagsPage.tsx` 内ローカルの `LocalTagSetEditModal` / `LocalTagSetFormFields`）と詳細モーダル用（`TagSetModals.tsx` 内の `TagSetDetailModal`）でコンポーネントが二重実装・乖離している。
  - `TagSetDetailModal` 内のインライン編集フォーム（L454-L513）において、`target_base_model_ids` および `subsets` のフォーム入力コンポーネントが実装漏れとなっている。

### 3. サムネ上操作アイコンのモバイル視認不可
- **該当箇所**: 
  - `frontend/src/pages/LoRAsPage.tsx:L479-L487, L458-L471`
  - `frontend/src/pages/TagsPage.tsx:L502-L511, L480-L494`
- **原因**: 
  - サムネイル上の編集・削除ボタンに `opacity-0 group-hover:opacity-100` が指定されており、ホバー操作が存在しないタッチデバイス環境では常時 `opacity-0`（透明）となる。
  - さらに、ドラッグ並び替え用ハンドル（`GripVertical`）が同じ `top-2 right-2` に配置されており、モバイル表示時のアイコン配置とタップ領域が競合している。

### 4. カバーサムネ設定時の候補画像サムネイル非表示
- **該当箇所**: 
  - `frontend/src/pages/TagsPage.tsx:L887-L969` (`LocalTagSetEditModal`)
  - `frontend/src/components/TagSetModals.tsx:L384-L450, L382` (`TagSetDetailModal`)
  - `frontend/src/components/LoraModals.tsx:L471-L580` (`LoraDetailModal`)
- **原因**: 
  - `TagsPage.tsx` の `LocalTagSetEditModal` 側に `Related Snapshots` の候補サムネイルグリッドがそもそも記述されておらず欠落している。
  - `TagSetDetailModal` および `LoraDetailModal` において、モバイル等の小画面時に親コンテナの `grid-cols-1 overflow-hidden` とメインプレビュー（`aspect-square`）の高さにより、下部の候補サムネイル一覧領域が圧迫・切断されるレイアウト構造になっている。

---

## 4. 障害分類
- **分類**: **Type A (Implementation Bug - 実装不具合)**
- **判定理由**: 仕様変更や設計不備ではなく、コンポーネントの二重実装・フィールド実装漏れ、CSS/z-indexおよびレスポンシブレイアウトの設計不足による実装バグであるため。

---

## 5. 対策方針 (概要)
1. **モーダル共通化とz-index/パディングの是正**:
   - `TagsPage.tsx` 内の重複モーダル（`LocalTagSet*`）を廃止・統一し、共通の `modal-backdrop`（`z-index: 100`）およびモバイルパディングを適用する。
2. **編集フォーム項目の統合**:
   - `TagSetModals.tsx` のフォーム定義を一元化し、詳細モーダルからの編集でも `target_base_model_ids` と `subsets` を含む全項目を確実に編集可能にする。
3. **モバイル対応アイコン表示とレイアウト調整**:
   - タッチデバイス・モバイル表示（`lg:` プレフィックス等の活用）でアイコンを常時視認可能にし、ドラッグハンドルとの配置重複を解消する。
4. **候補画像サムネイルグリッドの統合とスクロール対応**:
   - 編集・詳細モーダル両方でスナップショット一覧（`Related Snapshots`）を共通表示し、モバイル環境でもプレビューとサムネイル一覧が適切にスクロール・選択できるようにする。
