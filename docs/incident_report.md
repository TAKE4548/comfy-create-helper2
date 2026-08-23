# インシデントレポート: タッチ操作端末におけるタグチップ並び替え不能（D&D即時キャンセル不具合）に関する調査報告書

## 1. 障害概要 (Overview)

タッチ操作環境（スマートフォン・タブレット等のタッチ端末）において、タグチップエディタ（`TagChipEditor`）のタグチップ（並び替えハンドル含む）をドラッグして移動・並び替えを行おうとしても、ドラッグが開始されず移動できない現象が報告された。

### 観測されている事象:
1. **タッチドラッグの不発**: タッチ操作でタグチップのドラッグハンドル（`<GripVertical>`）を押下して指を動かしても、ドラッグ状態に移行せず並び替えが行えない。
2. **PCマウス操作との差異**: PC環境でのマウス操作によるドラッグ＆ドロップは正常に動作するが、タッチ操作時のみ完全に無反応となる。
3. **他画面での同様の設定**: REQ-153で一括変更された他画面（プリセットパネル、タグ一覧、LoRA一覧、生成履歴、設定画面）の `TouchSensor` 設定にも同様のパラメータが設定されている。

---

## 2. 再現手順・観測された挙動 (Reproduction & Observed Symptoms)

- **再現手順**:
  1. タッチ対応端末（またはブラウザのDevToolsモバイルエミュレーション/タッチモード）でタグ編集可能な画面（Generate画面、TagSet編集モーダル等）を開く。
  2. チップモードの `TagChipEditor` において、任意のタグチップのドラッグハンドル（あるいはチップ本体）をタッチし、左右にドラッグしようとする。
- **観測結果**:
  1. タッチ移動を開始した瞬間にドラッグセッションがキャンセルされ、タグチップが移動しない。

---

## 3. 影響範囲・該当コード (Affected Area & Source Locations)

| # | 対象ファイル | 該当行 / 関数 | 詳細 |
|---|---|---|---|
| 1 | `frontend/src/components/TagChipEditor/index.tsx` | L57-62 (`useSensors`) | `TouchSensor` の `activationConstraint` に `{ distance: 5, tolerance: 5 }` が設定されている。 |
| 2 | `frontend/src/components/PresetManagerPanel.tsx` | L64-69 (`useSensors`) | 同様に `TouchSensor` に `{ distance: 5, tolerance: 5 }` が設定されている。 |
| 3 | `frontend/src/pages/TagsPage.tsx` | L108-114 (`useSensors`) | 同様に `TouchSensor` に `{ distance: 5, tolerance: 5 }` が設定されている。 |
| 4 | `frontend/src/pages/LoRAsPage.tsx` | L108-114 (`useSensors`) | 同様に `TouchSensor` に `{ distance: 5, tolerance: 5 }` が設定されている。 |
| 5 | `frontend/src/pages/HistoryPage.tsx` | L310-316 (`useSensors`) | 同様に `TouchSensor` に `{ distance: 5, tolerance: 5 }` が設定されている。 |
| 6 | `frontend/src/pages/SettingsPage.tsx` | L478-484 (`useSensors`) | 同様に `TouchSensor` に `{ distance: 5, tolerance: 5 }` が設定されている。 |

---

## 4. 根本原因の分析 (Root Cause Analysis)

### 根本原因 1: `@dnd-kit/core` の `AbstractPointerSensor` における制約判定順序と `tolerance` の競合
- `@dnd-kit/core` の `AbstractPointerSensor.prototype.handleMove` 内における `activationConstraint`（距離制約 `isDistanceConstraint`）の判定ロジックは以下の通り実装されている：
  ```javascript
  if (isDistanceConstraint(activationConstraint)) {
    if (activationConstraint.tolerance != null && hasExceededDistance(delta, activationConstraint.tolerance)) {
      return this.handleCancel(); // tolerance を超えるとキャンセル
    }
    if (hasExceededDistance(delta, activationConstraint.distance)) {
      return this.handleStart();  // distance を超えるとドラッグ開始
    }
  }
  ```
- `activationConstraint` に `{ distance: 5, tolerance: 5 }` が指定されている場合、移動量（`delta`）が 5px を超えた瞬間に、1つ目の条件分岐である `hasExceededDistance(delta, 5)` が真と評価され、**ドラッグ開始条件（`distance`）を評価する前に `handleCancel()` が呼び出されて即時キャンセル**される。
- これにより、タッチドラッグを発動させることが原理的に不可能となっている。

### 根本原因 2: REQ-153 における `TouchSensor` 制約移行時の残存設定
- 以前の実装では `{ delay: 500, tolerance: 5 }`（「500msの長押し待ち時間中、許容移動量5px以内なら開始」）として `tolerance` を使用していた。
- REQ-153（タッチ端末でのドラッグハンドル導入・即時レスポンス改善）において `delay` を廃止し `distance: 5` へ変更した際、不要となった `tolerance: 5` がそのまま残存したため、本不具合が発生した。

---

## 5. 原因分類 (Classification)

<diagnostic_check>
- Root_Cause_Isolated: Yes
- Classification: Type_A: Implementation Bug
- Scope_Restriction: Read-only phase. Code modification or fix proposals are strictly PROHIBITED during this turn.
- Route: Direct to /dev-design
</diagnostic_check>

* **分類**: **Type A (Implementation Bug / 実装不具合)**
  * `@dnd-kit/core` の距離制約仕様に対する誤ったプロパティ指定（`distance` と同値の `tolerance` 併用）に起因する実装不具合。

---

## 6. 次のステップ提案 (Next Action)

不具合の原因特定と分類（Type A: 実装不具合）が完了しました。
バックログへ PBI を登録し、修正設計および検証テストケースを策定するため、**`/dev-design` ワークフロー** への移行を提案します。

