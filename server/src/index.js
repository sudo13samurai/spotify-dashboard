import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REDIRECT_URI,
  SERVER_HOST = "127.0.0.1",
  SERVER_PORT = "8888",
  FRONTEND_ORIGIN = "http://tildeath.site:5173",
  TOKENS_PATH = ".tokens.json"
} = process.env;

if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REDIRECT_URI) {
  console.error("Missing required env vars. Check server/.env");
  process.exit(1);
}

const app = express();
app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));
app.use(express.json());

const tokensFile = path.join(__dirname, "..", TOKENS_PATH);

function readTokens() {
  try {
    const raw = fs.readFileSync(tokensFile, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeTokens(tokens) {
  fs.writeFileSync(tokensFile, JSON.stringify(tokens, null, 2), "utf8");
}

function clearTokens() {
  try {
    fs.unlinkSync(tokensFile);
  } catch {}
}

async function spotifyTokenExchange(code) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: SPOTIFY_REDIRECT_URI
  });

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64")
    },
    body
  });

  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  return json;
}

async function spotifyRefresh(refreshToken) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64")
    },
    body
  });

  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  return json;
}

function buildAuthUrl() {
  const scopes = [
    "user-read-currently-playing",
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-top-read",
    "user-read-recently-played",
    "playlist-read-private",
    "playlist-read-collaborative"
  ];

  const params = new URLSearchParams({
    response_type: "code",
    client_id: SPOTIFY_CLIENT_ID,
    scope: scopes.join(" "),
    redirect_uri: SPOTIFY_REDIRECT_URI,
    show_dialog: "true"
  });

  return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

async function getValidAccessToken() {
  const tokens = readTokens();
  if (!tokens?.access_token || !tokens?.refresh_token) return null;

  const now = Date.now();
  const expiresAt = tokens.expires_at ?? 0;

  if (expiresAt && now < expiresAt - 30_000) {
    return tokens.access_token;
  }

  const refreshed = await spotifyRefresh(tokens.refresh_token);

  const newTokens = {
    ...tokens,
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token ?? tokens.refresh_token,
    expires_in: refreshed.expires_in,
    expires_at: Date.now() + refreshed.expires_in * 1000
  };

  writeTokens(newTokens);
  return newTokens.access_token;
}

async function spotifyGet(endpoint) {
  const accessToken = await getValidAccessToken();
  if (!accessToken) return { status: 401, json: { error: "Not authenticated" } };

  const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (res.status === 204) return { status: 204, json: null };

  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function spotifyRequest(method, endpoint, bodyObj = null) {
  const accessToken = await getValidAccessToken();
  if (!accessToken) return { status: 401, json: { error: "Not authenticated" } };

  const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(bodyObj ? { "Content-Type": "application/json" } : {})
    },
    body: bodyObj ? JSON.stringify(bodyObj) : undefined
  });

  if (res.status === 204) return { status: 204, json: null };

  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

// ---- Auth routes ----
app.get("/health", (req, res) => res.json({ ok: true }));

app.get("/auth/login", (req, res) => res.redirect(buildAuthUrl()));

app.get("/callback", (req, res) => );

return res.redirect(`${FRONTEND_ORIGIN}/`);
  const code = req.query.code;
  const error = req.query.error;

  if (error) return res.status(400).send(`Spotify auth error: ${error}`);
  if (!code) return res.status(400).send("Missing code");

  try {
    const exchanged = await spotifyTokenExchange(code);

    writeTokens({
      access_token: exchanged.access_token,
      refresh_token: exchanged.refresh_token,
      expires_in: exchanged.expires_in,
      expires_at: Date.now() + exchanged.expires_in * 1000
    });

    return res.redirect(`${FRONTEND_ORIGIN}/`);
  } catch (e) {
    return res.status(500).send(`Token exchange failed: ${String(e)}`);
  }
});

app.post("/auth/logout", (req, res) => {
  clearTokens();
  res.json({ ok: true });
});

app.get("/auth/status", (req, res) => {
  const tokens = readTokens();
  res.json({ authed: !!tokens?.refresh_token });
});

// ---- Data ----
app.get("/api/now-playing", async (req, res) => {
  const out = await spotifyGet("/me/player/currently-playing");
  if (out.status === 204) return res.status(204).send();
  res.status(out.status).json(out.json);
});

app.get("/api/player/state", async (req, res) => {
  const out = await spotifyGet("/me/player");
  if (out.status === 204) return res.status(204).send();
  res.status(out.status).json(out.json);
});

app.get("/api/player/devices", async (req, res) => {
  const out = await spotifyGet("/me/player/devices");
  res.status(out.status).json(out.json);
});

