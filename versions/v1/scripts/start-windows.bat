@echo off
cd /d "%~dp0\.."
call npm run compile
if errorlevel 1 pause & exit /b 1
node src\server\server.mjs --open
if errorlevel 1 pause
