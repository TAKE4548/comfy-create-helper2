# インシデントレポート: server-manager 一括起動時における WSL2 ComfyUI のポート確認失敗 (fail扱い)

## 1. 事象概要 (Overview)

ユーザーより以下の事象が報告された。
- 「server-manager を一括起動した後、comfyUIがちゃんと起動してるのに、ポート確認でfail扱いになってしまう」

調査および実機検証の結果、以下の事実を確認した。
1. `tools/server-manager/server-manager.ps1` において、ポート導通確認は `Test-PortOpen` 関数（`Get-NetTCPConnection -LocalPort $port | Where-Object State -eq "Listen"`）により実装されている。
2. ComfyUI は WSL2（Linux VM）内部で起動しており、Linux 側で `0.0.0.0:8188` をリッスン（`LISTEN`）している。
3. WSL2 のネットワークアーキテクチャでは、Windows 側から `127.0.0.1:8188` への TCP 接続要求は WSL の localhost proxy によって Linux 側に透過転送されるため接続可能（`Test-NetConnection -ComputerName 127.0.0.1 -Port 8188` -> `TcpTestSucceeded: True`）である。
4. 一方で、Windows の OS ネイティブの TCP 接続テーブル上には `8188` のローカルリスニングソケット（`State -eq "Listen"`）が存在しない（`Get-NetTCPConnection -LocalPort 8188` が常時 `$null` / エラーコード 1 を返す）。
5. このため、ComfyUI が WSL2 内で正常に起動し Windows からアクセス可能な状態であっても、`Test-PortOpen 8188` が必ず `$false` を返し続け、タイムアウト（30秒 × 4回試行 = 最大120秒超）の末に「`[WSL ComfyUI] Failed to open port 8188 after 4 attempt(s)`」と赤字で fail 扱いとして出力される。
6. さらに、`Get-StatusObject` も `Get-PidsFromPort $cfg.wsl.port`（同様に `Get-NetTCPConnection` 依存）を使用しているため、ComfyUI 稼働中にもかかわらず `[STOPPED] WSL ComfyUI : Port 8188` と誤判定される。

---

## 2. 再現手順・観測された挙動 (Reproduction & Observed Symptoms)

### ログ確認結果:
- `scripts/inspect_logs.py --summary` および `--errors --tail 10` を実行して確認。
- `logs/app.jsonl` は Prompt Surgeon アプリケーション稼働ログであり、直近のエラーは以下の通り：
  - `[2026-09-09T00:14:36.002+09:00]` [frontend] `Should have a queue. This is likely a bug in React.`
  - `[2026-09-09T15:29:37.027+09:00]` [backend] `[req-06c215bcf96e]` `(sqlite3.ProgrammingError) SQLite objects created in a thread can only be used in that same thread.`
  - `[2026-09-09T18:48:44.746+09:00]` [frontend] `Failed to construct 'WebSocket': The URL 'ws://localhost:undefined/?token=s3zpPky17XI5' is invalid.`
- `server-manager` のポート待機およびステータス確認は外部の PowerShell スクリプト層で実行されるため、ポート検出エラーはコンソール出力にて観測される。

### 再現手順:
1. WSL2 側で ComfyUI を起動する（または `server-manager.ps1 -Action start` を実行する）。
2. WSL 内部では `ss -tulpn` により `0.0.0.0:8188` で Python が `LISTEN` していることを確認。
   - `tcp LISTEN 0 128 0.0.0.0:8188 0.0.0.0:* users:(("python",pid=399,fd=21))`
3. Windows 側から TCP 接続テストを行うと即座に成功する。
   - `Test-NetConnection -ComputerName 127.0.0.1 -Port 8188` -> `TcpTestSucceeded : True`
4. しかし、`server-manager.ps1` を実行すると以下の動作となる：
   ```powershell
   Get-NetTCPConnection -LocalPort 8188 -ErrorAction SilentlyContinue | Where-Object State -eq "Listen"
   # => $null (検出不可)
   ```
5. `Wait-For-Port` による待機ループで `Test-PortOpen 8188` が常に `$false` となり、リトライを繰り返した後に失敗判定となる：
   ```text
   [WSL ComfyUI] Port 8188 not open yet after 30s. Retrying (1/3) in 2s...
   [WSL ComfyUI] Port 8188 not open yet after 30s. Retrying (2/3) in 2s...
   [WSL ComfyUI] Port 8188 not open yet after 30s. Retrying (3/3) in 2s...
   [WSL ComfyUI] Failed to open port 8188 after 4 attempt(s) (timeout: 30s each).
   ```
