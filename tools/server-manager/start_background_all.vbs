' start_background_all.vbs - Silent Launcher for Prompt Surgeon Services & Web Manager
Option Explicit

Dim WshShell, fso, scriptDir, cmdWeb, cmdServices

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

If Not fso.FolderExists(scriptDir & "\logs") Then
    fso.CreateFolder(scriptDir & "\logs")
End If

cmdWeb = "cmd.exe /c """"" & scriptDir & "\run_web_manager.bat"" > """ & scriptDir & "\logs\web_manager.log"" 2>&1"""
WshShell.Run cmdWeb, 0, False

cmdServices = "powershell.exe -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & scriptDir & "\server-manager.ps1"" -Action start -Background"
WshShell.Run cmdServices, 0, False

Set WshShell = Nothing
Set fso = Nothing
