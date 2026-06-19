#!/usr/bin/env python3
"""kres 2026 - all-in-one DISPLAY app (relay + viewer server + kiosk).

Built to a single .exe with build_display_exe.bat, this replaces the Python
install, pip, the relay, the static file server, and every .bat launcher on the
display PC. It is BOTH the setup wizard and the runtime:

  * First run -> a short WIZARD: opens the firewall, shows the LAN IP every
    sender needs (and writes a pre-filled run-sender.bat), and optionally
    installs auto-start on boot. Then it starts the show.
  * Every run after that -> just RUNS THE SHOW: serves viewer/, starts the relay,
    keeps the screen awake, opens the display fullscreen in kiosk mode.

No internet and no Python needed on the display PC. The relay protocol mirrors
relay/server.py.
"""

import argparse
import asyncio
import ctypes
import json
import os
import socket
import subprocess
import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from websockets.asyncio.server import broadcast, serve
from websockets.exceptions import ConnectionClosed

RELAY_PORT = 8765
VIEWER_PORT = 8080
APP_NAME = "kres 2026 display"
IS_WINDOWS = sys.platform == "win32"


def base_dir() -> Path:
    """Folder the exe/script lives in (viewer/ override + config sit next to it)."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent
    return Path(__file__).resolve().parent


def viewer_dir() -> Path:
    """Serve an on-disk viewer/ next to the exe if present (so the art can be
    swapped without rebuilding); otherwise the copy bundled inside the exe."""
    external = base_dir() / "viewer"
    if external.is_dir():
        return external
    return Path(getattr(sys, "_MEIPASS", base_dir())) / "viewer"


CONFIG_MARKER = base_dir() / "kres-display.configured"


# ----------------------------------------------------------------- relay ----
# Same protocol as relay/server.py: senders stream {x,y}; we fan to viewers.
VIEWERS = set()
SENDERS = {}


async def relay_handler(websocket):
    role = None
    sender_id = None
    try:
        async for raw in websocket:
            try:
                msg = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                continue
            if msg.get("type") == "hello":
                role = msg.get("role")
                if role == "viewer":
                    VIEWERS.add(websocket)
                elif role == "sender":
                    sender_id = str(msg.get("id") or f"cursor-{id(websocket)}")
                    SENDERS[websocket] = sender_id
                continue
            if role == "sender":
                x, y = msg.get("x"), msg.get("y")
                if x is None or y is None:
                    continue
                broadcast(VIEWERS, json.dumps({"id": sender_id, "x": x, "y": y}))
    except ConnectionClosed:
        pass
    finally:
        VIEWERS.discard(websocket)
        if websocket in SENDERS:
            sid = SENDERS.pop(websocket)
            broadcast(VIEWERS, json.dumps({"type": "leave", "id": sid}))


async def relay_forever():
    while True:                                  # never let the show die
        try:
            async with serve(relay_handler, "0.0.0.0", RELAY_PORT, ping_interval=20) as server:
                print(f"  relay  listening on ws://0.0.0.0:{RELAY_PORT}")
                await server.serve_forever()
        except Exception as exc:                 # noqa: BLE001
            print(f"  relay  error: {exc!s}; restarting in 3s")
            await asyncio.sleep(3)


# ---------------------------------------------------------- viewer server ----
class _QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):                # keep the console clean
        pass


def serve_viewer():
    directory = str(viewer_dir())
    handler = partial(_QuietHandler, directory=directory)
    while True:                                  # restart on the off chance it dies
        try:
            httpd = ThreadingHTTPServer(("0.0.0.0", VIEWER_PORT), handler)
            print(f"  viewer serving {directory}")
            print(f"         on http://0.0.0.0:{VIEWER_PORT}")
            httpd.serve_forever()
        except Exception as exc:                 # noqa: BLE001
            print(f"  viewer error: {exc!s}; restarting in 3s")
            import time
            time.sleep(3)


# ---------------------------------------------------------------- helpers ----
def lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))               # no packets sent; picks the LAN iface
        return s.getsockname()[0]
    except Exception:
        return socket.gethostbyname(socket.gethostname())
    finally:
        s.close()


def keep_awake():
    """Stop the PC/display sleeping while we run. No admin; auto-reverts on exit."""
    if not IS_WINDOWS:
        return
    ES_CONTINUOUS = 0x80000000
    ES_SYSTEM_REQUIRED = 0x00000001
    ES_DISPLAY_REQUIRED = 0x00000002
    ctypes.windll.kernel32.SetThreadExecutionState(
        ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED)


def is_admin() -> bool:
    if not IS_WINDOWS:
        return True
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def relaunch_as_admin() -> bool:
    """Re-run elevated (UAC prompt), preserving args. False if it couldn't."""
    if getattr(sys, "frozen", False):
        lp_file = sys.executable
        lp_params = subprocess.list2cmdline(sys.argv[1:])
    else:
        lp_file = sys.executable
        lp_params = subprocess.list2cmdline([os.path.abspath(__file__)] + sys.argv[1:])
    rc = ctypes.windll.shell32.ShellExecuteW(None, "runas", lp_file, lp_params, None, 1)
    return int(rc) > 32


