@echo off
REM ============================================================
REM  kres 2026 - build EVERYTHING (run once on a Windows PC).
REM  Produces a deploy\ folder with both apps. After this, none
REM  of the show machines need Python - it's baked into the .exe.
REM ============================================================
cd /d "%~dp0"
title kres 2026 - build

python --version >nul 2>&1
if errorlevel 1 (
  echo.
  echo  Python is not installed on this PC ^(you need it once, just to build^).
  echo.
  echo    1^) Install Python 3 from the page that's about to open.
  echo       IMPORTANT: on the first screen, TICK "Add python.exe to PATH".
  echo    2^) Then double-click this file again.
  echo.
  start "" https://www.python.org/downloads/
  pause & exit /b 1
)

echo  Installing build tools ^(needs internet, one time^)...
python -m pip install -r relay\requirements.txt -r sender\requirements.txt pyinstaller
if errorlevel 1 ( echo. & echo  Install failed - see messages above. & pause & exit /b 1 )

echo.
echo  === Building the DISPLAY app (kres-display.exe) ===
python -m PyInstaller --onefile --name kres-display --add-data "viewer;viewer" display_app.py
if not exist "dist\kres-display.exe" ( echo. & echo  Display build failed - see messages above. & pause & exit /b 1 )

echo.
echo  === Building the SENDER app (cursor-agent.exe) ===
pushd sender
python -m PyInstaller --onefile --name cursor-agent cursor_agent.py
popd
if not exist "sender\dist\cursor-agent.exe" ( echo. & echo  Sender build failed - see messages above. & pause & exit /b 1 )

echo.
echo  === Assembling the deploy\ folder ===
if exist deploy rmdir /s /q deploy
mkdir deploy\display
mkdir deploy\sender
copy /y dist\kres-display.exe         deploy\display\ >nul
copy /y sender\dist\cursor-agent.exe  deploy\sender\  >nul
copy /y sender\run-sender.bat         deploy\sender\  >nul
copy /y install-autostart.bat         deploy\sender\  >nul

echo.
echo  DONE. Your apps are in this folder:
echo     %~dp0deploy
echo        display\kres-display.exe   -^>  the display PC (double-click it)
echo        sender\                    -^>  each visitor PC
echo  No machine needs Python after this.
echo.
echo  (Opening the deploy folder for you...)
start "" explorer "%~dp0deploy"
pause
