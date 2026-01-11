/* maps.js — Leaflet + demo OpenWeather integration */

WEATHER_API_KEY = "736185ae3214d80248deba0bc59a9c16";

const DEFAULT = { lat: 49.2827, lng: -123.1207 }; // Vancouver
let map,
  marker,
  lastCoords = { ...DEFAULT };

// Expose map and lastCoords globally for activities.js
window.map = null;
window.lastCoords = lastCoords;

function initMap() {
  map = L.map("map", { zoomControl: true }).setView(
    [DEFAULT.lat, DEFAULT.lng],
    12
  );
  window.map = map; // Expose globally

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors",
  }).addTo(map);

  marker = L.marker([DEFAULT.lat, DEFAULT.lng])
    .addTo(map)
    .bindPopup("Vancouver")
    .openPopup();
}

async function getWeatherByCoords(lat, lon) {
  lastCoords = { lat, lon };
  window.lastCoords = lastCoords; // Update global reference

  // Update activities location if function exists
  if (window.updateActivitiesLocation) {
    window.updateActivitiesLocation(lat, lon);
  }

  // Determine API key: prefer window.WEATHER_API_KEY, fallback to window.INDEX_API_KEY
  const key =
    window.WEATHER_API_KEY && window.WEATHER_API_KEY.trim()
      ? window.WEATHER_API_KEY
      : window.INDEX_API_KEY && window.INDEX_API_KEY.trim()
      ? window.INDEX_API_KEY
      : null;

  if (!key) {
    // No key: demo fallback
    console.info("[maps] No API key provided — using demo data");
    updateWeatherUI(getDemoData());
    return;
  }

  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${key}`;
  console.debug("[maps] Fetching weather:", url);

  try {
    const res = await fetch(url);
    if (!res.ok) {
      // Try to parse error body if possible
      let bodyText = "";
      try {
        bodyText = await res.text();
      } catch (e) {
        /* ignore */
      }
      console.warn("[maps] Weather fetch failed", res.status, bodyText);

      if (res.status === 401 || res.status === 403) {
        showError(
          "API key invalid or not authorized (401/403). Check your key and referrer restrictions."
        );
      } else if (res.status === 429) {
        showError("Rate limit exceeded (429). Try again later.");
      } else {
        showError(`Weather request failed (status ${res.status}).`);
      }

      // fall back to demo but keep UI informed
      updateWeatherUI(getDemoData());
      return;
    }

    const data = await res.json();
    updateWeatherUI(data);
  } catch (err) {
    console.error("[maps] Fetch error", err);
    showError(
      "Network error while fetching weather. Check your connection and API key."
    );
    updateWeatherUI(getDemoData());
  }
}

function updateWeatherUI(data) {
  const temp = Math.round(data.main.temp);
  const desc = data.weather[0].description;
  const city = data.name || "Unknown";
  const weatherId = data.weather[0].id || 800;

  document.getElementById("city").textContent = city;
  document.getElementById("temp").textContent = `${temp}°C`;
  document.getElementById("desc").textContent = desc;

  updateWeatherBackground(weatherId);
  updateMarker(
    data.coord?.lat || lastCoords.lat,
    data.coord?.lon || lastCoords.lon,
    city
  );
}

function updateMarker(lat, lng, popupText) {
  marker
    .setLatLng([lat, lng])
    .bindPopup(popupText || "Location")
    .openPopup();
  map.setView([lat, lng], 12);
}

function showError(msg) {
  const desc = document.getElementById("desc");
  desc.textContent = msg;
}

function getDemoData() {
  return {
    coord: { lat: DEFAULT.lat, lon: DEFAULT.lng },
    name: "Vancouver",
    main: { temp: 8 },
    weather: [{ id: 803, description: "Partly cloudy" }],
  };
}

function initUI() {
  document
    .getElementById("searchForm")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const q = document.getElementById("search").value.trim();
      if (!q) return;

      // If we have a key we can call OpenWeatherMap geocoding; otherwise simple lookups
      if (window.WEATHER_API_KEY && window.WEATHER_API_KEY.trim()) {
        try {
          const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(
            q
          )}&limit=1&appid=${window.WEATHER_API_KEY}`;
          console.debug("[maps] Geocoding:", geoUrl);
          const geo = await fetch(geoUrl);
          if (!geo.ok) {
            let txt = "";
            try {
              txt = await geo.text();
            } catch (e) {}
            console.warn("[maps] Geocode failed", geo.status, txt);
            if (geo.status === 401 || geo.status === 403)
              showError("Geocoding rejected: invalid API key (401/403).");
            else showError(`Geocoding failed (status ${geo.status}).`);
            return;
          }
          const arr = await geo.json();
          if (arr && arr.length) {
            const { lat, lon, name } = arr[0];
            await getWeatherByCoords(lat, lon);
            if (window.findActivities) {
              try { window.findActivities(); } catch (err) { console.warn('[maps] findActivities call failed after search', err); }
            }
          } else {
            showError("Location not found");
          }
        } catch (err) {
          console.error("[maps] Geocoding error", err);
          showError("Geocoding failed (network error)");
        }
      } else {
        // Demo mapping for a few cities
        const maps = {
          vancouver: { lat: 49.2827, lon: -123.1207 },
          toronto: { lat: 43.6532, lon: -79.3832 },
          london: { lat: 51.5074, lon: -0.1278 },
          sydney: { lat: -33.8688, lon: 151.2093 },
        };
        const key = q.toLowerCase();
        if (maps[key]) {
          const { lat, lon } = maps[key];
          getWeatherByCoords(lat, lon);
        } else {
          showError(
            "Unknown demo city — try Vancouver, Toronto, London, or Sydney"
          );
        }
      }
    });

  document.getElementById("locateBtn").addEventListener("click", () => {
    if (!navigator.geolocation) {
      showError("Geolocation not supported");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        // Wait for the weather/map update, then trigger activities lookup if available
        try {
          await getWeatherByCoords(lat, lon);
        } catch (e) {
          console.warn('[maps] getWeatherByCoords failed during locate flow', e);
        }
        if (window.findActivities) {
          try { window.findActivities(); } catch (err) { console.warn('[maps] findActivities failed', err); }
        }
      },
      () => showError("Unable to get your location")
    );
  });

  document.getElementById("refreshBtn").addEventListener("click", async () => {
    try {
      await getWeatherByCoords(lastCoords.lat, lastCoords.lon);
      if (window.findActivities) {
        try { window.findActivities(); } catch (err) { console.warn('[maps] findActivities call failed after refresh', err); }
      }
    } catch (e) {
      console.warn('[maps] refresh getWeatherByCoords failed', e);
    }
  });

  const testBtn = document.getElementById("testKeyBtn");
  if (testBtn) testBtn.addEventListener("click", testAPIKey);
}

