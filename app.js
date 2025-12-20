/**
 * Flight Tracker Clock - Application Logic
 * A JetClock-inspired flight tracker using OpenSky Network API
 */

// ==========================================
// Configuration & State
// ==========================================

const CONFIG = {
    OPENSKY_API: 'https://opensky-network.org/api/states/all',
    OPENSKY_TOKEN_URL: 'https://opensky-network.org/auth/token',
    OPENSKY_CLIENT_ID: 'sherro-api-client',
    OPENSKY_CLIENT_SECRET: '8KZIUIufMCVHh9CTu7NBl7Vwzlgm3Zms',
    // AeroDataBox - API.market (primary)
    AERODATABOX_APIMARKET_URL: 'https://api.aerodatabox.com/flights/callsign',
    APIMARKET_KEY: 'cmjdnefnx0009l304lun9d4re',
    // AeroDataBox - RapidAPI (fallback)
    AERODATABOX_RAPIDAPI_URL: 'https://aerodatabox.p.rapidapi.com/flights/callsign',
    RAPIDAPI_KEY: 'a71305b666mshcce90ac5542497ep1ce14ajsnbb292b7e6760',
    // Other settings
    DEFAULT_RADIUS: 25, // km
    DEFAULT_INTERVAL: 30, // seconds
    STORAGE_KEY: 'flightTrackerSettings',
    ROUTE_CACHE_KEY: 'flightTrackerRouteCache',
    ROUTE_CACHE_HOURS: 24, // Cache routes for 24 hours
    AERODATABOX_FALLBACK_KEY: 'aerodataboxFallbackActive' // Track if using fallback
};

// ICAO airline codes to carrier names
const AIRLINES = {
    // Australian carriers
    'QFA': 'Qantas',
    'QJE': 'Qantas', // QantasLink
    'JST': 'Jetstar',
    'VOZ': 'Virgin Australia',
    'REX': 'Rex Airlines',
    'ANZ': 'Air New Zealand',
    'SIA': 'Singapore Airlines',
    'CPA': 'Cathay Pacific',
    'UAE': 'Emirates',
    'ETD': 'Etihad',
    'QTR': 'Qatar Airways',
    'MAS': 'Malaysia Airlines',
    'SQ': 'Singapore Airlines',
    'CX': 'Cathay Pacific',
    'TGW': 'Scoot',
    'AXM': 'AirAsia',
    'CEB': 'Cebu Pacific',
    'PAL': 'Philippine Airlines',
    'GAR': 'Garuda Indonesia',
    'THA': 'Thai Airways',
    'JAL': 'Japan Airlines',
    'ANA': 'All Nippon Airways',
    'KAL': 'Korean Air',
    'CAL': 'China Airlines',
    'EVA': 'EVA Air',
    'CCA': 'Air China',
    'CES': 'China Eastern',
    'CSN': 'China Southern',
    'HVN': 'Vietnam Airlines',
    'AAL': 'American Airlines',
    'UAL': 'United Airlines',
    'DAL': 'Delta Air Lines',
    'BAW': 'British Airways',
    'DLH': 'Lufthansa',
    'AFR': 'Air France',
    'KLM': 'KLM',
    'FJI': 'Fiji Airways',
    'NZM': 'Mount Cook Airline'
};

const state = {
    location: null,
    settings: {
        radius: CONFIG.DEFAULT_RADIUS,
        interval: CONFIG.DEFAULT_INTERVAL,
        useManualLocation: false,
        manualLat: null,
        manualLon: null,
        enableRouteApi: true
    },
    flights: [],
    currentFlightIndex: 0,
    fetchInterval: null,
    rotateInterval: null,
    isFetching: false,
    lastFetchTime: 0,
    accessToken: null,
    tokenExpiry: 0,
    // E-Ink specific state
    weather: null,
    iss: null,
    lastMinute: null, // For partial clock updates
    partialUpdateCount: 0 // Counter for global refresh (anti-ghosting)
};

