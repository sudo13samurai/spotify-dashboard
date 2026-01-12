:root {
  --bg: #0b0f0c;
  --card: rgba(255, 255, 255, 0.06);
  --card2: rgba(255, 255, 255, 0.08);
  --text: rgba(255, 255, 255, 0.92);
  --muted: rgba(255, 255, 255, 0.68);
  --muted2: rgba(255, 255, 255, 0.55);

  /* Spotify core */
  --green: #1db954;
  --green2: rgba(29, 185, 84, 0.65);

  /* Dynamic accent (set from album art in App.jsx) */
  --accent: #1db954;
  --accent2: rgba(29, 185, 84, 0.55);
  --accent3: rgba(29, 185, 84, 0.20);

  /* Ambient background image (set from album art in App.jsx) */
  --bg-art-url: none;

  --shadow: 0 10px 30px rgba(0,0,0,0.35);
  --shadowStrong: 0 18px 50px rgba(0,0,0,0.55);
  --radius: 18px;
}

* { box-sizing: border-box; }
html, body { height: 100%; }

body {
  margin: 0;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Apple Color Emoji", "Segoe UI Emoji";
  background: radial-gradient(800px 400px at 20% 10%, rgba(29,185,84,0.18), transparent 55%),
  radial-gradient(700px 400px at 80% 20%, rgba(29,185,84,0.10), transparent 55%),
  var(--bg);
  color: var(--text);
  overflow-x: hidden;
}

/* Ambient album-art blur layer (only in Vibe mode) */
body.vibe::before {
  content: "";
  position: fixed;
  inset: -40px;
  background-image: var(--bg-art-url);
  background-size: cover;
  background-position: center;
  filter: blur(90px) saturate(1.2) brightness(0.22);
  opacity: 0.9;
  z-index: -2;
}

/* Subtle gradient veil on top of the blur */
body.vibe::after {
  content: "";
  position: fixed;
  inset: 0;
  background:
  radial-gradient(900px 520px at 50% 10%, var(--accent3), transparent 60%),
  radial-gradient(900px 520px at 15% 35%, rgba(255,255,255,0.04), transparent 60%),
  radial-gradient(900px 520px at 85% 45%, rgba(255,255,255,0.03), transparent 60%),
  linear-gradient(180deg, rgba(0,0,0,0.40), rgba(0,0,0,0.76));
  z-index: -1;
}

/* Smooth everything */
* {
  transition:
  background-color 0.28s ease,
  color 0.28s ease,
  border-color 0.28s ease,
  box-shadow 0.28s ease,
  transform 0.28s ease,
  opacity 0.28s ease,
  filter 0.28s ease;
}

.page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 18px 14px 40px;
}

/* Links: white + darker on hover */
a.link, .linkLike {
  color: #fff;
  text-decoration: none;
}
a.link:hover, .linkLike:hover {
  color: rgba(255,255,255,0.78);
  text-decoration: underline;
}

/* Cards */
.card {
  background: linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.05));
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 16px;
}

/* “Glassier” cards in vibe mode */
body.vibe .card {
  background: rgba(17,24,39,0.58);
  border: 1px solid rgba(255,255,255,0.10);
  backdrop-filter: blur(18px);
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

@media (max-width: 920px) {
  .grid { grid-template-columns: 1fr; }
}

h2 {
  margin: 0 0 10px 0;
  font-size: 16px;
  letter-spacing: 0.2px;
}

.muted {
  color: var(--muted);
}

/* Buttons */
.btn {
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.06);
  color: var(--text);
  padding: 8px 10px;
  border-radius: 14px;
  cursor: pointer;
  font-weight: 800;
  letter-spacing: 0.2px;
}

.btn:hover {
  background: rgba(255,255,255,0.10);
  transform: translateY(-1px);
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  transform: none;
}

.btn.primary {
  background: rgba(29, 185, 84, 0.22);
  border-color: rgba(29, 185, 84, 0.35);
}

