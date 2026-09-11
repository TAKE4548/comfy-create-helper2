# インシデントレポート: セクションタグコピー・ペーストサブメニューの履歴潰れ不具合

## 1. 事象概要 (Overview)

GeneratePage 各プロンプトセクション右上の「クリップボード・履歴操作」メニュー（`PromptSectionClipboardMenu`）において、タグ等のコピー履歴（`history`）の件数が増加した場合に、履歴項目がスクロール表示されず縦方向に押し潰されて文字や項目が視認できなくなる。

調査の結果、履歴一覧を表示するコンテナに `max-h-40 overflow-y-auto flex flex-col` が指定されている一方で、子要素の各ボタン要素に `shrink-0`（`flex-shrink: 0`）が指定されておらず、Flexbox の縮小（flex-shrink: 1）が働くことで、コンテナ高さ（160px）内に収まるように各ボタンの高さが強制的に圧縮されてしまうことが判明した。

---

## 2. 観測ログおよび実機追跡結果 (Observed Evidence & Log Citations)

### 2.1 アプリケーションログ追跡 (`logs/app.jsonl`)
`scripts/inspect_logs.py` を用いてログを調査：
- `python scripts/inspect_logs.py --summary`
  - Total Entries: 3252 (INFO: 3250, ERROR: 2)
  - ERROR: frontend: 2
- `python scripts/inspect_logs.py --errors --tail 10`
  - [2026-09-12T00:07:41.378+09:00] [frontend] [FE] window.onerror: useRef is not defined
  - [2026-09-12T00:07:41.384+09:00] [frontend] [FE] GlobalErrorBoundary: useRef is not defined
- **結論**:
  直近のログにあるエラーは過去の開発過渡期に発生した未定義参照エラーのみであり、今回の現象に関する例外や実行時エラーはバックエンド・フロントエンドともに一切記録されていない。本件は CSS Flexbox のレイアウト計算に起因する純粋な描画崩れ（スタイリング不具合）である。

### 2.2 ソースコード追跡結果 (`PromptSectionClipboardMenu.tsx`)
1. **履歴一覧コンテナと子要素のスタイル (L176-L188)**:
   ```tsx
   <div className="max-h-40 overflow-y-auto flex flex-col gap-1 pr-0.5">
     {history.map((item, index) => (
       <button
         key={`${index}-${item.slice(0, 15)}`}
         type="button"
         onClick={() => handleHistoryItemClick(item)}
         className="w-full px-2 py-1.5 rounded bg-[#27272F] hover:bg-[#32323D] text-left text-[11px] text-zinc-300 hover:text-white truncate transition-colors border border-transparent hover:border-[rgba(255,255,255,0.1)]"
         title={item}
       >
         {item}
       </button>
     ))}
   </div>
   ```
2. **挙動の分析**:
   - コンテナは `max-h-40`（10rem = 160px）と `overflow-y-auto` を持ち、スクロールさせる意図で実装されている。
   - しかし、`flex flex-col` の直下の子要素 `<button>` には `shrink-0` や `min-h` が付与されていないため、Flexbox の既定値（`flex-shrink: 1`）が適用される。
   - `history` の件数が増加（最大10件）すると、各アイテムの本来の高さ（`py-1.5` + line-height = 約28px〜30px）の合計が 160px を超過する。
   - このとき、各ボタンに `truncate`（`overflow: hidden`）が指定されているため、要素の最小高さ制限（min-height）が効かずに Flexbox によって各ボタンの高さが押し潰されるように均等縮小される。
   - 結果として、本来スクロールバーが現れて各アイテムの高さを維持すべきところ、すべてのアイテムが薄い帯状に圧縮され、文字が垂直方向に切り取られて視認不能となる。

---

## 3. 再現手順と観測された挙動 (Reproduction Steps)

### 再現手順
1. GeneratePage を開く。
2. Positive Prompt または Negative Prompt などのプロンプトセクションで、異なるプロンプト文字列を複数回コピーする（例: 6〜10件以上コピーを行い、`history` に履歴を蓄積させる）。
3. プロンプトセクションの「クリップボード・履歴操作」ボタン（クリップボードアイコン）をクリックし、ポップオーバーサブメニューを展開する。
4. 「コピー履歴」一覧の表示状態を確認する。

### 観測された挙動
- **実際の挙動（不具合）**:
  - コピー履歴の件数が増えると、各履歴アイテムのボタンの縦幅が薄く圧縮され、ボタン内のプロンプト文字列が上下に切れて判読できなくなる。
  - スクロールによる閲覧ではなく、固定枠内に無理やり全件が押し込まれた状態になる。
- **本来期待される挙動**:
  - コピー履歴の件数が増加しても各履歴アイテムの高さとパディングが正常に維持され、`max-h-40` を超過した分はコンテナが縦スクロール可能になって個別の履歴が明確に視認・選択できること。

---

## 4. 影響範囲・該当コード (Affected Area & Source Locations)

| # | 分類 | 対象ファイル | 該当行/箇所 | 詳細 |
|---|---|---|---|---|
| 1 | コピー履歴一覧のFlexbox縮小不備 | `frontend/src/pages/GeneratePage/components/PromptSectionClipboardMenu.tsx` | L176-L188 (`history.map`) | `flex flex-col` コンテナ内の各履歴アイテム `<button>` に `shrink-0`（`flex-shrink: 0`）が未指定のため、件数増加時にアイテムが縦方向に押し潰される。 |

---

## 5. 根本原因の分析 (Root Cause Analysis)

1. **Flexbox における `flex-shrink: 1` による要素圧縮**:
   - `display: flex; flex-direction: column;` のコンテナ内では、子要素のデフォルトの `flex-shrink` は `1` である。
   - スクロールコンテナ（`overflow-y-auto`）として機能させるためには、子要素が縮小せずに自身の高さを維持（`flex-shrink: 0`）し、親の `max-height` を溢れ出る必要がある。
   - `shrink-0` が欠落していたため、ブラウザはスクロールを発生させる前に子要素を縮小させて枠内に収めようとし、ボタンが縦方向に押し潰された。

---

## 6. 原因分類 (Classification)

<diagnostic_check>
- Root_Cause_Isolated: Yes
- Classification: Type_A: Implementation Bug
- Scope_Restriction: Read-only phase. Code modification or fix proposals are strictly PROHIBITED during this turn.
- Route: Direct to /dev-design
</diagnostic_check>

<incident_report>
- **障害分類**: **Type A (Implementation Bug / 実装上の不具合)**
- **判定理由**:
  - 要件やデータモデルの変更を要するものではなく、`PromptSectionClipboardMenu.tsx` における CSS Flexbox の縮小制御（`shrink-0` の欠落）という純粋な実装上の不備であるため。
</incident_report>
