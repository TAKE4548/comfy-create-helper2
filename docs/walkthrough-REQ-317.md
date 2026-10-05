# REQ-317 3-Gate 検証ウォークスルー

## 判定

### クローズ記録（2026-10-05）

- ユーザーは監査推奨1・2の文書修正と、実ブラウザ試験を手動前提にする方針を承認した。
- 追加調査ではBEの8000番で `SYSTEM_STATS` を受信し、Viteの5173番経由では受信できないことを確認。`frontend/vite.config.ts` の `/api` proxyへ `ws: true` を追加後、5173番でもCPU/RAM/GPU/VRAMを含む統計を受信した。
- ユーザーの「確認完了」によりシステム指標の表示復旧を確認。その後の「クローズしよう」を受け、残る手動未検証項目と監査の限界を記録したまま、ユーザー受入によってREQ-317をクローズする。
- 以下のINCONCLUSIVEは当時の技術検証結果として保存する。全手動項目をPASSに書き換えず、BA再監査完了とも扱わない。

**INCONCLUSIVE**。Gate 1とGate 2は成功し、Gate 3のVitestシナリオも成功した。一方、実ブラウザーのdesktop/mobile確認、現在origin・現在tabに限定されることの実証、およびQuotaExceededErrorを含む実ブラウザーの容量限界シナリオを確認できていない。これらをVitestの疑似Storage/E2E-like testから推定してPASSにはしない。

## Gate 1 — 型検査

|項目|結果|
|---|---|
|コマンド|`cd frontend; npm run typecheck`|
|実行結果|exit 0。`tsc -b --noEmit`、診断0件。|

## Gate 2 — 全Vitestテスト

|項目|結果|
|---|---|
|コマンド|`cd frontend; npx vitest run`（フィルターなし）|
|実行結果|exit 0。122 files passed、1,168 tests passed。所要33.49秒。|
|REQ-317統合テスト|`src/test/e2e_req317_storage.test.tsx` 1 test passed。Vitest/Testing Library上のE2E-like test suiteであり、実ブラウザーのE2E実行ではない。|

## Gate 3 — 受入条件・異常系

### 計画指定シナリオの実行

```powershell
npx vitest run src/utils/__tests__/promptMetadataCache.test.ts src/store/__tests__/slices/jobQueueSlice.test.ts src/utils/__tests__/browserStorageUsage.test.ts src/hooks/__tests__/useBrowserStorageUsage.test.tsx src/components/ResourceGauge/__tests__/ResourceGauge.storage.test.tsx src/utils/__tests__/promptRecord.test.ts src/components/__tests__/HistoryModalPreview.test.tsx src/test/e2e_req317_storage.test.tsx --reporter=verbose
```

exit 0。8 files passed、92 tests passed（4.14秒）。代表的な実行証拠:

- Cache: 0/29/30/200件、最新記録、同一ID更新、破損JSON、欠落・不正timestamp、読取失敗、対象外キー保持のテストが成功。
- Storage異常系: getter拒否、`length`/`key`/`getItem`異常、列挙値欠落、計測中length変化による部分合計拒否を確認。
- Storage計算: UTF-16換算、1.0 MiB/2.0 KiB境界、空領域0.0 KiB、1領域の拒否中に他方を計測するテストが成功。
- Hook/UI: 2,500ms更新、hidden中停止、復帰時即時計測、StrictMode interval重複防止、desktop HUD/mobile chips表示・説明・hardware値維持のテストが成功。
- Generation/metadata: 保存容量整理を受付ID/meta書込より前に実行、prune例外時もlocal/server処理継続、server失敗時のlocal維持、別image IDとの混同防止、キャッシュ欠落時server記録参照のテストが成功。
- Red Team失敗条件: Storage読取拒否・破損記録・prune失敗・server保存reject・画像ID不一致を投入したテストは期待する隔離動作で成功した。これは故障注入テストの成功であり、実ストレージの実容量枯渇や実API障害を通したことを意味しない。

### AC適合表