.btn.primary:hover {
  background: rgba(29, 185, 84, 0.28);
}

/* Accent button for vibe toggle */
.btn.accent {
  background: color-mix(in srgb, var(--accent) 18%, rgba(255,255,255,0.06));
  border-color: color-mix(in srgb, var(--accent) 45%, rgba(255,255,255,0.12));
}

.btn.accent:hover {
  background: color-mix(in srgb, var(--accent) 26%, rgba(255,255,255,0.08));
}

.btn.danger {
  background: rgba(255, 80, 80, 0.12);
  border-color: rgba(255, 80, 80, 0.25);
}

.btn.ghost {
  background: rgba(255,255,255,0.06);
}

.moreBtn {
  margin-top: 12px;
  width: 100%;
}

/* Thumbs (tables + lists) */
.thumb {
  width: 46px;
  height: 46px;
  border-radius: 12px;
  object-fit: cover;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.10);
}

.thumb.fallback {
  background: rgba(255,255,255,0.06);
}

/* ---------------- HEADER: STATUS BAR ---------------- */

.headerBar {
  display: grid;
  grid-template-columns: 1fr minmax(0, 1.4fr) auto;
  gap: 12px;
  align-items: center;
  margin-bottom: 14px;
  padding: 12px 12px;
  border-radius: 18px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.10);
  box-shadow: var(--shadow);
}

body.vibe .headerBar {
  background: rgba(17,24,39,0.50);
  backdrop-filter: blur(14px);
}

@media (max-width: 920px) {
  .headerBar {
    grid-template-columns: 1fr;
  }
}

.headerLeft {
  display: flex;
  align-items: center;
  gap: 12px;
  position: relative;
  min-width: 0;
}

