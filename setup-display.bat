@echo off
REM ============================================================
REM  Run this ONCE on the display PC, while it still has internet.
REM  Installs the relay's only Python dependency (websockets).
REM  After this, the whole installation runs fully offline.
REM ============================================================
cd /d "%~dp0"

python --version >nul 2>&1
if errorlevel 1 (
  echo  Python 3 is not installed or not on PATH.
  echo  Install it from https://www.python.org/downloads/  ^(tick "Add to PATH"^),
  echo  then run this again.
  pause & exit /b 1
)

echo  Installing relay dependencies...
python -m pip install -r relay\requirements.txt
if errorlevel 1 ( echo. & echo  Install FAILED - check the messages above. & pause & exit /b 1 )

echo  Allowing the relay through the Windows firewall (TCP 8765)...
netsh advfirewall firewall add rule name="kres relay" dir=in action=allow protocol=TCP localport=8765 >nul 2>&1
if errorlevel 1 echo   ^(Could not add the firewall rule. If senders can't connect, re-run this as Administrator.^)

echo.
echo  Done. From here on you can run start-display.bat with no internet.
pause
