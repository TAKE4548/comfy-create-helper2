Option Explicit
Dim WshShell, fso, scriptDir, webCmd, psCmd

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir

If Not fso.FolderExists(scriptDir & "\logs") Then
    fso.CreateFolder(scriptDir & "\logs")
End If

webCmd = "cmd.exe /c run_web_manager.bat > logs\web_manager.log 2>&1"
WshShell.Run webCmd, 0, False

psCmd = "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & scriptDir & "\server-manager.ps1"" -Action start -Background"
WshShell.Run psCmd, 0, False

Set WshShell = Nothing
Set fso = Nothing
