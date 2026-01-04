import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

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

const app = express();

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

function buildAuthUrl() {
  const scope = [
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-currently-playing",
    "user-read-private",
    "user-read-email"
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

// routes
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

    console.log("✅ Tokens saved. Redirecting back to frontend.");
    return res.redirect(FRONTEND_ORIGIN);
  } catch (err) {
    console.error("❌ Spotify token exchange failed:", err?.message || err);
    return res.status(500).send("Spotify authentication failed");
  }
});

app.get("/auth/status", (req, res) => {
  const tokens = readTokens();
  res.json({ authed: !!tokens?.refresh_token });
});

app.post("/auth/logout", (req, res) => {
  clearTokens();
  res.json({ ok: true });
});

app.get("/callback/auth/login", (req, res) => res.redirect("/auth/login"));
app.get("/callback/auth/status", (req, res) => res.redirect("/auth/status"));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server listening on port ${PORT}`);
  console.log(`🌐 FRONTEND_ORIGIN: ${FRONTEND_ORIGIN}`);
  console.log(`↩️  SPOTIFY_REDIRECT_URI: ${SPOTIFY_REDIRECT_URI}`);
});
