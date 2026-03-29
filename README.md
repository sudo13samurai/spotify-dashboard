# Spotify Dashboard

A personal Spotify analytics dashboard that visualizes listening habits, top artists, favorite tracks, and audio insights using the Spotify Web API.

This project allows users to log in with their Spotify account and explore detailed statistics about their music preferences.

---
![Node](https://img.shields.io/badge/node-%3E%3D18-green)
![License](https://img.shields.io/badge/license-MIT-blue)
![Spotify API](https://img.shields.io/badge/API-Spotify-1DB954)
![Status](https://img.shields.io/badge/status-active-success)


## Features

* Spotify OAuth authentication
* View **Top Artists**
* View **Top Tracks**
* Listening insights and trends
* Audio feature visualizations
* Interactive dashboard UI
* Personal listening analytics

---

## Tech Stack

* Node.js
* Express.js
* Spotify Web API
* HTML / CSS / JavaScript
* Chart.js (data visualizations)

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/sudo13samurai/spotify-dashboard.git
cd spotify-dashboard
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create a Spotify Developer App

Visit:

https://developer.spotify.com/dashboard

Create an application and copy your:

* Client ID
* Client Secret
* Redirect URI

---

### 4. Create `.env`

Create a `.env` file in the project root:

```env
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=http://localhost:3000/callback
PORT=3000
```

---

### 5. Run the application

```bash
npm start
```

Then open:

```
http://localhost:3000
```

---

## Project Structure

```
spotify-dashboard/
│
├── public/        # static assets
├── views/         # dashboard templates
├── routes/        # API and auth routes
├── server.js      # main server file
├── package.json
└── .env
```

---

## Spotify API Permissions

This app may request scopes such as:

* `user-top-read`
* `user-read-recently-played`
* `user-library-read`

These allow the dashboard to access listening statistics and track data.

---

## Future Improvements

* Dark mode dashboard
* Playlist analytics
* Listening history graphs
* Export statistics
* Mobile responsive layout

---

## License

MIT License

---

## Author

Krystian J
GitHub: https://github.com/sudo13samurai
