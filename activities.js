/* activities.js — Rainy Day Activities using Google Maps Places API and Gemini */
// Note: do NOT hard-code API keys in source files. Set keys on the page as:
// <script>window.GOOGLE_MAPS_API_KEY = 'YOUR_KEY'; window.GEMINI_API_KEY = 'YOUR_KEY';</script>
let activitiesMarkers = [];
let currentUserLocation = null;

// Calculate distance between two coordinates using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in km
}

// Format distance for display
function formatDistance(distance) {
  if (distance < 1) {
    return `${Math.round(distance * 1000)}m`;
  }
  return `${distance.toFixed(1)}km`;
}

// Update distance display
function updateDistanceDisplay(distance) {
  const distanceDisplay = document.getElementById('distance-display');
  if (distanceDisplay) {
    distanceDisplay.textContent = formatDistance(distance);
  }
}

// Default search radius in meters (5km)
const DEFAULT_SEARCH_RADIUS = 5000; // 5km

// Number of activities to auto-open popups for (staggered on load)
// Increase this to open more popups automatically (e.g., 5 or 6)
const AUTO_OPEN_POPUPS = 6;

// Lightweight loader to prefer the Maps JS PlacesService (avoids REST CORS issues)
let _activitiesPlacesService = null;
let _activitiesPlacesLoader = null;

function ensureActivitiesPlacesService(timeout = 8000) {
  if (_activitiesPlacesService) return Promise.resolve(_activitiesPlacesService);
  if (_activitiesPlacesLoader) return _activitiesPlacesLoader;

  _activitiesPlacesLoader = new Promise((resolve) => {
    const apiKey = window.GOOGLE_MAPS_API_KEY;

    // If already available
    if (window.google && google.maps && google.maps.places) {
      try {
        const root = document.getElementById('places-service-root') || document.createElement('div');
        root.id = 'places-service-root';
        root.style.display = 'none';
        document.body.appendChild(root);
        _activitiesPlacesService = new google.maps.places.PlacesService(root);
        resolve(_activitiesPlacesService);
        return;
      } catch (e) {
        console.warn('[activities] Existing google.places service create failed', e);
      }
    }

    if (!apiKey || !apiKey.trim() || apiKey === 'AIzaSyDummyKey') {
      resolve(null);
      return;
    }

    const cbName = '__activities_places_loaded';
    window[cbName] = () => {
      try {
        const root = document.getElementById('places-service-root') || document.createElement('div');
        root.id = 'places-service-root';
        root.style.display = 'none';
        document.body.appendChild(root);
        _activitiesPlacesService = new google.maps.places.PlacesService(root);
        resolve(_activitiesPlacesService);
      } catch (e) {
        console.warn('[activities] PlacesService creation after load failed', e);
        resolve(null);
      } finally {
        try { delete window[cbName]; } catch (e) {}
      }
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=${cbName}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      console.warn('[activities] Loading Google Maps JS failed');
      resolve(null);
    };
    document.head.appendChild(script);

    setTimeout(() => { if (!_activitiesPlacesService) resolve(null); }, timeout);
  });

  return _activitiesPlacesLoader;
}

