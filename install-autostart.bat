@echo off
REM ============================================================
REM  Adds THIS folder's launcher to Windows startup, so the app
REM  runs automatically on boot/login. Auto-detects the role:
REM    - folder has start-display.bat  -> display PC
REM    - folder has cursor-agent.exe   -> sender PC
REM ============================================================
cd /d "%~dp0"

set "TARGET="
if exist "%~dp0cursor-agent.exe"  set "TARGET=%~dp0run-sender.bat"
if exist "%~dp0start-display.bat" set "TARGET=%~dp0start-display.bat"

if not defined TARGET (
  echo  No launcher found in this folder.
  echo  Put this file next to start-display.bat ^(display PC^)
  echo  or next to cursor-agent.exe ^(sender PC^), then run it again.
  pause & exit /b 1
)

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('%STARTUP%\kres.lnk'); $s.TargetPath='%TARGET%'; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.Save()"

echo.
echo  Auto-start installed for:
echo     %TARGET%
echo  It will launch on the next login/boot.
echo  To undo, delete this file:
echo     %STARTUP%\kres.lnk
pause