6. その後のステータス表示で ComfyUI が `[STOPPED]` と表示される：
   ```text
   =================================================
     Prompt Surgeon & ComfyUI Server Status
   =================================================
     [LISTEN ] React FE        : Port 5173 (PID: ...)
     [LISTEN ] Win BE          : Port 8000 (PID: ...)
     [STOPPED] WSL ComfyUI     : Port 8188
   =================================================
   ```

---

## 3. 影響範囲・該当コード (Affected Area & Source Locations)

| # | 対象ファイル | 該当行/箇所 | 詳細 |
|---|---|---|---|
| 1 | `tools/server-manager/server-manager.ps1` | L22-L25 (`Test-PortOpen`) | `Get-NetTCPConnection -LocalPort $port | Where-Object State -eq "Listen"` によりポート開放を判定しているが、WSL2 のポートは Windows TCP テーブルの Listen ソケットとして現れないため常に判定失敗する。 |
| 2 | `tools/server-manager/server-manager.ps1` | L27-L34 (`Get-PidsFromPort`) | Windows の `Get-NetTCPConnection` で PID を取得しようとしているため、WSL2 内のプロセス PID は取得できず空配列となり、ステータス判定で常に `STOPPED` になる。 |
| 3 | `tools/server-manager/server-manager.ps1` | L86-L112 (`Wait-For-Port`) | `Test-PortOpen` の結果のみに依存してポーリングを行うため、WSL2 サービス（ComfyUI）で最大 120 秒以上の不必要な待機が発生した上で fail を誤出力する。 |
| 4 | `tools/server-manager/server-manager.ps1` | L229-L233 (`Start-ComfyUIProcess`) | 多重起動防止の事前チェックに `Test-PortOpen $cfg.wsl.port` を使っているため、既に起動している ComfyUI を未起動と誤認し二重起動を試みてしまうリスクがある。 |
| 5 | `tools/server-manager/server-manager.ps1` | L148-L180 (`Get-StatusObject`) | `$comfyRunning = ($comfyPids.Count -gt 0)` で判定しているため、Web マネージャー（`server_api.py` / localhost:8899）でも ComfyUI が常に STOPPED と表示される。 |

---

## 4. 根本原因の分析 (Root Cause Analysis)

### 発生メカニズム:
1. **WSL2 仮想化ネットワークと Windows TCP スタックの差異**:
   - Backend (Uvicorn: 8000) や Frontend (Vite: 5173) は Windows OS 上のネイティブプロセスであるため、Windows の TCP テーブルに `State: Listen` かつ `OwningProcess: <PID>` が登録される。
   - 一方、ComfyUI は Hyper-V 上の Linux 仮想環境（WSL2）で動作している。Linux 側のカーネルでポート `8188` のソケットがリッスン状態となる。
   - Windows 側では WSL2 の localhost 転送機能（localhost proxy）により、`127.0.0.1:8188` へ送信・接続しようとした際に初めて動的転送が行われる。Windows 側の OS 自体が `8188` で常時 `Listen` 状態のソケットを開いているわけではない。
2. **`Get-NetTCPConnection` による確認手法の限界**:
   - `Get-NetTCPConnection -LocalPort $port` は Windows ホスト自身の TCP ソケットテーブルを照会するコマンドレットである。
   - WSL2 内で開かれているポートに対しては、Windows 側のリスニングソケットが存在しないため必ず `$null` となり、ポート開通を検知できない。
   - 同様に、プロセス所有者 PID も Windows 側のプロセス ID ではないため、`OwningProcess` を取得することは構造上不可能である。
3. **結果としての誤検知**:
   - 実際には `127.0.0.1:8188` に対する TCP コネクション確立（ソケット接続）はミリ秒単位で瞬時に成功可能であるにもかかわらず、`Get-NetTCPConnection` による Listen 存在確認のみに頼っているため、起動検知が 100% 失敗（タイムアウト）する。

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
    - WSL2 仮想マシンのネットワーク挙動を考慮せず、Windows ネイティブプロセス用のポート・プロセス確認 API（`Get-NetTCPConnection`）を一律に WSL2 サービス（ComfyUI）にも適用したことによる実装上の欠陥。

---

## 6. バックログ登録とルーティング提案 (Backlog Registration & Routing)

- **課題概要**:
  - `tools/server-manager` における WSL2 サービス（ComfyUI）のポート疎通確認およびステータス（稼働/停止）判定の正常化。
  - Windows プロセスと WSL2 プロセスで適切な疎通・状態判定ロジックを分離・適合させる改修。
- **推奨ワークフロー**: `/dev-design`

---

**ユーザー確認事項 (Approval Gate)**:
上記インシデントレポートの内容で合意いただける場合、PBIとしてバックログに登録し、`/dev-design` に進みますか？ (YES / NO)
