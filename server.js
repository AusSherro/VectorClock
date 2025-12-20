/**
 * Flight Tracker Server
 * Handles OpenSky OAuth2 authentication and proxies requests
 * Enhanced for E-Ink display with Weather, ISS tracking, and Logo proxy
 */

const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const https = require('https');

// ==========================================
// Local Aircraft Database (SQLite)
// ==========================================
let aircraftDB = null;
let aircraftLookupStmt = null;

try {
    const Database = require('better-sqlite3');
    const dbPath = path.join(__dirname, 'aircraft.db');

    if (fs.existsSync(dbPath)) {
        aircraftDB = new Database(dbPath, { readonly: true });
        aircraftLookupStmt = aircraftDB.prepare('SELECT manufacturerName, model, operator, typecode FROM aircraft WHERE icao24 = ?');
        console.log('✓ Aircraft database loaded (aircraft.db)');
    } else {
        console.warn('! aircraft.db not found - run "python csv_to_db.py" to create it');
    }
} catch (e) {
    console.error('Aircraft DB init error:', e.message);
}

/**
 * Lookup aircraft by ICAO24 hex code in local database
 * @param {string} icao24 - Aircraft ICAO24 hex code (e.g., "7C4EE3")
 * @returns {object|null} - Aircraft data or null if not found
 */
function lookupAircraftLocal(icao24) {
    if (!aircraftLookupStmt || !icao24) return null;

    try {
        const hex = icao24.toUpperCase();
        const row = aircraftLookupStmt.get(hex);

        if (row && (row.manufacturerName || row.model)) {
            return {
                manufacturer: row.manufacturerName || '',
                model: row.model || '',
                operator: row.operator || '',
                typecode: row.typecode || '',
                source: 'local'
            };
        }
        return null;
    } catch (e) {
        console.error('Aircraft lookup error:', e.message);
        return null;
    }
}

const app = express();
const PORT = 3000;

// ==========================================
// Configuration
// ==========================================

// Load config.json if exists
let userConfig = {};
try {
    if (fs.existsSync(path.join(__dirname, 'config.json'))) {
        userConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
        console.log('Using configuration from config.json');
    }
} catch (e) {
    console.error('Error loading config.json:', e);
}

// OpenSky credentials
const OPENSKY_CONFIG = {
    TOKEN_URL: 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token',
    API_URL: 'https://opensky-network.org/api/states/all',
    CLIENT_ID: userConfig.clientId || 'sherro-api-client',
    CLIENT_SECRET: userConfig.clientSecret || '8KZIUIufMCVHh9CTu7NBl7Vwzlgm3Zms'
};

// Location coordinates
const LOCATION = {
    latitude: parseFloat(userConfig.latitude) || -33.9117,
    longitude: parseFloat(userConfig.longitude) || 151.1552,
    name: userConfig.locationName || 'Marrickville, NSW'
};

// RapidAPI Key for AeroDataBox - from user's config or fallback
const RAPIDAPI_KEY = userConfig.rapidApiKey || 'a71305b666mshcce90ac5542497ep1ce14ajsnbb292b7e6760';

// ISS visibility threshold in km
const ISS_PROXIMITY_KM = 500;

// ==========================================
// Caches
// ==========================================

// Token cache
let accessToken = null;
let tokenExpiry = 0;

// Weather cache (10 minute expiry)
let weatherCache = null;
let weatherCacheExpiry = 0;
const WEATHER_CACHE_MS = 10 * 60 * 1000;

// ISS cache (30 second expiry - it moves fast!)
let issCache = null;
let issCacheExpiry = 0;
const ISS_CACHE_MS = 30 * 1000;

// Logo cache directory
const LOGO_CACHE_DIR = path.join(__dirname, 'logos');
if (!fs.existsSync(LOGO_CACHE_DIR)) {
    fs.mkdirSync(LOGO_CACHE_DIR, { recursive: true });
}

// ==========================================
// Static Route Lookup (Common Australian Flights)
// These rarely change, so we can serve them instantly without API calls
// ==========================================

