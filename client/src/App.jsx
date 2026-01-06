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

function ExternalLink({ href, children, className }) {
  if (!href) return <span className={className}>{children}</span>;
  return (
    <a className={className} href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

function SmallCover({ url }) {
  const u = imgOrNull(url);
  if (u) return <img className="cover" src={u} alt="" />;
  return <div className="cover fallback" aria-hidden="true" />;
}

function secondsAgoLabel(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const RECENT_RANGES = [
  { key: "24h", label: "Last 24 hours", ms: 24 * 60 * 60 * 1000 },
  { key: "3d", label: "Last 3 days", ms: 3 * 24 * 60 * 60 * 1000 },
  { key: "7d", label: "Last 7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { key: "30d", label: "Last 30 days", ms: 30 * 24 * 60 * 60 * 1000 }
];

function nextRepeatState(state) {
  if (state === "off") return "context";
  if (state === "context") return "track";
  return "off";
}

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // profile
  const [me, setMe] = useState(null);

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
  const [recentRangeKey, setRecentRangeKey] = useState("24h");

  // playlists
  const [playlists, setPlaylists] = useState([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [playlistTracks, setPlaylistTracks] = useState([]);

  // pins
  const [pins, setPins] = useState(() => {
    const raw = localStorage.getItem(PIN_KEY);
    const parsed = raw ? safeJsonParse(raw, []) : [];
    return Array.isArray(parsed) ? parsed : [];
  });

  useEffect(() => {
    localStorage.setItem(PIN_KEY, JSON.stringify(pins));
  }, [pins]);

  const loginUrl = useMemo(() => `${SERVER_BASE}/auth/login`, [SERVER_BASE]);
  const logoutUrl = useMemo(() => `${SERVER_BASE}/auth/logout`, [SERVER_BASE]);

  const isPlaying = Boolean(player?.is_playing);
  const shuffleOn = Boolean(player?.shuffle_state);
  const repeatState = player?.repeat_state ?? "off";

  const nowItem = player?.item ?? null;
  const nowTitle = nowItem?.name ?? "";
  const nowArtists = nowItem?.artists?.map((a) => a.name).join(", ") ?? "";
  const nowAlbum = nowItem?.album?.name ?? "";
  const nowCover = nowItem?.album?.images?.[0]?.url ?? null;
  const nowUrl = nowItem?.external_urls?.spotify ?? null;

  async function refreshStatus() {
    const out = await jget("/auth/status");
    const ok = Boolean(out.json?.authed);
    setAuthed(ok);
    if (!ok && out.status >= 400) {
      setMsg(out.json?.error ? String(out.json.error) : "Not authenticated. Click Connect Spotify.");
    }
  }

  async function loadProfile() {
    // Requires backend route /api/me
    const out = await jget("/api/me");
    if (out.status >= 400) return; // keep quiet if route not added yet
    setMe(out.json);
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
    const recentRange = RECENT_RANGES.find((r) => r.key === recentRangeKey) || RECENT_RANGES[0];
    const after = Date.now() - recentRange.ms;

    const [ta, tt, rp, pls] = await Promise.all([
      jget("/api/top-artists?time_range=short_term&limit=10"),
      jget("/api/top-tracks?time_range=short_term&limit=10"),
      jget(`/api/recently-played?limit=50&after=${after}`),
      jget("/api/playlists?limit=50&offset=0")
    ]);

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
      await Promise.all([loadProfile(), syncPlayer(), loadLibrary()]);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch(logoutUrl, { method: "POST", credentials: "include" });
    setAuthed(false);
    setMe(null);
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

  // ---- player controls ----
  async function playPause() {
    setMsg("");
    const out = isPlaying ? await jmut("PUT", "/api/player/pause") : await jmut("PUT", "/api/player/play");
    if (out.status >= 400) setMsg(out.json?.error ? String(out.json.error) : "Play/Pause failed.");
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

  async function likeTrack(trackId) {
    if (!trackId) return;
    setMsg("");
    // Requires backend route /api/like and scope user-library-modify
    const out = await jmut("PUT", `/api/like?ids=${encodeURIComponent(trackId)}`);
    if (out.status >= 400) {
      setMsg(
        out.json?.error
          ? String(out.json.error)
          : "Like failed. Make sure you added user-library-modify scope and re-authorized."
      );
      return;
    }
    setMsg("Saved to your Liked Songs ✨");
  }

  // ---- playlists ----
  async function openPlaylist(pl) {
    setSelectedPlaylist(pl);
    setPlaylistTracks([]);
    const out = await jget(`/api/playlists/${pl.id}/tracks?limit=50&offset=0`);
    if (out.status >= 400) {
      setMsg(out.json?.error ? String(out.json.error) : "Failed to load playlist tracks.");
      return;
    }
    setPlaylistTracks(Array.isArray(out.json?.items) ? out.json.items : []);
  }

  async function playPlaylist(pl, offsetPos = 0) {
    if (!pl?.uri) return;
    setMsg("");
    const body = { context_uri: pl.uri, offset: { position: offsetPos }, position_ms: 0 };
    const out = await jmut("PUT", "/api/player/play", body);
    if (out.status >= 400) setMsg(out.json?.error ? String(out.json.error) : "Play failed (active device / Premium?).");
    setTimeout(syncPlayer, 700);
  }

  async function playPlaylistTrack(index) {
    if (!selectedPlaylist?.uri) return;
    return playPlaylist(selectedPlaylist, index);
  }

  // ---- pins ----
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

  useEffect(() => {
    if (!authed) return;
    loadLibrary();
  }, [recentRangeKey]);

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
            Two-column, Spotify-green cyber glow — powered by <code>{SERVER_BASE}</code>.
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
          {/* Profile */}
          <div className="card">
            <h2>Profile</h2>
            {me ? (
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <SmallCover url={me?.images?.[0]?.url} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>
                    <ExternalLink href={me?.external_urls?.spotify}>{me?.display_name || "Spotify User"}</ExternalLink>
                  </div>
                  <div className="muted">
                    {me?.product ? `Plan: ${me.product}` : ""}{" "}
                    {typeof me?.followers?.total === "number" ? `• Followers: ${me.followers.total}` : ""}
                  </div>
                  <div className="muted">{me?.email ? me.email : ""}</div>
                </div>
              </div>
            ) : (
              <div className="muted">Add backend route /api/me to show profile.</div>
            )}
          </div>

          {/* Now Playing + Controls */}
          <div className="card">
            <h2>Now Playing</h2>
            {nowItem ? (
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <SmallCover url={nowCover} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800 }}>
                    <ExternalLink href={nowUrl}>{nowTitle}</ExternalLink>
                  </div>
                  <div className="muted">
                    {nowItem?.artists?.map((a, idx) => (
                      <span key={a.id}>
                        <ExternalLink href={a?.external_urls?.spotify}>{a.name}</ExternalLink>
                        {idx < nowItem.artists.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  </div>
                  <div className="muted">
                    <ExternalLink href={nowItem?.album?.external_urls?.spotify}>{nowAlbum}</ExternalLink>
                  </div>
                  <div className="muted">
                    {msToTime(progressMs)} / {msToTime(durationMs)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="muted">Nothing playing (open Spotify and start a track).</div>
            )}

            <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button className="btn ghost" onClick={prevTrack} title="Previous">
                ◀◀
              </button>
              <button className="btn ghost" onClick={playPause} title={isPlaying ? "Pause" : "Play"}>
                {isPlaying ? "Pause" : "Play"}
              </button>
              <button className="btn ghost" onClick={nextTrack} title="Next">
                ▶▶
              </button>
              <button className="btn ghost" onClick={toggleShuffle} title="Shuffle">
                Shuffle: {shuffleOn ? "On" : "Off"}
              </button>
              <button className="btn ghost" onClick={cycleRepeat} title="Repeat">
                Repeat: {repeatState}
              </button>
              <button
                className="btn ghost"
                onClick={() => likeTrack(nowItem?.id)}
                title="Save to Liked Songs"
                disabled={!nowItem?.id}
              >
                + Like
              </button>
            </div>

            <div style={{ marginTop: 14 }}>
              <h3 style={{ marginBottom: 8 }}>Device</h3>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select value={targetDeviceId} onChange={(e) => setTargetDeviceId(e.target.value)} style={{ flex: 1 }}>
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

          {/* Top Tracks */}
          <div className="card">
            <h2>Top Tracks</h2>
            {topTracks.length ? (
              <ol>
                {topTracks.map((t) => (
                  <li key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700 }}>
                        <ExternalLink href={t?.external_urls?.spotify}>{t.name}</ExternalLink>
                      </div>
                      <div className="muted">
                        {t?.artists?.map((a, idx) => (
                          <span key={a.id}>
                            <ExternalLink href={a?.external_urls?.spotify}>{a.name}</ExternalLink>
                            {idx < t.artists.length - 1 ? ", " : ""}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button className="btn ghost" onClick={() => likeTrack(t.id)} title="Save to Liked Songs">
                      + Like
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="muted">No tracks loaded yet.</div>
            )}
          </div>

          {/* Top Artists */}
          <div className="card">
            <h2>Top Artists</h2>
            {topArtists.length ? (
              <ol>
                {topArtists.map((a) => (
                  <li key={a.id}>
                    <div style={{ fontWeight: 700 }}>
                      <ExternalLink href={a?.external_urls?.spotify}>{a.name}</ExternalLink>
                    </div>
                    <div className="muted">{a.genres?.slice(0, 3).join(", ") || "no genres"}</div>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="muted">No artists loaded yet.</div>
            )}
          </div>

          {/* Recently Played + Range selector */}
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <h2 style={{ margin: 0 }}>Recently Played</h2>
              <select value={recentRangeKey} onChange={(e) => setRecentRangeKey(e.target.value)}>
                {RECENT_RANGES.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            {recentlyPlayed.length ? (
              <ol style={{ marginTop: 12 }}>
                {recentlyPlayed.map((it, idx) => {
                  const tr = it?.track;
                  if (!tr) return null;
                  return (
                    <li key={`${tr.id}-${idx}`}>
                      <div style={{ fontWeight: 700 }}>
                        <ExternalLink href={tr?.external_urls?.spotify}>{tr.name}</ExternalLink>
                      </div>
                      <div className="muted">
                        {tr?.artists?.map((a, i) => (
                          <span key={a.id}>
                            <ExternalLink href={a?.external_urls?.spotify}>{a.name}</ExternalLink>
                            {i < tr.artists.length - 1 ? ", " : ""}
                          </span>
                        ))}{" "}
                        • {secondsAgoLabel(it?.played_at)}
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="muted">No recent plays loaded yet.</div>
            )}
          </div>

          {/* Playlists (clickable + playable) */}
          <div className="card">
            <h2>Playlists</h2>

            {!!pinnedPlaylists.length && (
              <>
                <div className="muted" style={{ marginBottom: 10 }}>
                  Pinned: {pinnedPlaylists.map((p) => p.name).join(" • ")}
                </div>
              </>
            )}

            {playlists.length ? (
              <ul style={{ listStyle: "none", paddingLeft: 0, margin: 0 }}>
                {playlists.slice(0, 30).map((p) => (
                  <li
                    key={p.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "8px 0",
                      borderBottom: "1px solid rgba(255,255,255,0.06)"
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700 }}>
                        <span
                          style={{ cursor: "pointer" }}
                          onClick={() => openPlaylist(p)}
                          title="Open playlist tracks"
                        >
                          {p.name}
                        </span>{" "}
                        <span className="muted">({p.tracks?.total ?? 0})</span>
                      </div>
                      <div className="muted">
                        <ExternalLink href={p?.external_urls?.spotify}>Open on Spotify</ExternalLink>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn ghost" onClick={() => playPlaylist(p, 0)} title="Play playlist">
                        Play
                      </button>
                      <button className="btn ghost" onClick={() => togglePin(p.id)} title="Pin / unpin">
                        {pins.includes(p.id) ? "Unpin" : "Pin"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="muted">No playlists loaded yet.</div>
            )}
          </div>

          {/* Playlist Tracks viewer */}
          <div className="card">
            <h2>{selectedPlaylist ? `Playlist: ${selectedPlaylist.name}` : "Playlist Tracks"}</h2>
            {!selectedPlaylist ? (
              <div className="muted">Click a playlist name to load tracks, then click a track to play it.</div>
            ) : playlistTracks.length ? (
              <ol>
                {playlistTracks.map((row, idx) => {
                  const tr = row?.track;
                  if (!tr) return null;
                  return (
                    <li
                      key={`${tr.id || idx}`}
                      style={{ cursor: "pointer" }}
                      onClick={() => playPlaylistTrack(idx)}
                      title="Click to play this track"
                    >
                      <div style={{ fontWeight: 700 }}>
                        <ExternalLink href={tr?.external_urls?.spotify}>{tr?.name || "Unknown track"}</ExternalLink>
                      </div>
                      <div className="muted">
                        {tr?.artists?.map((a, i) => (
                          <span key={a.id}>
                            <ExternalLink href={a?.external_urls?.spotify}>{a.name}</ExternalLink>
                            {i < tr.artists.length - 1 ? ", " : ""}
                          </span>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <div className="muted">Loading tracks…</div>
            )}
          </div>
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
