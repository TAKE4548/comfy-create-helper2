# インシデントレポート: REQ-242 適用後も挙動が変わらない現象に関する調査報告

## 1. 事象概要 (Overview)

PBI REQ-242（「Service Manager ターミナルバックグラウンド起動とタブ別コンソール出力表示」コミット `d218af1`）の完了後、ユーザーより「242をやったのに挙動が特に変わっていない」「1（Web Manager）はさっきrebootしたはず」との報告を受理。
ログおよび実機プロセスの詳細追跡を行った結果、**ユーザーが実行した `restart_web_manager.bat` において旧プロセスの停止（kill）が失敗していたにもかかわらず、バッチ側の誤判定ロジックにより「再起動成功」と表示されて旧プロセスがそのまま残り続けていたこと**、および **バッチファイル起動時のバックグラウンド引数不整合** が判明した。

---

## 2. 観測ログおよび実機追跡結果 (Observed Evidence & Log Citations)

### 2.1 Web Manager ログ (`tools/server-manager/logs/web_manager.log`)
ユーザーが再起動を実施した直後のタイムスタンプ（`2026/09/10 21:28:35`）にて、以下の起動失敗ログを検知：
```text
Traceback (most recent call last):
  File "tools/server-manager/server_api.py", line 569, in <module>
    run_server()
  File "tools/server-manager/server_api.py", line 558, in run_server
    with ThreadedTCPServer(server_address, ManagerHandler) as httpd:
  File "<python_lib>/socketserver.py", line 457, in __init__
    self.server_bind()
  File "<python_lib>/socketserver.py", line 473, in server_bind
    self.socket.bind(self.server_address)
PermissionError: [WinError 10013] アクセス許可で禁じられた方法でソケットにアクセスしようとしました。
```

### 2.2 プロセス状態の追跡 (ポート 8899)
- **リッスンプロセス**: PID `29248` (`python.exe`)
- **プロセス開始時刻 (StartTime)**: **`2026/09/09 21:53:20`**（昨日起動されたまま）
- **事象のメカニズム**:
  1. 既存の PID 29248 はタスクスケジューラ等（最高特権/別コンテキスト）で常駐していたため、非昇格で実行された `restart_web_manager.bat` の `taskkill /PID 29248 /F` および `Stop-Process` では権限不足（アクセス拒否）により停止できなかった。
  2. `restart_web_manager.bat` はエラー出力を破棄（`2>$null`, `-ErrorAction SilentlyContinue`）していたため、停止失敗を検知できず警告を出しつつ起動ステップへ進行した。
  3. 新たに起動された `server_api.py` は、旧プロセス（PID 29248）がポート 8899 を占有していたため `PermissionError: [WinError 10013]` で即座にクラッシュした（上記ログ）。
  4. `restart_web_manager.bat` の完了判定（ステップ4）は「ポート 8899 が LISTEN しているか」のみをチェックしていたため、**死なずにリッスンし続けていた旧プロセス（PID 29248）を検知して「再起動完了」と誤判定し、ブラウザを開いた**。
  5. 結果として、ユーザーの画面には昨日の古いコード（タブなし、旧UI）がそのまま配信され続けていた。

### 2.3 アプリケーションログ (`logs/app.jsonl`)
- `scripts/inspect_logs.py --summary` および `--tail 5` による確認結果：
  - `[2026-09-10T21:28:58.006+09:00] [INFO ] [backend ] [app.main] Prompt Surgeon API started.`
  - バックエンドサーバー自体は 21:28:58 に正常に起動・動作している。

---

## 3. 再現手順と観測された挙動 (Reproduction Steps)

### 事象 1: Web Manager 再起動の擬似成功と旧プロセス残存
1. `tools/server-manager/restart_web_manager.bat` を実行する。
2. 画面上には「Stopping PID 29248...」「Port did not close within 10s. Attempting start anyway...」「Restart completed successfully.」と表示され、ブラウザで `http://localhost:8899` が開く。
3. **観測挙動**:
   - 再起動が成功したように見えるが、ブラウザに表示される画面は REQ-242 適用前の旧 UI（単一ログ枠、タブなし）のままである。
   - `logs/web_manager.log` に `WinError 10013` が出力され、PID 29248（2026/09/09 21:53:20 起動）が終了していない。