const COMMON_ROUTES = {
    // Qantas Domestic (QFA/QLK patterns)
    'QFA4': { departure: 'SYD', arrival: 'MEL', airline: 'Qantas' }, // Sydney-Melbourne shuttle
    'QFA5': { departure: 'SYD', arrival: 'BNE', airline: 'Qantas' }, // Sydney-Brisbane
    'QFA6': { departure: 'SYD', arrival: 'PER', airline: 'Qantas' }, // Sydney-Perth
    'QFA7': { departure: 'SYD', arrival: 'ADL', airline: 'Qantas' }, // Sydney-Adelaide
    'QFA8': { departure: 'SYD', arrival: 'CNS', airline: 'Qantas' }, // Sydney-Cairns
    'QFA9': { departure: 'SYD', arrival: 'OOL', airline: 'Qantas' }, // Sydney-Gold Coast

    // Jetstar (JST patterns)
    'JST4': { departure: 'SYD', arrival: 'MEL', airline: 'Jetstar' },
    'JST5': { departure: 'SYD', arrival: 'BNE', airline: 'Jetstar' },
    'JST6': { departure: 'SYD', arrival: 'OOL', airline: 'Jetstar' },
    'JST7': { departure: 'SYD', arrival: 'CNS', airline: 'Jetstar' },
    'JST8': { departure: 'SYD', arrival: 'MCY', airline: 'Jetstar' },

    // Virgin Australia (VOZ patterns)
    'VOZ4': { departure: 'SYD', arrival: 'MEL', airline: 'Virgin Australia' },
    'VOZ5': { departure: 'SYD', arrival: 'BNE', airline: 'Virgin Australia' },
    'VOZ6': { departure: 'SYD', arrival: 'ADL', airline: 'Virgin Australia' },
    'VOZ7': { departure: 'SYD', arrival: 'PER', airline: 'Virgin Australia' },
    'VOZ8': { departure: 'SYD', arrival: 'OOL', airline: 'Virgin Australia' },

    // Rex Airlines (RXA/ZL patterns)
    'RXA': { departure: 'SYD', arrival: 'Regional', airline: 'Rex Airlines' },
    'ZL': { departure: 'SYD', arrival: 'Regional', airline: 'Rex Airlines' },

    // International (common long-haul)
    'QFA1': { departure: 'SYD', arrival: 'LHR', airline: 'Qantas' },
    'QFA11': { departure: 'SYD', arrival: 'LAX', airline: 'Qantas' },
    'QFA12': { departure: 'LAX', arrival: 'SYD', airline: 'Qantas' },
    'QFA7': { departure: 'SYD', arrival: 'DFW', airline: 'Qantas' },

    // NZ flights
    'ANZ1': { departure: 'SYD', arrival: 'AKL', airline: 'Air New Zealand' },
    'NZM': { departure: 'SYD', arrival: 'WLG', airline: 'Air New Zealand' },
};

/**
 * lookupStaticRoute - DISABLED
 * Flight numbers don't follow predictable patterns by prefix
 * Always use API for accurate route info
 * @returns {null} - Always returns null so API is used
 */
function lookupStaticRoute(callsign) {
    return null; // Static lookup disabled - API is more accurate
}

// Serve static files from current directory
app.use(express.static(__dirname));

// Parse JSON bodies for POST requests
app.use(express.json());

// ==========================================
// Flight Stats Storage
// ==========================================

const STATS_FILE = path.join(__dirname, 'flight_stats.json');

