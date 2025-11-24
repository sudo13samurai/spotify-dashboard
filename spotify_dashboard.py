#!/usr/bin/env python3
import os
import time
import json
import requests

ACCESS_TOKEN_FILE = "access_token.txt"

if os.path.exists(ACCESS_TOKEN_FILE):
    with open(ACCESS_TOKEN_FILE, "r", encoding="utf-8") as f:
        TOKEN = f.read().strip()
else:
    TOKEN = os.getenv("SPOTIFY_TOKEN", "")

if not TOKEN:
    raise SystemExit("Missing access token. Either create 'access_token.txt' or export SPOTIFY_TOKEN.")

HEADERS = {"Authorization": f"Bearer {TOKEN}"}

URL_ME = "https://api.spotify.com/v1/me"
URL_RECENT = "https://api.spotify.com/v1/me/player/recently-played"
LIMIT = 50
TARGET = 500
SLEEP = 0.25

BOLD = "\033[1m"
CYAN = "\033[96m"
YELLOW = "\033[93m"
MAGENTA = "\033[95m"
RESET = "\033[0m"

def fetch_me():
    r = requests.get(URL_ME, headers=HEADERS)
    if r.status_code != 200:
        print(f"Warning: could not fetch profile, status={r.status_code}")
        return {"name": "My", "avatar": ""}
    d = r.json()
    return {
        "name": d.get("display_name", "My"),
        "avatar": d.get("images", [{}])[0].get("url", "")
    }

def fetch_recent(before=None):
    params = {"limit": LIMIT}
    if before:
        params["before"] = before
    r = requests.get(URL_RECENT, headers=HEADERS, params=params)
    if r.status_code != 200:
        raise SystemExit(f"API Error {r.status_code}: {r.text}")
    return r.json()

me = fetch_me()
username = me["name"]
avatar = me["avatar"]

print(f"{MAGENTA}🎵 Building Spotify dashboard for {username}...{RESET}")

tracks = []
before = None

while len(tracks) < TARGET:
    data = fetch_recent(before=before)
    items = data.get("items", [])
    if not items:
        break

    for item in items:
        t = item["track"]
        album_images = t["album"].get("images", [])
        if not album_images:
            art = ""
        else:
            art = album_images[1]["url"] if len(album_images) > 1 else album_images[0]["url"]

        entry = {
            "id": t.get("id"),
            "name": t.get("name", ""),
            "artist": ", ".join(a.get("name", "") for a in t.get("artists", [])),
            "album": t.get("album", {}).get("name", ""),
            "played_at": item.get("played_at", ""),
            "url": t.get("external_urls", {}).get("spotify", ""),
            "art": art,
        }
        tracks.append(entry)

        print(
            f"{CYAN}{len(tracks):>3}.{RESET} "
            f"{BOLD}{entry['name']}{RESET} — "
            f"{YELLOW}{entry['artist']}{RESET} "
            f"({MAGENTA}{entry['album']}{RESET})"
        )

        if len(tracks) >= TARGET:
            break

    before = data.get("cursors", {}).get("before")
    if not before:
        break

    time.sleep(SLEEP)

json_output = "spotify_recent_500.json"
with open(os.path.join(os.path.dirname(__file__), json_output), "w", encoding="utf-8") as f:
    json.dump(tracks[:TARGET], f, indent=2)

print(f"\n💾 Saved JSON → {json_output}")

