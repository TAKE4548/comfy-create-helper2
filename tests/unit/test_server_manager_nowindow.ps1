# ProcessStartInfo test for CreateNoWindow and WindowStyle
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "cmd.exe"
$psi.Arguments = "/c exit 0"
$psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
$psi.CreateNoWindow = $true
$psi.UseShellExecute = $false
$proc = [System.Diagnostics.Process]::Start($psi)
if ($null -eq $proc) {
    Write-Error "Process failed to start"
    exit 1
}
$proc.WaitForExit(3000) | Out-Null
Write-Host "Process Start Info test passed. Exit code: $($proc.ExitCode)"