|AC|判定|実行証拠・残る範囲|
|---|---|---|
|1|PASS（Vitest）|Cache utility / queue testで空cacheからの新規記録を確認。|
|2|PASS（Vitest）|29既存+incomingで30件を保持。|
|3|PASS（Vitest）|30既存+incomingで最古を除外。|
|4|PASS（Vitest）|200件seedから最新29件+incomingへ整理。|
|5|PASS（Vitest）|同一ID更新は重複計上せず、他29件を保持。|
|6|INCONCLUSIVE|整理を先に実行する試験は成功。実QuotaExceededError発生と通知不在を組み合わせた実ブラウザー試験は未実施。|
|7|PASS（Vitest）|local hit即時利用と、metadata応答待ちの別image ID隔離をutility/component testで確認。|
|8|PASS（Vitest）|cache欠落時のserver metadata lookupおよび記録値表示をmocked component/utility testsで確認。実serverは未接続。|
|9|INCONCLUSIVE|他IDの記録を混ぜないテストは成功。現在入力値を明示的に混ぜて誤表示しない独立シナリオは証跡上確認できない。|
|10|INCONCLUSIVE|metadata prefix外キー保持は確認。設定・画像履歴・snapshotの代表データを同時に置いたE2E確認は未実施。|
|11|INCONCLUSIVE|localStorage書込不能時にserver保存を継続するコード経路のテスト証拠はある。実serverから再取得できるところまで未確認。|
|12|PASS（Vitest）|server保存reject時もlocal metadataを保持・参照する結合テストが成功。|
|13|PASS（Vitest）|破損値を正常timestamp記録より先に除外し、正常29件+incomingを残す。|
|14|PASS（Vitest）|timestamp欠落・invalid記録の優先除外をutility testで確認。|
|15|PASS（component test）|desktop HUDとmobile chipsでlocal/sessionを個別に描画する。実画面確認は未実施。|
|16|PASS（utility test）|524,288 UTF-16 units=1.0 MiB、1,024 units=2.0 KiBを確認。|
|17|INCONCLUSIVE|source契約と疑似Storage単体テストのみ。別origin・別tabを使ったbrowser isolationの実測なし。|
|18|PASS（utility test）|片方のStorage getterを拒否しても他方の正常値を保持する。|
|19|PASS（utility test）|空領域を0 bytes、`0.0 KiB`と表示する。|
|20|PASS（hook/integration test）|変更後の使用量を次の2,500ms timer tickで反映。Vitest fake timerによる検証。|
|21|PASS（hook test）|hidden時停止・visible復帰時の即時計測をfake visibility/timerで確認。ブラウザーtab切替は未実施。|
|22|PASS（desktop実画面）|IABのdesktop画面でmonitorを表示し、説明ボタンを操作。現在origin/current tabの対象範囲とUTF-16 2 bytes換算の説明文を確認。mobile画面は未確認。|
|23|PASS（component test）|storage追加後もCPU/GPU/RAM/VRAMのラベル・モック値を表示。|

### 実ブラウザー確認の試行

- `frontend`で通常sandboxから `npm run dev -- --host 127.0.0.1` を実行。Viteは `http://127.0.0.1:5173/` でreadyだったが、IAB navigationはtimeout。親の許可後、起動者自身の5173 sessionだけ停止し、loopback port 5174へ再起動した。
- `Invoke-WebRequest http://127.0.0.1:5174/` はHTTP 200。IABは `http://127.0.0.1:5174/` でPrompt Surgeonを実際に表示した。
- 実desktop HUDのアクセシビリティツリーでCPU/GPU/RAM/VRAMに加えlocalStorageとsessionStorageが独立表示され、観測時にlocalStorage 2.6 MiB、sessionStorage 0.0 KiBだった。説明を開き、現在originのlocalStorage/current tabのsessionStorageを対象にUTF-16各2 bytesで推定すること、保存内容を表示しないことを確認した。これはdesktopの初回表示・説明操作の実ブラウザー証拠。
- `tab.getScreenshot()` による1280×720実画面も確認。HUDがプレビュー右上にあり、独立した保存量2項目と展開済み説明が視覚的に読める状態だった。スクリーンショットはCUA観察結果で、walkthroughへの画像添付はしていない。
- backend `127.0.0.1:8000` はlistenしていなかったため、desktop上のCPU/GPU/RAM/VRAMは `--`。実mobile viewport制御機能もこのsubagentのCUAにないためmobile実画面は確認できなかった。ブラウザーからStorage値を追加・更新・削除する未承認の直接操作は行わず、実2.5秒更新を伴うStorage変更シナリオは未確認。更新周期/visibility復帰はVitest fake timer suiteだけの証拠。
- browser実測でも別origin・別tabのデータが混在しないことの比較シナリオは未実行。説明文とStorage APIの対象範囲は確認したが、分離挙動は推定しない。Vitestの `e2e_req317_storage.test.tsx` は1 test成功したが、実ブラウザー証拠とは明確に区別する。

### API契約確認

