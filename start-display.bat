@echo off
REM ============================================================
REM  kres 2026 - DISPLAY + RELAY launcher  (run on the screen PC)
REM  Starts the relay, serves the viewer, opens it fullscreen.
REM  Double-click this (or let it auto-start) and walk away.
REM ============================================================
cd /d "%~dp0"
title kres 2026 - display

REM --- keep the screen awake: no sleep, no screensaver ---
powercfg /change monitor-timeout-ac 0  >nul 2>&1
powercfg /change standby-timeout-ac 0  >nul 2>&1
powercfg /change disk-timeout-ac 0     >nul 2>&1
reg add "HKCU\Control Panel\Desktop" /v ScreenSaveActive /t REG_SZ /d 0 /f >nul 2>&1

REM --- relay + viewer, each in its own auto-restarting window ---
start "kres relay"  cmd /k "%~dp0_run-relay.bat"
start "kres viewer" cmd /k "%~dp0_run-viewer.bat"

REM --- give them a moment, then open the display fullscreen ---
timeout /t 4 /nobreak >nul
start "" msedge --kiosk "http://localhost:8080/" --edge-kiosk-type=fullscreen --no-first-run --kiosk-idle-timeout-minutes=0

echo.
echo   kres display is up.
echo   - relay + viewer run in their own windows (they auto-restart)
echo   - browser is in kiosk fullscreen; press Alt+F4 there to exit
echo   This window can be closed; the others keep running.
