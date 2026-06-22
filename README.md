# kres 2026 🔥

A little art installation: everyone's mouse turns into a tiny animal wandering around a
bonfire on one big screen. Each visitor uses their own computer, and all the computers
talk to each other over the same Wi‑Fi.

This page is just the **exhibition setup**. No coding — it's all double‑clicking. 🙂

## What's involved

- **1 screen computer** — connected to the big screen; shows the fire and all the animals.
- **up to ~20 visitor computers** — each person's computer; their mouse becomes an animal.

Everything runs on the **same Wi‑Fi**. No internet is needed during the show.

---

## Step 0 — Prepare the apps (once, on any one Windows computer with internet)

1. Copy this whole folder onto a Windows computer that has internet.
2. Double‑click **`build-all.bat`** and wait.
   - If it says Python is missing, a webpage opens — install Python (on the **first**
     install screen, tick **"Add python.exe to PATH"**), then double‑click `build-all.bat` again.
3. When it finishes, a **`deploy`** folder opens. Inside are two folders: **`display`** and **`sender`**.

You only need internet and this step **once**. The show computers never need Python.

> 🎠 **One extra file — the Pony video.** It's too large for GitHub, so it isn't in the
> download. Before you build, copy the Pony Lullaby video into
> `viewer/assets/frames/pony/video.mp4`. Everything else works without it; only the
> Pony scene would be blank.

---

## Step 1 — Set up the screen computer 🖥️

1. Copy the **`display`** folder onto the computer connected to the big screen.
2. Double‑click **`kres-display.exe`**.
3. If Windows asks for permission, click **Yes / Allow**.
4. The fire fills the screen. It also shows an **address** (numbers like `192.168.1.50`).

> ✅ This computer is now the show — it starts the fire by itself every time it's turned on.

It also creates a file called **`run-sender (prefilled).bat`** right next to `kres-display.exe`.
That file already has the address inside it. **Copy it onto a USB stick** — you'll drop it onto
every visitor computer next. (This is why you don't have to type any numbers. 🎉)

---

## Step 2 — Set up each visitor computer 🐾

Do this on every computer people will use:

1. Copy the **`sender`** folder onto it.
2. From the USB stick, copy **`run-sender (prefilled).bat`** into that **`sender`** folder
   (so it sits next to `cursor-agent.exe`).
3. Double‑click **`run-sender (prefilled).bat`**.
4. A little black animal appears on the big screen — that's this computer! 🎉

Leave the small black window open.
*(Optional: double‑click **`install-autostart.bat`** once, so it starts by itself after a restart.)*

---

## On the day — the 2‑minute check ✅

1. Turn on the screen computer → the fire should be there (it's always there, even with no visitors).
2. Turn on **one** visitor computer and run its sender → an animal should appear.

If the animal shows up, you're good — turn on the rest. **Order doesn't matter**; everything
reconnects on its own.

## If something looks off

- **Big screen is black/blank** → re‑open `kres-display.exe` on the screen computer.
- **No animal from a visitor computer** → make sure you double‑clicked the
  **`run-sender (prefilled).bat`** file (the one with the address inside), and that the
  computer is on the venue Wi‑Fi.
- **Still nothing** → shouldn't happen (the venue Wi‑Fi is already set up for this); as a last
  resort, use your own Wi‑Fi router.

---

<sub>Developer / testing notes live in `EXHIBITION.txt` and in the code comments under `relay/`, `sender/`, and `viewer/`.</sub>
