# インシデントレポート: プリセットオートセーブ時の競合検知（OCC）誤発火および定期ポーリングによる保存遅延不具合

**日時**: 2026-09-20  
**報告者**: Incident Analyst  
**対象コンポーネント**: 
- `frontend/src/pages/GeneratePage/hooks/usePresetState.ts` (L91-L99: `isStateEqual` キー順序依存、L190-L208: `updatePresetMutation.onError` 409処理、L951-L995: ポーリング時差分チェックと競合誤判定、L1054-L1097: オートセーブ `useEffect` の `presets` 依存)
- `backend/app/routers/presets.py` (L86-L100: `update_preset` の `base_updated_at` による 0.01s 楽観的ロック検証)
- `logs/app.jsonl` (単一端末操作中の連続 HTTP 409 Conflict 発生ログ)
**分類**: **Type A（実装バグ / Implementation Bug）**

---

## 1. 障害概要

- **症状**:
  1. **【直接要因】単一端末での競合モーダル（PresetConflictModal）誤発火**:
     他端末や別ブラウザでの同時編集が一切行われていないにもかかわらず、プロンプト編集やパラメータ調整中に「プリセットが他セッションで更新されました」という競合解決モーダルが頻発する。
  2. **【独立した別問題】ポーリングによるデバウンスタイマーリセットと保存遅延**:
     ユーザーが入力を終えて1秒以上経過したと認識して「生成（Generate）」を押下したにもかかわらず、定期ポーリング（5秒周期）によってオートセーブタイマーが不意に延命リセットされ、未保存（旧パラメータ）の状態でジョブが ComfyUI に投入される。

- **影響範囲**:
  - プロンプト入力（テキストモード／チップモード問わず）、パラメータ変更、シード・バッチサイズ編集を日常的に行うすべてのユーザー。作業の中断および意図せぬパラメータ巻き戻り（旧設定での画像生成）を引き起こす。

---

## 2. ログおよび実行フォレンジック検証

### ログ証拠（Active Log Inspection: `logs/app.jsonl`）
- `logs/app.jsonl` 調査結果:
  - 単一クライアントからの `PUT /api/workflow-presets/1506` に対して、数秒〜十数秒単位で `HTTP 409` が頻発して記録されている。
  - 具体例（2026-09-20 21:08 〜 21:12）:
    - `[2026-09-20T21:08:16.977+09:00] [INFO ] [backend ] [req-5f4b1fcb26f5] PUT /api/workflow-presets/1506 -> 409 (7.45ms)`
    - `[2026-09-20T21:08:36.284+09:00] [INFO ] [backend ] [req-d6fa34e63f41] PUT /api/workflow-presets/1506 -> 409 (4.15ms)`
    - `[2026-09-20T21:08:42.063+09:00] [INFO ] [backend ] [req-7abae6660a27] PUT /api/workflow-presets/1506 -> 409 (5.34ms)`
    - `[2026-09-20T21:08:48.228+09:00] [INFO ] [backend ] [req-803438018a66] PUT /api/workflow-presets/1506 -> 409 (3.95ms)`
    - `[2026-09-20T21:09:12.366+09:00] [INFO ] [backend ] [req-69754b02e512] PUT /api/workflow-presets/1506 -> 409 (3.51ms)`
    - `[2026-09-20T21:09:13.603+09:00] [INFO ] [backend ] [req-3424adecb9ed] PUT /api/workflow-presets/1506 -> 409 (5.21ms)`
    - `[2026-09-20T21:09:22.468+09:00] [INFO ] [backend ] [req-79bda66feafa] PUT /api/workflow-presets/1506 -> 409 (6.59ms)`
    - `[2026-09-20T21:09:23.687+09:00] [INFO ] [backend ] [req-30346b19446d] PUT /api/workflow-presets/1506 -> 409 (5.48ms)`
  - エラーログ（ERROR レベル）としては記録されず、HTTP 409 Conflict（INFO）として FastAPI から正常に返却されているため、バックエンドの例外ではなくクライアント側の通信レースが原因。

