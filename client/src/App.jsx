import React, { useEffect, useMemo, useRef, useState } from "react";

const SERVER_BASE = (import.meta.env.VITE_SERVER_BASE || "https://spotify-dashboard-xw5t.onrender.com").replace(
  /\/$/,
  ""
);

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

  // Queue / Jam
  const [queueItems, setQueueItems] = useState([]);
  const [expandQueue, setExpandQueue] = useState(false);

  // Playlists -> Tracks
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [playlistTracks, setPlaylistTracks] = useState([]);
  const [expandPlaylistTracks, setExpandPlaylistTracks] = useState(false);

  const [expandTopArtists, setExpandTopArtists] = useState(false);
  const [expandTopTracks, setExpandTopTracks] = useState(false);
  const [expandRecents, setExpandRecents] = useState(false);
  const [expandPlaylists, setExpandPlaylists] = useState(false);

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
    // backend route commonly: /api/player/queue
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

    // Try common patterns (supports whichever your server has)
    const try1 = await jget(`/api/playlists/${encodeURIComponent(playlistId)}/tracks?limit=50`);
    if (try1.status < 400 && try1.json) {
      const items = Array.isArray(try1.json?.items) ? try1.json.items : [];
      // Spotify playlist tracks are typically { track: {...} }
      setPlaylistTracks(items);
      return;
    }

    const try2 = await jget(`/api/playlist-tracks?playlist_id=${encodeURIComponent(playlistId)}&limit=50`);
    if (try2.status < 400 && try2.json) {
      const items = Array.isArray(try2.json?.items) ? try2.json.items : [];
      setPlaylistTracks(items);
      return;
    }

    setMsg("Couldn’t load playlist tracks (server route missing).");
  }

  async function loadAll() {
    setLoading(true);
    setMsg("");
    try {
      const [meO, ta, tt, rp, pls] = await Promise.all([
        jget("/api/me"),
        jget("/api/top-artists?limit=50"),
        jget("/api/top-tracks?limit=50"),
        jget("/api/recently-played?limit=50"),
        jget("/api/playlists?limit=50")
      ]);

      if (meO.status < 400) setMe(meO.json);
      if (ta.status < 400) setTopArtists(ta.json?.items || []);
      if (tt.status < 400) setTopTracks(tt.json?.items || []);
      if (rp.status < 400) setRecentlyPlayed(rp.json?.items || []);
      if (pls.status < 400) setPlaylists(pls.json?.items || []);

      await Promise.all([syncPlayer(), loadQueue()]);
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

  // Player controls
  async function playPause() {
    setMsg("");
    const out = isPlaying ? await jmut("PUT", "/api/player/pause") : await jmut("PUT", "/api/player/play");
    if (out.status >= 400) setMsg(out.json?.error ? String(out.json.error) : "Play/Pause failed.");
    setTimeout(syncPlayer, 600);
  }

  // NOTE: using PUT to avoid your earlier 405 (your backend expects PUT right now)
  async function nextTrack() {
    setMsg("");
    const out = await jmut("PUT", "/api/player/next");
    if (out.status >= 400) setMsg(out.json?.error ? String(out.json.error) : "Next failed.");
    setTimeout(() => {
      syncPlayer();
      loadQueue();
    }, 700);
  }

  async function prevTrack() {
    setMsg("");
    const out = await jmut("PUT", "/api/player/previous");
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

  async function likeNow() {
    const id = nowItem?.id;
    if (!id) return;
    setMsg("");
    const out = await jmut("PUT", `/api/like?ids=${encodeURIComponent(id)}`);
    if (out.status >= 400) {
      setMsg(out.json?.error ? String(out.json.error) : "Like failed (need user-library-modify scope + /api/like).");
      return;
    }
    setMsg("Saved to Liked Songs ✨");
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

  const recentsView = (expandRecents ? recentlyPlayed : recentlyPlayed.slice(0, PAGE_SIZE)) || [];
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
                <button className="btn ghost" onClick={likeNow} title="Save to Liked Songs" disabled={!nowItem?.id}>
                  +Like
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

          {/* ORDERED TABLES */}

          {/* 1) Playlists + Playlist Tracks (top, under player) */}
          <div className="grid">
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
                        <div className="rowTitle">
                          <ExternalLink href={p?.external_urls?.spotify}>{p.name}</ExternalLink>
                        </div>
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
              <h2>Playlist Tracks {selectedPlaylist?.name ? <span className="muted">— {selectedPlaylist.name}</span> : ""}</h2>
              {!selectedPlaylist ? (
                <div className="muted">Pick a playlist to load its tracks.</div>
              ) : (
                <>
                  <ul className="list">
                    {playlistTracksView.map((it, i) => {
                      const t = it?.track || it; // supports either shape
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

          {/* 2) Recently Played */}
          <div className="grid" style={{ marginTop: 14 }}>
            <div className="card">
              <h2>Recently Played</h2>
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
              {recentlyPlayed.length > PAGE_SIZE && (
                <button className="btn ghost moreBtn" onClick={() => setExpandRecents((v) => !v)}>
                  {expandRecents ? "Less" : "More"}
                </button>
              )}
            </div>

            {/* 3) Queue / Jam */}
            <div className="card">
              <h2>Queue / Jam</h2>
              {queueItems.length === 0 ? (
                <div className="muted">Queue is empty (or the server route isn’t enabled yet).</div>
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

          {/* 4) Top Artists + 5) Top Tracks */}
          <div className="grid" style={{ marginTop: 14 }}>
            <div className="card">
              <h2>Top Artists</h2>
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
              <h2>Top Tracks</h2>
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
