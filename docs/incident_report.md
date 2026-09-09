# インシデントレポート: Web UI（ポート 8899）からのサービス停止・再起動の不安定性に関する調査報告

## 1. 事象概要 (Overview)

Prompt Surgeon の Web 管理ツール（`tools/server-manager/server_api.py` / ポート 8899）において、Web 画面から個別サービス（Frontend, Backend）や全サービスの停止・再起動を実行した際に、操作が反映されない、プロセスが起動しない、あるいは再起動ループに陥るといった不安定な挙動が報告された。

ソースコード（`server_api.py`、`server-manager.ps1`、`config.json`）の静的解析および実機ログの調査を行った結果、**5 点の不整合・設計上のボトルネック** が相互に連鎖して不安定性を引き起こしていることが判明した。

---

## 2. 観測ログおよび再現挙動 (Observed Symptoms & Log Citations)

### アプリケーションログ確認 (`logs/app.jsonl`):
- `scripts/inspect_logs.py --summary` および `--errors --tail 10` を実行して確認。
- バックエンド稼働時において、ComfyUI や外部連携に関するタイムアウト・接続エラーが記録されている：
  - `[2026-09-09T22:40:17.416+09:00]` `[ERROR]` `[backend]` `[app.routers.comfy]` `Failed to proxy prompt to ComfyUI: Connection timed out`
  - `[2026-09-09T22:40:46.637+09:00]` `[ERROR]` `[backend]` `[app.routers.comfy]` `Failed to proxy prompt to ComfyUI: Read timed out`
  - `[2026-09-09T22:41:45.848+09:00]` `[ERROR]` `[backend]` `[app.routers.loras]` `Failed to fetch ComfyUI LoRA models from fallback: Connection failed`
- これらのログは、ComfyUI プロセスの停止・再起動が不完全な状態のままバックエンドが疎通を試みた際に生じた接続断を示唆している。

### 再現手順と観測された挙動:
1. **個別サービスの停止・再起動が無視される**:
   - Web 画面（http://localhost:8899）を開き、`React FE` または `Win BE` のカード内にある「停止」または「再起動」ボタンをクリックする。
   - `triggerAction('stop', 'fe')` や `triggerAction('reboot-service', 'be')` が送信されるが、PowerShell 側の switch 文で引数が一致せず、処理がスキップまたは「Unknown service: fe」と返却され、実際のプロセスは何ら停止・再起動されない。
2. **全体再起動を実行するとサービスが停止したままになる（Race Condition）**:
   - 「全サービス再起動」をクリックする。
   - 既存プロセスへの `taskkill` 発行後、ポートが完全にクローズ（ソケット解放）される前に `Start-BackendProcess` / `Start-FrontendProcess` の二重起動防止チェック（`Test-PortOpen`）が走り、「すでに起動中」と誤認して起動がスキップされる。直後に旧プロセスが完全に消滅するため、結果としてサービスが死んだままになる。
3. **ボタン連打による多重実行・ブロッキング**:
   - 再起動や起動中は PowerShell 側で `Wait-For-Service`（10〜30秒超）が走る。
   - `server_api.py` がシングルスレッドの `TCPServer` かつ `subprocess.run` による同期ブロッキングであるため、HTTP サーバー全体が停止する。
   - UI にボタンの非活性化（disabled）制御がないため、反応がないと感じてボタンを複数回クリックすると、リクエストがバックログに滞留し、先行処理の完了直後に後続の停止・起動リクエストが連続実行されて再起動ループ・プロセス不整合が発生する。
4. **バックグラウンド実行時のウィンドウ生成ハング**:
   - `server_api.py` から PowerShell を呼ぶ際に `-Background` スイッチが付与されないため、PowerShell は `cmd.exe /k title ...` でコンソールウィンドウを対話的に立ち上げようとする。
   - バックグラウンド実行環境（タスクスケジューラや `wscript` 経由）では、コンソール生成権限の不足によりフリーズまたは失敗する。
