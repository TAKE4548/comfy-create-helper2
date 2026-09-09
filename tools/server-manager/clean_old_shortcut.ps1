$p = Join-Path ([Environment]::GetFolderPath('Startup')) 'PromptSurgeon_AutoStart.lnk'
if (Test-Path $p) {
    Remove-Item $p -Force -ErrorAction SilentlyContinue
    Write-Host "[OK] Cleaned up legacy startup shortcut." -ForegroundColor Yellow
}
