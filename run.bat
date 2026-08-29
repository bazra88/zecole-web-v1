@echo off
setlocal
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo [ZECOLE] Node.js and npm are required.
  echo Download Node.js from https://nodejs.org/ and try again.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [ZECOLE] Installing dependencies...
  call npm install
  if errorlevel 1 goto :error
)

echo [ZECOLE] Starting the development server...
echo [ZECOLE] Open http://localhost:3000 in your browser.
call npm run dev
if errorlevel 1 goto :error
exit /b 0

:error
echo.
echo [ZECOLE] Installation or startup failed.
pause
exit /b 1
