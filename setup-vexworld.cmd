@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo VexWorld needs Node.js 20 or newer.
  echo Install Node.js LTS, then double-click this file again.
  echo https://nodejs.org/
  echo.
  pause
  exit /b 1
)
node scripts\vexworld-launch.mjs setup
if errorlevel 1 pause
