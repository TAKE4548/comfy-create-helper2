# インシデントレポート: サムネイルクロップ調整後のプレビュー巻き戻り事象および2段階確定フロー

## 1. 事象概要 (Overview)
LoRA および タグセットの詳細モーダルにおいて、サムネイルのクロップ調整（「切り抜いて保存」）を行ってモーダルを保存した際、詳細モーダル上のカバー画像プレビューが変更前の古い画像に戻ってしまう。
（※サーバー側へは保存されており、モーダルを一度閉じて開き直すと最新のクロップ画像が正常に反映される）

また、クロップ調整モーダル側で「切り抜いて保存」を実行した後、さらに詳細モーダル側でも「Save Changes」を押下しないと DB への反映が確定されないため、無駄に2段階確認の操作フローとなっている。

---

## 2. 再現手順・観測された挙動 (Reproduction & Observed Symptoms)

### 再現手順:
1. LoRA または タグセット一覧画面から、任意のアイテムをクリックして詳細モーダル（`LoraDetailModal` / `TagSetDetailModal`）を開く。
2. 「Edit」ボタンを押下して編集モードに入る。
3. カバー画像下の「クロップ調整」ボタンを押下し、`ImageCropper` を開く。
4. クロップ範囲を調整し、「切り抜いて保存」を押下する。
5. 詳細モーダルの「Save Changes」ボタンを押下して保存し、閲覧モードに戻る。

### 観測結果:
- **事象1（プレビュー巻き戻り）**:
  「Save Changes」完了後に詳細モーダルが閲覧モードに戻ると、カバー画像のプレビューがクロップ前の古い画像に戻ってしまう。
  モーダルを「Close」で閉じて一覧から再度同一アイテムを開くと、クロップ後の新しいサムネイルが表示される。
- **事象2（2段階確認の手間）**:
  `ImageCropper` 内で「切り抜いて保存」を実行しても、対象 LoRA / タグセットの `thumbnail_path` は直接更新（確定）されず、詳細モーダルの「Save Changes」を押さないと破棄されてしまう。

---

## 3. 影響範囲・該当コード (Affected Area & Source Locations)

| # | 対象ファイル | 該当行 / コンポーネント | 詳細 |
|---|---|---|---|
| 1 | `frontend/src/pages/LoRAsPage.tsx` | L122, L166-L176, L591-L598 | `selectedLoraForDetail` がモーダルを開いた時点のオブジェクトで固定されており、`updateLora.mutate` 成功後も `selectedLoraForDetail` が更新されないため、子モーダルに古い `lora` prop が渡り続ける |
| 2 | `frontend/src/pages/TagsPage.tsx` | L115, L173-L186, L592-L600 | `selectedTagSetForDetail` が同様に更新されず、更新後も古い `tagSet` prop が渡り続ける |
| 3 | `frontend/src/components/LoraModals.tsx` | L399-L410, L444-L447, L463-L473 | `isEditing` が `false` に戻った際、`currentThumbnail` が古い `lora.thumbnail_path` を参照して `activeImage` が巻き戻る。また `handleCropComplete` はフォーム状態の更新のみで確定保存を行わない |
| 4 | `frontend/src/components/TagSetModals.tsx` | L597-L608, L635-L638, L640-L654 | 同様に `TagSetDetailModal` において `isEditing` 終了時に古い `tagSet.thumbnail_path` が参照される |

---

## 4. 根本原因の分析 (Root Cause Analysis)

### 原因 1: 親コンポーネントにおける選択中アイテム（`selected...ForDetail`）のステート同期漏れ
1. **親コンポーネントの State 保持**:
   - `LoRAsPage.tsx` では、アイテムクリック時に `setSelectedLoraForDetail(lora)` で State を保持し、`<LoraDetailModal lora={selectedLoraForDetail} ... />` として渡しています。
2. **更新完了時の挙動**:
   - 詳細モーダルで「Save Changes」を実行すると、`updateLora.mutate` が走りサーバー側は更新され、`qc.invalidateQueries({ queryKey: ['loras'] })` により一覧クエリは再フェッチされます。
   - しかし、`selectedLoraForDetail` 自体は更新されないため、古い `Lora` オブジェクトを保持したままになります。
3. **子モーダル内のプレビュー決定ロジック**:
   - `LoraDetailModal` 内では、以下のようにサムネイルを判定しています：
     ```ts
     const currentThumbnail = isEditing ? form.thumbnail_path : lora.thumbnail_path
     ```
   - 「Save Changes」が押されると `isEditing` が `false`（閲覧モード）に戻るため、`currentThumbnail` は即座に `lora.thumbnail_path`（古いオブジェクトの値）を参照します。
   - `useEffect` が `currentThumbnail` の変化を検知して `setActiveImage(currentThumbnail)` を実行するため、画面左側のメインプレビューが変更前の画像に巻き戻ります。
   - モーダルを閉じて開き直すと、親コンポーネントが再フェッチ済みの最新アイテムを `setSelectedLoraForDetail` に設定するため、最新画像が表示されます。

### 原因 2: クロップ調整完了とモデルサムネイル確定の分離（2段階ステップ）
1. **アップロードとモデル更新の責務分離**:
   - 現行の `handleCropComplete` は、`POST /api/snapshots/upload` でトリミング画像をアップロードし、その URL をモーダルローカルの `form.thumbnail_path` に格納するだけになっています。
   - モデル（LoRA / タグセット）の更新 API（`PUT /api/loras/{id}` 等）は「Save Changes」ボタンの押下にバインドされています。
2. **ユーザー体験とのギャップ**:
   - ユーザーは `ImageCropper` の「切り抜いて保存」を押した時点でサムネイルが確定されたと認識するため、詳細モーダル側での再度の保存が冗長な2段階確認となっています。

---

## 5. 原因分類 (Classification)

<diagnostic_check>
- Root_Cause_Isolated: Yes
- Classification: Type_A: Implementation Bug (Preview rollback) / Type_B: Specification Flaw (2-step save UX)
- Scope_Restriction: Read-only phase. Code modification or fix proposals are strictly PROHIBITED during this turn.
- Route: Direct to /dev-design
</diagnostic_check>

* **プレビュー巻き戻り事象**: **Type A (Implementation Bug - 実装バグ)**
  * 親コンポーネント（`LoRAsPage` / `TagsPage`）における `selected...ForDetail` ステートの同期漏れおよび、モーダルの閲覧/編集切り替え時における Props 依存のキャッシュ参照不整合。
* **2段階保存フローの改善**: **Type B (Specification Flaw / UX改善)**
  * クロップ保存完了時の即時反映・自動確定フローに関する仕様の見直し。

---

## 6. バックログ登録とルーティング (Backlog Registration & Routing)

- **登録 PBI**: `docs/backlog/pbi/active/REQ-200.md`
- **タイトル**: `サムネイルクロップ調整後のプレビュー巻き戻り解消および即時確定フローの実装`
- **次のワークフロー**: `/dev-design REQ-200`

