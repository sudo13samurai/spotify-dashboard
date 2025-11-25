#!/usr/bin/env python3
"""
Flask backend for the secure Spotify dashboard.

- Uses SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN env vars.
- Never exposes access tokens to the frontend.
- Provides:
    GET  /api/now-playing  -> current track + audio features
    GET  /api/recent       -> recent tracks (limit <= 50)
    POST /api/control      -> playback control (prev / next / play / pause)
- Serves index.html at the root.
"""

import os
import time
from typing import Optional

from flask import Flask, jsonify, request, send_from_directory
import requests

SPOTIFY_CLIENT_ID = os.getenv("SPOTIFY_CLIENT_ID")
SPOTIFY_CLIENT_SECRET = os.getenv("SPOTIFY_CLIENT_SECRET")
SPOTIFY_REFRESH_TOKEN = os.getenv("SPOTIFY_REFRESH_TOKEN")

if not (SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET and SPOTIFY_REFRESH_TOKEN):
    raise SystemExit(
        "Missing Spotify env vars: SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET / SPOTIFY_REFRESH_TOKEN"
    )

TOKEN_URL = "https://accounts.spotify.com/api/token"
API_BASE = "https://api.spotify.com/v1"

_access_token: Optional[str] = None
_token_expires_at: float = 0.0

app = Flask(__name__, static_folder=".", static_url_path="")


def get_access_token() -> str:
    """Get a fresh access token via refresh token (with simple caching)."""
    global _access_token, _token_expires_at

    now = time.time()
    if _access_token and now < _token_expires_at - 30:
        return _access_token

    auth = (SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET)
    data = {
        "grant_type": "refresh_token",
        "refresh_token": SPOTIFY_REFRESH_TOKEN,
    }

    resp = requests.post(TOKEN_URL, data=data, auth=auth)
    if resp.status_code != 200:
        raise SystemExit(f"Error refreshing token: {resp.status_code} {resp.text}")

    tokens = resp.json()
    _access_token = tokens["access_token"]
    expires_in = tokens.get("expires_in", 3600)
    _token_expires_at = now + expires_in

    return _access_token


def spotify_get(path: str, params=None):
    token = get_access_token()
    headers = {"Authorization": f"Bearer {token}"}
    url = f"{API_BASE}{path}"
    resp = requests.get(url, headers=headers, params=params)
    return resp


def spotify_post(path: str, data=None):
    token = get_access_token()
    headers = {"Authorization": f"Bearer {token}"}
    url = f"{API_BASE}{path}"
    resp = requests.post(url, headers=headers, json=data)
    return resp


def spotify_put(path: str, data=None):
    token = get_access_token()
    headers = {"Authorization": f"Bearer {token}"}
    url = f"{API_BASE}{path}"
    resp = requests.put(url, headers=headers, json=data)
    return resp


@app.route("/api/now-playing")
def api_now_playing():
    """Return currently playing + audio features in a frontend-friendly shape."""
    res = spotify_get("/me/player/currently-playing")
    if res.status_code == 204:
        return jsonify({"playing": False, "reason": "no_content"}), 200
    if not res.ok:
        return jsonify({"playing": False, "error": res.text}), res.status_code

    data = res.json()
    if not data or "item" not in data:
        return jsonify({"playing": False, "reason": "no_item"}), 200

    item = data["item"]
    imgs = item.get("album", {}).get("images", []) or []
    art = imgs[1]["url"] if len(imgs) > 1 else (imgs[0]["url"] if imgs else "")

    energy = 0.5
    valence = 0.5
    tempo = 120

    track_id = item.get("id")
    if track_id:
        feat_res = spotify_get(f"/audio-features/{track_id}")
        if feat_res.ok:
            feat = feat_res.json()
            energy = feat.get("energy", energy)
            valence = feat.get("valence", valence)
            tempo = feat.get("tempo", tempo)

    payload = {
        "playing": data.get("is_playing", False),
        "progress_ms": data.get("progress_ms", 0),
        "duration_ms": item.get("duration_ms", 0),
        "track": {
            "id": track_id,
            "name": item.get("name"),
            "artists": [a.get("name") for a in item.get("artists", [])],
            "album": item.get("album", {}).get("name"),
            "url": item.get("external_urls", {}).get("spotify"),
            "art": art,
        },
        "features": {
            "energy": energy,
            "valence": valence,
            "tempo": tempo,
        },
    }
    return jsonify(payload)


@app.route("/api/recent")
def api_recent():
    """Return recent tracks; limit defaults to 50, max 50."""
    try:
        limit = int(request.args.get("limit", "50"))
    except ValueError:
        limit = 50

    limit = max(1, min(limit, 50))

    collected = []
    params = {"limit": 50}
    before = None

    while len(collected) < limit:
        if before:
            params["before"] = before
        r = spotify_get("/me/player/recently-played", params=params)
        if not r.ok:
            return jsonify({"error": r.text}), r.status_code

        payload = r.json()
        items = payload.get("items", [])
        if not items:
            break

        for item in items:
            t = item["track"]
            imgs = t.get("album", {}).get("images", []) or []
            art = imgs[1]["url"] if len(imgs) > 1 else (imgs[0]["url"] if imgs else "")
            collected.append({
                "id": t.get("id"),
                "name": t.get("name"),
                "artist": ", ".join(a.get("name") for a in t.get("artists", [])),
                "album": t.get("album", {}).get("name"),
                "played_at": item.get("played_at"),
                "url": t.get("external_urls", {}).get("spotify"),
                "art": art,
            })
            if len(collected) >= limit:
                break

        cursors = payload.get("cursors") or {}
        before = cursors.get("before")
        if not before:
            break

    return jsonify({"items": collected})


@app.route("/api/control", methods=["POST"])
def api_control():
    """Playback control: {action: 'next'|'prev'|'play'|'pause'}"""
    data = request.get_json(force=True, silent=True) or {}
    action = data.get("action")

    if action == "next":
        r = spotify_post("/me/player/next")
    elif action == "prev":
        r = spotify_post("/me/player/previous")
    elif action == "play":
        r = spotify_put("/me/player/play")
    elif action == "pause":
        r = spotify_put("/me/player/pause")
    else:
        return jsonify({"error": "invalid action"}), 400

    if not r.ok and r.status_code not in (204, 202):
        return jsonify({"error": r.text}), r.status_code

    return jsonify({"ok": True})


@app.route("/")
def index():
    """Serve index.html from the project root."""
    return send_from_directory(app.static_folder, "index.html")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 8000)), debug=True)
