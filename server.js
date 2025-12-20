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

const RAPIDAPI_KEY = userConfig.rapidApiKey || null;

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

// Serve static files from current directory
app.use(express.static(__dirname));

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
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${LOCATION.latitude}&longitude=${LOCATION.longitude}&current=temperature_2m,weather_code,wind_speed_10m&timezone=Australia/Sydney`;

        console.log(`Fetching weather (axios): ${url}`);
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'FlightTrackerClock/1.0',
                'Accept': 'application/json'
            },
            timeout: 10000, // 10s timeout
            httpsAgent: new https.Agent({ family: 4 }) // Force IPv4 to avoid timeouts
        });

        const data = response.data;

        // Validate response structure
        if (!data || !data.current) {
            console.error('Weather API invalid parsed response:', JSON.stringify(data));
            throw new Error('Invalid weather data structure');
        }

        const current = data.current;
        const weatherInfo = getWeatherInfo(current.weather_code);

        weatherCache = {
            temp: Math.round(current.temperature_2m),
            tempUnit: data.current_units?.temperature_2m || '°C',
            icon: weatherInfo.icon,
            condition: weatherInfo.desc,
            windSpeed: Math.round(current.wind_speed_10m),
            windUnit: data.current_units?.wind_speed_10m || 'km/h',
            location: LOCATION.name,
            timestamp: new Date().toISOString()
        };
        weatherCacheExpiry = Date.now() + WEATHER_CACHE_MS;

        console.log(`✓ Weather updated: ${weatherCache.temp}°C, ${weatherCache.condition}`);
        return weatherCache;

    } catch (error) {
        console.error('Weather fetch error:', error.message);
        if (error.code) console.error('Error Code:', error.code);
        if (error.response) {
            console.error('API Status:', error.response.status);
            console.error('API Data:', JSON.stringify(error.response.data));
        }

        // Return stale cache if available
        if (weatherCache) return weatherCache;
        // Return explicit error object
        return {
            temp: '--',
            windSpeed: '--',
            error: error.message
        };
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

// Logo proxy endpoint - serves cached monochrome logos or text fallback
// Logo proxy endpoint - serves cached logos or fetches new ones
app.get('/api/logo/:icao', async (req, res) => {
    const icao = req.params.icao.toUpperCase().substring(0, 3);
    const cachedSvg = path.join(LOGO_CACHE_DIR, `${icao}.svg`);
    const cachedPng = path.join(LOGO_CACHE_DIR, `${icao}.png`);

    try {
        // 1. Check for cached PNG (real logo)
        if (fs.existsSync(cachedPng)) {
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            return res.sendFile(cachedPng);
        }

        // 2. Check for cached SVG (fallback)
        if (fs.existsSync(cachedSvg)) {
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

        // 4. Generate fallback if fetch failed
        console.log(`Using fallback logo for ${icao}`);
        const fallbackSvg = generateLogoFallback(icao);
        fs.writeFileSync(cachedSvg, fallbackSvg);

        res.setHeader('Content-Type', 'image/svg+xml');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.send(fallbackSvg);

    } catch (error) {
        console.error('Logo error:', error.message);
        // Return inline fallback on error
        const fallbackSvg = generateLogoFallback(icao);
        res.setHeader('Content-Type', 'image/svg+xml');
        res.send(fallbackSvg);
    }
});

// Flight Info Proxy (Route & Extra Data)
app.get('/api/flight-info/:callsign', async (req, res) => {
    const callsign = req.params.callsign;

    if (!RAPIDAPI_KEY) {
        return res.status(501).json({ error: 'No RapidAPI Key configured' });
    }

    try {
        console.log(`Fetching flight info for ${callsign}...`);
        const url = `https://aerodatabox.p.rapidapi.com/flights/callsign/${callsign}`;
        const response = await axios.get(url, {
            headers: {
                'X-RapidAPI-Key': RAPIDAPI_KEY,
                'X-RapidAPI-Host': 'aerodatabox.p.rapidapi.com'
            },
            params: { withImage: true, withLocation: false },
            timeout: 5000
        });

        const data = response.data[0]; // AeroDataBox returns array of recent flights
        if (!data) return res.status(404).json({ error: 'Not found' });

        res.json({
            origin: data.departure?.airport?.name || data.departure?.airport?.iata || 'Unknown',
            destination: data.arrival?.airport?.name || data.arrival?.airport?.iata || 'Unknown',
            airline: data.airline?.name,
            logoUrl: data.airline?.logo // Often widely accessible
        });

    } catch (e) {
        console.error(`Flight info fetch failed for ${callsign}:`, e.message);
        res.status(500).json({ error: e.message });
    }
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
});
