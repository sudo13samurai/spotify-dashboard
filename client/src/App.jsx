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
    <div className={`nowCoverWrap ${isPlaying ? "playing" : ""}`}>
    <div className={`bgBars ${isPlaying ? "on" : ""}`} aria-hidden="true">
    {Array.from({ length: 18 }).map((_, i) => (
      <span key={i} />
    ))}
    </div>
    <CoverThumb url={coverUrl} alt="Now playing cover" />
    </div>
  );
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * Waveform tied to progress:
 * - phase advances with progress01
 * - tiny extra drift when playing so it still “breathes”
 */
function MiniWaveform({ isPlaying, seed = 0, progress01 = 0 }) {
  const ref = useRef(null);
  const rafRef = useRef(null);
  const driftRef = useRef(0);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));

    function resize() {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    function draw() {
      const w = canvas.getBoundingClientRect().width;
      const h = canvas.getBoundingClientRect().height;
      ctx.clearRect(0, 0, w, h);

      // guide lines
      ctx.globalAlpha = 0.30;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = 10; y < h; y += 12) {
        ctx.moveTo(10, y);
        ctx.lineTo(w - 10, y);
      }
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.stroke();

      const bars = 42;
      const gap = 4;
      const barW = Math.max(2, (w - 20 - gap * (bars - 1)) / bars);
      const baseX = 10;

      if (isPlaying) driftRef.current += 0.02;

      const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent")?.trim() || "#1db954";
      const accent2 = getComputedStyle(document.documentElement).getPropertyValue("--accent2")?.trim() || "rgba(29,185,84,0.55)";

      // Progress-driven phase (the “locked” feeling)
      const phaseBase = (progress01 || 0) * 18.0 + (seed % 1000) * 0.001 + driftRef.current;

      ctx.globalAlpha = 0.95;

      for (let i = 0; i < bars; i++) {
        const phase = phaseBase + i * 0.23;
        const s1 = Math.sin(phase * 1.45);
        const s2 = Math.sin(phase * 0.72 + 1.1);

        // playing has more motion/variance
        const amp = isPlaying ? (0.55 + 0.45 * (0.5 + 0.5 * s2)) : 0.22;

        const barH = Math.max(6, (h - 16) * (0.12 + 0.88 * (0.5 + 0.5 * s1) * amp));
        const x = baseX + i * (barW + gap);
        const y = (h - 8) - barH;

        ctx.fillStyle = i % 3 === 0 ? accent : accent2;
        roundRect(ctx, x, y, barW, barH, 6);
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [isPlaying, seed, progress01]);

  return <canvas className="waveCanvas" ref={ref} />;
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

async function extractDominantColor(imageUrl) {
  const fallback = { accent: "#1db954", accent2: "rgba(29,185,84,0.55)", accent3: "rgba(29,185,84,0.20)" };
  if (!imageUrl) return fallback;

  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.src = imageUrl;

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    const size = 48;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 200) continue;

      const pr = data[i];
      const pg = data[i + 1];
      const pb = data[i + 2];

      const lum = 0.2126 * pr + 0.7152 * pg + 0.0722 * pb;
      if (lum < 18) continue;
      r += pr; g += pg; b += pb; n++;
    }

    if (!n) return fallback;

    r = Math.round(r / n);
    g = Math.round(g / n);
    b = Math.round(b / n);

    const boosted = boostSaturation({ r, g, b }, 1.15);

    const accent = rgbToHex(boosted.r, boosted.g, boosted.b);
    const accent2 = `rgba(${boosted.r},${boosted.g},${boosted.b},0.55)`;
    const accent3 = `rgba(${boosted.r},${boosted.g},${boosted.b},0.20)`;

    return { accent, accent2, accent3 };
  } catch {
    return fallback;
  }
}

function rgbToHex(r, g, b) {
  const to = (x) => x.toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function boostSaturation({ r, g, b }, factor = 1.1) {
  const rf = r / 255, gf = g / 255, bf = b / 255;
  const max = Math.max(rf, gf, bf), min = Math.min(rf, gf, bf);
  const l = (max + min) / 2;

  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  }

  const target = Math.min(1, s * factor + 0.08);
  const gray = l;
  const mix = (c) => gray + (c - gray) * (target / (s || 0.001));

  const nr = Math.max(0, Math.min(1, mix(rf)));
  const ng = Math.max(0, Math.min(1, mix(gf)));
  const nb = Math.max(0, Math.min(1, mix(bf)));

  return { r: Math.round(nr * 255), g: Math.round(ng * 255), b: Math.round(nb * 255) };
}

