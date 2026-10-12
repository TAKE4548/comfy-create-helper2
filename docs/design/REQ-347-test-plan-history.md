# REQ-347 試験計画の履歴（r2～r8）

以下は2026-10-12のr2初期設計時点からr8までに記録された原文を、そのまま現在の実行計画から移した履歴です。「全ケース未実行」「全試験は引き続き未実行」とT6部分作成/未検証はr2時点の状態であり、現在の試験結果ではありません。現在状態はREQ-347-test-plan.md Current Execution Contextとhandover.latest_verification_summaryを参照します。過去raw audit log/traceは別artifactとして保持し、変更しません。

## Archived Original Text

AC-1/2/3/5をPrompt/Parameter/Settingsの3列でPASS/FAIL/INCONCLUSIVE、AC-4/7/8とAC-6を別欄に記録。sticky classだけでAC-2/3/5をPASSにしない。全ケース未実行。T6の `frontend/src/utils/__tests__/wiringStageGroups.test.ts` は部分作成済み・未検証であり、再開時に既存内容を確認して担当T6が継続する。

2026-10-12 `hook-query-contract-r2` はUT-G2/UT-H1/IT-M1を拡張した設計改訂。初版raw Design Gate FAILと監査後の未監査改訂の履歴を維持し、今回の改訂も現時点ではローカルモデル再監査未実行・初回レビュー承認と追加の自律修正指示を親調整役が確認して再開する。

同日、上記改訂を含む全13対象の再監査が完了（audit exit0、raw FAIL (実装着手禁止)、unload exit0/no models loaded）。指摘への証拠付き応答はREQ-347-audit-response.md R2節。試験計画の振舞いは変更しておらず、全試験は引き続き未実行。

2026-10-12 `scroll-root-contract-r3`: UT-C1/IT-R1とGate3のstyle/DOM記録を明確化。r3はローカルモデル未監査。初版/r2 raw FAILと応答を保持し、実装受入結果は試験担当が記録する。

r3監査はaudit exit0/raw FAIL (実装停止推奨)/unload exit0で完了。実コードに基づく保存後refetchのdraft上書きを採用し、`settings-draft-session-r4` としてIT-S6/7/8/BR-11を追加した。実QueryClientとdeferred API responseを使用し、単なるsetState helperの自己検証にしない。r4全13対象を再監査し、r3以前のraw verdictと証跡は保存する。

r4全13対象再監査は5 chunks＋最終合成、audit exit0/raw Design Gate FAIL（設計ゲート失敗）/unload exit0で完了。指摘応答はREQ-347-audit-response.md R4節。全対象本文hashは一致し、T9のstatus metadata driftのみ検出。監査後の本追記は結果記録であり試験契約を変更しない。遅延保存と3領域sticky/非遮蔽の実装受入はverify担当が別途確認する。

`consumer-compatibility-r5` はQA JSONの38 failed/2012 passedを全件取り込んだ改訂。34件が直接Provider不足、Matrix1は同例外の二次症状、旧UI2は受入表示変更の追従不足、visibilitychange1は非空履歴baselineの既存抑止条件とのtest不整合。変更前baseline未実行のため歴史的判定は保留する。OpenAPI snapshotのvariant_id欠落もSC-API1で扱う。r4以前の監査は本改訂を評価しておらず、全14カードを含む17対象のr5監査を別証跡で行う。

r5全17対象監査完了（6 chunks＋最終合成、audit exit0、raw【設計ゲート FAIL】（実装着手禁止）、unload exit0、lms ps --json=[]）。全full/body hashは完了時まで一致。モデルの状態誤認と実測未確認事項を監査応答R5節で分離した。実コード照合で見つかったwarm-cache初期化前編集をT8/IT-S9で追加保護する改訂はsettings-initial-hydration-r6、r5後の未監査内容。初期化までは編集フォーム非mount、初期化後背景取得はdraft保持、開閉/対象変更で保存済み表示解除。改訂監査とIT-S9/Gate2/Gate3は未確認。

r6全17文書監査完了（122,815文字/6 chunks＋最終合成、627.849秒、audit exit0/raw【実装着手禁止】 (Implementation Prohibited)、unload0、lms ps0/[]）。本文17一致、metadata-only driftはT11～T14。rawと応答を分離し実装受入は別途要求。settings-slot-accessibility-r7のIT-S10/T7/T12 param付きlabelはr6後の追加契約として5文書を別auditする。

r7変更5文書のtargeted監査完了（53,701文字/3 chunks＋最終合成、308.519秒、audit0/raw CRITICAL FAILURE（重大な失敗）、unload0/lms ps0/[]）、全5全文/本文hash一致。応答はR7節。IT-S10のparam付きlabelと各master保存、T12全局所test、全体Gate2/Gate3は実装担当/QAが検証する。新たな具体的試験契約不足・人間判断は未確認、既存契約を凍結し結果だけ追記した。


## Settings Test Ownership Split (r8)

staging局所testのすべての変更/確認はT15（固定baselineから105/150行）、productionはT7（255/300行）。IT-S10、stage連続region/root/save配置/候補/ID保存の既存testを維持し、passing codeを変更する必要はない。T7も既存testをread-onlyで実行できる。engineer報告typecheck成功/staging10/10は保存するが旧combined T7の360/300行違反を覆さない。T15が局所再検証し、その後T12がT8/T15両方の完了を待ってconsumer全testを検証。Gate3の実測契約は不変。本r8所有改訂を6対象の別監査へ回す。

r8の6文書監査完了（61,169文字/3 chunks＋最終合成、342.099秒、audit0/raw【実装禁止 / Design Gate FAIL】、unload0/lms ps0/[]）。6全文/本文とsource/test hash一致。責務と実行順序は既存r8契約にある。T15の105/150行/局所10件確認とT12 consumer再検証を親が実行し、全体Gate2/Gate3は別途必要。旧T7 combined360/300違反と以前のpassing10件報告を保持、カードの試験契約は凍結。人間判断0。
