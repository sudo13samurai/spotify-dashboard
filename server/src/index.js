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

const {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REDIRECT_URI,
  SERVER_HOST = "https://spotify-dashboard-xw5t.onrender.com",
  SERVER_PORT = "8888",
  FRONTEND_ORIGIN = "http://tildeath.site:5173",
  TOKENS_PATH = ".tokens.json"
} = process.env;

if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REDIRECT_URI) {
  console.error("❌ Missing Spotify environment variables");
  process.exit(1);
}

const app = express();

/* ---------------- middleware ---------------- */

app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true
  })
);

app.use(express.json());

/* ---------------- token storage ---------------- */

const TOKEN_PATH = path.join(__dirname, "tokens.json");

function readTokens() {
  if (!fs.existsSync(TOKEN_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
  } catch {
    return null;
  }
}

function writeTokens(tokens) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
}

function clearTokens() {
  if (fs.existsSync(TOKEN_PATH)) fs.unlinkSync(TOKEN_PATH);
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
    state: crypto.randomBytes(8).toString("hex")
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
        "Basic " +
        Buffer.from(
          `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`
        ).toString("base64"),
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

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/auth/login", (req, res) => {
  return res.redirect(buildAuthUrl());
});

app.get("/callback/auth/login", (req, res) => {
  return res.redirect("/auth/login");
});

app.get("/callback", async (req, res) => {
  const { code, error } = req.query;

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

    return res.redirect(`${FRONTEND_ORIGIN}/`);
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
});