/* ---------- Social helpers (localStorage, simple + clean) ---------- */

const SOCIAL_KEY = "signal_core_social_v1";

function loadSocial() {
  try {
    const raw = localStorage.getItem(SOCIAL_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSocial(list) {
  try {
    localStorage.setItem(SOCIAL_KEY, JSON.stringify(list || []));
  } catch {
    // ignore
  }
}

function normalizeSpotifyProfileUrl(input) {
  const s = String(input || "").trim();
  if (!s) return null;

  // accept "spotify:user:xxxx", "user/xxxx", or full URL
  if (s.startsWith("spotify:user:")) {
    const id = s.split(":").pop();
    return id ? `https://open.spotify.com/user/${id}` : null;
  }

  if (s.includes("open.spotify.com/user/")) {
    const m = s.match(/open\.spotify\.com\/user\/([^/?#]+)/i);
    return m?.[1] ? `https://open.spotify.com/user/${m[1]}` : null;
  }

  const m2 = s.match(/(?:^|\/)user\/([^/?#]+)/i);
  if (m2?.[1]) return `https://open.spotify.com/user/${m2[1]}`;

    // if user pasted only an id
    if (/^[A-Za-z0-9]+$/.test(s)) return `https://open.spotify.com/user/${s}`;

      return null;
}

/* --------------------------------------------------------------- */

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

  const [seekPreviewMs, setSeekPreviewMs] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
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

  // dropdown state
  const [topArtistsRange, setTopArtistsRange] = useState("short_term");
  const [topTracksRange, setTopTracksRange] = useState("short_term");
  const [recentsFilter, setRecentsFilter] = useState("3d");

  // playlist actions state
  const [playlistTargetId, setPlaylistTargetId] = useState("");

  // Vibe toggle (persisted)
  const [vibeMode, setVibeMode] = useState(() => {
    try {
      const v = localStorage.getItem("spotify_dash_vibe_mode");
      return v ? v === "1" : true;
    } catch {
      return true;
    }
  });

  // Social dropdown anchored to avatar
  const [socialOpen, setSocialOpen] = useState(false);
  const [friends, setFriends] = useState(() => loadSocial());
  const socialRef = useRef(null);

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
  const nowId = nowItem?.id || "none";

  const progress01 = durationMs ? Math.max(0, Math.min(1, (progressMs || 0) / durationMs)) : 0;

  useEffect(() => {
    seekingRef.current = isSeeking;
  }, [isSeeking]);

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

  // Controls
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

  // Seek (requires server endpoint: PUT /api/player/seek?position_ms=...)
  async function seekTo(ms) {
    const pos = Math.max(0, Math.min(ms || 0, durationMs || ms || 0));
    setMsg("");
    const out = await jmut("PUT", `/api/player/seek?position_ms=${encodeURIComponent(pos)}`);
    if (out.status >= 400) setMsg(out.json?.error ? String(out.json.error) : "Seek failed.");
    setTimeout(syncPlayer, 500);
  }

  // Add to Queue
  async function addNowToQueue() {
    const uri = nowItem?.uri;
    if (!uri) return;
    setMsg("");
    const out = await jmut("POST", `/api/player/queue/add?uri=${encodeURIComponent(uri)}`);
    if (out.status >= 400) setMsg(out.json?.error ? String(out.json.error) : "Add to queue failed.");
    setTimeout(loadQueue, 700);
  }

  // Start radio from current track
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

  // Create playlist from current track
  async function createPlaylistFromNow() {
    const uri = nowItem?.uri;
    if (!uri) return;
    const name = window.prompt("New playlist name:", `From: ${nowTitle || "Now Playing"}`);
    if (!name) return;

    setMsg("");
    const created = await jmut("POST", "/api/playlists/create", {
      name,
      description: "Created from SIGNAL//CORE",
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

  // Add current track to selected playlist
  async function addNowToPlaylist() {
    const uri = nowItem?.uri;
    if (!uri) return;
    if (!playlistTargetId) return setMsg("Pick a playlist first.");

    setMsg("");
    const out = await jmut("POST", `/api/playlists/${encodeURIComponent(playlistTargetId)}/add`, { uris: [uri] });
    if (out.status >= 400) setMsg(out.json?.error ? String(out.json.error) : "Add to playlist failed.");
    else setMsg("Added to playlist ✨");
  }

  // ---------- Social actions ----------
  function persistFriends(next) {
    setFriends(next);
    saveSocial(next);
  }

  function addFriend() {
    const name = window.prompt("Friend name (label):", "");
    if (!name) return;

    const urlIn = window.prompt("Spotify profile URL or user id:", "");
    const url = normalizeSpotifyProfileUrl(urlIn);
    if (!url) {
      setMsg("Couldn’t parse that Spotify profile. Try a URL like https://open.spotify.com/user/<id>");
      return;
    }

    const next = [
      { id: `${Date.now()}_${Math.random().toString(16).slice(2)}`, name: name.trim(), url }
      , ...friends];

      persistFriends(next);
  }

  function removeFriend(id) {
    persistFriends(friends.filter((f) => f.id !== id));
  }

  // close dropdown on outside click
  useEffect(() => {
    function onDocDown(e) {
      if (!socialOpen) return;
      const el = socialRef.current;
      if (!el) return;
      if (el.contains(e.target)) return;
      setSocialOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [socialOpen]);

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

    // Vibe mode class + persistence
    useEffect(() => {
      document.body.classList.toggle("vibe", vibeMode);
      try {
        localStorage.setItem("spotify_dash_vibe_mode", vibeMode ? "1" : "0");
      } catch {
        // ignore
      }
    }, [vibeMode]);

    // Paused/playing body class for “state-aware” dimming
    useEffect(() => {
      document.body.classList.toggle("paused", authed && !isPlaying);
    }, [authed, isPlaying]);

    // Dynamic accent colors + ambient bg from album art
    useEffect(() => {
      let cancelled = false;

      (async () => {
        const root = document.documentElement;
        root.style.setProperty("--bg-art-url", nowCover ? `url("${nowCover}")` : "none");

        const { accent, accent2, accent3 } = await extractDominantColor(nowCover);
        if (cancelled) return;

        root.style.setProperty("--accent", accent);
        root.style.setProperty("--accent2", accent2);
        root.style.setProperty("--accent3", accent3);
      })();

      return () => {
        cancelled = true;
      };
    }, [nowCover]);

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

    const effectiveProgress = isSeeking ? seekPreviewMs : progressMs;
    const pct = durationMs ? Math.round((effectiveProgress / durationMs) * 10000) / 100 : 0;

    return (
      <div className="page">
      {/* STATUS BAR HEADER */}
      <header className="headerBar">
      <div className="headerLeft" ref={socialRef}>
      <button
      className="avatarBtn"
      onClick={() => setSocialOpen((v) => !v)}
      title="Social"
      aria-label="Open Social"
      >
      {me?.images?.[0]?.url ? (
        <img className="brandAvatar" src={me.images[0].url} alt={me.display_name || "Profile"} />
      ) : (
        <div className="brandAvatarFallback" aria-hidden="true" />
      )}
      </button>

      <div className="brandStack">
      <div className="brandName">SIGNAL//CORE</div>
      <div className="brandTag">
      user: {me?.display_name ? me.display_name : "offline"}{" "}
      <span className="kbd">/</span>{" "}
      mode: {vibeMode ? "vibe" : "clean"}{" "}
      <span className="kbd">/</span>{" "}
      device: {player?.device?.name ? player.device.name : "n/a"}
      </div>
      </div>

      {socialOpen && (
        <div className="dropdown">
        <div className="dropdownHead">
        <div>
        <div className="dropdownTitle">Social</div>
        <div className="dropdownSub">crew.listening (v1)</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
        <button className="btn accent" onClick={addFriend}>+ Add</button>
        <button className="btn ghost" onClick={() => setSocialOpen(false)}>Close</button>
        </div>
        </div>

        {friends.length === 0 ? (
          <div className="muted" style={{ padding: "6px 2px" }}>
          No crew yet. Hit <b>+ Add</b> and drop a Spotify profile URL.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
          {friends.map((f) => (
            <div className="friendRow" key={f.id}>
            <div className="friendMeta">
            <div className="friendName">
            <ExternalLink href={f.url}>{f.name}</ExternalLink>
            </div>
            <div className="friendStatus">
            Listening: <span className="kbd">coming soon</span>
            </div>
            </div>
            <div className="friendActions">
            <button className="btn ghost" onClick={() => window.open(f.url, "_blank")} title="Open profile">
            ↗
            </button>
            <button className="btn danger" onClick={() => removeFriend(f.id)} title="Remove">
            ✕
            </button>
            </div>
            </div>
          ))}
          </div>
        )}

        <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
        Friend activity isn’t exposed reliably in Spotify’s public API — next step is opt-in multi-user auth.
        </div>
        </div>
      )}
      </div>

      <div className="headerCenter">
      <div className="nowLine">
      <div className={`nowPill ${isPlaying ? "playing" : ""}`}>
      {isPlaying ? "PLAYING" : "PAUSED"}
      </div>
      <div className="nowText">
      <div className="nowTitle">
      {nowItem ? <ExternalLink href={nowUrl}>{nowTitle}</ExternalLink> : <span className="muted">Nothing playing</span>}
      </div>
      <div className="nowSub">
      {nowItem ? nowArtists.map((a) => a.name).join(", ") : "—"}
      </div>
      </div>
      </div>
      </div>

      <div className="headerRight">
      {!authed ? (
        <a className="btn primary" href={loginUrl}>
        Connect Spotify
        </a>
      ) : (
        <>
        <button className="btn accent" onClick={() => setVibeMode((v) => !v)} title="Toggle vibe mode">
        {vibeMode ? "Vibe: On" : "Vibe: Off"}
        </button>
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
        <div className={`card playerCard fadeIn`} key={`player-${nowId}`}>
        <div className="playerRow">
        <div className="playerLeft">
        <NowCoverWithBars coverUrl={nowCover} isPlaying={isPlaying} />
        <div className="playerMeta">
        <div className="rowTitle">
        {nowItem ? (
          <ExternalLink href={nowUrl}>{nowTitle}</ExternalLink>
        ) : (
          <span className="muted">Nothing playing</span>
        )}
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

        <div className="waveWrap">
        <MiniWaveform isPlaying={isPlaying} seed={nowId.length} progress01={progress01} />
        </div>

        {/* Seek bar */}
        <div className="seekWrap">
        <div className="seekRow">
        <div className="seekTime">{msToTime(effectiveProgress)}</div>

        <input
        className="seek"
        type="range"
        min={0}
        max={Math.max(1, durationMs || 1)}
        value={Math.min(effectiveProgress, durationMs || effectiveProgress)}
        onMouseDown={() => {
          setIsSeeking(true);
          setSeekPreviewMs(progressMs);
        }}
        onTouchStart={() => {
          setIsSeeking(true);
          setSeekPreviewMs(progressMs);
        }}
        onChange={(e) => setSeekPreviewMs(Number(e.target.value))}
        onMouseUp={async () => {
          setIsSeeking(false);
          await seekTo(seekPreviewMs);
        }}
        onTouchEnd={async () => {
          setIsSeeking(false);
          await seekTo(seekPreviewMs);
        }}
        data-fill="1"
        style={{ ["--pct"]: `${pct}%` }}
        title="Seek"
        disabled={!durationMs}
        />

        <div className="seekTime">{msToTime(durationMs)}</div>
        </div>
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
        <select value={recentsFilter} onChange={(e) => setRecentsFilter(e.target.value)} title="Filter recents">
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
          const active = t?.id && nowItem?.id && t.id === nowItem.id;
          return (
            <li className={`row ${active ? "active" : ""}`} key={`${t?.id || i}`}>
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
            const active = t?.id && nowItem?.id && t.id === nowItem.id;
            return (
              <li className={`row ${active ? "active" : ""}`} key={t?.id || `q-${i}`}>
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
            className={`row ${isActive ? "active" : ""}`}
            key={p.id}
            style={{ cursor: "pointer" }}
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
            const active = t?.id && nowItem?.id && t.id === nowItem.id;
            return (
              <li className={`row ${active ? "active" : ""}`} key={t?.id || `${selectedPlaylist.id}-${i}`}>
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
