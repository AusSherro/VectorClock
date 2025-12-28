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
    // AeroDataBox - API.market (primary) - uses x-api-market-key header
    AERODATABOX_APIMARKET_URL: 'https://prod.api.market/api/v1/aedbx/aerodatabox/flights/number',
    APIMARKET_KEY: 'cmjdywih90001jp0410hdg3z0',
    // AeroDataBox - RapidAPI (fallback)
    AERODATABOX_RAPIDAPI_URL: 'https://aerodatabox.p.rapidapi.com/flights/callsign',
    RAPIDAPI_KEY: 'a71305b666mshcce90ac5542497ep1ce14ajsnbb292b7e6760',
    // Other settings
    DEFAULT_RADIUS: 25, // km
    DEFAULT_INTERVAL: 30, // seconds
    STORAGE_KEY: 'flightTrackerSettings',
    ROUTE_CACHE_KEY: 'flightTrackerRouteCache',
    ROUTE_CACHE_HOURS: 168, // Cache routes for 1 week (7 days * 24h)
    AERODATABOX_FALLBACK_KEY: 'aerodataboxFallbackActive' // Track if using fallback
};

// ICAO airline codes to carrier names
const AIRLINES = {
    // Australian carriers
    'QFA': 'Qantas', 'QJE': 'Qantas', 'QLK': 'Qantas',
    'JST': 'Jetstar', 'JQ': 'Jetstar',
    'VOZ': 'Virgin Australia', 'VA': 'Virgin Australia',
    'REX': 'Rex Airlines', 'ZL': 'Rex Airlines',
    'TGG': 'Tigerair Australia',
    'BNZ': 'Bonza',

    // New Zealand
    'ANZ': 'Air New Zealand', 'NZ': 'Air New Zealand',
    'NZM': 'Mount Cook Airline',

    // Southeast Asia
    'SIA': 'Singapore Airlines', 'SQ': 'Singapore Airlines',
    'TGW': 'Scoot', 'TR': 'Scoot',
    'MAS': 'Malaysia Airlines', 'MH': 'Malaysia Airlines',
    'AXM': 'AirAsia', 'AK': 'AirAsia', 'D7': 'AirAsia X',
    'THA': 'Thai Airways', 'TG': 'Thai Airways',
    'VJC': 'VietJet', 'VJ': 'VietJet',
    'HVN': 'Vietnam Airlines', 'VN': 'Vietnam Airlines',
    'GAR': 'Garuda Indonesia', 'GA': 'Garuda Indonesia',
    'LNI': 'Lion Air', 'JT': 'Lion Air',
    'CEB': 'Cebu Pacific', '5J': 'Cebu Pacific',
    'PAL': 'Philippine Airlines', 'PR': 'Philippine Airlines',
    'RBA': 'Royal Brunei', 'BI': 'Royal Brunei',

    // East Asia
    'CPA': 'Cathay Pacific', 'CX': 'Cathay Pacific',
    'HKE': 'HK Express',
    'JAL': 'Japan Airlines', 'JL': 'Japan Airlines',
    'ANA': 'All Nippon Airways', 'NH': 'ANA',
    'APJ': 'Peach Aviation',
    'JJP': 'Jetstar Japan',
    'KAL': 'Korean Air', 'KE': 'Korean Air',
    'AAR': 'Asiana', 'OZ': 'Asiana',
    'TWB': 'T\'way Air',
    'JNA': 'Jin Air',

    // China
    'CCA': 'Air China', 'CA': 'Air China',
    'CES': 'China Eastern', 'MU': 'China Eastern',
    'CSN': 'China Southern', 'CZ': 'China Southern',
    'CHH': 'Hainan Airlines', 'HU': 'Hainan Airlines',
    'CSZ': 'Shenzhen Airlines', 'ZH': 'Shenzhen Airlines',
    'CXA': 'Xiamen Airlines', 'MF': 'Xiamen Airlines',
    'CDG': 'Shandong Airlines', 'SC': 'Shandong Airlines',
    'CSC': 'Sichuan Airlines', '3U': 'Sichuan Airlines',
    'GCR': 'Grand China Air', 'CN': 'Grand China Air',
    'CQH': 'Spring Airlines', '9C': 'Spring Airlines',
    'DKH': 'Juneyao Airlines', 'HO': 'Juneyao Airlines',
    'CBJ': 'Beijing Capital', 'JD': 'Capital Airlines',
    'LKE': 'Lucky Air', '8L': 'Lucky Air',
    'GDC': 'Grandstar Cargo',

    // Taiwan
    'CAL': 'China Airlines', 'CI': 'China Airlines',
    'EVA': 'EVA Air', 'BR': 'EVA Air',
    'TTW': 'Tigerair Taiwan',
    'SJX': 'Starlux', 'JX': 'Starlux',

    // Middle East
    'UAE': 'Emirates', 'EK': 'Emirates',
    'ETD': 'Etihad', 'EY': 'Etihad',
    'QTR': 'Qatar Airways', 'QR': 'Qatar Airways',
    'GFA': 'Gulf Air', 'GF': 'Gulf Air',
    'SVA': 'Saudia', 'SV': 'Saudia',
    'OMA': 'Oman Air', 'WY': 'Oman Air',
    'ELY': 'El Al', 'LY': 'El Al',
    'THY': 'Turkish Airlines', 'TK': 'Turkish Airlines',

    // South Asia
    'AIC': 'Air India', 'AI': 'Air India',
    'IGO': 'IndiGo', '6E': 'IndiGo',
    'SEJ': 'SpiceJet', 'SG': 'SpiceJet',
    'ALK': 'SriLankan', 'UL': 'SriLankan',

    // Pacific
    'FJI': 'Fiji Airways', 'FJ': 'Fiji Airways',
    'NWC': 'Aircalin', 'SB': 'Aircalin',
    'TPA': 'Air Tahiti', 'VT': 'Air Tahiti',
    'NIG': 'Air Niugini', 'PX': 'Air Niugini',
    'SOL': 'Solomon Airlines', 'IE': 'Solomon Airlines',
    'AVN': 'Air Vanuatu', 'NF': 'Air Vanuatu',

    // Americas
    'AAL': 'American Airlines', 'AA': 'American',
    'UAL': 'United Airlines', 'UA': 'United',
    'DAL': 'Delta Air Lines', 'DL': 'Delta',
    'SWA': 'Southwest', 'WN': 'Southwest',
    'JBU': 'JetBlue', 'B6': 'JetBlue',
    'NKS': 'Spirit', 'NK': 'Spirit',
    'AAY': 'Allegiant', 'G4': 'Allegiant',
    'FFT': 'Frontier', 'F9': 'Frontier',
    'HAL': 'Hawaiian', 'HA': 'Hawaiian',
    'ACA': 'Air Canada', 'AC': 'Air Canada',
    'WJA': 'WestJet', 'WS': 'WestJet',
    'TAM': 'LATAM Brasil', 'JJ': 'LATAM Brasil',
    'LAN': 'LATAM', 'LA': 'LATAM',
    'AVA': 'Avianca', 'AV': 'Avianca',
    'CMP': 'Copa Airlines', 'CM': 'Copa',

    // Europe
    'BAW': 'British Airways', 'BA': 'British Airways',
    'DLH': 'Lufthansa', 'LH': 'Lufthansa',
    'AFR': 'Air France', 'AF': 'Air France',
    'KLM': 'KLM', 'KL': 'KLM',
    'IBE': 'Iberia', 'IB': 'Iberia',
    'AZA': 'ITA Airways', 'AZ': 'ITA Airways',
    'SWR': 'Swiss', 'LX': 'Swiss',
    'AUA': 'Austrian', 'OS': 'Austrian',
    'BEL': 'Brussels Airlines', 'SN': 'Brussels',
    'TAP': 'TAP Portugal', 'TP': 'TAP',
    'SAS': 'SAS', 'SK': 'SAS',
    'FIN': 'Finnair', 'AY': 'Finnair',
    'AEE': 'Aegean', 'A3': 'Aegean',
    'LOT': 'LOT Polish', 'LO': 'LOT',
    'CSA': 'Czech Airlines', 'OK': 'Czech',
    'AFL': 'Aeroflot', 'SU': 'Aeroflot',
    'VIR': 'Virgin Atlantic', 'VS': 'Virgin Atlantic',
    'EZY': 'easyJet', 'U2': 'easyJet',
    'RYR': 'Ryanair', 'FR': 'Ryanair',
    'WZZ': 'Wizz Air', 'W6': 'Wizz Air',
    'VLG': 'Vueling', 'VY': 'Vueling',
    'NAX': 'Norwegian', 'DY': 'Norwegian',
    'ICE': 'Icelandair', 'FI': 'Icelandair',

    // Africa
    'SAA': 'South African', 'SA': 'South African',
    'ETH': 'Ethiopian', 'ET': 'Ethiopian',
    'KQA': 'Kenya Airways', 'KQ': 'Kenya Airways',
    'MSR': 'EgyptAir', 'MS': 'EgyptAir',
    'RAM': 'Royal Air Maroc', 'AT': 'Royal Air Maroc'
};

