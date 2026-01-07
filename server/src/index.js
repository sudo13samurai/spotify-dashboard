// index.js

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import session from "express-session";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 10000;

// Normalize (no trailing slash)
const FRONTEND_ORIGIN = (process.env.FRONTEND_ORIGIN || "https://tildeath.site").replace(/\/$/, "");
const SPOTIFY_REDIRECT_URI = (process.env.SPOTIFY_REDIRECT_URI || "https://spotify-dashboard-xw5t.onrender.com/callback").replace(
  /\/$/,
  ""
);

const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } = process.env;

// Store tokens in a local file (simple + fine for now)
const TOKENS_FILE = process.env.TOKENS_PATH || path.join(__dirname, "tokens.json");

// Guard: prevent double exchanging a code if /callback gets hit twice
const usedCodes = new Set();

if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
  console.error("❌ Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET");
  process.exit(1);
}

if (!process.env.SESSION_SECRET) {
  console.error("❌ Missing SESSION_SECRET (set this in Render env vars)");
  process.exit(1);
}

const app = express();

/**
 * Render sits behind a proxy; this is required for secure cookies to behave.
 */
app.set("trust proxy", 1);

/**
 * Sessions (cookie-based)
 * - secure: true because Render is HTTPS
 * - sameSite: "lax" works when frontend & backend share the same site OR you're not doing cross-site cookies
 *   If your frontend is on a DIFFERENT domain than this API, change sameSite to "none" and keep secure: true,
 *   and ensure your client fetch() uses credentials: "include".
 */
app.use(
  session({
    name: "sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
    }
  })
);

/**
 * CORS
 * If your frontend is on FRONTEND_ORIGIN and API is on this service,
 * this ensures cookies can be sent (credentials: true).
 */
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // allow curl/health checks
      if (origin === FRONTEND_ORIGIN) return cb(null, true);
      return cb(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true
  })
);

app.use(express.json());

// ----------------- token helpers -----------------

function readTokens() {
  if (!fs.existsSync(TOKENS_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(TOKENS_FILE, "utf8"));
  } catch {
    return null;
  }
}

function writeTokens(tokens) {
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
}

function clearTokens() {
  if (fs.existsSync(TOKENS_FILE)) fs.unlinkSync(TOKENS_FILE);
}

// ----------------- spotify auth helpers -----------------

function buildAuthUrl() {
  // NOTE: your original scopes were missing the ones needed for top-* and recently-played.
  // Without these, Spotify will return 403 on those endpoints even if you have a token.
  const scope = [
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing",
    "user-read-private",
    "user-read-email",
    "user-top-read",
    "user-read-recently-played",
    "user-library-modify"
  ].join(" ");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: SPOTIFY_CLIENT_ID,
    scope,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    state: crypto.randomBytes(12).toString("hex")
  });

  return `https://accounts.spotify.com/authorize?${params.toString()}`;
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
      Authorization:
        "Basic " + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }

  return res.json();
}

async function getValidAccessToken() {
  const tokens = readTokens();
  if (!tokens?.refresh_token) return null;

  if (tokens.expires_at && Date.now() < tokens.expires_at - 5000) {
    return tokens.access_token;
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token
  });

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));

  writeTokens({
    ...tokens,
    access_token: json.access_token,
    expires_in: json.expires_in,
    expires_at: Date.now() + json.expires_in * 1000
  });

  return json.access_token;
}

async function spotifyApi(req, res, endpoint) {
  try {
    const token = await getValidAccessToken();
    if (!token) return res.status(401).json({ error: "Not authenticated" });

    const url = `https://api.spotify.com/v1${endpoint}`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (r.status === 204) return res.sendStatus(204);

    const text = await r.text();
    if (!r.ok) return res.status(r.status).send(text);

    res.type("json").send(text);
  } catch (err) {
    console.error("Spotify API error:", err);
    res.status(500).json({ error: "Spotify API error" });
  }
}

// ----------------- auth/session guard -----------------

function requireAuth(req, res, next) {
  if (!req.session?.authed) {
    return res.status(403).json({ error: "Not authorized" });
  }
  next();
}

// If anything tries to call /callback/api/... or /callback/auth/... redirect it cleanly.
app.get("/callback/api/*", (req, res) => {
  const fixed = req.originalUrl.replace(/^\/callback/, "");
  return res.redirect(307, fixed);
});

app.get("/callback/auth/*", (req, res) => {
  const fixed = req.originalUrl.replace(/^\/callback/, "");
  return res.redirect(307, fixed);
});

