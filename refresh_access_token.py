#!/usr/bin/env python3
import base64
import requests

CLIENT_ID = "YOUR_CLIENT_ID"
CLIENT_SECRET = "YOUR_CLIENT_SECRET"

with open("refresh_token.txt", "r", encoding="utf-8") as f:
    REFRESH_TOKEN = f.read().strip()

auth = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()

headers = {
    "Authorization": f"Basic {auth}",
    "Content-Type": "application/x-www-form-urlencoded"
}

data = {
    "grant_type": "refresh_token",
    "refresh_token": REFRESH_TOKEN
}

resp = requests.post("https://accounts.spotify.com/api/token", headers=headers, data=data)
resp.raise_for_status()
tokens = resp.json()

access_token = tokens.get("access_token")
if not access_token:
    raise SystemExit("No access_token returned. Check client credentials and refresh token.")

with open("access_token.txt", "w", encoding="utf-8") as f:
    f.write(access_token)

print("New access token saved to access_token.txt")
