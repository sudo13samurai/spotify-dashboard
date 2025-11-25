#!/usr/bin/env bash
set -e

# Ensure you have SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN set in env.
python3 dashboard.py --mode secure
python3 server.py
