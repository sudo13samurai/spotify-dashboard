import React, { useEffect, useMemo, useRef, useState } from "react";

const SERVER_BASE = import.meta.env.VITE_SERVER_BASE || "http://tildeath.site:8888";
const PIN_KEY = "spotify_dashboard_pins_v1";

async function jget(path) {
  const res = await fetch(`${SERVER_BASE}${path}`, { credentials: "include" });
  if (res.status === 204) return { status: 204, json: null };
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function jmut(method, path, body = null) {
  const res = await fetch(`${SERVER_BASE}${path}`, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
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

  const loginUrl = useMemo(() => `${SERVER_BASE}/auth/login`, []);
  const logoutUrl = useMemo(() => `${SERVER_BASE}/auth/logout`, []);

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
    setAuthed(Boolean(out.json?.authed));
  }

  async function loadLibraryAndPlaylists() {
    const [ta, tt, rp, pls] = await Promise.all([
      jget("/api/top-artists?time_range=short_term&limit=10"),
      jget("/api/top-tracks?time_range=short_term&limit=10"),
      jget("/api/recently-played?limit=10"),
      jget("/api/playlists?limit=50&offset=0")
    ]);

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

  const pinnedPlaylists = pins
    .map((id) => playlists.find((p) => p.id === id))
    .filter(Boolean);

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
            Two-column, Spotify-green cyber glow — bound to <code>127.0.0.1</code>.
          </p>
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
          <p>Click <b>Connect Spotify</b> to authorize.</p>
          <p className="muted">
            Redirect URI must match exactly:
            <br />
            <code>http://127.0.0.1:8888/callback</code>
          </p>
        </div>
      ) : (
        <div className="grid">
          {/* Now Playing */}
          <section className="card">
            <h2>Now Playing</h2>
            <div className="content">
              {nowItem ? (
                <>
                  <div className="row">
                    {nowCover ? <img className="cover" alt="album cover" src={nowCover} /> : null}
                    <div>
                      <div className="big">{nowItem.name}</div>
                      <div className="muted">{nowArtists}</div>
                      <div className="muted">{nowAlbum}</div>
                    </div>
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <div className="kv">
                      <span>{msToTime(progressMs)}</span>
                      <span>{msToTime(durationMs)}</span>
                    </div>

                    <input
                      className="slider"
                      type="range"
                      min="0"
                      max={Math.max(1, durationMs)}
                      value={Math.min(progressMs, Math.max(1, durationMs))}
                      onChange={(e) => {
                        seekingRef.current = true;
                        setProgressMs(Number(e.target.value));
                      }}
                      onMouseUp={(e) => {
                        const v = Number(e.currentTarget.value);
                        seekingRef.current = false;
                        commitSeek(v);
                      }}
                      onTouchEnd={(e) => {
                        const v = Number(e.currentTarget.value);
                        seekingRef.current = false;
                        commitSeek(v);
                      }}
                    />

                    <div className="muted" style={{ marginTop: 8 }}>
                      Seek: {seekPct}% {player?.is_playing ? <span className="badge">LIVE</span> : <span className="badge">PAUSED</span>}
                    </div>
                  </div>
                </>
              ) : (
                <p className="muted">No active playback yet. Open Spotify on a device and play something once.</p>
              )}
            </div>
          </section>

          {/* Playback */}
          <section className="card">
            <h2>Playback</h2>
            <div className="content">
              <div className="controlsRow">
                <button className="btn ghost" onClick={prevTrack}>⏮ Prev</button>
                <button className="btn primary" onClick={playPause}>{isPlaying ? "⏸ Pause" : "▶ Play"}</button>
                <button className="btn ghost" onClick={nextTrack}>Next ⏭</button>
              </div>

              <div style={{ marginTop: 12 }}>
                <div className="controlsRow">
                  <button className="btn ghost" onClick={toggleShuffle}>
                    Shuffle: <b>{shuffleOn ? "On" : "Off"}</b>
                  </button>
                  <button className="btn ghost" onClick={cycleRepeat}>
                    Repeat: <b>{repeatState}</b>
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <div className="muted" style={{ marginBottom: 6 }}>
                  Volume (device): {activeDevice?.volume_percent ?? "—"}%
                </div>
                <input
                  className="slider"
                  type="range"
                  min="0"
                  max="100"
                  defaultValue={activeDevice?.volume_percent ?? 50}
                  onMouseUp={(e) => setVolumePct(Number(e.currentTarget.value))}
                  onTouchEnd={(e) => setVolumePct(Number(e.currentTarget.value))}
                />
                <div className="smallHelp">Volume updates on release.</div>
              </div>

              <div style={{ marginTop: 14 }}>
                <div className="muted" style={{ marginBottom: 6 }}>Devices</div>
                <select value={targetDeviceId} onChange={(e) => setTargetDeviceId(e.target.value)}>
                  <option value="">Select device…</option>
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.is_active ? "● " : ""}{d.name} ({d.type})
                    </option>
                  ))}
                </select>

                <div className="controlsRow" style={{ marginTop: 10 }}>
                  <button className="btn" onClick={transferDevice}>Transfer & Play</button>
                  <span className="muted">Active: <b>{activeDevice?.name ?? "none"}</b></span>
                </div>
              </div>
            </div>
          </section>

          {/* Playlists */}
          <section className="card">
            <h2>Playlists</h2>
            <div className="content">
              <ol className="list">
                {playlists.map((pl) => (
                  <li key={pl.id} className="listItem clickable" title="Click to load tracks • Pin for Quick Play">
                    <span onClick={() => openPlaylist(pl)} style={{ flex: 1 }}>
                      {pl.name}
                    </span>
                    <span className="muted" style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
                      {pl.tracks?.total ?? ""}
                      <button className="btn ghost" style={{ padding: "6px 10px" }} onClick={() => togglePin(pl.id)}>
                        {isPinned(pl.id) ? "Unpin" : "Pin"}
                      </button>
                    </span>
                  </li>
                ))}
                {playlists.length === 0 && <p className="muted">No playlists found.</p>}
              </ol>
            </div>
          </section>

          {/* Playlist tracks */}
          <section className="card">
            <h2>{selectedPlaylist ? selectedPlaylist.name : "Playlist Tracks"}</h2>
            <div className="content">
              {selectedPlaylist ? (
                <ol className="list">
                  {playlistTracks.map((x, idx) => (
                    <li
                      key={`${x.track?.id ?? idx}`}
                      className="listItem clickable"
                      onClick={() => playPlaylistTrack(idx)}
                      title="Click to play from this track"
                    >
                      <span>{x.track?.name ?? "Unknown"}</span>
                      <span className="muted">
                        {(x.track?.artists || []).map((a) => a.name).join(", ")}
                      </span>
                    </li>
                  ))}
                  {playlistTracks.length === 0 && <p className="muted">No tracks loaded.</p>}
                </ol>
              ) : (
                <p className="muted">Pick a playlist on the left.</p>
              )}
            </div>
          </section>

          {/* Top Artists */}
          <section className="card">
            <h2>Top Artists (recent)</h2>
            <div className="content">
              <ol className="list">
                {topArtists.map((a) => (
                  <li key={a.id} className="listItem">
                    <span>{a.name}</span>
                    <span className="muted">{a.followers?.total?.toLocaleString?.() ?? ""}</span>
                  </li>
                ))}
                {topArtists.length === 0 && <p className="muted">No data yet.</p>}
              </ol>
            </div>
          </section>

          {/* Top Tracks */}
          <section className="card">
            <h2>Top Tracks (recent)</h2>
            <div className="content">
              <ol className="list">
                {topTracks.map((t) => (
                  <li key={t.id} className="listItem">
                    <span>{t.name}</span>
                    <span className="muted">{(t.artists || []).map((a) => a.name).join(", ")}</span>
                  </li>
                ))}
                {topTracks.length === 0 && <p className="muted">No data yet.</p>}
              </ol>
            </div>
          </section>

          {/* Recently Played */}
          <section className="card">
            <h2>Recently Played</h2>
            <div className="content">
              <ol className="list">
                {recentlyPlayed.map((x, idx) => (
                  <li key={`${x.played_at}-${idx}`} className="listItem">
                    <span>{x.track?.name}</span>
                    <span className="muted">{(x.track?.artists || []).map((a) => a.name).join(", ")}</span>
                  </li>
                ))}
                {recentlyPlayed.length === 0 && <p className="muted">No data yet.</p>}
              </ol>
            </div>
          </section>

          {/* Quick Play */}
          <section className="card">
            <h2>Quick Play</h2>
            <div className="content">
              <div className="pills" style={{ marginBottom: 12 }}>
                <span className="pill">
                  <span className="pillTitle">
                    <span className="pillImgFallback" aria-hidden="true" />
                    <span className="pillText">Device: <b>{activeDevice?.name ?? "none"}</b></span>
                  </span>
                </span>
                <span className="pill">
                  <span className="pillTitle">
                    <span className="pillImgFallback" aria-hidden="true" />
                    <span className="pillText">Context: <b>{contextNameGuess}</b></span>
                  </span>
                </span>
                <span className="pill">
                  <span className="pillTitle">
                    <span className="pillImgFallback" aria-hidden="true" />
                    <span className="pillText">Shuffle: <b>{shuffleOn ? "On" : "Off"}</b></span>
                  </span>
                </span>
                <span className="pill">
                  <span className="pillTitle">
                    <span className="pillImgFallback" aria-hidden="true" />
                    <span className="pillText">Repeat: <b>{repeatState}</b></span>
                  </span>
                </span>
              </div>

              {pinnedPlaylists.length > 0 ? (
                <>
                  <div className="muted" style={{ marginBottom: 8 }}>Pinned</div>
                  <div className="pills" style={{ marginBottom: 14 }}>
                    {pinnedPlaylists.map((pl) => (
                      <span key={pl.id} className="pill">
                        <span className="pillTitle">
                          <PillThumb playlist={pl} />
                          <span className="pillText">{pl.name}</span>
                        </span>
                        <button onClick={() => quickPlayPlaylist(pl)} title="Play">▶</button>
                        <button onClick={() => togglePin(pl.id)} title="Unpin">×</button>
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <p className="muted">Pin a playlist to put it here for one-click starts.</p>
              )}

              <div className="muted" style={{ marginBottom: 8 }}>Suggestions</div>
              <div className="pills">
                {suggestedPins.map((pl) => (
                  <span key={pl.id} className="pill">
                    <span className="pillTitle">
                      <PillThumb playlist={pl} />
                      <span className="pillText">{pl.name}</span>
                    </span>
                    <button onClick={() => togglePin(pl.id)} title="Pin">＋</button>
                    <button onClick={() => quickPlayPlaylist(pl)} title="Play">▶</button>
                  </span>
                ))}
              </div>

              <div className="smallHelp">
                Tip: if playback feels asleep, hit <b>Transfer & Play</b> once — then Quick Play becomes instant.
              </div>
            </div>
          </section>
        </div>
      )}

      <footer className="footer">
        <span className="muted">
          Server: <code>http://127.0.0.1:8888</code> · Client: <code>http://127.0.0.1:5173</code>
        </span>
      </footer>
    </div>
  );
}

