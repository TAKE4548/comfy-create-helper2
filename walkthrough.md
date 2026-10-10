# REQ-332 検証 Walkthrough

## 結論

**PBIクローズは2026-10-08のユーザー承認に基づく。技術検証のGate 3結果は引き続きINCONCLUSIVE**。Gate 1 と Gate 2 は成功し、fake IndexedDB/jsdomの結合・異常系試験も成功した。再workでAC1は旧cache JSON長を厳密に一致させ、AC3/4は大容量旧cacheと30件の有効recordを使い、AC4は本番local resolverで最新30件を読んだ。AC11はIDB読取拒否後に`workflowsApi.list()`の成功完了を待ってqueueし、AC18は更新一覧Bのpersist後、9分相当の新clientでheld refetch中にBを表示した。AC2のworkflow payloadは2,097,152 UTF-16 code unitsで4MiB byte相当をassertした。一方、実ブラウザー／実モバイル、実クォータ、描画フレーム、実サーバーとComfyUIのジョブ受付は未確認。ユーザーはこの制約を確認したうえでクローズを承認した。Vitestのモックを実環境の証拠に読み替えない。

## 実行証拠

<execution_evidence>

### Gate 1 — Typecheck

作業ディレクトリ: `frontend/`

```text
npm run typecheck
> tsc -b --noEmit
終了コード: 0
診断: 0 errors
```

### Gate 2 — 全テスト

```text
npx vitest run
Test Files  144 passed (144)
Tests       1360 passed (1360)
終了コード: 0
Start: 23:15:25; Duration: 46.95s
```

標準エラーには既存テストが意図的に発生させるネットワーク・Quota例外、React `act()` 警告等が含まれる。Vitestのテスト失敗は0件。

### Gate 3 — 対象結合・回帰試験

T12 AC2を含む最終シナリオ再確認:

```text
npx vitest run src/test/e2e_req332_storage.test.tsx src/test/e2e_req332_recovery.test.tsx
Test Files  2 passed (2)
Tests       17 passed (17)
終了コード: 0
```

```text
npx vitest run src/test/e2e_req332_storage.test.tsx src/test/e2e_req332_recovery.test.tsx -t REQ-332-T1
Test Files  2 passed (2)
Tests       7 passed | 10 skipped by filter (17 discovered)
終了コード: 0
```

T10/T11のcase名に一致する選択実行。skipは他Task Cardのケースをfilterで除外したもの。

```text
npx vitest run src/test/e2e_req332_storage.test.tsx src/test/e2e_req332_recovery.test.tsx
Test Files  2 passed (2)
Tests       17 passed (17)
終了コード: 0
```

```text
npx vitest run src/utils/__tests__/queryCachePersister.test.ts src/test/e2e_req317_storage.test.tsx src/utils/__tests__/promptRecord.test.ts src/components/__tests__/HistoryModalPreview.test.tsx src/hooks/__tests__/useBrowserStorageUsage.test.tsx src/pages/DatasetStudioPage/utils/__tests__/studioDraftStorage.test.ts src/pages/DatasetStudioPage/__tests__/MatrixGenerationStep.test.tsx
Test Files  7 passed (7)
Tests       76 passed (76)
終了コード: 0
```

上の3実行が再work後の最終証拠。次の19件と35件は前回run結果。

```text
npx vitest run src/utils/__tests__/queryCachePersister.test.ts src/test/e2e_req332_recovery.test.tsx
Test Files  2 passed (2)
Tests       19 passed (19)
終了コード: 0
```

```text
npx vitest run src/test/e2e_req317_storage.test.tsx src/utils/__tests__/promptRecord.test.ts src/components/__tests__/HistoryModalPreview.test.tsx src/hooks/__tests__/useBrowserStorageUsage.test.tsx src/pages/DatasetStudioPage/utils/__tests__/studioDraftStorage.test.ts
Test Files  5 passed (5)
Tests       35 passed (35)
終了コード: 0
```

追加結合試験は全件実行にも含まれ、`e2e_req332_storage.test.tsx`、`e2e_req332_recovery.test.tsx`、`App.persistence.test.tsx` が成功した。異常系はIDB read reject、IDB `QuotaExceededError`、local metadata `QuotaExceededError`、保留中IDB transactionからの再起動、IDB削除後のfetchを含む。すべてVitest/fake IDBまたはmock APIであり、実環境証拠ではない。

### API契約