// ==========================================
// E-Ink Mode Detection (for E-Ink displays)
// ==========================================

// Detect E-Ink mode based on URL, CSS class, or viewport size (800x480 or 400x300)
const isEinkMode = (function () {
    const path = window.location.pathname;
    const hasEinkClass = document.body.classList.contains('eink-mode') ||
        document.body.classList.contains('low-power');

    // Check for E-Ink resolutions: 800x480 (4.26") or 400x300 (4.2")
    const isEinkResolution = (window.innerWidth === 800 && window.innerHeight === 480) ||
        (window.innerWidth <= 400 && window.innerHeight <= 300);

    return path === '/' || path.endsWith('index.html') || hasEinkClass || isEinkResolution;
})();

// Alias for backward compatibility
const isLowPowerMode = isEinkMode;

// E-Ink configuration
const EINK_CONFIG = {
    GLOBAL_REFRESH_INTERVAL: 10, // Full refresh every N partial updates (anti-ghosting)
    CLOCK_UPDATE_INTERVAL_MS: 60000, // Update clock every minute in E-Ink mode
    WEATHER_UPDATE_INTERVAL_MS: 10 * 60 * 1000, // 10 minutes
    ISS_UPDATE_INTERVAL_MS: 30 * 1000 // 30 seconds
};

// Apply E-Ink mode immediately
if (isEinkMode) {
    document.body.classList.add('low-power', 'eink-mode');
    console.log('E-Ink Mode: ENABLED (800x480 or 400x300 optimized)');
    console.log(`Global refresh will trigger every ${EINK_CONFIG.GLOBAL_REFRESH_INTERVAL} clock updates`);
}

// ==========================================
// DOM Elements
// ==========================================

const elements = {
    // Clock
    time: document.getElementById('time'),
    date: document.getElementById('date'),

    // Unified display
    topInfo: document.getElementById('top-info'),
    callsign: document.getElementById('callsign'),
    carrier: document.getElementById('carrier'),
    route: document.getElementById('route'),
    bottomStats: document.getElementById('bottom-stats'),
    statAltitude: document.getElementById('stat-altitude'),
    statSpeed: document.getElementById('stat-speed'),
    statHeading: document.getElementById('stat-heading'),
    statDistance: document.getElementById('stat-distance'),
    noFlights: document.getElementById('no-flights'),
    airlineLogo: document.getElementById('airline-logo'), // New logo element

    // Status
    statusIcon: document.getElementById('status-icon'),
    statusText: document.getElementById('status-text'),

    // E-Ink Weather & ISS Header (only present in index.html)
    weatherHeader: document.getElementById('weather-header'),
    weatherTemp: document.getElementById('weather-temp'),
    weatherIcon: document.getElementById('weather-icon'),
    weatherWind: document.getElementById('weather-wind'),
    issStatus: document.getElementById('iss-status'),

    // Settings (only present in webview.html)
    settingsBtn: document.getElementById('settings-btn'),
    settingsModal: document.getElementById('settings-modal'),
    settingsClose: document.getElementById('settings-close'),
    currentLocation: document.getElementById('current-location'),
    refreshLocation: document.getElementById('refresh-location'),
    useManualLocation: document.getElementById('use-manual-location'),
    manualCoords: document.getElementById('manual-coords'),
    manualLat: document.getElementById('manual-lat'),
    manualLon: document.getElementById('manual-lon'),
    saveManualCoords: document.getElementById('save-manual-coords'),
    radiusInput: document.getElementById('radius-input'),
    enableRouteApi: document.getElementById('enable-route-api')
};

// ==========================================
// Clock Functions
// ==========================================