.brandStack {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.brandName {
  font-weight: 950;
  letter-spacing: 0.7px;
  font-size: 14px;
  color: rgba(255,255,255,0.92);
  text-transform: uppercase;
}

.brandTag {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.headerCenter {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
}

.nowLine {
  width: 100%;
  max-width: 560px;
  padding: 10px 12px;
  border-radius: 16px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.nowPill {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.85);
  white-space: nowrap;
}

.nowPill.playing {
  border-color: color-mix(in srgb, var(--accent) 60%, rgba(255,255,255,0.12));
  box-shadow: 0 0 16px var(--accent3);
}

.nowText {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nowTitle {
  font-weight: 900;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nowSub {
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.headerRight {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

/* Profile avatar button */
.avatarBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  padding: 0;
  cursor: pointer;
}

.brandAvatar {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  object-fit: cover;
  box-shadow: 0 10px 25px rgba(0,0,0,0.45);
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.06);
}

.brandAvatarFallback {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.10);
}

/* Social dropdown */
.dropdown {
  position: absolute;
  top: 54px;
  left: 0;
  width: min(420px, calc(100vw - 28px));
  z-index: 50;
  border-radius: 18px;
  padding: 12px;
  background: rgba(17,24,39,0.78);
  border: 1px solid rgba(255,255,255,0.12);
  box-shadow: 0 24px 70px rgba(0,0,0,0.60);
  backdrop-filter: blur(18px);
}

.dropdownHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.dropdownTitle {
  font-weight: 950;
  letter-spacing: 0.5px;
}

.dropdownSub {
  font-size: 12px;
  color: var(--muted);
  margin-top: 3px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.friendRow {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 14px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
}

.friendRow:hover {
  background: rgba(255,255,255,0.07);
  transform: translateX(4px);
}

.friendMeta {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1 1 auto;
}

.friendName {
  font-weight: 900;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.friendStatus {
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.friendActions {
  display: flex;
  gap: 8px;
  flex: 0 0 auto;
}

.kbd {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.82);
}

/* --- HERO PLAYER (top centered) --- */
.playerCard {
  margin: 0 auto;
  max-width: 980px;
  position: relative;
  overflow: hidden;
}

/* subtle accent edge in vibe mode */
body.vibe .playerCard {
  box-shadow: var(--shadowStrong);
  border-color: rgba(255,255,255,0.12);
}
body.vibe .playerCard::before {
  content: "";
  position: absolute;
  inset: -2px;
  background:
  radial-gradient(650px 280px at 30% 10%, var(--accent3), transparent 60%),
  radial-gradient(650px 280px at 80% 50%, rgba(255,255,255,0.04), transparent 60%);
  z-index: 0;
  pointer-events: none;
}
.playerCard > * { position: relative; z-index: 1; }

.playerCard .playerRow {
  display: flex;
  gap: 18px;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
}

/* center align the left group visually */
.playerLeft {
  display: flex;
  gap: 16px;
  align-items: center;
  min-width: 320px;
}

.playerMeta {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.playerControls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

/* Dim UI slightly when paused */
body.paused .playerCard {
  filter: saturate(0.85) brightness(0.92);
}

.deviceRow {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}

select {
  background: rgba(255,255,255,0.06);
  color: var(--text);
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: 14px;
  padding: 10px;
}

/* Bigger now-playing cover + glow */
.nowCoverWrap {
  position: relative;
  width: 240px;
  height: 240px;
  display: grid;
  place-items: center;
}

.nowCoverWrap .thumb {
  width: 240px;
  height: 240px;
  border-radius: 18px;
  position: relative;
  z-index: 2;
  box-shadow: 0 14px 40px rgba(0,0,0,0.55);
  border: 1px solid rgba(255,255,255,0.12);
}

body.vibe .nowCoverWrap .thumb {
  box-shadow: 0 0 0 1px rgba(255,255,255,0.08),
  0 18px 60px rgba(0,0,0,0.65),
  0 0 26px var(--accent2);
}

/* Slow pulse only while playing (class toggled in App.jsx) */
.nowCoverWrap.playing .thumb {
  animation: slowPulse 6s ease-in-out infinite;
}

@keyframes slowPulse {
  0%,100% { transform: scale(1); }
  50% { transform: scale(1.03); }
}

/* Bars background container */
.bgBars {
  position: absolute;
  inset: -12px;
  z-index: 1;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.05);
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.08);
}

.bgBars span {
  width: 4px;
  height: 12px;
  border-radius: 2px;
  background: var(--accent2);
  opacity: 0.55;
  transform: scaleY(0.6);
}

/* Animate only when playing */
.bgBars.on span {
  opacity: 0.95;
  animation: bgBarBounce 1.05s infinite ease-in-out;
}

.bgBars.on span:nth-child(2)  { animation-delay: 0.12s; }
.bgBars.on span:nth-child(3)  { animation-delay: 0.22s; }
.bgBars.on span:nth-child(4)  { animation-delay: 0.06s; }
.bgBars.on span:nth-child(5)  { animation-delay: 0.18s; }
.bgBars.on span:nth-child(6)  { animation-delay: 0.28s; }
.bgBars.on span:nth-child(7)  { animation-delay: 0.10s; }
.bgBars.on span:nth-child(8)  { animation-delay: 0.24s; }
.bgBars.on span:nth-child(9)  { animation-delay: 0.14s; }
.bgBars.on span:nth-child(10) { animation-delay: 0.30s; }
.bgBars.on span:nth-child(11) { animation-delay: 0.08s; }
.bgBars.on span:nth-child(12) { animation-delay: 0.20s; }
.bgBars.on span:nth-child(13) { animation-delay: 0.26s; }
.bgBars.on span:nth-child(14) { animation-delay: 0.16s; }
.bgBars.on span:nth-child(15) { animation-delay: 0.32s; }
.bgBars.on span:nth-child(16) { animation-delay: 0.04s; }
.bgBars.on span:nth-child(17) { animation-delay: 0.27s; }
.bgBars.on span:nth-child(18) { animation-delay: 0.11s; }

@keyframes bgBarBounce {
  0%   { transform: scaleY(0.55); }
  50%  { transform: scaleY(2.35); }
  100% { transform: scaleY(0.75); }
}

/* Waveform canvas */
.waveWrap {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 2px;
}

.waveCanvas {
  width: 100%;
  height: 46px;
  border-radius: 14px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.2);
}

body.vibe .waveCanvas {
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.25), 0 0 18px rgba(0,0,0,0.35);
}

/* Seek bar */
.seekWrap {
  margin-top: 4px;
  display: grid;
  gap: 8px;
}

.seekRow {
  display: flex;
  align-items: center;
  gap: 10px;
}

.seekTime {
  font-size: 12px;
  color: var(--muted);
  min-width: 48px;
  text-align: center;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.seek {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 10px;
  border-radius: 999px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.10);
  outline: none;
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.25);
}

.seek[data-fill="1"] {
  background:
  linear-gradient(90deg, var(--accent2) 0%, var(--accent) var(--pct), rgba(255,255,255,0.08) var(--pct), rgba(255,255,255,0.08) 100%);
}

.seek::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: var(--accent);
  border: 1px solid rgba(255,255,255,0.18);
  box-shadow: 0 0 18px var(--accent2), 0 6px 20px rgba(0,0,0,0.45);
  cursor: pointer;
}

