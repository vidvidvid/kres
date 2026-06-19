@echo off
REM ============================================================
REM  kres 2026 - SENDER launcher  (run on each visitor PC)
REM  Streams this PC's mouse to the relay as a roaming animal.
REM  Auto-restarts if it ever exits. The cursor's name is this
REM  PC's hostname, so every machine is unique automatically.
REM ============================================================
cd /d "%~dp0"
title kres sender

REM ===== EDIT THIS ONE LINE: the IP of the display/relay PC =====
set RELAY=192.168.1.50
REM =============================================================

:loop
cursor-agent.exe --host %RELAY%
echo.
echo   [sender] exited (code %errorlevel%). Reconnecting in 3s...  Ctrl+C to stop.
timeout /t 3 /nobreak >nul
goto loop