### 事象 2: バッチファイル（`start_servers.bat` 等）からの利用時
1. `tools/server-manager/start_servers.bat` を実行する。
2. **観測挙動**:
   - デスクトップ上に 3 つの黒いターミナルウィンドウ（Backend, Frontend, ComfyUI）が前面に立ち上がって残り続ける。

---

## 4. 影響範囲・該当コード (Affected Area & Source Locations)

| # | 分類 | 対象ファイル | 該当行/箇所 | 詳細 |
|---|---|---|---|---|
| 1 | プロセス終了失敗の隠蔽と誤判定 | `tools/server-manager/restart_web_manager.bat` | L18-L19, L33-L37, L53-L61 | `taskkill` の失敗を黙殺。ポート未解放でも続行し、旧プロセスがポートを占有しているだけで「再起動成功」と誤判定してブラウザを開く。 |
| 2 | バッチ引数の `-Background` 欠落 | `tools/server-manager/start_servers.bat` | L4: `powershell.exe ... -Action start` | `-Background` スイッチが付与されていないため、`server-manager.ps1` の `$Background` が `$false` となり、明示的なウィンドウ起動（`cmd.exe /k`）が実行される。 |
| 3 | トグルバッチの `-Background` 欠落 | `tools/server-manager/toggle_servers.bat` | L4: `powershell.exe ... -Action toggle` | 同上。トグル起動時にウィンドウが立ち上がる。 |
| 4 | レガシー起動スクリプトの conhost 残存 | `tools/server-manager/start_background_all.bat` | L6, L9 | `Start-Process -FilePath 'conhost.exe' ... -WindowStyle Hidden` が残存しており、ウィンドウ非表示化が機能しない。 |

---

## 5. 根本原因の分析 (Root Cause Analysis)

1. **`restart_web_manager.bat` の停止失敗の隠蔽とステータス誤判定 (Primary)**:
   - 管理者権限や別セッションで動作している常駐プロセスに対し、一般ユーザー権限からの `taskkill` が失敗（アクセス拒否）するケースが考慮されていなかった。
   - ポート解放待ち（ステップ2）で解放されなかった場合にも中断せず起動を試行し、ステップ4の生存確認が「旧プロセスのリッスン」に騙されて成功判定を出していたため、ユーザーは再起動が完了したと誤認した。
2. **CLI / バッチのエントリポイントにおけるバックグラウンド指定漏れ (Secondary)**:
   - `server-manager.ps1` の `param([switch]$Background)` は、明示指定がない限り `$false`（ウィンドウ表示モード）が既定値となる。
   - `start_servers.bat` や `toggle_servers.bat` に `-Background` が付与されていないため、デスクトップ上に 3 つのコンソールウィンドウが開く動作がそのまま残っていた。

---

## 6. 原因分類 (Classification)

<diagnostic_check>
- Root_Cause_Isolated: Yes
- Classification: Type_A: Implementation Bug
- Scope_Restriction: Read-only phase. Code modification or fix proposals are strictly PROHIBITED during this turn.
- Route: Direct to /dev-design
</diagnostic_check>

<incident_report>
- **障害分類**: **Type A (Implementation Bug)**
- **判定理由**:
  - 要件の仕様不備ではなく、`restart_web_manager.bat` のプロセス終了失敗ハンドリング・判定ロジックの不備、および既存バッチファイル群の引数指定漏れという実装・スクリプト設計のバグであるため。
</incident_report>

---

## 7. バックログ登録とルーティング提案 (Backlog Registration & Routing)

- **課題名**: `tools/server-manager` restart_web_manager.bat の確実なプロセス停止・判定適正化およびバッチ起動引数のバックグラウンド統一
- **推奨ワークフロー**: `/dev-design`

---

**ユーザー確認事項 (Approval Gate)**:
上記インシデントレポートの内容で合意いただける場合、PBIとしてバックログに登録し、`/dev-design`（設計・実装計画）に進みますか？ (YES / NO)
