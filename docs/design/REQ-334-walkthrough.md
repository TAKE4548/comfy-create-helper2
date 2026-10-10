# REQ-334 実装・検証記録

復旧済みPBIの全4フェーズ20項目・AC-01〜102を実装した。ユーザー承認に従い、親がcoordinator、最大3 Engineerで所有ファイルを分けて並列実行した。147物理Task CardのDAGは循環なし・最長8カード。3-Gateは全件合格。独立QA監査の条件付き合格と証跡強化提案をユーザーが許容したためクローズした。復旧PBIと147枚のTask Cardをアーカイブし、REQ-334所有ファイルだけをローカルコミットする。

Generateの可変分割・2〜4枚並列Fit・二段進捗・秒数/未取得表示・安全な待機取消とUndo、全画面の選択/一括操作、LoRA/TagSetの画像・チップ編集、Studio選別の再訪保持、History絞り込み/アルバム、Settings全5タブと未保存プレビュー/辞書を同期した。選択更新は未選択レコードへ作用せず、全置換PUTでも画像・作例・モデル関連を保持する。

<execution_evidence>

| Gate | 実行と最終結果 | 証拠 |
|---|---|---|
| 1 型チェック | frontend `npm run typecheck` exit0、backend mypy 177 source files・errors0 | `.tmp/req334-qa/frontend-typecheck-r15.log` / `gate1-mypy.log` |
| 2 全件テスト | frontendファイル指定なしVitest：521 suites / 1,697 tests全件成功、failed/pending/todo0 | `.tmp/req334-qa/frontend-vitest-r15.json` / `frontend-vitest-r15.log` |
| 2 全件テスト | backendファイル指定なしpytest：656 passed、3 warnings、exit0 | `.tmp/req334-qa/gate2-pytest-r3-elevated.log` / `startup-r3.log` |
| 3 個別受入 | AC102/102 PASS、FAIL/INCONCLUSIVE0。assertion/API/実画面の証拠をACごとに照合 | [全102件の判定表](REQ-334-acceptance.md)、[テストassertion](REQ-334-test-assertions.md)、[実画面記録](REQ-334-browser-evidence.md) |
| 本番ビルド | `npm run build` exit0、CSS index-Bs3KDnTm.css | `.tmp/req334-qa/frontend-build-r15.log` |
| 独立QA監査 | qwen3.5-9b / Q6_K、exit0、Conditional Pass。具体的AC実装不具合の指摘なし、計画書の証跡強化提案はユーザーが許容（2026-10-11） | [監査記録](REQ-334-audit.md)、`.tmp/req334-qa/local-qa-audit-final.log` |
| GPU cleanup | 直後unload exit0、LM Studio全モデル解放をadapter出力で確認。GPU全体使用量ゼロはnvidia-smi未導入で未検証 | `.tmp/req334-qa/local-qa-unload-final.log` |

Windows sandboxのrealpath/socket制約では共通setup.tsのEPERMでcollection前に停止した。同一の未絞り込みコマンドを昇格実行し成功した。R13は1件5秒timeout、R14は別のpresetテストが公開workflow状態を待たず失敗した。後者を対象25件でも再現し、T147でAPI呼出完了ではなくReact Queryの状態公開を待つよう修正した。既存のプリセット/保存引数のassertionは維持し、R15全件合格を確認した。

実画面の最後の補正では、1:1/2:3フレームとカード画像面積約57.1%、本文スクロールでコピーへ到達、Tablet Modalの中心450px、選択中hoverでも緑枠、divider6%/通常枠10%/強調18%/カード上辺8%、角丸12/8/6px、非活性71717Aを測定した。全6画面とSettings5タブの文字最小11px・操作領域44px、数値のJetBrains Mono/tabular-nums、Lucide操作アイコンも照合した。

実React/ビルドCSSとFastAPIを127.0.0.1:18000で動かし、隔離DB・画像・ログを使用した。ComfyUI/LLMは18189のfixture upstreamであり、実GPU生成・学習・実LLM品質の証拠ではない。Managerは未接続で実サービス再起動/ログ取得成功は行わず、timeout/未確認/ログ成功のAPI境界はmockを使うcomponent testsで検証した。Safe Areaは本番CSSのenv値だけ20/34pxに置換した隔離描画fixtureによる実測であり、物理ノッチ端末は使用していない。

OpenAPIは実アプリから118 pathsを抽出し、Studio読み戻しとnullable subset thumbnail契約を照合した。既存Bubble detectionのresponse schema `{}` は具体型を保証せず、runtime/API testsの検証範囲として明示する。本番JSには500KB超のchunk警告が残る。

監査はstate/画像のhash、console記録、焦点位置ログ、5000ms browser timeoutなどの追加を提案した。既存の直接assertion/API件数/実描画computed証拠の具体的不合格は挙げていないため、coordinatorはdev-orchestration Phase3 CaseB（計画監査の追加提案）として人間判断へ送る。Conditional PassをCOMPLIANTに読み替えない。監査モデルは解放し、ユーザーのComfyUIジョブは停止していない。

</execution_evidence>

詳細設計は[REQ-334設計](REQ-334.md)、契約は[API・永続化契約](REQ-334-contracts.md)、物理カード依存は[タスク一覧](REQ-334-task-manifest.md)。復旧原文は[202行の保存版](REQ-334-restored-source.md)を保持した。PBI管理スクリプトの原文巻き戻りを避け、状態はUTF8/LFで直接管理する。
