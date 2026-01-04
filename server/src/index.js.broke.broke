import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const usedCodes = new Set();

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8888;

// ✅ Your correct domains (with safe fallbacks)
const FRONTEND_ORIGIN = (process.env.FRONTEND_ORIGIN || "https://tildeath.site").replace(/\/$/, "");
const SPOTIFY_REDIRECT_URI = (process.env.SPOTIFY_REDIRECT_URI ||
  "https://spotify-dashboard-xw5t.onrender.com/callback").replace(/\/$/, "");

const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } = process.env;

// Token file path (NOTE: Render filesystem can be ephemeral across deploys/instances)
const TOKENS_FILE = process.env.TOKENS_PATH || path.join(__dirname, "tokens.json");

if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
  console.error("❌ Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET");
  process.exit(1);
}

const app = express();

/* ---------------- middleware ---------------- */

app.use(
  cors({
    origin: (origin, cb) => {
      // allow server-to-server/curl requests with no Origin header
      if (!origin) return cb(null, true);

      // allow only your frontend
      if (origin === FRONTEND_ORIGIN) return cb(null, true);

      return cb(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true
  })
);

app.use(express.json());

/* ---------------- token storage ---------------- */

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

/* ---------------- spotify helpers ---------------- */

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

const code = req.query.code;

console.log("Callback URL:", req.originalUrl);
console.log("Referer:", req.get("referer"));
console.log("Has code:", !!code, "Code length:", code ? code.length : 0);

if (!code) {
  return res.status(400).send("Missing code");
}

if (usedCodes.has(code)) {
  console.warn("Duplicate callback with same code; skipping token exchange.");
  return res.redirect(process.env.FRONTEND_ORIGIN);
}

usedCodes.add(code);
setTimeout(() => usedCodes.delete(code), 5 * 60 * 1000);
}


async function spotifyTokenExchange(code) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: SPOTIFY_REDIRECT_URI
  });

  // Node 22 has native fetch
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64"),
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

/* ---------------- routes ---------------- */

// Always bounce backend root to your real site (prevents "Cannot GET /")
app.get("/", (req, res) => res.redirect(FRONTEND_ORIGIN));

app.get("/health", (req, res) => res.json({ ok: true }));

// Start Spotify login
app.get("/auth/login", (req, res) => res.redirect(buildAuthUrl()));

// Safety net: fixes accidental relative navigation creating /callback/auth/login
app.get("/callback/auth/login", (req, res) => res.redirect("/auth/login"));

// Spotify redirects here after user authorizes
app.get("/callback", async (req, res) => {
  const { code, error } = req.query;

  console.log("🔁 /callback hit:", {
    hasCode: !!code,
    error: error || null,
    redirectUri: SPOTIFY_REDIRECT_URI,
    frontendOrigin: FRONTEND_ORIGIN
  });

  if (error) return res.status(400).send(`Spotify auth error: ${error}`);
  if (!code) return res.status(400).send("Missing Spotify authorization code");

  try {
    const exchanged = await spotifyTokenExchange(code);

    writeTokens({
      access_token: exchanged.access_token,
      refresh_token: exchanged.refresh_token,
      expires_in: exchanged.expires_in,
      expires_at: Date.now() + exchanged.expires_in * 1000
    });

    return res.redirect(FRONTEND_ORIGIN);
  } catch (err) {
    console.error("❌ Spotify token exchange failed:", err);
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

/* ---------------- start server ---------------- */

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server listening on port ${PORT}`);
  console.log(`🌐 FRONTEND_ORIGIN: ${FRONTEND_ORIGIN}`);
  console.log(`↩️  SPOTIFY_REDIRECT_URI: ${SPOTIFY_REDIRECT_URI}`);
});
