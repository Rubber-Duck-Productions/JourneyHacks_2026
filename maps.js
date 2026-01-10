
src="https://maps.googleapis.com/maps/api/js?key=AIzaSyBLxPuSPPd9VsFhC6LOJdk_5dGwAQVIBAE"
defer


function initMap(lat, lng) {
  const userLocation = { lat, lng };

  const map = new google.maps.Map(document.getElementById("map"), {
    zoom: 14,
    center: userLocation,
  });

  new google.maps.Marker({
    position: userLocation,
    map: map,
    title: "You are here",
  });
}


async function getWeatherByCoords(lat, lon) {
  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${WEATHER_API_KEY}`
    );

    const data = await res.json();

    const temp = Math.round(data.main.temp);
    const desc = data.weather[0].description;
    const city = data.name;
    const weatherId = data.weather[0].id;

    document.getElementById("city").textContent = city;
    document.getElementById("temp").textContent = `${temp}°C`;
    document.getElementById("desc").textContent = desc;

    updateBackground(weatherId);

  } catch (err) {
    document.getElementById("desc").textContent =
      "Failed to load weather";
  }
}
