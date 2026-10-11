# REQ-337 実行可能テスト計画

## 1. 自動テスト Baseline 検証 (CLI Verification)

### Gate 1: 静的型チェック (Typecheck Baseline)
- **コマンド**: `npm run typecheck` (in `frontend/`)
- **期待値**: 型エラー 0 件 (Exit code 0)

### Gate 2: ユニット＆結合テスト (Unit / Full Suite Baseline)
- **コマンド**: `npx vitest run src/hooks/__tests__/useComfyNodeTypes.test.ts src/components/__tests__/MappingMasterEditModalAutocomplete.test.tsx`
- **フルスイート**: `npx vitest run`
- **期待値**: 全テスト PASS (Exit code 0)。

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### シナリオ 1: ComfyUI 接続時の動的オートコンプリート検索・追加 (AC-1)
- **手順**:
  1. `MappingMasterEditModal` を開き、期待 Class Types 入力欄に `KSamp` と入力する。
  2. ComfyUI `/api/comfy/object_info` から取得された `KSampler` がドロップダウンに表示されることを確認する。
  3. 下矢印キーでハイライトし `Enter` を押下（またはクリック）する。
  4. `classTypes` チップとして `KSampler` が追加され、入力欄がクリアされることを確認する。
- **期待結果**: 入力欄に入力したキーワードに応じてリアルタイムに候補が抽出・選択追加されること。

### シナリオ 2: 重複追加防止 (AC-3)
- **手順**:
  1. 既に `KSampler` がチップとして登録されている状態で、再度入力欄に `KSampler` を入力する。
  2. オートコンプリート候補から選択するか、`Enter` を押下する。
- **期待結果**: チップ一覧に `KSampler` が重複して追加されず、単一のチップとして維持されること。

---

## 3. Red Teaming (境界値・異常系シナリオ) [Gate 3 Baseline]

### 異常系シナリオ 1: ComfyUI 未接続・503 エラー・ネットワーク切断時のフォールバック (AC-2)
- **手順**:
  1. MSW またはテスト設定で `/api/comfy/object_info` (または `/comfy/object_info`) が HTTP 503 またはネットワークタイムアウトを返すように設定する。
  2. `MappingMasterEditModal` を開く。
  3. Class Types 入力欄に `CustomNode` と入力し、`Enter` を押下する。
  4. 静的候補パレット `+ KSampler` をクリックする。
- **期待結果**:
  - 画面全体やモーダルがクラッシュ・ブロックされず正常に開くこと。
  - エラーダイアログ等でブロックされず、手入力 `CustomNode` が通常通りチップ登録されること。
  - 静的候補パレットをクリックして候補が通常通りチップ登録されること。

### 境界値シナリオ 2: 空白入力・特殊記号・大量ノード候補の描画制限
- **手順**:
  1. 空白文字列（スペースのみ）を入力して `Enter` を押下した場合にチップが追加されないこと。
  2. 正規表現のメタ文字（`[` や `*` 等）を入力しても正規表現エラーでクラッシュせず、部分一致検索が安全に行われること。
  3. 100件以上の候補が存在する場合でも、最大件数（15件）でスライスされ UI が重くならないこと。

---

## 4. ツール主導監査 (Tool-Driven Audit)
- **コマンド**: `python ${GLOBAL_SCRIPTS}/local_model_adapter.py ba-audit`
- **アンロード**: `python ${GLOBAL_SCRIPTS}/local_model_adapter.py unload`

