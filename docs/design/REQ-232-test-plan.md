# REQ-232 実行可能テスト計画

## 1. 自動テスト (CLI Verification)

PowerShell CLI から各ディストリビューション指定パターンおよび未指定時の動作を機械的・定量的に検証する。

### 1-1. 構文テスト
```powershell
powershell.exe -Command "$syn = Get-Command -Syntax tools/server-manager/server-manager.ps1; $valid = ($syn -match '-Action') -and ($syn -match '-Service'); Write-Output $valid; if (-not $valid) { exit 1 }"
```
- **期待値**: 
  - Exit Code: `0`
  - stdout: `True`（`-Action` および `-Service` 引数定義の存在を検証）

### 1-2. AC-1: 未指定（空文字 `""`）時のデフォルトディストリビューション利用テスト
```powershell
powershell.exe -Command "$cfg = Get-Content tools/server-manager/config.json | ConvertFrom-Json; $cfg.wsl.distro = ''; $cfg | ConvertTo-Json -Depth 5 | Set-Content tools/server-manager/config.json -Encoding UTF8; $res = powershell.exe -ExecutionPolicy Bypass -File tools/server-manager/server-manager.ps1 -Action status -Json | ConvertFrom-Json; $ok = ($res.comfy.port -eq 8188) -and ($res.comfy.status -in @('LISTEN', 'STOPPED')); Write-Output $ok; if (-not $ok) { exit 1 }"
```
- **期待値**:
  - Exit Code: `0`
  - stdout: `True`（JSON 出力において `comfy.port` が 8188、`status` が LISTEN または STOPPED であること）

### 1-3. AC-2: 明示的ディストリビューション指定（`"Ubuntu-24.04"`）時のテスト
```powershell
powershell.exe -Command "$cfg = Get-Content tools/server-manager/config.json | ConvertFrom-Json; $cfg.wsl.distro = 'Ubuntu-24.04'; $cfg | ConvertTo-Json -Depth 5 | Set-Content tools/server-manager/config.json -Encoding UTF8; $res = powershell.exe -ExecutionPolicy Bypass -File tools/server-manager/server-manager.ps1 -Action status -Json | ConvertFrom-Json; $ok = ($res.comfy.port -eq 8188) -and ($res.comfy.status -in @('LISTEN', 'STOPPED')); Write-Output $ok; if (-not $ok) { exit 1 }"
```
- **期待値**:
  - Exit Code: `0`
  - stdout: `True`（明示的に指定したディストリビューション設定下で正常に status が取得できること）

### 1-4. AC-3 & Red Teaming: 存在しないディストリビューション指定時のエラー検知テスト
```powershell
powershell.exe -Command "$cfg = Get-Content tools/server-manager/config.json | ConvertFrom-Json; $cfg.wsl.distro = 'NonExistentDistroXYZ'; $cfg | ConvertTo-Json -Depth 5 | Set-Content tools/server-manager/config.json -Encoding UTF8; $out = powershell.exe -ExecutionPolicy Bypass -File tools/server-manager/server-manager.ps1 -Action start -Service comfy 2>&1 | Out-String; $hasErr = ($out -match 'was not found or is unavailable') -and ($out -match 'wsl -l -v'); Write-Output $hasErr; if (-not $hasErr) { exit 1 }"
```
- **期待値**:
  - Exit Code: `0`
  - stdout: `True`（エラーメッセージに `was not found or is unavailable` およびガイダンス `wsl -l -v` が含まれていること）

---

## 2. 結合・復元テスト (Teardown & Cleanup)
テスト完了後、`config.json` の `distro` を空文字 `""`（デフォルトディストリビューション使用）に設定し、正常な状態を維持する。

```powershell
powershell.exe -Command "$cfg = Get-Content tools/server-manager/config.json | ConvertFrom-Json; $cfg.wsl.distro = ''; $cfg | ConvertTo-Json -Depth 5 | Set-Content tools/server-manager/config.json -Encoding UTF8"
```
