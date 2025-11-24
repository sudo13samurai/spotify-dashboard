#!/usr/bin/env python3
import base64
import requests

CLIENT_ID = "YOUR_CLIENT_ID"
CLIENT_SECRET = "YOUR_CLIENT_SECRET"
REDIRECT_URI = "YOUR_REDIRECT_URI"
AUTH_CODE = "PASTE_AUTH_CODE_HERE"

auth = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
headers = {
    "Authorization": f"Basic {auth}",
    "Content-Type": "application/x-www-form-urlencoded"
}

data = {
    "grant_type": "authorization_code",
    "code": AUTH_CODE,
    "redirect_uri": REDIRECT_URI
}

resp = requests.post("https://accounts.spotify.com/api/token", headers=headers, data=data)
resp.raise_for_status()
tokens = resp.json()
print(tokens)

refresh_token = tokens.get("refresh_token")
if not refresh_token:
    raise SystemExit("No refresh_token returned. Check your code, redirect URI, and scopes.")

with open("refresh_token.txt", "w", encoding="utf-8") as f:
    f.write(refresh_token)

print("Saved refresh_token.txt")
