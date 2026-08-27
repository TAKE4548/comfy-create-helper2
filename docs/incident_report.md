# インシデントレポート: タッチ操作（Android）での生成履歴複数選択の失敗

## 1. 事象概要 (Overview)
スマートフォン（主にAndroid端末のブラウザ）から生成履歴（History）画面にアクセスし、画像をロングタップして複数選択モード（MultiSelect）に入ろうとしても、選択状態に遷移しないことがある。
操作時、端末側ではロングタップを検知した「クリック感バイブレーション（触覚フィードバック）」が作動しているにもかかわらず、アプリ上は一切反応しない事象が発生している。

---

## 2. 再現手順・観測された挙動 (Reproduction & Observed Symptoms)

- **再現手順**:
  1. Android 端末のブラウザ（Google Chrome 等）で Comfy Create Helper の生成履歴画面（HistoryPage）を開く。
  2. 任意の履歴スナップショット（画像カード）を長押し（ロングタップ）する。
  3. 約500ms経過時に端末のバイブレーションが振動する。
  4. 指を離すかそのまま待つ。
- **観測結果**:
  - 端末は長押しを検知して振動しているが、アプリ側は複数選択モードに遷移せず、チェックボックスや選択枠が表示されない（またはブラウザの画像コンテキストメニュー等に奪われる）。

---

## 3. 影響範囲・該当コード (Affected Area & Source Locations)

| # | 対象ファイル | 該当行 / 関数 | 詳細 |
|---|---|---|---|
| 1 | `frontend/src/hooks/useMultiSelect.ts` | L148-L163, L206-L212 (`getLongPressHandlers`) | ① デフォルト待機時間（800ms）とOSのロングタップ検知時間（約500ms）の乖離<br>② 移動判定閾値（5px）が過敏で指の微細なブレで即時キャンセルされる問題 |
| 2 | `frontend/src/pages/HistoryPage.tsx` | L1113-L1131 (`visibleSnapshots.map`) | スナップショットカード要素において `onContextMenu` の抑制や、長押し時のコンテキストメニュー・画像ドラッグ抑止スタイル（`-webkit-touch-callout: none` / `user-select: none` 等）が未適用 |

---

## 4. 根本原因の分析 (Root Cause Analysis)

ユーザーフィードバック（判定時間を300msに短縮しても複数選択モードの見た目自体に遷移しない）に基づき、イベントライフサイクルを詳細にトレースした結果、**「長押しタイマーが発火する前に、タッチ微小移動判定によって即時破棄されている」** ことが完全な原因として特定されました。

### (1) タッチ開始直後の微小移動によるタイマー即時破棄（最主因）
`frontend/src/hooks/useMultiSelect.ts`（L148-L163）では、タッチ開始（`onTouchStart`）から移動距離が **5px** を超えた時点でドラッグと判定し、タイマーをクリアします：
```typescript
const distance = Math.sqrt(diffX * diffX + diffY * diffY);
if (distance >= 5) {
  isDraggingRef.current = true;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  // ...
}
```
**発生メカニズム**:
1. モバイル（Android）で画面に指を置いた瞬間、指の腹の接地面積の変化や接触重心の微小な揺らぎにより、ブラウザは即座に `touchmove` イベントを発火します。
2. 高DPI（400dpi以上）のスマートフォン画面において **5px は 1mm 未満** の極小距離です。静止して長押ししているつもりでも、指を置いた直後の 10〜50ms 以内に 5px を超過します。
3. これにより、タイマー時間（300ms や 800ms）に関係なく、**長押し判定タイマーが開始直後（数十ミリ秒）で即座にキャンセル（`clearTimeout`）** されます。
4. そのため、`enterMultiSelectMode` は一切実行されず、複数選択の見た目（チェックボックスやツールバー）にも変化しません。

### (2) Android ネイティブ長押し（バイブレーション）とタッチキャンセル
- ユーザーが画面に指を置き続けると、約500ms で Android OS 側のネイティブ長押し判定（画像コンテキストメニュー判定）が完了し、**端末がクリック感バイブレーション（触覚フィードバック）を作動** させます。
- `frontend/src/pages/HistoryPage.tsx`（L1144）の `<img>` には `pointer-events-none` がなく、カードに `onContextMenu={(e) => e.preventDefault()}` やタッチ抑制スタイルがないため、Android Chrome は画像に対するネイティブメニューを準備し、ブラウザから `touchcancel` が発行されます。
- アプリ側のタイマーはすでに (1) で破棄されているため、端末の振動だけが反応し、アプリ側は一切反応しない状態となります。

---

## 5. 原因分類 (Classification)

<diagnostic_check>
- Root_Cause_Isolated: Yes
- Classification: Type_A: Implementation Bug
- Scope_Restriction: Read-only phase. Code modification or fix proposals are strictly PROHIBITED during this turn.
- Route: Direct to /dev-design
</diagnostic_check>

* **分類**: **Type A (Implementation Bug - 実装バグ)**
  * モバイル環境のタッチイベント特性（微小移動許容値、OSハプティクス/判定タイミングとの同期、コンテキストメニュー抑制）に対するハンドリングの不備に起因する実装上の不具合です。

---

## 6. バックログ登録とルーティング (Backlog Registration & Routing)

- **登録推奨 PBI**: `docs/backlog/pbi/active/REQ-194.md`
- **タイトル**: `モバイル（Android/タッチ操作）での長押し複数選択の操作性改善・不具合修正`
- **次のワークフロー**: `/dev-design REQ-194`
