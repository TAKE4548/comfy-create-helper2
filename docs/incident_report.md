# インシデントレポート: アクティブプリセットのプロンプト消失およびセクションコピペ機能不全

## 1. 事象概要 (Overview)
生成画面において、以下2つの重大な不具合が観測された：
1. アクティブなプリセットの入力欄（TagChipEditor）に表示されていたはずのプロンプト文字列が消える（空になる）。
2. 別プリセットからセクションのコピペ機能（`PromptSectionClipboardMenu`）を使用して貼り付け（ペースト）を実行しても、入力欄に反映されない（ペーストできない）。

---

## 2. 再現手順・観測された挙動 (Reproduction & Observed Symptoms)

### 再現手順:
1. 複数のプリセットを作成または切り替える。
2. プリセット切り替え時、アクティブなプリセットの入力欄のプロンプトが空（`""`）になる。
3. セクションのクリップボードメニュー（`PromptSectionClipboardMenu`）から「プロンプトをコピー」し、別のプリセットで「クリップボードから貼り付け」または履歴から選択する。

### 観測結果:
- 入力欄に貼り付けテキストが反映されず、元の値または空のままとなる。

---

## 3. 影響範囲・該当コード (Affected Area & Source Locations)

| # | 対象ファイル | 該当行 | 詳細 |
|---|---|---|---|
| 1 | `frontend/src/components/TagChipEditor/index.tsx` | L86-L108 | `chipsProp !== undefined` の場合、`value`（文字列プロンプト）の変更監視・同期処理がスキップされ、外部からの文字列変更を完全に無視する |
| 2 | `frontend/src/components/TagChipEditor/index.tsx` | L118-L145 | 内部通知 Effect が直後に走り、更新されなかった古いチップ文字列で親の `onChange` を上書き発火する |
| 3 | `frontend/src/pages/GeneratePage/components/DesktopLayout.tsx` | L608-L620 | `TagChipEditor` の `key` が `m.role!` のみとなっており、`activeSetId`（プリセット・セットID）の変化でコンポーネントが再マウントされない |
| 4 | `frontend/src/pages/GeneratePage/components/MobileLayout.tsx` | L706-L718 | MobileLayout でも同様に `key` に `activeSetId` が含まれていない |
| 5 | `frontend/src/store/slices/multiSetSlice.ts` | L320-L345 | `loadPresetData` において `promptChips` の同期・パースと `paramValues` の整合性が未保証 |

---

## 4. 根本原因の分析 (Root Cause Analysis)

### 原因①: `TagChipEditor` が `chips` prop を受け取っている場合、外部からの `value` 変更を完全に無視する
- `DesktopLayout` および `MobileLayout` では `chips={promptChips?.[role]}` を渡している。
- セクションコピペ機能（`PromptSectionClipboardMenu`）は `onChangeValue(cleanToPaste)` を呼び出し、親の `paramValues`（文字列）を更新する。
- しかし `TagChipEditor` は `chipsProp !== undefined`（空配列 `[]` や以前のチップが渡されている状態）であるため、親の `value`（文字列）がコピペで変更されても **else ブロックが実行されず、文字列の更新を完全に無視**する。
- その直後、内部通知 Effect（L118-L145）によって TagChipEditor 内の未更新チップ配列から生成された古い文字列で親の `onChange` が呼び戻され、貼り付けたプロンプトが古い値で即座に上書きされてしまう。

### 原因②: プリセット・セット切り替え時にコンポーネントが再マウントされず、チップ状態と `paramValues` が乖離する
- `DesktopLayout` および `MobileLayout` において `TagChipEditor` の `key` が `role` のみ（例: `key={m.role!}`）となっており、`activeSetId` が変化してもコンポーネントが再初期化されない。
- プリセット切り替え時に `paramValues`（文字列）が更新されても、上記原因①により `chipsProp` が空配列や旧プリセット状態のままだと `paramValues` の新文字列がチップに変換されず、空チップがストアに送り返されてプロンプトが消滅する。

---

## 5. 原因分類 (Classification)

<diagnostic_check>
- Root_Cause_Isolated: Yes
- Classification: Type_A: Implementation Bug
- Scope_Restriction: Read-only phase. Code modification or fix proposals are strictly PROHIBITED during this turn.
- Route: Direct to /dev-design
</diagnostic_check>

* **分類**: **Type A (Implementation Bug - 実装上の不具合)**
  * 仕様設計（セクションコピペ機能やタグチップ機能）の問題ではなく、コンポーネント間のプロップス同期（`value` と `chips` の調停ロジック）および React キー設計に起因する実装バグ。

---

## 6. バックログ登録とルーティング (Backlog Registration & Routing)

- **登録 PBI**: [REQ-221.md](./backlog/pbi/active/REQ-221.md)
- **タイトル**: `REQ-220適用後の生成ページ無限再描画エラー（真っ黒画面）の解消`
- **分類**: Type A (Implementation Bug)
- **次のワークフロー**: `/dev-design REQ-221`


