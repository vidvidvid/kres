Cursor Canvas - kres 2026
=========================

A LAN art installation. Up to ~20 Windows machines stream their live mouse to one
portrait screen, where each visitor becomes a little black animal roaming around a
pixel bonfire.

   Windows machine (a sender)  -->  Display PC  -->  the screen everyone sees
   ... up to 20 ...                 (relay + viewer, in a fullscreen browser)

No database, no internet at the show - everything is live on the local network.


RUN THE SHOW (Windows)
----------------------
You only need Python on ONE Windows PC, once, to build the apps. After that, no
machine needs Python - it's baked into the .exe files.

  1) Copy this whole project folder onto one Windows PC (the display PC is fine).
  2) Double-click  build-all.bat
       - If Python isn't installed, it opens the download page - install it
         (tick "Add python.exe to PATH"), then double-click build-all.bat again.
       - It builds both apps and puts them in a  deploy\  folder.
  3) Deploy what's in  deploy\ :
       - deploy\display\kres-display.exe  ->  the display PC. Double-click it; a
         quick wizard sets everything up (firewall, the IP, auto-start), then runs.
       - deploy\sender\                   ->  each visitor PC.

Full step-by-step + troubleshooting:  EXHIBITION.txt  (the one to follow at the venue).


TEST / DEVELOP ON A MAC (no Windows needed)
-------------------------------------------
Run all three pieces on one machine and fake some cursors to iterate on the look:

  # 1. relay
  cd relay && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
  python server.py                          # ws://0.0.0.0:8765

  # 2. viewer (new terminal)
  cd viewer && python3 -m http.server 8080  # open http://localhost:8080

  # 3. fake cursors (new terminal)
  python tools/demo_senders.py --host localhost --count 6

Move your real mouse (the "mother cursor" - a white ring) and watch the animals and
fire. To stream YOUR real cursor instead of fakes:
  cd sender && pip install -r requirements.txt && python cursor_agent.py --host localhost

Note: on macOS the sender needs Accessibility permission to read the cursor
(System Settings -> Privacy & Security -> Accessibility -> allow your terminal).


NO-BUILD / CROSS-PLATFORM PATH
------------------------------
Don't want to build the display .exe? The display PC can run from Python instead:
install Python, then use the .bat launchers - setup-display.bat (once), then
start-display.bat (which install-autostart.bat can run on boot). Senders still
deploy as cursor-agent.exe. Same result, but the display PC then needs Python.

To point a viewer at a relay on another machine, open it with:
  http://<display-ip>:8080/?relay=<display-ip>:8765

Fully offline: three.js is vendored into viewer/vendor/ and index.html points at it,
so the display needs no internet. (The pixel scene runs even without three.js - only
the glow/lightning uses it.) To update three.js, re-download build/three.module.js
plus the examples/jsm/postprocessing and examples/jsm/shaders files into
viewer/vendor/, keeping the folder layout, then rebuild.


TUNING (no rebuild - URL options + constants in viewer.js)
----------------------------------------------------------
  Sprite size ........... viewer URL ?size=80
  Flame ................. the 5 real ogenj.svg tongues, pixelated, animated with
                          smooth travelling licks. default = flat layered;
                          ?addfire = glowing-ember (additive). ?smoothfire = the
                          original static vector flame.
                          Tuning (viewer.js): chunkiness FROWS; height FIRE_TALL;
                          tongue length SHORT_FRAC; motion in the FX config object
  Flame size / spot ..... FIRE_W_FRAC / FIRE_CX / FIRE_BASE   (fraction of stage)
  Flame dodge ........... FLAME_DODGE / DODGE_GAIN / FLAME_R_FACTOR
  Show cursor names ..... viewer URL ?labels
  Status HUD ............ viewer URL ?hud   (hidden by default; relay state + cursor count)
  Auto-reload watchdog .. on by default; ?nowatchdog to disable (reloads a wedged page after 120s)
  Glide feel ............ SMOOTHING   (higher = snappier)
  Fade timing ........... FADE_AFTER_MS / FADE_DUR_MS   (ms)
  Update rate ........... sender --fps 60   (lower = less traffic)

20 cursors x 60 fps is about 1,200 msgs/sec - trivial for the relay.
