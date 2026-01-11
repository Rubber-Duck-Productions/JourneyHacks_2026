
GOOGLE_MAPS_API_KEY = "AIzaSyBLxPuSPPd9VsFhC6LOJdk_5dGwAQVIBAE";
GEMINI_API_KEY = "AIzaSyDJ5lYgcPICspOJIQxUeU7U7-RBbwmIlLk";

/*************************************************
 * CONFIG
 *************************************************/
const DEFAULT_SEARCH_RADIUS = 5000; // meters
const AUTO_OPEN_POPUPS = 6;

/*************************************************
 * STATE
 *************************************************/
let activitiesMarkers = [];
let currentUserLocation = null;

let _placesService = null;
let _placesLoader = null;

/*************************************************
 * LOCATION UTILITIES
 *************************************************/
function normalizeLocation(loc) {
  if (!loc) return null;

  const lat = Number(loc.lat ?? loc.latitude);
  const lng = Number(loc.lng ?? loc.lon ?? loc.longitude);

  if (!isFinite(lat) || !isFinite(lng)) return null;
  return { lat, lng };
}

function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) ** 2;

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function formatDistance(km) {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

function updateDistanceDisplay(km) {
  const el = document.getElementById('distance-display');
  if (el) el.textContent = formatDistance(km);
}

/*************************************************
 * GOOGLE PLACES JS LOADER
 *************************************************/
function ensurePlacesService(timeout = 8000) {
  if (_placesService) return Promise.resolve(_placesService);
  if (_placesLoader) return _placesLoader;

  _placesLoader = new Promise(resolve => {
    if (window.google?.maps?.places) {
      _placesService = new google.maps.places.PlacesService(document.createElement('div'));
      resolve(_placesService);
      return;
    }

    const cb = '__places_loaded';
    window[cb] = () => {
      _placesService = new google.maps.places.PlacesService(document.createElement('div'));
      resolve(_placesService);
      delete window[cb];
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${window.GOOGLE_MAPS_API_KEY}&libraries=places&callback=${cb}`;
    script.async = true;
    script.onerror = () => resolve(null);
    document.head.appendChild(script);

    setTimeout(() => resolve(null), timeout);
  });

  return _placesLoader;
}

/*************************************************
 * PLACES SEARCH
 *************************************************/
async function findNearbyPlaces(lat, lng, radius) {
  const svc = await ensurePlacesService();
  if (!svc) return getDemoActivities(lat, lng);

  const queries = [
    'museums near me',
    'libraries near me',
    'indoor activities near me',
    'cafes near me'
  ];

  const results = [];

  for (const query of queries) {
    const req = {
      query,
      location: new google.maps.LatLng(lat, lng),
      radius
    };

    const res = await new Promise(resolve => {
      svc.textSearch(req, (r, status) =>
        status === google.maps.places.PlacesServiceStatus.OK ? resolve(r) : resolve([])
      );
    });

    results.push(...res);
  }

  const unique = [];
  const seen = new Set();

  for (const p of results) {
    if (!seen.has(p.place_id)) {
      seen.add(p.place_id);
      unique.push({
        ...p,
        geometry: {
          location: {
            lat: p.geometry.location.lat(),
            lng: p.geometry.location.lng()
          }
        }
      });
    }
  }

  return unique.slice(0, 10);
}

/*************************************************
 * GEMINI SUGGESTIONS
 *************************************************/
async function getGeminiSuggestions(lat, lng, places) {
  if (!window.GEMINI_API_KEY) return null;

  const payload = places.slice(0, 5).map(p => ({
    name: p.name,
    type: p.types?.[0],
    rating: p.rating
  }));

  const prompt = `
Suggest indoor rainy-day activities from:
${JSON.stringify(payload)}
Return JSON array: { name, description, category }
`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${window.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      }
    );

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const match = text?.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : null;
  } catch {
    return null;
  }
}

/*************************************************
 * DEMO FALLBACK
 *************************************************/
function getDemoActivities(lat, lng) {
  return [
    {
      name: 'Local Museum',
      place_id: 'demo1',
      rating: 4.5,
      types: ['museum'],
      geometry: { location: { lat: lat + 0.01, lng: lng + 0.01 } }
    },
    {
      name: 'Public Library',
      place_id: 'demo2',
      rating: 4.7,
      types: ['library'],
      geometry: { location: { lat: lat + 0.015, lng: lng - 0.01 } }
    }
  ];
}

/*************************************************
 * MAP RENDERING
 *************************************************/
function clearMarkers() {
  activitiesMarkers.forEach(m => {
    try { window.map.removeLayer(m); } catch {}
  });
  activitiesMarkers = [];
}

function createPopupContent(place, distance, suggestion) {
  return `
    <strong>${place.name}</strong><br/>
    ${formatDistance(distance)}<br/>
    ⭐ ${place.rating ?? 'N/A'}<br/>
    ${suggestion?.description ?? ''}
  `;
}

function displayActivities(places, userLat, userLng, suggestions) {
  if (!window.map) return;

  clearMarkers();
  const list = document.getElementById('activities-list');
  if (list) list.innerHTML = '';

  const enriched = places
    .map(p => {
      const loc = normalizeLocation(p.geometry?.location);
      if (!loc) return null;
      return {
        ...p,
        _lat: loc.lat,
        _lng: loc.lng,
        distance: calculateDistance(userLat, userLng, loc.lat, loc.lng)
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance);

  if (!enriched.length) return;
  updateDistanceDisplay(enriched[0].distance);

  enriched.forEach((place, i) => {
    const marker = L.marker([place._lat, place._lng]).addTo(window.map);
    marker.bindPopup(createPopupContent(place, place.distance, suggestions?.[i]));

    if (i < AUTO_OPEN_POPUPS) {
      setTimeout(() => marker.openPopup(), i * 400);
    }

    activitiesMarkers.push(marker);

    if (list) {
      const item = document.createElement('div');
      item.className = 'activity-item';
      item.textContent = `${place.name} • ${formatDistance(place.distance)}`;
      item.onclick = () => {
        window.map.setView([place._lat, place._lng], 15);
        marker.openPopup();
      };
      list.appendChild(item);
    }
  });
}

/*************************************************
 * MAIN FLOW
 *************************************************/
async function findActivities() {
  if (!currentUserLocation) {
    alert('Set your location first');
    return;
  }

  const { lat, lng } = normalizeLocation(currentUserLocation);
  let places = await findNearbyPlaces(lat, lng, DEFAULT_SEARCH_RADIUS);
  if (!places.length) places = getDemoActivities(lat, lng);

  const suggestions = await getGeminiSuggestions(lat, lng, places);
  displayActivities(places, lat, lng, suggestions);
}

/*************************************************
 * INIT
 *************************************************/
function initActivities() {
  document
    .getElementById('findActivitiesBtn')
    ?.addEventListener('click', findActivities);

  if (window.lastCoords) {
    currentUserLocation = normalizeLocation(window.lastCoords);
  }
}

window.updateActivitiesLocation = (lat, lng) => {
  currentUserLocation = { lat, lng };
};

window.addEventListener('DOMContentLoaded', initActivities);
