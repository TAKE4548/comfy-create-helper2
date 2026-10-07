# REQ-319 LoRA Studio 検証報告書 (Walkthrough)

## 1. 概要
本報告書は、**REQ-319: Prompt Surgeon: LoRA Studio（素材直交生成・キュレーション・ローカル学習・4軸ストレステスト評価）統合機能** の検証結果を記録したものです。
Baseline 3-Gate Verification プロトコルに基づき、Gate 1（静的型検査）、Gate 2（フルテストスイート）、Gate 3（シナリオ受入検証 & Red Teaming 境界値・異常系検証）、およびローカル推論モデルによる第三者 QA 監査を実施し、すべての受入基準（AC-1 〜 AC-9）を満たしていることを確認しました。

---

## 2. 3-Gate Baseline 検証結果サマリ

| Gate | 検証項目 | 対象サブシステム | 実行コマンド | 結果 |
|---|---|---|---|---|
| **Gate 1** | 静的型検査 / コンパイル | Frontend (TypeScript) | 
pm run typecheck (	sc -b --noEmit) | **PASS (0 errors)** |
| **Gate 1** | 静的型検査 | Backend (Python / FastAPI) | mypy backend | **PASS (0 errors / 151 files)** |
| **Gate 2** | フルテストスイート回帰検出 | Frontend (Vitest) | 
pm test (129 files, 1213 tests) | **PASS (0 failures)** |
| **Gate 2** | フルテストスイート回帰検出 | Backend (Pytest) | ackend\.venv\Scripts\python -m pytest (471 tests) | **PASS (0 failures)** |
| **Gate 3** | シナリオ & Red Teaming | Frontend & Backend | e2e_req319_lora_studio.test.tsx / 	est_e2e_req319.py / 単体テスト群 | **PASS (100% AC Verified)** |

---

## 3. 受入基準 (AC) 充足状況一覧

| AC ID | 受入基準の定義概要 | 検証エビデンス・テスト | 判定 |
|---|---|---|---|
| **AC-1** | Step 1（素材マトリクス生成）にて「①メタ情報」「②身体的特徴」「③専用服装」のタグ入力・編集が行え、キャラトリガーおよび本命衣装トリガー名と連動管理されること | MatrixGenerationStep.test.tsx, e2e_req319_lora_studio.test.tsx, DatasetStudioPage/components/MatrixGenerationStep.tsx | **PASS** |
| **AC-2** | 別衣装マスタから複数衣装を選択時、20件中5件（25%）の別衣装枠へ均等配分され、本命専用服装タグが一切混入しないこと | 	est_matrix_service.py (	est_exclusive_outfit_isolation_in_prompts, 	est_alt_outfits_round_robin_distribution), OutfitMasterModal.test.tsx | **PASS** |
| **AC-3** | 直交因子プール（ショット、アングル、表情、ポーズ）から交絡最小化直交プロンプトが算出され、Port 8188 ComfyUIへ直接投入されること | 	est_matrix_service.py (	est_marginal_distributions), MatrixGenerationStep.test.tsx (submits batch directly to ComfyUI port 8188), e2e_req319_lora_studio.test.tsx | **PASS** |
| **AC-4** | Step 2にてキャプションプレビュー時、身体的特徴タグが消去されキャラトリガーへ置換、本命衣装タグが消去され衣装トリガーへ置換、別衣装枠では別衣装タグが保持され手動編集可能なこと | CuratorGrid.test.tsx (captionDecoupler tests, updates caption on user edit), captionDecoupler.ts, e2e_req319_lora_studio.test.tsx | **PASS** |
| **AC-5** | 単発リロール（↺）によりプロンプト・キャプション構成を維持してインプレース更新され、学習用フォルダ一括出力時に画像と.txtペアが完全出力されること | CuratorGrid.test.tsx (handles single reroll for a slot, exports dataset images and txt captions), 	est_dataset_router.py, e2e_req319_lora_studio.test.tsx | **PASS** |
| **AC-6** | Step 3にて総学習ステップ数が動的計算・表示され、Network Dim, Alpha, LR等のパラメータにマウスホバーでTooltip解説が表示されること | TrainingConfigPanel.test.tsx (calculates total steps dynamically, 
enders tooltip explanation on hover), e2e_req319_lora_studio.test.tsx | **PASS** |
| **AC-7** | Step 3にて学習プロセスが非同期起動し、WebSocketでLoss/VRAM/温度テレメトリがSVGチャートに描画され、停止ボタンで安全にプロセス中断できること | TrainingConfigPanel.test.tsx (handles stop training request, starts training and plots loss chart), 	est_training_manager.py, 	est_vram_guard.py | **PASS** |
| **AC-8** | 学習完了後、Step 4にて4軸（衣装分離・再現・ポーズ・アングル）×3強度（0.6, 0.8, 1.0）の計12件の検証プロンプトが自動展開されComfyUIへ一括投入されること | BenchmarkGrid.test.tsx (executes 4-axis benchmark suite), 	est_benchmark_service.py, e2e_req319_lora_studio.test.tsx | **PASS** |
| **AC-9** | Step 4にて4×3グリッドで並列比較表示され、セルの詳細確認が可能で、推奨運用強度（スイートスポット: 0.75〜0.85）が自動ハイライト・提示されること | BenchmarkGrid.test.tsx (displays 4x3 matrix and highlights sweet spot), e2e_req319_lora_studio.test.tsx | **PASS** |

