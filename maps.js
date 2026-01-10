/* maps.js — Leaflet + demo OpenWeather integration */

const DEFAULT = { lat: 49.2827, lng: -123.1207 }; // Vancouver
let map, marker, lastCoords = { ...DEFAULT };

function initMap() {
  map = L.map('map', { zoomControl: true }).setView([DEFAULT.lat, DEFAULT.lng], 12);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);

  marker = L.marker([DEFAULT.lat, DEFAULT.lng]).addTo(map).bindPopup('Vancouver').openPopup();
}

async function getWeatherByCoords(lat, lon) {
  lastCoords = { lat, lon };

  // If user supplied an API key via window.WEATHER_API_KEY, fetch live data.
  if (window.WEATHER_API_KEY && window.WEATHER_API_KEY.trim()) {
    try {
      const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${window.WEATHER_API_KEY}`);
      if (!res.ok) throw new Error('network');
      const data = await res.json();
      updateWeatherUI(data);
    } catch (err) {
      showError('Failed to load live weather. Showing demo data.');
      updateWeatherUI(getDemoData());
    }
  } else {
    // Demo fallback
    updateWeatherUI(getDemoData());
  }
}

function updateWeatherUI(data) {
  const temp = Math.round(data.main.temp);
  const desc = data.weather[0].description;
  const city = data.name || 'Unknown';
  const weatherId = data.weather[0].id || 800;

  document.getElementById('city').textContent = city;
  document.getElementById('temp').textContent = `${temp}°C`;
  document.getElementById('desc').textContent = desc;

  updateBackground(weatherId);
  updateMarker(data.coord?.lat || lastCoords.lat, data.coord?.lon || lastCoords.lon, city);
}

function updateMarker(lat, lng, popupText) {
  marker.setLatLng([lat, lng]).bindPopup(popupText || 'Location').openPopup();
  map.setView([lat, lng], 12);
}

function showError(msg) {
  const desc = document.getElementById('desc');
  desc.textContent = msg;
}

function getDemoData() {
  return {
    coord: { lat: DEFAULT.lat, lon: DEFAULT.lng },
    name: 'Vancouver',
    main: { temp: 8 },
    weather: [{ id: 803, description: 'Partly cloudy' }]
  };
}

function initUI() {
  document.getElementById('searchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = document.getElementById('search').value.trim();
    if (!q) return;

    // If we have a key we can call OpenWeatherMap geocoding; otherwise simple lookups
    if (window.WEATHER_API_KEY && window.WEATHER_API_KEY.trim()) {
      try {
        const geo = await fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(q)}&limit=1&appid=${window.WEATHER_API_KEY}`);
        const arr = await geo.json();
        if (arr && arr.length) {
          const { lat, lon, name } = arr[0];
          getWeatherByCoords(lat, lon);
        } else {
          showError('Location not found');
        }
      } catch (err) {
        showError('Geocoding failed');
      }
    } else {
      // Demo mapping for a few cities
      const maps = {
        vancouver: { lat: 49.2827, lon: -123.1207 },
        toronto: { lat: 43.6532, lon: -79.3832 },
        london: { lat: 51.5074, lon: -0.1278 },
        sydney: { lat: -33.8688, lon: 151.2093 }
      };
      const key = q.toLowerCase();
      if (maps[key]) {
        const { lat, lon } = maps[key];
        getWeatherByCoords(lat, lon);
      } else {
        showError('Unknown demo city — try Vancouver, Toronto, London, or Sydney');
      }
    }
  });

  document.getElementById('locateBtn').addEventListener('click', () => {
    if (!navigator.geolocation) {
      showError('Geolocation not supported');
      return;
    }
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;
      getWeatherByCoords(lat, lon);
    }, () => showError('Unable to get your location'));
  });

  document.getElementById('refreshBtn').addEventListener('click', () => {
    getWeatherByCoords(lastCoords.lat, lastCoords.lon);
  });
}

// Simple mapping of weather id to body class for background style
function updateBackground(weatherId) {
  document.body.classList.remove('weather-clear','weather-clouds','weather-rain','weather-snow');
  if (weatherId >= 200 && weatherId < 600) document.body.classList.add('weather-rain');
  else if (weatherId >= 600 && weatherId < 700) document.body.classList.add('weather-snow');
  else if (weatherId === 800) document.body.classList.add('weather-clear');
  else document.body.classList.add('weather-clouds');
}

// Init
window.addEventListener('DOMContentLoaded', () => {
  initMap();
  initUI();
  // initial demo weather
  getWeatherByCoords(DEFAULT.lat, DEFAULT.lng);
});
