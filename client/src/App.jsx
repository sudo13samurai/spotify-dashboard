import React, { useEffect, useMemo, useRef, useState } from "react";

const SERVER_BASE = (import.meta.env.VITE_SERVER_BASE || "https://spotify-dashboard-xw5t.onrender.com").replace(/\/$/, "");
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
  return <div className="thumb fallback" aria-hidden="true" />;
}

function NowCoverWithBars({ coverUrl, isPlaying }) {
  return (
    <div className="nowCoverWrap">
      <div className={`bgBars ${isPlaying ? "on" : ""}`} aria-hidden="true">
        {Array.from({ length: 18 }).map((_, i) => (
          <span key={i} />
        ))}
      </div>
      <CoverThumb url={coverUrl} alt="Now playing cover" />
    </div>
  );
}

// Spotify uses: short_term (≈4w), medium_term (≈6m), long_term (all time)
const RANGE_OPTIONS = [
  { label: "30 days", value: "short_term" },
  { label: "6 months", value: "medium_term" },
  { label: "All time", value: "long_term" }
];

const RECENTS_FILTERS = [
  { label: "24 hours", value: "24h" },
  { label: "3 days", value: "3d" },
  { label: "30 days", value: "30d" }
];

function cutoffDate(key) {
  const now = Date.now();
  if (key === "24h") return new Date(now - 24 * 60 * 60 * 1000);
  if (key === "3d") return new Date(now - 3 * 24 * 60 * 60 * 1000);
  return new Date(now - 30 * 24 * 60 * 60 * 1000);
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
  const seekingRef = useRef(false);

  const [topArtists, setTopArtists] = useState([]);
  const [topTracks, setTopTracks] = useState([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState([]);
  const [playlists, setPlaylists] = useState([]);

  const [queueItems, setQueueItems] = useState([]);
  const [expandQueue, setExpandQueue] = useState(false);

  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [playlistTracks, setPlaylistTracks] = useState([]);
  const [expandPlaylistTracks, setExpandPlaylistTracks] = useState(false);

  const [expandTopArtists, setExpandTopArtists] = useState(false);
  const [expandTopTracks, setExpandTopTracks] = useState(false);
  const [expandRecents, setExpandRecents] = useState(false);
  const [expandPlaylists, setExpandPlaylists] = useState(false);

  // NEW: dropdown state
  const [topArtistsRange, setTopArtistsRange] = useState("short_term");
  const [topTracksRange, setTopTracksRange] = useState("short_term");
  const [recentsFilter, setRecentsFilter] = useState("3d");

  // NEW: playlist actions state
  const [playlistTargetId, setPlaylistTargetId] = useState("");

  const loginUrl = useMemo(() => `${SERVER_BASE}/auth/login`, []);
  const logoutUrl = useMemo(() => `${SERVER_BASE}/auth/logout`, []);

  const isPlaying = Boolean(player?.is_playing);
  const shuffleOn = Boolean(player?.shuffle_state);
  const repeatState = player?.repeat_state ?? "off";

  const nowItem = player?.item ?? null;
  const nowTitle = nowItem?.name ?? "";
  const nowArtists = nowItem?.artists ?? [];
  const nowUrl = nowItem?.external_urls?.spotify ?? null;
  const nowCover =
    nowItem?.album?.images?.[0]?.url || nowItem?.album?.images?.[1]?.url || nowItem?.album?.images?.[2]?.url || null;

  async function refreshStatus() {
    const out = await jget("/auth/status");
    setAuthed(Boolean(out.json?.authed));
  }

  async function syncPlayer() {
    const [st, devs] = await Promise.all([jget("/api/player/state"), jget("/api/player/devices")]);

    if (st.status === 204) {
      setPlayer(null);
      if (!seekingRef.current) {
        setProgressMs(0);
        setDurationMs(0);
      }
    } else if (st.status < 400) {
      setPlayer(st.json);
      if (!seekingRef.current) {
        setProgressMs(st.json?.progress_ms ?? 0);
        setDurationMs(st.json?.item?.duration_ms ?? 0);
      }
    }

    if (devs.status < 400) {
      const list = Array.isArray(devs.json?.devices) ? devs.json.devices : [];
      setDevices(list);
      const activeId = st.json?.device?.id;
      if (activeId && !targetDeviceId) setTargetDeviceId(activeId);
    }
  }

  async function loadQueue() {
    const out = await jget("/api/player/queue");
    if (out.status >= 400 || !out.json) {
      setQueueItems([]);
      return;
    }
    const items = Array.isArray(out.json?.queue) ? out.json.queue : [];
    setQueueItems(items);
  }

  async function fetchPlaylistTracks(playlistId) {
    if (!playlistId) return;

    setMsg("");
    setPlaylistTracks([]);
    setExpandPlaylistTracks(false);

    const try1 = await jget(`/api/playlists/${encodeURIComponent(playlistId)}/tracks?limit=50`);
    if (try1.status < 400 && try1.json) {
      setPlaylistTracks(Array.isArray(try1.json?.items) ? try1.json.items : []);
      return;
    }

    const try2 = await jget(`/api/playlist-tracks?playlist_id=${encodeURIComponent(playlistId)}&limit=50`);
    if (try2.status < 400 && try2.json) {
      setPlaylistTracks(Array.isArray(try2.json?.items) ? try2.json.items : []);
      return;
    }

    setMsg("Couldn’t load playlist tracks (server route missing).");
  }

  async function loadTopArtists(range) {
    const out = await jget(`/api/top-artists?time_range=${encodeURIComponent(range)}&limit=50`);
    if (out.status < 400) setTopArtists(out.json?.items || []);
  }

  async function loadTopTracks(range) {
    const out = await jget(`/api/top-tracks?time_range=${encodeURIComponent(range)}&limit=50`);
    if (out.status < 400) setTopTracks(out.json?.items || []);
  }

  async function loadRecents() {
    const out = await jget(`/api/recently-played?limit=50`);
    if (out.status < 400) setRecentlyPlayed(out.json?.items || []);
  }

  async function loadAll() {
    setLoading(true);
    setMsg("");
    try {
      const [meO, pls] = await Promise.all([jget("/api/me"), jget("/api/playlists?limit=50")]);
      if (meO.status < 400) setMe(meO.json);
      if (pls.status < 400) {
        setPlaylists(pls.json?.items || []);
        if (!playlistTargetId && (pls.json?.items || []).length) setPlaylistTargetId(pls.json.items[0].id);
      }

      await Promise.all([
        loadTopArtists(topArtistsRange),
        loadTopTracks(topTracksRange),
        loadRecents(),
        syncPlayer(),
        loadQueue()
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch(logoutUrl, { method: "POST", credentials: "include" }).catch(() => {});
    setAuthed(false);
    setMe(null);
    setPlayer(null);
    setDevices([]);
    setTargetDeviceId("");
    setProgressMs(0);
    setDurationMs(0);
    setMsg("");

    setQueueItems([]);
    setSelectedPlaylist(null);
    setPlaylistTracks([]);
  }

  // Controls (fixed methods)
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
    setTimeout(() => {
      syncPlayer();
      loadQueue();
    }, 700);
  }

  async function prevTrack() {
    setMsg("");
    const out = await jmut("POST", "/api/player/previous");
    if (out.status >= 400) setMsg(out.json?.error ? String(out.json.error) : "Previous failed.");
    setTimeout(() => {
      syncPlayer();
      loadQueue();
    }, 700);
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
    const next = repeatState === "off" ? "context" : repeatState === "context" ? "track" : "off";
    const out = await jmut("PUT", `/api/player/repeat?state=${next}`);
    if (out.status >= 400) setMsg(out.json?.error ? String(out.json.error) : "Repeat failed.");
    setTimeout(syncPlayer, 500);
  }

  async function transferDevice() {
    setMsg("");
    if (!targetDeviceId) return setMsg("Pick a device first.");
    const out = await jmut("PUT", "/api/player/transfer", { device_id: targetDeviceId, play: true });
    if (out.status >= 400) setMsg(out.json?.error ? String(out.json.error) : "Transfer failed.");
    setTimeout(syncPlayer, 800);
  }

  // NEW: Add to Queue
  async function addNowToQueue() {
    const uri = nowItem?.uri;
    if (!uri) return;
    setMsg("");
    const out = await jmut("POST", `/api/player/queue/add?uri=${encodeURIComponent(uri)}`);
    if (out.status >= 400) setMsg(out.json?.error ? String(out.json.error) : "Add to queue failed.");
    setTimeout(loadQueue, 700);
  }

  // NEW: Start radio from current track
  async function startRadioFromNow() {
    const id = nowItem?.id;
    if (!id) return;
    setMsg("");
    const out = await jmut("POST", `/api/player/radio?seed_track_id=${encodeURIComponent(id)}&limit=25`);
    if (out.status >= 400) setMsg(out.json?.error ? String(out.json.error) : "Radio failed.");
    setTimeout(() => {
      syncPlayer();
      loadQueue();
    }, 800);
  }

  // NEW: Create playlist from current track
  async function createPlaylistFromNow() {
    const uri = nowItem?.uri;
    if (!uri) return;
    const name = window.prompt("New playlist name:", `From: ${nowTitle || "Now Playing"}`);
    if (!name) return;

    setMsg("");
    const created = await jmut("POST", "/api/playlists/create", {
      name,
      description: "Created from tildeath.site dashboard",
      public: false
    });

    if (created.status >= 400) {
      setMsg(created.json?.error ? String(created.json.error) : "Create playlist failed.");
      return;
    }

    const playlistId = created.json?.id;
    if (!playlistId) {
      setMsg("Playlist created, but no playlist id returned.");
      return;
    }

    const added = await jmut("POST", `/api/playlists/${encodeURIComponent(playlistId)}/add`, { uris: [uri] });
    if (added.status >= 400) {
      setMsg(added.json?.error ? String(added.json.error) : "Created playlist, but failed to add track.");
      return;
    }

    setMsg("Playlist created + track added ✨");
    await jget("/api/playlists?limit=50").then((pls) => {
      if (pls.status < 400) setPlaylists(pls.json?.items || []);
    });
  }

  // NEW: Add current track to selected playlist
  async function addNowToPlaylist() {
    const uri = nowItem?.uri;
    if (!uri) return;
    if (!playlistTargetId) return setMsg("Pick a playlist first.");

    setMsg("");
    const out = await jmut("POST", `/api/playlists/${encodeURIComponent(playlistTargetId)}/add`, { uris: [uri] });
    if (out.status >= 400) setMsg(out.json?.error ? String(out.json.error) : "Add to playlist failed.");
    else setMsg("Added to playlist ✨");
  }

  useEffect(() => {
    refreshStatus();
  }, []);

  useEffect(() => {
    if (authed) loadAll();
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    const id = setInterval(() => {
      syncPlayer();
      loadQueue();
    }, 7000);
    return () => clearInterval(id);
  }, [authed]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!player?.item) return;
      if (seekingRef.current) return;
      if (!player?.is_playing) return;
      setProgressMs((p) => Math.min(p + 1000, durationMs || p + 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [player, durationMs]);

  // Views + filtering
  const cutoff = cutoffDate(recentsFilter);
  const filteredRecents = (recentlyPlayed || []).filter((r) => {
    const ts = r?.played_at ? new Date(r.played_at) : null;
    return ts ? ts >= cutoff : true;
  });

  const recentsView = (expandRecents ? filteredRecents : filteredRecents.slice(0, PAGE_SIZE)) || [];
  const topArtistsView = (expandTopArtists ? topArtists : topArtists.slice(0, PAGE_SIZE)) || [];
  const topTracksView = (expandTopTracks ? topTracks : topTracks.slice(0, PAGE_SIZE)) || [];
  const playlistsView = (expandPlaylists ? playlists : playlists.slice(0, PAGE_SIZE)) || [];
  const queueView = (expandQueue ? queueItems : queueItems.slice(0, PAGE_SIZE)) || [];
  const playlistTracksView = (expandPlaylistTracks ? playlistTracks : playlistTracks.slice(0, PAGE_SIZE)) || [];

  return (
    <div className="page">
      <header className="header">
        <div className="title headerBrand">
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
            <h1 style={{ margin: 0 }}>Spotify Dashboard</h1>
            <p className="sub" style={{ margin: 0 }}>
              Powered by{" "}
              <a className="link" href="https://tildeath.site" target="_blank" rel="noreferrer">
                tildeath.site
              </a>
            </p>
          </div>
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
        </div>
      ) : (
        <>
          {/* Player */}
          <div className="card playerCard">
            <div className="playerRow">
              <div className="playerLeft">
                <NowCoverWithBars coverUrl={nowCover} isPlaying={isPlaying} />
                <div className="playerMeta">
                  <div className="rowTitle">
                    {nowItem ? <ExternalLink href={nowUrl}>{nowTitle}</ExternalLink> : <span className="muted">Nothing playing</span>}
                  </div>
                  {!!nowItem && (
                    <div className="muted">
                      {nowArtists.map((a, i) => (
                        <span key={a.id || i}>
                          <ExternalLink href={a?.external_urls?.spotify}>{a.name}</ExternalLink>
                          {i < nowArtists.length - 1 ? ", " : ""}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="muted">
                    {msToTime(progressMs)} / {msToTime(durationMs)}
                  </div>
                </div>
              </div>

              <div className="playerControls">
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
                  {shuffleOn ? "Shuf✓" : "Shuf"}
                </button>
                <button className="btn ghost" onClick={cycleRepeat} title="Repeat">
                  Rep:{repeatState === "context" ? "C" : repeatState === "track" ? "1" : "Off"}
                </button>

                <button className="btn ghost" onClick={addNowToQueue} title="Add current track to queue" disabled={!nowItem?.uri}>
                  +Queue
                </button>
                <button className="btn ghost" onClick={startRadioFromNow} title="Start a radio from this track" disabled={!nowItem?.id}>
                  Radio
                </button>

                <button className="btn ghost" onClick={createPlaylistFromNow} title="Create a playlist from current track" disabled={!nowItem?.uri}>
                  +NewList
                </button>

                <select
                  value={playlistTargetId}
                  onChange={(e) => setPlaylistTargetId(e.target.value)}
                  title="Pick playlist to add current track"
                  style={{ maxWidth: 220 }}
                >
                  {(playlists || []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button className="btn ghost" onClick={addNowToPlaylist} title="Add current track to selected playlist" disabled={!nowItem?.uri}>
                  +ToList
                </button>

                <div className={`viz ${isPlaying ? "on" : ""}`} title="Equalizer">
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

          {/* ORDER: Recently Played + Queue/Jam */}
          <div className="grid" style={{ marginTop: 14 }}>
            <div className="card">
              <div className="cardHead">
                <h2 style={{ margin: 0 }}>Recently Played</h2>
                <select
                  value={recentsFilter}
                  onChange={(e) => setRecentsFilter(e.target.value)}
                  title="Filter recents"
                >
                  {RECENTS_FILTERS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <ul className="list">
                {recentsView.map((r, i) => {
                  const t = r?.track;
                  const cover = t?.album?.images?.[2]?.url || t?.album?.images?.[1]?.url || t?.album?.images?.[0]?.url;
                  return (
                    <li className="row" key={`${t?.id || i}`}>
                      <CoverThumb url={cover} alt="" />
                      <div className="rowMeta">
                        <div className="rowTitle">
                          <ExternalLink href={t?.external_urls?.spotify}>{t?.name}</ExternalLink>
                        </div>
                        <div className="muted">{t?.artists?.map((a) => a.name).join(", ")}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {filteredRecents.length > PAGE_SIZE && (
                <button className="btn ghost moreBtn" onClick={() => setExpandRecents((v) => !v)}>
                  {expandRecents ? "Less" : "More"}
                </button>
              )}
            </div>

            <div className="card">
              <h2>Queue / Jam</h2>
              {queueItems.length === 0 ? (
                <div className="muted">Queue is empty.</div>
              ) : (
                <>
                  <ul className="list">
                    {queueView.map((t, i) => {
                      const cover = t?.album?.images?.[2]?.url || t?.album?.images?.[1]?.url || t?.album?.images?.[0]?.url;
                      return (
                        <li className="row" key={t?.id || `q-${i}`}>
                          <CoverThumb url={cover} alt="" />
                          <div className="rowMeta">
                            <div className="rowTitle">
                              <ExternalLink href={t?.external_urls?.spotify}>{t?.name}</ExternalLink>
                            </div>
                            <div className="muted">{t?.artists?.map((a) => a.name).join(", ")}</div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {queueItems.length > PAGE_SIZE && (
                    <button className="btn ghost moreBtn" onClick={() => setExpandQueue((v) => !v)}>
                      {expandQueue ? "Less" : "More"}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ORDER: Playlists + Playlist Tracks */}
          <div className="grid" style={{ marginTop: 14 }}>
            <div className="card">
              <h2>Playlists</h2>
              <ul className="list">
                {playlistsView.map((p) => {
                  const cover = p?.images?.[2]?.url || p?.images?.[1]?.url || p?.images?.[0]?.url;
                  const isActive = selectedPlaylist?.id === p.id;
                  return (
                    <li
                      className="row"
                      key={p.id}
                      style={{ cursor: "pointer", outline: isActive ? "2px solid rgba(29,185,84,0.65)" : "none" }}
                      onClick={() => {
                        setSelectedPlaylist(p);
                        fetchPlaylistTracks(p.id);
                      }}
                      title="Load tracks"
                    >
                      <CoverThumb url={cover} alt="" />
                      <div className="rowMeta">
                        <div className="rowTitle">{p.name}</div>
                        <div className="muted">{p?.tracks?.total ?? 0} tracks</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {playlists.length > PAGE_SIZE && (
                <button className="btn ghost moreBtn" onClick={() => setExpandPlaylists((v) => !v)}>
                  {expandPlaylists ? "Less" : "More"}
                </button>
              )}
            </div>

            <div className="card">
              <h2>
                Playlist Tracks {selectedPlaylist?.name ? <span className="muted">— {selectedPlaylist.name}</span> : ""}
              </h2>
              {!selectedPlaylist ? (
                <div className="muted">Pick a playlist to load its tracks.</div>
              ) : (
                <>
                  <ul className="list">
                    {playlistTracksView.map((it, i) => {
                      const t = it?.track || it;
                      const cover = t?.album?.images?.[2]?.url || t?.album?.images?.[1]?.url || t?.album?.images?.[0]?.url;
                      return (
                        <li className="row" key={t?.id || `${selectedPlaylist.id}-${i}`}>
                          <CoverThumb url={cover} alt="" />
                          <div className="rowMeta">
                            <div className="rowTitle">
                              <ExternalLink href={t?.external_urls?.spotify}>{t?.name}</ExternalLink>
                            </div>
                            <div className="muted">{t?.artists?.map((a) => a.name).join(", ")}</div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  {playlistTracks.length > PAGE_SIZE && (
                    <button className="btn ghost moreBtn" onClick={() => setExpandPlaylistTracks((v) => !v)}>
                      {expandPlaylistTracks ? "Less" : "More"}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ORDER: Top Artists + Top Tracks */}
          <div className="grid" style={{ marginTop: 14 }}>
            <div className="card">
              <div className="cardHead">
                <h2 style={{ margin: 0 }}>Top Artists</h2>
                <select
                  value={topArtistsRange}
                  onChange={async (e) => {
                    const v = e.target.value;
                    setTopArtistsRange(v);
                    setExpandTopArtists(false);
                    await loadTopArtists(v);
                  }}
                  title="Time range"
                >
                  {RANGE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <ul className="list">
                {topArtistsView.map((a) => {
                  const img = a?.images?.[2]?.url || a?.images?.[1]?.url || a?.images?.[0]?.url;
                  return (
                    <li className="row" key={a.id}>
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

              {topArtists.length > PAGE_SIZE && (
                <button className="btn ghost moreBtn" onClick={() => setExpandTopArtists((v) => !v)}>
                  {expandTopArtists ? "Less" : "More"}
                </button>
              )}
            </div>

            <div className="card">
              <div className="cardHead">
                <h2 style={{ margin: 0 }}>Top Tracks</h2>
                <select
                  value={topTracksRange}
                  onChange={async (e) => {
                    const v = e.target.value;
                    setTopTracksRange(v);
                    setExpandTopTracks(false);
                    await loadTopTracks(v);
                  }}
                  title="Time range"
                >
                  {RANGE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <ul className="list">
                {topTracksView.map((t) => {
                  const cover = t?.album?.images?.[2]?.url || t?.album?.images?.[1]?.url || t?.album?.images?.[0]?.url;
                  return (
                    <li className="row" key={t.id}>
                      <CoverThumb url={cover} alt="" />
                      <div className="rowMeta">
                        <div className="rowTitle">
                          <ExternalLink href={t?.external_urls?.spotify}>{t.name}</ExternalLink>
                        </div>
                        <div className="muted">{t?.artists?.map((a) => a.name).join(", ")}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>

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
        <span className="muted" style={{ fontSize: 12 }}>
          API:{" "}
          <a className="link" href={SERVER_BASE} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
            {SERVER_BASE}
          </a>
        </span>
      </footer>
    </div>
  );
}
