@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or is not available in PATH.
  pause
  exit /b 1
)

if not exist "backend\node_modules" (
  echo [ERROR] Backend dependencies are not installed.
  echo Run: cd backend ^&^& npm install
  pause
  exit /b 1
)

if not exist "frontend\node_modules" (
  echo [ERROR] Frontend dependencies are not installed.
  echo Run: cd frontend ^&^& npm install
  pause
  exit /b 1
)

echo Starting GodField Orica test servers...
echo Backend : http://localhost:3001
echo Frontend: http://localhost:5173
echo.
echo Close the two server windows to stop the test servers.

start "GodField Orica - Backend" /D "%~dp0backend" cmd /k node server.js
start "GodField Orica - Frontend" /D "%~dp0frontend" cmd /k npm.cmd run dev -- --host 127.0.0.1

timeout /t 2 /nobreak >nul
start "" "http://localhost:5173"

endlocal
