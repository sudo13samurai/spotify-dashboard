# Changelog

## [3.0.0] — 2025-11-24

### Added
- Dual-mode workflow via `dashboard.py --mode local|secure`.
- Local mode generates `index_local.html` and `spotify_recent_50.json` for simple, static viewing.
- Secure mode ensures a backend-friendly `index.html` that talks only to `/api/*` endpoints.
- New `server.py` Flask backend that:
  - Proxies Spotify Web API calls securely.
  - Exposes `/api/now-playing`, `/api/recent`, and `/api/control` routes.
  - Uses `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, and `SPOTIFY_REFRESH_TOKEN` env vars.
- Helper scripts:
  - `get_refresh_token.py` to obtain a Spotify refresh token.
  - `refresh_access_token.py` to generate `access_token.txt` for local use.
- Convenience scripts:
  - `run_local.sh` for local static runs.
  - `run_secure.sh` for secure server runs.

### Changed
- Reduced history size from 500 tracks down to 50 for both JSON and secure API.
- Refined README to document dual-mode behavior and hosting considerations.

### Fixed
- Ensured that secure mode does not embed any tokens into HTML or JavaScript.
- Capped `/api/recent` to a maximum of 50 tracks to match the new history scope.
