@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo VexWorld needs Node.js 20 or newer. Run setup-vexworld.cmd after installing Node.js LTS.
  pause
  exit /b 1
)
node scripts\vexworld-launch.mjs lan
if errorlevel 1 pause
