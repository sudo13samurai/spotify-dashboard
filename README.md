# 🎧 Spotify Dashboard (Dual Mode)

A lightweight Python-based Spotify dashboard that can run in **two modes**:

1. **Local mode (static, no server required)**  
   - Fetches your **last 50 played tracks**
   - Prints them in the terminal
   - Generates a static HTML file: `index_local.html`
   - No live calls from the browser, no tokens in HTML

2. **Secure hosted mode (Flask backend)**  
   - Serves a dark-themed dashboard at `/`
   - Shows a live **Now Playing** card with:
     - Album art
     - Progress bar
     - Animated EQ bars
     - Color-changing waveform (based on energy/valence/tempo)
     - Playback controls (prev / play / pause / next)
   - Lists your **last 50 played tracks**
   - All Spotify Web API calls go through a Python backend (`server.py`)
   - Your token/credentials stay on the server (env vars), never in HTML/JS

This is a personal project, built for fun and utility — no tracking, no analytics, just your machine and your music.

---

## 🛠 Requirements

- Python 3.8+
- `pip install requests flask`
- A Spotify Developer app
- OAuth scopes:

```text
user-read-recently-played
user-read-currently-playing
user-read-playback-state
user-modify-playback-state
```

---

## 🚀 Local Mode (Static HTML, No Server)

This mode is meant for quick local usage: generate a static page and open it.

### 1. Get an access token

You can either:

- Paste a token into `access_token.txt`  
**or**
- Export it as an env var:

```bash
export SPOTIFY_TOKEN="your_access_token_here"
```

### 2. Run in local mode

```bash
python3 dashboard.py --mode local
```

This will:

- Fetch your last 50 played tracks
- Print them in the terminal
- Write:
  - `spotify_recent_50.json`
  - `index_local.html`

Open `index_local.html` in your browser.  
It’s purely static and does **not** contain any access tokens.

> 💡 For a smoother flow, you can use `get_refresh_token.py` + `refresh_access_token.py` to keep `access_token.txt` up to date.

Or use the helper script:

```bash
./run_local.sh
```

*(Uncomment the `refresh_access_token.py` line if you use refresh tokens locally.)*

---

## 🔐 Secure Hosted Mode (Flask + Backend Proxy)

This mode is designed for hosting (Render, Fly.io, Railway, VPS, etc.).  
The browser talks to your server, and your server talks to Spotify.

### 1. Get a refresh token

Use `get_refresh_token.py` once:

- Fill in `CLIENT_ID`, `CLIENT_SECRET`, `REDIRECT_URI`, `AUTH_CODE`
- Run:

```bash
python3 get_refresh_token.py
```

It will write `refresh_token.txt` for you. Copy that token into your hosting env as `SPOTIFY_REFRESH_TOKEN`.

### 2. Set env vars on your host

On your platform (or locally for testing), set:

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REFRESH_TOKEN`

### 3. Prepare the secure index.html (optional)

Locally, you can run:

```bash
python3 dashboard.py --mode secure
```

This ensures `index.html` exists with the secure frontend that calls `/api/*` routes only.

### 4. Run the server

For local dev:

```bash
python3 server.py
```

Then open:

```text
http://localhost:8000
```

For deployment (example Procfile / command):

```bash
python3 server.py
```

or with gunicorn:

```bash
gunicorn server:app
```

Your users will see:

- Live Now Playing card
- Animated waveform + EQ
- Playback controls (prev/play/pause/next)
- Recent 50 tracks

All without exposing your Spotify tokens to the browser.

Or use the helper script:

```bash
./run_secure.sh
```

*(Make sure your env vars are set first.)*

---

## 📂 Files Overview

- `dashboard.py`  
  Dual-mode builder:
  - `--mode local`  → generates `index_local.html` + JSON
  - `--mode secure` → ensures `index.html` for the Flask server

- `server.py`  
  Flask backend that proxies calls to Spotify and exposes `/api/*`:
  - `/api/now-playing`
  - `/api/recent`
  - `/api/control`

- `get_refresh_token.py`  
  One-time helper to exchange an auth code for a refresh token.

- `refresh_access_token.py`  
  Helper to turn `refresh_token.txt` into `access_token.txt` for local mode.

- `run_local.sh`  
  Simple convenience script for local static mode.

- `run_secure.sh`  
  Simple convenience script for running secure mode (build + serve).

- `spotify_recent_50.json`  
  Generated at runtime; **ignored by git**.

---

## ⚠️ Security Notes

- **Local mode**: uses a direct access token on your machine. Do not commit `access_token.txt` or share `index_local.html` if you later modify it to embed tokens or live JS calls.
- **Secure mode**: all sensitive credentials should live in environment variables; never commit them.
- The default `index.html` in this repo does **not** contain any tokens and is safe to host.

---

## 💚 Credits

Built by @sudo13samurai as a personal project to visualize listening history and Now Playing in a clean, dark, Spotify-inspired UI, with both local and secure hosting options.
