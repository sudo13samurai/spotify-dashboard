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
  // ... all your hooks and helpers stay above ...

  return (
    <div className="page">
      {/* header is above */}

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
          {/* Top strip */}
          <div className="card topStrip">
            {/* your topStripRow content here */}
          </div>

          {/* SECTION 1: Playlists + Playlist tracks */}
          <div className="grid">
            {/* playlists card */}
            {/* playlist tracks card */}
            {/* recently played card */}
            {/* queue card */}
            {/* top artists card */}
            {/* top tracks card */}
          </div>
        </>
      )}

      {/* footer below */}
    </div>
  );
}
