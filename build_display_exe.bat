@echo off
REM ============================================================
REM  Build kres-display.exe - the all-in-one DISPLAY app.
REM  Run this ONCE on a Windows PC with Python 3 + internet.
REM  It bundles Python, websockets, the relay, the viewer server,
REM  the assets, and the kiosk launcher into a single .exe.
REM ============================================================
cd /d "%~dp0"

python --version >nul 2>&1
if errorlevel 1 ( echo  Python 3 is not on PATH. Install it first. & pause & exit /b 1 )

pip install -r relay\requirements.txt pyinstaller
pyinstaller --onefile --name kres-display --add-data "viewer;viewer" display_app.py
if errorlevel 1 ( echo. & echo  Build FAILED - see messages above. & pause & exit /b 1 )

if not exist display-dist mkdir display-dist
copy /y dist\kres-display.exe display-dist\ >nul

echo.
echo  Done.  display-dist\kres-display.exe  is the whole display app.
echo  Copy that one file to the display PC and double-click it:
echo     first run  = setup wizard, then the show
echo     every boot = just runs the show
echo  (Optional: drop a viewer\ folder next to the exe to override the
echo   bundled art without rebuilding.)
pause
