---
id: REQ-319-test-plan
status: ready
tags: [lora-studio, test-plan, integration, e2e, red-team, baseline-3-gate]
related_paths:
  - docs/backlog/pbi/active/REQ-319.md
  - docs/design/REQ-319.md
  - frontend/src/pages/DatasetStudioPage/index.tsx
  - backend/app/services/matrix_service.py
  - backend/app/services/training_manager.py
  - backend/app/services/benchmark_service.py
---

# REQ-319 実行可能テスト計画: LoRA Studio

## 1. 概要とスコープ
本計画は、REQ-319（LoRA Studio: 素材直交生成・キュレーション・ローカル学習・4軸ストレステスト評価統合機能）における静的型検査、単体テスト、結合シナリオ、E2E受入テスト、およびRed Team境界値・異常系検証の手順を定義する。
受入基準 AC-1 〜 AC-9 の完全準拠を検証し、Baseline 3-Gate Verification の全ゲート通過を保証する。

---

## 2. 静的解析 & 単体テスト (Static / Unit & Contract)

### 2.1 フロントエンド静的検査 & 単体テスト
```bash
# 型チェック
cd frontend; npm run typecheck

# 単体テスト (全Studioコンポーネント & ユーティリティ)
cd frontend; npx vitest run \
  src/pages/DatasetStudioPage/__tests__/MatrixGenerationStep.test.tsx \
  src/pages/DatasetStudioPage/__tests__/OutfitMasterModal.test.tsx \
  src/pages/DatasetStudioPage/__tests__/CuratorGrid.test.tsx \
  src/pages/DatasetStudioPage/__tests__/TrainingConfigPanel.test.tsx \
  src/pages/DatasetStudioPage/__tests__/BenchmarkGrid.test.tsx \
  src/pages/DatasetStudioPage/utils/__tests__/captionDecoupler.test.ts
```

### 2.2 バックエンド静的検査 & 単体テスト
```bash
# 型チェック
mypy backend/app/services/matrix_service.py backend/app/services/training_manager.py backend/app/services/benchmark_service.py backend/app/routers/dataset_router.py

# 単体テスト
backend\.venv\Scripts\python -m pytest \
  backend/tests/test_dataset_db.py \
  backend/tests/test_matrix_service.py \
  backend/tests/test_dataset_router.py \
  backend/tests/test_training_manager.py \
  backend/tests/test_benchmark_service.py \
  -v
```

---

## 3. 結合テストシナリオ (Integration Scenarios)

| シナリオID | 対象受入基準 | 操作フロー (Given / When) | 期待される検証結果 (Then / 判定基準) |
|---|---|---|---|
| **INT-01** | AC-1 | Step 1 を開き、①メタ情報、②身体的特徴、③専用服装にタグを入力 | GeneratePage と同一のチップ追加、削除、ドラッグ語順入替、テキストモード切替が正しく動作し、`character_trigger` (`mychara`) および `outfit_trigger` (`mychara_outfit`) と連動保持されること。 |
| **INT-02** | AC-2 | 別衣装マスタから「カジュアルパーカー」「シンプル部屋着」を選択し、マトリクス算出を実行 | 全20件中5件（25%）に選択した2種類の衣装が [3件, 2件] で均等割り当てられ、別衣装枠のプロンプトに③専用服装タグが1語も混入しないこと。 |
| **INT-03** | AC-3 | 直交因子（ショット、アングル、表情、ポーズ、衣装枠）を設定し、「直交マトリクス再計算」および「ComfyUI投入」を実行 | ショット因子の目標周辺比率（Close-up 25%, Bust 45%, Full-body 30%）を満たし、交絡が最小化された全20件の直交プロンプト群が算出される。FastAPIを介さずブラウザから直接Port 8188へPOSTされ、WebSocketで進捗が更新されること。 |
| **INT-04** | AC-4 | Step 1 で生成されたスロットのキャプションを Step 2 で確認 | 本命衣装枠（15件）では身体的特徴タグが消去されて `{char}`、専用服装タグが消去されて `{outfit}` に置換される。別衣装枠（5件）では身体的特徴タグが消去されて `{char}` に置換され、別衣装タグは保持され `{outfit}` は混入しないこと。ユーザーによる手動編集も反映されること。 |
| **INT-05** | AC-5 | 生成画像の1スロットで単発リロール（↺）を実行し、「学習用フォルダ一括出力」を実行 | 該当スロットのプロンプト・キャプション構成を維持したまま新規シードでComfyUIへ単発再生成が行われて画像がインプレース更新され、エクスポート時に `001.png` + `001.txt` の完全ペアが指定先に出力されること。 |
| **INT-06** | AC-6 | Step 3 で素材20枚、リピート10、バッチ1、エポック10を入力し、各パラメータの `(?)` アイコンにホバー | 総ステップ数「2,000 steps」およびチェックポイント数が動的計算・表示され、Network Dim, Alpha, LR, Mixed Precision, Gradient Checkpointing 等のホバー時に数学的意味と推奨値解説Tooltipが表示されること。 |
| **INT-07** | AC-7 | Step 3 で「学習プロセス起動」を実行し、途中で「停止」をクリック | サブプロセスが非同期起動し、WebSocket 経由で Loss・ステップ・VRAM・温度がリアルタイム受信されて SVG チャートにプロットされ、停止ボタンでプロセスが安全に中断されること。また学習実行中は生成ジョブ投入がガードされること。 |
| **INT-08** | AC-8 | 学習完了（`.safetensors` 存在確認後）、Step 4 で「4軸ストレステスト実行」をクリック | トリガー名に基づき「衣装分離」「衣装再現」「ポーズ追従」「アングル追従」の4軸×3強度（0.6, 0.8, 1.0）の計12件の検証用プロンプトが固定シード（`12345678`）で自動展開され、ComfyUI へ直接一括投入されること。 |
| **INT-09** | AC-9 | 12枚の検証画像生成完了後、Step 4 評価グリッドを表示 | 4列（テスト軸）× 3行（強度）のマトリクスで画像と判定ステータスが並列比較表示され、各セルの拡大モーダル確認が可能であり、推奨運用強度（スイートスポット: 0.75〜0.85）が自動ハイライト・提示されること。 |

