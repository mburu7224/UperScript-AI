const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const ENV_PATH = path.join(__dirname, '.env');

if (fs.existsSync(ENV_PATH)) {
  fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && !process.env[key]) process.env[key] = value;
  });
}

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const STATIC_ROOT = __dirname;
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.post('/api/chat', async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(500).json({
      error: { message: 'GEMINI_API_KEY environment variable is not set on the server.' }
    });
  }

  try {
    const model = req.body && req.body.model ? req.body.model : DEFAULT_GEMINI_MODEL;
    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
    const payload = Object.assign({}, req.body);
    delete payload.model;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY
      },
      body: JSON.stringify(payload)
    });

    const raw = await response.text();
    const data = raw ? JSON.parse(raw) : {};

    if (!response.ok) {
      console.error('[proxy] Gemini error:', response.status, JSON.stringify(data));
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (err) {
    console.error('[proxy error]', err.message);
    res.status(500).json({ error: { message: err.message } });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', provider: 'gemini', hasKey: !!GEMINI_API_KEY });
});

app.use(express.static(STATIC_ROOT));

app.get('*', (req, res) => {
  res.sendFile(path.join(STATIC_ROOT, 'index.html'));
});

app.listen(PORT, () => {
  console.log('Script AI running on port', PORT);
  console.log('Gemini API key set:', !!GEMINI_API_KEY);
});