// Find nearby places using Google Maps Places API
async function findNearbyPlaces(lat, lng, radius = DEFAULT_SEARCH_RADIUS) {
  // Try JS API first
  const svc = await ensureActivitiesPlacesService();
  const statusEl = document.getElementById('statusNote');
  if (svc) {
    if (statusEl) statusEl.textContent = 'Using Google Places JS for live activity results.';

    try {
      const queries = [
        'museums near me',
        'libraries near me',
        'indoor activities near me',
        'cafes near me',
        'movie theaters near me',
        'shopping malls near me'
      ];

      const allResults = [];
      for (const q of queries.slice(0, 4)) {
        const req = { query: q, location: new google.maps.LatLng(lat, lng), radius };
        const results = await new Promise((resolve) => {
          svc.textSearch(req, (res, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && res) resolve(res);
            else resolve([]);
          });
        });
        allResults.push(...results);
      }

      if (allResults.length === 0) {
        console.warn('[activities] JS Places returned no results, falling back to demo');
        return getDemoActivities(lat, lng);
      }

      // normalize results to expected shape
      const mapped = allResults.map(r => ({
        ...r,
        geometry: r.geometry && r.geometry.location ? { location: { lat: r.geometry.location.lat(), lng: r.geometry.location.lng() } } : r.geometry
      }));

      // take unique top 10
      const unique = [];
      const seen = new Set();
      for (const p of mapped) {
        if (!seen.has(p.place_id)) { seen.add(p.place_id); unique.push(p); }
      }

      // enrich details via JS API getDetails when possible (fetches real Google Maps reviews)
      const picks = unique.slice(0, 10);
      const enriched = await Promise.all(picks.map(async p => {
        try {
          return await new Promise((resolve) => {
            svc.getDetails({ 
              placeId: p.place_id, 
              fields: [
                'name',
                'rating',
                'user_ratings_total',
                'reviews',
                'formatted_address',
                'geometry',
                'place_id',
                'vicinity',
                'types',
                'opening_hours',
                'price_level',
                'photos'
              ] 
            }, (res, status) => {
              if (status === google.maps.places.PlacesServiceStatus.OK && res) {
                // Merge with original, preserving real reviews
                const merged = { ...p, ...res };
                if (res.reviews && Array.isArray(res.reviews)) {
                  merged.reviews = res.reviews; // Real Google Maps reviews
                }
                resolve(merged);
              } else resolve(p);
            });
          });
        } catch (e) {
          return p;
        }
      }));

      return enriched;
    } catch (e) {
      console.warn('[activities] JS Places path failed, falling back to REST/demo', e);
      // continue to REST path below
    }
  } else {
    if (statusEl) statusEl.textContent = 'Google Maps key detected; using REST Places (may be blocked by browser CORS).';
  }

  // REST fallback (existing behavior)
  const apiKey = window.GOOGLE_MAPS_API_KEY;
  if (!apiKey || apiKey === 'AIzaSyDummyKey' || !apiKey.trim()) {
    console.warn('[activities] No Google Maps API key provided, using demo activities');
    if (statusEl) statusEl.textContent = 'No Google Maps key: showing demo activities.';
    return getDemoActivities(lat, lng);
  }

  try {
    const allPlaces = [];
    
    // Use Places API Text Search as it's more accessible
    const searchQueries = [
      'museums near me',
      'libraries near me',
      'indoor activities near me',
      'cafes near me',
      'movie theaters near me',
      'shopping malls near me'
    ];

    for (const query of searchQueries.slice(0, 3)) { // Limit to avoid too many requests
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&location=${lat},${lng}&radius=${radius}&key=${apiKey}`;
      
      try {
        const response = await fetch(url);
        if (!response.ok) {
          const errorText = await response.text();
          console.warn(`[activities] Places API request failed: ${response.status}`, errorText);
          // If it's a CORS or API error, fall back to demo
          if (response.status === 403 || response.status === 0) {
            console.warn('[activities] CORS or API key issue detected, using demo activities');
            return getDemoActivities(lat, lng);
          }
          continue;
        }
        
        const data = await response.json();
        if (data.status === 'OK' && data.results && data.results.length > 0) {
          allPlaces.push(...data.results);
        } else if (data.status === 'REQUEST_DENIED' || data.status === 'INVALID_REQUEST') {
          console.warn('[activities] Places API request denied, using demo activities');
          return getDemoActivities(lat, lng);
        }
      } catch (err) {
        console.warn(`[activities] Error fetching places for query "${query}":`, err);
        // If it's a CORS error, fall back to demo
        if (err.message && err.message.includes('CORS')) {
          console.warn('[activities] CORS error detected, using demo activities');
          return getDemoActivities(lat, lng);
        }
      }
    }
    
    // If no places found and we have an API key, return demo as fallback
    if (allPlaces.length === 0) {
      console.warn('[activities] No places found, using demo activities');
      return getDemoActivities(lat, lng);
    }

    // Remove duplicates and limit results
    const uniquePlaces = [];
    const seenIds = new Set();
    
    for (const place of allPlaces) {
      if (!seenIds.has(place.place_id)) {
        seenIds.add(place.place_id);
        uniquePlaces.push(place);
      }
    }

    const places = uniquePlaces.slice(0, 10); // Return top 10 places
    
    // Fetch place details with real Google Maps reviews for each place (with error handling)
    // Store original places to use as fallback
    const placesWithReviews = await Promise.allSettled(
      places.map(async (place, index) => {
        const originalPlace = place; // Store reference
        // Skip demo places - they don't have real reviews
        if (!place.place_id || place.place_id.startsWith('demo_')) {
          return originalPlace;
        }
        try {
          const details = await getPlaceDetails(place.place_id);
          if (details) {
            // Merge details, preserving real Google Maps reviews
            const merged = { ...place, ...details };
            if (details.reviews && Array.isArray(details.reviews)) {
              merged.reviews = details.reviews; // Real Google Maps reviews
            }
            if (details.user_ratings_total) {
              merged.user_ratings_total = details.user_ratings_total;
            }
            return merged;
          }
        } catch (err) {
          console.warn(`[activities] Error fetching details for ${place.name}:`, err);
        }
        return originalPlace; // Return original if details fetch fails
      })
    ).then(results => {
      return results.map((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          return result.value;
        } else {
          // If promise was rejected, use original place
          console.warn(`[activities] Promise rejected for place ${index}, using original:`, result.reason);
          return places[index]; // Fall back to original place
        }
      }).filter(place => place && place.name); // Filter out null/undefined results
    });
    
    return placesWithReviews;
  } catch (err) {
    console.error('[activities] Error finding nearby places:', err);
    return getDemoActivities(lat, lng);
  }
}

// Fetch place details including reviews (prefer JS API)
// This function fetches real Google Maps reviews
async function getPlaceDetails(placeId) {
  if (!placeId) return null;

  const svc = await ensureActivitiesPlacesService();
  if (svc) {
    return new Promise((resolve) => {
      // Request comprehensive fields including reviews for real Google Maps data
      svc.getDetails({ 
        placeId, 
        fields: [
          'name',
          'rating',
          'user_ratings_total',
          'reviews',
          'formatted_address',
          'geometry',
          'place_id',
          'vicinity',
          'types',
          'opening_hours',
          'price_level',
          'photos'
        ] 
      }, (res, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && res) {
          // Log when we get real reviews
          if (res.reviews && Array.isArray(res.reviews)) {
            console.log(`[activities] Fetched ${res.reviews.length} real reviews for ${res.name}`);
          }
          resolve(res);
        } else {
          console.warn('[activities] getDetails JS API failed', status);
          resolve(null);
        }
      });
    });
  }

  // Fallback to REST
  const apiKey = window.GOOGLE_MAPS_API_KEY;
  if (!apiKey || apiKey === 'AIzaSyDummyKey' || !apiKey.trim()) return null;

  try {
    // Request reviews field for real Google Maps reviews
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,rating,user_ratings_total,reviews,formatted_address,geometry,place_id,vicinity,types,opening_hours,price_level,photos&key=${apiKey}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.warn('[activities] getPlaceDetails REST response not ok:', response.status);
      return null;
    }
    const data = await response.json();
    if (data.status === 'OK' && data.result) {
      // Log when we get real reviews
      if (data.result.reviews && Array.isArray(data.result.reviews)) {
        console.log(`[activities] Fetched ${data.result.reviews.length} real reviews for ${data.result.name} via REST`);
      }
      return data.result;
    }
    console.warn('[activities] getPlaceDetails REST status not OK:', data.status);
    return null;
  } catch (e) {
    console.warn('[activities] getPlaceDetails REST error', e);
    return null;
  }
}

// Get activity suggestions from Gemini
async function getGeminiSuggestions(lat, lng, places) {
  const apiKey = window.GEMINI_API_KEY;
  
  if (!apiKey) {
    console.warn('[activities] No Gemini API key provided, using default suggestions');
    return null;
  }

  try {
    const placesList = places.slice(0, 5).map(p => ({
      name: p.name,
      type: p.types?.[0] || 'place',
      rating: p.rating || 'N/A'
    }));

    const prompt = `Based on these nearby places: ${JSON.stringify(placesList)}, suggest 3-5 rainy day activities. 
    Provide a brief, friendly description for each activity (1-2 sentences). 
    Format as JSON array with objects containing: {name, description, category}. 
    Focus on indoor activities suitable for rainy weather.`;

    // Using Gemini API (you may need to adjust the endpoint based on your API version)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      })
    });

    if (!response.ok) {
      console.warn('[activities] Gemini API request failed:', response.status);
      return null;
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (text) {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    }
    
    return null;
  } catch (err) {
    console.error('[activities] Error getting Gemini suggestions:', err);
    return null;
  }
}

// Demo activities for when API keys are not available
function getDemoActivities(lat, lng) {
  return [
    {
      name: 'Local Museum',
      place_id: 'demo1',
      geometry: { location: { lat: lat + 0.01, lng: lng + 0.01 } },
      rating: 4.5,
      user_ratings_total: 127,
      types: ['museum', 'point_of_interest'],
      formatted_address: 'Nearby museum',
      reviews: [
        {
          author_name: 'Sarah M.',
          rating: 5,
          text: 'Great place to spend a rainy afternoon! The exhibits are fascinating and the staff is very knowledgeable.',
          relative_time_description: '2 weeks ago'
        },
        {
          author_name: 'John D.',
          rating: 4,
          text: 'Perfect indoor activity for bad weather. Clean, well-maintained, and educational.',
          relative_time_description: '1 month ago'
        }
      ]
    },
    {
      name: 'Public Library',
      place_id: 'demo2',
      geometry: { location: { lat: lat + 0.015, lng: lng - 0.01 } },
      rating: 4.7,
      user_ratings_total: 89,
      types: ['library', 'point_of_interest'],
      formatted_address: 'Nearby library',
      reviews: [
        {
          author_name: 'Emma L.',
          rating: 5,
          text: 'Cozy and quiet place to read or work. Great selection of books and comfortable seating areas.',
          relative_time_description: '1 week ago'
        },
        {
          author_name: 'Mike R.',
          rating: 4,
          text: 'Excellent resource for rainy days. Free WiFi and plenty of space to study or relax.',
          relative_time_description: '3 weeks ago'
        }
      ]
    },
    {
      name: 'Coffee Shop',
      place_id: 'demo3',
      geometry: { location: { lat: lat - 0.01, lng: lng + 0.015 } },
      rating: 4.3,
      user_ratings_total: 203,
      types: ['cafe', 'point_of_interest'],
      formatted_address: 'Nearby cafe',
      reviews: [
        {
          author_name: 'Lisa K.',
          rating: 5,
          text: 'Perfect spot to wait out the rain! Delicious coffee and pastries, friendly atmosphere.',
          relative_time_description: '5 days ago'
        },
        {
          author_name: 'Tom W.',
          rating: 4,
          text: 'Great place to work or meet friends. Good coffee and comfortable seating.',
          relative_time_description: '2 weeks ago'
        }
      ]
    }
  ];
}

// Create enhanced popup content for map markers
function createPopupContent(place, distance, suggestion = null) {
  const type = place.types?.[0]?.replace(/_/g, ' ') || 'Place';
  const address = place.formatted_address || place.vicinity || '';
  const reviews = place.reviews || [];
  const totalRatings = place.user_ratings_total || (reviews.length > 0 ? reviews.length : 0);
  
  // Get top 2 reviews
  const topReviews = reviews.slice(0, 2);
  
  return `
    <div class="map-popup-content">
      <div class="popup-header">
        <h3 class="popup-title">${place.name}</h3>
        <span class="popup-distance">${formatDistance(distance)}</span>
      </div>
      <div class="popup-body">
        <div class="popup-info">
          <span class="popup-type">📍 ${type}</span>
          ${place.rating ? `<span class="popup-rating">⭐ ${place.rating}/5${totalRatings ? ` (${totalRatings})` : ''}</span>` : ''}
        </div>
        ${address ? `<p class="popup-address">${address}</p>` : ''}
        ${suggestion ? `<p class="popup-suggestion">💡 ${suggestion.description}</p>` : ''}
        ${suggestion && suggestion.category ? `<span class="popup-category">${suggestion.category}</span>` : ''}
        ${topReviews.length > 0 ? `
          <div class="popup-reviews">
            <strong class="reviews-title">Recent Reviews:</strong>
            ${topReviews.map(review => `
              <div class="review-item">
                <div class="review-header">
                  <span class="review-author">${review.author_name || 'Anonymous'}</span>
                  <span class="review-rating">⭐ ${review.rating}/5</span>
                </div>
                <p class="review-text">${review.text || ''}</p>
                ${review.relative_time_description ? `<span class="review-time">${review.relative_time_description}</span>` : ''}
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

// Display activities on the map and in the list
function displayActivities(places, userLat, userLng, suggestions = null) {
  // Check if map is initialized
  if (!window.map) {
    console.warn('[activities] Map not initialized, waiting...');
    // Try to wait a bit and retry
    setTimeout(() => {
      if (window.map) {
        displayActivities(places, userLat, userLng, suggestions);
      } else {
        throw new Error('Map not initialized. Please wait for the map to load.');
      }
    }, 1000);
    return;
  }
  
  // Validate input
  if (!places || !Array.isArray(places) || places.length === 0) {
    console.warn('[activities] No places to display');
    const activitiesList = document.getElementById('activities-list');
    if (activitiesList) {
      activitiesList.innerHTML = '<p class="error">No activities found in your area. Try a different location.</p>';
    }
    return;
  }
  
  // Clear existing markers
  activitiesMarkers.forEach(marker => {
    if (window.map && window.map.hasLayer(marker)) {
      window.map.removeLayer(marker);
    }
  });
  activitiesMarkers = [];

  const activitiesList = document.getElementById('activities-list');
  activitiesList.innerHTML = '';

  // Filter out places with invalid coordinates (prevent Leaflet errors)
  let filteredPlaces = places.filter(place => {
    const lat = Number(place?.geometry?.location?.lat);
    // Some APIs use 'lng' or 'lon'
    const lng = Number(place?.geometry?.location?.lng ?? place?.geometry?.location?.lon);
    if (!isFinite(lat) || !isFinite(lng)) {
      console.warn('[activities] Skipping place with invalid coordinates:', place.name || place.place_id, place.geometry);
      return false;
    }
    return true;
  });

  if (filteredPlaces.length === 0) {
    console.warn('[activities] No valid place coordinates found; using demo activities');
    filteredPlaces = getDemoActivities(userLat, userLng);
  }

  // Sort places by distance
  const placesWithDistance = filteredPlaces.map(place => {
    const placeLat = Number(place.geometry.location.lat);
    const placeLng = Number(place.geometry.location.lng ?? place.geometry.location.lon);
    const distance = calculateDistance(userLat, userLng, placeLat, placeLng);
    return { ...place, distance };
  }).sort((a, b) => a.distance - b.distance);

  // Update distance display with nearest activity (always show the closest)
  if (placesWithDistance.length > 0) {
    const nearestDistance = placesWithDistance[0].distance;
    updateDistanceDisplay(nearestDistance);
    
    // Update distance meter to show it's the nearest activity
    const distanceDisplay = document.getElementById('distance-display');
    if (distanceDisplay) {
      distanceDisplay.setAttribute('title', `Nearest activity: ${formatDistance(nearestDistance)} away`);
      distanceDisplay.style.color = 'var(--accent)';
    }
  } else {
    const distanceDisplay = document.getElementById('distance-display');
    if (distanceDisplay) {
      distanceDisplay.textContent = 'No activities';
      distanceDisplay.style.color = 'var(--muted)';
    }
  }

  // Create markers and list items
  placesWithDistance.forEach((place, index) => {
    const placeLat = place.geometry.location.lat;
    const placeLng = place.geometry.location.lng;

    // Add marker to map with enhanced popup
    if (window.map) {
      const marker = L.marker([placeLat, placeLng], {
        icon: L.divIcon({
          className: 'activity-marker',
          html: `<div style="background: #0077cc; color: white; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${index + 1}</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15]
        })
      }).addTo(window.map);
      
      // Create enhanced popup content
      const popupContent = createPopupContent(place, place.distance, suggestions ? suggestions[index] : null);
      
      marker.bindPopup(popupContent, {
        maxWidth: 300,
        className: 'activity-popup'
      });
      
      // Auto-open popup for the first few activities (configurable)
      if (index < AUTO_OPEN_POPUPS) {
        setTimeout(() => {
          marker.openPopup();
        }, index * 500); // Stagger the popups
      }
      
      activitiesMarkers.push(marker);
    }

    // Create list item
    const reviews = place.reviews || [];
    const topReview = reviews[0];
    const totalRatings = place.user_ratings_total || (reviews.length > 0 ? reviews.length : 0);
    
    const item = document.createElement('div');
    item.className = 'activity-item';
    item.innerHTML = `
      <div class="activity-header">
        <h3>${place.name}</h3>
        <span class="activity-distance">${formatDistance(place.distance)}</span>
      </div>
      <p class="activity-type">📍 ${place.types?.[0]?.replace(/_/g, ' ') || 'Place'}</p>
      ${place.rating ? `<p class="activity-rating">⭐ ${place.rating}/5${totalRatings ? ` (${totalRatings} reviews)` : ''}</p>` : ''}
      ${suggestions && suggestions[index] ? `<p class="activity-suggestion">💡 ${suggestions[index].description}</p>` : ''}
      ${topReview ? `
        <div class="activity-review">
          <div class="review-header-small">
            <span class="review-author-small">${topReview.author_name || 'Anonymous'}</span>
            <span class="review-rating-small">⭐ ${topReview.rating}/5</span>
          </div>
          <p class="review-text-small">${(topReview.text || '').substring(0, 100)}${topReview.text && topReview.text.length > 100 ? '...' : ''}</p>
        </div>
      ` : ''}
    `;
    
    item.addEventListener('click', () => {
      if (window.map) {
        window.map.setView([placeLat, placeLng], 15);
        activitiesMarkers[index].openPopup();
      }
    });

    activitiesList.appendChild(item);
  });

  // Update status note
  const status = document.getElementById('statusNote');
  if (status) status.textContent = `Found ${placesWithDistance.length} activities nearby`;
}

// Main function to find and display activities
async function findActivities() {
  const loadingEl = document.getElementById('activities-loading');
  const activitiesApp = document.getElementById('activities-app');
  const findBtn = document.getElementById('findActivitiesBtn');

  // Debugging: log current pointers
  console.debug('[activities] findActivities invoked. currentUserLocation:', currentUserLocation, 'window.lastCoords:', window.lastCoords);

  // Get current location from map or stored location
  if (window.lastCoords && (!currentUserLocation || !currentUserLocation.lat)) {
    currentUserLocation = window.lastCoords;
    console.debug('[activities] currentUserLocation set from window.lastCoords', currentUserLocation);
  }
  
  if (!currentUserLocation) {
    const msg = 'Please set your location first using "Use my location" or search for a city.';
    console.info('[activities] ' + msg);
    alert(msg);
    return;
  }

  activitiesApp.style.display = 'block';
  loadingEl.style.display = 'block';
  findBtn.disabled = true;
  findBtn.textContent = `Searching within ${DEFAULT_SEARCH_RADIUS / 1000}km...`;

  // Update UI status
  const status = document.getElementById('statusNote');
  if (status) status.textContent = 'Finding activities near you...';

  try {
    const { lat, lng } = currentUserLocation;
    
    // Find nearby places (default 5km radius)
    let places = await findNearbyPlaces(lat, lng, DEFAULT_SEARCH_RADIUS);
    
    // Ensure we have places to display (fallback to demo if empty)
    if (!places || !Array.isArray(places) || places.length === 0) {
      console.warn('[activities] No places returned, using demo activities');
      places = getDemoActivities(lat, lng);
    }
    
    // Get Gemini suggestions (non-blocking - don't fail if this errors)
    let suggestions = null;
    if (window.GEMINI_API_KEY) {
      try {
        suggestions = await getGeminiSuggestions(lat, lng, places);
      } catch (geminiErr) {
        console.warn('[activities] Gemini suggestions failed, continuing without:', geminiErr);
        suggestions = null;
      }
    }
    
    // Display activities
    displayActivities(places, lat, lng, suggestions);
    
    // Show summary notification
    showActivitySummary(places.length);
    
  } catch (err) {
    console.error('[activities] Error finding activities:', err);
    console.error('[activities] Error stack:', err.stack);
    console.error('[activities] Current location:', currentUserLocation);
    console.error('[activities] Map initialized:', !!window.map);
    
    const activitiesList = document.getElementById('activities-list');
    let errorMessage = 'Error finding activities. ';
    
    // Provide more specific error messages
    if (err.message) {
      if (err.message.includes('map') || err.message.includes('Map')) {
        errorMessage += 'Map not initialized. Please wait a moment and try again.';
      } else if (err.message.includes('CORS') || err.message.includes('fetch') || err.message.includes('network')) {
        errorMessage += 'Network error. Check your internet connection. Using demo activities instead.';
        // Try to show demo activities
        try {
          if (currentUserLocation) {
            const { lat, lng } = currentUserLocation;
            const demoPlaces = getDemoActivities(lat, lng);
            displayActivities(demoPlaces, lat, lng, null);
            return; // Exit early if demo works
          }
        } catch (fallbackErr) {
          console.error('[activities] Fallback also failed:', fallbackErr);
        }
      } else {
        errorMessage += err.message;
      }
    } else {
      errorMessage += 'Please check the browser console (F12) for details.';
    }
    
    activitiesList.innerHTML = `<p class="error">${errorMessage}</p>`;
    
    // Try to show demo activities as last resort
    try {
      if (currentUserLocation && !errorMessage.includes('demo activities')) {
        const { lat, lng } = currentUserLocation;
        const demoPlaces = getDemoActivities(lat, lng);
        displayActivities(demoPlaces, lat, lng, null);
      }
    } catch (fallbackErr) {
      console.error('[activities] Final fallback failed:', fallbackErr);
    }
  } finally {
    loadingEl.style.display = 'none';
    findBtn.disabled = false;
    findBtn.textContent = 'Find Activities Near Me';
  }
}

// Initialize activities functionality
function initActivities() {
  const findBtn = document.getElementById('findActivitiesBtn');
  if (findBtn) {
    findBtn.addEventListener('click', findActivities);
  }

  // Initialize current location from map if available
  if (window.lastCoords) {
    currentUserLocation = window.lastCoords;
  }

  // Show activities section when weather indicates rain
  const checkWeatherForActivities = () => {
    const descEl = document.getElementById('desc');
    if (descEl) {
      const desc = descEl.textContent.toLowerCase();
      const isRainy = desc.includes('rain') || desc.includes('drizzle') || desc.includes('storm');
      const activitiesApp = document.getElementById('activities-app');
      if (isRainy && activitiesApp) {
        // Always show the section, but highlight it when rainy
        activitiesApp.style.display = 'block';
        if (isRainy) {
          activitiesApp.style.opacity = '1';
        } else {
          activitiesApp.style.opacity = '0.8';
        }
      }
    }
  };

  // Check weather periodically
  setInterval(checkWeatherForActivities, 5000);
  checkWeatherForActivities();
  
  // Also check when weather updates
  const observer = new MutationObserver(checkWeatherForActivities);
  const descEl = document.getElementById('desc');
  if (descEl) {
    observer.observe(descEl, { childList: true, characterData: true, subtree: true });
  }
}

// Show summary notification when activities are found
function showActivitySummary(count) {
  try {
    // Remove any existing notification
    const existing = document.getElementById('activity-summary-popup');
    if (existing) {
      existing.remove();
    }

    if (!count || count === 0) {
      return; // Don't show notification if no activities
    }

    // Create notification popup
    const popup = document.createElement('div');
    popup.id = 'activity-summary-popup';
    popup.className = 'activity-summary-popup';
    popup.innerHTML = `
      <div class="summary-content">
        <span class="summary-icon">🎉</span>
        <div class="summary-text">
          <strong>Found ${count} activities!</strong>
          <p>Click on the markers on the map to see details</p>
        </div>
        <button class="summary-close" onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
    `;
    
    document.body.appendChild(popup);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (popup.parentElement) {
        popup.style.opacity = '0';
        popup.style.transform = 'translateY(-20px)';
        setTimeout(() => popup.remove(), 300);
      }
    }, 5000);
  } catch (err) {
    console.warn('[activities] Error showing summary:', err);
    // Don't throw, just log the error
  }
}

// Update user location when map location changes
function updateUserLocation(lat, lng) {
  currentUserLocation = { lat, lng };
}

// Expose function to update location
window.updateActivitiesLocation = updateUserLocation;

// Initialize on DOM load
window.addEventListener('DOMContentLoaded', () => {
  // Wait a bit for maps.js to initialize, then check again
  setTimeout(() => {
    initActivities();
    // Also check after a longer delay to ensure map is ready
    setTimeout(() => {
      if (window.lastCoords && !currentUserLocation) {
        currentUserLocation = window.lastCoords;
      }
    }, 2000);
  }, 1000);
});

