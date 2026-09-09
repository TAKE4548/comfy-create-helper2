# インシデントレポート: server-manager で ComfyUI ポート開放待ちタイムアウト (10s) が不足・ハードコードされている不具合

## 1. 事象概要 (Overview)

ユーザーより以下の事象および改修要望が報告された。
- 「server-managerのポート開放待ちがComfyUIは10sじゃ足りないっぽい。」
- 「ここの待機時間を毎度ハードコードで修正したくないので、configで調整可能にしたい。」
- 「また、待機で1度failだったとしても、数回はリトライするようにして堅牢にしたい」

調査の結果、以下の事実を確認した。
1. `tools/server-manager/server-manager.ps1` において、`Wait-For-Port` 関数およびその呼び出し箇所（全8箇所）で待機タイムアウト時間 `10` 秒が固定値（ハードコード）で渡されている。
2. ComfyUI は WSL2 上で PyTorch、CUDA/ROCm ランタイム初期化、カスタムノードのインポートなど重い起動処理を行うため、起動開始からポート `8188` の LISTEN 状態になるまでに環境やキャッシュ状況によって 10 秒以上を要することが頻繁に発生する。
3. `Wait-For-Port` は指定秒数経過後に `Test-PortOpen` が偽であれば即座に終了し、再試行（リトライ）を行う仕組みが存在しない。
4. `tools/server-manager/config.json` には待機タイムアウト秒数やリトライ回数を定義・制御する設定項目が存在しない。
5. このため、ComfyUI が正常にバックグラウンド起動中であっても、10秒経過した時点でタイムアウトし、マネージャー上で起動失敗・停止（`STOPPED`）と誤判定される。

---

## 2. 再現手順・観測された挙動 (Reproduction & Observed Symptoms)

### ログ確認結果 (`logs/app.jsonl`):
- `scripts/inspect_logs.py --summary` および `--errors --tail 10` を実行して確認。
- エントリー総数: 12,762 件
- 直近エラー:
  - `[2026-09-09T00:14:36.002+09:00] [frontend] [FE] window.onerror: Should have a queue. This is likely a bug in React.`
  - `[2026-09-09T00:14:36.051+09:00] [frontend] [FE] GlobalErrorBoundary: Should have a queue. This is likely a bug in React.`
- `logs/app.jsonl` は Prompt Surgeon 本体のログであり、`server-manager` のプロセス監視・ポート待機ログは標準出力または `tools/server-manager/logs/` で扱われる設計である。

### 再現手順:
1. ComfyUI が停止している状態で、`tools/server-manager/server-manager.ps1 -Action start -Service comfy` または `start_servers.bat` を実行する。
2. WSL2 内で ComfyUI プロセスが立ち上がるが、Python プロセスのモジュール読み込みに 10 秒以上かかる。
3. `server-manager.ps1` 側の `Wait-For-Port $cfg.wsl.port 10` が 10 秒で待機を終了する。
4. ポート 8188 がまだリッスンされていないため待機が失敗と判定され、ステータス画面に `STOPPED` と表示される（プロセス自体はその後遅れて起動完了するが、起動完了を待てずに終了する）。

---

## 3. 影響範囲・該当コード (Affected Area & Source Locations)

| # | 対象ファイル | 該当行 | 詳細 |
|---|---|---|---|
| 1 | `tools/server-manager/server-manager.ps1` | L36-L44 | `Wait-For-Port ([int]$port, [int]$timeoutSec = 10)` のシグネチャおよび実装。デフォルト値が 10 秒固定であり、リトライ機能を持たない。 |
| 2 | `tools/server-manager/server-manager.ps1` | L219-L222 | `Start-AllServices` 内で `Wait-For-Port $cfg.wsl.port 10`、`Wait-For-Port $cfg.backend.port 10`、`Wait-For-Port $cfg.frontend.port 10` とハードコード呼び出し。メッセージも `"up to 10s"` で固定。 |
| 3 | `tools/server-manager/server-manager.ps1` | L234, L241, L248 | `Restart-ServiceByName` 内で各サービスの再起動後に `Wait-For-Port ... 10` とハードコード呼び出し。 |
| 4 | `tools/server-manager/server-manager.ps1` | L331, L332, L333 | メインディスパッチ (`Action == "start"`) 内で個別起動時に `Wait-For-Port ... 10` とハードコード呼び出し。 |
| 5 | `tools/server-manager/config.json` | 全体 | ポート待機タイムアウト時間やリトライ回数を設定する項目（例: サービス別または共通の timeout / retry 設定）が存在しない。 |

---

## 4. 根本原因の分析 (Root Cause Analysis)

### 発生メカニズム:
1. **ComfyUI の起動時間特性とタイムアウト値の不一致**:
   - ComfyUI は Python 仮想環境の起動、PyTorch やハードウェアアクセラレータ（CUDA/ROCm）の初期化、多数のカスタムノードのインポートなどを行うため、コールドスタート時に 10 秒を超える時間がかかるのが一般的である。
2. **待機時間のハードコードと柔軟性の欠如**:
   - `server-manager.ps1` 内の全呼び出し箇所で数値リテラル `10` が直接渡されており、ユーザー環境やマシンスペック、初回起動時のモデルロード等の変動を `config.json` 側で吸収・調整できない構造になっている。
3. **リトライ機構の欠落による脆弱性**:
   - `Wait-For-Port` は単一ループで `$timeoutSec` 秒待機した後に `Test-PortOpen` の結果を返すのみであり、一時的な通信遅延やポートバインドの瞬間的な失敗に対する再試行（リトライ回数・インターバル制御）が組み込まれていない。

---

## 5. 原因分類 (Classification)

<diagnostic_check>
- Root_Cause_Isolated: Yes
- Classification: Type_A: Implementation Bug
- Scope_Restriction: Read-only phase. Code modification or fix proposals are strictly PROHIBITED during this turn.
- Route: Direct to /dev-design
</diagnostic_check>

- **分類**:
  - **Type A (Implementation Bug)**:
    - ComfyUI などヘビーなサービスの起動特性に対する考慮不足、待機時間のハードコード、およびリトライ機構の欠如に起因する実装上の不備。

---

## 6. バックログ登録とルーティング提案 (Backlog Registration & Routing)

- **改修方針の概要**:
  - `config.json` にポート開放待ちタイムアウトおよびリトライ設定（サービス個別または全体共通）を追加できるようにする。
  - `server-manager.ps1` の `Wait-For-Port` において、`config.json` からタイムアウト値・リトライ回数を読み込んで適用し、失敗時のリトライ制御をサポートする。
  - ハードコードされている `10` を設定値参照に変更する。
- **推奨ワークフロー**: `/dev-design`

---

**ユーザー確認事項 (Approval Gate)**:
上記インシデントレポートの内容で合意いただける場合、PBIとしてバックログに登録し、`/dev-design` に進みますか？ (YES / NO)
