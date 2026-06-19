#!/usr/bin/env python3
"""Cursor-canvas sender agent.

Reads this machine's system cursor position, normalizes it to 0..1 (so screen
resolution doesn't matter), and streams it to the relay over a WebSocket.
Built for Windows (the installation); also runs on macOS/Linux for testing.

Usage:
    python cursor_agent.py --host 192.168.1.50 --id station-1
"""

import argparse
import asyncio
import json
import os
import socket
import sys

from pynput.mouse import Controller
from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed


def get_screen_size(override=None):
    """Return (width, height) of the primary screen, DPI-aware on Windows.

    `override` ("1920x1080") wins if given. On Windows we use the Win32 API
    (the installation's real path). Elsewhere we try a few dev fallbacks and,
    failing all, default to 1920x1080 with a warning rather than crashing.
    """
    if override:
        w, h = override.lower().split("x")
        return int(w), int(h)

    if sys.platform == "win32":
        import ctypes
        # Report true pixel coordinates even under display scaling (e.g. 150%).
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(2)   # per-monitor v2
        except Exception:
            try:
                ctypes.windll.user32.SetProcessDPIAware()
            except Exception:
                pass
        user32 = ctypes.windll.user32
        return user32.GetSystemMetrics(0), user32.GetSystemMetrics(1)

    # Dev fallbacks (macOS/Linux), best-effort.
    try:
        import tkinter
        root = tkinter.Tk()
        root.withdraw()
        size = (root.winfo_screenwidth(), root.winfo_screenheight())
        root.destroy()
        return size
    except Exception:
        pass
    try:
        from AppKit import NSScreen          # macOS, if pyobjc is present
        frame = NSScreen.mainScreen().frame()
        return int(frame.size.width), int(frame.size.height)
    except Exception:
        pass

    print("Could not detect screen size; defaulting to 1920x1080 "
          "(override with --screen WxH).")
    return 1920, 1080


async def stream(uri, cursor_id, interval, screen):
    mouse = Controller()
    width, height = get_screen_size(screen)
    async with connect(uri, ping_interval=20) as ws:
        await ws.send(json.dumps({"type": "hello", "role": "sender", "id": cursor_id}))
        print(f"Connected to {uri} as '{cursor_id}' (screen {width}x{height})")
        last = None
        while True:
            x, y = mouse.position
            nx = min(max(x / width, 0.0), 1.0)
            ny = min(max(y / height, 0.0), 1.0)
            pos = (round(nx, 4), round(ny, 4))
            if pos != last:                       # don't resend an unchanged position
                await ws.send(json.dumps({"x": pos[0], "y": pos[1]}))
                last = pos
            await asyncio.sleep(interval)


async def run(host, port, cursor_id, fps, screen):
    uri = f"ws://{host}:{port}"
    interval = 1.0 / fps
    while True:                                   # auto-reconnect: installations self-heal
        try:
            await stream(uri, cursor_id, interval, screen)
        except (OSError, ConnectionClosed) as exc:
            print(f"Disconnected ({exc!s}); retrying in 2s...")
            await asyncio.sleep(2)


def main():
    parser = argparse.ArgumentParser(description="Cursor-canvas sender agent")
    parser.add_argument("--host", default=os.environ.get("CURSOR_RELAY_HOST", "localhost"),
                        help="Relay IP, e.g. 192.168.1.50 (or set CURSOR_RELAY_HOST)")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--id", default=socket.gethostname(),
                        help="Cursor name (default: this machine's hostname)")
    parser.add_argument("--fps", type=int, default=60, help="Updates per second (default 60)")
    parser.add_argument("--screen", default=os.environ.get("CURSOR_SCREEN"),
                        help="Force screen size, e.g. 1920x1080 (skips auto-detect)")
    args = parser.parse_args()
    try:
        asyncio.run(run(args.host, args.port, args.id, args.fps, args.screen))
    except KeyboardInterrupt:
        print("\nSender stopped.")


if __name__ == "__main__":
    main()
