# インシデントレポート: サムネイルクロップ調整時のドラッグ操作終了（D&D離下）に伴うモーダル誤クローズ事象

## 1. 事象概要 (Overview)
LoRA または タグセットの編集・詳細モーダル等において、カバーサムネイル画像のクロップ調整を行う際、クロップ領域をドラッグ（パン）してマウスボタンを離した（Mouse Up / D&D終了）瞬間に、クロップモーダルおよび親モーダル全体が予期せず閉じてしまい、クロップ結果を保存できない事象が発生する。

---

## 2. 再現手順・観測された挙動 (Reproduction & Observed Symptoms)

### 再現手順:
1. LoRA または タグセット一覧画面から、任意のアイテムをクリックして詳細/編集モーダルを開く。
2. カバー画像プレビュー下の「クロップ調整」ボタンを押す（または画像を新規アップロードする）。
3. クロップモーダル（`ImageCropper`）が表示される。
4. クロップ枠内の画像をマウスドラッグでパン移動し、構図を調整する。
5. マウスボタンを離す（ドラッグ終了 / drop）。

### 観測結果:
- マウスボタンを離した瞬間に、クロップモーダルだけでなく親の詳細/編集モーダルごと閉じてしまう。
- クロップ後の「切り抜いて保存」ボタンを押すことができず、変更内容が破棄される。

---

## 3. 影響範囲・該当コード (Affected Area & Source Locations)

| # | 対象ファイル | 該当行 / コンポーネント | 詳細 |
|---|---|---|---|
| 1 | `frontend/src/components/ImageCropper.tsx` | L97 (ルート要素 `fixed inset-0`) | `ImageCropper` のルートオーバーレイ要素およびコンテナに `onClick={(e) => e.stopPropagation()}` などのイベント伝播抑止が設定されていない |
| 2 | `frontend/src/components/LoraModals.tsx` | L476 (`.modal-backdrop`), L679-L686 (`<ImageCropper>`) | `ImageCropper` が `LoraDetailModal` の `<div className="modal-backdrop" onClick={onClose}>` の直下に配置されており、子要素で発生したクリックイベントが親の `onClose` に到達する |
| 3 | `frontend/src/components/TagSetModals.tsx` | L254-L261, L543-L550, L825-L832 (`<ImageCropper>`) | 各種タグセットモーダルにおいて、同様に親の `modal-backdrop` の内側に `ImageCropper` が配置されている |

---

## 4. 根本原因の分析 (Root Cause Analysis)

### イベントバブリングによる親モーダルの `onClick={onClose}` 誤発火
1. **DOM イベントの発火特性**:
   - ブラウザでは、同一要素（または共通祖先）上で `mousedown` の後に `mouseup` が行われると、ドラッグ操作後であっても `click` イベントが生成・送出されます。
2. **コンポーネント構造とイベント伝播**:
   - `LoraDetailModal` や `TagSetDetailModal` 等では、外枠の `<div className="modal-backdrop" onClick={onClose}>` 内に `ImageCropper` がレンダリングされています。
   - `ImageCropper` 内部（`react-easy-crop` や操作UI、オーバーレイ全体）にはイベント伝播を停止する `e.stopPropagation()` が設定されていません。
3. **誤クローズの連鎖**:
   - ユーザーが `ImageCropper` 内で画像をドラッグしてマウスボタンを離した際（`mouseup`）、ブラウザから `click` イベントがディスパッチされます。
   - この `click` イベントが親方向へバブリングし、最上位の `<div className="modal-backdrop" onClick={onClose}>` に到達して `onClose` が呼び出されます。
   - その結果、親モーダルが即座にアンマウントされ、内包されていた `ImageCropper` も含めてすべての画面が強制終了し、保存不能となります。

---

## 5. 原因分類 (Classification)

<diagnostic_check>
- Root_Cause_Isolated: Yes
- Classification: Type_A: Implementation Bug
- Scope_Restriction: Read-only phase. Code modification or fix proposals are strictly PROHIBITED during this turn.
- Route: Direct to /dev-design
</diagnostic_check>

* **分類**: **Type A (Implementation Bug - 実装バグ)**
  * クロップコンポーネントおよびモーダル階層におけるクリックイベントのバブリング（伝播）制御の不備に起因する純粋なフロントエンド実装上の不具合です。

---

## 6. バックログ登録とルーティング (Backlog Registration & Routing)

- **登録推奨 PBI**: `docs/backlog/pbi/active/REQ-199.md`
- **タイトル**: `ImageCropper操作時におけるイベント伝播制御とモーダル誤クローズ防止（D&D後の保存不能解消）`
- **次のワークフロー**: `/dev-design REQ-199`