---

## 3. 根本原因の分離とメカニズム

ユーザー調査報告書（`tmp/Prompt_Surgeon_Prompt_Edit_Conflict_and_Autosave_Analysis.pdf`）およびコード検証により、問題は以下の2つの独立した課題に峻別される。

### 【直接要因】競合モーダル誤発火の2大メカニズム
1. **直接要因①: 通信中（In-flight）の連続保存による BE の 409 Conflict**:
   - `updatePresetMutation` が実行中（In-flight）であるにもかかわらず、ユーザー操作やタイマーにより2回目の PUT リクエストが発行される。
   - 1回目の保存で DB の `updated_at` は新時刻 T1 に進むが、2回目のリクエストは1回目のレスポンス（T1）を受け取る前に送信されるため、古い `base_updated_at: T0` を保持したまま届く。
   - `presets.py` (L96) の `(db_updated_at - base_updated_at).total_seconds() > 0.01` に引っかかり HTTP 409 Conflict が返却され、`updatePresetMutation.onError` (L190-L208) が競合モーダルを表示する。
2. **直接要因②: 差分判定の不整合による「偽の isDirty 残留」と定期ポーリングの衝突**:
   - `isStateEqual` (L91-L99) が `JSON.stringify` で比較しているため、オブジェクトのキー出現順序が入れ替わっただけで等価と判定されず、保存後も恒常的に `isDirty = true`（未保存状態）と誤認され続ける。
   - テキスト入力時の末尾空白やカンマ等（`"1girl, solo, "`）の生文字列保存後、手元の正規化（`"1girl, solo"`）との間で不一致が生じ `isDirty` が解除されない。
   - この状態で、自端末の保存によって進んだ BE の `updated_at` を 5秒周期のポーリングが拾うと、`usePresetState.ts` (L951-L995) は「他端末が更新し、手元にも未保存差分がある」と誤認して競合モーダルを発火させる。

### 【独立した別問題】ポーリングによるタイマーリセットと保存遅延
- **該当箇所**: `frontend/src/pages/GeneratePage/hooks/usePresetState.ts` L1097
- **メカニズム**:
  - オートセーブ用の `useEffect` の依存配列に `presets` が含まれている。
  - 5秒ごとの定期ポーリングで `presets` の参照が更新されるたびに `useEffect` のクリーンアップが走り、進行中だった 1秒デバウンスタイマーが不意にクリア・再セット（延命）される。
  - ユーザーが「入力停止後1秒待った」と思って生成ボタンを押しても、実際にはリクエスト送信が遅延しており、保存前の古い値で生成が走る（REQ-278 の実害の一因）。

---

## 4. 障害分類と判定理由

- **分類**: **Type A（実装バグ / Implementation Bug）**
- **判定理由**:
  - 楽観的排他制御（OCC）の仕様自体（他セッションの更新を 409 で防ぐ）に破綻はなく、フロントエンド側における以下の実装上の瑕疵であるため：
    1. オートセーブの In-flight 制御（直列化）が欠如している。
    2. キー順序に影響される不適切な `JSON.stringify` 等価判定により偽の dirty 状態が残留している。
    3. オートセーブタイマーがポーリングによる `presets` 更新の巻き添えでリセットされている。

---

## 5. 推奨する次のアクション

- **ルート**: **`/dev-design`**（開発設計・タスクカード作成）
- **推奨 PBI 内容**:
  1. オートセーブ直列化（In-flight ガード）の実装（`isPending` 中の新規リクエスト待機・最新差分1回送信）。
  2. `isRecordEqual` によるキー順序非依存の差分比較への移行（JSON.stringify の廃止）。
  3. テキストモード保存時の文字列正規化同期。
  4. オートセーブ `useEffect` の依存配列から `presets` を除外し、`presetsRef.current` 参照化。
