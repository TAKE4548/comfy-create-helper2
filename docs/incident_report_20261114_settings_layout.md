# Incident Triage Report: Settings画面 Node Mapping Masters タイトル埋没およびワークフロー管理ペイン内部スクロール未対応

<incident_metadata>
- Created_At: 2026-11-14 13:53:47
- Investigation_Status: INVESTIGATION_COMPLETED_AWAITING_PBI
- Classification: Type B: Specification Gap
</incident_metadata>

---

## 1. Executive Summary & Symptoms

<incident_summary>
- Observed_Symptom: 1) Node Mapping Masters 欄で、ステージの設定状態バッジが横幅を取りすぎるためタイトルが極端に省略・埋没して見えない。2) 同画面のワークフロー管理で、ワークフローが大量にあると左ペインだけ縦に長くなりすぎる（左右ペインでグリッド状に短いほうの高さに合わせて長いほうを内部スクロールしたい）。
- Reproducibility: 100% (Confirmed by code/CSS inspection)
- Impact_Scope: SettingsPage (workflows tab): MappingMasterSection, WorkflowConnectionSection, SettingsResponsive.css, SPEC_SETTINGS.md §3-1-1
</incident_summary>

## 2. Root Cause Isolation & Evidence

<root_cause_analysis>
- Defect_Classification: Type B: Specification Gap
- Root_Cause_Mechanism: [Type A] SPEC_SETTINGS.md §3-1-1は1行目=名称+右端固定アクション・2行目=バッジの超スリムカードを規定するが、SettingsResponsive.css L159-184で768px以上が単一行flexになっており、MappingMasterSection.tsx L89-174のDOM順(title→actions→badges)と全stage_nameバッジ(shrink-0 whitespace-nowrap)がxl:grid-cols-2半幅カラム内でtitleを圧迫して埋没させている。[Type B] WorkflowConnectionSection.tsx L702-704のワークフロー一覧にmax-h/overflow-y-autoがなく、SettingsPage.tsx L108-130のxl:grid-cols-2配置でも隣接セルの短いほうに合わせて長いほうを内部スクロールする仕様がSPEC_SETTINGS.md §3-1-1およびSPEC_COMMON.md MUI-02例外として未定義。
- Failure_Location: `frontend/src/pages/SettingsPage/SettingsResponsive.css:159-184, frontend/src/pages/SettingsPage/components/MappingMasterSection.tsx:85-175, frontend/src/pages/SettingsPage/components/WorkflowConnectionSection.tsx:702-704, frontend/src/pages/SettingsPage.tsx:108-130, docs/specs/SPEC_SETTINGS.md:151-157`
</root_cause_analysis>

## 3. Remediation Strategy & SSoT Synchronization

<remediation_strategy>
- Proposed_Action: 1. [Type A] SettingsResponsive.cssおよびMappingMasterSection.tsxを修正し、デスクトップ(>=768px)でも1行目=タイトル+右端固定アクション、2行目=バッジの2行カード構造とする（またはステージ状態バッジのコンパクト化・折り返し/省略表示を導入し、タイトル視認性を確保する）。2. [Type B] SPEC_SETTINGS.md §3-1-1を更新し、workflowsタブのxl 2カラムグリッドにおけるワークフロー管理一覧の内部スクロール（SPEC_COMMON.md MUI-02の明記例外）と左右ペインの高さ整合仕様を定義した上で、SettingsPage.tsxおよびWorkflowConnectionSection.tsxを実装・E2E検証する。
- SSoT_Update_Required: Yes (Requires updating specifications/OpenAPI)
- Recommended_Route: architect (/sys-design or /dev-design)
</remediation_strategy>

## 4. Linked Work Items

<linked_artifacts>
- PBI_ID: REQ-430
</linked_artifacts>
