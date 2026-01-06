import React, { useEffect, useMemo, useRef, useState } from "react";

const SERVER_BASE = (import.meta.env.VITE_SERVER_BASE || "https://spotify-dashboard-xw5t.onrender.com").replace(
  /\/$/,
  ""
);

const SITE_NAME = "tildeath.site";
const SITE_URL = "https://tildeath.site";

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

function ExternalLink({ href, children }) {
  if (!href) return <span>{children}</span>;
  return (
    <a className="link" href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

function CoverThumb({ url, alt = "" }) {
  const u = imgOrNull(url);
  if (u) return <img className="thumb" src={u} alt={alt} loading="lazy" />;
  return <div className="thumb fallback" aria-hidden="true" />;
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

function sliceMaybe(arr, expanded) {
  if (!Array.isArray(arr)) return [];
  return expanded ? arr : arr.slice(0, PAGE_SIZE);
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

  // queue/jam
  const [queue, setQueue] = useState([]);
  const [queueError, setQueueError] = useState("");

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

  // show-more toggles
  const [expandRecents, setExpandRecents] = useState(false);
  const [expandQueue, setExpandQueue] = useState(false);
  const [expandPlaylists, setExpandPlaylists] = useState(false);
  const [expandPlaylistTracks, setExpandPlaylistTracks] = useState(false);
  const [expandTopArtists, setExpandTopArtists] = useState(false);
  const [expandTopTracks, setExpandTopTracks] = useState(false);

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
  const nowArtists = nowItem?.artists ?? [];
  const nowAlbum = nowItem?.album?.name ?? "";
  const nowCover =
    nowItem?.album?.images?.[2]?.url || nowItem?.album?.images?.[1]?.url || nowItem?.album?.images?.[0]?.url || null;
  const nowUrl = nowItem?.external_urls?.spotify ?? null;

  // profile bits
  const meName = me?.display_name || "Spotify";
  const meUrl = me?.external_urls?.spotify ?? null;
  const mePic = me?.images?.[0]?.url ?? null;

  async function refreshStatus() {
    const out = await jget("/auth/status");
    const ok = Boolean(out.json?.authed);
    setAuthed(ok);
    if (!ok && out.status >= 400) {
      setMsg(out.json?.error ? String(out.json.error) : "Not authenticated. Click Connect Spotify.");
    }
  }

  async function loadProfile() {
    const out = await jget("/api/me");
    if (out.status >= 400) return;
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

  async function loadQueue() {
    setQueueError("");
    const out = await jget("/api/player/queue");
    if (out.status >= 400) {
      setQueue([]);
      setQueueError(
        out.status === 404
          ? "Queue route not found (add /api/player/queue on the backend)."
          : out.json?.error
            ? String(out.json.error)
            : `Queue request failed (${out.status})`
      );
      return;
    }

    // Spotify returns: { currently_playing: <track>, queue: [tracks...] }
    const q = Array.isArray(out.json?.queue) ? out.json.queue : [];
    setQueue(q);
  }

  async function loadLibrary() {
    const recentRange = RECENT_RANGES.find((r) => r.key === recentRangeKey) || RECENT_RANGES[0];
    const after = Date.now() - recentRange.ms;

    const [rp, pls, ta, tt] = await Promise.all([
      jget(`/api/recently-played?limit=50&after=${after}`),
      jget("/api/playlists?limit=50&offset=0"),
      jget("/api/top-artists?time_range=short_term&limit=50"),
      jget("/api/top-tracks?time_range=short_term&limit=50")
    ]);

    const firstBad = [rp, pls, ta, tt].find((x) => x.status >= 400);
    if (firstBad) {
      setMsg(firstBad.json?.error ? String(firstBad.json.error) : `Request failed (${firstBad.status})`);
    }

    setRecentlyPlayed(Array.isArray(rp.json?.items) ? rp.json.items : []);
    setPlaylists(Array.isArray(pls.json?.items) ? pls.json.items : []);
    setTopArtists(Array.isArray(ta.json?.items) ? ta.json.items : []);
    setTopTracks(Array.isArray(tt.json?.items) ? tt.json.items : []);
  }

  async function loadAll() {
    setLoading(true);
    setMsg("");
    try {
      await Promise.all([loadProfile(), syncPlayer(), loadLibrary(), loadQueue()]);
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

    setRecentlyPlayed([]);
    setQueue([]);
    setQueueError("");

    setPlaylists([]);
    setSelectedPlaylist(null);
    setPlaylistTracks([]);

    setTopArtists([]);
    setTopTracks([]);

    setExpandRecents(false);
    setExpandQueue(false);
    setExpandPlaylists(false);
    setExpandPlaylistTracks(false);
    setExpandTopArtists(false);
    setExpandTopTracks(false);

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
    const out = await jmut("PUT", `/api/like?ids=${encodeURIComponent(trackId)}`);
    if (out.status >= 400) {
      setMsg(
        out.json?.error
          ? String(out.json.error)
          : "Like failed. Add user-library-modify scope + backend /api/like route, then re-auth."
      );
      return;
    }
    setMsg("Saved to your Liked Songs ✨");
  }

  // ---- playlists ----
  async function openPlaylist(pl) {
    setSelectedPlaylist(pl);
    setPlaylistTracks([]);
    setExpandPlaylistTracks(false);

    const out = await jget(`/api/playlists/${pl.id}/tracks?limit=100&offset=0`);
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
    setExpandRecents(false);
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

  const recentsView = sliceMaybe(recentlyPlayed, expandRecents);
  const queueView = sliceMaybe(queue, expandQueue);
  const playlistsView = sliceMaybe(playlists, expandPlaylists);
  const playlistTracksView = sliceMaybe(playlistTracks, expandPlaylistTracks);
  const topArtistsView = sliceMaybe(topArtists, expandTopArtists);
  const topTracksView = sliceMaybe(topTracks, expandTopTracks);

  return (
    <div className="page">
<header className="header">
  <div className="title">
    <div className="brandRow">
      <a
        className="brandAvatarLink"
        href={me?.external_urls?.spotify || "https://open.spotify.com"}
        target="_blank"
        rel="noreferrer"
        title={me?.display_name ? `Open ${me.display_name} on Spotify` : "Open Spotify"}
      >
        {me?.images?.[0]?.url ? (
          <img className="brandAvatar" src={me.images[0].url} alt={me.display_name || "Profile"} />
        ) : (
          <div className="brandAvatar brandAvatarFallback" aria-hidden="true" />
        )}
      </a>

      <div className="brandText">
        <div className="brandName">
          <ExternalLink href={me?.external_urls?.spotify}>{me?.display_name || "Spotify"}</ExternalLink>
        </div>
        <p className="sub" style={{ margin: 0 }}>
          Two-column, Spotify-green cyber glow — powered by{" "}
          <a className="link" href="https://tildeath.site" target="_blank" rel="noreferrer">
            tildeath.site
          </a>
          .
        </p>
      </div>
    </div>
  </div>

  <div className="actions">
    {!authed ? (
      <a className="btn primary" href={loginUrl}>Connect Spotify</a>
    ) : (
      <>
        <button className="btn ghost" onClick={loadAll} disabled={loading}>Refresh</button>
        <button className="btn danger" onClick={logout}>Logout</button>
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
        <>
          {/* Top strip: profile + now playing */}
          <div className="card topStrip">
            <div className="topStripRow">
              <div className="topStripLeft">
                <CoverThumb url={me?.images?.[0]?.url} alt="Profile" />
                <div className="topStripMeta">
                  <div className="topStripName">
                    <ExternalLink href={meUrl}>{meName}</ExternalLink>
                  </div>
                  <div className="muted">
                    {me?.product ? `Plan: ${me.product}` : ""}{" "}
                    {typeof me?.followers?.total === "number" ? `• Followers: ${me.followers.total}` : ""}
                  </div>
                </div>
              </div>

              <div className="topStripNow">
                <div className="nowRow">

<div className="nowCoverWrap">
  <div className={`bgBars ${isPlaying ? "on" : ""}`} aria-hidden="true">
    {Array.from({ length: 18 }).map((_, i) => (
      <span key={i} />
    ))}
  </div>

  <CoverThumb url={nowCover} alt="Now playing cover" />
</div>
                  <div className="nowMeta">
                    <div className="nowTitle">
                      {nowItem ? <ExternalLink href={nowUrl}>{nowTitle}</ExternalLink> : <span className="muted">Nothing playing</span>}
                    </div>
                    {!!nowItem && (
                      <div className="muted">
                        {nowArtists.map((a, idx) => (
                          <span key={a.id || idx}>
                            <ExternalLink href={a?.external_urls?.spotify}>{a.name}</ExternalLink>
                            {idx < nowArtists.length - 1 ? ", " : ""}
                          </span>
                        ))}
                        {nowAlbum ? (
                          <>
                            {" "}
                            • <ExternalLink href={nowItem?.album?.external_urls?.spotify}>{nowAlbum}</ExternalLink>
                          </>
                        ) : null}
                      </div>
                    )}
                    <div className="muted">
                      {msToTime(progressMs)} / {msToTime(durationMs)}
                    </div>
                  </div>

                  <div className="controls">
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
                      Shuf
                    </button>
                    <button className="btn ghost" onClick={cycleRepeat} title="Repeat">
                      Rep
                    </button>
                    <button className="btn ghost" onClick={() => likeTrack(nowItem?.id)} title="Save to Liked Songs" disabled={!nowItem?.id}>
                      +Like
                    </button>

                    <div className={`viz ${isPlaying ? "on" : ""}`} title="Visualizer">
                      <span />
                      <span />
                      <span />
                      <span />
                      <span />
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                </div>

                <div className="deviceRow">
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
              </div>
            </div>
          </div>

          {/* SECTION 1: Playlists + Playlist tracks (top, under player) */}
          <div className="grid">
            <div className="card">
              <h2>Playlists</h2>

              {!!pinnedPlaylists.length && (
                <div className="muted" style={{ marginBottom: 10 }}>
                  Pinned: {pinnedPlaylists.map((p) => p.name).join(" • ")}
                </div>
              )}

              {playlistsView.length ? (
                <ul className="list">
                  {playlistsView.map((p) => {
                    const cover = p?.images?.[2]?.url || p?.images?.[1]?.url || p?.images?.[0]?.url || null;
                    return (
                      <li key={p.id} className={`row ${selectedPlaylist?.id === p.id ? "activeRow" : ""}`}>
                        <CoverThumb url={cover} alt="" />
                        <div className="rowMeta">
                          <div className="rowTitle">
                            <span className="linkLike" onClick={() => openPlaylist(p)} title="Open playlist tracks">
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
                    );
                  })}
                </ul>
              ) : (
                <div className="muted">No playlists loaded yet.</div>
              )}

              {playlists.length > PAGE_SIZE && (
                <button className="btn ghost moreBtn" onClick={() => setExpandPlaylists((v) => !v)}>
                  {expandPlaylists ? "Less" : "More"}
                </button>
              )}
            </div>

            <div className="card">
              <h2>{selectedPlaylist ? selectedPlaylist.name : "Playlist Tracks"}</h2>

              {!selectedPlaylist ? (
                <div className="muted">Click a playlist to load tracks. Click a track to play it.</div>
              ) : playlistTracksView.length ? (
                <ul className="list">
                  {playlistTracksView.map((row, idx) => {
                    const tr = row?.track;
                    if (!tr) return null;
                    const cover =
                      tr?.album?.images?.[2]?.url || tr?.album?.images?.[1]?.url || tr?.album?.images?.[0]?.url || null;

                    return (
                      <li
                        key={`${tr.id || idx}`}
                        className="row clickable"
                        onClick={() => playPlaylistTrack(idx)}
                        title="Click to play this track"
                      >
                        <CoverThumb url={cover} alt="" />
                        <div className="rowMeta">
                          <div className="rowTitle">
                            <ExternalLink href={tr?.external_urls?.spotify}>{tr?.name || "Unknown track"}</ExternalLink>
                          </div>
                          <div className="muted">
                            {tr?.artists?.map((a, i) => (
                              <span key={a.id || i}>
                                <ExternalLink href={a?.external_urls?.spotify}>{a.name}</ExternalLink>
                                {i < tr.artists.length - 1 ? ", " : ""}
                              </span>
                            ))}
                          </div>
                        </div>
                        <button
                          className="btn ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            likeTrack(tr.id);
                          }}
                          title="Save to Liked Songs"
                        >
                          +Like
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="muted">Loading tracks…</div>
              )}

              {selectedPlaylist && playlistTracks.length > PAGE_SIZE && (
                <button className="btn ghost moreBtn" onClick={() => setExpandPlaylistTracks((v) => !v)}>
                  {expandPlaylistTracks ? "Less" : "More"}
                </button>
              )}
            </div>

            {/* SECTION 2: Recently Played */}
            <div className="card">
              <div className="cardHeadRow">
                <h2 style={{ margin: 0 }}>Recently Played</h2>
                <select value={recentRangeKey} onChange={(e) => setRecentRangeKey(e.target.value)}>
                  {RECENT_RANGES.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              {recentsView.length ? (
                <ul className="list">
                  {recentsView.map((it, idx) => {
                    const tr = it?.track;
                    if (!tr) return null;
                    const cover =
                      tr?.album?.images?.[2]?.url || tr?.album?.images?.[1]?.url || tr?.album?.images?.[0]?.url || null;
                    return (
                      <li key={`${tr.id}-${idx}`} className="row">
                        <CoverThumb url={cover} alt="" />
                        <div className="rowMeta">
                          <div className="rowTitle">
                            <ExternalLink href={tr?.external_urls?.spotify}>{tr.name}</ExternalLink>
                          </div>
                          <div className="muted">
                            {tr?.artists?.map((a, i) => (
                              <span key={a.id || i}>
                                <ExternalLink href={a?.external_urls?.spotify}>{a.name}</ExternalLink>
                                {i < tr.artists.length - 1 ? ", " : ""}
                              </span>
                            ))}{" "}
                            • {secondsAgoLabel(it?.played_at)}
                          </div>
                        </div>
                        <button className="btn ghost" onClick={() => likeTrack(tr.id)} title="Save to Liked Songs">
                          +Like
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="muted">No recent plays loaded yet.</div>
              )}

              {recentlyPlayed.length > PAGE_SIZE && (
                <button className="btn ghost moreBtn" onClick={() => setExpandRecents((v) => !v)}>
                  {expandRecents ? "Less" : "More"}
                </button>
              )}
            </div>

            {/* SECTION 3: Queue / Jam */}
            <div className="card">
              <div className="cardHeadRow">
                <h2 style={{ margin: 0 }}>Queue / Jam</h2>
                <button className="btn ghost" onClick={loadQueue} disabled={loading}>
                  Refresh
                </button>
              </div>

              {queueError ? <div className="muted">{queueError}</div> : null}

              {queueView.length ? (
                <ul className="list">
                  {queueView.map((t, idx) => {
                    const cover =
                      t?.album?.images?.[2]?.url || t?.album?.images?.[1]?.url || t?.album?.images?.[0]?.url || null;
                    return (
                      <li key={`${t.id || idx}`} className="row">
                        <CoverThumb url={cover} alt="" />
                        <div className="rowMeta">
                          <div className="rowTitle">
                            <ExternalLink href={t?.external_urls?.spotify}>{t?.name || "Unknown track"}</ExternalLink>
                          </div>
                          <div className="muted">
                            {t?.artists?.map((a, i) => (
                              <span key={a.id || i}>
                                <ExternalLink href={a?.external_urls?.spotify}>{a.name}</ExternalLink>
                                {i < t.artists.length - 1 ? ", " : ""}
                              </span>
                            ))}
                          </div>
                        </div>
                        <button className="btn ghost" onClick={() => likeTrack(t.id)} title="Save to Liked Songs">
                          +Like
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="muted">{queueError ? "" : "Queue is empty (or Spotify doesn’t expose it on this device)."}</div>
              )}

              {queue.length > PAGE_SIZE && (
                <button className="btn ghost moreBtn" onClick={() => setExpandQueue((v) => !v)}>
                  {expandQueue ? "Less" : "More"}
                </button>
              )}
            </div>

            {/* SECTION 4: Top Artists */}
            <div className="card">
              <h2>Top Artists</h2>

              {topArtistsView.length ? (
                <ul className="list">
                  {topArtistsView.map((a) => {
                    const img = a?.images?.[2]?.url || a?.images?.[1]?.url || a?.images?.[0]?.url || null;
                    return (
                      <li key={a.id} className="row">
                        <CoverThumb url={img} alt="" />
                        <div className="rowMeta">
                          <div className="rowTitle">
                            <ExternalLink href={a?.external_urls?.spotify}>{a.name}</ExternalLink>
                          </div>
                          <div className="muted">{a?.genres?.slice(0, 3).join(", ") || "no genres"}</div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="muted">No artists loaded yet.</div>
              )}

              {topArtists.length > PAGE_SIZE && (
                <button className="btn ghost moreBtn" onClick={() => setExpandTopArtists((v) => !v)}>
                  {expandTopArtists ? "Less" : "More"}
                </button>
              )}
            </div>

            {/* SECTION 5: Top Tracks */}
            <div className="card">
              <h2>Top Tracks</h2>

              {topTracksView.length ? (
                <ul className="list">
                  {topTracksView.map((t) => {
                    const cover =
                      t?.album?.images?.[2]?.url || t?.album?.images?.[1]?.url || t?.album?.images?.[0]?.url || null;
                    return (
                      <li key={t.id} className="row">
                        <CoverThumb url={cover} alt="" />
                        <div className="rowMeta">
                          <div className="rowTitle">
                            <ExternalLink href={t?.external_urls?.spotify}>{t.name}</ExternalLink>
                          </div>
                          <div className="muted">
                            {t?.artists?.map((a, idx) => (
                              <span key={a.id || idx}>
                                <ExternalLink href={a?.external_urls?.spotify}>{a.name}</ExternalLink>
                                {idx < t.artists.length - 1 ? ", " : ""}
                              </span>
                            ))}
                          </div>
                        </div>
                        <button className="btn ghost" onClick={() => likeTrack(t.id)} title="Save to Liked Songs">
                          +Like
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="muted">No tracks loaded yet.</div>
              )}

              {topTracks.length > PAGE_SIZE && (
                <button className="btn ghost moreBtn" onClick={() => setExpandTopTracks((v) => !v)}>
                  {expandTopTracks ? "Less" : "More"}
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <footer className="footer">
        <div className="footerLine">
          <span className="muted small">
            API:{" "}
            <a className="link small" href={SERVER_BASE} target="_blank" rel="noreferrer">
              {SERVER_BASE}
            </a>
          </span>
        </div>

        <div className="footerLine">
          <span className="muted small">
            Created by{" "}
            <a className="link small" href="https://github.com/sudo13samurai" target="_blank" rel="noreferrer">
              Krystian Carnahan
            </a>{" "}
            • ©2025 •{" "}
            <a className="link small" href="mailto:hi@tildeath.site">
              hi@tildeath.site
            </a>{" "}
            •{" "}
            <a className="link small" href="https://cash.app" target="_blank" rel="noreferrer">
              Buy me a coffee
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
