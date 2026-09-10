@echo off
setlocal
cd /d "%~dp0"
node scripts\vexworld-selfplay.mjs --headed
if errorlevel 1 pause
endlocal
