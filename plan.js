let currentUserLocation = null;

    function calculateDistance(lat1, lon1, lat2, lon2) {
      const R = 6371;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a =
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      return R * c;
    }

    function formatDistance(distance) {
      if (distance < 1) return `${Math.round(distance * 1000)}m`;
      return `${distance.toFixed(1)}km`;
    }

    const DEFAULT_SEARCH_RADIUS = 5000;

    // Prefer the Google Maps JavaScript PlacesService (avoids REST CORS issues)
    let _placesLoader = null;
    let _placesService = null;

    function ensurePlacesService(timeout = 8000) {
      if (_placesService) return Promise.resolve(_placesService);
      if (_placesLoader) return _placesLoader;

      _placesLoader = new Promise((resolve) => {
        const apiKey = window.GOOGLE_MAPS_API_KEY;

        if (window.google && google.maps && google.maps.places) {
          try {
            const root = document.getElementById('places-service-root') || document.createElement('div');
            root.id = 'places-service-root';
            root.style.display = 'none';
            document.body.appendChild(root);
            _placesService = new google.maps.places.PlacesService(root);
            resolve(_placesService);
            return;
          } catch (e) {
            console.warn('[plan] PlacesService creation failed', e);
            resolve(null);
            return;
          }
        }

        if (!apiKey || !apiKey.trim() || apiKey === 'AIzaSyDummyKey') {
          resolve(null);
          return;
        }

        const cbName = '__plan_places_loaded';
        window[cbName] = () => {
          try {
            const root = document.getElementById('places-service-root') || document.createElement('div');
            root.id = 'places-service-root';
            root.style.display = 'none';
            document.body.appendChild(root);
            _placesService = new google.maps.places.PlacesService(root);
            resolve(_placesService);
          } catch (e) {
            console.warn('[plan] PlacesService creation after load failed', e);
            resolve(null);
          } finally {
            try { delete window[cbName]; } catch {}
          }
        };

        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=${cbName}`;
        script.async = true;
        script.defer = true;
        script.onerror = (e) => {
          console.warn('[plan] Loading Google Maps JS failed', e);
          resolve(null);
        };
        document.head.appendChild(script);

        setTimeout(() => {
          if (!_placesService) resolve(null);
        }, timeout);
      });

      return _placesLoader;
    }

    async function getPlaceDetails(placeId) {
      if (!placeId) return null;

      const svc = await ensurePlacesService();
      if (svc) {
        return new Promise((resolve) => {
          svc.getDetails(
            { placeId, fields: ['name', 'rating', 'user_ratings_total', 'reviews', 'formatted_address', 'geometry', 'place_id', 'vicinity'] },
            (res, status) => {
              if (status === google.maps.places.PlacesServiceStatus.OK && res) resolve(res);
              else resolve(null);
            }
          );
        });
      }

      // REST fallback is usually blocked by browser CORS; keep as best-effort
      const apiKey = window.GOOGLE_MAPS_API_KEY;
      if (!apiKey || !apiKey.trim() || apiKey === 'AIzaSyDummyKey') return null;

      try {
        const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,rating,user_ratings_total,reviews,formatted_address,geometry,place_id,vicinity&key=${apiKey}`;
        const response = await fetch(url);
        if (!response.ok) return null;
        const data = await response.json();
        if (data.status === 'OK' && data.result) return data.result;
        return null;
      } catch {
        return null;
      }
    }

    async function textSearch(query, lat, lng, radius = DEFAULT_SEARCH_RADIUS) {
      const svc = await ensurePlacesService();
      if (svc) {
        return new Promise((resolve) => {
          const req = { query, location: new google.maps.LatLng(lat, lng), radius };
          svc.textSearch(req, (results, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && results) {
              const mapped = results.map(r => ({
                ...r,
                geometry: r.geometry && r.geometry.location
                  ? { location: { lat: r.geometry.location.lat(), lng: r.geometry.location.lng() } }
                  : r.geometry
              }));
              resolve({ status: 'OK', results: mapped });
            } else {
              console.warn('[plan] textSearch failed', status);
              resolve({ status: 'ERROR' });
            }
          });
        });
      }

      // REST fallback (likely CORS blocked)
      const apiKey = window.GOOGLE_MAPS_API_KEY;
      if (!apiKey || !apiKey.trim() || apiKey === 'AIzaSyDummyKey') return null;

      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&location=${lat},${lng}&radius=${radius}&key=${apiKey}`;

      try {
        const response = await fetch(url);
        if (!response.ok) return { status: 'ERROR' };
        return await response.json();
      } catch {
        return { status: 'ERROR' };
      }
    }

    function getDemoPlan(lat, lng) {
      return {
        cafe: [
          { name: "Coffee Shop", place_id: "demo_cafe_1", geometry: { location: { lat: lat + 0.010, lng: lng + 0.012 } }, rating: 4.6, user_ratings_total: 230, formatted_address: "Downtown",
            reviews: [{ author_name: "Lisa K.", rating: 5, text: "Perfect spot to wait out the rain—great espresso and cozy seating." }] },
          { name: "Bookstore Café Corner", place_id: "demo_cafe_2", geometry: { location: { lat: lat + 0.006, lng: lng - 0.008 } }, rating: 4.7, user_ratings_total: 98, formatted_address: "Gastown",
            reviews: [{ author_name: "Noah P.", rating: 5, text: "Quiet vibe, good pastries, and a calm corner to plan the day." }] },
          { name: "Minimal Roasters", place_id: "demo_cafe_3", geometry: { location: { lat: lat - 0.009, lng: lng + 0.004 } }, rating: 4.5, user_ratings_total: 155, formatted_address: "Mount Pleasant",
            reviews: [{ author_name: "Sarah M.", rating: 4, text: "Great coffee, clean aesthetic, solid music." }] }
        ],
        dinner: [
          { name: "Comfort Bowl House", place_id: "demo_dinner_1", geometry: { location: { lat: lat + 0.014, lng: lng + 0.002 } }, rating: 4.6, user_ratings_total: 410, formatted_address: "Main St",
            reviews: [{ author_name: "John D.", rating: 5, text: "Huge portions. Exactly the heavy meal you want on a cold day." }] },
          { name: "Grill & Rice", place_id: "demo_dinner_2", geometry: { location: { lat: lat - 0.011, lng: lng - 0.010 } }, rating: 4.4, user_ratings_total: 260, formatted_address: "Kitsilano",
            reviews: [{ author_name: "Emma L.", rating: 4, text: "Protein-heavy, fast service, satisfying." }] },
          { name: "Noodle + Broth Spot", place_id: "demo_dinner_3", geometry: { location: { lat: lat + 0.008, lng: lng + 0.015 } }, rating: 4.5, user_ratings_total: 330, formatted_address: "Chinatown",
            reviews: [{ author_name: "Mike R.", rating: 5, text: "Warm, filling, and perfect when the weather is gross." }] }
        ],
        relax: [
          { name: "Vinyl Listening Bar", place_id: "demo_relax_1", geometry: { location: { lat: lat + 0.012, lng: lng - 0.004 } }, rating: 4.6, user_ratings_total: 120, formatted_address: "Downtown",
            reviews: [{ author_name: "Tom W.", rating: 5, text: "Great cocktails and music selection—super relaxing." }] },
          { name: "Candle & Scent Lab", place_id: "demo_relax_2", geometry: { location: { lat: lat - 0.006, lng: lng + 0.010 } }, rating: 4.8, user_ratings_total: 75, formatted_address: "Mount Pleasant",
            reviews: [{ author_name: "Ava S.", rating: 5, text: "Niche scents and calm vibes. You’ll leave happier." }] },
          { name: "Public Library", place_id: "demo_relax_3", geometry: { location: { lat: lat + 0.015, lng: lng + 0.006 } }, rating: 4.7, user_ratings_total: 89, formatted_address: "Near you",
            reviews: [{ author_name: "Chris B.", rating: 5, text: "Quiet, cozy, and a perfect rainy-day reset." }] }
        ]
      };
    }

    function escapeHtml(str) {
      return String(str ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }

    function placeToCard(place, userLat, userLng) {
      const lat = Number(place?.geometry?.location?.lat);
      const lng = Number(place?.geometry?.location?.lng ?? place?.geometry?.location?.lon);

      const distance = (isFinite(lat) && isFinite(lng))
        ? calculateDistance(userLat, userLng, lat, lng)
        : null;

      const rating = place.rating != null ? Number(place.rating).toFixed(1) : "—";
      const total = place.user_ratings_total != null ? place.user_ratings_total : "";
      const address = place.formatted_address || place.vicinity || "";
      const topReview = (place.reviews && place.reviews[0] && place.reviews[0].text) ? place.reviews[0] : null;

      const mapsUrl = place.place_id
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name || "place")}&query_place_id=${encodeURIComponent(place.place_id)}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name || "place")}`;

      return `
        <div class="rounded-[18px] bg-white/45 ring-1 ring-black/10 p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="text-[14px] font-extrabold tracking-tight text-slate-950 truncate">
                ${escapeHtml(place.name || "Untitled")}
              </div>

              <div class="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-700/70">
                <span class="font-semibold text-slate-900/70">★ ${rating}${total ? ` (${escapeHtml(total)})` : ""}</span>
                ${distance != null ? `<span class="text-slate-700/50">•</span><span>${escapeHtml(formatDistance(distance))}</span>` : ""}
              </div>

              ${address ? `<div class="mt-2 text-[11px] text-slate-700/65">${escapeHtml(address)}</div>` : ""}

              ${topReview ? `
                <div class="mt-3 rounded-[14px] bg-black/5 p-3">
                  <div class="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-700/70">Quick take</div>
                  <div class="mt-1 text-[11px] text-slate-800/80">
                    “${escapeHtml(String(topReview.text).slice(0, 140))}${topReview.text && topReview.text.length > 140 ? "…" : ""}”
                  </div>
                </div>
              ` : ""}
            </div>

            <a class="shrink-0 rounded-full bg-black/10 px-3 py-1 text-[11px] font-semibold text-slate-800/80 hover:bg-black/15 active:bg-black/20 transition"
               href="${mapsUrl}" target="_blank" rel="noreferrer">
              Maps
            </a>
          </div>
        </div>
      `;
    }

    function setList(stateId, listId, { loading = false, error = "", places = [], userLat, userLng }) {
      const stateEl = document.getElementById(stateId);
      const listEl = document.getElementById(listId);

      if (loading) { stateEl.textContent = "Loading…"; listEl.innerHTML = ""; return; }
      if (error) { stateEl.textContent = error; listEl.innerHTML = ""; return; }

      stateEl.textContent = "";
      listEl.innerHTML = places.map(p => placeToCard(p, userLat, userLng)).join("");
    }

    function updateClock() {
      const d = new Date();
      let h = d.getHours();
      const m = String(d.getMinutes()).padStart(2, "0");
      const ampm = h >= 12 ? "PM" : "AM";
      h = h % 12 || 12;

      document.getElementById("timeValue").textContent = `${h}:${m}`;
      document.getElementById("ampmValue").textContent = ampm;
      document.getElementById("dateValue").textContent =
        d.toLocaleDateString(undefined, { weekday:"short", month:"short", day:"numeric" });
    }
    updateClock();
    setInterval(updateClock, 1000);

    (function showKeyStatus() {
      const note = document.getElementById('keyNote');
      const k = window.GOOGLE_MAPS_API_KEY;
      if (k && k.trim() && k !== 'AIzaSyDummyKey') {
        const masked = k.slice(0,4) + "..." + k.slice(-4);
        if (note) note.textContent = `Google Maps key detected (masked): ${masked}`;
      } else {
        if (note) note.textContent = 'No Google Maps key detected (or dummy). Using demo/fallback.';
      }
    })();

    if (window.GOOGLE_MAPS_API_KEY && window.GOOGLE_MAPS_API_KEY.trim() && window.GOOGLE_MAPS_API_KEY !== 'AIzaSyDummyKey') {
      ensurePlacesService().then(svc => {
        if (svc) console.info('[plan] Google Places JS loaded');
      });
    }

    /* --------------------------------------------
       Weather (OpenWeather) — minimal summary in header
    -------------------------------------------- */
    const WEATHER_DEFAULT = { lat: 49.2827, lng: -123.1207 };

    function showWeatherError(msg) {
      const status = document.getElementById("statusNote");
      if (status) status.textContent = msg;
      const summary = document.getElementById("weatherSummary");
      if (summary) summary.textContent = "— • —";
    }

    function getDemoWeather() {
      return {
        name: "Vancouver",
        main: { temp: 8 },
        weather: [{ id: 803, description: "Partly cloudy" }],
      };
    }

    async function getWeatherByCoords(lat, lon) {
      const key =
        window.WEATHER_API_KEY && window.WEATHER_API_KEY.trim()
          ? window.WEATHER_API_KEY
          : window.INDEX_API_KEY && window.INDEX_API_KEY.trim()
          ? window.INDEX_API_KEY
          : null;

      if (!key) { updateWeatherUI(getDemoWeather()); return; }

      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${key}`;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) showWeatherError('API key invalid or unauthorized (401/403).');
          else if (res.status === 429) showWeatherError('Rate limit exceeded (429).');
          else showWeatherError(`Weather request failed (status ${res.status}).`);
          updateWeatherUI(getDemoWeather());
          return;
        }
        const data = await res.json();
        updateWeatherUI(data);
      } catch {
        showWeatherError('Network error while fetching weather.');
        updateWeatherUI(getDemoWeather());
      }
    }

    function updateWeatherUI(data) {
      const temp = Math.round(data.main?.temp ?? 0);
      const desc = data.weather?.[0]?.description ?? '—';
      const city = data.name || '—';
      const summary = document.getElementById('weatherSummary');
      const cityEl = document.getElementById('cityName');
      if (summary) summary.textContent = `${temp}°C • ${desc}`;
      if (cityEl) cityEl.textContent = city;
    }

    function tryAutoLocateOnLoad() {
      const status = document.getElementById('statusNote');
      if (!navigator.geolocation) {
        if (status) status.textContent = 'Geolocation not supported.';
        getWeatherByCoords(WEATHER_DEFAULT.lat, WEATHER_DEFAULT.lng);
        return;
      }

      if (status) status.textContent = 'Locating… (allow the browser to share your location)';
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude: lat, longitude: lon } = pos.coords;
          if (status) status.textContent = 'Using your location';
          getWeatherByCoords(lat, lon);
        },
        () => {
          if (status) status.textContent = 'Unable to determine location. Showing default location.';
          getWeatherByCoords(WEATHER_DEFAULT.lat, WEATHER_DEFAULT.lng);
        },
        { timeout: 10000, maximumAge: 0 }
      );
    }

    /* --------------------------------------------
       ✅ Refresh = NEW curation helpers
    -------------------------------------------- */
    function makeNonce() {
      return `nonce_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }

    function dedupe(list) {
      const seen = new Set();
      const out = [];
      for (const p of (list || [])) {
        const id = p.place_id || p.placeId || p.id || `${p.name}|${p.formatted_address || p.vicinity || ""}`;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(p);
      }
      return out;
    }

    function shuffle(arr) {
      const a = [...(arr || [])];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    async function curatePlan() {
      const userLat = currentUserLocation?.lat ?? 49.2827;
      const userLng = currentUserLocation?.lng ?? -123.1207;

      setList("cafeState", "cafeList",    { loading: true, userLat, userLng });
      setList("dinnerState", "dinnerList",{ loading: true, userLat, userLng });
      setList("relaxState", "relaxList",  { loading: true, userLat, userLng });

      const status = document.getElementById("statusNote");

      const nonce = makeNonce();
      const qCafe   = `specialty coffee cafe near me ${nonce}`;
      const qDinner = `hearty dinner restaurant near me ${nonce}`;
      const qRelax  = `cocktail bar OR vinyl shop OR candle store OR library near me ${nonce}`;

      const [cafeRes, dinnerRes, relaxRes] = await Promise.allSettled([
        textSearch(qCafe, userLat, userLng),
        textSearch(qDinner, userLat, userLng),
        textSearch(qRelax, userLat, userLng),
      ]);

      const anyBad =
        [cafeRes, dinnerRes, relaxRes].some(r =>
          r.status !== "fulfilled" ||
          !r.value ||
          r.value.status === "ERROR" ||
          r.value.status === "REQUEST_DENIED"
        );

      if (anyBad) {
        if (status) status.textContent =
          "Showing demo picks (Places JS not loaded / blocked). Ensure Places API is enabled and key referrer allowed.";
        const demo = getDemoPlan(userLat, userLng);
        setList("cafeState", "cafeList",     { places: demo.cafe.slice(0,3), userLat, userLng });
        setList("dinnerState", "dinnerList", { places: demo.dinner.slice(0,3), userLat, userLng });
        setList("relaxState", "relaxList",   { places: demo.relax.slice(0,3), userLat, userLng });
        return;
      }

      let cafePlaces   = dedupe((cafeRes.value.results || []).slice(0, 12));
      let dinnerPlaces = dedupe((dinnerRes.value.results || []).slice(0, 12));
      let relaxPlaces  = dedupe((relaxRes.value.results || []).slice(0, 16));

      cafePlaces = shuffle(cafePlaces);
      dinnerPlaces = shuffle(dinnerPlaces);
      relaxPlaces = shuffle(relaxPlaces);

      async function enrich(list) {
        const picks = list.slice(0, 4);
        const settled = await Promise.allSettled(picks.map(async p => {
          const details = await getPlaceDetails(p.place_id);
          return details ? { ...p, ...details } : p;
        }));
        return settled.filter(x => x.status === "fulfilled" && x.value).map(x => x.value);
      }

      const [cafeEn, dinnerEn, relaxEn] = await Promise.allSettled([
        enrich(cafePlaces),
        enrich(dinnerPlaces),
        enrich(relaxPlaces),
      ]);

      const cafes   = (cafeEn.status === "fulfilled" ? cafeEn.value : cafePlaces).slice(0,3);
      const dinners = (dinnerEn.status === "fulfilled" ? dinnerEn.value : dinnerPlaces).slice(0,3);
      const relaxes = (relaxEn.status === "fulfilled" ? relaxEn.value : relaxPlaces).slice(0,3);

      if (status) status.textContent = "Plan refreshed — curated from Places results.";
      setList("cafeState", "cafeList",     { places: cafes, userLat, userLng });
      setList("dinnerState", "dinnerList", { places: dinners, userLat, userLng });
      setList("relaxState", "relaxList",   { places: relaxes, userLat, userLng });
    }

    /* --------------------------------------------
       Location controls
       ✅ DO NOT CHANGE (kept as-is from your file)
    -------------------------------------------- */
    async function useMyLocation() {
      const status = document.getElementById("statusNote");
      if (!navigator.geolocation) {
        if (status) status.textContent = "Geolocation not supported. Using Vancouver default.";
        currentUserLocation = { lat: 49.2827, lng: -123.1207 };
        await getWeatherByCoords(49.2827, -123.1207);
        await curatePlan();
        return;
      }

      if (status) status.textContent = "Getting your location…";

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          currentUserLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          if (status) status.textContent = "Location set. Curating…";
          await getWeatherByCoords(pos.coords.latitude, pos.coords.longitude);
          await curatePlan();
        },
        async () => {
          if (status) status.textContent = "Couldn’t get your location. Using Vancouver default.";
          currentUserLocation = { lat: 49.2827, lng: -123.1207 };
          await getWeatherByCoords(49.2827, -123.1207);
          await curatePlan();
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }

    /* --------------------------------------------
       Init
    -------------------------------------------- */
    window.addEventListener("DOMContentLoaded", () => {
      document.getElementById("useLocationBtn").addEventListener("click", useMyLocation);

      // ✅ Refresh buttons = new curation every time
      document.getElementById("refreshAllBtn").addEventListener("click", curatePlan);
      document.getElementById("refreshCafe").addEventListener("click", curatePlan);
      document.getElementById("refreshDinner").addEventListener("click", curatePlan);
      document.getElementById("refreshRelax").addEventListener("click", curatePlan);

      // default load (Vancouver fallback)
      currentUserLocation = { lat: 49.2827, lng: -123.1207 };
      tryAutoLocateOnLoad();
      curatePlan();
    });