.seek::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: var(--accent);
  border: 1px solid rgba(255,255,255,0.18);
  box-shadow: 0 0 18px var(--accent2), 0 6px 20px rgba(0,0,0,0.45);
  cursor: pointer;
}

/* Lists */
.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 10px;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  border-radius: 14px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  width: 100%;
  min-width: 0;
}

.row:hover {
  background: rgba(255,255,255,0.06);
  transform: translateX(4px);
}

/* Active row accent */
.row.active {
  border-color: color-mix(in srgb, var(--accent) 52%, rgba(255,255,255,0.12));
  box-shadow: 0 0 0 1px rgba(255,255,255,0.06), 0 0 18px var(--accent3);
}

.rowMeta {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.rowTitle {
  font-weight: 900;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rowTitle a {
  display: block;
  max-width: 100%;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rowMeta .muted {
  display: block;
  max-width: 100%;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Equalizer viz */
.viz {
  display: inline-flex;
  gap: 3px;
  align-items: flex-end;
  height: 18px;
  padding: 6px 8px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255,255,255,0.10);
}

.viz span {
  width: 3px;
  height: 6px;
  border-radius: 2px;
  background: var(--accent);
  opacity: 0.65;
}

.viz.on span {
  opacity: 0.95;
  animation: vizBounce 0.9s infinite ease-in-out;
}

.viz.on span:nth-child(2) { animation-delay: 0.10s; }
.viz.on span:nth-child(3) { animation-delay: 0.20s; }
.viz.on span:nth-child(4) { animation-delay: 0.05s; }
.viz.on span:nth-child(5) { animation-delay: 0.18s; }
.viz.on span:nth-child(6) { animation-delay: 0.12s; }
.viz.on span:nth-child(7) { animation-delay: 0.25s; }
.viz.on span:nth-child(8) { animation-delay: 0.08s; }

@keyframes vizBounce {
  0%   { transform: scaleY(0.6); }
  50%  { transform: scaleY(2.2); }
  100% { transform: scaleY(0.7); }

  <footer className="footer">
  <span className="muted" style={{ fontSize: 12, textAlign: "center" }}>
  <a className="link" href="https://tildeath.site" target="_blank" rel="noreferrer">
  https://tildeath.site
  </a>{" "}
  {" // "}@krystianjcarnahan 2026{" // "}buy me a{" "}
  <a className="link" href="https://cash.app/" target="_blank" rel="noreferrer">
  coffee.
  </a>
  </span>
  </footer>


.cardHead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

/* Small “track changed” fade */
.fadeIn {
  animation: fadeInUp 0.35s ease both;
}
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