function updateClock() {
    const now = new Date();

    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    // E-Ink Mode: Only update when minutes change (partial update)
    if (isEinkMode) {
        const currentMinute = `${hours}:${minutes}`;
        if (currentMinute === state.lastMinute) {
            return; // Skip update - nothing changed
        }
        state.lastMinute = currentMinute;

        // Update clock display (no seconds on E-Ink)
        elements.time.textContent = currentMinute;

        // Increment partial update counter
        state.partialUpdateCount++;

        // Global Refresh: Reload page every N updates to clear ghosting
        if (state.partialUpdateCount >= EINK_CONFIG.GLOBAL_REFRESH_INTERVAL) {
            console.log(`Global refresh triggered after ${state.partialUpdateCount} partial updates`);
            state.partialUpdateCount = 0;
            // Full page reload to clear E-Ink ghosting artifacts
            window.location.reload();
            return;
        }

        console.log(`Partial update ${state.partialUpdateCount}/${EINK_CONFIG.GLOBAL_REFRESH_INTERVAL}`);
    } else {
        // Full mode: Show seconds
        const seconds = String(now.getSeconds()).padStart(2, '0');
        elements.time.textContent = `${hours}:${minutes}:${seconds}`;
    }

    // Format date
    const options = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
    elements.date.textContent = now.toLocaleDateString('en-AU', options);
}

// ==========================================
// Weather & ISS Functions (E-Ink Mode)
// ==========================================

async function fetchAndDisplayWeather() {
    // Only fetch if we have the weather header elements (E-Ink mode)
    if (!elements.weatherTemp) return;

    try {
        const response = await fetch('/api/weather');
        if (!response.ok) throw new Error('Weather API error');

        const data = await response.json();
        state.weather = data;

        // Update display
        if (elements.weatherTemp) {
            elements.weatherTemp.textContent = `${data.temp}°C`;
        }
        if (elements.weatherIcon) {
            elements.weatherIcon.textContent = data.icon || '○';
        }
        if (elements.weatherWind) {
            elements.weatherWind.textContent = `${data.windSpeed}km/h`;
        }

        console.log('Weather updated:', data.temp + '°C', data.condition);

    } catch (error) {
        console.error('Weather fetch error:', error);
        if (elements.weatherTemp) {
            elements.weatherTemp.textContent = '--°C';
        }
    }
}

async function fetchAndDisplayISS() {
    // Only fetch if we have the ISS header element (E-Ink mode)
    if (!elements.issStatus) return;

    try {
        const response = await fetch('/api/iss');
        if (!response.ok) throw new Error('ISS API error');

        const data = await response.json();
        state.iss = data;

        // Update display
        if (elements.issStatus) {
            if (data.visible) {
                elements.issStatus.textContent = 'ISS: OVERHEAD ✦';
                elements.issStatus.classList.add('iss-visible');
            } else {
                elements.issStatus.textContent = `ISS: ${data.distance}km`;
                elements.issStatus.classList.remove('iss-visible');
            }
        }

        if (data.visible) {
            console.log('✦ ISS is overhead! Distance:', data.distance + 'km');
        }

    } catch (error) {
        console.error('ISS fetch error:', error);
        if (elements.issStatus) {
            elements.issStatus.textContent = 'ISS: --';
        }
    }
}

// Start weather and ISS updates for E-Ink mode
function startEinkUpdates() {
    if (!isLowPowerMode) return;

    // Initial fetch
    fetchAndDisplayWeather();
    fetchAndDisplayISS();

    // Weather updates every 10 minutes
    setInterval(fetchAndDisplayWeather, 10 * 60 * 1000);

    // ISS updates every 30 seconds (it moves fast!)
    setInterval(fetchAndDisplayISS, 30 * 1000);

    console.log('E-Ink updates started: Weather (10m), ISS (30s)');
}

// ==========================================
// Location Functions
// ==========================================

function getLocation() {
    return new Promise((resolve, reject) => {
        if (state.settings.useManualLocation && state.settings.manualLat && state.settings.manualLon) {
            resolve({
                latitude: state.settings.manualLat,
                longitude: state.settings.manualLon
            });
            return;
        }

        if (!navigator.geolocation) {
            reject(new Error('Geolocation not supported'));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                });
            },
            (error) => {
                reject(error);
            },
            {
                enableHighAccuracy: false,
                timeout: 10000,
                maximumAge: 300000 // 5 minutes cache
            }
        );
    });
}