5. **WSL2 ComfyUI の停止処理によるホストプロキシ破損**:
   - `Stop-ComfyUIProcess` 内の `pkill -f 'python.*main.py.*8188'` は、`config.json` の起動引数に `8188` が含まれていないためヒットしない。
   - さらに、Windows 側のポート 8188 を拾って `Stop-PortProcesses`（`taskkill /PID $p /T /F`）を実行するため、WSL2 のポートフォワーディングを担う Windows ホスト側プロセス（`wslhost.exe` 等）が強制終了され、WSL とのポート通信が断絶する。

---

## 3. 影響範囲・該当コード (Affected Area & Source Locations)

| # | 分類 | 対象ファイル | 該当行/箇所 | 詳細 |
|---|---|---|---|---|
| 1 | サービス識別子不一致 | `tools/server-manager/server_api.py`<br>`tools/server-manager/server-manager.ps1` | `server_api.py:L200-L219`<br>`server-manager.ps1:L423-L448, L526-L530, L537-L541` | UI 側はステータスキー名 `fe`, `be`, `comfy` を引数として渡すが、PowerShell 側の switch 文は `"frontend"`, `"backend"`, `"comfy"` の完全一致を要求しているため、個別制御が機能しない。 |
| 2 | 同期ブロッキングと競合 | `tools/server-manager/server_api.py` | `server_api.py:L222-L236, L314, L340` | `TCPServer` がシングルスレッドで `subprocess.run` を同期実行するため、10〜30秒以上の待機中にサーバーが完全にブロック。UI 側にボタン二重送信防止がなく、定期ポーリング（5秒毎）も滞留して多重実行・連打障害が発生する。 |
| 3 | ポート解放待ち抜け | `tools/server-manager/server-manager.ps1` | `server-manager.ps1:L399-L404, L551-L554` | `Stop-AllServices` 内で Backend / Frontend の `Wait-For-Port-Closed` を行わず、`restart` 時も 1 秒スリープのみで起動へ進む。`Start-BackendProcess` 等の `Test-PortOpen` で「起動中」と誤判定されて起動がスキップされ、停止したままになる。 |
| 4 | -Background 欠落 | `tools/server-manager/server_api.py` | `server_api.py:L311-L314` | Web API からの PowerShell 呼び出し時に `-Background` スイッチを渡していないため、非対話環境でも常にウィンドウポップアップ起動を試行し、実行権限やセッションの違いで起動がハングする。 |
| 5 | ComfyUI 停止とプロキシ破損 | `tools/server-manager/server-manager.ps1`<br>`tools/server-manager/config.json` | `server-manager.ps1:L322, L340`<br>`config.json:L10` | `config.json` の起動コマンドに `8188` が含まれず `pkill` の正規表現に不一致。また `Stop-PortProcesses` で Windows 側の WSL プロキシプロセスを `taskkill` してしまい、ポート転送が破損する。 |

---

## 4. 根本原因の分析 (Root Cause Analysis)

1. **インターフェース規約の不整合 (API Contract Mismatch)**:
   - `Get-StatusObject` は JSON キーとして短縮名（`fe`, `be`, `comfy`）を出力しているが、CLI アクション引数の switch 文はフルスペル（`frontend`, `backend`, `comfy`）のみを受け付ける設計になっており、相互のマッピング層が存在しない。
2. **Web サーバーの同期ブロッキングモデルと UI 非同期性の欠如**:
   - `socketserver.TCPServer` は直列リクエスト処理を行う。PowerShell スクリプトはポート開放待機（`Wait-For-Port`）を含む重いバッチ処理であるにもかかわらず、HTTP リクエストハンドラ内で直接 `subprocess.run` を同期待ちしている。
   - フロントエンド側ではローディング表示やボタンの disabled 制御が行われておらず、かつ 5 秒ごとの自動ポーリングが走り続けるため、バックログ滞留と競合が必然的に発生する。
