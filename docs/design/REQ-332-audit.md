# REQ-332 独立テスト計画監査記録

## 実行記録

- 対象: `docs/design/REQ-332-test-plan.md`
- 実行コマンド: `python C:/Users/audih/.gemini/antigravity/scripts/local_model_adapter.py qa-audit docs/design/REQ-332-test-plan.md`
- 初回 sandbox 実行: adapterが`local-model` / Domain `general`へroute後、LM Studio daemon起動timeoutおよびWinError 10013で監査回答を取得できず。直後のunloadはexit 0、「No models currently loaded」。
- 再試行: local network権限付き実行。adapter traceに Model `qwen3.5-9b-claude-4.6-highiq-thinking-heretic-uncensored`、Domain `reasoning`、Params `9.0B`、Quant `Q6_K`。監査回答取得、exit 0。
- 再試行直後の解放: `python C:/Users/audih/.gemini/antigravity/scripts/local_model_adapter.py unload` exit 0。`All models unloaded from LM Studio. VRAM freed.` GPU全体の使用量は別計測していない。

## 実際の監査回答

```text
<!-- [LLM Audit Trace: Action=qa-audit | Model=qwen3.5-9b-claude-4.6-highiq-thinking-heretic-uncensored | Domain=reasoning | Params=9.0B | Quant=Q6_K] -->
# Test Plan Audit Report

## Executive Summary
This test plan contains significant ambiguity that would allow AI agents to "escape" mechanical execution through mental reasoning rather than actual testing. Multiple metrics lack quantifiable thresholds, and several ACs rely on subjective interpretation.

## Detailed Analysis

### 1. Baseline Gates ❌
- Gate 2 "Known failures distinguished from new" lacks a documented baseline.

### 2. Fixtures and Observation ❌❌
- It says API payload is 2,097,152 UTF-16 code units but does not specify how to verify the count.
- It says 30 metadata entries total 786,432 code units but does not define whether whitespace is counted.
- "1 MiB boundary / one decimal" does not name a formatter or version.
- Risk: a single measurement could be misrepresented as compliant.

### 3. AC Mapping Table ❌❌❌
- AC1 unit/rounding needs definition.
- AC5 is testable if B content is defined.
- AC8 lacks a method to verify the reserved fetch.
- AC12 expected values are not enumerated.
- Multiple ACs refer to expected values not documented in the plan.

### 4. Integration and E2E ⚠️
- The plan says desktop Chromium and at least one real mobile environment, with iOS Safari/WebKit if possible. It treats "if possible" as permitting mobile to be skipped.

### 5. Red Team Boundary ❌❌
- TC1 names failure types without expected behavior per type.
- TC2 says "no hydrate" without defining what should happen instead.
- TC4 says "incoming wins" without identifying which incoming value.

### 6. Regression ⚠️
- Existing tests are referenced by path without expected pass/fail rates; scope growth threshold is subjective.

### 7. Audit Evidence ❌❌
- `docs/design/REQ-332-audit.md` has no schema; "manual verification" is undefined.

### Quantifiable Metrics Audit
- Time-based expiry requires clock synchronization evidence.
- Size-based values lack a counting algorithm.
- Count-based 31 jobs are testable if queue is observable.

### Final Verdict
- Overall score 4.2/10 for mechanical executability.
- Primary concerns: no baseline for expected values; optional language around mobile; unquantified metrics; absent size/count verification methodology; nondeterministic evidence.
- Recommendations: document expected values; make minimum environments explicit; define byte/character counting; add per-scenario timeouts; automate evidence capture.

### AI Escape Matrix
- Mental verification instead of execution: HIGH, mitigate with automated command gates.
- Selective metric interpretation: MEDIUM, mitigate with explicit formulas.
- Baseline fabrication: HIGH, mitigate with version-controlled expected values.
- Environment substitution: MEDIUM, mitigate with containerized testing.
```

## 指摘ごとの手動照合

以下は監査モデルの指摘を変更・削除せず、実行者が正本と実行証拠を照合した結果である。設計の変更判断はdev-coordinatorへ引き継ぐ。