---

## 4. E2E / Acceptance Paths

```bash
# フロントエンド E2E 統合テスト
cd frontend; npx vitest run src/test/e2e_req319_lora_studio.test.tsx

# バックエンド E2E 統合テスト
backend\.venv\Scripts\python -m pytest backend/tests/test_e2e_req319.py -v
```

---

## 5. Red Teaming (境界値・異常系・障害注入テスト)

| テストケースID | 分類 | 異常シナリオ / 境界条件 | 期待されるフォールバック / 防御挙動 |
|---|---|---|---|
| **RED-01** | 境界値 | 別衣装マスタを1件も選択せずに直交マトリクス生成を実行 | エラーで停止せず、全20件を本命衣装（100%）として直交マトリクスを算出し、ユーザーへ「別衣装が未選択のため全件本命衣装で生成されました」と警告トーストを表示する。 |
| **RED-02** | 異常系 | ComfyUI（Port 8188）が停止またはポート競合している状態で直接バッチ投入を実行 | フロントエンドが接続失敗（ECONNREFUSED / fetch failure）を即座に検知し、未送信ジョブを安全にロールバック。「ComfyUIへの接続に失敗しました。Port 8188 が起動しているか確認してください」と明示的な日本語トーストを表示し、UIフリーズや無限ローディングに陥らないこと。 |
| **RED-03** | 競合制御 | 学習プロセス実行中にユーザーが別タブまたはStudioから画像生成を実行しようとした場合 | GPU リソースガードが発動し、「学習プロセス実行中はGPUメモリ競合を防ぐため生成ジョブの実行がブロックされています」というガードメッセージを表示してキュー投入を即座に阻止すること。 |
| **RED-04** | プロセス異常 | 学習サブプロセス実行中にOSシグナル（SIGTERM / taskkill / プロセス強制終了）が発生した場合 | バックエンドのプロセス監視ループが非同期で検知し、ジョブステータスを安全に `STOPPED` または `FAILED` に遷移させ、ゾンビプロセスや孤立ファイルロックを残さないこと。 |
| **RED-05** | 破損検証 | 学習成果物 `.safetensors` ファイルが 0 バイトまたは異常終了で存在しない状態で Step 4 へ遷移しようとした場合 | Step 4 実行前にモデル完全性バリデーションが走り、「学習成果物モデルファイルが見つからないか破損しています。Step 3 の学習結果を確認してください」とブロックし、不正な空モデルでのストレステスト実行を防止すること。 |
| **RED-06** | キャプション破損 | 身体的特徴タグにカンマや改行、特殊記号が不正に混在している場合のデカップリング処理 | `captionDecoupler` が前後の余分な空白・連続カンマ（`,,`）・記号を正規化サニタイズし、不正な空トークンやカンマ抜けのない整形式キャプションを出力すること。 |