3. **プロセス終了と起動の非同期競合 (Process Termination Race Condition)**:
   - `taskkill` によるプロセス終了シグナル送信から、OS によるソケット・リソース完全解放までの間には時間差（TIME_WAIT / 遅延クローズ）が存在する。
   - `Stop-AllServices` および `restart` においてクローズ完了を待機しないため、直後の二重起動防止チェック（`Test-PortOpen`）が誤反応し、起動処理が脱落する。
4. **実行コンテキスト（ヘッドレス / デスクトップ）の考慮漏れ**:
   - Web サーバー経由での起動は本質的にバックグラウンド実行（ヘッドレス）であるべきだが、スクリプト呼び出し側に `-Background` を付与するルールが欠落していた。
5. **WSL2 Mirrored ネットワークに対する Windows 側プロセスキル誤爆**:
   - WSL2 環境下では、Windows 側のポート 8188 は WSL 仮想マシンのプロキシ（`wslhost.exe` 等）がリッスンしている。
   - Windows 側の `Get-NetTCPConnection` で取得した PID に対し不用意に `taskkill` を実行すると、WSL ネットワーク仲介プロセスが道連れとなり通信障害を引き起こす。

---

## 5. 原因分類 (Classification)

<diagnostic_check>
- Root_Cause_Isolated: Yes
- Classification: Type_A: Implementation Bug
- Scope_Restriction: Read-only phase. Code modification or fix proposals are strictly PROHIBITED during this turn.
- Route: Direct to /dev-design
</diagnostic_check>

<incident_report>
- **障害分類**: **Type A (Implementation Bug)**
- **判定理由**:
  - 新たな機能仕様の追加やシステム要件の変更ではなく、既存の Web UI 管理機能（起動・停止・再起動）における引数マッピングミス、ポート解放待ち抜け、サーバー同期処理のブロッキング、WSL プロキシへの誤爆といった実装上の不備および競合（Race Condition）に起因するため。
</incident_report>

---

## 6. 推奨される改修方針 (Recommended Fix Strategy)

1. **サービス名の正規化**:
   - `server-manager.ps1` 側の switch 文（`start`, `stop`, `reboot-service`, `Restart-ServiceByName`）において、`"fe" | "frontend"`, `"be" | "backend"`, `"comfy" | "wsl"` を等価に受け付けるよう改修する。
2. **Web API 呼び出し時の `-Background` 自動付与**:
   - `server_api.py` の `do_POST` 内で、アクションが `start`, `restart`, `reboot-service` の場合は常に `-Background` フラグをコマンド引数に追加する。
3. **確実なポートクローズ待機 (Wait-For-Port-Closed)**:
   - `Stop-AllServices` 内で Backend（ポート 8000）および Frontend（ポート 5173）に対しても `Wait-For-Port-Closed` を実行してから次の処理に進むようにする。
4. **UI 操作中ロックと HTTP サーバーの非同期化 / スレッド化**:
   - `server_api.py` を `socketserver.ThreadingMixIn` 等を用いてマルチスレッド化し、重いアクション実行中であってもステータス取得 GET リクエストがブロックされないようにする。
   - フロントエンド（HTML/JS）において、`triggerAction` 実行中はすべての操作ボタンを `disabled` にし、ローディング表示を行うことで二重送信を防止する。
5. **WSL2 ComfyUI 停止処理の適正化**:
   - `pkill` の対象パターンを修正し、また Windows 側からポート 8188 の所有プロセス（WSL プロキシ）を誤って `taskkill` しないよう保護処理を入れる。

---

## 7. バックログ登録とルーティング提案 (Backlog Registration & Routing)

- **課題名**: `tools/server-manager` Web UI および PowerShell スクリプトにおける停止・再起動の不整合および競合バグの解消
- **推奨ワークフロー**: `/dev-design`

---

**ユーザー確認事項 (Approval Gate)**:
上記インシデントレポートの内容で合意いただける場合、PBIとしてバックログに登録し、`/dev-design`（設計・実装計画）に進みますか？ (YES / NO)

