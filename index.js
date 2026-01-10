/* index.js — legacy weather widget (restored & cleaned) */
const CITY = "Vancouver";

// Prefer a runtime key set on the page (window.INDEX_API_KEY or window.WEATHER_API_KEY).
// Fall back to the embedded default only if none supplied.
const FALLBACK_KEY = "736185ae3214d80248deba0bc59a9c16";
const API_KEY = (window.INDEX_API_KEY && window.INDEX_API_KEY.trim()) ? window.INDEX_API_KEY : (window.WEATHER_API_KEY && window.WEATHER_API_KEY.trim()) ? window.WEATHER_API_KEY : FALLBACK_KEY;

// Reveal key status in console and UI
(function showKeyStatus() {
  const note = document.getElementById('keyNote');
  if (API_KEY && API_KEY !== FALLBACK_KEY) {
    console.info('[index] Using API key provided on page (masked):', API_KEY.slice(0,4) + '...' + API_KEY.slice(-4));
    if (note) note.textContent = 'Using API key provided on page (masked): ' + API_KEY.slice(0,4) + '...' + API_KEY.slice(-4);
  } else if (API_KEY === FALLBACK_KEY) {
    console.info('[index] Using fallback (embedded) API key — you can set window.INDEX_API_KEY to override.');
    if (note) note.textContent = 'Using fallback embedded API key. For production, set a page key (window.INDEX_API_KEY).';
  } else {
    console.info('[index] No API key available.');
    if (note) note.textContent = 'No API key provided — page is in demo mode.';
  }
})();

async function getWeather() {
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(CITY)}&units=metric&appid=${API_KEY}`;
    console.debug('[index] Fetching weather:', url);
    const res = await fetch(url);

    if (!res.ok) {
      let body = '';
      try { body = await res.text(); } catch (e) {}
      console.warn('[index] Weather fetch failed', res.status, body);

      const descEl = document.getElementById('desc');
      if (res.status === 401 || res.status === 403) {
        if (descEl) descEl.textContent = 'API key invalid or not authorized (401/403).';
      } else if (res.status === 429) {
        if (descEl) descEl.textContent = 'Rate limit exceeded (429).';
      } else {
        if (descEl) descEl.textContent = `Weather request failed (status ${res.status}).`;
      }

      // Update background with nothing and return
      document.body.classList.add('app-off');
      return;
    }

    const data = await res.json();

    const temp = Math.round(data.main.temp);
    const desc = data.weather[0].description;
    const weatherId = data.weather[0].id;

    document.getElementById("city").textContent = data.name;
    document.getElementById("temp").textContent = `${temp}°C`;
    document.getElementById("desc").textContent = desc;

    updateBackground(weatherId);

    // Always display the weather widget after a successful fetch
    switchOnApp();

    // Keep the advisory status in the body class but do NOT hide the UI
    if (!shouldAppBeOn(temp, desc)) {
      document.body.classList.add('app-off');
      console.info('[index] Advisory: app-off status set (conditions not met)');
    } else {
      document.body.classList.remove('app-off');
      console.info('[index] Advisory: app-on status');
    }

  } catch (err) {
    console.error('[index] Fetch error', err);
    const descEl = document.getElementById("desc");
    if (descEl) descEl.textContent = "Network error while fetching weather";
  }
}

function switchOffApp() {
  // Legacy helper: do not hide the element to avoid accidental UI disappearance.
  // Keep a class for advisory styling only.
  document.body.classList.add('app-off');
  console.debug('[index] switchOffApp invoked — advisory class applied (widget kept visible)');
}

function switchOnApp() {
  const el = document.getElementById("weather-app");
  if (el) el.style.display = "block";
  document.body.classList.remove("app-off");
}

function shouldAppBeOn(temp, desc) {
  return temp >= 10 && desc.toLowerCase().includes("rain");
}

function updateBackground(weatherId) {
  document.body.classList.remove('bg-heavy-rain','bg-drizzle','bg-rain','bg-snow','bg-clear');
  if (weatherId >= 200 && weatherId < 300) {
    document.body.classList.add('bg-heavy-rain');
  } else if (weatherId >= 300 && weatherId < 500) {
    document.body.classList.add('bg-drizzle');
  } else if (weatherId >= 500 && weatherId < 531) {
    document.body.classList.add('bg-rain');
  } else if (weatherId >= 600 && weatherId < 700) {
    document.body.classList.add('bg-snow');
  } else if (weatherId === 800) {
    document.body.classList.add('bg-clear');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  // hook up refresh button
  const refresh = document.getElementById('refreshBtn');
  if (refresh) refresh.addEventListener('click', getWeather);

  const legacy = document.getElementById('legacyRefreshBtn');
  if (legacy) legacy.addEventListener('click', getWeather);

  // run once to initialize
  getWeather();
});

