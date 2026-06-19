#!/usr/bin/env python3
"""Spawn fake networked cursors so you can develop the viewer without any
Windows machines. Each fake cursor drifts on its own orbit, so you can move
your real mouse (the mother cursor) and click the sprites to test the glow.

Usage:
    python tools/demo_senders.py --host localhost --count 6
"""

import argparse
import asyncio
import json
import math

from websockets.asyncio.client import connect


async def fake_cursor(uri, index, count):
    # spread the orbits around the screen so sprites don't overlap
    cx = 0.25 + 0.5 * ((index + 0.5) / count)
    cy = 0.35 + 0.15 * math.sin(index * 1.7)
    rx, ry = 0.12 + 0.05 * (index % 3), 0.10 + 0.04 * (index % 2)
    speed = 0.6 + 0.25 * (index % 4)
    phase = index * 0.9
    t = 0.0
    async with connect(uri, ping_interval=20) as ws:
        await ws.send(json.dumps({"type": "hello", "role": "sender", "id": f"demo-{index + 1}"}))
        while True:
            x = cx + rx * math.cos(t * speed + phase)
            y = cy + ry * math.sin(t * speed * 1.3 + phase)
            await ws.send(json.dumps({"x": round(x, 4), "y": round(y, 4)}))
            t += 0.05
            await asyncio.sleep(1 / 30)


async def main():
    p = argparse.ArgumentParser(description="Fake cursors for viewer development")
    p.add_argument("--host", default="localhost")
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("-c", "--count", type=int, default=6)
    args = p.parse_args()
    uri = f"ws://{args.host}:{args.port}"
    print(f"Spawning {args.count} demo cursors -> {uri} (Ctrl+C to stop)")
    await asyncio.gather(*(fake_cursor(uri, i, args.count) for i in range(args.count)))


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nDemo stopped.")
