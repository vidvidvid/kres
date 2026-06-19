#!/usr/bin/env python3
"""Cursor-canvas relay.

Receives normalized cursor positions from sender agents on the LAN and
broadcasts them to every connected viewer. Holds no state beyond the set of
live connections — this is a pure live relay, nothing is stored.

Protocol (JSON text frames):
  sender -> relay   {"type": "hello", "role": "sender", "id": "<name>"}
  sender -> relay   {"x": <0..1>, "y": <0..1>}            (position stream)
  viewer -> relay   {"type": "hello", "role": "viewer"}
  relay  -> viewer  {"id": "<name>", "x": <0..1>, "y": <0..1>}
  relay  -> viewer  {"type": "leave", "id": "<name>"}     (sender disconnected)
"""

import argparse
import asyncio
import json

from websockets.asyncio.server import broadcast, serve
from websockets.exceptions import ConnectionClosed

VIEWERS = set()   # viewer connections
SENDERS = {}      # sender connection -> cursor id


async def handler(websocket):
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
                    print(f"  viewer connected ({len(VIEWERS)} watching)")
                elif role == "sender":
                    sender_id = str(msg.get("id") or f"cursor-{id(websocket)}")
                    SENDERS[websocket] = sender_id
                    print(f"+ sender '{sender_id}' connected ({len(SENDERS)} live)")
                continue

            # Anything else from a sender is a position update.
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
            print(f"- sender '{sid}' disconnected ({len(SENDERS)} live)")
            broadcast(VIEWERS, json.dumps({"type": "leave", "id": sid}))


async def main():
    parser = argparse.ArgumentParser(description="Cursor-canvas LAN relay")
    parser.add_argument("--host", default="0.0.0.0", help="Bind address (default: all interfaces)")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()

    async with serve(handler, args.host, args.port, ping_interval=20) as server:
        print(f"Relay listening on ws://{args.host}:{args.port}")
        print("Senders + viewers can connect now. Ctrl+C to stop.")
        await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nRelay stopped.")
