@echo off
cd /d "%~dp0"
if exist ".venv\Scripts\activate.bat" (
    call .venv\Scripts\activate.bat
)
set ARGS=%*
if "%ARGS%"=="" set ARGS=--host 0.0.0.0 --port 8000
python -m uvicorn app.main:app %ARGS%