// Load existing stats or create empty object
function loadStats() {
    try {
        if (fs.existsSync(STATS_FILE)) {
            return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading stats:', e);
    }
    return { flights: {}, totalSightings: 0, lastUpdated: null };
}

// Save stats to file
function saveStats(stats) {
    try {
        stats.lastUpdated = new Date().toISOString();
        fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
    } catch (e) {
        console.error('Error saving stats:', e);
    }
}

// ==========================================
// Helper Functions
// ==========================================

// Calculate distance between two points using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
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

// Map WMO weather codes to simple icons and descriptions
function getWeatherInfo(code) {
    const weatherMap = {
        0: { icon: '☀', desc: 'Clear' },
        1: { icon: '🌤', desc: 'Mostly Clear' },
        2: { icon: '⛅', desc: 'Partly Cloudy' },
        3: { icon: '☁', desc: 'Overcast' },
        45: { icon: '🌫', desc: 'Fog' },
        48: { icon: '🌫', desc: 'Fog' },
        51: { icon: '🌧', desc: 'Light Drizzle' },
        53: { icon: '🌧', desc: 'Drizzle' },
        55: { icon: '🌧', desc: 'Heavy Drizzle' },
        61: { icon: '🌧', desc: 'Light Rain' },
        63: { icon: '🌧', desc: 'Rain' },
        65: { icon: '🌧', desc: 'Heavy Rain' },
        71: { icon: '🌨', desc: 'Light Snow' },
        73: { icon: '🌨', desc: 'Snow' },
        75: { icon: '🌨', desc: 'Heavy Snow' },
        80: { icon: '🌦', desc: 'Showers' },
        81: { icon: '🌦', desc: 'Showers' },
        82: { icon: '🌦', desc: 'Heavy Showers' },
        95: { icon: '⛈', desc: 'Thunderstorm' },
        96: { icon: '⛈', desc: 'Thunderstorm' },
        99: { icon: '⛈', desc: 'Thunderstorm' }
    };
    return weatherMap[code] || { icon: '○', desc: 'Unknown' };
}

// Fetch weather data from Open-Meteo API
async function fetchWeather() {
    // Return cached data if still valid
    if (weatherCache && Date.now() < weatherCacheExpiry) {
        return weatherCache;
    }

    try {
        // Weather API (Forecast) - now includes precipitation probability
        const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${LOCATION.latitude}&longitude=${LOCATION.longitude}&current=temperature_2m,weather_code,wind_speed_10m,precipitation_probability&timezone=Australia/Sydney`;

        // Air Quality API (Separate endpoint)
        const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${LOCATION.latitude}&longitude=${LOCATION.longitude}&current=us_aqi&timezone=Australia/Sydney`;

        console.log(`Fetching weather: ${weatherUrl}`);
        console.log(`Fetching AQI: ${aqiUrl}`);

        // Parallel fetch
        const [weatherResponse, aqiResponse] = await Promise.all([
            axios.get(weatherUrl, { timeout: 10000, httpsAgent: new https.Agent({ family: 4 }) }),
            axios.get(aqiUrl, { timeout: 10000, httpsAgent: new https.Agent({ family: 4 }) }).catch(() => null) // AQI optional
        ]);

        const weatherData = weatherResponse.data;

        // Validate response structure
        if (!weatherData || !weatherData.current) {
            console.error('Weather API invalid response');
            throw new Error('Invalid weather data structure');
        }

        const current = weatherData.current;
        const weatherInfo = getWeatherInfo(current.weather_code);

        // Extract AQI if available
        let aqi = null;
        if (aqiResponse && aqiResponse.data && aqiResponse.data.current) {
            aqi = aqiResponse.data.current.us_aqi;
        }

        weatherCache = {
            temp: Math.round(current.temperature_2m),
            tempUnit: weatherData.current_units?.temperature_2m || '°C',
            icon: weatherInfo.icon,
            condition: weatherInfo.desc,
            windSpeed: Math.round(current.wind_speed_10m),
            windUnit: weatherData.current_units?.wind_speed_10m || 'km/h',
            rainChance: current.precipitation_probability ?? null, // Rain chance %
            aqi: aqi,
            location: LOCATION.name,
            timestamp: new Date().toISOString()
        };
        weatherCacheExpiry = Date.now() + WEATHER_CACHE_MS;

        console.log(`✓ Weather updated: ${weatherCache.temp}°C, ${weatherCache.condition}, Rain: ${weatherCache.rainChance}%, AQI: ${weatherCache.aqi}`);
        return weatherCache;

    } catch (error) {
        console.error('Weather fetch error:', error.message);
        if (weatherCache) return weatherCache;
        return { temp: '--', windSpeed: '--', error: error.message };
    }
}

// Global Satellite Cache
let satelliteCache = null;
const SATELLITE_CACHE_MS = 60 * 60 * 1000; // 1 hour

// Fetch Satellite Visual Passes (N2YO)
// NOTE: N2YO requires a free API key from n2yo.com - add to config.json as "n2yoApiKey"
const N2YO_API_KEY = userConfig.n2yoApiKey || 'CX8KZF-TL5RLL-D9NPSN-5MG0';
async function fetchSatellitePasses() {
    // Skip if no API key configured
    if (!N2YO_API_KEY) {
        satelliteCache = null; // Use ISS fallback instead
        return;
    }

    try {
        // ID 25544 = ISS
        const satId = 25544;
        const days = 1;
        const minVis = 60; // seconds

        const url = `https://api.n2yo.com/rest/v1/satellite/visualpasses/${satId}/${LOCATION.latitude}/${LOCATION.longitude}/0/${days}/${minVis}&apiKey=${N2YO_API_KEY}`;

        // Only fetch if cache expired or null
        // We'll manage cache internally or just fetch periodically

        console.log(`Fetching Satellite Passes...`);
        const response = await axios.get(url, { timeout: 5000 });
        const data = response.data;

        if (data && data.passes && data.passes.length > 0) {
            // Find best pass that is ACTUALLY visible (Mag <= -1.0)
            // Lower magnitude = Brighter. -2 is very bright, 3 is dim.
            // 0.3 is often invisible in city/twilight.
            const goodPass = data.passes.find(p => p.mag <= -1.0);

            if (goodPass) {
                satelliteCache = {
                    name: data.info.satname,
                    start: goodPass.startUTC,
                    end: goodPass.endUTC,
                    mag: goodPass.mag,
                    timestamp: Date.now()
                };
                console.log(`✓ Satellite pass detected: ${satelliteCache.name}, Mag ${goodPass.mag} (Visible!)`);
            } else {
                satelliteCache = null; // Passes exist but too dim
                console.log(`- Satellite passes found but too dim (Best Mag: ${data.passes[0].mag})`);
            }
        } else {
            satelliteCache = null;
        }

    } catch (error) {
        console.error('Satellite update failed:', error.message);
    }
}

// Fetch ISS position and calculate proximity
async function fetchISS() {
    // Return cached data if still valid
    if (issCache && Date.now() < issCacheExpiry) {
        return issCache;
    }

    try {
        const response = await fetch('http://api.open-notify.org/iss-now.json');
        if (!response.ok) {
            throw new Error(`ISS API error: ${response.status}`);
        }

        const data = await response.json();
        const issLat = parseFloat(data.iss_position.latitude);
        const issLon = parseFloat(data.iss_position.longitude);

        const distance = calculateDistance(
            LOCATION.latitude, LOCATION.longitude,
            issLat, issLon
        );

        const visible = distance <= ISS_PROXIMITY_KM;

        issCache = {
            latitude: issLat,
            longitude: issLon,
            distance: Math.round(distance),
            visible: visible,
            status: visible ? 'OVERHEAD' : 'OUT OF RANGE',
            threshold: ISS_PROXIMITY_KM,
            timestamp: new Date().toISOString()
        };
        issCacheExpiry = Date.now() + ISS_CACHE_MS;

        if (visible) {
            console.log(`✦ ISS is overhead! Distance: ${issCache.distance}km`);
        }
        return issCache;

    } catch (error) {
        console.error('ISS fetch error:', error.message);
        if (issCache) return issCache;
        return { error: error.message, visible: false, status: 'ERROR' };
    }
}

// Generate monochrome logo SVG fallback
function generateLogoFallback(icao) {
    const code = icao.toUpperCase().substring(0, 3);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40" viewBox="0 0 80 40">
        <rect width="80" height="40" fill="white" stroke="black" stroke-width="2"/>
        <text x="40" y="28" font-family="monospace" font-size="16" font-weight="bold" 
              text-anchor="middle" fill="black">${code}</text>
    </svg>`;
}

// ==========================================
// API Routes
// ==========================================

// Weather endpoint - returns current weather for Marrickville
app.get('/api/weather', async (req, res) => {
    try {
        const weather = await fetchWeather();
        res.json(weather);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ISS tracking endpoint - returns ISS position and visibility
app.get('/api/iss', async (req, res) => {
    try {
        const iss = await fetchISS();
        res.json(iss);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Satellite endpoint
app.get('/api/satellite', (req, res) => {
    res.json(satelliteCache || {});
});

// ==========================================
// Aircraft Metadata Endpoint (Local SQLite)
// ==========================================

// Get aircraft metadata by ICAO24 hex code
app.get('/api/aircraft-meta/:icao24', (req, res) => {
    const icao24 = req.params.icao24.toUpperCase();

    const aircraft = lookupAircraftLocal(icao24);

    if (aircraft) {
        console.log(`✓ Aircraft from local DB: ${icao24} → ${aircraft.manufacturer} ${aircraft.model}`);
        res.json({
            found: true,
            icao24: icao24,
            manufacturer: aircraft.manufacturer,
            model: aircraft.model,
            operator: aircraft.operator,
            typecode: aircraft.typecode,
            source: 'local'
        });
    } else {
        res.json({
            found: false,
            icao24: icao24,
            message: 'Aircraft not in local database'
        });
    }
});

// ==========================================
// Flight Stats Endpoints
// ==========================================

// GET all stats
app.get('/api/stats', (req, res) => {
    const stats = loadStats();

    // Calculate derived stats
    const flights = Object.entries(stats.flights || {});
    const sortedByCount = [...flights].sort((a, b) => b[1].count - a[1].count);
    const sortedByClosest = [...flights].sort((a, b) => a[1].minDistance - b[1].minDistance);
    const sortedByHighest = [...flights].sort((a, b) => (b[1].maxAltitude || 0) - (a[1].maxAltitude || 0));
    const sortedByRecent = [...flights].sort((a, b) => new Date(b[1].lastSeen) - new Date(a[1].lastSeen));

    // Rare sightings (sorted by most recent)
    const rareSightings = flights
        .filter(([_, info]) => info.rare)
        .sort((a, b) => new Date(b[1].lastSeen) - new Date(a[1].lastSeen))
        .slice(0, 20);

    // Unique aircraft models with first-seen dates
    const models = stats.models || {};
    const modelsList = Object.entries(models)
        .sort((a, b) => new Date(a[1].firstSeen) - new Date(b[1].firstSeen)); // Oldest first

    // Unique countries
    const countries = new Set();
    flights.forEach(([_, info]) => {
        if (info.country) countries.add(info.country);
    });

    res.json({
        ...stats,
        uniqueFlights: flights.length,
        topByCount: sortedByCount.slice(0, 10),
        closestFlyby: sortedByClosest[0] || null,
        highestAltitude: sortedByHighest[0] || null,
        recentSightings: sortedByRecent.slice(0, 20),
        // New stats
        rareSightings: rareSightings,
        rareCount: rareSightings.length,
        modelsList: modelsList,
        uniqueModels: Object.keys(models).length,
        uniqueCountries: countries.size
    });
});

// POST new sighting
app.post('/api/stats', (req, res) => {
    const { callsign, distance, altitude, carrier, route, aircraft, rare, typecode, country } = req.body;

    if (!callsign) {
        return res.status(400).json({ error: 'Callsign required' });
    }

    const stats = loadStats();

    // Initialize flight entry if new
    if (!stats.flights[callsign]) {
        stats.flights[callsign] = {
            count: 0,
            firstSeen: new Date().toISOString(),
            minDistance: Infinity,
            maxAltitude: 0
        };
    }

    const flight = stats.flights[callsign];
    flight.count++;
    flight.lastSeen = new Date().toISOString();

    // Update records
    if (distance !== undefined && distance < flight.minDistance) {
        flight.minDistance = distance;
    }
    if (altitude !== undefined && altitude > (flight.maxAltitude || 0)) {
        flight.maxAltitude = altitude;
    }

    // Update metadata
    if (carrier) flight.carrier = carrier;
    if (route) flight.route = route;
    if (aircraft) flight.aircraft = aircraft;
    if (rare) flight.rare = true;
    if (typecode) flight.typecode = typecode;
    if (country) flight.country = country;

    // Track unique aircraft models with first-seen dates
    if (typecode || aircraft) {
        const modelKey = typecode || aircraft;
        if (!stats.models) stats.models = {};
        if (!stats.models[modelKey]) {
            stats.models[modelKey] = {
                firstSeen: new Date().toISOString(),
                name: aircraft || typecode,
                typecode: typecode,
                count: 0
            };
            console.log(`🆕 NEW MODEL: ${modelKey} (${aircraft})`);
        }
        stats.models[modelKey].count++;
        stats.models[modelKey].lastSeen = new Date().toISOString();
    }

    stats.totalSightings = (stats.totalSightings || 0) + 1;

    saveStats(stats);

    console.log(`✓ Stat recorded: ${callsign} (seen ${flight.count}x)${rare ? ' ⭐RARE!' : ''}`);
    res.json({ success: true, callsign, count: flight.count });
});

// Logo proxy endpoint - serves cached logos or fetches new ones
const ASSETS_DIR = path.join(__dirname, 'assets');

// Default hardcoded map (Fallback)
let ICAO_TO_SLUG = {
    // Australian Airlines
    'QFA': 'qantas', 'QLK': 'qantas', 'QJE': 'qantas', // Qantas + QantasLink + QantasLink Express
    'JST': 'jetstar', 'JJP': 'jetstar', // Jetstar + Jetstar Japan
    'VOZ': 'virgin-australia', 'VAU': 'virgin-australia', // Virgin Australia (both codes used)
    'REX': 'rex-airlines', // Regional Express
    // Asia Pacific
    'ANZ': 'air-new-zealand', 'NZM': 'air-new-zealand',
    'CPA': 'cathay-pacific', 'HDA': 'hk-express',
    'SIA': 'singapore-airlines', 'TGW': 'scoot',
    'FJI': 'fiji-airways',
    'AXM': 'airasia', 'XAX': 'airasia', // AirAsia X
    'GIA': 'garuda-indonesia', 'PAL': 'philippine-airlines',
    'THA': 'thai-airways', 'HVN': 'vietnam-airlines', 'VJC': 'vietjet-air',
    // Middle East
    'UAE': 'emirates', 'ETD': 'etihad-airways', 'QTR': 'qatar-airways',
    // Europe
    'BAW': 'british-airways', 'DLH': 'lufthansa', 'AFR': 'air-france',
    'KLM': 'klm', 'SWR': 'swiss', 'SAS': 'scandinavian-airlines',
    // Americas
    'UAL': 'united-airlines', 'AAL': 'american-airlines', 'DAL': 'delta',
    'ACA': 'air-canada', 'SWA': 'southwest-airlines',
    // Asia
    'JAL': 'japan-airlines', 'ANA': 'all-nippon-airways',
    'KAL': 'korean-air', 'AAR': 'asiana-airlines',
    'CSN': 'china-southern', 'CCA': 'air-china', 'CES': 'china-eastern',
    'EVA': 'eva-air', 'CAL': 'china-airlines', 'MAS': 'malaysia-airlines'
};

// Load airlines.json mapping (overrides/extends default)
try {
    const airlinesPath = path.join(__dirname, 'airlines.json');
    if (fs.existsSync(airlinesPath)) {
        const fileContent = fs.readFileSync(airlinesPath, 'utf8');
        // Check if empty
        if (!fileContent.trim()) {
            console.warn('! airlines.json is empty, using default map.');
        } else {
            const airlinesData = JSON.parse(fileContent);
            airlinesData.forEach(airline => {
                if (airline.icao && airline.slug) {
                    ICAO_TO_SLUG[airline.icao] = airline.slug;
                }
                if (airline.subsidiaries) {
                    airline.subsidiaries.forEach(sub => {
                        if (sub.icao) ICAO_TO_SLUG[sub.icao] = airline.slug;
                    });
                }
            });
            console.log(`✓ Loaded ${airlinesData.length} mappings from airlines.json (Total: ${Object.keys(ICAO_TO_SLUG).length})`);
        }
    } else {
        console.warn('! airlines.json not found, using default map.');
    }
} catch (e) {
    console.error('Error loading airlines.json:', e.message);
    // Keep default map
}

app.get('/api/logo/:icao', async (req, res) => {
    const icao = req.params.icao.toUpperCase().substring(0, 3);
    const cachedSvg = path.join(LOGO_CACHE_DIR, `${icao}.svg`);
    const cachedPng = path.join(LOGO_CACHE_DIR, `${icao}.png`);

    // 0. Check Local Assets (Best Quality)
    if (ICAO_TO_SLUG[icao]) {
        const slug = ICAO_TO_SLUG[icao];
        // Try icon-mono.svg/icon.svg first (as requested), then fall back to logos
        const candidates = ['icon-mono.svg', 'icon.svg', 'logo-mono.svg', 'logo.svg'];

        for (const file of candidates) {
            const assetPath = path.join(ASSETS_DIR, slug, file);
            // console.log(`Debug: Checking ${assetPath}`);
            if (fs.existsSync(assetPath)) {
                try {
                    console.log(`✓ Found local asset for ${icao} (${slug}/${file})`);
                    let svgContent = fs.readFileSync(assetPath, 'utf8');
                    // Force black fill
                    svgContent = svgContent.replace(/fill="[^"]*"/g, 'fill="#000000"');
                    svgContent = svgContent.replace(/fill:[^;"]*/g, 'fill:#000000');
                    if (!svgContent.includes('fill=')) {
                        svgContent = svgContent.replace('<svg', '<svg fill="#000000"');
                    }

                    res.setHeader('Content-Type', 'image/svg+xml');
                    res.setHeader('Cache-Control', 'public, max-age=86400');
                    return res.send(svgContent);
                } catch (e) {
                    console.error('Asset read error:', e);
                }
            }
        }
        console.log(`x Local asset missing for ${icao} (slug: ${slug})`);
    } else {
        // console.log(`x No slug mapping for ${icao}`);
    }

    // 0.5. Check FlightAware Logos (User provided - 1315 icons)
    const FLIGHTAWARE_LOGOS_DIR = path.join(__dirname, 'flightaware_logos');
    const flightAwareLogoPath = path.join(FLIGHTAWARE_LOGOS_DIR, `${icao}.png`);

    if (fs.existsSync(flightAwareLogoPath)) {
        console.log(`✓ Found FlightAware logo for ${icao}`);
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.sendFile(flightAwareLogoPath);
    }

    try {
        // 1. Check for cached PNG (real logo)
        if (fs.existsSync(cachedPng)) {
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            return res.sendFile(cachedPng);
        }

        // 2. Check for cached SVG (fallback) - legacy cache only
        if (fs.existsSync(cachedSvg)) {
            // We might want to DELETE legacy fallbacks if we want to stop showing them?
            // But valid SVGs might be cached there.
            // We'll trust existing files, but won't create new fallbacks.
            res.setHeader('Content-Type', 'image/svg+xml');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            return res.sendFile(cachedSvg);
        }

        // 3. Try fetching real logo (FlightRadar24)
        console.log(`Fetching logo for ${icao}...`);
        const logoUrl = `https://images.flightradar24.com/assets/airlines/logotypes/${icao}.png`;

        try {
            const response = await axios.get(logoUrl, {
                responseType: 'arraybuffer',
                timeout: 5000,
                httpsAgent: new https.Agent({ family: 4 })
            });

            if (response.status === 200) {
                fs.writeFileSync(cachedPng, response.data);
                console.log(`✓ Logo cached: ${icao}.png`);

                res.setHeader('Content-Type', 'image/png');
                res.setHeader('Cache-Control', 'public, max-age=86400');
                return res.sendFile(cachedPng);
            }
        } catch (fetchError) {
            console.error(`Logo fetch failed for ${icao}:`, fetchError.message);
        }

        // 4. NO Fallback - Return 404
        console.log(`No logo found for ${icao}`);
        res.status(404).send('Logo not found');

    } catch (error) {
        console.error('Logo error:', error.message);
        res.status(404).send('Logo not found');
    }
});