def add_firewall_rule() -> bool:
    try:
        subprocess.run(
            ["netsh", "advfirewall", "firewall", "add", "rule",
             "name=kres relay", "dir=in", "action=allow",
             "protocol=TCP", f"localport={RELAY_PORT}"],
            check=True, capture_output=True)
        return True
    except Exception:
        return False


def install_autostart() -> bool:
    """Drop a minimized Startup-folder shortcut that runs us with --run on boot."""
    startup = Path(os.environ["APPDATA"]) / "Microsoft/Windows/Start Menu/Programs/Startup"
    lnk = startup / "kres.lnk"
    if getattr(sys, "frozen", False):
        target, arguments = sys.executable, "--run"
    else:
        target = sys.executable
        arguments = f'"{os.path.abspath(__file__)}" --run'
    ps = (
        f"$s=(New-Object -ComObject WScript.Shell).CreateShortcut('{lnk}');"
        f"$s.TargetPath='{target}';"
        f"$s.Arguments='{arguments}';"
        f"$s.WorkingDirectory='{base_dir()}';"
        f"$s.WindowStyle=7;$s.Save()"
    )
    try:
        subprocess.run(["powershell", "-NoProfile", "-Command", ps],
                       check=True, capture_output=True)
        return True
    except Exception:
        return False


def write_sender_template(ip: str):
    """Write a run-sender.bat pre-filled with this PC's IP, to hand to senders."""
    bat = base_dir() / "run-sender (prefilled).bat"
    body = (
        "@echo off\r\n"
        "REM kres 2026 sender - copy next to cursor-agent.exe on each visitor PC.\r\n"
        'cd /d "%~dp0"\r\n'
        "title kres sender\r\n"
        f"set RELAY={ip}\r\n"
        ":loop\r\n"
        "cursor-agent.exe --host %RELAY%\r\n"
        "timeout /t 3 /nobreak >nul\r\n"
        "goto loop\r\n"
    )
    try:
        bat.write_text(body, encoding="ascii")
        return bat
    except Exception:
        return None


def open_kiosk():
    url = f"http://localhost:{VIEWER_PORT}/"
    if not IS_WINDOWS:
        import webbrowser
        webbrowser.open(url)
        return
    candidates = [
        ["cmd", "/c", "start", "", "msedge", "--kiosk", url,
         "--edge-kiosk-type=fullscreen", "--no-first-run", "--kiosk-idle-timeout-minutes=0"],
        ["cmd", "/c", "start", "", "chrome", "--kiosk", url, "--no-first-run"],
    ]
    for cmd in candidates:
        try:
            subprocess.Popen(cmd)
            return
        except Exception:
            continue
    import webbrowser
    webbrowser.open(url)


# ----------------------------------------------------------------- wizard ----
def wizard():
    print("=" * 58)
    print(f"  {APP_NAME} - first-time setup")
    print("=" * 58)

    if IS_WINDOWS and not is_admin():
        print("\n  One-time setup needs administrator rights (to open the")
        print("  firewall for port 8765). Approve the Windows prompt...")
        if relaunch_as_admin():
            sys.exit(0)                          # the elevated copy takes over
        print("  (Continuing without admin - if senders can't connect later,")
        print("   re-run this as administrator.)")

    print("\n  [1/3] Opening the firewall for the relay (TCP 8765)...")
    print("        " + ("done." if add_firewall_rule()
                        else "could not add the rule (run as administrator if senders can't connect)."))

    ip = lan_ip()
    print("\n  [2/3] This display PC's address on the network:")
    print("        +------------------------------------------+")
    print(f"        |   {ip:<38} |")
    print("        +------------------------------------------+")
    print("        - Every sender must point at this IP.")
    print("        - On the router, RESERVE this IP for this PC (a DHCP")
    print("          reservation) so it never changes mid-show.")
    tmpl = write_sender_template(ip)
    if tmpl:
        print(f"        - Wrote \"{tmpl.name}\" (pre-filled with this IP) next")
        print("          to this app, to copy onto the sender machines.")

    print("\n  [3/3] Auto-start on boot")
    ans = input("        Launch the show automatically when this PC starts? [Y/n] ").strip().lower()
    if ans in ("", "y", "yes"):
        print("        " + ("installed." if install_autostart() else "could not install."))
    else:
        print("        skipped.")

    try:
        CONFIG_MARKER.write_text(ip, encoding="ascii")
    except Exception:
        pass
    print("\n  Setup complete. Starting the show now...")
    input("  Press Enter to go fullscreen (the browser will cover this window). ")


# ------------------------------------------------------------------- show ----
def run_show():
    keep_awake()
    threading.Thread(target=serve_viewer, daemon=True).start()
    open_kiosk()
    print(f"\n  {APP_NAME} is running.")
    print("  Close this window (or Alt+F4 the fullscreen browser) to stop.\n")
    try:
        asyncio.run(relay_forever())
    except KeyboardInterrupt:
        print("\n  Stopped.")


def main():
    parser = argparse.ArgumentParser(description=APP_NAME)
    parser.add_argument("--run", action="store_true",
                        help="skip the wizard and just run the show (used by auto-start)")
    parser.add_argument("--setup", action="store_true", help="force the setup wizard")
    args = parser.parse_args()

    if args.setup:
        wizard()
    elif not args.run and not CONFIG_MARKER.exists():
        wizard()
    run_show()


if __name__ == "__main__":
    main()
