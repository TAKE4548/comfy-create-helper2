# REQ-334 実装・検証計画

2026-10-10のユーザー承認に基づき、親エージェントがcoordinator、最大3 Engineerの並列実行を担当。復旧PBIの4フェーズ20項目・AC-01〜102を対象とする。

| 項目 | 正本・証拠 |
|---|---|
| 復旧PBI | docs/backlog/pbi/archive/REQ-334.md |
| 202行の復旧原文 | docs/design/REQ-334-restored-source.md |
| 設計・契約 | docs/design/REQ-334.md / REQ-334-contracts.md |
| AC対応・物理カード依存 | docs/design/REQ-334-ac-coverage.md / REQ-334-task-manifest.md |
| テスト計画 | docs/design/REQ-334-test-plan.md |
| 独立監査 | docs/design/REQ-334-audit.md |

T1〜T82で共通表示、Generate、アセット、Studio、History、Settingsを実装。T83〜T147は回帰・実画面・復旧AC照合で見つかった明示要件の補正と追加検証を担当する。Engineerは指定ファイルの所有権を分け、完了イベントに応じて次のカードを実行した。T117はrootによる最終SSoT・OpenAPI・AC照合。

Gate1は全サブシステムの型チェック、Gate2はファイル指定なしの全件テスト、Gate3は102ACの個別証拠照合。失敗・未確認を成功へ転記しない。Windowsのソケット制約は同じ検証コマンドの昇格実行で確認し、隔離DB・画像・ログを使う。QA画面のアプリ/APIは実物、Comfy/LLMはfixture upstreamであり、実GPU生成の検証とは区別する。

backend最終型チェックは177ファイル・エラー0、全pytestは656件成功。frontend最終全件結果とGate3/監査はwalkthrough.mdに記録してからクローズする。本番ビルドはfrontend/distへ生成する。

PBI管理スクリプトによる復旧原文の巻き戻りを確認したため、REQ-334状態はUTF8/LFで直接更新する。完了判定前にarchiveしない。最終commitはREQ-334所有ファイルだけを対象にし、既存の他PBI/設定/incident修正やQA一時データを含めない。pushは行わない。