// ICAO Type Code to Friendly Names
// Now loaded from shared/icao-types.js (included via script tag in HTML)
// This provides ICAO_TYPE_NAMES object and getAircraftName() function

// Rare/Special Aircraft Types (ICAO typecodes)
// Uses startsWith() matching so 'B74' matches B744, B748, etc.
const RARE_AIRCRAFT = [
    // === CLASSIC/RETIRED ===
    'A34',  // Airbus A340 (4-engine classic)
    'MD11', // McDonnell Douglas MD-11
    'DC10', // McDonnell Douglas DC-10
    'L101', // Lockheed L-1011 TriStar
    'CONC', // Concorde (museum only now)

    // === MILITARY - RAAF & Visitors ===
    'C17',  // Boeing C-17 Globemaster III (RAAF has 8)
    'C130', // Lockheed C-130 Hercules (RAAF workhorse)
    'C30J', // C-130J Super Hercules
    'E737', // E-7A Wedgetail (RAAF AEW&C)
    'P8',   // P-8A Poseidon (RAAF maritime patrol)
    'F35',  // F-35 Lightning II
    'FA18', // F/A-18 Hornet
    'F18S', // F/A-18F Super Hornet
    'C5',   // Lockheed C-5 Galaxy (USAF visitor)
    'B52',  // Boeing B-52 Stratofortress
    'KC10', // KC-10 Extender (USAF tanker)
    'KC35', // KC-135 Stratotanker
    'AN12', // Antonov An-12
    'A124', // Antonov An-124 Ruslan (cargo giant)
    'A225', // Antonov An-225 Mriya (RIP - largest ever)

    // === PRIVATE JETS (Fancy) ===
    'GLF6', // Gulfstream G650
    'GL7T', // Gulfstream G700
    'GLEX', // Bombardier Global Express
    'G280', // Gulfstream G280

    // === UNUSUAL/SPECIAL ===
    'A3ST', // Airbus Beluga/Beluga XL
    'HAWK', // BAE Hawk (RAAF trainer)
    'PC21', // Pilatus PC-21 (RAAF trainer)
];


// Special callsign prefixes for Australian operations
// These are detected by callsign, not aircraft type
const SPECIAL_CALLSIGNS = {
    // === MILITARY ===
    'ASY': { name: 'RAAF', category: 'Military', icon: '🎖️' },      // Royal Australian Air Force
    'NAVY': { name: 'RAN', category: 'Military', icon: '⚓' },       // Royal Australian Navy
    'ARMY': { name: 'Army', category: 'Military', icon: '🪖' },     // Australian Army Aviation

    // === POLICE ===
    'POL': { name: 'Police', category: 'Police', icon: '🚔' },       // Victoria Police / Generic
    'POLAIR': { name: 'PolAir', category: 'Police', icon: '🚔' },    // NSW/QLD PolAir
    'FPL': { name: 'Federal Police', category: 'Police', icon: '🚔' }, // Australian Federal Police

    // === EMERGENCY SERVICES ===
    'RSCU': { name: 'Rescue', category: 'Emergency', icon: '🚁' },   // Rescue helicopters
    'AMBUL': { name: 'Ambulance', category: 'Emergency', icon: '🚑' },
    'FIREBIRD': { name: 'Fire', category: 'Emergency', icon: '🔥' }, // CFA/RFS
    'HELITAC': { name: 'Fire', category: 'Emergency', icon: '🔥' },  // Firefighting

    // === COAST GUARD / BORDER ===
    'BORDER': { name: 'Border Force', category: 'Government', icon: '🛂' },
    'AMSA': { name: 'AMSA', category: 'Search & Rescue', icon: '🆘' }, // Maritime Safety

    // === NEWS / MEDIA ===
    'SKY': { name: 'News', category: 'Media', icon: '📺' },          // Sky News choppers
    'NEWS': { name: 'News', category: 'Media', icon: '📺' },

    // === SPECIAL ===
    'LIFESAVER': { name: 'Surf Rescue', category: 'Emergency', icon: '🏖️' },
    'VH-': { name: 'Private', category: 'Private', icon: '✈️' },     // All aussie registered
};

// Significant Squawk Codes (Transponder Codes)
// Emergency codes - VERY important to highlight
const EMERGENCY_SQUAWKS = {
    '7500': { name: 'HIJACK', description: 'Unlawful Interference', priority: 1 },
    '7600': { name: 'RADIO FAIL', description: 'Lost Communications', priority: 2 },
    '7700': { name: 'EMERGENCY', description: 'General Emergency', priority: 1 },
    '7777': { name: 'MIL INTERCEPT', description: 'Military Interception', priority: 1 }
};

// Interesting squawk codes - worth noting but not emergencies
const INTERESTING_SQUAWKS = {
    // Military
    '0000': { name: 'MIL DISCRETE', category: 'Military' },
    '4000': { name: 'MIL OPS', category: 'Military' },

    // Australian CASA Special Codes
    '0017': { name: 'POLICE', category: 'Government' },
    '0021': { name: 'CUSTOMS', category: 'Government' },
    '0100': { name: 'MEDEVAC', category: 'Emergency' },
    '4040': { name: 'MIL TRAINING', category: 'Military' },

    // Common VFR/SAR
    '1200': { name: 'VFR', category: 'General' },
    '1277': { name: 'SAR', category: 'Search & Rescue' }

    // Note: Removed military reserved ranges (44xx, 50xx) as prefix matching
    // was causing false positives on commercial flights
};

