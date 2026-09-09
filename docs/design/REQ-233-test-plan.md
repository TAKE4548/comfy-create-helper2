# REQ-233 実行可能テスト計画

## 1. 自動・スクリプト検証 (CLI Verification)

### 1.1 設定ファイルスキーマ & デシリアライズ検証
- **コマンド**:
  ```powershell
  powershell -Command "$c = Get-Content tools/server-manager/config.json -Raw -Encoding UTF8 | ConvertFrom-Json; if ($c.wsl.wait_timeout_sec -ge 30 -and $c.wsl.retry_count -ge 3 -and $c.port_wait.default_timeout_sec) { Write-Host 'CONFIG_SCHEMA_PASS' } else { throw 'CONFIG_SCHEMA_FAIL' }"
  ```
- **期待値**: `CONFIG_SCHEMA_PASS` が出力されること。

### 1.2 設定解決ヘルパー (`Get-ServiceWaitConfig`) のフォールバック検証
- **コマンド**:
  ```powershell
  powershell -Command "& { . ./tools/server-manager/server-manager.ps1; $wc = Get-ServiceWaitConfig 'wsl'; if ($wc.timeoutSec -eq 30 -and $wc.retryCount -eq 3) { Write-Host 'WSL_CONFIG_PASS' } else { throw 'WSL_CONFIG_FAIL' }; $bc = Get-ServiceWaitConfig 'backend'; if ($bc.timeoutSec -eq 15) { Write-Host 'BACKEND_CONFIG_PASS' } else { throw 'BACKEND_CONFIG_FAIL' } }"
  ```
- **期待値**: `WSL_CONFIG_PASS` および `BACKEND_CONFIG_PASS` が出力されること。

### 1.3 `Wait-For-Port` のリトライ動作・警告表示検証
- **コマンド**:
  ```powershell
  powershell -Command "& { . ./tools/server-manager/server-manager.ps1; $sw = [System.Diagnostics.Stopwatch]::StartNew(); $res = Wait-For-Port -port 59999 -timeoutSec 2 -retryCount 2 -retryIntervalSec 1 -serviceName 'MockTest'; $sw.Stop(); if (-not $res -and $sw.ElapsedMilliseconds -ge 5000) { Write-Host 'RETRY_LOGIC_PASS' } else { throw 'RETRY_LOGIC_FAIL' } }"
  ```
- **期待値**: 未使用ポート `59999` に対して 2回リトライ（計3試行、合計5秒以上）が実行され、最終的に `$false` を返却し `RETRY_LOGIC_PASS` が出力されること。

---

## 2. 結合・E2E検証 (Integration & E2E Verification)

### 2.1 ステータス取得とWeb API互換性確認
- **コマンド**:
  ```powershell
  powershell -ExecutionPolicy Bypass -File tools/server-manager/server-manager.ps1 -Action status -Json
  ```
- **期待値**: 有効な JSON 形式で `fe`, `be`, `comfy` のステータスが返却されること（JSONパースエラーやスクリプトエラーが発生しないこと）。

### 2.2 Red Teaming (境界値・異常系検証)
- **シナリオ**:
  1. `config.json` から `wait_timeout_sec` や `retry_count` プロパティを意図的に削除した状態（後方互換性テスト）で `Get-ServiceWaitConfig` を呼び出し、スクリプトが例外なく安全なデフォルト値（WSL: 30s/3回, 他: 15s/2回）へフォールバックすることを確認する。
  2. 不正な値（0 または負の値）が設定されていた場合でも、最低安全値（1秒以上、リトライ0回以上）にクランプされてクラッシュしないことを確認する。

---

## 3. ツール主導監査 (Tool-Driven Audit)
- **コマンド**:
  ```powershell
  python ${GLOBAL_SCRIPTS}\artifact_linter.py docs/design
  ```
- **期待値**: 成果物のフォーマットおよびリンク検証で違反が検出されないこと。