app.use("/api", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

// ----------------- routes -----------------

app.get("/", (req, res) => res.redirect(FRONTEND_ORIGIN));
app.get("/health", (req, res) => res.json({ ok: true }));

app.get("/auth/login", (req, res) => res.redirect(buildAuthUrl()));

app.get("/callback", async (req, res) => {
  const { code, error, state } = req.query;

  console.log("🔁 /callback hit:", {
    hasCode: !!code,
    error: error || null,
    redirectUri: SPOTIFY_REDIRECT_URI,
    frontendOrigin: FRONTEND_ORIGIN,
    url: req.originalUrl,
    referer: req.get("referer") || null,
    state: state ? String(state).slice(0, 6) + "…" : null
  });

  if (error) return res.status(400).send(`Spotify auth error: ${error}`);
  if (!code) return res.status(400).send("Missing Spotify authorization code");

  // prevent double exchange
  if (usedCodes.has(code)) {
    console.warn("⚠️ Duplicate callback code; skipping exchange.");
    req.session.authed = true; // still mark as authed if we already have tokens
    return res.redirect(FRONTEND_ORIGIN);
  }
  usedCodes.add(code);
  setTimeout(() => usedCodes.delete(code), 5 * 60 * 1000);

  try {
    const exchanged = await spotifyTokenExchange(code);

    writeTokens({
      access_token: exchanged.access_token,
      refresh_token: exchanged.refresh_token,
      expires_in: exchanged.expires_in,
      expires_at: Date.now() + exchanged.expires_in * 1000
    });

    // ✅ mark this browser session as authorized
    req.session.authed = true;

    console.log("✅ Tokens saved + session authed. Redirecting back to frontend.");
    return res.redirect(FRONTEND_ORIGIN);
  } catch (err) {
    console.error("❌ Spotify token exchange failed:", err?.message || err);
    return res.status(500).send("Spotify authentication failed");
  }
});

app.get("/auth/status", (req, res) => {
  const tokens = readTokens();
  res.json({
    authed: !!req.session?.authed && !!tokens?.refresh_token
  });
});

app.post("/auth/logout", (req, res) => {
  clearTokens();
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// compatibility redirects (kept from your original)
app.get("/callback/auth/login", (req, res) => res.redirect("/auth/login"));
app.get("/callback/auth/status", (req, res) => res.redirect("/auth/status"));

app.get("/api/me", (req, res) => spotifyApi(req, res, "/me"));

// ----------------- API ROUTES -----------------

// Apply auth guard to ALL /api routes
app.use("/api", requireAuth);

const passthruQuery = (req) => (req.url.includes("?") ? "?" + req.url.split("?")[1] : "");

app.get("/api/player/state", (req, res) => spotifyApi(req, res, "/me/player"));
app.get("/api/player/devices", (req, res) => spotifyApi(req, res, "/me/player/devices"));

app.get("/api/top-tracks", (req, res) => spotifyApi(req, res, "/me/top/tracks" + passthruQuery(req)));
app.get("/api/top-artists", (req, res) => spotifyApi(req, res, "/me/top/artists" + passthruQuery(req)));
app.get("/api/recently-played", (req, res) => spotifyApi(req, res, "/me/player/recently-played" + passthruQuery(req)));
app.get("/api/player/queue", (req, res) => spotifyApi(req, res, "/me/player/queue"));
app.get("/api/playlists", (req, res) => spotifyApi(req, res, "/me/playlists" + passthruQuery(req)));

app.get("/api/playlists/:id/tracks", (req, res) =>
  spotifyApi(req, res, `/playlists/${req.params.id}/tracks` + passthruQuery(req))
);

// Queue (GET)
app.get("/api/player/queue", async (req, res) => {
  try {
    const token = await getValidAccessToken();
    if (!token) return res.status(401).json({ error: "Not authenticated" });

    const r = await fetch("https://api.spotify.com/v1/me/player/queue", {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (r.status === 204) return res.sendStatus(204);

    const text = await r.text();
    if (!r.ok) return res.status(r.status).send(text);

    res.type("json").send(text);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Queue fetch failed" });
  }
});

// Like / Save track(s) to library (PUT /me/tracks?ids=...)
app.put("/api/like", async (req, res) => {
  try {
    const token = await getValidAccessToken();
    if (!token) return res.status(401).json({ error: "Not authenticated" });

    // pass-through query string (ids=...)
    const qs = req.url.split("?")[1] || "";
    const url = `https://api.spotify.com/v1/me/tracks${qs ? `?${qs}` : ""}`;

    const r = await fetch(url, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` }
    });

    if (r.status === 204) return res.sendStatus(204);

    const text = await r.text();
    if (!r.ok) return res.status(r.status).send(text);

    res.type("json").send(text);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Like failed" });
  }
});


app.put("/api/like", async (req, res) => {
  try {
    const token = await getValidAccessToken();
    if (!token) return res.status(401).json({ error: "Not authenticated" });

    const ids = String(req.query.ids || "").trim();
    if (!ids) return res.status(400).json({ error: "Missing ids" });

    const r = await fetch(`https://api.spotify.com/v1/me/tracks?ids=${encodeURIComponent(ids)}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` }
    });

    if (r.status === 204) return res.sendStatus(204);
    const text = await r.text();
    return res.status(r.status).send(text);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Like failed" });
  }
});

// player controls
app.post("/api/player/next", (req, res) => spotifyApi(req, res, "/me/player/next", "POST"));
app.post("/api/player/previous", (req, res) => spotifyApi(req, res, "/me/player/previous", "POST"));

app.put("/api/player/play", (req, res) => spotifyApi(req, res, "/me/player/play", "PUT"));
app.put("/api/player/pause", (req, res) => spotifyApi(req, res, "/me/player/pause", "PUT"));

app.put("/api/player/shuffle", (req, res) => spotifyApi(req, res, "/me/player/shuffle", "PUT"));
app.put("/api/player/repeat", (req, res) => spotifyApi(req, res, "/me/player/repeat", "PUT"));

app.put("/api/player/transfer", (req, res) => spotifyApi(req, res, "/me/player", "PUT"));
app.put("/api/player/transfer", async (req, res) => {
  try {
    const token = await getValidAccessToken();
    if (!token) return res.status(401).json({ error: "Not authenticated" });

    const r = await fetch("https://api.spotify.com/v1/me/player", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(req.body)
    });

    if (r.status === 204) return res.sendStatus(204);
    const text = await r.text();
    res.status(r.status).send(text);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Transfer failed" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server listening on port ${PORT}`);
  console.log(`🌐 FRONTEND_ORIGIN: ${FRONTEND_ORIGIN}`);
  console.log(`↩️  SPOTIFY_REDIRECT_URI: ${SPOTIFY_REDIRECT_URI}`);
});
