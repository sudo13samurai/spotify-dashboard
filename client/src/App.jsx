import React, { useEffect, useMemo, useRef, useState } from "react";

// Backend base (Render service). You can override at build-time:
// VITE_SERVER_BASE=https://spotify-dashboard-xw5t.onrender.com
const SERVER_BASE = (import.meta.env.VITE_SERVER_BASE || "https://spotify-dashboard-xw5t.onrender.com").replace(
  /\/$/,
  ""
);

const PIN_KEY = "spotify_dashboard_pins_v1";

function normPath(p) {
  return p.startsWith("/") ? p : `/${p}`;
}

async function jget(path) {
  const res = await fetch(`${SERVER_BASE}${normPath(path)}`, {
    credentials: "include",
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" }
  });

  if (res.status === 204) return { status: 204, json: null };

  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function jmut(method, path, body = null) {
  const res = await fetch(`${SERVER_BASE}${normPath(path)}`, {
    method,
    credentials: "include",
    cache: "no-store",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      "Cache-Control": "no-cache"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (res.status === 204) return { status: 204, json: null };

  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

function msToTime(ms) {
  const s = Math.max(0, Math.floor((ms || 0) / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function safeJsonParse(str, fallback) {
  try {
    const v = JSON.parse(str);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function imgOrNull(url) {
  return typeof url === "string" && url.length ? url : null;
}

function SmallCover({ url }) {
  const u = imgOrNull(url);
  if (u) return <img className="cover" src={u} alt="" />;
  return <div className="cover fallback" aria-hidden="true" />;
}

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // playback
  const [player, setPlayer] = useState(null);
  const [devices, setDevices] = useState([]);
  const [targetDeviceId, setTargetDeviceId] = useState("");

  const [progressMs, setProgressMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const seekingRef = useRef(false);

  // library
  const [topArtists, setTopArtists] = useState([]);
  const [topTracks, setTopTracks] = useState([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState([]);

  // playlists
  const [playlists, setPlaylists] = useState([]);

  // pins
  const [pins, setPins] = useState(() => {
    const raw = localStorage.getItem(PIN_KEY);
    const parsed = raw ? safeJsonParse(raw, []) : [];
    return Array.isArray(parsed) ? parsed : [];
  });

  useEffect(() => {
    localStorage.setItem(PIN_KEY, JSON.stringify(pins));
  }, [pins]);

  const loginUrl = useMemo(() => `${SERVER_BASE}/auth/login`, []);
  const logoutUrl = useMemo(() => `${SERVER_BASE}/auth/logout`, []);

  const isPlaying = Boolean(player?.is_playing);
  const nowItem = player?.item ?? null;
  const nowTitle = nowItem?.name ?? "";
  const nowArtists = nowItem?.artists?.map((a) => a.name).join(", ") ?? "";
  const nowAlbum = nowItem?.album?.name ?? "";
  const nowCover = nowItem?.album?.images?.[0]?.url ?? null;

  async function refreshStatus() {
    const out = await jget("/auth/status");
    const ok = Boolean(out.json?.authed);
    setAuthed(ok);
    if (!ok && out.status >= 400) {
      setMsg(out.json?.error ? String(out.json.error) : "Not authenticated. Click Connect Spotify.");
    }
  }

  async function syncPlayer() {
    const [st, devs] = await Promise.all([jget("/api/player/state"), jget("/api/player/devices")]);

    if (st.status === 204) {
      setPlayer(null);
      if (!seekingRef.current) {
        setProgressMs(0);
        setDurationMs(0);
      }
    } else {
      setPlayer(st.json);
      if (!seekingRef.current) {
        setProgressMs(st.json?.progress_ms ?? 0);
        setDurationMs(st.json?.item?.duration_ms ?? 0);
      }
    }

    const list = Array.isArray(devs.json?.devices) ? devs.json.devices : [];
    setDevices(list);

    const activeId = st.json?.device?.id;
    if (activeId && !targetDeviceId) setTargetDeviceId(activeId);
  }

  async function loadLibrary() {
    const [ta, tt, rp, pls] = await Promise.all([
      jget("/api/top-artists?time_range=short_term&limit=10"),
      jget("/api/top-tracks?time_range=short_term&limit=10"),
      jget("/api/recently-played?limit=10"),
      jget("/api/playlists?limit=50&offset=0")
    ]);

    // show any API error text in the UI
    const firstBad = [ta, tt, rp, pls].find((x) => x.status >= 400);
    if (firstBad) {
      setMsg(firstBad.json?.error ? String(firstBad.json.error) : `Request failed (${firstBad.status})`);
    }

    setTopArtists(Array.isArray(ta.json?.items) ? ta.json.items : []);
    setTopTracks(Array.isArray(tt.json?.items) ? tt.json.items : []);
    setRecentlyPlayed(Array.isArray(rp.json?.items) ? rp.json.items : []);
    setPlaylists(Array.isArray(pls.json?.items) ? pls.json.items : []);
  }

  async function loadAll() {
    setLoading(true);
    setMsg("");
    try {
      await Promise.all([syncPlayer(), loadLibrary()]);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch(logoutUrl, { method: "POST", credentials: "include" });
    setAuthed(false);
    setPlayer(null);
    setDevices([]);
    setTargetDeviceId("");
    setProgressMs(0);
    setDurationMs(0);
    setTopArtists([]);
    setTopTracks([]);
    setRecentlyPlayed([]);
    setPlaylists([]);
    setMsg("");
  }

  async function playPause() {
    setMsg("");
    const out = isPlaying ? await jmut("PUT", "/api/player/pause") : await jmut("PUT", "/api/player/play");
    if (out.status >= 400) setMsg(out.json?.error ? String(out.json.error) : "Play/Pause failed.");
    setTimeout(syncPlayer, 600);
  }

  async function transferDevice() {
    setMsg("");
    if (!targetDeviceId) return setMsg("Select a device first.");
    const out = await jmut("PUT", "/api/player/transfer", { device_id: targetDeviceId, play: true });
    if (out.status >= 400) setMsg(out.json?.error ? String(out.json.error) : "Transfer failed.");
    setTimeout(syncPlayer, 800);
  }

  function togglePin(id) {
    setPins((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev].slice(0, 8)));
  }

  const pinnedPlaylists = pins.map((id) => playlists.find((p) => p.id === id)).filter(Boolean);

  // initial
  useEffect(() => {
    refreshStatus();
  }, []);

  useEffect(() => {
    if (authed) loadAll();
  }, [authed]);

  // live progress tick
  useEffect(() => {
    const id = setInterval(() => {
      if (!player || !player.item) return;
      if (seekingRef.current) return;
      if (!player.is_playing) return;
      setProgressMs((p) => Math.min(p + 1000, durationMs || p + 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [player, durationMs]);

  // periodic sync
  useEffect(() => {
    if (!authed) return;
    const id = setInterval(() => syncPlayer(), 5000);
    return () => clearInterval(id);
  }, [authed]);

  return (
    <div className="page">
      <header className="header">
        <div className="title">
          <h1>Spotify Dashboard</h1>
          <p className="sub">
            Two-column, Spotify-green cyber glow — powered by <code>https://tildeath.site</code>.
          </p>
        </div>

        <div className="actions">
          {!authed ? (
            <a className="btn primary" href={loginUrl}>
              Connect Spotify
            </a>
          ) : (
            <>
              <button className="btn ghost" onClick={loadAll} disabled={loading}>
                Refresh
              </button>
              <button className="btn danger" onClick={logout}>
                Logout
              </button>
            </>
          )}
        </div>
      </header>

      {!!msg && (
        <div className="card" style={{ minHeight: "unset", marginBottom: 14 }}>
          <div className="muted">{msg}</div>
        </div>
      )}

      {!authed ? (
        <div className="card" style={{ minHeight: "unset" }}>
          <h2>Not connected</h2>
          <p>
            Click <b>Connect Spotify</b> to authorize.
          </p>
          <p className="muted">
            Redirect URI must match exactly:
            <br />
            <code>https://spotify-dashboard-xw5t.onrender.com/callback</code>
          </p>
        </div>
      ) : (
        <div className="grid">
          <div className="card">
            <h2>Now Playing</h2>
            {nowItem ? (
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <SmallCover url={nowCover} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{nowTitle}</div>
                  <div className="muted">{nowArtists}</div>
                  <div className="muted">{nowAlbum}</div>
                  <div className="muted">
                    {msToTime(progressMs)} / {msToTime(durationMs)}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn ghost" onClick={playPause}>
                    {isPlaying ? "Pause" : "Play"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="muted">Nothing playing (open Spotify and start a track).</div>
            )}

            <div style={{ marginTop: 14 }}>
              <h3 style={{ marginBottom: 8 }}>Device</h3>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select
                  value={targetDeviceId}
                  onChange={(e) => setTargetDeviceId(e.target.value)}
                  style={{ flex: 1 }}
                >
                  <option value="">Select a device…</option>
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} {d.is_active ? "(active)" : ""}
                    </option>
                  ))}
                </select>
                <button className="btn ghost" onClick={transferDevice}>
                  Transfer
                </button>
              </div>
              <div className="muted" style={{ marginTop: 6 }}>
                If controls fail, start playback on your phone/desktop once to activate a device.
              </div>
            </div>
          </div>

          <div className="card">
            <h2>Top Tracks</h2>
            {topTracks.length ? (
              <ol>
                {topTracks.map((t) => (
                  <li key={t.id}>
                    <span style={{ fontWeight: 600 }}>{t.name}</span>{" "}
                    <span className="muted">— {t.artists?.map((a) => a.name).join(", ")}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="muted">No tracks loaded yet.</div>
            )}
          </div>

          <div className="card">
            <h2>Top Artists</h2>
            {topArtists.length ? (
              <ol>
                {topArtists.map((a) => (
                  <li key={a.id}>
                    <span style={{ fontWeight: 600 }}>{a.name}</span>{" "}
                    <span className="muted">({a.genres?.slice(0, 2).join(", ") || "no genres"})</span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="muted">No artists loaded yet.</div>
            )}
          </div>

          <div className="card">
            <h2>Recently Played</h2>
            {recentlyPlayed.length ? (
              <ol>
                {recentlyPlayed.map((it, idx) => {
                  const tr = it?.track;
                  if (!tr) return null;
                  return (
                    <li key={`${tr.id}-${idx}`}>
                      <span style={{ fontWeight: 600 }}>{tr.name}</span>{" "}
                      <span className="muted">— {tr.artists?.map((a) => a.name).join(", ")}</span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="muted">No recent plays loaded yet.</div>
            )}
          </div>

          <div className="card">
            <h2>Playlists</h2>
            {playlists.length ? (
              <ul style={{ listStyle: "none", paddingLeft: 0 }}>
                {playlists.slice(0, 20).map((p) => (
                  <li
                    key={p.id}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                      <div className="muted">{p.tracks?.total ?? 0} tracks</div>
                    </div>
                    <button className="btn ghost" onClick={() => togglePin(p.id)}>
                      {pins.includes(p.id) ? "Unpin" : "Pin"}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="muted">No playlists loaded yet.</div>
            )}

            {!!pinnedPlaylists.length && (
              <>
                <h3 style={{ marginTop: 14 }}>Pinned</h3>
                <div className="muted">{pinnedPlaylists.map((p) => p.name).join(" • ")}</div>
              </>
            )}
          </div>
        </div>
      )}

      <footer className="footer">
        <span className="muted">
          API: <code>https://tildeath.site</code>
        </span>
      </footer>
    </div>
  );
}
