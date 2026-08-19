@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js wurde nicht gefunden.
  echo Installiere Node.js 18 oder neuer und starte diese Datei erneut.
  pause
  exit /b 1
)
for /f "tokens=1 delims=." %%V in ('node -p "process.versions.node"') do set NODE_MAJOR=%%V
if %NODE_MAJOR% LSS 18 (
  echo Node.js 18 oder neuer wird benoetigt. Gefunden:
  node --version
  pause
  exit /b 1
)
node server.js
pause
