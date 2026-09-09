@echo off
title Prompt Surgeon - Server Manager Menu
cd /d "%~dp0"
powershell.exe -ExecutionPolicy Bypass -File "%~dp0server-manager.ps1" -Action menu
