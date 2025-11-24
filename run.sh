#!/usr/bin/env bash
set -e

python3 refresh_access_token.py
python3 spotify_dashboard.py

echo "Open index.html in your browser to view the dashboard."