`python C:/Users/audih/.gemini/antigravity/scripts/openapi_parser.py backend/openapi.json get-endpoint /api/prompt-metadata post` と `... get-endpoint '/api/prompt-metadata/{prompt_id}' get` を実行。POSTは `prompt_id` と `param_values` を必須とし、GET 200は `prompt_id`、`workflow_id`、`param_values`、`applied_assets`、`created_at` を返す契約を確認した。プロンプトメタデータのクライアント型・pathはこの契約と整合する。

### 追加ビルド／画面スモーク（補助証拠）

Coordinator実行の `npm run build` は成功（2,064 modules、9.76s）。同報告のlocalhost画面スモークではworkflow一覧とGenerate画面が描画され、console error/warningなし、localStorage 29.3 KiB、Queue 0。固定大容量fixtureによるAC測定ではなく、通常画面が起動したことだけを示す。

### ローカルモデルQA監査／解放

```text
再試行 trace: Model=qwen3.5-9b-claude-4.6-highiq-thinking-heretic-uncensored
Domain=reasoning, Params=9.0B, Quant=Q6_K
QA監査の回答取得、exit 0
指摘: Gate 2 baselineの文書化、fixture計数／formatterとAC期待値の具体性、
AC8 fetch保留の検証手順、Red Teamごとの期待結果、回帰テストの基準、
監査記録の形式、mobile対象を任意扱いする危険を提示。推奨は固定期待値・
明示的最低環境・計数式・シナリオtimeout・自動証拠収集。
```

```text
python C:/Users/audih/.gemini/antigravity/scripts/local_model_adapter.py unload
終了コード: 0
[Model Auto-Router] Unloading all loaded models (qwen3.5-9b-claude-4.6-highiq-thinking-heretic-uncensored) to free VRAM...
[Model Auto-Router] All models unloaded from LM Studio. VRAM freed.
```

QA監査結果は **FINDINGS**。回答全文と指摘別の手動照合は `docs/design/REQ-332-audit.md` に保存した。初回sandbox試行はgeneral route後にWinError 10013で失敗し、後続の権限付き再試行で指定reasoning modelの回答を得た。unload scriptはVRAM freedを確認。`nvidia-smi` は環境に存在せずGPU全体の数値は別途実測できない。

</execution_evidence>

## 受入条件マトリクス

「試験確認」は自動試験内で当該挙動を確認したことを指す。実ブラウザーを含む AC の最終判定は、テスト計画の環境要件を満たさないため未完了。

