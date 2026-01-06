import React, { useEffect, useMemo, useRef, useState } from "react";

// ✅ IMPORTANT: point the frontend at the REAL backend.
// Set VITE_SERVER_BASE in your frontend build env to override.
// Example: VITE_SERVER_BASE=https://spotify-dashboard-xw5t.onrender.com
const SERVER_BASE =
  (import.meta.env.VITE_SERVER_BASE || "https://spotify-dashboard-xw5t.onrender.com").replace(/\/$/, "");

const PIN_KEY = "spotify_dashboard_pins_v1";

function normPath(p) {
  return p.startsWith("/") ? p : `/${p}`;
}

async function jget(path) {
  const res = await fetch(`${SERVER_BASE}${normPath(path)}`, {
    credentials: "include",
    cache: "no-store",
    headers: {
      "Cache-Control": "no-cache"
    }
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
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function nextRepeatState(state) {
  if (state === "off") return "context";
  if (state === "context") return "track";
  return "off";
}

function safeJsonParse(str, fallback) {
  try {
    const v = JSON.parse(str);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function playlistImageUrl(pl) {
  const url = pl?.images?.[0]?.url;
  return typeof url === "string" && url.length ? url : null;
}

function PillThumb({ playlist }) {
  const img = playlistImageUrl(playlist);
  if (img) return <img className="pillImg" src={img} alt="" />;
  return <span className="pillImgFallback" aria-hidden="true" />;
}

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // Playback state
  const [player, setPlayer] = useState(null); // /me/player response
  const [devices, setDevices] = useState([]);
  const [targetDeviceId, setTargetDeviceId] = useState("");

  // Live progress
  const [progressMs, setProgressMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const seekingRef = useRef(false);

  // Library
  const [topArtists, setTopArtists] = useState([]);
  const [topTracks, setTopTracks] = useState([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState([]);

  // Playlists
  const [playlists, setPlaylists] = useState([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [playlistTracks, setPlaylistTracks] = useState([]);

  // Quick Play pins
  const [pins, setPins] = useState(() => {
    const raw = localStorage.getItem(PIN_KEY);
    const parsed = raw ? safeJsonParse(raw, []) : [];
    return Array.isArray(parsed) ? parsed : [];
  });

  useEffect(() => {
    localStorage.setItem(PIN_KEY, JSON.stringify(pins));
  }, [pins]);

  // ✅ make these react to SERVER_BASE
  #const loginUrl = useMemo(() => `${SERVER_BASE}/auth/login`, [SERVER_BASE]);
  #const logoutUrl = useMemo(() => `${SERVER_BASE}/auth/logout`, [SERVER_BASE]);
  const loginUrl = useMemo(() => `${SERVER_BASE}/auth/login`, [SERVER_BASE]);
  const logoutUrl = useMemo(() => `${SERVER_BASE}/auth/logout`, [SERVER_BASE]);


  const isPlaying = Boolean(player?.is_playing);
  const shuffleOn = Boolean(player?.shuffle_state);
  const repeatState = player?.repeat_state ?? "off";
  const activeDevice = player?.device ?? null;

  // Context label
  const contextType = player?.context?.type ?? "";
  const contextUri = player?.context?.uri ?? "";
  const contextNameGuess = (() => {
    if (!contextUri) return "None";
    if (contextType === "playlist") {
      const pl = playlists.find((p) => p.uri === contextUri);
      return pl ? pl.name : "Playlist";
    }
    if (contextType === "album") return "Album";
    if (contextType === "artist") return "Artist";
    return contextType ? contextType : "Context";
  })();

  async function refreshStatus() {
    const out = await jget("/auth/status");
    const ok = Boolean(out.json?.authed);
    setAuthed(ok);

    // Helpful UI message if backend is returning 403 due to missing cookies/session
    if (!ok && out.status === 403) {
      setMsg("Session not authorized yet. Try reconnecting Spotify.");
    }
  }

  async function loadLibraryAndPlaylists() {
    const [ta, tt, rp, pls] = await Promise.all([
      jget("/api/top-artists?time_range=short_term&limit=10"),
      jget("/api/top-tracks?time_range=short_term&limit=10"),
      jget("/api/recently-played?limit=10"),
      jget("/api/playlists?limit=50&offset=0")
    ]);

    // If any come back 401/403, show the reason (handy for cross-site cookie issues)
    const firstErr = [ta, tt, rp, pls].find((x) => x.status >= 400);
    if (firstErr) {
      const errMsg =
        firstErr?.json?.error ||
        (typeof firstErr?.json === "string" ? firstErr.json : "") ||
        (firstErr.status === 403 ? "Forbidden (session/cookie not being sent)" : `Request failed (${firstErr.status})`);
      setMsg(String(errMsg));
    }

    setTopArtists(Array.isArray(ta.json?.items) ? ta.json.items : []);
    setTopTracks(Array.isArray(tt.json?.items) ? tt.json.items : []);
    setRecentlyPlayed(Array.isArray(rp.json?.items) ? rp.json.items : []);
    setPlaylists(Array.isArray(pls.json?.items) ? pls.json.items : []);
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

  async function loadAll() {
    setLoading(true);
    setMsg("");
    try {
      await Promise.all([syncPlayer(), loadLibraryAndPlaylists()]);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch(logoutUrl, { method: "POST", credentials: "include" });
    await refreshStatus();

    setPlayer(null);
    setDevices([]);
    setTargetDeviceId("");
    setProgressMs(0);
    setDurationMs(0);

    setTopArtists([]);
    setTopTracks([]);
    setRecentlyPlayed([]);

    setPlaylists([]);
    setSelectedPlaylist(null);
    setPlaylistTracks([]);

    setMsg("");
  }

  // --- playback actions ---
  async function playPause() {
    setMsg("");
    const hint = "If controls fail: open Spotify on phone/desktop and start playback once (active device required).";
    const out = isPlaying ? await jmut("PUT", "/api/player/pause") : await jmut("PUT", "/api/player/play");
    if (out.status >= 400) setMsg(out.json?.error ? String(out.json.error) : hint);
    setTimeout(syncPlayer, 600);
  }

  async function nextTrack() {
    setMsg("");
    const out = await jmut("POST", "/api/player/next");
    if (out.status >= 400) setMsg(out.json?.error ? String(out.json.error) : "Next failed.");
    setTimeout(syncPlayer, 700);
  }

  async function prevTrack() {
    setMsg("");
    const out = await jmut("POST", "/api/player/previous");
    if (out.status >= 400) setMsg(out.json?.error ? String(out.json.error) : "Previous failed.");
    setTimeout(syncPlayer, 700);
  }

  async function setVolumePct(v) {
    setMsg("");
    const out = await jmut("PUT", `/api/player/volume?volume=${v}`);
    if (out.status >= 400) setMsg(out.json?.error ? String(out.json.error) : "Volume failed.");
  }

  async function toggleShuffle() {
    setMsg("");
    const next = !shuffleOn;
    const out = await jmut("PUT", `/api/player/shuffle?state=${next}`);
    if (out.status >= 400) setMsg(out.json?.error ? String(out.json.error) : "Shuffle failed.");
    setTimeout(syncPlayer, 500);
  }

  async function cycleRepeat() {
    setMsg("");
    const next = nextRepeatState(repeatState);
    const out = await jmut("PUT", `/api/player/repeat?state=${next}`);
    if (out.status >= 400) setMsg(out.json?.error ? String(out.json.error) : "Repeat failed.");
    setTimeout(syncPlayer, 500);
  }

  async function transferDevice() {
    setMsg("");
    if (!targetDeviceId) return setMsg("Select a device first.");
    const out = await jmut("PUT", "/api/player/transfer", { device_id: targetDeviceId, play: true });
    if (out.status >= 400) setMsg(out.json?.error ? String(out.json.error) : "Transfer failed.");
    setTimeout(syncPlayer, 800);
  }

  async function commitSeek(newMs) {
    setMsg("");
    const out = await jmut("PUT", `/api/player/seek?position_ms=${newMs}`);
    if (out.status >= 400) setMsg(out.json?.error ? String(out.json.error) : "Seek failed.");
    setTimeout(syncPlayer, 450);
  }

  // --- playlists ---
  async function openPlaylist(pl) {
    setSelectedPlaylist(pl);
    setPlaylistTracks([]);
    const out = await jget(`/api/playlists/${pl.id}/tracks?limit=50&offset=0`);
    setPlaylistTracks(Array.isArray(out.json?.items) ? out.json.items : []);
  }

  async function playPlaylistTrack(index) {
    if (!selectedPlaylist?.uri) return;
    setMsg("");
    const body = { context_uri: selectedPlaylist.uri, offset: { position: index }, position_ms: 0 };
    const out = await jmut("PUT", "/api/player/play", body);
    if (out.status >= 400) setMsg(out.json?.error ? String(out.json.error) : "Play failed (active device / Premium?).");
    setTimeout(syncPlayer, 700);
  }

  // --- quick play ---
  function isPinned(id) {
    return pins.includes(id);
  }

  function togglePin(id) {
    setPins((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev].slice(0, 8)));
  }

  async function quickPlayPlaylist(pl) {
    if (!pl?.uri) return;
    setMsg("");
    const out = await jmut("PUT", "/api/player/play", { context_uri: pl.uri, offset: { position: 0 }, position_ms: 0 });
    if (out.status >= 400) setMsg(out.json?.error ? String(out.json.error) : "Quick Play failed (active device / Premium?).");
    setTimeout(syncPlayer, 700);
  }

  const pinnedPlaylists = pins.map((id) => playlists.find((p) => p.id === id)).filter(Boolean);

  const suggestedPins = playlists
    .filter((p) => !pins.includes(p.id))
    .slice(0, Math.max(0, 6 - pinnedPlaylists.length));

  // --- initial load ---
  useEffect(() => {
    refreshStatus();
  }, []);

  useEffect(() => {
    if (authed) loadAll();
  }, [authed]);

  // Live progress tick
  useEffect(() => {
    const id = setInterval(() => {
      if (!player || !player.item) return;
      if (seekingRef.current) return;
      if (!player.is_playing) return;
      setProgressMs((p) => Math.min(p + 1000, durationMs || p + 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [player, durationMs]);

  // Periodic sync
  useEffect(() => {
    if (!authed) return;
    const id = setInterval(() => syncPlayer(), 5000);
    return () => clearInterval(id);
  }, [authed]);

  const nowItem = player?.item ?? null;
  const nowArtists = nowItem?.artists?.map((a) => a.name).join(", ") ?? "";
  const nowAlbum = nowItem?.album?.name ?? "";
  const nowCover = nowItem?.album?.images?.[0]?.url ?? null;

  const seekPct = durationMs > 0 ? Math.round((progressMs / durationMs) * 1000) / 10 : 0;

  return (
    <div className="page">
      <header className="header">
        <div className="title">
          <h1>Spotify Dashboard</h1>
          <p className="sub">
            Two-column, Spotify-green cyber glow — powered by <code>{SERVER_BASE}</code>.
          </p>
        </div>

        <div className="actions">
          {!authed ? (
            <a className="btn primary" href={`${SERVER_BASE}/auth/login`}>
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
          {/* ... the rest of your component stays exactly the same ... */}
        </div>
      )}

      <footer className="footer">
        <span className="muted">
          API: <code>{SERVER_BASE}</code>
        </span>
      </footer>
    </div>
  );
}