| 指摘 | 照合した証拠 | tester所見 / 引継ぎ |
|---|---|---|
| Gate 2 baseline未記録 | Test planのbaselineは「実装後実行」と記載。最終全件実行は144 files/1360 tests pass、失敗0。stderrは意図的な例外を含む。 | 今回の判定は実測数で行えた。既存失敗がある将来実行のbaseline規則は明文化を検討するよう引継ぐ。 |
| fixture計数法・formatter曖昧 | Test plan Fixtures and Observationは2,097,152 UTF-16 units、30件合計786,432、`Σ(key.length + value.length)*2`、既存formatter、可視状態で2.5秒更新を明記。T10のreworkでJSON envelope込み文字列長とmetadata合計をassert。 | 一部指摘は文書に既記載。初回fixtureの不足はT10 rework後に是正され、最終AC1 unit scenarioは成功。 |
| AC8 fetch保留の方法・AC12期待値未列挙 | Test planはdeferred fetch、各値を固定して前後比較と規定。AC12 PBIは「固定試験データ」とのみ書き、具体値はTest Plan/T6 testsで設定値・workflow input・batch URL・selected URL・snapshot seedを用意。 | Test plan手順は実行可能だがPBI本文の受入fixture列挙は薄い。実ブラウザーシナリオが未実施のためPASSにはしない。 |
| AC2 fixture単位 | 初回実装の `'x'.repeat(4 * 1024 * 1024)` は4 Mi code units / UTF-16換算8 MiBで、4 MiB相当の計画値と不一致だった。T12は `'x'.repeat(2 * 1024 * 1024)` を構築し、`json.length * 2 === 4 * 1024 * 1024` をassertして是正。 | AC2のfixture mismatchを修正。最終の統合テストでcase successを確認。実ブラウザー quota は未確認。 |
| mobileが任意との解釈 | Planは「デスクトップとモバイルの双方で確認する」を明記、iOS Safari/WebKitだけが「可能なら」。 | 実mobile確認は必須。今回は環境未使用のため未充足。 |
| Red Team期待結果が曖昧 | Test plan Red Team 1〜12に expected behaviors（server fetch継続、hydrateなし/該当cache破棄、incoming優先・同timestamp incoming、transaction期限内settle等）を記載。 | 指摘はRed Team欄の期待値記述を見落とした可能性がある。ただし全Red Teamケースの実行証拠は今回なく、Gate 3判定を限定する。 |
| AC18／実画面の証拠 | Test planにはAC18のユーザーobservableシナリオが記載される。初回audit時はend-to-endケース未実装だったが、T11 reworkでmocked hook-levelケースが追加された。 | automated coverage gapを解消。実browser / real server scenarioは未実行としてGate 3 INCONCLUSIVE。 |
| audit report schema未定 | この記録は実行trace、回答、照合を分離して作成。 | 形式は明示できる。今後のaudit report共通schema採用はcoordinator判断。 |

## 再work後の最終実行照合

Coordinator依頼のT10/T11修正後、test-only変更について再検証した。

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0, 0 errors |
| `npx vitest run` | 144 files, 1360 tests passed, 0 failed |
| `npx vitest run src/test/e2e_req332_storage.test.tsx src/test/e2e_req332_recovery.test.tsx -t REQ-332-T1` | 2 files passed; 7 passed, 10 filter-skipped |
| `npx vitest run src/test/e2e_req332_storage.test.tsx src/test/e2e_req332_recovery.test.tsx` | 2 files, 17 tests passed |
| Query persister + REQ-317 storage + promptRecord + HistoryModalPreview + browser storage usage + Studio draft/form regression | 7 files, 76 tests passed |
| Final after T12: `npm run typecheck` | exit 0, 0 errors |
| Final after T12: `npx vitest run` | 144 files, 1360 tests passed, 0 failed |
| Final after T12: both REQ-332 integration files | 2 files, 17 tests passed |

T10 reworkではAC1 old cache serialized JSON valueを厳密に2,097,152 UTF-16 code unitsへ固定、30 local records serialized valuesを786,432へ固定。AC3/4は同じ大容量legacy cacheと有効な既存30 recordsをそれぞれ別caseでfixture化し、AC4はproduction `readLocalRecordedMetadata()`で最新30件のprompt/seed/steps/queuedAtを検証した。AC11 T11 testはIDB read rejection後に`workflowsApi.list()`のdeferred successがQuery observerに届くまでqueueせず、その後queue call 1回を確認。AC18 T11 testはworkflows AからBへのrefresh、updatedAt進行、Persister transaction完了後snapshot B、9分相当後のfresh QueryClientでheld refetch中にBが表示されることを確認した。

これらはVitest/fake-indexeddb/jsdom/mock API内の自動証拠。実デスクトップ/モバイル、実quota、全描画frame、実サーバー、ComfyUI実job、実2tabの計画条件は依然未確認。T12でAC2の4 MiB UTF-16 fixture mismatchは修正された。AC1/2/3/4/11/18の自動試験欠落は修正されたが、実環境での確認未実施により総合Gate 3 verdictはINCONCLUSIVEを維持する。

## 判定への影響

モデル監査はテスト計画の不明瞭さを広く主張した。照合で多くの定量方法とRed Team期待値は計画本文に見つかった。AC1/2の厳密fixture、AC18 mocked end-to-end、AC3/4 resolver・large-cache fixture、AC11 server fetch fallbackはT10/T11/T12で補強された。実browser/mobile・実quota・実server/ComfyUI・全frameの証拠は依然不足し、監査モデルの懸念も未解決レビュー項目として保存する。総合判定はINCONCLUSIVE。

## 人間承認によるクローズ記録（2026-10-08）

ユーザーは最終報告にある実ブラウザー、実モバイル、実クォータ、frame、実サーバー/ComfyUIジョブの未確認事項と Gate 3 のINCONCLUSIVE判定を確認したうえで、「確認した。クローズして、ビルドしよう」と明示した。PBIのクローズはこの人間承認に基づく。元のreasoning model監査結果、監査のFINDINGS、Gate 3 INCONCLUSIVE、実環境の不足をPASSへ読み替えず、歴史的証拠として保持する。