async function initLocation() {
    try {
        updateStatus('Detecting location...', false);
        state.location = await getLocation();
        updateLocationDisplay();
        updateStatus('Scanning for aircraft...', true);
        await fetchFlights();
    } catch (error) {
        console.error('Location error:', error);
        updateStatus('Location access denied. Set manually in settings.', false);
        if (elements.currentLocation) {
            elements.currentLocation.textContent = 'Location unavailable';
        }
    }
}

function updateLocationDisplay() {
    if (state.location && elements.currentLocation) {
        const lat = state.location.latitude.toFixed(4);
        const lon = state.location.longitude.toFixed(4);
        elements.currentLocation.textContent = `${lat}, ${lon}`;
    }
}

// ==========================================
// OpenSky Authentication
// ==========================================
// NOTE: OAuth2 token fetch doesn't work from browser due to CORS.
// OpenSky's API allows Basic Auth, but the token endpoint blocks browser requests.
// For now, we use unauthenticated requests. Rate limits apply (400 credits/day).
// To get higher limits, you'd need to run this through a backend proxy.

// ==========================================
// Flight Data Functions
// ==========================================

// Route cache stored in localStorage with 24-hour expiry
const routeCache = {
    get(callsign) {
        try {
            const cache = JSON.parse(localStorage.getItem(CONFIG.ROUTE_CACHE_KEY) || '{}');
            const entry = cache[callsign];
            if (entry && Date.now() < entry.expiry) {
                console.log(`Route cache HIT: ${callsign}`);
                return entry.data;
            }
            return null;
        } catch (e) {
            return null;
        }
    },

    set(callsign, data) {
        try {
            const cache = JSON.parse(localStorage.getItem(CONFIG.ROUTE_CACHE_KEY) || '{}');
            cache[callsign] = {
                data,
                expiry: Date.now() + (CONFIG.ROUTE_CACHE_HOURS * 60 * 60 * 1000)
            };
            // Clean old entries while we're here
            const now = Date.now();
            for (const key in cache) {
                if (cache[key].expiry < now) delete cache[key];
            }
            localStorage.setItem(CONFIG.ROUTE_CACHE_KEY, JSON.stringify(cache));
            console.log(`Route cache SET: ${callsign}`);
        } catch (e) {
            console.error('Cache write error:', e);
        }
    }
};

