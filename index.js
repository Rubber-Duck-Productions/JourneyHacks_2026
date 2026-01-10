/* index.js — legacy weather widget (restored & cleaned) */
const API_KEY = "736185ae3214d80248deba0bc59a9c16";
const CITY = "Vancouver";

async function getWeather() {
  try {
    const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(CITY)}&units=metric&appid=${API_KEY}`);
    if (!res.ok) throw new Error('network');
    const data = await res.json();

    const temp = Math.round(data.main.temp);
    const desc = data.weather[0].description;
    const weatherId = data.weather[0].id;

    document.getElementById("city").textContent = data.name;
    document.getElementById("temp").textContent = `${temp}°C`;
    document.getElementById("desc").textContent = desc;

    updateBackground(weatherId);

    if (!shouldAppBeOn(temp, desc)) {
      switchOffApp();
    } else {
      switchOnApp();
    }

  } catch (err) {
    const descEl = document.getElementById("desc");
    if (descEl) descEl.textContent = "Failed to load weather";
  }
}

function switchOffApp() {
  const el = document.getElementById("weather-app");
  if (el) el.style.display = "none";
  document.body.classList.add("app-off");
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