- `python C:/Users/audih/.gemini/antigravity/scripts/openapi_parser.py docs/system/openapi.yaml list-endpoints` はexit 1、`File not found: docs/system/openapi.yaml`。
- REQ-317はAPI schema変更を含まない。API契約のOpenAPI照合は仕様書欠落により未実施。mocked client testの成功は実APIの確認ではない。

## ローカルモデルQA監査

**2026-10-05に追加実施済み / 指摘あり（ISSUES_DETECTED）。** ユーザーの実行指示を受け、制限環境の外で `python C:/Users/audih/.gemini/antigravity/scripts/local_model_adapter.py qa-audit docs/design/REQ-317-test-plan.md` を実行。ComfyUIの実行中ジョブによるVRAM解放待ちの後、モデルのロードと回答取得に成功した（exit 0）。対象はテスト計画であり、実装コード全体の監査PASSではない。

- 指摘: テスト計画の判定条件の具体化、コマンドの明確化、Vitestと実ブラウザE2Eの区別など。
- 照合: `npm test` は実在する `vitest run` への別名。モデルが提案した `test:unit` / `test:e2e` / `test:ci` は存在しない。IDの大小比較などtimestamp順の要件と一致しない例もあり、提案を自動適用していない。
- 終了直後に `python C:/Users/audih/.gemini/antigravity/scripts/local_model_adapter.py unload` を実行、exit 0。ツールは全モデル解放・VRAM解放を報告した。GPU全体の使用量は別途計測していない。
- 原文・照合結果: [ローカルQA監査記録](backlog/ba-audit/REQ-317-qa.md)。既存BA監査INCONCLUSIVEは別記録として維持。未検証の実ブラウザ項目が残るため総合判定もINCONCLUSIVEを維持する。

## `<execution_evidence>`

```text
Gate 1: npm run typecheck
> tsc -b --noEmit
exit 0; diagnostics 0

Gate 2: npx vitest run
Test Files 122 passed (122)
Tests 1168 passed (1168)
Duration 33.49s

Gate 3 planned focused suite: exit 0
Test Files 8 passed (8)
Tests 92 passed (92)
Duration 4.14s

Browser server: Vite 127.0.0.1:5174 ready; `Invoke-WebRequest` -> HTTP 200
Browser: IAB opened Prompt Surgeon at http://127.0.0.1:5174/; desktop HUD showed localStorage 2.6 MiB / sessionStorage 0.0 KiB; expanded scope/estimate explanation verified
Mobile viewport and browser storage-change/refresh scenario -> not tested
Backend probe 127.0.0.1:8000 -> False (not listening)
OpenAPI parser -> exit 1, docs/system/openapi.yaml not found
Local QA model audit -> exit 0; response obtained; ISSUES_DETECTED (test-plan clarity / runner distinction findings)
Immediate unload -> exit 0; all LM Studio models unloaded and VRAM freed (tool report)
Prior BA audit remains INCONCLUSIVE; overall browser verification gaps remain
```

## 最終引継ぎ

### 監査指摘への対応（2026-10-05）

ユーザー指示により推奨1・2へ対応。試験計画の説明表示について、要素・必須文字列・fixture値と重複不在の判定を具体化し、実行環境と全件 `npx vitest run` コマンドを明記した。推奨3の実ブラウザ確認は手動前提とし、手動の環境・期待値・観測値の記録手順を追加した。今回の変更は文書のみで、既存のテスト結果・監査原文を上書きしていない。手動未確認項目は引き続き未検証であり、総合判定はINCONCLUSIVEを維持する。

```json
{
  "pbi_id": "REQ-317",
  "verdict": "INCONCLUSIVE",
  "gate_results": {
    "gate_1_typecheck": "PASS (0 errors)",
    "gate_2_full_test_suite": "PASS (0 failures; 122 files / 1168 tests)",
    "gate_3_scenarios": "INCONCLUSIVE (Vitest scenarios and desktop monitor UI passed; mobile, origin/tab isolation, and real quota/server boundaries unverified)"
  },
  "qa_audit_result": "ISSUES_DETECTED (2026-10-05 local model response obtained; raw findings and factual assessment recorded)",
  "audit_findings": [
    "Local QA model flagged test-plan predicate clarity and runner distinction; several proposed commands and ID-order examples do not match repository contracts. See docs/backlog/ba-audit/REQ-317-qa.md.",
    "OpenAPI verification could not run because docs/system/openapi.yaml is missing.",
    "Desktop monitor was verified in IAB, but mobile viewport, origin/tab isolation behavior, and actual quota/server boundaries remain unverified; backend port 8000 is not listening."
  ],
  "walkthrough_path": "docs/walkthrough-REQ-317.md",
  "failure_details": null
}
```