| AC | 自動試験で確認した内容 | 最終判定 / 未確認事項 |
|---|---|---|
| 1 | T10は`oldValue.length === 2,097,152`、30件のserialized values合計786,432、legacy削除後の非API値保持とResourceGaugeChips表示値を確認。 | 自動試験PASS。INCONCLUSIVE — 実デスクトップ／モバイルの固定fixture・2.5秒表示は未確認。 |
| 2 | T12は2,097,152 ASCII code unitsのworkflow JSONを構築し、`json.length * 2 === 4 * 1024 * 1024`をassert。workflowのIDB更新・restore後に非API local/session storage不変も確認。 | 自動試験PASS。INCONCLUSIVE — fake IDB/jsdomのため、実ブラウザーの使用量表示・quotaは未確認。 |
| 3 | T10の独立fixtureで2,097,152文字legacy JSONを初期化時に除去し、30件の有効記録後に31 queue success。notification/warnは0回。 | 自動試験PASS。INCONCLUSIVE — 実quotaと実31 job受付・保存完了は未確認。 |
| 4 | T10の独立fixtureで最新30 IDをproduction `readLocalRecordedMetadata()`に渡し、各prompt/seed/steps/queuedAtを照合。 | 自動試験PASS。INCONCLUSIVE — 実画面表示と実生成条件は未確認。 |
| 5 | 直近画像切替のlocal metadata即時表示に関するコンポーネント試験が成功。 | INCONCLUSIVE — 実ブラウザーで初回描画フレーム未確認。 |
| 6 | A→B切替中のdeferred応答でB表示が維持され、A遅着が上書きしないコンポーネント試験が成功。 | INCONCLUSIVE — 全実描画フレームの観測なし。 |
| 7 | local cache miss時のprompt-metadata API mock取得、HistoryModalPreview表示試験が成功。 | INCONCLUSIVE — 指定のSnapshotなし画像Cを実サーバー・実画面で確認していない。 |
| 8 | T11の9分相当fresh clientケースでpersist済みworkflow Bをrestoreし、refetch保留中のquery observerにBが出ることを確認。 | INCONCLUSIVE — fake clock/jsdom/mock APIのみ。実ブラウザーの再読込と表示は未確認。 |
| 9 | expiry/invalid busterを拒否するPersister試験が成功。 | INCONCLUSIVE — 11分後のアプリ画面・保留fetchを新clientで確認していない。 |
| 10 | DesktopLayout結合試験でworkflow query保留中はGenerate無効、成功後有効、queueは1回。 | INCONCLUSIVE — 実UIおよび実mobile layoutで未確認。 |
| 11 | T11 read-reject試験で新clientから`workflowsApi.list()`を呼びdeferred success後のworkflow 7をassertし、その後queue 1回。別write-quota試験もqueue 1回。 | 自動試験PASS。INCONCLUSIVE — mock API/IDBのみ、実quotaと実ComfyUI jobは未確認。 |
| 12 | reload相当の新persister restore後に設定・metadata・session値保持を確認。 | INCONCLUSIVE — 実ブラウザーreloadと画像選択画面未確認。 |
| 13 | 実MatrixGenerationStepで下書きのname/trigger/workflow/各prompt tag/alt outfit表示、非API値維持を確認。 | INCONCLUSIVE — jsdomの同tab restart相当のみ。実ページreload未確認。 |
| 14 | local metadata setItemをQuotaExceededにし、API create/get mockがprompt/seed/stepsを保持することを確認。OpenAPI契約も照合。 | 試験確認 — 実サーバー往復ではないため、運用環境までの保証は未確認。 |
| 15 | workflow-presetsの永続cache除外とusePresetStateのserver-latest mock応答を確認。 | INCONCLUSIVE — 実server最新値を未編集プリセット画面で未確認。 |
| 16 | IDB保存transactionを保留した中断ケースで非API値を維持し、再起動後server workflow fetchとqueue 1回を確認。 | INCONCLUSIVE — fake IDBでの中断・mock fetchのみ。実reload・実受付未確認。 |
| 17 | fake IDB database削除後cache miss、mock server fetch、queue 1回、local/session保持を確認。 | INCONCLUSIVE — 実ブラウザーのIDB削除・実mobile・実ComfyUI未確認。 |
| 18 | T11でserver refresh後の一覧BとdataUpdatedAt進行を確認し、persist/restore snapshotもB。9分相当の新clientでrefetchを保留したままquery observerがBを表示し`isFetching`を確認。 | 自動試験PASS。INCONCLUSIVE — fake clock/jsdom/mock APIのみ、実ブラウザー再起動は未確認。 |

## Red Team / 残る検証

自動試験ではread/write失敗と中断・削除回復が成功した。一方、テスト計画の2接続間のexpiry read/write競合、blocked/open未完了、transaction abort/clear失敗、複数実タブ初回移行、StrictMode実起動、旧版タブ再書込、1秒以内タブclose、実際のQuota拒否はこの実行で検証した証拠がない。Gate 3をPASSとしない。

## 構造化判定

```json
{
  "pbi_id": "REQ-332",
  "verdict": "INCONCLUSIVE",
  "pbi_closure": "CLOSED_BY_HUMAN_ACCEPTANCE",
  "closure_date": "2026-10-08",
  "closure_rationale": "The user reviewed the documented Gate 3 limitations and explicitly authorized closure. This does not change the historical INCONCLUSIVE verification verdict.",
  "gate_results": {
    "gate_1_typecheck": "PASS (0 errors)",
    "gate_2_full_test_suite": "PASS (0 failures across 144 files / 1360 tests)",
    "gate_3_scenarios": "INCONCLUSIVE (mocked integration cases pass; required real-browser, mobile, quota, frame, and production queue evidence incomplete)"
  },
  "qa_audit_result": "FINDINGS (reasoning model returned concerns; see docs/design/REQ-332-audit.md)",
  "audit_findings": [
    "AC1/3/4/11/18 have mock-based regression cases after T10/T11; real browser quota/server behavior remains unverified.",
    "AC2 exact UTF-16 length fixture is covered by T12; real browser quota remains unverified.",
    "No actual mobile browser or controlled production ComfyUI job was exercised.",
    "Independent reasoning audit flagged test-plan ambiguity and coverage risks; preserved for coordinator triage in docs/design/REQ-332-audit.md."
  ],
  "walkthrough_path": "walkthrough.md",
  "failure_details": "No typecheck or unit-test failures. Overall verdict is inconclusive because required browser/runtime acceptance evidence is incomplete; the local reasoning audit returned findings."
}
```