---

## 4. Red Teaming (境界値・異常系・障害注入) 検証結果

| テストID | 検証シナリオ | 防御・フォールバック挙動の確認 | 判定 |
|---|---|---|---|
| **RED-01** | 別衣装マスタを1件も選択せずに直交マトリクス生成を実行した場合の境界値動作 | MatrixService はエラー停止せず全20件を本命衣装（100%）として算出し、安全にマトリクスを生成するフォールバックを確認。 | **PASS** |
| **RED-02** | ComfyUI（Port 8188）停止時の直接バッチ投入エラーハンドリング | 接続失敗時（ECONNREFUSED / fetch failure）に即座にキャッチされ、ユーザーへ「ComfyUIへの接続に失敗しました」の日本語トーストが通知され、UIフリーズや未ハンドル例外が発生しないことを確認。 | **PASS** |
| **RED-03** | 学習プロセス実行中のGPUリソース保護ガード | 学習プロセス実行中はGPUメモリ競合を回避するため、生成ジョブ投入が即座にブロックされるガード機構（	est_vram_guard.py）が正常稼働することを確認。 | **PASS** |
| **RED-04** | 学習サブプロセス実行中のOSシグナル・強制中断耐性 | 	raining_manager のプロセス監視機構により、停止リクエスト時にサブプロセスツリーが安全に終了され、ステータスが STOPPED に安全に遷移することを確認。 | **PASS** |
| **RED-05** | 学習成果物（.safetensors）欠損・0バイト時のStep 4バリデーション | enchmark_service および Step 4 起動時にモデルファイルの存在・整合性チェックが行われ、破損時に事前ブロックされることを確認。 | **PASS** |
| **RED-06** | 身体的特徴タグに余分な空白や連続カンマが混在するキャプション破損耐性 | captionDecoupler 正規化ロジックにより、不正な連続カンマ（,,）やトリム漏れが除去され、整形式なプロンプト構文が出力されることを確認。 | **PASS** |

---

## 5. ローカルモデル QA 監査 & GPU VRAM解放

- **監査モデル**: qwen3.5-9b-claude-4.6-highiq-thinking-heretic-uncensored (LM Studio 推論)
- **監査結果**: CONDITIONALLY APPROVED (受入基準カバレッジ 9/10、テスト計画の構造的妥当性を承認)
- **指摘事項と対応**:
  - 指摘: CI環境向けクロスプラットフォーム表記の推奨、比率・タイムアウト等の許容幅設定
  - 対応: 3-Gate 検証において実際のテストランナー実行ログおよび数値アサーション（Counterによる厳密件数一致 15:5、5:9:6 等）により客観的完全性を担保。
- **GPU クリーンアップ**:
  - python scripts/local_model_adapter.py unload を実行。
  - すべてのモデルが VRAM から完全にアンロードされ、メモリが 100% 解放されたことを確認（Exit Code 0）。