app.get("/api/top-artists", async (req, res) => {
  const time_range = req.query.time_range ?? "short_term";
  const limit = req.query.limit ?? "10";
  const out = await spotifyGet(`/me/top/artists?time_range=${time_range}&limit=${limit}`);
  res.status(out.status).json(out.json);
});

app.get("/api/top-tracks", async (req, res) => {
  const time_range = req.query.time_range ?? "short_term";
  const limit = req.query.limit ?? "10";
  const out = await spotifyGet(`/me/top/tracks?time_range=${time_range}&limit=${limit}`);
  res.status(out.status).json(out.json);
});

app.get("/api/recently-played", async (req, res) => {
  const limit = req.query.limit ?? "10";
  const out = await spotifyGet(`/me/player/recently-played?limit=${limit}`);
  res.status(out.status).json(out.json);
});

app.get("/api/playlists", async (req, res) => {
  const limit = req.query.limit ?? "20";
  const offset = req.query.offset ?? "0";
  const out = await spotifyGet(`/me/playlists?limit=${limit}&offset=${offset}`);
  res.status(out.status).json(out.json);
});

app.get("/api/playlists/:playlistId/tracks", async (req, res) => {
  const { playlistId } = req.params;
  const limit = req.query.limit ?? "50";
  const offset = req.query.offset ?? "0";
  const out = await spotifyGet(`/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`);
  res.status(out.status).json(out.json);
});

// ---- Player controls ----
app.put("/api/player/play", async (req, res) => {
  // Optional body supported: { context_uri, uris, offset, position_ms }
  const body = req.body && Object.keys(req.body).length ? req.body : null;
  const out = await spotifyRequest("PUT", "/me/player/play", body);
  res.status(out.status).json(out.json ?? { ok: out.status === 204 });
});

app.put("/api/player/pause", async (req, res) => {
  const out = await spotifyRequest("PUT", "/me/player/pause");
  res.status(out.status).json(out.json ?? { ok: out.status === 204 });
});

app.post("/api/player/next", async (req, res) => {
  const out = await spotifyRequest("POST", "/me/player/next");
  res.status(out.status).json(out.json ?? { ok: out.status === 204 });
});

app.post("/api/player/previous", async (req, res) => {
  const out = await spotifyRequest("POST", "/me/player/previous");
  res.status(out.status).json(out.json ?? { ok: out.status === 204 });
});

app.put("/api/player/volume", async (req, res) => {
  const volume = Number(req.query.volume);
  if (Number.isNaN(volume) || volume < 0 || volume > 100) {
    return res.status(400).json({ error: "volume must be 0..100" });
  }
  const out = await spotifyRequest("PUT", `/me/player/volume?volume_percent=${volume}`);
  res.status(out.status).json(out.json ?? { ok: out.status === 204 });
});

app.put("/api/player/seek", async (req, res) => {
  const position_ms = Number(req.query.position_ms);
  if (Number.isNaN(position_ms) || position_ms < 0) {
    return res.status(400).json({ error: "position_ms must be >= 0" });
  }
  const out = await spotifyRequest("PUT", `/me/player/seek?position_ms=${position_ms}`);
  res.status(out.status).json(out.json ?? { ok: out.status === 204 });
});

app.put("/api/player/shuffle", async (req, res) => {
  const state = String(req.query.state);
  if (state !== "true" && state !== "false") {
    return res.status(400).json({ error: "state must be true|false" });
  }
  const out = await spotifyRequest("PUT", `/me/player/shuffle?state=${state}`);
  res.status(out.status).json(out.json ?? { ok: out.status === 204 });
});

app.put("/api/player/repeat", async (req, res) => {
  const state = String(req.query.state);
  if (!["off", "track", "context"].includes(state)) {
    return res.status(400).json({ error: "state must be off|track|context" });
  }
  const out = await spotifyRequest("PUT", `/me/player/repeat?state=${state}`);
  res.status(out.status).json(out.json ?? { ok: out.status === 204 });
});

app.put("/api/player/transfer", async (req, res) => {
  const device_id = req.body?.device_id;
  const play = Boolean(req.body?.play ?? true);

  if (!device_id || typeof device_id !== "string") {
    return res.status(400).json({ error: "device_id required" });
  }

  const out = await spotifyRequest("PUT", "/me/player", {
    device_ids: [device_id],
    play
  });

  res.status(out.status).json(out.json ?? { ok: out.status === 204 });
});

const PORT = Number(process.env.PORT || SERVER_PORT || 8888);

// IMPORTANT: Render requires 0.0.0.0 (not localhost)
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on 0.0.0.0:${PORT}`);
  console.log(`Redirect URI: ${SPOTIFY_REDIRECT_URI}`);
  console.log(`Client origin allowed: ${FRONTEND_ORIGIN}`);
});
