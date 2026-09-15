@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo [Comfy Create Helper] Frontend Build Script
echo ========================================================

cd /d %~dp0\..\frontend
if not exist package.json (
    echo [ERROR] frontend\package.json not found!
    exit /b 1
)

echo [1/2] Installing dependencies if needed...
if not exist node_modules (
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        exit /b 1
    )
)

echo [2/2] Building frontend (Vite)...
call npx vite build
if errorlevel 1 (
    echo [ERROR] Vite build failed.
    exit /b 1
)

echo ========================================================
echo [SUCCESS] Frontend build completed successfully!
echo Distribution output: frontend\dist
echo.
echo You can now start the single-process server:
echo   cd backend
echo   .venv\Scripts\activate
echo   uvicorn app.main:app --port 8000
echo.
echo Open in browser: http://localhost:8000
echo ========================================================

endlocal