// Stats Endpoint
app.post('/api/stats', (req, res) => {
    try {
        const sighting = req.body;
        // Basic validation
        if (!sighting || !sighting.callsign) {
            return res.status(400).send('Invalid sighting data');
        }

        const statsFile = path.join(__dirname, 'flight_stats.json');
        let stats = [];
        if (fs.existsSync(statsFile)) {
            stats = JSON.parse(fs.readFileSync(statsFile));
        }

        // Add to history (keep last 1000)
        stats.unshift(sighting);
        if (stats.length > 1000) stats.pop();

        fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2));

        // Check for Rare Aircraft
        if (sighting.rare) {
            const rareFile = path.join(__dirname, 'rare_sightings.json');
            let rareStats = [];
            if (fs.existsSync(rareFile)) {
                rareStats = JSON.parse(fs.readFileSync(rareFile));
            }
            rareStats.unshift(sighting); // Keep all rare ones? Or limit?
            fs.writeFileSync(rareFile, JSON.stringify(rareStats, null, 2));
            console.log(`★ RARE SIGHTING RECORDED: ${sighting.callsign}`);
        }

        res.json({ success: true });
    } catch (e) {
        console.error('Stats error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Flight Info cache (7 day expiry)
const FLIGHT_CACHE = {};
const FLIGHT_CACHE_MS = 7 * 24 * 60 * 60 * 1000;

// Satellite Endpoint
// Kindle Screenshot Endpoint
app.get('/kindle', (req, res) => {
    // Serve a simple HTML page that displays the latest screenshot
    // Supports ?rotate=1 (90deg) and ?scale=1.5
    const rotate = req.query.rotate ? 'rotate(90deg)' : 'none';
    const scale = req.query.scale ? `scale(${req.query.scale})` : 'scale(1)';
    const fit = req.query.fit === 'cover' ? 'cover' : 'contain';

    let style = `body { margin: 0; padding: 0; background: white; overflow: hidden; display: flex; justify-content: center; align-items: center; height: 100vh; }`;

    if (req.query.rotate) {
        // Rotating for Portrait Mode (fills height)
        style += `img { width: 100vh; height: 100vw; object-fit: contain; transform: rotate(90deg); }`;
    } else {
        // Standard Landscape Mode
        style += `img { width: 100vw; height: 100vh; object-fit: ${fit}; transform: ${scale}; }`;
    }

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Flight Tracker</title>
        <meta http-equiv="refresh" content="10">
        <style>
            ${style}
        </style>
    </head>
    <body>
        <img src="/kindle-image?t=${Date.now()}" alt="Loading...">
    </body>
    </html>
    `;
    res.send(html);
});

// Serve the actual image
app.get('/kindle-image', (req, res) => {
    const screensotPath = path.join(__dirname, 'screenshots', 'eink_frame.png');
    if (fs.existsSync(screensotPath)) {
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.sendFile(screensotPath);
    } else {
        // Return placeholder or wait
        res.status(404).send('Screenshot not ready yet. Please wait.');
    }
});

app.get('/api/satellite', (req, res) => {
    res.json(satelliteCache || { active: false });
});

// ==========================================
// API Configuration
// ==========================================
const API_MARKET_KEY = userConfig.apiMarketKey || 'cmjdywih90001jp0410hdg3z0';
const API_MARKET_URL = 'https://prod.api.market/api/v1/aedbx/aerodatabox/flights/number';

// AirLabs API (Free tier - 1000 calls/month)
const AIRLABS_KEY = userConfig.airlabsKey || '8341d542-b088-483c-b5e2-5ccfd87dc5c0';
const AIRLABS_URL = 'https://airlabs.co/api/v9/flights';

// FlightPlanDatabase API Key (for potential future use - simulation routes only)
const FLIGHTPLANDB_KEY = userConfig.flightPlanDbKey || 'KsYTIUCOgJtEtCYUO0rOTaExHiEgVq6cnS5ADhPN';

// ==========================================
// API Mode Configuration
// 'off'   - No external API calls at all
// 'free'  - Use AirLabs (1000/month) + local SQLite
// 'paid'  - Use API.market/AeroDataBox (unlimited)
// ==========================================
let API_MODE = userConfig.apiMode || 'free';
console.log(`API Mode: ${API_MODE.toUpperCase()}`);

// ==========================================
// API Quota Tracking (AirLabs - 1000/month)
// ==========================================
let API_QUOTA = {
    used: 0,
    limit: 1000,
    resetDate: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString() // First of next month
};

// Endpoint to get quota status
app.get('/api/config/quota', (req, res) => {
    res.json(API_QUOTA);
});

// Endpoint to set API mode
app.post('/api/config/api-mode', (req, res) => {
    const { mode } = req.body;
    if (['off', 'free', 'paid'].includes(mode)) {
        API_MODE = mode;
        console.log(`API MODE UPDATED: ${API_MODE.toUpperCase()}`);
        res.json({ success: true, mode: API_MODE });
    } else {
        res.status(400).json({ error: 'Invalid mode. Use: off, free, or paid' });
    }
});

// Endpoint to get current API mode
app.get('/api/config/api-mode', (req, res) => {
    res.json({ mode: API_MODE });
});

// Legacy endpoint for backward compatibility
app.post('/api/config/paid-api', (req, res) => {
    const { enabled } = req.body;
    if (typeof enabled === 'boolean') {
        API_MODE = enabled ? 'paid' : 'off';
        console.log(`API MODE (legacy): ${API_MODE.toUpperCase()}`);
        res.json({ success: true, enabled: API_MODE === 'paid' });
    } else {
        res.status(400).json({ error: 'Invalid value' });
    }
});

// Legacy endpoint for backward compatibility
app.get('/api/config/paid-api', (req, res) => {
    res.json({ enabled: API_MODE === 'paid' });
});

// Flight Info Proxy (Route & Extra Data)
app.get('/api/flight-info/:callsign', async (req, res) => {
    const callsign = req.params.callsign.toUpperCase();

    // Check cache
    if (FLIGHT_CACHE[callsign] && FLIGHT_CACHE[callsign].expiry > Date.now()) {
        return res.json(FLIGHT_CACHE[callsign].data);
    }

    // CHECK API MODE
    if (API_MODE === 'off') {
        console.log(`Skipping API lookup for ${callsign} (API Mode: OFF)`);
        return res.json({ source: 'disabled', origin: 'Unknown', destination: 'Unknown' });
    }

    // Check static routes first (no API call needed)
    const staticRoute = lookupStaticRoute(callsign);
    if (staticRoute) {
        const info = {
            origin: staticRoute.departure,
            destination: staticRoute.arrival,
            airline: staticRoute.airline,
            source: 'static'
        };
        FLIGHT_CACHE[callsign] = { data: info, expiry: Date.now() + FLIGHT_CACHE_MS };
        console.log(`✓ Static route match: ${callsign}`);
        return res.json(info);
    }

    let flightData = null;
    let fetchError = null;
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

    // ==========================================
    // FREE MODE: Use AirLabs API (1000/month)
    // ==========================================
    if (API_MODE === 'free' && AIRLABS_KEY) {
        try {
            console.log(`Fetching flight info for ${callsign} (AirLabs FREE)...`);
            API_QUOTA.used++; // Increment quota counter
            const response = await axios.get(AIRLABS_URL, {
                params: {
                    api_key: AIRLABS_KEY,
                    flight_icao: callsign
                },
                timeout: 8000
            });

            if (response.data && response.data.response && response.data.response.length > 0) {
                const flight = response.data.response[0];
                const info = {
                    origin: flight.dep_iata || flight.dep_icao || 'Unknown',
                    destination: flight.arr_iata || flight.arr_icao || 'Unknown',
                    airline: flight.airline_icao || null,
                    aircraft: flight.aircraft_icao || null,
                    source: 'airlabs'
                };
                FLIGHT_CACHE[callsign] = { data: info, expiry: Date.now() + FLIGHT_CACHE_MS };
                console.log(`✓ AirLabs success: ${callsign} → ${info.origin} → ${info.destination}`);
                return res.json(info);
            } else {
                console.log(`AirLabs: No data for ${callsign}`);
                // Cache negative result for 1 hour
                FLIGHT_CACHE[callsign] = {
                    data: { notFound: true, origin: 'Unknown', destination: 'Unknown', source: 'airlabs' },
                    expiry: Date.now() + 3600000
                };
                return res.json({ notFound: true, origin: 'Unknown', destination: 'Unknown', source: 'airlabs' });
            }
        } catch (e) {
            console.warn(`AirLabs failed: ${e.message}`);
            fetchError = e;
            // Fall through to return error
            return res.json({ error: e.message, origin: 'Unknown', destination: 'Unknown', source: 'airlabs' });
        }
    }

    // ==========================================
    // PAID MODE: Use API.market/AeroDataBox
    // ==========================================
    if (API_MARKET_KEY) {
        try {
            console.log(`Fetching flight info for ${callsign} (API.market)...`);
            const response = await axios.get(`${API_MARKET_URL}/${callsign}/${today}`, {
                headers: {
                    'accept': 'application/json',
                    'x-api-market-key': API_MARKET_KEY
                },
                timeout: 8000
            });
            if (response.data && response.data.length > 0) {
                flightData = response.data[0];
                console.log(`✓ API.market success: ${callsign}`);
            } else {
                console.log(`API.market: No data for ${callsign}`);
            }
        } catch (e) {
            console.warn(`API.market failed: ${e.message}`);
            fetchError = e;
        }
    }

    // RapidAPI fallback removed - quota exceeded and not useful

    if (!flightData) {
        // CACHE NEGATIVE RESULT to avoid API burning
        // Cache "Not Found" for 1 hour (3600000 ms)
        FLIGHT_CACHE[callsign] = {
            data: { notFound: true, origin: 'Unknown', destination: 'Unknown' },
            expiry: Date.now() + 3600000
        };
        console.log(`- No data found for ${callsign}, caching negative result for 1h.`);
        return res.json({ notFound: true, origin: 'Unknown', destination: 'Unknown' });
    }

    // Normalize Data
    const info = {
        origin: flightData.departure?.airport?.name || flightData.departure?.airport?.iata || 'Unknown',
        destination: flightData.arrival?.airport?.name || flightData.arrival?.airport?.iata || 'Unknown',
        airline: flightData.airline?.name,
        aircraft: flightData.aircraft?.model || null,
        logoUrl: flightData.airline?.logo
    };

    // Save to cache
    FLIGHT_CACHE[callsign] = {
        data: info,
        expiry: Date.now() + FLIGHT_CACHE_MS
    };

    res.json(info);
});

// ==========================================
// OpenSky Authentication
// ==========================================

// Get OAuth2 token
async function getAccessToken() {
    // Return cached token if still valid (with 60s buffer)
    if (accessToken && Date.now() < tokenExpiry - 60000) {
        return accessToken;
    }

    try {
        const credentials = Buffer.from(
            `${OPENSKY_CONFIG.CLIENT_ID}:${OPENSKY_CONFIG.CLIENT_SECRET}`
        ).toString('base64');

        const response = await fetch(OPENSKY_CONFIG.TOKEN_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'grant_type=client_credentials'
        });

        if (!response.ok) {
            console.error('Token fetch failed:', response.status);
            return null;
        }

        const data = await response.json();
        accessToken = data.access_token;
        tokenExpiry = Date.now() + (data.expires_in * 1000);
        console.log('✓ OpenSky token obtained, expires in', data.expires_in, 'seconds');
        return accessToken;
    } catch (error) {
        console.error('Token fetch error:', error.message);
        return null;
    }
}

// Proxy endpoint for OpenSky API
app.get('/api/opensky', async (req, res) => {
    try {
        const { lamin, lamax, lomin, lomax } = req.query;

        if (!lamin || !lamax || !lomin || !lomax) {
            return res.status(400).json({ error: 'Missing bounding box parameters' });
        }

        // Get OAuth2 token
        const token = await getAccessToken();

        const url = `${OPENSKY_CONFIG.API_URL}?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;

        const headers = token
            ? { 'Authorization': `Bearer ${token}` }
            : {};

        console.log(`→ Fetching flights (${token ? 'authenticated' : 'anonymous'})...`);

        const response = await fetch(url, { headers });

        if (!response.ok) {
            if (response.status === 429) {
                console.log('✗ Rate limited by OpenSky');
                return res.status(429).json({ error: 'Rate limited' });
            }
            throw new Error(`OpenSky API error: ${response.status}`);
        }

        const data = await response.json();
        const flightCount = data.states ? data.states.length : 0;
        console.log(`✓ Found ${flightCount} aircraft`);

        res.json(data);

    } catch (error) {
        console.error('Proxy error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Trigger immediate E-Ink update
app.post('/api/trigger-update', (req, res) => {
    try {
        const triggerFile = path.join(__dirname, 'trigger.txt');
        fs.writeFileSync(triggerFile, Date.now().toString());
        res.json({ success: true });
    } catch (e) {
        console.error('Trigger error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════╗
║     Flight Tracker Server Running          ║
╠════════════════════════════════════════════╣
║  Open: http://localhost:${PORT}              ║
║                                            ║
║  API Endpoints:                            ║
║  • /api/opensky  - Flight data             ║
║  • /api/weather  - Weather data            ║
║  • /api/iss      - ISS tracking            ║
║  • /api/logo/:id - Airline logos           ║
╚════════════════════════════════════════════╝
    `);

    // Pre-fetch token and weather on startup
    getAccessToken();
    fetchWeather();
    fetchSatellitePasses();

    // Schedule updates
    setInterval(fetchWeather, 10 * 60 * 1000);
    setInterval(fetchSatellitePasses, 60 * 60 * 1000); // Check hourly
});
