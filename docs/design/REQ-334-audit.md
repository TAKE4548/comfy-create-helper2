---
id: REQ-334-audit
title: REQ-334 QA監査・実行証拠・VRAM cleanup
status: conditional
tags: [REQ-334, audit, gpu, limitation]
related_paths:
  - docs/design/REQ-334.md
  - docs/design/REQ-334-test-plan.md
  - docs/design/REQ-334-acceptance.md
  - docs/design/REQ-334-qa-evidence.md
  - implementation_plan.md
---

# REQ-334 最終監査記録

更新日: 2026-10-11 (Asia/Tokyo)。復旧PBI本文、実装、テスト、browser evidence、local model QA auditを対象に現状を記録する。本記録の監査statusは **conditional**。3-GateとAC証拠はPASSだが、独立QA監査そのものの結果はConditional Passであり、GPU全体解放も測定不能だったため `COMPLIANT` や100% VRAM解放とは扱わない。

## 3-GateとAC証拠

| Gate | 実行証拠 | 結果 |
|---|---|---|
| Gate 1 — Backend | `mypy backend`: 177 source files、0 issues、exit 0 (`.tmp/req334-qa/gate1-mypy.log`) | PASS |
| Gate 1 — Frontend | `npm run typecheck`: `tsc -b --noEmit`、exit 0 (`.tmp/req334-qa/frontend-typecheck-r15.log`) | PASS |
| Gate 2 — Backend | 隔離fresh DBでunfiltered `pytest`: 656 passed、0 failed、3 warnings (`.tmp/req334-qa/gate2-pytest-r3-elevated.log`) | PASS |
| Gate 2 — Frontend | unfiltered Vitest R15: 521/521 suites、1697/1697 tests、failed/pending 0 (`.tmp/req334-qa/frontend-vitest-r15.json`) | PASS |
| Build | `npm run build` complete。minified JS >500kB warning (`.tmp/req334-qa/frontend-build-r15.log`) | PASS with warning |
| Gate 3 — Acceptance | [strict AC matrix](REQ-334-acceptance.md) | 102 PASS / 0 FAIL / 0 INCONCLUSIVE |

R15は同じ全件コマンドをelevated環境で完了した最終実行。sandbox試行はWindows socket `EPERM` でrunnerを初期化できなかった。R13の一時timeoutとR14で再現したworkflowテストの同期不足は、R15 full run成功まで追跡して解消を確認した。

AC証拠にはcomponent/API boundary testsと実ブラウザーcomputed/rendered測定を使い、測定対象を区別した。アプリは実React/FastAPIと隔離DBだが、ComfyUI/LLM upstreamはfake、Managerは未接続。Safe Area 20/34pxは実ノッチ端末ではなく、本番CSS複製で `env(safe-area-inset-bottom)` 値だけを置換したCSS環境fixture。Managerログ取得はFailed to fetchの実測で、成功/折り畳み動作はmock component testによる。上記は実GPU生成・実LLM推論・実Manager操作の証明ではない。

OpenAPIは現状118 paths。Playground等の型付き応答とmigration/API testsを照合済み。Bubble Debugのresponse schemaは `{}` のままなので、このendpointの詳細schemaをOpenAPIだけで証明したとは主張しない。

## Local Model QA Audit

必須の指定コマンドを実行し、adapterの実出力を `.tmp/req334-qa/local-qa-audit-final.log` に保存した。ComfyUI active jobのshared VRAM guardで最大180秒の待機ログが記録された後、adapterは次の監査モデルをロードして推論を完了した。

- Model: `qwen3.5-9b-claude-4.6-highiq-thinking-heretic-uncensored`
- Audit trace: `Action=qa-audit`, `Domain=reasoning`, `Params=9.0B`, `Quant=Q6_K`
- Process exit: 0
- **モデル判定: 条件付き合格 (Conditional Pass)**

モデルはテスト計画の「挙動確認」や証拠の記録要件に曖昧さが残るとして、具体指標/API count/hash、証拠画像のpath/hash、console output、Tab focus順、browser timeoutを明記する改善案を提示した。これらは現行102 ACの実測/実行証拠に対する具体的な製品不具合指摘ではなく、計画の監査性を高める提案。ただし結果が条件付き合格である事実を保持し、`COMPLIANT`には読み替えない。全文はログを参照。

監査完了直後に `python C:/Users/audih/.gemini/antigravity/scripts/local_model_adapter.py unload` を実行した。`.tmp/req334-qa/local-qa-unload-final.log` はexit 0で、adapterは対象モデルを含む全モデルをLM Studioからunloadし「VRAM freed」と報告した。

**GPU全体のVRAM 100%解放は未検証。** `nvidia-smi --query-gpu=index,memory.used,memory.total --format=csv,noheader,nounits` は `nvidia-smi` command not found (exit 1)。unload結果はadapter管理下のmodel unloadの確認であり、他processのGPU使用量ゼロの証明ではない。ユーザー所有のComfyUI/GPU processは停止していない。

## 構造・証拠整合の再確認

- 復旧PBIは102 AC。最終表は102行すべてに個別根拠を持ち、受入マトリクスの集計と一致。
- 最終task cardはT1〜T147。物理カード、依存DAG、manifestは最終設計記録で照合済み。最終実装後のコードやPBI lifecycleをこの監査者は変更していない。
- Test plan、acceptance evidence、browser executionおよびassertion indexを相互参照。画像寸法や色などをclass名assertだけでPASSにしていない。
- Gate 2 backendはアプリ初期化とmigrationを実施した隔離DB上で実行。テスト対象外の既存DBは利用していない。
- Git commit、PBI lifecycle mutation、archiveはこの監査者の担当外であり未実施。

## 初期調査時の履歴（2026-10-10）

以下は初期46-card案・未実装時点の監査記録であり、現在の状態を示すものではない。現在値との混同を避けるため履歴として保存する。

当初 `doc_mapper.py docs/specs docs/backlog/pbi/archive/REQ-334.md` はNo mapped documentsを返し、`openapi_parser.py` は `docs/system/openapi.yaml` が見つからずendpoint抽出不能だった。その後復旧PBIの正本を明示して設計を再構成し、OpenAPIを生成・検証して118 pathsまで照合した。当時のTask CardはT1〜T46、85 dependency edges、cycleなし、最長path 4 edgesという初期計画だった。これは現在の147枚の最終task card数とは異なる。

初回BA監査試行はモデルロード開始後、推論結果を得る前に中断しINCONCLUSIVEとなった。その時点のunloadはexit 0「No models currently loaded in LM Studio」を返したが、nvidia-smiがなくGPU全体の空きは確認不能だった。Gate 2初期runには未初期化隔離DBと旧テスト期待値が原因の失敗があり、後続の修正後に最終fresh-DB runで656件PASSを再確認した。これらの初回失敗は履歴として保持し、最終R15/r3結果で解決済みと識別する。

## Human review disposition

2026-10-11、ユーザーが監査のConditional Passと証跡強化の追加提案を許容した。dev-orchestration Phase3の「COMPLIANT (or User-Accepted)」ゲートを満たしたものとしてREQ-334をクローズする。判定がConditional Passだった事実、GPU全体VRAM量が未検証である制限は保持する。
