# JourneyHacks Proxy

A minimal Node/Express proxy that forwards requests for Google Places (Text Search, Details), OpenWeather, and Gemini (Generative Language) so you can keep API keys server-side and avoid browser CORS issues. -

## Setup

1. Copy `.env.example` to `.env` and fill in your API keys and `PROXY_CLIENT_KEY` (a random secret shared with your frontend). Optionally set `ALLOWED_ORIGINS`.

2. Install dependencies:

   ```bash
   cd server/proxy
   npm install
   ```

3. Run the server:

   ```bash
   npm start
   ```

   The default port is `4000`. You can set `PORT` in `.env`.

## Endpoints

All endpoints require the header `x-proxy-key: <PROXY_CLIENT_KEY>` (or `?proxy_key=` query param).

- GET `/health` - simple health check
- GET `/api/places/textsearch?query=...&location=lat,lng&radius=...` - proxies Google Places Text Search
- GET `/api/places/details?place_id=...&fields=...` - proxies Google Place Details
- GET `/api/weather?q=City` or `/api/weather?lat=...&lon=...` - proxies OpenWeather
- POST `/api/gemini/generate` - proxies Gemini generateContent (body forwarded directly)

## Frontend usage example

Replace direct calls to Google / OpenWeather with the proxy. Example (fetch Places text search):

```js
fetch(
  `/api/places/textsearch?query=${encodeURIComponent(
    query
  )}&location=${lat},${lng}&radius=${radius}`,
  {
    headers: { "x-proxy-key": "YOUR_CLIENT_KEY" },
  }
);
```

## Security notes

- Use `PROXY_CLIENT_KEY` to authenticate requests from the frontend. For production, consider a stronger auth scheme (signed JWTs, session tokens).
- Limit `ALLOWED_ORIGINS` to only the hosts you control.
- Add server-side caching to avoid hitting upstream API rate limits and to reduce costs.
- For high-traffic apps, add a proper API gateway and monitoring.
