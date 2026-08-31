# インシデントレポート: モバイルモードにおけるセリフ一括変換モーダルの下部メニュー被り及び履歴ヘッダーのはみ出し事象

## 1. 事象概要 (Overview)
モバイル表示（スマートフォン等の画面幅 < 1024px）において、以下の2つのUI不具合が発生している。

1. **事象1（セリフ一括変換モーダルの下部メニュー被り）**:
   履歴ページから「セリフ一括変換」モーダルを開いた際、画面下部に常駐するモバイル下部ナビゲーションバー（`AppShell` の Mobile Bottom Navigation）とモーダルが重なってしまい、モーダル下部に配置されている重要操作ボタン（「次へ：変換リストへ進む」「一括変換を開始」「すべての画像に合成して保存」など）が下部メニューに隠れて操作できなくなる。

2. **事象2（履歴ヘッダーでのアルバム遷移ボタン画面外はみ出し）**:
   履歴ページ（`HistoryPage`）のヘッダーに新設された「セリフ一括変換」ボタンの影響で、ヘッダーのアクション領域の横幅がモバイル画面幅を超過し、右端に配置されているビュー切り替えボタン（「Albums」タブボタン）が画面外にはみ出してタップできなくなっている。

---

## 2. 再現手順・観測された挙動 (Reproduction & Observed Symptoms)

### 再現手順 1 (モーダル下部メニュー被り):
1. ブラウザをモバイル画面幅（例: 375px〜414px）にする、またはスマートフォン実機でアクセスする。
2. 履歴ページ（`/history`）を開く。
3. ヘッダーの「セリフ一括変換」ボタンを押下してモーダル（`BatchSpeechTransformModal`）を開く。
4. モーダル下部を確認する。

### 観測結果 1:
- モーダルのフッター部分（選択完了ボタンや一括変換実行・保存ボタン）が、最下部に固定表示されているモバイルボトムナビ（Generate/LoRAs/Tags/History/Settings）と被ってしまい、タップ操作が困難または不可能になる。

### 再現手順 2 (アルバム遷移ボタンはみ出し):
1. ブラウザをモバイル画面幅（例: 375px）にして履歴ページ（`/history`）を表示する。
2. ページ上部のヘッダー領域を確認する。

### 観測結果 2:
- ヘッダー内の「History」タイトル、「セリフ一括変換」ボタン、「Add to Album」ボタン、「Snapshots / Albums」切り替えトグルが横1列に並び、合計幅がビューポート幅を超えるため、右端の「Albums」切り替えボタンが画面外に押し出されて見切れる。

---

## 3. 影響範囲・該当コード (Affected Area & Source Locations)

| # | 対象ファイル | 該当行 / コンポーネント | 詳細 |
|---|---|---|---|
| 1 | `frontend/src/components/BatchSpeechTransformModal.tsx` | L340 | モーダルの最外殻コンテナが `className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-fade-in"` となっており、プロジェクト標準の `.modal-backdrop`（`z-index: var(--z-modal)` [100] かつ `padding-bottom: calc(var(--mobile-nav-height) + ...)`）が使われていないため、ボトムナビ（`z-50`）とスタッキング競合し下部パディングも不足している |
| 2 | `frontend/src/pages/HistoryPage.tsx` | L309-L356 | ヘッダーコンテナが `flex items-center justify-between`、ボタングループが `flex items-center gap-2` と横並び固定になっており、`flex-wrap` やモバイル向けのラベル省略/レイアウト最適化がされていないため横幅超過が発生している |

---

## 4. 根本原因の分析 (Root Cause Analysis)

### 原因 1: `BatchSpeechTransformModal` における共通モーダルスタイル（`.modal-backdrop`）の未適用
1. **スタッキングコンテキストと z-index 不整合**:
   - `frontend/src/index.css` にて `--z-mobile-nav: 50;`, `--z-modal: 100;` が定義されている。
   - `AppShell.tsx` のモバイルボトムナビは `z-[var(--z-mobile-nav)]`（z-index: 50）で画面最下部に固定配置されている。
   - `BatchSpeechTransformModal.tsx` では `z-50` を直書きしてしまっており、モーダルがボトムナビより前面に正しく重ならない。
2. **モバイルセーフエリア・ボトムナビ分のパディング欠落**:
   - プロジェクト内の他モーダルが利用している `.modal-backdrop` クラスは `padding-bottom: calc(var(--mobile-nav-height) + 1rem + env(safe-area-inset-bottom))` を備えているが、`BatchSpeechTransformModal` は `p-4` のみとなっており、モーダルの高さ（`h-[88vh]`）が下部ナビゲーション領域まで侵入してしまう。

### 原因 2: `HistoryPage` ヘッダーコンポーネントのレスポンシブ考慮不足
1. **ヘッダー要素の幅超過**:
   - 履歴ページヘッダーには「History タイトル（約80px）」「セリフ一括変換ボタン（約125px）」「Add to Album ボタン（約115px）」「Snapshots/Albums 切り替えトグル（約140px）」が同一行に配置されている。
   - 横幅の合計は約460px以上となり、一般的なモバイル幅（375px〜414px）を大きく上回る。
2. **非折り返しレイアウト**:
   - `HistoryPage.tsx` のヘッダー親要素が `flex items-center justify-between`、右側アクション部が `flex items-center gap-2`（`flex-wrap` なし）となっているため、要素の縮小や折り返しが行われず、末尾の「Albums」ボタンが画面右外へはみ出してしまう。

---

## 5. 原因分類 (Classification)

<diagnostic_check>
- Root_Cause_Isolated: Yes
- Classification: Type_A: Implementation Bug (Both modal z-index/padding and header responsive layout)
- Scope_Restriction: Read-only phase. Code modification or fix proposals are strictly PROHIBITED during this turn.
- Route: Direct to /dev-design
</diagnostic_check>

* **事象1（モーダルの下部メニュー被り）**: **Type A (Implementation Bug - 実装バグ)**
  * `BatchSpeechTransformModal` 実装時にプロジェクト標準のモーダル Backdrop 規則（`.modal-backdrop` または `z-[var(--z-modal)]` / モバイルボトムナビパディング）が適用されなかったことによる実装不整合。
* **事象2（ヘッダーのアルバム遷移ボタンはみ出し）**: **Type A (Implementation Bug - 実装バグ)**
  * `HistoryPage` ヘッダーへ「セリフ一括変換」ボタンを追加した際、モバイル画面幅におけるレスポンシブ配置（折り返しやアイコン化等のレスポンシブ対応）の考慮が漏れていたことによるレイアウト不整合。

---

## 6. バックログ登録とルーティング (Backlog Registration & Routing)

- **登録 PBI**: `docs/backlog/pbi/active/REQ-216.md`
- **タイトル**: `モバイルモードにおけるセリフ一括変換モーダル下部被り解消および履歴ヘッダーレスポンシブレイアウト修正`
- **次のワークフロー**: `/dev-design REQ-216`


