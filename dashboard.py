#!/usr/bin/env python3
"""
Dual-mode Spotify dashboard builder.

Modes:
  - local  : fetch last 50 tracks, print them, and generate a static HTML file (index_local.html)
             that shows your recent listening history. No live API calls from the browser.
  - secure : fetch last 50 tracks (for the CLI + JSON), and ensure a secure index.html
             exists that talks only to /api/* endpoints (served by server.py). No tokens
             are embedded into HTML or JavaScript.

In both modes:
  - Reads an access token from access_token.txt OR SPOTIFY_TOKEN env var.
  - Prints the tracks nicely in the terminal.
  - Writes spotify_recent_50.json for reuse.
"""


import argparse
import os
import time
import json
import requests

ACCESS_TOKEN_FILE = "access_token.txt"
PAGE_LIMIT = 50      # per API call
TARGET_TRACKS = 50   # total tracks to collect
SLEEP = 0.25         # pause between pages

# Terminal colors
BOLD = "\033[1m"
CYAN = "\033[96m"
YELLOW = "\033[93m"
MAGENTA = "\033[95m"
RESET = "\033[0m"


def get_token():
    """Get Spotify access token from file or environment."""
    if os.path.exists(ACCESS_TOKEN_FILE):
        with open(ACCESS_TOKEN_FILE, "r", encoding="utf-8") as f:
            token = f.read().strip()
    else:
        token = os.getenv("SPOTIFY_TOKEN", "").strip()

    if not token:
        raise SystemExit(
            "Missing access token.\n"
            "Either create 'access_token.txt' with your token, or export SPOTIFY_TOKEN."
        )
    return token


def fetch_me(headers):
    """Get Spotify user profile."""
    r = requests.get("https://api.spotify.com/v1/me", headers=headers)
    if r.status_code != 200:
        print(f"Warning: could not fetch profile, status={r.status_code}")
        return {"name": "My", "avatar": ""}
    d = r.json()
    return {
        "name": d.get("display_name", "My"),
        "avatar": (d.get("images") or [{}])[0].get("url", ""),
    }


def fetch_recent(headers):
    """Fetch up to TARGET_TRACKS recently played tracks."""
    tracks = []
    before = None

    while len(tracks) < TARGET_TRACKS:
        params = {"limit": PAGE_LIMIT}
        if before:
            params["before"] = before

        r = requests.get(
            "https://api.spotify.com/v1/me/player/recently-played",
            headers=headers,
            params=params,
        )
        if r.status_code != 200:
            raise SystemExit(f"API Error {r.status_code}: {r.text}")

        payload = r.json()
        items = payload.get("items", [])
        if not items:
            break

        for item in items:
            t = item["track"]
            album = t.get("album", {}) or {}
            album_images = album.get("images", []) or []
            if not album_images:
                art = ""
            else:
                art = album_images[1]["url"] if len(album_images) > 1 else album_images[0]["url"]

            entry = {
                "id": t.get("id"),
                "name": t.get("name", ""),
                "artist": ", ".join(a.get("name", "") for a in (t.get("artists") or [])),
                "album": album.get("name", ""),
                "played_at": item.get("played_at", ""),
                "url": (t.get("external_urls") or {}).get("spotify", ""),
                "art": art,
            }
            tracks.append(entry)

            print(
                f"{CYAN}{len(tracks):>3}.{RESET} "
                f"{BOLD}{entry['name']}{RESET} — "
                f"{YELLOW}{entry['artist']}{RESET} "
                f"({MAGENTA}{entry['album']}{RESET})"
            )

            if len(tracks) >= TARGET_TRACKS:
                break

        cursors = payload.get("cursors") or {}
        before = cursors.get("before")
        if not before:
            break

        time.sleep(SLEEP)

    return tracks[:TARGET_TRACKS]


def write_json(tracks, filename="spotify_recent_50.json"):
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(tracks, f, indent=2)
    print(f"\n💾 Saved JSON → {filename}")