const state = {
    location: null,
    settings: {
        radius: CONFIG.DEFAULT_RADIUS,
        interval: CONFIG.DEFAULT_INTERVAL,
        useManualLocation: false,
        manualLat: null,
        manualLon: null,
        apiMode: 'free', // 'free' | 'paid' | 'off'
        clockMode: 'regular', // 'regular' | 'literature' | 'fuzzy' | 'analog'
        hideFlights: false,  // Global setting to hide flight info (default: show)
        // Spotify display settings
        spotifyDisplayMode: 'thumbnail', // 'thumbnail' | 'music'
        spotifyShowAlbumArt: true,
        // Special alerts settings
        specialAlertRadius: 100,    // km - scan radius for military/emergency/VIP
        specialAlertInterval: 120   // seconds - how often to check (2 min default)
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
    partialUpdateCount: 0, // Counter for global refresh (anti-ghosting)
    // Aircraft tracking
    seenModels: new Set(), // Track unique aircraft models we've seen
    apiQuota: { used: 0, limit: 1000, lastReset: null }, // AirLabs quota tracking
    recentlyRecordedFlights: new Map(), // Track recently recorded flights with timestamps (1 hour cooldown)
    // Custom aircraft settings (loaded from server)
    customRareAircraft: [],      // User-defined rare typecodes
    customSpecialCallsigns: {},  // User-defined special callsign patterns
    // ADSB.lol routes (batch-fetched)
    adsbLolRoutes: {},           // { callsign: { origin, destination, fullRoute } }
    // Special alerts (military, emergency, VIP)
    specialAlerts: { military: [], emergency: [], vip: [], lastCheck: 0 }
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

    // Flight display - Above clock
    topInfo: document.getElementById('top-info'),
    callsign: document.getElementById('callsign'),
    carrier: document.getElementById('carrier'),
    aircraft: document.getElementById('aircraft'),
    airlineLogo: document.getElementById('airline-logo'),

    // Flight display - Below clock
    routeInfo: document.getElementById('route-info'),
    route: document.getElementById('route'),

    // Status
    statusIcon: document.getElementById('status-icon'),
    statusText: document.getElementById('status-text'),

    // E-Ink Weather & ISS Header
    weatherHeader: document.getElementById('weather-header'),
    weatherTemp: document.getElementById('weather-temp'),
    weatherIcon: document.getElementById('weather-icon'),
    weatherWind: document.getElementById('weather-wind'),
    issStatus: document.getElementById('iss-status'),

    // Settings (webview.html only)
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
    enableRouteApi: document.getElementById('enable-route-api'),

    // Squawk Badge
    squawkBadge: document.getElementById('squawk-badge'),

    // Features
    weatherAqi: document.getElementById('weather-aqi'),
    binContainer: document.getElementById('bin-container'),
    satelliteBanner: document.getElementById('satellite-banner'),
    satName: document.getElementById('sat-name'),
    satVis: document.getElementById('sat-vis'),
    yearProgressBar: document.getElementById('year-progress-bar'),
    yearProgressText: document.getElementById('year-progress-text'),
    miniClock: document.getElementById('mini-clock'),

    // Spotify Now Playing
    nowPlaying: document.getElementById('now-playing'),
    nowPlayingArt: document.getElementById('now-playing-art'),
    nowPlayingText: document.getElementById('now-playing-text'),
    // Music Mode (large album art)
    musicMode: document.getElementById('music-mode'),
    musicModeArt: document.getElementById('music-mode-art'),
    musicModeTrack: document.getElementById('music-mode-track'),
    musicModeArtist: document.getElementById('music-mode-artist'),

    // Literature Clock
    regularClock: document.getElementById('regular-clock'),
    litClock: document.getElementById('lit-clock'),
    litQuote: document.getElementById('lit-quote'),
    litAttribution: document.getElementById('lit-attribution'),

    // Fuzzy Clock
    fuzzyClock: document.getElementById('fuzzy-clock'),
    fuzzyTime: document.getElementById('fuzzy-time'),
    fuzzyDate: document.getElementById('fuzzy-date'),

    // Analog Clock
    analogClock: document.getElementById('analog-clock'),
    analogSvg: document.getElementById('analog-svg'),
    analogDate: document.getElementById('analog-date'),
    hourHand: document.getElementById('hour-hand'),
    minuteHand: document.getElementById('minute-hand')
};

// ==========================================
// Clock Functions
// ==========================================

/**
 * Hide all clock modes - utility function
 */
function hideAllClockModes() {
    if (elements.regularClock) elements.regularClock.classList.add('hidden');
    if (elements.litClock) elements.litClock.classList.add('hidden');
    if (elements.fuzzyClock) elements.fuzzyClock.classList.add('hidden');
    if (elements.analogClock) elements.analogClock.classList.add('hidden');
}

/**
 * Convert time to fuzzy/natural language string
 */
function getFuzzyTime(hours, minutes) {
    const hourNames = [
        'twelve', 'one', 'two', 'three', 'four', 'five',
        'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'
    ];

    // Round to nearest 5 minutes for fuzzy display
    const roundedMinutes = Math.round(minutes / 5) * 5;
    let displayHour = hours % 12;
    let nextHour = (hours + 1) % 12;

    // Handle the rounding pushing us to the next hour
    let effectiveMinutes = roundedMinutes;
    if (roundedMinutes === 60) {
        effectiveMinutes = 0;
        displayHour = nextHour;
        nextHour = (nextHour + 1) % 12;
    }

    const currentHourName = hourNames[displayHour === 0 ? 12 : displayHour];
    const nextHourName = hourNames[nextHour === 0 ? 12 : nextHour];

    // Generate fuzzy time string
    if (effectiveMinutes === 0) {
        if (hours === 0 || hours === 24) return "midnight";
        if (hours === 12) return "noon";
        return `${currentHourName} o'clock`;
    } else if (effectiveMinutes === 5) {
        return `five past ${currentHourName}`;
    } else if (effectiveMinutes === 10) {
        return `ten past ${currentHourName}`;
    } else if (effectiveMinutes === 15) {
        return `quarter past ${currentHourName}`;
    } else if (effectiveMinutes === 20) {
        return `twenty past ${currentHourName}`;
    } else if (effectiveMinutes === 25) {
        return `twenty-five past ${currentHourName}`;
    } else if (effectiveMinutes === 30) {
        return `half past ${currentHourName}`;
    } else if (effectiveMinutes === 35) {
        return `twenty-five to ${nextHourName}`;
    } else if (effectiveMinutes === 40) {
        return `twenty to ${nextHourName}`;
    } else if (effectiveMinutes === 45) {
        return `quarter to ${nextHourName}`;
    } else if (effectiveMinutes === 50) {
        return `ten to ${nextHourName}`;
    } else if (effectiveMinutes === 55) {
        return `five to ${nextHourName}`;
    }

    return `${currentHourName} o'clock`;
}

/**
 * Update analog clock hands position
 */
function updateAnalogClock(hours, minutes) {
    if (!elements.hourHand || !elements.minuteHand) return;

    // Calculate angles
    const minuteAngle = (minutes / 60) * 360;
    const hourAngle = ((hours % 12) / 12) * 360 + (minutes / 60) * 30;

    // Apply transforms (rotate around center point 100,100)
    elements.minuteHand.setAttribute('transform', `rotate(${minuteAngle}, 100, 100)`);
    elements.hourHand.setAttribute('transform', `rotate(${hourAngle}, 100, 100)`);
}

/**
 * Initialize analog clock hour markers (called once on load)
 */
function initAnalogClockMarkers() {
    const markersGroup = document.getElementById('hour-markers');
    if (!markersGroup || markersGroup.children.length > 0) return;

    for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * 360 - 90; // Start at 12 o'clock
        const radian = (angle * Math.PI) / 180;

        // Calculate marker positions (inner and outer points)
        const innerRadius = 80;
        const outerRadius = 88;
        const x1 = 100 + innerRadius * Math.cos(radian);
        const y1 = 100 + innerRadius * Math.sin(radian);
        const x2 = 100 + outerRadius * Math.cos(radian);
        const y2 = 100 + outerRadius * Math.sin(radian);

        // Create marker line
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        marker.setAttribute('x1', x1);
        marker.setAttribute('y1', y1);
        marker.setAttribute('x2', x2);
        marker.setAttribute('y2', y2);
        marker.setAttribute('stroke', '#000');
        marker.setAttribute('stroke-width', i % 3 === 0 ? '3' : '1'); // Thicker at 12, 3, 6, 9
        markersGroup.appendChild(marker);
    }
}

function updateClock() {
    const now = new Date();

    const hours = now.getHours();
    const minutes = now.getMinutes();
    const hoursStr = String(hours).padStart(2, '0');
    const minutesStr = String(minutes).padStart(2, '0');
    const currentMinute = `${hoursStr}:${minutesStr}`;

    // Check if minute actually changed (optimization)
    const minuteChanged = currentMinute !== state.lastMinute;

    // E-Ink Mode: Only update when minutes change (partial update)
    if (isEinkMode && !minuteChanged) {
        return; // Skip update - nothing changed
    }

    state.lastMinute = currentMinute;

    // Format date (used by all modes except literature)
    const dateOptions = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
    const dateStr = now.toLocaleDateString('en-AU', dateOptions);

    // Handle clock modes
    const clockMode = state.settings.clockMode || 'regular';

    // Hide all clock modes first
    hideAllClockModes();

    switch (clockMode) {
        case 'literature':
            if (elements.litClock) {
                elements.litClock.classList.remove('hidden');
                if (minuteChanged) {
                    fetchAndDisplayLiteratureQuote(currentMinute);
                }
            }
            break;

        case 'fuzzy':
            if (elements.fuzzyClock) {
                elements.fuzzyClock.classList.remove('hidden');
                if (elements.fuzzyTime) {
                    elements.fuzzyTime.textContent = getFuzzyTime(hours, minutes);
                }
                if (elements.fuzzyDate) {
                    elements.fuzzyDate.textContent = dateStr;
                }
            }
            break;

        case 'analog':
            if (elements.analogClock) {
                elements.analogClock.classList.remove('hidden');
                initAnalogClockMarkers(); // Ensure markers are drawn
                updateAnalogClock(hours, minutes);
                if (elements.analogDate) {
                    elements.analogDate.textContent = dateStr;
                }
            }
            break;

        case 'regular':
        default:
            if (elements.regularClock) {
                elements.regularClock.classList.remove('hidden');

                // Update digital time
                if (isEinkMode) {
                    elements.time.textContent = currentMinute;
                } else {
                    const seconds = String(now.getSeconds()).padStart(2, '0');
                    elements.time.textContent = `${hoursStr}:${minutesStr}:${seconds}`;
                }

                // Format date
                elements.date.textContent = dateStr;
            }
            break;
    }

    // E-Ink refresh counter (anti-ghosting)
    if (isEinkMode && minuteChanged) {
        state.partialUpdateCount++;

        if (state.partialUpdateCount >= EINK_CONFIG.GLOBAL_REFRESH_INTERVAL) {
            console.log(`Global refresh triggered after ${state.partialUpdateCount} partial updates`);
            state.partialUpdateCount = 0;
            window.location.reload();
            return;
        }

        console.log(`Partial update ${state.partialUpdateCount}/${EINK_CONFIG.GLOBAL_REFRESH_INTERVAL}`);
    }

    // Update Year Progress (client-side)
    updateYearProgress();

    // Check Bin Day logic
    checkBinDay();
}

