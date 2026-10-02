# REQ-307 3-Gate 検証ウォークスルー

**対象**: [REQ-307](../REQ-307.md) — 生成キュー投入失敗時に理由をトーストで示す  
**テスト計画**: [REQ-307-test-plan.md](../../../../design/REQ-307-test-plan.md)  
**検証日**: 2026-10-02 (JST)  
**総合判定**: **PASS**（AC-1〜5の自動検証を全件通過。追加の実環境・高件数手動シナリオは未実施。）

## 実行結果

### Gate 1 — 型検査・ビルド

- `cd frontend; npm run typecheck` — **PASS**, 終了コード 0、TypeScript エラーなし。最終検証で再実行。
- `cd frontend; npm run build` — **PASS**（調整役の実行記録）。`tsc -b` と Vite が完了し、2,020 modules を処理。`frontend/dist/index.html`（857 B）と JS/CSS assets を確認。
- backend の有効な `.venv` Python で `settings.frontend_dist_path` が workspace の `frontend/dist` を指し、static mount/config を確認（調整役の実行記録）。バンドルサイズ警告 1.26 MB があった。

### Gate 2 — フロントエンド全テスト

最終変更後に `cd frontend; npx vitest run` を**ファイル指定なし**で実行。

- **PASS**: 99 test files、988 tests 成功、失敗 0、終了コード 0。
- REQ-307 のテスト計画に記載された 4 ファイルの集中実行は 4 files / 107 tests 成功。更新後のフル実行では対象ファイルを含む全体が成功。
- 503 fault-injection の以前のテストは `/503/` を期待していたが、AC に沿って数字だけを理由として出さない表示と衝突していた。期待値の更新後、`useGenerateAction.fault.test.ts` は 3 tests 成功し、フル実行も成功。
- フル実行の一部 stderr にはテストで意図的に発生させるネットワーク例外、fault-injection、React `act` 警告が含まれる。Vitest の失敗ではない。

### Gate 3 — AC・シナリオ証拠

| AC | 自動テスト証拠 | 判定 |
|---|---|---|
| AC-1 理由の併記 | `queueSubmissionFailure.test.ts` の ComfyUI node/detail 抽出、`jobQueueSlice.test.ts` の HTTP 400 callback、`useGenerateAction.test.ts` の単一生成理由トースト | 自動 **PASS** |
| AC-2 理由不明時 | 空・空白・状態番号のみ・壊れた JSON・任意オブジェクトの拒否、理由不明 fallback のテスト | 自動 **PASS** |
| AC-3 失敗対象と理由の対応 | 複数セットの異なる失敗理由集約、および単一生成バッチ位置表示のテスト | 自動 **PASS** |
| AC-4 全件失敗・成功通知なし | `useGenerateAction.test.ts:620` の “shows every failed item reason once and emits no success notification when all items fail” が各理由の一回表示と成功通知なしを検証 | 自動 **PASS** |
| AC-5 長文の全文読了 | `GenerateModalsOverlay.test.tsx` は24行の長文全体が DOM に存在し、HTML 風文字列が要素化されず、折返し・最大高・縦スクロール用クラスがあることを検証。長い plain text を切らないパーサーテストも成功 | 自動 **PASS** |

追加の失敗系証拠として、HTTP 503 とネットワーク断の fault-injection、ComfyUI の拒否、proxy 502 / timeout の理由正規化、キャンセル後に通知しないケースが自動テストにある。REQ-141 の failed 状態維持を確認するテストも成功。

次の追加手動シナリオは実施していない。AC-1〜5 は前掲の自動テストで直接検証済みであり、これらは補足的な実環境カバレッジとして残す。

- 実 ComfyUI の HTTP 400 を proxy → client → store → hook → toast まで通す実環境確認。
- PC とモバイルの実画面で5秒後も表示されること、画面幅・高さの境界で全文をスクロールできること。
- 20件以上の実投入失敗を混在させた通知行の対応とスクロール確認。
- 通信中／応答直後の実操作キャンセルや、同名セット・バッチ境界など実画面の境界確認。

## 追加監査と環境

- 指示された `python <GLOBAL_SCRIPTS>\local_model_adapter.py qa-audit docs/design/REQ-307-test-plan.md` は終了コード 0。監査はコマンド具体性 6/10、指標曖昧さ 4/10（FAIL）、AI escape 防止 5/10 とし、全体の機械的可実行性・escape 防止を条件付き PASS と評価。特に「長い」「読める」「混同せず」の数値化と一部 Gate 3 の判定方法を指摘した。この監査はテスト計画の具体化と T3 の AC-4 追加テストより前に実施された。後続の手動整合レビューで、長文の24行 fixture と全文一致、最大高/スクロール、失敗ごとの個別行、20件超シナリオの未実施を計画書に明記した。監査結果は条件付きのまま記録し、文書修正後の追加モデル監査は未実施。
- 監査直後に `python <GLOBAL_SCRIPTS>\local_model_adapter.py unload` を実行、終了コード 0。ツール出力は “All models unloaded from LM Studio. VRAM freed.”。独立した GPU メモリー確認用の `nvidia-smi` はこの環境に存在せず、独立計測はできていない。
- `python scripts/inspect_logs.py --clean-check 10` — **PASS**。最終テスト後も “No errors or warnings found in the last 10 minutes.”。
- 指定された tester-reviewer role source と dev-verify skill のワークスペース外ファイルは sandbox によって読み取り拒否された。実行結果を代替根拠として扱い、ロール/スキル原文を読んだとは報告しない。

## 総合判定

**PASS** — Gate 1 と Gate 2 が PASS。Gate 3 は AC-1〜5 それぞれの自動テスト証拠があり、Desktop/Mobile の通知寿命テストも成功した。実 ComfyUI 結合経路と実ブラウザー表示、20件超のストレスシナリオは未実施として分けて記録し、未実施の手動カバレッジを完了したとは扱わない。ローカル QA 監査は条件付き判定だったが、指摘された測定語と集約表示の曖昧さはテスト計画の更新で明示し、ACを直接検証するテスト結果で受入れを確認した。
