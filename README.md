# kres 2026 — cursor canvas

A LAN art installation. Up to ~20 Windows machines stream their **live mouse cursor**
over the local network to one portrait **1080×1920** fullscreen display, where every
visitor becomes a little black animal roaming around a pixel **bonfire** (*kres* =
Slovenian for bonfire). No database, no internet — everything is live on the LAN.

```
 Windows machine (a sender)  ──►  Display PC  ──►  the screen everyone sees
 … up to ~20 …                    (relay + viewer, fullscreen browser)
```

## How it works

Three parts, one WebSocket:

- **`sender/cursor_agent.py`** — reads the OS cursor (pynput), normalises to 0..1, streams
  it to the relay. Ships as `cursor-agent.exe` (PyInstaller). Auto-reconnects.
- **`relay/server.py`** — a `websockets` broadcast relay; fans every cursor out to all viewers.
- **`viewer/`** — a single HTML page + canvas. Two stacked layers: `viewer.js` draws the
  pixel-art scene (background, the hand-drawn flame, the animals, the bonfire), and `fx.js`
  adds an optional three.js glow/bloom on top. If three.js fails to load, the 2D scene still runs.

The flame is the artist's hand-drawn `ogenj.svg` (5 gradient "tongue" paths), rasterised
into a low-res buffer and animated each frame with a travelling ripple + vertical "lick",
then blitted with smoothing off → animated pixel-art fire.

## Run it (development, on any machine)

```bash
# 1. relay
cd relay && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
python server.py                           # ws://0.0.0.0:8765

# 2. viewer (new terminal)
cd viewer && python3 -m http.server 8080   # open http://localhost:8080

# 3. fake some cursors (new terminal)
python tools/demo_senders.py --host localhost --count 6
```

To stream your real cursor instead of fakes:

```bash
cd sender && pip install -r requirements.txt && python cursor_agent.py --host localhost
```

(on macOS the sender needs Accessibility permission to read the cursor).

## Run the show (Windows)

You only need Python on **one** Windows PC, once, to build the apps. Double-click
`build-all.bat` → it produces a `deploy/` folder with `kres-display.exe` (the display PC)
and a `sender/` folder (each visitor PC). After that no machine needs Python.

Full step-by-step + troubleshooting: **`EXHIBITION.txt`**. Venue Wi-Fi notes: **`WIFI-GUIDE.txt`**.

## Viewer URL options

| Option | Effect |
| --- | --- |
| `?relay=IP:PORT` | point the viewer at a relay on another machine |
| `?addfire` | glowing-ember look (additive blend) instead of the flat layered flame |
| `?smoothfire` | the original static vector flame |
| `?size=120` | animal sprite size (default 90) |
| `?labels` | show cursor id / click count |
| `?hud` | relay + cursor-count status overlay |
| `?lightning` | restore the (off-by-default) energy web + bolts between cursors |
| `?ambient` | restore the (off-by-default) spontaneous magic bursts |

## Layout

```
relay/      WebSocket broadcast relay (server.py)
sender/     cursor agent (cursor_agent.py) + Windows run/build scripts
viewer/     the display: index.html, viewer.js, fx.js, assets/, vendored three.js
tools/      demo_senders.py (fake cursors for dev)
display_app.py, *.bat   one-click Windows build/run/auto-start
```
