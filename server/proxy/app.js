/* Minimal proxy server for Places, Details, Weather, and Gemini
   - Protects API keys in server environment
   - Using simple PROXY_CLIENT_KEY sent by client in 'x-proxy-key' header
   - Rate-limited and uses helmet/cors for basic hardening
*/

const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const dotenv = require('dotenv');
const { URLSearchParams } = require('url');

dotenv.config();

const PORT = process.env.PORT || 4000;
const app = express();

// Basic middlewares
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// CORS: restrict to configured origins if provided
const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const corsOptions = allowed.length > 0 ? { origin: (origin, cb) => cb(null, allowed.includes(origin) || origin === undefined) } : {};
app.use(cors(corsOptions));

// Rate limiting (basic)
const limiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });
app.use(limiter);

// Simple auth for client -> proxy: require x-proxy-key header to match PROXY_CLIENT_KEY
function authorizeClient(req, res, next) {
  const key = req.headers['x-proxy-key'] || req.query['proxy_key'];
  if (!process.env.PROXY_CLIENT_KEY) return res.status(500).json({ error: 'Server misconfigured: missing PROXY_CLIENT_KEY' });
  if (!key || key !== process.env.PROXY_CLIENT_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// Health
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Places Text Search: proxy GET /api/places/textsearch?query=...&location=lat,lng&radius=...
app.get('/api/places/textsearch', authorizeClient, async (req, res) => {
  const { query, location, radius } = req.query;
  if (!query) return res.status(400).json({ error: 'Missing query param' });

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server misconfigured: missing GOOGLE_MAPS_API_KEY' });

  const params = new URLSearchParams({ query, key: apiKey });
  if (location) params.set('location', location);
  if (radius) params.set('radius', radius);

  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`;

  try {
    const upstream = await fetch(url);
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    console.error('Places textsearch proxy error', err);
    res.status(502).json({ error: 'Upstream request failed' });
  }
});

// Place details: /api/places/details?place_id=...&fields=...
app.get('/api/places/details', authorizeClient, async (req, res) => {
  const { place_id, fields } = req.query;
  if (!place_id) return res.status(400).json({ error: 'Missing place_id' });
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server misconfigured: missing GOOGLE_MAPS_API_KEY' });

  const params = new URLSearchParams({ place_id, key: apiKey });
  if (fields) params.set('fields', fields);

  const url = `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`;
  try {
    const upstream = await fetch(url);
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    console.error('Places details proxy error', err);
    res.status(502).json({ error: 'Upstream request failed' });
  }
});

// OpenWeather proxy: /api/weather?q=city OR /api/weather?lat=...&lon=...
app.get('/api/weather', authorizeClient, async (req, res) => {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server misconfigured: missing OPENWEATHER_API_KEY' });

  const { q, lat, lon, units = 'metric' } = req.query;
  const params = new URLSearchParams({ appid: apiKey, units });
  if (q) params.set('q', q);
  if (lat && lon) {
    params.set('lat', lat);
    params.set('lon', lon);
  }

  const url = `https://api.openweathermap.org/data/2.5/weather?${params.toString()}`;
  try {
    const upstream = await fetch(url);
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    console.error('OpenWeather proxy error', err);
    res.status(502).json({ error: 'Upstream request failed' });
  }
});

// Gemini (Generative Language) proxy - POST /api/gemini/generate with body as the request payload
app.post('/api/gemini/generate', authorizeClient, async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server misconfigured: missing GEMINI_API_KEY' });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    console.error('Gemini proxy error', err);
    res.status(502).json({ error: 'Upstream request failed' });
  }
});

// Fallback for unknown routes
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(PORT, () => {
  console.log(`Proxy server listening on port ${PORT}`);
});
