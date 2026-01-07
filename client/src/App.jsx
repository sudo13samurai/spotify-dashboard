import React, { useEffect, useMemo, useRef, useState } from "react";

const SERVER_BASE = (import.meta.env.VITE_SERVER_BASE || "https://spotify-dashboard-xw5t.onrender.com").replace(
  /\/$/,
  ""
);

const PIN_KEY = "spotify_dashboard_pins_v1";
const PAGE_SIZE = 15;

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

function ExternalLink({ href, children }) {
  if (!href) return <span>{children}</span>;
  return (
    <a className="link" href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

function CoverThumb({ url, alt = "" }) {
  if (url) return <img className="thumb" src={url} alt={alt} loading="lazy" />;
  return <div className="thumb fallback" />;
}

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const [me, setMe] = useState(null);
  const [player, setPlayer] = useState(null);
  const [devices, setDevices] = useState([]);
  const [targetDeviceId, setTargetDeviceId] = useState("");

  const [progressMs, setProgressMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);

  const [topArtists, setTopArtists] = useState([]);
  const [topTracks, setTopTracks] = useState([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState([]);
  const [playlists, setPlaylists] = useState([]);

  const [expandTopArtists, setExpandTopArtists] = useState(false);
  const [expandTopTracks, setExpandTopTracks] = useState(false);
  const [expandRecents, setExpandRecents] = useState(false);
  const [expandPlaylists, setExpandPlaylists] = useState(false);

  const loginUrl = useMemo(() => `${SERVER_BASE}/auth/login`, [SERVER_BASE]);
  const logoutUrl = useMemo(() => `${SERVER_BASE}/auth/logout`, [SERVER_BASE]);

  const isPlaying = Boolean(player?.is_playing);

  async function refreshStatus() {
    const out = await jget("/auth/status");
    setAuthed(Boolean(out.json?.authed));
  }

  async function loadAll() {
    setLoading(true);
    setMsg("");
    const [meO, st, devs, ta, tt, rp, pls] = await Promise.all([
      jget("/api/me"),
      jget("/api/player/state"),
      jget("/api/player/devices"),
      jget("/api/top-artists?limit=50"),
      jget("/api/top-tracks?limit=50"),
      jget("/api/recently-played?limit=50"),
      jget("/api/playlists?limit=50")
    ]);

    if (meO.status < 400) setMe(meO.json);
    if (st.status < 400) {
      setPlayer(st.json);
      setProgressMs(st.json?.progress_ms ?? 0);
      setDurationMs(st.json?.item?.duration_ms ?? 0);
    }
    if (devs.status < 400) setDevices(devs.json?.devices || []);
    if (ta.status < 400) setTopArtists(ta.json?.items || []);
    if (tt.status < 400) setTopTracks(tt.json?.items || []);
    if (rp.status < 400) setRecentlyPlayed(rp.json?.items || []);
    if (pls.status < 400) setPlaylists(pls.json?.items || []);

    setLoading(false);
  }

  useEffect(() => {
    refreshStatus();
  }, []);

  useEffect(() => {
    if (authed) loadAll();
  }, [authed]);

  async function playPause() {
    await jmut("PUT", isPlaying ? "/api/player/pause" : "/api/player/play");
    loadAll();
  }

  return (
    <div className="page">
      <header className="header">
        <div className="title">
          <h1>Spotify Dashboard</h1>
        </div>
        <div className="actions">
          {!authed ? (
            <a className="btn primary" href={loginUrl}>Connect Spotify</a>
          ) : (
            <>
              <button className="btn ghost" onClick={loadAll} disabled={loading}>Refresh</button>
              <button className="btn danger" onClick={logoutUrl}>Logout</button>
            </>
          )}
        </div>
      </header>

      {!!msg && <div className="card"><div className="muted">{msg}</div></div>}

      {!authed ? (
        <div className="card"><p>Connect Spotify to continue.</p></div>
      ) : (
        <>
          <div className="card">
            <h2>Now Playing</h2>
            {player?.item ? (
              <div style={{ display: "flex", gap: 12 }}>
                <CoverThumb url={player.item.album.images[1]?.url} />
                <div>
                  <ExternalLink href={player.item.external_urls.spotify}>{player.item.name}</ExternalLink>
                  <div className="muted">{player.item.artists.map(a => a.name).join(", ")}</div>
                  <div className="muted">{msToTime(progressMs)} / {msToTime(durationMs)}</div>
                </div>
              </div>
            ) : <div className="muted">Nothing playing</div>}
            <button className="btn ghost" onClick={playPause}>{isPlaying ? "Pause" : "Play"}</button>
          </div>

          <div className="grid">
            {/* Recents */}
            <div className="card">
              <h2>Recently Played</h2>
              {(expandRecents ? recentlyPlayed : recentlyPlayed.slice(0, PAGE_SIZE)).map((r, i) => (
                <div key={i}>{r.track?.name}</div>
              ))}
              {recentlyPlayed.length > PAGE_SIZE && (
                <button className="btn ghost" onClick={() => setExpandRecents(v => !v)}>
                  {expandRecents ? "Less" : "More"}
                </button>
              )}
            </div>

            {/* Top Artists */}
            <div className="card">
              <h2>Top Artists</h2>
              {(expandTopArtists ? topArtists : topArtists.slice(0, PAGE_SIZE)).map(a => (
                <div key={a.id}>{a.name}</div>
              ))}
              {topArtists.length > PAGE_SIZE && (
                <button className="btn ghost" onClick={() => setExpandTopArtists(v => !v)}>
                  {expandTopArtists ? "Less" : "More"}
                </button>
              )}
            </div>

            {/* Top Tracks */}
            <div className="card">
              <h2>Top Tracks</h2>
              {(expandTopTracks ? topTracks : topTracks.slice(0, PAGE_SIZE)).map(t => (
                <div key={t.id}>{t.name}</div>
              ))}
              {topTracks.length > PAGE_SIZE && (
                <button className="btn ghost" onClick={() => setExpandTopTracks(v => !v)}>
                  {expandTopTracks ? "Less" : "More"}
                </button>
              )}
            </div>

            {/* Playlists */}
            <div className="card">
              <h2>Playlists</h2>
              {(expandPlaylists ? playlists : playlists.slice(0, PAGE_SIZE)).map(p => (
                <div key={p.id}>{p.name}</div>
              ))}
              {playlists.length > PAGE_SIZE && (
                <button className="btn ghost" onClick={() => setExpandPlaylists(v => !v)}>
                  {expandPlaylists ? "Less" : "More"}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