// Fetch flight route from AeroDataBox (with API.market → RapidAPI fallback)
async function fetchFlightRoute(callsign) {
    // Check cache first
    const cached = routeCache.get(callsign);
    if (cached) return cached;

    // Clean callsign (remove spaces)
    const cleanCallsign = callsign.trim().replace(/\s+/g, '');
    if (!cleanCallsign || cleanCallsign === 'Unknown') return null;

    // Get today's date in required format
    const today = new Date().toISOString().split('T')[0];

    // Check if we're in fallback mode (and if it's still valid - 1 hour timeout)
    let useFallback = false;
    try {
        const fallbackData = JSON.parse(localStorage.getItem(CONFIG.AERODATABOX_FALLBACK_KEY) || '{}');
        if (fallbackData.active && Date.now() < fallbackData.expires) {
            useFallback = true;
        } else if (fallbackData.active) {
            // Fallback expired, reset to primary
            localStorage.removeItem(CONFIG.AERODATABOX_FALLBACK_KEY);
            console.log('AeroDataBox: Fallback period expired, trying primary API again');
        }
    } catch (e) { }

    // Try primary (API.market) or fallback (RapidAPI)
    const apiConfig = useFallback
        ? {
            url: `${CONFIG.AERODATABOX_RAPIDAPI_URL}/${encodeURIComponent(cleanCallsign)}/${today}`,
            headers: {
                'x-rapidapi-key': CONFIG.RAPIDAPI_KEY,
                'x-rapidapi-host': 'aerodatabox.p.rapidapi.com'
            },
            name: 'RapidAPI'
        }
        : {
            url: `${CONFIG.AERODATABOX_APIMARKET_URL}/${encodeURIComponent(cleanCallsign)}/${today}`,
            headers: {
                'x-apimarket-key': CONFIG.APIMARKET_KEY
            },
            name: 'API.market'
        };

    try {
        const response = await fetch(apiConfig.url, { headers: apiConfig.headers });

        // Handle rate limiting - switch to fallback
        if (response.status === 429 && !useFallback) {
            console.log(`AeroDataBox ${apiConfig.name}: Rate limited, switching to fallback`);
            // Set fallback mode for 1 hour
            localStorage.setItem(CONFIG.AERODATABOX_FALLBACK_KEY, JSON.stringify({
                active: true,
                expires: Date.now() + (60 * 60 * 1000) // 1 hour
            }));
            // Retry with fallback
            return fetchFlightRoute(callsign);
        }

        if (!response.ok) {
            console.log(`AeroDataBox ${apiConfig.name}: No route for ${callsign} (${response.status})`);
            // Cache null result to avoid repeated failed lookups
            routeCache.set(callsign, { notFound: true });
            return null;
        }

        const data = await response.json();

        // Extract route info from first matching flight
        if (data && data.length > 0) {
            const flight = data[0];
            const route = {
                departure: flight.departure?.airport?.iata || flight.departure?.airport?.icao || null,
                departureCity: flight.departure?.airport?.municipalityName || null,
                arrival: flight.arrival?.airport?.iata || flight.arrival?.airport?.icao || null,
                arrivalCity: flight.arrival?.airport?.municipalityName || null,
                airline: flight.airline?.name || null,
                source: apiConfig.name // Track which API was used
            };
            routeCache.set(callsign, route);
            console.log(`AeroDataBox ${apiConfig.name}: Route found for ${callsign}`);
            return route;
        }

        routeCache.set(callsign, { notFound: true });
        return null;

    } catch (error) {
        console.error(`AeroDataBox ${apiConfig.name} error for ${callsign}:`, error);

        // If primary failed, try fallback
        if (!useFallback) {
            console.log('AeroDataBox: Primary API failed, trying fallback');
            localStorage.setItem(CONFIG.AERODATABOX_FALLBACK_KEY, JSON.stringify({
                active: true,
                expires: Date.now() + (60 * 60 * 1000)
            }));
            return fetchFlightRoute(callsign);
        }

        return null;
    }
}

