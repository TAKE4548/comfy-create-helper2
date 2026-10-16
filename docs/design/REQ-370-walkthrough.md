# REQ-370 受入検証報告書 (Acceptance Walkthrough)

## 1. 検証概要

PBI REQ-370「複数端末における生成履歴同期抜けの修正（スナップショット遷移判定・差分スロット上限・挿入位置時系列不整合）」に関する受入検証（Phase 3 Acceptance Verification）を実施した。
本検証では、3-Gate Baseline（静的型チェック、全テストスイート回帰、シナリオ＆Red Teaming）の自動実行およびローカルモデル QA 監査の試行、ならびに VRAM リソース解放を厳格に確認した。

---

## 2. 3-Gate Baseline 検証結果

| Gate | 検証項目 | 実行コマンド | 結果 | 詳細・エビデンス |
| :--- | :--- | :--- | :--- | :--- |
| **Gate 1** | 静的型チェック (Typecheck Baseline) | `npm --prefix frontend run typecheck` (`tsc -b --noEmit`) | **PASS** | エラー 0 件 (Exit Code 0) |
| **Gate 2** | 全テストスイート回帰 (Full Suite Baseline) | `npm --prefix frontend test -- --run` | **PASS** | 239 テストファイル / 2,418 テスト全件 PASS (0 failure) |
| **Gate 3** | シナリオ＆Red Teaming (PBI Acceptance) | Vitest による AC タグ付きケース & Red Teaming 検証 | **PASS** | AC-1〜AC-4 100% 検証完了、Red Teaming 境界値・耐障害性確認 |

---

## 3. 受入基準 (Acceptance Criteria) 適合性マトリクス

| AC ID | 基準内容 (Given-When-Then) | 検証テストケース / ファイル | 判定 |
| :--- | :--- | :--- | :--- |
| **[REQ-370/AC-1]** | **Given**: 直前スナップショットが存在しない（または直前 epoch と異なる/HTTP再同期）状態<br>**When**: `succeeded` ジョブを含むスナップショットを `applyGenerationSnapshot` に適用したとき<br>**Then**: 状態遷移を経由していない完了ジョブであっても `mergeManagedHistory` が呼び出され、履歴画像がストアに反映されること | `frontend/src/store/__tests__/slices/connectionSlice.test.ts`<br>`[REQ-370/AC-1] merges historical succeeded jobs from a snapshot even on initial load or epoch change` | **PASS** |
| **[REQ-370/AC-2]** | **Given**: 閲覧端末側ですでに200件の履歴画像（`history.all`）が保持されている状態<br>**When**: `mergeResidualHistory` に他端末で生成された新規差分アイテムが渡されたとき<br>**Then**: 差分が0件に切り捨てられることなく追加され、マージ後の件数が200件上限に維持されること | `frontend/src/services/__tests__/residualHistory.test.ts`<br>`[REQ-370/AC-2] accepts new candidates via FIFO up to 200 items even when already holding 200 items` | **PASS** |
| **[REQ-370/AC-3]** | **Given**: 残存履歴から初回差分画像を取得した状態<br>**When**: 既存履歴とマージされたとき<br>**Then**: 差分画像が配列の最古末尾ではなく、最新バッチと整合する適切な位置（先頭側）に配置されること | `frontend/src/services/__tests__/residualHistory.test.ts`<br>`[REQ-370/AC-3] places initial residual batch at the front of existing history` | **PASS** |
| **[REQ-370/AC-4]** | **Given**: バックグラウンド中に別端末で生成が完了した状態<br>**When**: 閲覧端末のタブがフォアグラウンドに復帰したとき<br>**Then**: スナップショットまたは残存履歴の再検証が行われ、取りこぼしたバッチ画像が画面リロードなしで履歴ギャラリーに反映されること | `frontend/src/pages/GeneratePage/hooks/__tests__/useGenerateDisplayState.residual.test.tsx`<br>`[REQ-370/AC-4] calls store.loadSnapshot on visibilitychange and updates query cache with newly completed images` | **PASS** |

---

## 4. Red Teaming (境界値・異常系・耐障害性検証)

1. **RT-1: 既存 200 件保持時の FIFO 追い出し上限維持境界検証**
   - 既存 200 件の履歴画像が存在する状態で新規候補が渡された際、件数が 200 件の上限を超過せず、最古の画像から安全に切り落とされることを確認（`residualHistory.test.ts`）。
