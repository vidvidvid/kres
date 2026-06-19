@echo off
REM Helper: serves the viewer page and restarts it if it ever exits. Launched by start-display.bat.
cd /d "%~dp0viewer"
title kres viewer
:loop
python -m http.server 8080
echo.
echo   [viewer] exited (code %errorlevel%). Restarting in 3s...  Ctrl+C to stop.
timeout /t 3 /nobreak >nul
goto loop