function getBoundingBox(lat, lon, radiusKm) {
    // Approximate degrees per km
    const latDelta = radiusKm / 111;
    const lonDelta = radiusKm / (111 * Math.cos(lat * Math.PI / 180));

    return {
        lamin: lat - latDelta,
        lamax: lat + latDelta,
        lomin: lon - lonDelta,
        lomax: lon + lonDelta
    };
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    // Haversine formula
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function headingToDirection(heading) {
    if (heading === null) return '—';
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(heading / 45) % 8;
    return `${Math.round(heading)}° ${directions[index]}`;
}

async function fetchFlights() {
    if (!state.location) {
        return;
    }

    // Prevent overlapping requests and enforce minimum 10-second gap
    const now = Date.now();
    if (state.isFetching) {
        console.log('Skipping fetch - already in progress');
        return;
    }
    if (now - state.lastFetchTime < 10000) {
        console.log('Skipping fetch - too soon since last request');
        return;
    }

    state.isFetching = true;
    state.lastFetchTime = now;

    const bbox = getBoundingBox(
        state.location.latitude,
        state.location.longitude,
        state.settings.radius
    );

    // Use proxy when running on localhost (authenticated), direct API otherwise
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const url = isLocalhost
        ? `/api/opensky?lamin=${bbox.lamin}&lomin=${bbox.lomin}&lamax=${bbox.lamax}&lomax=${bbox.lomax}`
        : `${CONFIG.OPENSKY_API}?lamin=${bbox.lamin}&lomin=${bbox.lomin}&lamax=${bbox.lamax}&lomax=${bbox.lomax}`;

    try {
        updateStatus(isLocalhost ? 'Fetching (authenticated)...' : 'Fetching aircraft data...', true);
        const response = await fetch(url);

        if (!response.ok) {
            if (response.status === 429) {
                updateStatus('OpenSky rate limited - waiting 60s...', false);
                state.isFetching = false;
                return; // Let the regular interval handle retry
            }
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.states && data.states.length > 0) {
            // Parse and filter flights
            // Minimum speed ~50 km/h (14 m/s) to exclude parked/taxiing aircraft
            // Minimum altitude 100m to exclude ground vehicles
            const MIN_SPEED_MS = 14;
            const MIN_ALTITUDE_M = 100;

            state.flights = data.states
                .map(s => ({
                    icao24: s[0],
                    callsign: (s[1] || '').trim() || 'Unknown',
                    originCountry: s[2] || 'Unknown',
                    longitude: s[5],
                    latitude: s[6],
                    altitude: s[7] || s[13], // baro or geo altitude
                    onGround: s[8],
                    velocity: s[9],
                    heading: s[10],
                    verticalRate: s[11]
                }))
                // Filter: not on ground, has position, actually moving, and above min altitude
                .filter(f =>
                    !f.onGround &&
                    f.latitude &&
                    f.longitude &&
                    f.velocity >= MIN_SPEED_MS &&
                    (f.altitude === null || f.altitude >= MIN_ALTITUDE_M)
                )
                .map(f => ({
                    ...f,
                    distance: calculateDistance(
                        state.location.latitude,
                        state.location.longitude,
                        f.latitude,
                        f.longitude
                    )
                }))
                .sort((a, b) => a.distance - b.distance);

            if (state.flights.length > 0) {
                updateStatus(`${state.flights.length} aircraft nearby`, true);
                state.currentFlightIndex = 0;
                displayCurrentFlight();
                startFlightRotation();
                triggerEinkUpdate(); // Force E-Ink refresh
            } else {
                showNoFlights();
                triggerEinkUpdate(); // Force E-Ink refresh
            }
        } else {
            state.flights = [];
            showNoFlights();
            triggerEinkUpdate(); // Force E-Ink refresh
        }

    } catch (error) {
        console.error('Fetch error:', error);
        updateStatus('Connection error', false);
    } finally {
        state.isFetching = false;
    }
}

async function displayCurrentFlight() {
    if (state.flights.length === 0) {
        showNoFlights();
        return;
    }

    const flight = state.flights[state.currentFlightIndex];

    // Extract airline code from callsign (first 3 letters)
    const airlineCode = flight.callsign.substring(0, 3).toUpperCase();
    let carrier = AIRLINES[airlineCode] || flight.originCountry;

    // Update top info (callsign + carrier)
    elements.callsign.textContent = flight.callsign;
    elements.carrier.textContent = carrier;
    elements.route.textContent = ''; // Clear while loading
    elements.topInfo.classList.remove('hidden');

    // Update Logo (E-Ink only)
    if (elements.airlineLogo) {
        elements.airlineLogo.src = `/api/logo/${airlineCode}`;
        elements.airlineLogo.style.display = 'block';
        elements.airlineLogo.classList.remove('hidden');
        // Handle load error to hide broken image
        elements.airlineLogo.onerror = () => {
            elements.airlineLogo.style.display = 'none';
        };
    }

    // Update bottom stats
    elements.statAltitude.textContent = flight.altitude
        ? `${Math.round(flight.altitude)}m`
        : '—';
    elements.statSpeed.textContent = flight.velocity
        ? `${Math.round(flight.velocity * 3.6)}`
        : '—';
    elements.statHeading.textContent = flight.heading !== null
        ? `${Math.round(flight.heading)}°`
        : '—';
    elements.statDistance.textContent = `${flight.distance.toFixed(1)}km`;
    elements.bottomStats.classList.remove('hidden');

    // Hide no flights
    elements.noFlights.classList.add('hidden');

    // Fetch route asynchronously (uses cache) - only if API is enabled
    if (state.settings.enableRouteApi !== false) {
        try {
            const routeInfo = await fetchFlightRoute(flight.callsign);
            if (routeInfo && !routeInfo.notFound && routeInfo.departure && routeInfo.arrival) {
                elements.route.textContent = `${routeInfo.departure} → ${routeInfo.arrival}`;
                // Update carrier from API if available
                if (routeInfo.airline) {
                    elements.carrier.textContent = routeInfo.airline;
                }
            }
        } catch (e) {
            // Route lookup failed, keep existing display
            console.log('Route lookup failed:', e);
        }
    }
}

function showNoFlights() {
    state.flights = [];
    elements.topInfo.classList.add('hidden');
    elements.bottomStats.classList.add('hidden');
    elements.noFlights.classList.remove('hidden');
    updateStatus('Scanning for aircraft...', true);
}

function startFlightRotation() {
    // Stop any existing rotation
    if (state.rotateInterval) {
        clearInterval(state.rotateInterval);
    }

    // Rotate through flights every 10 seconds
    if (state.flights.length > 1) {
        state.rotateInterval = setInterval(() => {
            state.currentFlightIndex = (state.currentFlightIndex + 1) % state.flights.length;
            displayCurrentFlight();
        }, 10000);
    }
}

// ==========================================
// UI Functions
// ==========================================

function updateStatus(text, active) {
    // Suppress "Scanning..." messages in E-Ink mode to keep interface clean
    if (isEinkMode && text.includes('Scanning')) {
        text = ''; // Clear text or keep previous
        if (elements.statusText.textContent.includes('Scanning')) {
            elements.statusText.textContent = '';
        }
        return;
    }

    elements.statusText.textContent = text;
    if (active) {
        elements.statusIcon.textContent = '●';
        elements.statusIcon.classList.add('active');
    } else {
        elements.statusIcon.textContent = '◯';
        elements.statusIcon.classList.remove('active');
    }
}

async function triggerEinkUpdate() {
    if (!isEinkMode) return;
    try {
        await fetch('/api/trigger-update', { method: 'POST' });
    } catch (e) {
        console.error('Trigger failed:', e);
    }
}

// ==========================================
// Settings Functions
// ==========================================

function loadSettings() {
    try {
        const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
        if (saved) {
            state.settings = { ...state.settings, ...JSON.parse(saved) };
        }
    } catch (e) {
        console.error('Error loading settings:', e);
    }

    applySettingsToUI();
}

function saveSettings() {
    try {
        localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(state.settings));
    } catch (e) {
        console.error('Error saving settings:', e);
    }
}

