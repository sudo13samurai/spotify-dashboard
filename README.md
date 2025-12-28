
# Spotify Dashboard (Local) — 127.0.0.1 only

A local Spotify dashboard that binds strictly to **http://127.0.0.1** (no `localhost`) for both server and client.

## Features
- Spotify OAuth (Authorization Code flow)
- Refresh token + auto token refresh
- Dashboard widgets:
  - Now Playing
  - Player Controls (play/pause, next/prev, volume)
  - Top Artists
  - Top Tracks
  - Recently Played
  - Playlists (list + view tracks)

---

## Prereqs
- Node.js 18+ (Node 20+ recommended)
- Spotify account
- Spotify Developer app

---

## 1) Create Spotify Developer App
1. Create an app in the Spotify Developer Dashboard
2. In app settings, add Redirect URI:

   `http://127.0.0.1:8888/callback`

3. Save.

---

## 2) Configure env
Create `server/.env` from the example:

```bash
cp server/.env.example server/.env
nano server/.env


Set:

SPOTIFY_CLIENT_ID

SPOTIFY_CLIENT_SECRET

Keep:

SPOTIFY_REDIRECT_URI=http://127.0.0.1:8888/callback

FRONTEND_ORIGIN=http://127.0.0.1:5173

3) Install dependencies
cd server
npm install

cd ../client
npm install

4) Run locally (two terminals)
Terminal A — Server
cd server
npm run dev


Server:

http://127.0.0.1:8888

Terminal B — Client
cd client
npm run dev


Client:

http://127.0.0.1:5173

5) Login

Open:

http://127.0.0.1:5173

Click Connect Spotify and authorize.

Tokens are stored locally in:

server/.tokens.json (gitignored)

Playback controls note (important)

Spotify playback endpoints require an active device.
Have Spotify open on your phone/desktop and start playing something once.
Then the dashboard controls will work.

Scopes

This app requests:

user-read-currently-playing

user-read-playback-state

user-modify-playback-state

user-top-read

user-read-recently-played

playlist-read-private

playlist-read-collaborative

If you change scopes later, logout and re-auth.
# spotify-dashboard
# spotify-dashboard
