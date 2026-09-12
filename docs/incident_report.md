# インシデントレポート: タグチップのサブメニューで強度入力時にBackspaceを押すとチップが削除される

**日時**: 2026-09-13  
**報告者**: Incident Analyst  
**対象コンポーネント**: 
- `frontend/src/components/TagChipEditor/TagChip.tsx`（サブメニュー内のキーボードイベント伝播制御）
**分類**: **Type A（実装バグ）**

---

## 1. 症状

- **事象**: タグチップのサブメニュー（ポップオーバー）を開き、「強度 (Weight)」の数値入力欄（`<input type="number">`）で直接数値を編集しようとして `Backspace` キーを押すと、入力欄内の文字削除ではなく、タグチップ自体が削除されてしまう。
- **再現ステップ**:
  1. タグチップエディタが表示される画面（Prompt Surgeon の各種生成・プロンプト入力画面）を開く。
  2. 任意のタグチップ（例: `1girl` など）をクリックしてサブメニューを開く。
  3. 「強度 (Weight)」の数値入力フィールド（`<input type="number">`）にフォーカスを合わせる。
  4. 数値を削除・修正するために `Backspace` キーを押下する。
  5. **結果**: 入力欄の数値が削除される代わりに、タグチップ自体が即座に削除（`onDelete(id)`）され、画面から消失する。

---

## 2. ログ・エビデンス

### エビデンス①: `logs/app.jsonl` の調査結果
- `scripts/inspect_logs.py --summary` および `scripts/inspect_logs.py --errors --tail 10` を実行してログを検査。
- バックエンドログ（計6,843件）には直近のエラーや例外スタックトレースは記録されておらず、本件は純粋なフロントエンドUIのDOMイベント伝播（バブリング）に起因する不具合であることを確認。

### エビデンス②: コード上のイベント伝播ハンドラ差異
[`frontend/src/components/TagChipEditor/TagChip.tsx`](frontend/src/components/TagChipEditor/TagChip.tsx) の各入力ハンドラの比較:
- **タグ名入力欄** ([`L181-L191`](frontend/src/components/TagChipEditor/TagChip.tsx#L181-L191)):
  ```tsx
  const handleWordKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation(); // ★ 親へのバブリングが遮断されている
    if (e.key === 'Enter') {
  ```
- **強度数値入力欄** ([`L158-L166`](frontend/src/components/TagChipEditor/TagChip.tsx#L158-L166)):
  ```tsx
  const handleWeightKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // ★ e.stopPropagation() が欠落している！
    if (e.key === 'Enter') {
  ```

---

## 3. 根本原因分析（Root Cause Analysis）

### 根本原因: 強度入力欄におけるキーイベント伝播未遮断による親コンテナショートカットの発火

**該当箇所**: 
- [`frontend/src/components/TagChipEditor/TagChip.tsx` L114-L130](frontend/src/components/TagChipEditor/TagChip.tsx#L114-L130)（親要素のショートカットハンドラ）
- [`frontend/src/components/TagChipEditor/TagChip.tsx` L158-L166](frontend/src/components/TagChipEditor/TagChip.tsx#L158-L166)（強度入力欄のキーハンドラ）
- [`frontend/src/components/TagChipEditor/TagChip.tsx` L284-L289](frontend/src/components/TagChipEditor/TagChip.tsx#L284-L289)（サブメニューコンテナ）

#### 発生メカニズム:
1. タグチップの最外周コンテナ `<div>`（[`L221-L226`](frontend/src/components/TagChipEditor/TagChip.tsx#L221-L226)）には、チップに対するキーボードショートカット用の `onKeyDown={handleKeyDown}` が設定されています。
   ```tsx
   const handleKeyDown = (e: React.KeyboardEvent) => {
     if (isEditing) return;

     if (e.key === 'Escape' && isMenuOpen) {
       e.preventDefault();
       setIsMenuOpen(false);
     } else if (e.key === ' ') {
       e.preventDefault();
       onToggle(id);
     } else if (e.key === 'Delete' || e.key === 'Backspace') {
       e.preventDefault();
       onDelete(id); // ← ★ここが発火する
     } else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
       e.preventDefault();
       onDuplicate(id);
     }
   };
   ```
2. チップ本体のテキストをインライン編集している場合（`isEditing === true`）は、[`L115`](frontend/src/components/TagChipEditor/TagChip.tsx#L115) の `if (isEditing) return;` によりショートカットが抑止されます。
3. しかし、サブメニューを開いている状態では `isEditing` は `false`（`isMenuOpen === true`）のままです。
4. 強度調整用 `<input type="number">`（[`L328-L336`](frontend/src/components/TagChipEditor/TagChip.tsx#L328-L336)）にフォーカスして `Backspace` を入力した際、`handleWeightKeyDown` は `e.stopPropagation()` を呼んでいません。
5. また、サブメニューのラッパー `<div>`（[`L285-L289`](frontend/src/components/TagChipEditor/TagChip.tsx#L285-L289)）も `onClick={(e) => e.stopPropagation()}` によるクリック伝播は抑止しているものの、`onKeyDown` の伝播は遮断していません。
6. このため、`Backspace`（および `Delete`、`Space`、`Ctrl+D`）のキーイベントが最外周 `<div>` の `handleKeyDown` までバブリング（伝播）します。
7. `handleKeyDown` 内の `else if (e.key === 'Delete' || e.key === 'Backspace')` が一致し、`e.preventDefault()` でブラウザ既定の文字削除処理がキャンセルされた上で、`onDelete(id)` が実行されてチップ自体が削除されます。

---

## 4. 診断チェック（Diagnostic Check）

| 項目 | 判定結果 | 詳細 |
|---|---|---|
| **Root_Cause_Isolated** | **Yes** | `TagChip.tsx` における `handleWeightKeyDown` およびサブメニューコンテナでの `onKeyDown` イベント伝播未遮断（バブリング）を特定 |
| **Classification** | **Type A: Implementation Bug** | 仕様違反ではなく、サブメニュー内入力フィールドにおけるイベント伝播制御の実装漏れ |
| **影響スコープ** | フロントエンド単体 | `frontend/src/components/TagChipEditor/TagChip.tsx` |
| **禁止事項遵守** | 遵守 | ソースコードの変更・修正案の提示は行わず、読み取り専用で調査・レポートを作成 |

---

## 5. 次のアクション

根本原因の特定が完了しました。
本インシデントはフロントエンドコンポーネント内のイベント制御漏れによる **Type A（実装バグ）** であるため、バックログに不具合修正PBIとして登録し、`/dev-design` にて修正設計を行うことを推奨します。