function applySettingsToUI() {
    // Radius
    if (elements.radiusInput) {
        elements.radiusInput.value = state.settings.radius;
    }

    // Interval
    const intervalInput = document.querySelector(`input[name="interval"][value="${state.settings.interval}"]`);
    if (intervalInput) {
        intervalInput.checked = true;
    }

    // Manual location
    if (elements.useManualLocation) {
        elements.useManualLocation.checked = state.settings.useManualLocation;
        elements.manualCoords.classList.toggle('hidden', !state.settings.useManualLocation);
        if (state.settings.manualLat) elements.manualLat.value = state.settings.manualLat;
        if (state.settings.manualLon) elements.manualLon.value = state.settings.manualLon;
    }

    // Route API toggle
    if (elements.enableRouteApi) {
        elements.enableRouteApi.checked = state.settings.enableRouteApi !== false;
    }
}

function openSettings() {
    elements.settingsModal.classList.remove('hidden');
}

function closeSettings() {
    elements.settingsModal.classList.add('hidden');
}

function startFetchInterval() {
    if (state.fetchInterval) {
        clearInterval(state.fetchInterval);
    }
    state.fetchInterval = setInterval(fetchFlights, state.settings.interval * 1000);
}

// ==========================================
// Event Listeners
// ==========================================

