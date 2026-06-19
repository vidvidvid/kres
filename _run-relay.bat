@echo off
REM Helper: runs the relay and restarts it if it ever exits. Launched by start-display.bat.
cd /d "%~dp0"
title kres relay
:loop
python relay\server.py
echo.
echo   [relay] exited (code %errorlevel%). Restarting in 3s...  Ctrl+C to stop.
timeout /t 3 /nobreak >nul
goto loop
