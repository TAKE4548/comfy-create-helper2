@echo off
cd /d "%~dp0"
set "PY_EXE=%~dp0..\..\backend\.venv\Scripts\python.exe"
if not exist "%PY_EXE%" (
    set "PY_EXE=python.exe"
)
"%PY_EXE%" server_api.py