function initEventListeners() {
    // Skip settings-related listeners if elements don't exist (E-Ink mode)
    if (!elements.settingsBtn) {
        console.log('E-Ink mode: Settings UI not available');
        return;
    }

    // Settings button
    if (elements.settingsBtn) {
        elements.settingsBtn.addEventListener('click', openSettings);
    }
    if (elements.settingsClose) {
        elements.settingsClose.addEventListener('click', closeSettings);
    }

    // Close settings on escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && elements.settingsModal && !elements.settingsModal.classList.contains('hidden')) {
            closeSettings();
        }
    });

    // Close settings when clicking outside
    if (elements.settingsModal) {
        elements.settingsModal.addEventListener('click', (e) => {
            if (e.target === elements.settingsModal) {
                closeSettings();
            }
        });
    }

    // Radius change - with debounce for number input
    if (elements.radiusInput) {
        let radiusDebounce = null;
        elements.radiusInput.addEventListener('input', (e) => {
            clearTimeout(radiusDebounce);
            radiusDebounce = setTimeout(() => {
                const value = parseInt(e.target.value);
                if (value >= 1 && value <= 100) {
                    state.settings.radius = value;
                    saveSettings();
                    fetchFlights();
                }
            }, 500);
        });
    }

    // Interval change
    document.querySelectorAll('input[name="interval"]').forEach(input => {
        input.addEventListener('change', (e) => {
            state.settings.interval = parseInt(e.target.value);
            saveSettings();
            startFetchInterval();
        });
    });

    // Route API toggle
    if (elements.enableRouteApi) {
        elements.enableRouteApi.addEventListener('change', (e) => {
            state.settings.enableRouteApi = e.target.checked;
            saveSettings();
        });
    }

    // Display mode change
    document.querySelectorAll('input[name="display"]').forEach(input => {
        input.addEventListener('change', (e) => {
            state.settings.display = e.target.value;
            saveSettings();
            updateDisplayMode();
        });
    });

    // Refresh location
    if (elements.refreshLocation) {
        elements.refreshLocation.addEventListener('click', async () => {
            state.settings.useManualLocation = false;
            if (elements.useManualLocation) elements.useManualLocation.checked = false;
            if (elements.manualCoords) elements.manualCoords.classList.add('hidden');
            saveSettings();
            await initLocation();
        });
    }

    // Manual location toggle
    if (elements.useManualLocation) {
        elements.useManualLocation.addEventListener('change', (e) => {
            state.settings.useManualLocation = e.target.checked;
            if (elements.manualCoords) {
                elements.manualCoords.classList.toggle('hidden', !e.target.checked);
            }
            saveSettings();

            if (!e.target.checked) {
                initLocation();
            }
        });
    }

    // Save manual coordinates
    if (elements.saveManualCoords) {
        elements.saveManualCoords.addEventListener('click', () => {
            const lat = parseFloat(elements.manualLat.value);
            const lon = parseFloat(elements.manualLon.value);

            if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
                alert('Please enter valid coordinates.\nLatitude: -90 to 90\nLongitude: -180 to 180');
                return;
            }

            state.settings.manualLat = lat;
            state.settings.manualLon = lon;
            state.settings.useManualLocation = true;
            if (elements.useManualLocation) elements.useManualLocation.checked = true;
            saveSettings();

            state.location = { latitude: lat, longitude: lon };
            updateLocationDisplay();
            fetchFlights();
            closeSettings();
        });
    }
}

// ==========================================
// Initialization
// ==========================================

async function init() {
    // Start clock immediately
    updateClock();

    // Clock update interval: 1 second for full mode, 60 seconds for low-power
    const clockInterval = isLowPowerMode ? 60000 : 1000;
    setInterval(updateClock, clockInterval);

    // Load settings (only relevant for webview.html)
    loadSettings();

    // Initialize event listeners (settings only work in webview.html)
    initEventListeners();

    // Start E-Ink specific updates (weather, ISS)
    startEinkUpdates();

    // Get location and start fetching
    await initLocation();

    // Start periodic fetch
    startFetchInterval();
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
