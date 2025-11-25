#!/usr/bin/env bash
set -e

# Optional: refresh the local access token first
# python3 refresh_access_token.py

python3 dashboard.py --mode local

echo "Open index_local.html in your browser to view the local dashboard."
