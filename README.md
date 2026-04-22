# Script AI

AI-powered screenwriting workspace with a secure backend proxy.

## Deploy to Railway (free)

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) -> New Project -> Deploy from GitHub
3. Select this repo
4. Go to **Variables** tab -> add:
   ```
   GEMINI_API_KEY = your-gemini-api-key-here
   ```
5. Railway auto-deploys and your app is live at the provided URL

## Deploy to Render (free)

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) -> New -> Web Service
3. Connect your repo
4. Set:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
5. Go to **Environment** -> add `GEMINI_API_KEY`
6. Click Deploy

## Local Development

```bash
npm install
GEMINI_API_KEY=your-gemini-api-key-here node server.js
# Open http://localhost:3000
```

You can also place `GEMINI_API_KEY=...` in a local `.env` file at the project root. The included server will load it automatically, and `.env` is already ignored by Git.

When the app is served from `http://localhost:3000` or a deployed URL, the browser uses the backend proxy automatically with Gemini. For local use, open the app through `http://localhost:3000`; do not use `index.html` directly via `file://`.

## Structure

```text
|-- server.js          # Express proxy server
|-- package.json
|-- index.html         # App UI
|-- style.css          # Styles
`-- script.js          # Frontend logic
```
