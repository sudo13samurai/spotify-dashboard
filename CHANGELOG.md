# Changelog

## [2.0.0] — 2025-11-24

### Added
- Live Now Playing card with album art, track, artist, album, and progress bar.
- Color-changing waveform visualization derived from audio features (energy, valence, tempo).
- Animated Spotify-style EQ bars.
- Playback controls (previous / play-pause / next) wired to the Spotify Web API.
- Auto-refresh of Now Playing every 10 seconds.
- JSON export of the last 500 played tracks to `spotify_recent_500.json`.
- `index.html` output dashboard with dark theme UI.

### Changed
- Switched from environment-only token use to optional `access_token.txt` file-based token for refresh flows.
- Refactored HTML generation to use a simple Python string builder.
- Moved complex UI logic into JavaScript to avoid f-string escaping issues.

### Fixed
- Resolved f-string syntax errors caused by nested `${}` in JavaScript strings.
- Improved error handling when Now Playing is unavailable or when the API returns no item.
- Fixed progress bar rendering for tracks with missing metadata.