def build_local_html(username, tracks, filename="index_local.html"):
    """
    Build a static HTML file that lists the recent tracks.
    No tokens, no live Spotify calls — safe to open directly.
    """
    html = []
    html.append("<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'>")
    html.append(f"<title>{username}'s Spotify — Local Recent Plays</title>")
    html.append(r"""
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
body {
  background:#121212;
  color:#e5e5e5;
  font-family:Arial,Helvetica,sans-serif;
  margin:40px auto;
  max-width:900px;
}
a { color:#1db954; text-decoration:none; }
a:hover { text-decoration:underline; }

.header { margin-bottom:30px; }
.track-list { margin-top:10px; }
.track {
  display:flex;
  align-items:center;
  gap:14px;
  padding-bottom:10px;
  margin-bottom:12px;
  border-bottom:1px solid #333;
}
.track img {
  width:70px;
  height:70px;
  border-radius:6px;
  object-fit:cover;
}
.artist { color:#ccc; font-size:0.9rem; }
.album { color:#888; font-size:0.85rem; }
.played { color:#666; font-size:0.8rem; }
.note { color:#aaa; font-size:0.85rem; margin-bottom:8px; }
</style>
</head><body>
""")
    html.append("<div class='header'>")
    html.append(f"<h1>{username}'s Recent Spotify Plays (Local)</h1>")
    html.append("</div>")
    html.append("<p class='note'>This file was generated locally from the Spotify Web API. "
                "It does not contain any access tokens and does not make live calls to Spotify.</p>")
    html.append("<div class='track-list'>")
    for t in tracks:
        html.append("<div class='track'>")
        if t["art"]:
            html.append(f"<img src='{t['art']}' alt='album art'>")
        else:
            html.append("<div style='width:70px;height:70px;border-radius:6px;background:#333;'></div>")
        html.append("<div>")
        html.append(f"<a href='{t['url']}' target='_blank'><strong>{t['name']}</strong></a><br>")
        html.append(f"<span class='artist'>{t['artist']}</span><br>")
        html.append(f"<span class='album'>{t['album']}</span><br>")
        html.append(f"<span class='played'>{t['played_at']}</span>")
        html.append("</div></div>")
    html.append("</div></body></html>")

    with open(filename, "w", encoding="utf-8") as f:
        f.write("".join(html))

    print(f"🌐 Local HTML written → {filename}")


