# Incident Triage Report: タグチップ押下フィードバック追加後の並び替え・削除・強度操作不能

<incident_metadata>
- Created_At: 2026-10-13 04:41:46
- Investigation_Status: INVESTIGATION_COMPLETED_AWAITING_PBI
- Classification: Type A: Implementation Defect
</incident_metadata>

---

## 1. Executive Summary & Symptoms

<incident_summary>
- Observed_Symptom: 利用者報告: タグチップがクリックで沈むようになってからドラッグ移動と削除アイコンが機能しない。サブメニューは開くが強度設定などのボタンも反応しない。テキストモードでは編集可能。
- Reproducibility: 利用者の実画面で発生。調査は読み取り専用のソース追跡。隔離HTMLによるheadless Edge/Chromeの再現を試みたがDOM出力を取得できず、実ブラウザのヒットテスト・イベントトレースによる再現確認は未完了。
- Impact_Scope: 共通TagChipEditor利用画面（Generate、Tags編集、LoRAトリガーワード編集等）のチップモード。テキストモードは利用者報告により回避可能。TagChipViewerには同種の疑似要素クラスがあるが、編集アイコンを持たず本件の直接対象ではない。
</incident_summary>

## 2. Root Cause Isolation & Evidence

<root_cause_analysis>
- Defect_Classification: Type A: Implementation Defect
- Root_Cause_Mechanism: Type A判定根拠: docs/specs/SPEC_COMMON.md:158-160は強度更新・×削除・ドラッグ並び替えを要求し、SPEC_TAGS.md:36とSPEC_LORAS.md:86も削除/並び替えを要求する。TagChip.tsx:243はREQ-338設計:94-100由来のactive:scale-[0.97]とbefore:absolute before:-inset-0.5をチップ外枠へ適用する。疑似要素はcontentを持ち、位置指定され、チップ内全面を覆うがpointer-eventsの除外または内側操作要素を上へ配置する指定がない。ドラッグハンドル(:253-264)と削除ボタン(:288-300)は位置指定/z-indexを持たない通常フロー要素であり、位置指定疑似要素が内側のポインタ標的をチップ本体へ奪うCSS構造となっている。その場合、ドラッグハンドルのdnd-kit listenersも削除button onClickも起動せず、外枠onClick(:240)のメニュー表示(:115-121)へ流れる。削除/編集の親ハンドラ(index.tsx:312-324)は存在する。サブメニュー強度ボタン(:388-391)からhandleStepWeight(:142-148)への接続も存在する。強度ボタン不応答の直接原因は未隔離: 親のactive変形が子メニューやfixed和訳カードの座標/stackingに影響する可能性があり、実画面確認が必要。全症状を疑似要素だけで説明したとは扱わない。既存TagChip.test.tsx:805-880はクラス文字列とfireEvent.click(child)を直接検証し、実際のCSSヒット判定を検証しない。
- Failure_Location: `frontend/src/components/TagChipEditor/TagChip.tsx:243; :253-264（ドラッグハンドル）; :288-300（削除）; :302-315（メニュー）; :388-391（強度ボタン）; docs/specs/SPEC_COMMON.md:158-160`
</root_cause_analysis>

## 3. Remediation Strategy & SSoT Synchronization

<remediation_strategy>
- Proposed_Action: 既存SSoTに従い、ヒット領域拡張と押下フィードバックを維持しながら内側のドラッグ・削除操作にポインタイベントが到達するよう設計する。実ブラウザのelementFromPointとpointerdown/mousedown/click標的、active時のメニュー/和訳カード座標・重なりを確認し、サブメニューボタン不応答の原因を隔離してから修正範囲を確定する。実ブラウザでドラッグ、×削除、強度段階調整/数値入力、有効切替を検証する。SSoT変更は不要。本報告の承認前にPBI作成や実装は行わない。
- SSoT_Update_Required: No (Pure implementation bug fix)
- Recommended_Route: engineer (/dev-impl)
</remediation_strategy>

## 4. Linked Work Items

<linked_artifacts>
- PBI_ID: UNREGISTERED
</linked_artifacts>