async function testAPIKey() {
  const key =
    window.WEATHER_API_KEY && window.WEATHER_API_KEY.trim()
      ? window.WEATHER_API_KEY
      : window.INDEX_API_KEY && window.INDEX_API_KEY.trim()
      ? window.INDEX_API_KEY
      : null;
  const note = document.getElementById("keyNote");
  if (!key) {
    const msg =
      "No API key set. Add one via inline script before `maps.js` as described in the page.";
    console.info("[maps] " + msg);
    if (note) note.textContent = msg;
    return;
  }

  const testUrl = `https://api.openweathermap.org/data/2.5/weather?q=London&units=metric&appid=${key}`;
  console.debug("[maps] Testing API key with", testUrl);

  try {
    const res = await fetch(testUrl);
    let info = "";
    try {
      info = await res.text();
    } catch (e) {
      info = "";
    }

    if (!res.ok) {
      console.warn("[maps] Test request failed", res.status, info);
      if (note) {
        if (res.status === 401 || res.status === 403)
          note.textContent = "API key invalid or unauthorized (401/403).";
        else if (res.status === 429)
          note.textContent = "Rate limit exceeded (429).";
        else note.textContent = `Test request failed (status ${res.status}).`;
      }
      return;
    }

    const data = JSON.parse(info || "{}");
    console.info("[maps] Test success", data);
    if (note)
      note.textContent = `API key looks OK — sample: ${
        data.name || "Unknown"
      }, ${Math.round(data.main?.temp || 0)}°C`;
  } catch (err) {
    console.error("[maps] API key test error", err);
    if (note) note.textContent = "Network error while testing API key";
  }
}

// Attempt to detect the user's location on page load and fetch weather for it.
function tryAutoLocateOnLoad() {
  const status = document.getElementById("statusNote");
  if (!navigator.geolocation) {
    const msg = "Geolocation not supported by your browser.";
    console.info("[maps] " + msg);
    if (status) status.textContent = msg;
    // fallback to demo/default
    getWeatherByCoords(DEFAULT.lat, DEFAULT.lng);
    return;
  }

  if (status)
    status.textContent = "Locating… (allow the browser to share your location)";

  const geoOptions = { timeout: 10000, maximumAge: 0 };
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      console.info("[maps] Located user", lat, lon);
      if (status) status.textContent = "Using your location";
      try {
        await getWeatherByCoords(lat, lon);
      } catch (e) {
        console.warn('[maps] getWeatherByCoords failed during auto-locate', e);
      }
      if (window.findActivities) {
        try { window.findActivities(); } catch (err) { console.warn('[maps] findActivities failed', err); }
      }
    },
    (err) => {
      console.warn("[maps] Geolocation failed", err);
      if (status) {
        if (err.code === 1)
          status.textContent =
            'Location permission denied. Click "Use my location" to retry.';
        else if (err.code === 2)
          status.textContent =
            "Position unavailable. Showing default location.";
        else if (err.code === 3)
          status.textContent =
            "Location request timed out. Showing default location.";
        else
          status.textContent =
            "Unable to determine location. Showing default location.";
      }
      getWeatherByCoords(DEFAULT.lat, DEFAULT.lng);
    },
    geoOptions
  );
}

// Simple mapping of weather id to body class for background style
function updateWeatherBackground(weatherId) {
  document.body.classList.remove(
    "weather-clear",
    "weather-clouds",
    "weather-rain",
    "weather-snow"
  );
  if (weatherId >= 200 && weatherId < 600)
    document.body.classList.add("weather-rain");
  else if (weatherId >= 600 && weatherId < 700)
    document.body.classList.add("weather-snow");
  else if (weatherId === 800) document.body.classList.add("weather-clear");
  else document.body.classList.add("weather-clouds");
}

// Init
window.addEventListener("DOMContentLoaded", () => {
  initMap();
  initUI();
  // try to auto-locate the user and show local weather (falls back to default)
  tryAutoLocateOnLoad();
});