2. **RT-2: 初回差分画像の先頭側挿入・時系列逆転防止**
   - 直前追加 ID が空の初回バッチ同期時において、差分画像が配列末尾（最古側）ではなく配列先頭側に配置され、新着バッチの時系列が正常に保たれることを確認（`residualHistory.test.ts`）。
3. **RT-3: タブ復帰時（`visibilitychange`）におけるストアメソッド未定義・障害耐性**
   - `useGenerateDisplayState` のタブ復帰ハンドラにおいて、`store.loadSnapshot?.()` のオプショナルチェイニングを適用。ストアモックやネットワーク障害発生時にもハンドラ全体がクラッシュせず、同期処理および後続処理が継続されることを確認（`useGeneratePageState.test.tsx` での全 26 件パス確認）。
4. **RT-4: 状態遷移なし完了ジョブの安全マージと通知重複抑止**
   - epoch 変更や初回ロード時にスナップショット内の全 `succeeded` ジョブをマージする際、重複チェック（`imageIdentity` 照合）により二重登録を防ぎつつ、不要なリアルタイム通知イベント（`comfy-job-event`）が発火しないことを確認（`connectionSlice.test.ts`）。

---

## 5. テスト衛生性チェック (Test Hygiene)

```bash
python helpers/workflow_validator.py test-hygiene REQ-370
```
- **判定**: **PASS** (`[PASS] No ticket-named test files found. Validation successful.`)
- チケット番号付きテストファイルの新規作成はなく、既存のコロケーションテストファイルに `[REQ-370/AC-x]` タグ付きケースが適切に追加されていることを確認。

---

## 6. ローカルモデル QA 監査および VRAM 解放結果

- **QA 監査実行**:
  - コマンド: `python helpers/local_model_adapter.py --context-length 32768 qa-audit docs/design/REQ-370-test-plan.md`
  - 結果: LM Studio API の HTTP タイムアウト (`LocalModelError: Error querying LM Studio API: timed out`) が発生。
  - 状態: **UNAVAILABLE (API timed out)**
- **MANDATORY GPU CLEANUP (VRAM 解放)**:
  - コマンド: `python helpers/local_model_adapter.py unload`
  - 実行結果: Exit code 0 (`[Local Audit] LM Studio reports no models loaded.`)
  - ロックされた VRAM の即時解放完了を確認。

---

## 7. 実行エビデンス (<execution_evidence>)

<execution_evidence>

### Gate 1: Typecheck Baseline
```
> frontend@0.0.0 typecheck
> tsc -b --noEmit

Exit code: 0
```

### Gate 2: Full Test Suite Baseline
```
 RUN  v1.6.1 C:/Users/audih/ws/comfy-create-helper2/frontend

 Test Files  239 passed (239)
      Tests  2418 passed (2418)
   Start at  02:38:48
   Duration  98.80s (transform 76.28s, setup 98.90s, collect 335.92s, tests 195.94s, environment 580.15s, prepare 102.90s)

Exit code: 0
```

### Gate 3: Scenario & Red Teaming Tests
```
> vitest run connectionSlice.test.ts -t REQ-370
 ✓ src/store/__tests__/slices/connectionSlice.test.ts  (18 tests | 17 skipped) 17ms
 Test Files  1 passed (1)
      Tests  1 passed | 17 skipped (18)

> vitest run residualHistory.test.ts -t REQ-370
 ✓ src/services/__tests__/residualHistory.test.ts  (11 tests | 9 skipped) 52ms
 Test Files  1 passed (1)
      Tests  2 passed | 9 skipped (11)

> vitest run useGenerateDisplayState.residual.test.tsx -t REQ-370
 ✓ src/pages/GeneratePage/hooks/__tests__/useGenerateDisplayState.residual.test.tsx  (9 tests | 8 skipped) 55ms
 Test Files  1 passed (1)
      Tests  1 passed | 8 skipped (9)
```

### Mandatory GPU Cleanup
```
$ python local_model_adapter.py unload
[Model Auto-Router] Unloading all loaded models (qwen/qwen3.5-9b) to free VRAM...
[Local Audit] LM Studio reports no models loaded.
Exit code: 0
```

</execution_evidence>
