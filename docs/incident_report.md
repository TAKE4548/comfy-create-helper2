# インシデントレポート: 縦書きセリフにおけるパス・軌道レイアウトの横書き配置不具合に関する調査報告書

## 1. 障害概要 (Overview)

REQ-168（セリフ修飾機能）にて追加されたパス・軌道レイアウト機能において、セリフの文字方向を「縦書き（`orientation: 'vertical'`）」に設定している状態でパスプリセット（直線・円弧・S字波・階段）を選択すると、文字が上から下への縦書き軌道ではなく、左から右への横書き軌道（X軸方向 0.1〜0.9）に沿って配置されてしまう不具合が観測された。

### 観測されている事象:
1. **縦書き設定時の横方向配置**: 縦書き指定であっても、パスプリセット有効時に文字が横方向（水平）に流れるように描画される。
2. **縦書きレイアウトのバイパス**: レンダラー内部で `pathPreset !== 'none'` の場合に縦書き用の段落・行配置処理（`layoutVerticalText`）がバイパスされ、横書き前提の制御点補間のみが実行されている。
3. **接線回転角の不整合**: パス接線方向への文字回転追従（`pathFollowRotation`）が横書きテキスト基準（水平進行角）で計算されているため、縦書き文字の流れに対して意図しない回転角が適用される。

---

## 2. 再現手順・観測された挙動 (Reproduction & Observed Symptoms)

- **再現手順**:
  1. 吹き出し編集モーダルにて、文字方向を「縦書き」に設定したセリフを作成・選択する。
  2. 演出パラメータ「3. パス・軌道レイアウト」にて、軌道タイプ（`line`, `arc`, `wave`, `stepped`）を選択する。
- **観測結果**:
  1. 縦書き設定であるにもかかわらず、文字が水平方向（左から右）のパス上に並んで描画される。

---

## 3. 影響範囲・該当コード (Affected Area & Source Locations)

| # | 対象ファイル | 該当行 / 関数 | 詳細 |
|---|---|---|---|
| 1 | `frontend/src/utils/speechBubbleRenderer.ts` | L168-223 (`calculateCharacterTransform`) | `line`, `arc`, `wave`, `stepped` のデフォルト制御点が横書き基準（X: 0.1〜0.9）でハードコードされており、`bubble.orientation` による分岐がない。 |
| 2 | `frontend/src/utils/speechBubbleRenderer.ts` | L225 (`tangentAngle`), L737 | パス接線回転角が横書き基準角（水平ベクトル）で算出されている。 |
| 3 | `frontend/src/utils/speechBubbleRenderer.ts` | L762-768 (`drawSpeechBubbleText`) | `pathPreset !== 'none'` の際、縦書きテキストの進行方向やレイアウト情報が考慮されずに全文字がパス上に単一配置される。 |
| 4 | `frontend/src/types/speechBubble.ts` | L75-92 (`DEFAULT_MANGA_EFFECTS`) | `pathPoints` の初期値が横書き基準（X: 0.1〜0.9）となっている。 |

---

## 4. 根本原因の分析 (Root Cause Analysis)

### 根本原因 1: デフォルト制御点座標の orientation 非連動
- `calculateCharacterTransform` 内において、`fx.pathPoints` が未指定（またはデフォルト）の場合のフォールバック制御点（直線・円弧・波・階段）がすべて横方向（X軸: 0.1 → 0.9, Y軸: 中央または上下変動）に定義されている。
- 縦書き（`orientation === 'vertical'`）の場合に上から下（Y軸: 0.1 → 0.9, X軸: 中央または左右変動）へ流れる制御点への切り替えが行われていない。

### 根本原因 2: 縦書き時におけるパス進行方向と文字接線回転角の不整合
- パス追従回転（`pathFollowRotation`）において算出される `tangentAngle` が `Math.atan2(dy, dx)` であり、横書き（水平進行）をベース角度 $0^\circ$ としている。
- 縦書き文字に対して水平基準の接線角度をそのまま加算すると文字が不自然に傾くため、縦書き基準角（$+90^\circ$ または垂直進行）との差分を考慮する必要がある。

---

## 5. 原因分類 (Classification)

<diagnostic_check>
- Root_Cause_Isolated: Yes
- Classification: Type_A: Implementation Bug
- Scope_Restriction: Read-only phase. Code modification or fix proposals are strictly PROHIBITED during this turn.
- Route: Direct to /dev-design
</diagnostic_check>

* **分類**: **Type A (Implementation Bug / 実装不具合)**
  * 縦書き時（`orientation === 'vertical'`）におけるパス軌道のデフォルト制御点（Y軸方向進行）の適用および接線回転角度の縦書き補正が必要。

---

## 6. 次のステップ提案 (Next Action)

不具合の原因特定と分類（Type A: 実装不具合）が完了しました。
バックログに PBI-REQ-171 を登録し、詳細設計およびテストケース策定を行うため **`/dev-design` ワークフロー** への移行を推奨します。

