# REQ-395 テスト計画

- PBI: `docs/backlog/pbi/active/REQ-395.md`
- 設計: `docs/design/REQ-395.md`
- 検証プロファイル: V1 Baseline（`.agents/verification.json`、endpoint `source-only`）。V2 opt-in は承認されていないため使わない

## 1. AC 対応表

| AC | 内容（要約） | Tier | ケース（runner ID） | 確認方法 |
| --- | --- | --- | --- | --- |
| AC-1 | バックエンド稼働中に spec の 8 件がすべて PASS | e2e | `generateMobileGallery.spec.ts` の既存 [REQ-372/AC-1〜7, AC-14] 8 ケース | S1 |
| AC-2 | バックエンド停止中に spec の 8 件がすべて PASS | e2e / scenario | 同上 | S2 |
| AC-3 | `/api/ws` が実バックエンドへ到達せずスタブで処理される | e2e | 新規 `[REQ-395/AC-3] Mobile 375px: app WebSocket /api/ws is served by the stub and never reaches the backend` | S1・S2・RT1 |
| AC-4 | Gate 3 全体で既存 spec に新たな失敗がない | e2e（全体） | `python scripts/run_e2e.py` の全ケース | Gate 3 固定コマンド |

注: PBI の AC-1/AC-2 の「8 件」は既存の [REQ-372] 8 ケースを指す。変更後の spec は新規の AC-3 ケースを含めて 9 件になるので、S1・S2 では「9 件すべて PASS（うち [REQ-372] 8 件）」を確認する。

ケース名の `[REQ-xxx/AC-n]` プレフィックスが、トレーサビリティ用のメタデータである（`.agents/context.md` の命名規約）。

## 2. 統合・E2E フロー

- E1（正常）: Generate ページの読み込み → `/api/ws` 接続が `routeWebSocket` に捕捉される → 生成状態は HTTP スタブ `/generation/state` だけから構成される → 履歴グリッド・ボトムシート・全画面ビューア・空状態が spec の期待どおりに描画される。
- E2（保全）: Desktop 1280px の [REQ-372/AC-14] が変わらず PASS する。

## 3. リスク評価とフルスイート・フォールバック

- 分類: **high**。変更対象は Gate 3 の検証に使うテストファイルで、「verification」に触れる変更として扱う（判断が分かれるときは低リスクに丸めない）。
- 結果: V1 Baseline のフル実行（Gate 1 固定コマンド、Gate 2 `scripts/run_full_suite.py`、Gate 3 `scripts/run_e2e.py` 全体とシナリオ）を新しく実行する。フォーカス実行や engineer のローカル結果では PASS としない。
- フォールバックのトリガー（どれか 1 つで成立）: 収集件数の不一致（spec が 9 件にならない）、予期しない skip、flaky（同一条件の再実行で結果が変わる）、`frontend/e2e` 以外の追跡ファイルの変更。

## 4. Red Team / 境界

| ID | 観点 | 手順 | 期待 |
| --- | --- | --- | --- |
| RT1 | 遮断を外したとき検出できるか | スクラッチ複製（追跡ファイルは変更しない）で `routeWebSocket` 登録行だけを外して spec を実行する | `[REQ-395/AC-3]` が失敗する。バックエンド稼働中なら [REQ-372] AC-3/4/5/7 も失敗する |
| RT2 | WS をサーバーへ中継したとき検出できるか | スクラッチ複製で handler 内に `ws.connectToServer()` を足して実行する（バックエンド稼働中） | [REQ-372] AC-3/4/5/7 が失敗する（実データの流入が再現する） |
| RT3 | 他の WS 経路を巻き込まないか | 変更後の spec の diff を読む | `routeWebSocket` の照合条件が pathname `/api/ws` の完全一致だけで、HMR の WS（Vite の `/` など）を捕捉しない |
| RT4 | 製品コードの変更がないか | `git diff --name-only` を確認する | REQ-395 の変更は `frontend/e2e/generateMobileGallery.spec.ts` だけ（他の未コミット差分は REQ-394 などに属する） |
| RT5 | 安定性 | S1 を 2 回連続で実行する | 2 回とも 9 passed（flaky なし） |

## 5. 環境と収集設計

- 実行環境: Windows 11、Node と `frontend/node_modules` の Playwright 1.64.1（chromium）、`backend\.venv\Scripts\python.exe`。GPU は使わない。
- `scripts/run_e2e.py` はポート 5173 で Vite dev server を起動する。5173 が使用中なら exit 1 で止まるので、事前に解放する。
- S1 はバックエンド（:8000）稼働中、S2 は停止中に実行する。:8000 はユーザーのプロセスなので、tester は停止・起動しない。S2 はユーザーが停止したときにだけ実行し、停止できない場合は AC-2 を pending として報告する。
- 収集: spec 単体で 9 件、Gate 3 全体で 289 件（変更前 288 件 + 1）。件数が違えば §3 のフォールバック扱い。
- 候補の凍結: T1 が done になったあとに候補ハッシュを固定し、Gate 1〜3 の RecordV1 は凍結した候補に対して新しく取得する。

## 6. 実行コマンド（テスト配置は既存ファイルの拡張）

テスト配置: 既存の `frontend/e2e/generateMobileGallery.spec.ts` にケースを追加する。チケット番号入りの新規ファイルは作らない。

- 局所（engineer、T1）:
  - `cd frontend; npm run typecheck`
  - `backend\.venv\Scripts\python.exe scripts/run_e2e.py e2e/generateMobileGallery.spec.ts`
  - `backend\.venv\Scripts\python.exe scripts/run_e2e.py e2e/generateMobileGallery.spec.ts --grep "REQ-395/AC-3"`
- Gate 1（固定コマンド、`.agents/verification.json`）: mypy、backend unit、frontend vitest（utils/components）、`scripts/verify_ui_invariants.py`、`npm.cmd --prefix frontend run typecheck`
- Gate 2: `backend\.venv\Scripts\python.exe scripts/run_full_suite.py`
- Gate 3: `backend\.venv\Scripts\python.exe scripts/run_e2e.py`（全体、AC-4）
- シナリオ（Gate 3 の追加行）:
  - S1: `backend\.venv\Scripts\python.exe scripts/run_e2e.py e2e/generateMobileGallery.spec.ts`（バックエンド稼働中、AC-1・AC-3）
  - S2: 同コマンド（バックエンド停止中、AC-2・AC-3）
  - RT1・RT2: スクラッチ複製で実行（追跡ファイルを変更しない）