def ensure_secure_index_html(filename="index.html"):
    """
    Ensure a secure index.html exists that talks to /api/* endpoints only.
    This file contains no access tokens and is meant to be served alongside server.py.
    """
    html = r"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Spotify Dashboard (Secure)</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      background:#121212;
      color:#e5e5e5;
      font-family:Arial,Helvetica,sans-serif;
      margin:40px auto;
      max-width:900px;
    }
    a { color:#1db954; text-decoration:none; }
    a:hover { text-decoration:underline; }

    .header {
      display:flex;
      align-items:center;
      justify-content:space-between;
      margin-bottom:30px;
    }

    .nowplaying-card {
      display:flex;
      gap:15px;
      padding:15px;
      background:#181818;
      border-radius:12px;
      border:1px solid #2a2a2a;
      box-shadow:0 0 22px rgba(30,215,96,0.35);
      margin-bottom:28px;
    }
    .np-art {
      width:120px;
      height:120px;
      border-radius:10px;
      object-fit:cover;
    }
    .np-info { flex:1; }

    .eq-bars {
      display:flex;
      flex-direction:column;
      justify-content:flex-end;
      gap:4px;
      margin-right:8px;
    }
    .bar {
      width:5px;
      background:#1db954;
      animation:bounce .8s infinite ease-in-out;
    }
    .b1 { animation-delay:0s; }
    .b2 { animation-delay:.15s; }
    .b3 { animation-delay:.3s; }

    @keyframes bounce {
      0%,100% { height:8px; }
      50% { height:22px; }
    }

    .progress-container {
      width:100%;
      height:6px;
      background:#333;
      border-radius:4px;
      overflow:hidden;
      margin-top:8px;
    }
    .progress-bar {
      height:100%;
      background:#1db954;
    }

    .player-controls {
      margin-top:12px;
      display:flex;
      gap:12px;
      align-items:center;
    }
    .player-controls button {
      background:#1db954;
      border:none;
      color:#000;
      font-size:1.1rem;
      padding:6px 12px;
      border-radius:8px;
      cursor:pointer;
      transition:0.15s ease-in-out;
    }
    .player-controls button:hover {
      background:#1ed760;
    }

    .waveform-container {
      margin-top:10px;
    }
    #waveform {
      width:100%;
      height:60px;
      display:block;
    }

    .nowplaying-empty {
      padding:10px 0 20px 0;
      color:#aaa;
      font-size:0.9rem;
    }

    .track-list {
      margin-top:30px;
    }
    .track {
      display:flex;
      align-items:center;
      gap:14px;
      padding-bottom:10px;
      margin-bottom:12px;
      border-bottom:1px solid #333;
    }
    .track img {
      width:70px;
      height:70px;
      border-radius:6px;
      object-fit:cover;
    }
    .artist { color:#ccc; font-size:0.9rem; }
    .album { color:#888; font-size:0.85rem; }
    .played { color:#666; font-size:0.8rem; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Spotify Dashboard (Secure)</h1>
  </div>

  <h2>Now Playing</h2>
  <div id="now-playing"></div>

  <h2>Recently Played (up to 50)</h2>
  <div id="recent" class="track-list"></div>

  <script>
    async function apiGet(path) {
      const res = await fetch(path);
      if (!res.ok) throw new Error("Request failed: " + res.status);
      return res.json();
    }

    async function apiPost(path, body) {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {})
      });
      return res.json();
    }

    async function control(action) {
      await apiPost("/api/control", { action });
      setTimeout(loadNowPlaying, 800);
    }

    function audioColor(energy, valence) {
      const r = Math.floor(80 + energy * 160);
      const g = Math.floor(80 + valence * 160);
      const b = Math.floor(100 + (1-energy) * 90);
      return "rgb(" + r + "," + g + "," + b + ")";
    }

    let waveformAnim = null;

    async function loadNowPlaying() {
      const container = document.getElementById("now-playing");

      try {
        const data = await apiGet("/api/now-playing");

        if (!data.playing || !data.track) {
          container.innerHTML = "<div class='nowplaying-empty'>Nothing playing right now</div>";
          if (waveformAnim) cancelAnimationFrame(waveformAnim);
          return;
        }

        const t = data.track;
        const features = data.features || {};
        const energy = features.energy ?? 0.5;
        const valence = features.valence ?? 0.5;
        const tempo = features.tempo ?? 120;
        const pct = data.duration_ms ? (data.progress_ms / data.duration_ms) * 100 : 0;
        const color = audioColor(energy, valence);

        const artists = (t.artists || []).join(", ");

        container.innerHTML =
          '<div class="nowplaying-card">' +
            '<div class="eq-bars">' +
              '<div class="bar b1"></div>' +
              '<div class="bar b2"></div>' +
              '<div class="bar b3"></div>' +
            '</div>' +
            '<img src="' + (t.art || "") + '" class="np-art" alt="album art">' +
            '<div class="np-info">' +
              '<a href="' + t.url + '" target="_blank"><strong>' + t.name + '</strong></a><br>' +
              '<span class="artist">' + artists + '</span><br>' +
              '<span class="album">' + t.album + '</span>' +
              '<div class="progress-container"><div class="progress-bar" style="width:' + pct + '%"></div></div>' +
              '<div class="player-controls">' +
                '<button onclick="control(\\'prev\\')">⏮</button>' +
                '<button id="playpause-btn">⏯</button>' +
                '<button onclick="control(\\'next\\')">⏭</button>' +
              '</div>' +
              '<div class="waveform-container"><canvas id="waveform" width="320" height="60"></canvas></div>' +
            '</div>' +
          '</div>';

        const playBtn = document.getElementById("playpause-btn");
        if (playBtn) {
          playBtn.innerHTML = data.playing ? "⏸" : "▶️";
          playBtn.onclick = () => control(data.playing ? "pause" : "play");
        }

        const canvas = document.getElementById("waveform");
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        let t0 = 0;

        function draw() {
          const w = canvas.width;
          const h = canvas.height;
          ctx.clearRect(0,0,w,h);

          const bars = 40;
          const barWidth = w / bars;

          for (let i = 0; i < bars; i++) {
            const phase = (i / bars) * Math.PI * 2;
            const amp = 0.4 + 0.6 * Math.sin(phase + t0);
            const barHeight = amp * (h - 10);
            const x = i * barWidth;
            const y = (h - barHeight) / 2;
            ctx.fillStyle = color;
            ctx.fillRect(x, y, barWidth * 0.7, barHeight);
          }

          t0 += (tempo / 120) * 0.02;
          waveformAnim = requestAnimationFrame(draw);
        }

        if (waveformAnim) cancelAnimationFrame(waveformAnim);
        draw();
      } catch (err) {
        console.error(err);
        container.innerHTML = "<div class='nowplaying-empty'>Unable to load current track</div>";
        if (waveformAnim) cancelAnimationFrame(waveformAnim);
      }
    }

    async function loadRecent() {
      const container = document.getElementById("recent");
      try {
        const data = await apiGet("/api/recent?limit=50");
        const items = data.items || [];
        container.innerHTML = items.map(t => `
          <div class="track">
            ${t.art ? `<img src="${t.art}" alt="album art">`
                     : `<div style="width:70px;height:70px;border-radius:6px;background:#333;"></div>`}
            <div>
              <a href="${t.url}" target="_blank"><strong>${t.name}</strong></a><br>
              <span class="artist">${t.artist}</span><br>
              <span class="album">${t.album}</span><br>
              <span class="played">${t.played_at}</span>
            </div>
          </div>
        `).join("");
      } catch (err) {
        console.error(err);
        container.innerHTML = "<div class='nowplaying-empty'>Unable to load recent tracks</div>";
      }
    }

    loadNowPlaying();
    loadRecent();
    setInterval(loadNowPlaying, 10000);
  </script>
</body>
</html>
"""
    with open(filename, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"🌐 Secure HTML written → {filename}")


def main():
    parser = argparse.ArgumentParser(description="Build Spotify dashboard (local or secure).")
    parser.add_argument(
        "--mode",
        choices=["local", "secure"],
        default="local",
        help="local = static HTML only, secure = prepare index.html for server.py",
    )
    args = parser.parse_args()

    token = get_token()
    headers = {"Authorization": f"Bearer {token}"}

    me = fetch_me(headers)
    username = me["name"]
    print(f"{MAGENTA}🎵 Building Spotify dashboard for {username}...{RESET}")

    tracks = fetch_recent(headers)
    write_json(tracks, "spotify_recent_50.json")

    if args.mode == "local":
        build_local_html(username, tracks, filename="index_local.html")
    else:
        ensure_secure_index_html(filename="index.html")
        print("\nSecure mode: use server.py to serve index.html with protected tokens.")


if __name__ == "__main__":
    main()