js_template = r"""
<div id="now-playing"></div>
<script>
async function control(action) {{
  let endpoint = "";
  if (action === "next") endpoint = "https://api.spotify.com/v1/me/player/next";
  if (action === "prev") endpoint = "https://api.spotify.com/v1/me/player/previous";
  if (action === "pause") endpoint = "https://api.spotify.com/v1/me/player/pause";
  if (action === "play") endpoint = "https://api.spotify.com/v1/me/player/play";

  await fetch(endpoint, {{
    method: (action === "next" || action === "prev") ? "POST" : "PUT",
    headers: {{ "Authorization": "Bearer SPOTIFY_TOKEN_HERE" }}
  }});

  setTimeout(loadNowPlaying, 800);
}}

async function loadNowPlaying() {{
  const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {{
    headers: {{ "Authorization": "Bearer SPOTIFY_TOKEN_HERE" }}
  }});

  const container = document.getElementById("now-playing");

  if (res.status === 204) {{
    container.innerHTML = "<div class='nowplaying-empty'>Nothing playing right now</div>";
    if (window.waveformAnim) cancelAnimationFrame(window.waveformAnim);
    return;
  }}

  if (!res.ok) {{
    container.innerHTML = "<div class='nowplaying-empty'>Unable to load current track</div>";
    if (window.waveformAnim) cancelAnimationFrame(window.waveformAnim);
    return;
  }}

  const data = await res.json();
  if (!data || !data.item) {{
    container.innerHTML = "<div class='nowplaying-empty'>Nothing playing right now</div>";
    if (window.waveformAnim) cancelAnimationFrame(window.waveformAnim);
    return;
  }}

  const t = data.item;
  const imgs = t.album.images || [];
  const art = imgs[1] ? imgs[1].url : (imgs[0] ? imgs[0].url : "");
  const artist = t.artists.map(a => a.name).join(", ");
  const pct = (data.progress_ms / t.duration_ms) * 100;

  let energy = 0.5, valence = 0.5, tempo = 120;
  try {{
    const featRes = await fetch("https://api.spotify.com/v1/audio-features/" + t.id, {{
      headers: {{ "Authorization": "Bearer SPOTIFY_TOKEN_HERE" }}
    }});
    if (featRes.ok) {{
      const feat = await featRes.json();
      energy = typeof feat.energy === "number" ? feat.energy : 0.5;
      valence = typeof feat.valence === "number" ? feat.valence : 0.5;
      tempo = typeof feat.tempo === "number" ? feat.tempo : 120;
    }}
  }} catch (e) {{
    console.warn("Audio features error", e);
  }}

  function audioColor(e, v) {{
    const r = Math.floor(80 + e * 160);
    const g = Math.floor(80 + v * 160);
    const b = Math.floor(100 + (1-e) * 90);
    return "rgb(" + r + "," + g + "," + b + ")";
  }}

  const color = audioColor(energy, valence);

  container.innerHTML =
    '<div class="nowplaying-card">' +
      '<div class="eq-bars">' +
        '<div class="bar b1"></div>' +
        '<div class="bar b2"></div>' +
        '<div class="bar b3"></div>' +
      '</div>' +
      '<img src="' + art + '" class="np-art" alt="album art">' +
      '<div class="np-info">' +
        '<a href="' + t.external_urls.spotify + '" target="_blank"><strong>' + t.name + '</strong></a><br>' +
        '<span class="artist">' + artist + '</span><br>' +
        '<span class="album">' + t.album.name + '</span>' +
        '<div class="progress-container"><div class="progress-bar" style="width:' + pct + '%"></div></div>' +
        '<div class="player-controls">' +
          '<button onclick="control(\'prev\')">⏮</button>' +
          '<button id="playpause-btn">⏯</button>' +
          '<button onclick="control(\'next\')">⏭</button>' +
        '</div>' +
        '<div class="waveform-container"><canvas id="waveform" width="320" height="60"></canvas></div>' +
      '</div>' +
    '</div>';

  const playBtn = document.getElementById("playpause-btn");
  if (playBtn) {{
    playBtn.innerHTML = data.is_playing ? "⏸" : "▶️";
    playBtn.onclick = () => control(data.is_playing ? "pause" : "play");
  }}

  const canvas = document.getElementById("waveform");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  let t0 = 0;

  function draw() {{
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0,0,w,h);

    const bars = 40;
    const barWidth = w / bars;

    for (let i = 0; i < bars; i++) {{
      const phase = (i / bars) * Math.PI * 2;
      const amp = 0.4 + 0.6 * Math.sin(phase + t0);
      const barHeight = amp * (h - 10);
      const x = i * barWidth;
      const y = (h - barHeight) / 2;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, barWidth * 0.7, barHeight);
    }}

    t0 += (tempo / 120) * 0.02;
    window.waveformAnim = requestAnimationFrame(draw);
  }}

  if (window.waveformAnim) cancelAnimationFrame(window.waveformAnim);
  draw();
}}

loadNowPlaying();
setInterval(loadNowPlaying, 10000);
</script>
"""

now_playing_section = js_template.replace("SPOTIFY_TOKEN_HERE", TOKEN)

html_parts = []

html_parts.append("<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'>")
html_parts.append(f"<title>{username}'s Spotify Dashboard</title>")

html_parts.append("""
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
  gap:15px;
  margin-bottom:30px;
}
.header img {
  width:64px;
  height:64px;
  border-radius:50%;
  object-fit:cover;
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
</head><body>
""")

html_parts.append("<div class='header'>")
if avatar:
    html_parts.append(f"<img src='{avatar}' alt='avatar'>")
html_parts.append(f"<h1>{username}'s Spotify Dashboard</h1></div>")

html_parts.append("<h2>Now Playing</h2>")
html_parts.append(now_playing_section)

html_parts.append(f"<h2>Recently Played ({len(tracks[:TARGET])})</h2>")

for t in tracks[:TARGET]:
    html_parts.append("<div class='track'>")
    if t["art"]:
        html_parts.append(f"<img src='{t['art']}' alt='album art'>")
    else:
        html_parts.append("<div style='width:70px;height:70px;border-radius:6px;background:#333;'></div>")
    html_parts.append("<div>")
    html_parts.append(f"<a href='{t['url']}' target='_blank'><strong>{t['name']}</strong></a><br>")
    html_parts.append(f"<span class='artist'>{t['artist']}</span><br>")
    html_parts.append(f"<span class='album'>{t['album']}</span><br>")
    html_parts.append(f"<span class='played'>{t['played_at']}</span>")
    html_parts.append("</div></div>")

html_parts.append("</body></html>")

html_output = "index.html"
with open(os.path.join(os.path.dirname(__file__), html_output), "w", encoding="utf-8") as f:
    f.write("".join(html_parts))

print(f"🌐 Saved HTML → {html_output}")
