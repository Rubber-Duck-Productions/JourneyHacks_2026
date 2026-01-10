const API_KEY = "736185ae3214d80248deba0bc59a9c16";
const CITY = "Vancouver";

async function getWeather() {
  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${CITY}&units=metric&appid=${API_KEY}`
    );

    const data = await res.json();

    const temp = Math.round(data.main.temp);
    const desc = data.weather[0].description;

    document.getElementById("city").textContent = data.name;
    document.getElementById("temp").textContent = `${temp}°C`;
    document.getElementById("desc").textContent = desc;

    // use the function
    if (off(temp, desc)) {
      console.log("Weather is bad — bring a jacket ☔");
    }

    return { temp, desc };

  } catch (err) {
    document.getElementById("desc").textContent = "Failed to load weather";
  }
}

function off(temp, desc) {
  const rainyConditions = [
    "moderate rain",
    "rain",
    "heavy rain",
    "light rain"
  ];

  return temp > 10 && rainyConditions.includes(desc);
}

getWeather();