// Literature clock quote cache
let litClockCache = { time: null, quote: null };

/**
 * Fetch and display a literary quote for the given time
 */
async function fetchAndDisplayLiteratureQuote(time) {
    if (!elements.litQuote || !elements.litAttribution) return;

    // Use cached quote if same minute
    if (litClockCache.time === time && litClockCache.quote) {
        displayLiteratureQuote(litClockCache.quote);
        return;
    }

    try {
        const response = await fetch(`/api/litclock/${time}`);

        if (!response.ok) {
            // Show fallback on error
            elements.litQuote.innerHTML = `<span class="lit-highlight">${time}</span>`;
            elements.litAttribution.textContent = '';
            return;
        }

        const quote = await response.json();

        // Cache the quote
        litClockCache = { time, quote };

        displayLiteratureQuote(quote);

    } catch (error) {
        console.error('Literature clock fetch error:', error);
        // Show time as fallback
        elements.litQuote.innerHTML = `<span class="lit-highlight">${time}</span>`;
        elements.litAttribution.textContent = '';
    }
}

/**
 * Display a literature quote with highlighted time
 */
function displayLiteratureQuote(quote) {
    if (!elements.litQuote || !elements.litAttribution) return;

    // Build quote HTML with highlighted time
    const quoteHtml =
        escapeHtml(quote.quote_before) +
        `<span class="lit-highlight">${escapeHtml(quote.quote_highlight)}</span>` +
        escapeHtml(quote.quote_after);

    elements.litQuote.innerHTML = `"${quoteHtml}"`;

    // Build attribution
    elements.litAttribution.innerHTML =
        `— <span class="lit-title">${escapeHtml(quote.title)}</span> by <span class="lit-author">${escapeHtml(quote.author)}</span>`;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==========================================
// Weather & ISS Functions (E-Ink Mode)
// ==========================================

async function fetchAndDisplayWeather() {
    console.log('fetchAndDisplayWeather called, weatherTemp element:', elements.weatherTemp);
    // Only fetch if we have the weather header elements
    if (!elements.weatherTemp) {
        console.warn('weatherTemp element not found, skipping weather update');
        return;
    }

    try {
        const response = await fetch('/api/weather');
        if (!response.ok) throw new Error('Weather API error');

        const data = await response.json();
        state.weather = data;

        // Update display: Icon, Temp (with feels like), Humidity, Rain, AQI
        if (elements.weatherIcon) {
            elements.weatherIcon.textContent = data.icon || '○';
        }

        // Temperature with optional feels like
        if (elements.weatherTemp) {
            if (data.feelsLike && data.feelsLike !== data.temp) {
                elements.weatherTemp.textContent = `${data.temp}°C (${data.feelsLike}°)`;
            } else {
                elements.weatherTemp.textContent = `${data.temp}°C`;
            }
        }

        // Humidity and Rain display in weather-rain element
        const rainEl = document.getElementById('weather-rain');
        if (rainEl) {
            const parts = [];
            if (data.humidity !== null && data.humidity !== undefined) {
                parts.push(`${data.humidity}%`);
            }
            if (data.rainSince9am !== null && data.rainSince9am > 0) {
                parts.push(`${data.rainSince9am}mm`);
            }
            rainEl.textContent = parts.join(' · ');
        }

        // AQI Display
        if (elements.weatherAqi) {
            if (data.aqi !== null && data.aqi !== undefined) {
                elements.weatherAqi.textContent = `AQI ${data.aqi}`;
                elements.weatherAqi.style.display = 'inline-block';
            } else {
                elements.weatherAqi.style.display = 'none';
            }
        }

        const source = data.source || 'unknown';
        console.log(`Weather updated (${source}): ${data.temp}°C, Feels: ${data.feelsLike}°C, Humidity: ${data.humidity}%, Rain: ${data.rainSince9am || 0}mm, AQI: ${data.aqi}`);

    } catch (error) {
        console.error('Weather fetch error:', error);
        if (elements.weatherTemp) {
            elements.weatherTemp.textContent = '--°C';
        }
    }
}

// Bin Day Logic
// Reference: Dec 24 2025 (Wed) is Recycling (Yellow)
const BIN_REF_DATE = new Date('2025-12-24T00:00:00');
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

function checkBinDay() {
    if (!elements.binContainer) return;

    const now = new Date();
    const day = now.getDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed...
    const hour = now.getHours();

    // Show bin icon from Tue 4PM (16:00) until Wed 2PM (14:00)
    // 2=Tuesday, 3=Wednesday
    const isBinTime = (day === 2 && hour >= 16) || (day === 3 && hour < 14);

    if (isBinTime) {
        elements.binContainer.classList.remove('hidden');

        let diffTime = now.getTime() - BIN_REF_DATE.getTime();
        // If it's Tuesday, we are looking at tomorrow's bin cycle
        if (day === 2) diffTime += 24 * 60 * 60 * 1000;

        const weeksDiff = Math.floor(diffTime / MS_PER_WEEK);
        const isRecycling = (weeksDiff % 2 === 0);

        const binColor = isRecycling ? '#FFD700' : '#DC143C'; // Gold or Crimson
        const letter = isRecycling ? 'Y' : 'R';

        // Simplified bin icons - CSS controls sizing via #bin-container svg rule
        elements.binContainer.innerHTML = `
            <!-- FOGO (Green) - Always present -->
            <svg viewBox="0 0 24 32">
              <rect x="2" y="8" width="20" height="22" rx="2" fill="none" stroke="black" stroke-width="2"/>
              <path d="M6 8 L8 4 H16 L18 8" fill="none" stroke="black" stroke-width="2"/>
              <text x="12" y="22" font-size="10" text-anchor="middle" fill="black" font-weight="bold">G</text>
            </svg>
            <!-- Variable (Yellow/Red) -->
            <svg viewBox="0 0 24 32">
              <rect x="2" y="8" width="20" height="22" rx="2" fill="${binColor}" stroke="black" stroke-width="2"/>
              <path d="M6 8 L8 4 H16 L18 8" fill="${binColor}" stroke="black" stroke-width="2"/>
              <text x="12" y="22" font-size="10" text-anchor="middle" fill="white" font-weight="bold">${letter}</text>
            </svg>
            <span class="bin-label">BIN</span>
        `;

    } else {
        elements.binContainer.classList.add('hidden');
    }
}

// Year Progress
function updateYearProgress() {
    if (!elements.yearProgressBar) return;

    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now - start;
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    const totalDays = (now.getFullYear() % 4 === 0) ? 366 : 365;

    const percent = ((dayOfYear / totalDays) * 100).toFixed(1);

    elements.yearProgressBar.style.width = `${percent}%`;
    if (elements.yearProgressText) {
        elements.yearProgressText.textContent = `${now.getFullYear()}: ${Math.floor(percent)}%`;
    }
}

// ==========================================
// Spotify Now Playing
// ==========================================

async function fetchAndDisplayNowPlaying() {
    // Fetch spotify display settings first
    try {
        const settingsRes = await fetch('/api/config/spotify-display');
        if (settingsRes.ok) {
            const settingsData = await settingsRes.json();
            state.settings.spotifyDisplayMode = settingsData.displayMode || 'thumbnail';
            state.settings.spotifyShowAlbumArt = settingsData.showAlbumArt !== false;
        }
    } catch (e) {
        // Use defaults
    }

    // Fetch global hide flights setting
    try {
        const hideFlightsRes = await fetch('/api/config/hide-flights');
        if (hideFlightsRes.ok) {
            const hideFlightsData = await hideFlightsRes.json();
            state.settings.hideFlights = hideFlightsData.hideFlights === true;
        }
    } catch (e) {
        // Use defaults
    }

    try {
        const response = await fetch('/api/spotify/now-playing');
        if (!response.ok) {
            hideNowPlaying();
            return;
        }

        const data = await response.json();

        if (data.playing && data.track && data.artist) {
            const showArt = state.settings.spotifyShowAlbumArt && data.albumArt;

            // MUSIC MODE: Large album art replaces clock
            if (state.settings.spotifyDisplayMode === 'music' && showArt) {
                // Hide regular clock/lit clock
                if (elements.regularClock) elements.regularClock.classList.add('hidden');
                if (elements.litClock) elements.litClock.classList.add('hidden');

                // Show music mode
                if (elements.musicMode) {
                    elements.musicMode.classList.remove('hidden');
                    if (elements.musicModeArt) elements.musicModeArt.src = data.albumArt;
                    if (elements.musicModeTrack) elements.musicModeTrack.textContent = data.track;
                    if (elements.musicModeArtist) elements.musicModeArtist.textContent = data.artist;
                }

                // Hide thumbnail now-playing bar
                if (elements.nowPlaying) elements.nowPlaying.classList.add('hidden');

                // Show mini clock in header
                if (elements.miniClock) {
                    const now = new Date();
                    const hours = String(now.getHours()).padStart(2, '0');
                    const minutes = String(now.getMinutes()).padStart(2, '0');
                    elements.miniClock.textContent = `${hours}:${minutes}`;
                    elements.miniClock.classList.remove('hidden');
                }

                // Conditionally hide/show top flight info based on global setting
                if (state.settings.hideFlights) {
                    if (elements.topInfo) elements.topInfo.classList.add('hidden');
                }

            } else {
                // THUMBNAIL MODE: Small art in now-playing bar
                // Restore clock visibility (based on clock mode)
                if (elements.musicMode) elements.musicMode.classList.add('hidden');
                if (elements.miniClock) elements.miniClock.classList.add('hidden');

                hideAllClockModes();
                const clockMode = state.settings.clockMode || 'regular';
                switch (clockMode) {
                    case 'literature':
                        if (elements.litClock) elements.litClock.classList.remove('hidden');
                        break;
                    case 'fuzzy':
                        if (elements.fuzzyClock) elements.fuzzyClock.classList.remove('hidden');
                        break;
                    case 'analog':
                        if (elements.analogClock) elements.analogClock.classList.remove('hidden');
                        break;
                    case 'regular':
                    default:
                        if (elements.regularClock) elements.regularClock.classList.remove('hidden');
                        break;
                }

                // Show now-playing bar with thumbnail
                if (elements.nowPlaying) {
                    elements.nowPlaying.classList.remove('hidden');
                    if (elements.nowPlayingText) {
                        elements.nowPlayingText.textContent = `${data.artist} — ${data.track}`;
                    }

                    // Display album art thumbnail if available
                    if (elements.nowPlayingArt && showArt) {
                        elements.nowPlayingArt.src = data.albumArt;
                        elements.nowPlayingArt.classList.remove('hidden');
                    } else if (elements.nowPlayingArt) {
                        elements.nowPlayingArt.classList.add('hidden');
                    }
                }
            }
        } else {
            // Nothing playing - hide everything and restore clock
            hideNowPlaying();
        }
    } catch (e) {
        // Silently hide on error (Spotify not configured)
        hideNowPlaying();
    }
}

// Helper to hide now playing and restore normal display
function hideNowPlaying() {
    // Hide music mode
    if (elements.musicMode) elements.musicMode.classList.add('hidden');

    // Hide now playing bar
    if (elements.nowPlaying) elements.nowPlaying.classList.add('hidden');
    if (elements.nowPlayingArt) elements.nowPlayingArt.classList.add('hidden');

    // Hide mini clock
    if (elements.miniClock) elements.miniClock.classList.add('hidden');

    // Restore clock visibility (based on clock mode)
    hideAllClockModes();
    const clockMode = state.settings.clockMode || 'regular';
    switch (clockMode) {
        case 'literature':
            if (elements.litClock) elements.litClock.classList.remove('hidden');
            break;
        case 'fuzzy':
            if (elements.fuzzyClock) elements.fuzzyClock.classList.remove('hidden');
            break;
        case 'analog':
            if (elements.analogClock) elements.analogClock.classList.remove('hidden');
            break;
        case 'regular':
        default:
            if (elements.regularClock) elements.regularClock.classList.remove('hidden');
            break;
    }

    // Note: Flight info visibility is handled by displayFlight() separately
}

async function fetchAndDisplaySatellite() {
    // If banner element exists, we can show alerts
    if (!elements.satelliteBanner) return;

    try {
        const response = await fetch('/api/satellite');
        const data = await response.json();

        if (data && data.start) {
            // Check if pass is coming up soon (e.g. within 2 hours)
            const startTime = data.start * 1000;
            const now = Date.now();
            const timeDiff = startTime - now;

            // Show if within 90 mins and not passed
            if (timeDiff > 0 && timeDiff < 90 * 60 * 1000) {
                elements.satelliteBanner.classList.remove('hidden');
                if (elements.satName) elements.satName.textContent = data.name || 'SATELLITE';

                const mins = Math.floor(timeDiff / 60000);
                if (elements.satVis) elements.satVis.textContent = `Visual Pass in ${mins}m (Mag ${data.mag})`;
                return; // Shown satellite, skip ISS
            }
        }

        // If no satellite alert, try ISS fallback
        elements.satelliteBanner.classList.add('hidden');
        fetchAndDisplayISS();

    } catch (e) {
        console.error('Sat fetch error:', e);
        fetchAndDisplayISS();
    }
}

async function fetchAndDisplayISS() {
    // Only fetch if we have the ISS header element (E-Ink mode) - OR simple fallback
    // We are using the satellite banner for generic alerts now.
    // But existing ISS code uses elements.issStatus for the header

    if (elements.issStatus) {
        try {
            const response = await fetch('/api/iss');
            if (!response.ok) throw new Error('ISS API error');

            const data = await response.json();
            state.iss = data;

            // Update Header Display
            if (data.visible) {
                elements.issStatus.textContent = 'ISS: OVERHEAD ✦';
                elements.issStatus.classList.add('iss-visible');
            } else {
                elements.issStatus.textContent = `ISS: ${data.distance}km`;
                elements.issStatus.classList.remove('iss-visible');
            }

            // Also update banner if generic satellite alert failed
            // Only if visible
            if (data.visible && elements.satelliteBanner && elements.satelliteBanner.classList.contains('hidden')) {
                elements.satelliteBanner.classList.remove('hidden');
                if (elements.satName) elements.satName.textContent = 'ISS';
                if (elements.satVis) elements.satVis.textContent = `OVERHEAD (${data.distance}km)`;
            }

        } catch (error) {
            console.error('ISS fetch error:', error);
            if (elements.issStatus) elements.issStatus.textContent = 'ISS: --';
        }
    }
}

// Start weather and ISS updates for E-Ink mode
function startEinkUpdates() {
    // Removed E-Ink only guard - these features should work on webview.html too

    // Initial fetch
    fetchAndDisplayWeather();
    fetchAndDisplaySatellite();
    fetchAndDisplayNowPlaying();
    checkBinDay();
    updateYearProgress();

    // Weather updates every 10 minutes
    setInterval(fetchAndDisplayWeather, 10 * 60 * 1000);

    // Satellite updates every 5 mins
    setInterval(fetchAndDisplaySatellite, 5 * 60 * 1000);

    // Spotify Now Playing updates every 10 seconds
    setInterval(fetchAndDisplayNowPlaying, 10 * 1000);

    // Bin Day check every hour
    setInterval(checkBinDay, 60 * 60 * 1000);

    console.log('E-Ink updates started: Weather (10m), Sat (5m), Spotify (10s)');
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

// Record flight sighting to stats database
async function recordFlightSighting(flight, routeInfo = null) {
    try {
        const data = {
            callsign: flight.callsign,
            distance: flight.distance,
            altitude: flight.altitude
        };

        // Add route info if available
        if (routeInfo && !routeInfo.notFound) {
            if (routeInfo.carrier || routeInfo.airline) data.carrier = routeInfo.carrier || routeInfo.airline;
            if (routeInfo.departure && routeInfo.arrival) data.route = `${routeInfo.departure} → ${routeInfo.arrival}`;
            // Use the full aircraft name if possible
            const typeCode = routeInfo.aircraft || flight.aircraft || flight.typecode;
            data.aircraft = getAircraftName(typeCode);
        } else {
            // Basic lookup without route info
            const typeCode = flight.aircraft || flight.typecode;
            data.aircraft = getAircraftName(typeCode);
        }

        await fetch('/api/stats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } catch (e) {
        console.log('Stats recording failed:', e);
    }
}



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

    // CHECK SETTING: Is Route API enabled?
    if (state.settings.apiMode === 'off') {
        return null;
    }



    // Clean callsign (remove spaces)
    const cleanCallsign = callsign.trim().replace(/\s+/g, '');
    if (!cleanCallsign || cleanCallsign === 'Unknown') return null;

    // Quiet Hours: Block API calls between 23:00 and 05:00
    const hour = new Date().getHours();
    if (hour >= 23 || hour < 5) {
        return null;
    }

    // ==========================================
    // FREE MODE: Use server's /api/flight-info (AirLabs)
    // ==========================================
    if (state.settings.apiMode === 'free') {
        console.log(`[AirLabs] Calling /api/flight-info/${cleanCallsign}...`);
        try {
            const response = await fetch(`/api/flight-info/${cleanCallsign}`);
            if (response.ok) {
                const data = await response.json();
                console.log(`[AirLabs] Response for ${cleanCallsign}:`, data);
                if (data && !data.notFound && !data.error) {
                    const route = {
                        departure: data.origin,
                        arrival: data.destination,
                        airline: data.airline || null,
                        aircraft: data.aircraft || null,
                        source: 'airlabs'
                    };
                    routeCache.set(callsign, route);
                    console.log(`[AirLabs] ✓ Route found for ${callsign} (${data.origin} → ${data.destination})`);
                    return route;
                } else {
                    // Cache negative result
                    routeCache.set(callsign, { notFound: true });
                    console.log(`[AirLabs] Flight ${cleanCallsign} not found in AirLabs database`);
                    return null;
                }
            }
        } catch (e) {
            console.log('[AirLabs] Route lookup failed:', e);
        }
        return null;
    }

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
                'accept': 'application/json',
                'x-api-market-key': CONFIG.APIMARKET_KEY
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
                aircraft: flight.aircraft?.model || null,
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

/**
 * Batch-fetch routes from ADSB.lol (free, no rate limits!)
 * Routes are stored in state.adsbLolRoutes and used by displayCurrentFlight
 */
async function fetchAdsbLolRoutes(flights) {
    if (!flights || flights.length === 0) return;

    try {
        // Prepare planes array for ADSB.lol API
        const planes = flights
            .filter(f => f.callsign && f.callsign !== 'Unknown' && f.latitude && f.longitude)
            .map(f => ({
                callsign: f.callsign.trim(),
                lat: f.latitude,
                lng: f.longitude
            }));

        if (planes.length === 0) return;

        console.log(`→ Fetching routes for ${planes.length} aircraft from ADSB.lol...`);

        const response = await fetch('/api/adsblol-routes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ planes })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.routes) {
                state.adsbLolRoutes = data.routes;
                const routeCount = Object.keys(data.routes).length;
                console.log(`✓ ADSB.lol: Got ${routeCount} routes`);

                // Re-display current flight with new route data
                if (state.flights.length > 0) {
                    displayCurrentFlight();
                }
            }
        }
    } catch (e) {
        console.log('ADSB.lol route fetch failed:', e.message);
    }
}

/**
 * Check for special aircraft (military, emergency, VIP) using ADSB.lol endpoints
 * Called periodically based on specialAlertInterval setting
 */
async function fetchSpecialAlerts() {
    if (!state.location) return;

    // Check based on configurable interval (in seconds)
    const intervalMs = (state.settings.specialAlertInterval || 120) * 1000;
    const now = Date.now();
    if (now - state.specialAlerts.lastCheck < intervalMs) return;
    state.specialAlerts.lastCheck = now;

    try {
        const range = state.settings.specialAlertRadius || 100;
        const response = await fetch(
            `/api/special-alerts?lat=${state.location.latitude}&lon=${state.location.longitude}&range=${range}`
        );

        if (response.ok) {
            const data = await response.json();

            // Clear previous alerts
            state.specialAlerts.military = data.military || [];
            state.specialAlerts.emergency = data.emergency || [];
            state.specialAlerts.vip = data.vip || [];

            // Log any nearby interesting aircraft
            if (data.military?.length > 0) {
                console.log(`🎖️ MILITARY nearby: ${data.military.map(a => `${a.callsign} (${a.type}) ${a.distance}km`).join(', ')}`);
            }

            if (data.emergency?.length > 0) {
                console.log(`🚨 EMERGENCY nearby: ${data.emergency.map(a => `${a.callsign} squawk ${a.squawk} ${a.distance}km`).join(', ')}`);
            }

            if (data.vip?.length > 0) {
                console.log(`✨ VIP/PRIVATE nearby: ${data.vip.map(a => `${a.callsign} (${a.type}) ${a.distance}km`).join(', ')}`);
            }

            // Update special alert banner
            updateSpecialAlertBanner();
        }
    } catch (e) {
        console.log('Special alerts check failed:', e.message);
    }
}

/**
 * Update the special alert banner display
 */
function updateSpecialAlertBanner() {
    const banner = document.getElementById('special-alert-banner');
    if (!banner) return;

    const alerts = state.specialAlerts;
    const hasAlerts = alerts.military.length > 0 || alerts.emergency.length > 0 || alerts.vip.length > 0;

    if (!hasAlerts) {
        banner.classList.add('hidden');
        return;
    }

    // Build banner text - prioritize emergencies
    let icon = '✨';
    let text = '';

    if (alerts.emergency.length > 0) {
        icon = '🚨';
        const e = alerts.emergency[0];
        text = `EMERGENCY ${e.callsign} ${e.distance}km`;
    } else if (alerts.military.length > 0) {
        icon = '🎖️';
        const m = alerts.military[0];
        text = `MIL ${m.callsign} (${m.type}) ${m.distance}km`;
    } else if (alerts.vip.length > 0) {
        icon = '✨';
        const v = alerts.vip[0];
        text = `VIP ${v.type} ${v.distance}km`;
    }

    banner.innerHTML = `<span class="alert-icon">${icon}</span> ${text}`;
    banner.classList.remove('hidden');

    // Add emergency class for styling
    if (alerts.emergency.length > 0) {
        banner.classList.add('emergency');
    } else {
        banner.classList.remove('emergency');
    }
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
                    verticalRate: s[11],
                    squawk: s[14] || null,         // Transponder code (e.g., 7700, 1200)
                    // ADSB.lol bonus fields (not in OpenSky)
                    typecode: s[17] || null,       // Aircraft type (e.g., B738, A388)
                    registration: s[18] || null     // Registration (e.g., VH-OQD)
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

                // Batch-fetch routes from ADSB.lol (free, no rate limits!)
                fetchAdsbLolRoutes(state.flights);

                // Check for special aircraft (military, emergency, VIP)
                fetchSpecialAlerts();

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

/**
 * Check if a squawk code is significant (emergency or interesting)
 * @param {string} squawk - The transponder code
 * @returns {object|null} - { type: 'emergency'|'interesting', name, description } or null
 */
function getSquawkInfo(squawk) {
    if (!squawk) return null;

    // Check emergency codes first (highest priority)
    if (EMERGENCY_SQUAWKS[squawk]) {
        const info = EMERGENCY_SQUAWKS[squawk];
        console.log(`🚨 EMERGENCY SQUAWK: ${squawk} (${info.name})`);
        return { type: 'emergency', ...info };
    }

    // Check exact match interesting codes
    if (INTERESTING_SQUAWKS[squawk]) {
        return { type: 'interesting', ...INTERESTING_SQUAWKS[squawk] };
    }

    return null;
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
    if (elements.aircraft) elements.aircraft.textContent = '';

    // Show top info section
    elements.topInfo.classList.remove('hidden');

    // Hide route initially (will show if data available)
    if (elements.routeInfo) elements.routeInfo.classList.add('hidden');
    if (elements.route) elements.route.textContent = '';

    // Show logo
    if (elements.airlineLogo) {
        elements.airlineLogo.src = `/api/logo/${airlineCode}?v=${Date.now()}`;
        elements.airlineLogo.style.display = 'block';
        elements.airlineLogo.onerror = () => { elements.airlineLogo.style.display = 'none'; };
    }

    // Year progress bar stays visible now


    // ==========================================
    // SQUAWK CODE DISPLAY
    // Show special squawk codes (emergency, military, CASA)
    // ==========================================
    if (elements.squawkBadge) {
        const squawkInfo = getSquawkInfo(flight.squawk);
        if (squawkInfo) {
            elements.squawkBadge.textContent = `⚡ ${squawkInfo.name}`;
            elements.squawkBadge.className = squawkInfo.type; // 'emergency' or 'interesting'
            elements.squawkBadge.classList.remove('hidden');
            console.log(`✓ Squawk ${flight.squawk}: ${squawkInfo.name} (${squawkInfo.type})`);
        } else {
            elements.squawkBadge.classList.add('hidden');
        }
    }

    // ==========================================
    // AIRCRAFT MODEL LOOKUP
    // Priority: 1. ADSB.lol data (if available), 2. Local DB
    // ==========================================
    let displayModel = '';
    let typecode = flight.typecode; // From ADSB.lol (null for OpenSky)
    let registration = flight.registration;

    if (typecode && elements.aircraft) {
        // ADSB.lol provides typecode directly - use it!
        displayModel = ICAO_TYPE_NAMES[typecode] || typecode;

        // Check if this is a NEW model we haven't seen before
        const isFirstSighting = typecode && !state.seenModels.has(typecode);

        if (isFirstSighting) {
            state.seenModels.add(typecode);
            elements.aircraft.textContent = `NEW★ ${displayModel}`;
            elements.aircraft.style.fontWeight = '900';
            console.log(`🆕 First time seeing: ${typecode} (${displayModel}) [ADSB.lol]`);
        } else {
            elements.aircraft.textContent = displayModel;
            elements.aircraft.style.fontWeight = '700';
        }
        console.log(`✓ ADSB.lol direct: ${flight.callsign} → ${displayModel} (${typecode})`);
    } else if (flight.icao24 && elements.aircraft) {
        // Fallback to local DB (for OpenSky or when ADSB.lol doesn't have typecode)
        try {
            const localResponse = await fetch(`/api/aircraft-meta/${flight.icao24}`);
            if (localResponse.ok) {
                const localAircraftData = await localResponse.json();
                if (localAircraftData.found) {
                    // Show manufacturer + model from local DB
                    displayModel = localAircraftData.manufacturer
                        ? `${localAircraftData.manufacturer} ${localAircraftData.model}`.trim()
                        : localAircraftData.model || '';
                    typecode = localAircraftData.typecode;

                    if (displayModel) {
                        // Check if this is a NEW model we haven't seen before
                        const modelKey = typecode || localAircraftData.model;
                        const isFirstSighting = modelKey && !state.seenModels.has(modelKey);

                        if (isFirstSighting) {
                            state.seenModels.add(modelKey);
                            elements.aircraft.textContent = `NEW★ ${displayModel}`;
                            elements.aircraft.style.fontWeight = '900';
                            console.log(`🆕 First time seeing: ${modelKey} (${displayModel}) [LocalDB]`);
                        } else {
                            elements.aircraft.textContent = displayModel;
                            elements.aircraft.style.fontWeight = '700';
                        }
                        console.log(`✓ Local DB: ${flight.icao24} → ${displayModel}`);
                    }

                    // Use operator from local DB if no carrier found
                    if (localAircraftData.operator && carrier === flight.originCountry) {
                        elements.carrier.textContent = localAircraftData.operator;
                    }
                }
            }
        } catch (e) {
            console.log('Local aircraft lookup failed:', e);
        }
    }

    // ==========================================
    // ROUTE DISPLAY
    // Priority: 1. ADSB.lol routes (batch-fetched), 2. Existing route API
    // ==========================================

    // Check ADSB.lol routes first (already batch-fetched, free, no rate limits)
    const adsbLolRoute = state.adsbLolRoutes[flight.callsign];
    if (adsbLolRoute && adsbLolRoute.origin && adsbLolRoute.destination) {
        // Use city names if available, fallback to IATA codes
        const originDisplay = adsbLolRoute.originName || adsbLolRoute.origin;
        const destDisplay = adsbLolRoute.destinationName || adsbLolRoute.destination;

        if (elements.route) elements.route.textContent = `${originDisplay} → ${destDisplay}`;
        if (elements.routeInfo) elements.routeInfo.classList.remove('hidden');
        console.log(`✓ ADSB.lol route: ${flight.callsign} → ${originDisplay} → ${destDisplay}`);
        recordFlightSighting(flight, { departure: adsbLolRoute.origin, arrival: adsbLolRoute.destination });
    }
    // Fallback to existing route API (AirLabs/API.market) if no ADSB.lol route
    else if (state.settings.apiMode === 'free' || state.settings.apiMode === 'paid') {
        try {
            const routeInfo = await fetchFlightRoute(flight.callsign);
            if (routeInfo && !routeInfo.notFound) {
                // Update carrier from API if available (more accurate)
                if (routeInfo.airline) {
                    elements.carrier.textContent = routeInfo.airline;
                }

                // Only update aircraft from API if local DB didn't have it
                if (!localAircraftData?.found && routeInfo.aircraft && elements.aircraft) {
                    elements.aircraft.textContent = routeInfo.aircraft;

                    // Check for rare aircraft (built-in + custom)
                    const allRareTypes = [...RARE_AIRCRAFT, ...state.customRareAircraft];
                    const isRare = allRareTypes.some(code => routeInfo.aircraftCode && routeInfo.aircraftCode.startsWith(code));
                    if (isRare) {
                        elements.aircraft.textContent += ' ★';
                        elements.aircraft.style.fontWeight = '900';
                    } else {
                        elements.aircraft.style.fontWeight = '400';
                    }
                }

                // Show route BELOW clock if available (this is always from API)
                if (routeInfo.departure && routeInfo.arrival) {
                    if (elements.route) elements.route.textContent = `${routeInfo.departure} → ${routeInfo.arrival}`;
                    if (elements.routeInfo) elements.routeInfo.classList.remove('hidden');
                }

                recordFlightSighting(flight, routeInfo);
            } else {
                recordFlightSighting(flight);
            }
        } catch (e) {
            console.log('Route lookup failed:', e);
            recordFlightSighting(flight);
        }
    } else {
        recordFlightSighting(flight);
    }
}

function showNoFlights() {
    state.flights = [];

    // Hide flight info
    elements.topInfo.classList.add('hidden');
    if (elements.routeInfo) elements.routeInfo.classList.add('hidden');

    updateStatus('Scanning for aircraft...', true);

    // Show year progress bar when no flights
    if (elements.yearProgressBar && elements.yearProgressBar.parentElement) {
        elements.yearProgressBar.parentElement.classList.remove('hidden');
    }
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
// Stats Recording
// ==========================================

async function recordFlightSighting(flight, routeInfo = null) {
    if (!flight || !flight.callsign) return;

    // Check cooldown - only record each flight once per hour
    const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
    const now = Date.now();
    const lastRecorded = state.recentlyRecordedFlights.get(flight.callsign);

    if (lastRecorded && (now - lastRecorded) < COOLDOWN_MS) {
        // Skip - already recorded within the last hour
        return;
    }

    try {
        // Get typecode from route info or local aircraft data
        const typecode = routeInfo?.aircraftCode || flight.typecode || null;
        const aircraft = routeInfo?.aircraft || flight.model || null;

        // Check if rare (by aircraft type) - built-in + custom
        const allRareTypes = [...RARE_AIRCRAFT, ...state.customRareAircraft];
        const isRare = typecode && allRareTypes.some(code => typecode.startsWith(code));

        // Check if special callsign (Police, Military, Emergency, etc.) - built-in + custom
        let specialInfo = null;
        const allSpecialCallsigns = { ...SPECIAL_CALLSIGNS, ...state.customSpecialCallsigns };
        for (const [prefix, info] of Object.entries(allSpecialCallsigns)) {
            if (flight.callsign.toUpperCase().startsWith(prefix)) {
                specialInfo = info;
                break;
            }
        }

        const payload = {
            callsign: flight.callsign,
            distance: flight.distance,
            altitude: flight.altitude,
            carrier: routeInfo?.airline || flight.originCountry,
            route: routeInfo?.departure && routeInfo?.arrival ? `${routeInfo.departure} → ${routeInfo.arrival}` : null,
            aircraft: aircraft,
            typecode: typecode,
            country: flight.originCountry,
            rare: isRare || undefined,
            // New: Special callsign info
            special: specialInfo ? specialInfo.category : undefined,
            specialName: specialInfo ? specialInfo.name : undefined
        };

        await fetch('/api/stats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        // Mark as recorded with current timestamp
        state.recentlyRecordedFlights.set(flight.callsign, now);

        // Clean up old entries (remove anything older than 1 hour)
        for (const [callsign, timestamp] of state.recentlyRecordedFlights.entries()) {
            if (now - timestamp > COOLDOWN_MS) {
                state.recentlyRecordedFlights.delete(callsign);
            }
        }

        console.log(`Flight recorded: ${flight.callsign}${isRare ? ' ⭐RARE!' : ''}`);
    } catch (e) {
        console.error('Failed to record sighting:', e);
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



async function fetchExtendedInfo(callsign) {
    // Only attempt if we haven't checked this callsign recently? 
    // For now, simpler is better.
    try {
        const response = await fetch(`/api/flight-info/${callsign}`);
        if (response.ok) {
            const data = await response.json();
            if (data.origin && data.destination) {
                elements.route.textContent = `${data.origin} → ${data.destination}`;
            }
        }
    } catch (e) {
        console.log('Route fetch failed', e);
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

    // API Mode
    const apiModeRadios = document.querySelectorAll('input[name="api-mode"]');
    apiModeRadios.forEach(radio => {
        radio.checked = (radio.value === state.settings.apiMode);
    });
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

    // API Mode (handled in initEinkSettings)

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

    // Initial server settings sync
    await syncSettings();

    // Load previously seen models from stats (prevents false "NEW★" markers)
    await loadSeenModels();

    // Initialize E-Ink settings panel
    initEinkSettings();

    // Start E-Ink specific updates (weather, ISS)
    startEinkUpdates();

    // Get location and start fetching
    await initLocation();

    // Start periodic fetch
    startFetchInterval();

    // Sync settings every 60 seconds
    setInterval(syncSettings, 60000);
}

/**
 * Load previously seen models from stats API
 * Populates state.seenModels to prevent false "NEW★" detection
 */
async function loadSeenModels() {
    try {
        const response = await fetch('/api/stats');
        if (!response.ok) return;

        const data = await response.json();

        // Load typecodes from models list (API returns 'modelsList')
        if (data.modelsList) {
            data.modelsList.forEach(([typecode]) => {
                if (typecode) state.seenModels.add(typecode);
            });
        }

        // Also check recent sightings for typecodes (API returns 'recentSightings')
        if (data.recentSightings) {
            data.recentSightings.forEach(([callsign, info]) => {
                if (info && info.typecode) state.seenModels.add(info.typecode);
            });
        }

        console.log(`✓ Loaded ${state.seenModels.size} previously seen aircraft types`);
    } catch (e) {
        console.log('Could not load seen models from stats:', e.message);
    }
}

// Fetch settings from server (radius, interval)
async function syncSettings() {
    try {
        // Radius
        try {
            const radiusRes = await fetch('/api/config/radius');
            const radiusData = await radiusRes.json();
            if (radiusData.radius) {
                if (state.settings.radius !== radiusData.radius) {
                    console.log(`Scan radius updated from server: ${radiusData.radius} km`);
                    state.settings.radius = radiusData.radius;
                }
            }
        } catch (e) { }

        // Interval
        try {
            const intervalRes = await fetch('/api/config/interval');
            const intervalData = await intervalRes.json();
            if (intervalData.interval) {
                if (state.settings.interval !== intervalData.interval) {
                    console.log(`Scan interval updated from server: ${intervalData.interval} s`);
                    state.settings.interval = intervalData.interval;
                    // Restart loop with new interval
                    startFetchInterval();
                }
            }
        } catch (e) { }

        // Custom aircraft settings (rare types + special callsigns)
        try {
            const customRes = await fetch('/api/config/custom-aircraft');
            const customData = await customRes.json();
            if (customData.rareTypes) {
                state.customRareAircraft = customData.rareTypes;
            }
            if (customData.specialCallsigns) {
                state.customSpecialCallsigns = customData.specialCallsigns;
            }
            if (customData.rareTypes?.length > 0 || Object.keys(customData.specialCallsigns || {}).length > 0) {
                console.log(`Custom aircraft loaded: ${customData.rareTypes?.length || 0} rare types, ${Object.keys(customData.specialCallsigns || {}).length} special callsigns`);
            }
        } catch (e) { }

        // Special alerts settings (military, emergency, VIP)
        try {
            const alertRes = await fetch('/api/config/special-alerts');
            const alertData = await alertRes.json();
            if (alertData.radius) state.settings.specialAlertRadius = alertData.radius;
            if (alertData.interval) state.settings.specialAlertInterval = alertData.interval;
        } catch (e) { }

        // Clock mode (regular vs literature)
        try {
            const clockRes = await fetch('/api/config/clock-mode');
            const clockData = await clockRes.json();
            if (clockData.mode && clockData.mode !== state.settings.clockMode) {
                state.settings.clockMode = clockData.mode;
                console.log(`Clock mode: ${clockData.mode}`);
                // Force clock update to apply new mode
                state.lastMinute = null;
                updateClock();
            }
        } catch (e) { }

    } catch (e) {
        console.error('Settings sync failed:', e);
    }
}

// ==========================================
// E-Ink Settings Panel
// ==========================================

function initEinkSettings() {
    console.log('initEinkSettings called');
    const settingsPanel = document.getElementById('eink-settings');
    const radiusInput = document.getElementById('radius-input');
    const intervalInput = document.getElementById('interval-input');
    const closeBtn = document.getElementById('eink-settings-close');

    console.log('Settings elements:', { settingsPanel: !!settingsPanel, radiusInput: !!radiusInput, intervalInput: !!intervalInput });
    if (!settingsPanel) {
        console.warn('E-ink settings panel not found');
        return;
    }

    // Load saved radius FROM SERVER (shared with Puppeteer)
    if (radiusInput) {
        // Try to fetch from server first (shared state)
        fetch('/api/config/radius')
            .then(r => r.json())
            .then(data => {
                if (data.radius) {
                    radiusInput.value = data.radius;
                    state.settings.radius = data.radius;
                    console.log(`Radius loaded from server: ${data.radius} km`);
                }
            })
            .catch(() => {
                // Fallback to localStorage
                const savedRadius = localStorage.getItem('einkRadius') || CONFIG.DEFAULT_RADIUS;
                radiusInput.value = savedRadius;
                state.settings.radius = parseInt(savedRadius);
            });

        radiusInput.addEventListener('change', (e) => {
            let value = parseInt(e.target.value);
            if (value < 2) value = 2;
            if (value > 25) value = 25;
            e.target.value = value;
            state.settings.radius = value;
            localStorage.setItem('einkRadius', value);

            // Sync to server so Puppeteer gets the same value
            fetch('/api/config/radius', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ radius: value })
            }).then(() => console.log(`Radius synced to server: ${value} km`));
        });
    }

    // Load saved interval
    if (intervalInput) {
        const savedInterval = localStorage.getItem('einkInterval') || state.settings.interval;
        intervalInput.value = savedInterval;
        state.settings.interval = parseInt(savedInterval);

        intervalInput.addEventListener('change', (e) => {
            let value = parseInt(e.target.value);
            if (value < 10) value = 10;
            if (value > 300) value = 300;
            e.target.value = value;
            state.settings.interval = value;
            localStorage.setItem('einkInterval', value);
            console.log(`Scan interval updated to ${value} sec`);
            startFetchInterval(); // Restart with new interval
        });
    }

    // API Mode Radio Buttons (replaces old Route API toggle)
    const apiModeRadios = document.querySelectorAll('input[name="api-mode"]');
    if (apiModeRadios.length > 0) {
        // Load initial state from SERVER
        fetch('/api/config/api-mode')
            .then(r => r.json())
            .then(data => {
                state.settings.apiMode = data.mode;
                // Check the right radio
                apiModeRadios.forEach(radio => {
                    radio.checked = (radio.value === data.mode);
                });
                console.log(`API Mode loaded: ${data.mode}`);
            })
            .catch(e => {
                console.error('Failed to load API mode', e);
            });

        // Handle changes
        apiModeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                const mode = e.target.value;
                state.settings.apiMode = mode;
                saveSettings();

                // Push to server
                fetch('/api/config/api-mode', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mode: mode })
                }).then(() => console.log(`API Mode set to: ${mode}`));
            });
        });
    }

    // Fetch and display API quota
    const quotaDisplay = document.getElementById('quota-display');
    if (quotaDisplay) {
        fetch('/api/config/quota')
            .then(r => r.json())
            .then(data => {
                quotaDisplay.textContent = `${data.used}/${data.limit}`;
                if (data.used > data.limit * 0.8) {
                    quotaDisplay.style.color = '#FF0000'; // Warn if >80% used
                }
            })
            .catch(() => {
                quotaDisplay.textContent = '--/1000';
            });
    }

    // Close button
    if (closeBtn) {
        closeBtn.addEventListener('click', () => toggleEinkSettings());
    }

    // Keyboard shortcut (S key)
    document.addEventListener('keydown', (e) => {
        if (e.key === 's' || e.key === 'S') {
            toggleEinkSettings();
        }
    });
}

function toggleEinkSettings() {
    const settingsPanel = document.getElementById('eink-settings');
    if (settingsPanel) {
        settingsPanel.classList.toggle('hidden');
    }
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
document.addEventListener('DOMContentLoaded', initSatellite);

// ==========================================
// Satellite & Rare Aircraft Logic
// ==========================================

function initSatellite() {
    console.log('Initializing Satellite Tracking...');
    fetchSatelliteStatus();
    setInterval(fetchSatelliteStatus, 60000); // Check every minute
}

async function fetchSatelliteStatus() {
    try {
        const response = await fetch('/api/satellite');
        if (response.ok) {
            const data = await response.json();
            updateSatelliteUI(data);
        }
    } catch (e) {
        console.error('Satellite fetch failed:', e);
    }
}

function updateSatelliteUI(data) {
    const banner = document.getElementById('satellite-banner');
    if (!banner) return;

    // Check if pass is active (now < end time)
    if (data && data.name && (Date.now() < data.end * 1000)) {
        banner.classList.remove('hidden');
        if (elements.satName) elements.satName.textContent = data.name;
        if (elements.satVis) elements.satVis.textContent = `Mag ${data.mag}`;
    } else {
        banner.classList.add('hidden');
    }
}

