# file-browser 🎬

Hey — this is a tiny personal project I made to browse and watch videos on my local network. It's a cozy video gallery, not a full-featured file manager. I built it to be simple and mostly offline-friendly.

Status: In development but mostly complete — for local/network use only. 🙂

What this really is

- A video gallery UI + small Python backend that serve files from a folder on your LAN.
- Not a "list/tree file manager" — it's focused on video playback and browsing.
- Frontend and backend are kinda tangled (I hacked them together), so the frontend talks to the backend endpoints — it isn't a pure static site you can just open from the filesystem.

Important technical notes (please read)

- Entry point: `main.py` — run this to start the whole app. I usually run it with my "uv" project manager (your setup may differ).
  - The app serves both the frontend and backend; open `http://localhost:8000` after starting it.
- Backend endpoints live under `/api/` — the frontend calls those endpoints to get video lists, metadata, and file streams.
- Config: open `src/config.py` to change the shared folder path and a few basic settings. This is where you can point the gallery to the folder you want to serve.
- Backend behavior:
  - Mostly read-only (GET) — it lists and serves files.
  - The only write-like operation currently is delete (use with care; no **trash/recycle**).
  - No authentication — intended for private/local network use only. Don't expose it to the public internet.
- I intended the frontend to be offline-friendly, so I downloaded a bunch of CSS/assets rather than pulling everything from CDNs. That's why the repo contains several CSS files.

Quick start (how I run it)

1. Clone:

```bash
   git clone https://github.com/max-4-3/file-browser.git
   cd file-browser
```

2. Start the app:
   - I run it using my "uv" project manager (your setup may use uvicorn or another runner). Example ideas:
     - `uv run main.py` # (how I run it)
     - `python main.py` # if your environment supports running it directly
     - `uvicorn main:app --reload` # if main exposes an ASGI app (only if applicable)
   - After starting, open: `http://localhost:8000`

3. Change the folder that is served:
   - Edit `src/config.py` and tweak the shared folder path / basic settings. It's a personal project so feel free to hack it.

4. Full Flow

```bash
git clone https://github.com/max-4-3/file-browser.git
cd file-browser
uv sync
uv run main.py
```

What I didn't do (by design)

- No fancy security/auth — this is for a closed network.
- No full production hardening, no tests, and limited error handling.
- The frontend and backend are mixed in a way that's convenient for me, but messy if you want to separate them cleanly.

If you want to tweak behaviour

- To change the folder location or simple settings: edit `src/__init__.py`.
- To change how the frontend talks to the server: look for calls to /api/ in the frontend JS and adjust endpoints.
- If you want the frontend to be truly static (no backend calls), that'll take some refactoring: the UI currently depends on the backend for file lists and metadata.

Contributing / forks

- It's my personal toy — I won't be strict about rules. If you want to help:
  - Open an issue first for bigger changes.
  - Small tweaks or fixes? Send a PR and I'll check it out when I can.
- No licence file in the repo yet — if you want to reuse or fork it, add a license or ask me.

Thanks for looking! If anything is confusing or broken, open an issue with steps to reproduce and I'll try to fix it when I get time. This is intentionally informal — it's just my little home video gallery. 🙂
