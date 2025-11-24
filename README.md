# 🎧 Spotify Dashboard

A lightweight Python script that builds a local Spotify dashboard:

- Fetches your **last 500 played tracks**
- Shows a live **Now Playing** card with:
  - Album art
  - Progress bar
  - Animated EQ bars
  - Color-changing waveform (based on energy/valence/tempo)
  - Playback controls (prev / play / pause / next)
- Outputs:
  - `index.html` — the dashboard
  - `spotify_recent_500.json` — raw listening data

This is a local-only tool. No servers, no tracking, just your machine and your music.

## 🛠 Requirements

- Python 3.8+
- `pip install requests`
- A Spotify Developer app
- OAuth token with scopes:

```text
user-read-recently-played
user-read-currently-playing
user-read-playback-state
user-modify-playback-state
```

## 🚀 Quick Start (Simple)

1. Clone the repo
2. Get a short-lived access token from the Spotify API console
3. Export it:

```bash
export SPOTIFY_TOKEN="your_access_token_here"
python3 spotify_dashboard.py
```

4. Open `index.html` in your browser.

## 🔁 Recommended: Refresh Token Flow

For automatic token handling, use the included helper scripts:

- `get_refresh_token.py` — run once to generate `refresh_token.txt`
- `refresh_access_token.py` — refreshes `access_token.txt` using your refresh token
- `run.sh` — convenience runner:

```bash
./run.sh
```

This will:
- Refresh your access token
- Rebuild the dashboard
- Leave you with a fresh `index.html`

## 📂 Outputs

- `index.html` — the dashboard page
- `spotify_recent_500.json` — your last 500 plays (track, artist, album, timestamps, URLs)

## ⚠️ Notes

- These scripts will inject your access token into the HTML for direct browser -> Spotify API calls.
- Do **not** host this HTML publicly unless you’re using a proxy or stripping the token.
- For public hosting, use a backend to keep tokens secret.

## 💚 Credits

Built by @sudo13samurai as a personal project to visualize listening history and Now Playing in a clean, dark, Spotify-inspired UI.
