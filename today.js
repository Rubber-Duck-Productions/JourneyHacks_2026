/* todaysplan.js — "Today's Plan" (Cafe + Dinner + Drink/Relax)
   Gemini + Places via secure server proxies
*/

(() => {
    const DEFAULT_COORDS = { lat: 49.2827, lng: -123.1207 };
    const DEFAULT_RADIUS_M = 4500;
  
    /* ---------------- DOM helpers ---------------- */
    const $ = (id) => document.getElementById(id);
  
    const setText = (id, text) => {
      const el = $(id);
      if (el) el.textContent = text;
    };
  
    const escapeHtml = (s) =>
      String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
  
    function placeCardHTML(place) {
      return `
        <div class="rounded-[18px] bg-white/45 ring-1 ring-black/10 p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="text-[14px] font-extrabold truncate">${escapeHtml(place.name)}</div>
              <div class="mt-1 text-[11px] text-slate-700/70">
                ★ ${place.rating ?? "—"} ${place.user_ratings_total ? `(${place.user_ratings_total})` : ""}
              </div>
              <div class="mt-2 text-[11px] text-slate-700/60">
                ${escapeHtml(place.formatted_address || "")}
              </div>
            </div>
            <a
              href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}"
              target="_blank"
              class="rounded-full bg-black/10 px-3 py-1 text-[11px]"
            >Maps</a>
          </div>
        </div>
      `;
    }
  
    const setState = (stateId, listId, { loading = false, items = [], error = "" }) => {
      const state = $(stateId);
      const list = $(listId);
      if (!state || !list) return;
  
      if (loading) {
        state.textContent = "Loading…";
        list.innerHTML = "";
        return;
      }
  
      if (error) {
        state.textContent = error;
        list.innerHTML = "";
        return;
      }
  
      state.textContent = "";
      list.innerHTML = items.map(placeCardHTML).join("");
    };
  
    /* ---------------- Location ---------------- */
    async function getUserLocation() {
      if (window.lastCoords?.lat) return window.lastCoords;
      if (!navigator.geolocation) return DEFAULT_COORDS;
  
      return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
          () => resolve(DEFAULT_COORDS),
          { enableHighAccuracy: true, timeout: 8000 }
        );
      });
    }
  
    /* ---------------- Places (via proxy) ---------------- */
    async function fetchPlaces(query, lat, lng) {
      const proxy = window.PLACES_PROXY_URL;
      if (!proxy) return null;
  
      try {
        const res = await fetch(proxy, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, lat, lng, radius: DEFAULT_RADIUS_M })
        });
        const data = await res.json();
        return data.results || null;
      } catch {
        return null;
      }
    }
  
    function demoPlaces(lat, lng) {
      return [
        { name: "Rain City Coffee", rating: 4.6, user_ratings_total: 320, formatted_address: "Downtown" },
        { name: "Hearty Noodles", rating: 4.5, user_ratings_total: 510, formatted_address: "Main St" },
        { name: "Listening Bar", rating: 4.7, user_ratings_total: 220, formatted_address: "Gastown" }
      ];
    }
  
    /* ---------------- Gemini (via proxy) ---------------- */
    async function geminiCurate(lat, lng, candidates) {
      const proxy = window.GEMINI_PROXY_URL || "/api/gemini";
      if (!proxy) return null;
  
      const prompt = `
  Pick EXACTLY 3 places from this list for:
  1) Cafe
  2) Dinner (heavy meal)
  3) Drink or Relax (bar / vinyl / library / candles)
  
  Return JSON ONLY:
  {
    "cafe": "...",
    "dinner": "...",
    "relax": "..."
  }
  
  Places:
  ${JSON.stringify(candidates)}
  `;
  
      try {
        const res = await fetch(proxy, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt })
        });
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        const match = text?.match(/\{[\s\S]*\}/);
        return match ? JSON.parse(match[0]) : null;
      } catch {
        return null;
      }
    }
  
    /* ---------------- Main ---------------- */
    async function refreshPlan() {
      setText("statusNote", "Curating today’s plan…");
  
      setState("cafeState", "cafeList", { loading: true });
      setState("dinnerState", "dinnerList", { loading: true });
      setState("relaxState", "relaxList", { loading: true });
  
      const { lat, lng } = await getUserLocation();
  
      let places =
        (await fetchPlaces("cafes restaurants bars", lat, lng)) ||
        demoPlaces(lat, lng);
  
      const curated = await geminiCurate(lat, lng, places);
  
      if (!curated) {
        setText("keyNote", "Gemini unavailable — using fallback.");
        setState("cafeState", "cafeList", { items: [places[0]] });
        setState("dinnerState", "dinnerList", { items: [places[1]] });
        setState("relaxState", "relaxList", { items: [places[2]] });
        return;
      }
  
      setText("keyNote", "Gemini curated ✓");
  
      setState("cafeState", "cafeList", {
        items: places.filter(p => p.name === curated.cafe)
      });
      setState("dinnerState", "dinnerList", {
        items: places.filter(p => p.name === curated.dinner)
      });
      setState("relaxState", "relaxList", {
        items: places.filter(p => p.name === curated.relax)
      });
  
      setText("statusNote", "Today’s plan ready.");
    }
  
    window.addEventListener("DOMContentLoaded", refreshPlan);
  })();
  