@echo off
REM Build cursor-agent.exe -- run this ON a Windows machine (not on the Mac).
REM Requires Python 3.10+ installed and on PATH.

pip install -r requirements.txt pyinstaller
pyinstaller --onefile --name cursor-agent cursor_agent.py

REM Assemble a ready-to-copy sender folder in dist\
copy /y run-sender.bat           dist\ >nul
copy /y ..\install-autostart.bat dist\ >nul

echo.
echo Done. The folder  dist\  now contains everything a visitor PC needs:
echo     cursor-agent.exe + run-sender.bat + install-autostart.bat
echo Copy the whole dist\ folder to each machine, then on each one:
echo     1) edit run-sender.bat  -^>  set RELAY to the display PC's IP
echo     2) double-click install-autostart.bat   (auto-start on boot)
echo     3) double-click run-sender.bat           (start it now)
pause
