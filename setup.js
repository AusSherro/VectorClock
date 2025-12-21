const fs = require('fs');
const readline = require('readline');
const path = require('path');
const https = require('https');
const http = require('http');

const CONFIG_FILE = path.join(__dirname, 'config.json');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// ═══════════════════════════════════════════════════════════════
// ANSI Colors & Styling
// ═══════════════════════════════════════════════════════════════
const c = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    // Colors
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    magenta: '\x1b[35m',
    blue: '\x1b[34m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
    // Backgrounds
    bgCyan: '\x1b[46m',
    bgBlue: '\x1b[44m',
};

// Helpers
const styled = (text, ...styles) => styles.join('') + text + c.reset;
const success = (msg) => console.log(styled(`  ✓ ${msg}`, c.green));
const error = (msg) => console.log(styled(`  ✗ ${msg}`, c.red));
const info = (msg) => console.log(styled(`  ℹ ${msg}`, c.cyan));
const warn = (msg) => console.log(styled(`  ⚠ ${msg}`, c.yellow));

// ═══════════════════════════════════════════════════════════════
// ASCII Art Banner
// ═══════════════════════════════════════════════════════════════
function showBanner() {
    console.clear();
    console.log(styled(`
╔═══════════════════════════════════════════════════════════════════╗
║                                                                   ║
║   ${c.cyan}██╗   ██╗${c.white}███████╗${c.cyan}${c.bold} ██████╗${c.white}████████╗ ██████╗ ██████╗${c.reset}            ║
║   ${c.cyan}██║   ██║${c.white}██╔════╝${c.cyan}${c.bold}██╔════╝${c.white}╚══██╔══╝██╔═══██╗██╔══██╗${c.reset}           ║
║   ${c.cyan}██║   ██║${c.white}█████╗  ${c.cyan}${c.bold}██║     ${c.white}   ██║   ██║   ██║██████╔╝${c.reset}           ║
║   ${c.cyan}╚██╗ ██╔╝${c.white}██╔══╝  ${c.cyan}${c.bold}██║     ${c.white}   ██║   ██║   ██║██╔══██╗${c.reset}           ║
║   ${c.cyan} ╚████╔╝ ${c.white}███████╗${c.cyan}${c.bold}╚██████╗${c.white}   ██║   ╚██████╔╝██║  ██║${c.reset}           ║
║   ${c.cyan}  ╚═══╝  ${c.white}╚══════╝${c.cyan}${c.bold} ╚═════╝${c.white}   ╚═╝    ╚═════╝ ╚═╝  ╚═╝${c.reset}           ║
║                                                                   ║
║   ${c.dim}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${c.reset}   ║
║           ${c.yellow}✈${c.reset}  ${c.bold}E-Ink Flight Tracker${c.reset}  ${c.dim}v1.4.0${c.reset}  ${c.yellow}✈${c.reset}                  ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
`, c.white));
}

// ═══════════════════════════════════════════════════════════════
// Config Management
// ═══════════════════════════════════════════════════════════════
let config = {
    latitude: -33.9117,
    longitude: 151.1552,
    locationName: 'Marrickville, NSW',
    clientId: '',
    clientSecret: ''
};

if (fs.existsSync(CONFIG_FILE)) {
    try {
        config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
    } catch (e) { }
}

function ask(question) {
    return new Promise(resolve => rl.question(styled(question, c.white), resolve));
}

// ═══════════════════════════════════════════════════════════════
// Location Detection
// ═══════════════════════════════════════════════════════════════
async function fetchIPLocation() {
    return new Promise((resolve, reject) => {
        http.get('http://ip-api.com/json', (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.status === 'fail') reject(json.message);
                    else resolve(json);
                } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

async function handleLocationAuto() {
    console.log('');
    info('Detecting location via IP geolocation...');
    console.log('');

    try {
        const data = await fetchIPLocation();

        console.log(styled('  ┌─────────────────────────────────────┐', c.cyan));
        console.log(styled('  │', c.cyan) + styled('  📍 Location Detected               ', c.bold) + styled('│', c.cyan));
        console.log(styled('  ├─────────────────────────────────────┤', c.cyan));
        console.log(styled('  │', c.cyan) + `  City:    ${styled(data.city, c.yellow)}`.padEnd(47) + styled('│', c.cyan));
        console.log(styled('  │', c.cyan) + `  Region:  ${styled(data.regionName, c.white)}`.padEnd(47) + styled('│', c.cyan));
        console.log(styled('  │', c.cyan) + `  Country: ${styled(data.countryCode, c.white)}`.padEnd(47) + styled('│', c.cyan));
        console.log(styled('  │', c.cyan) + `  Coords:  ${styled(`${data.lat}, ${data.lon}`, c.green)}`.padEnd(55) + styled('│', c.cyan));
        console.log(styled('  └─────────────────────────────────────┘', c.cyan));
        console.log('');

        const confirm = await ask(`  Use this location? ${styled('[Y/n]', c.dim)} `);
        if (confirm.toLowerCase() !== 'n') {
            config.latitude = data.lat;
            config.longitude = data.lon;
            config.locationName = `${data.city}, ${data.regionName}`;
            success('Location saved!');
        } else {
            warn('Location not changed.');
        }
    } catch (e) {
        error(`Failed to detect location: ${e.message || e}`);
    }
}

async function handleLocationManual() {
    console.log('');
    console.log(styled('  ┌─────────────────────────────────────┐', c.magenta));
    console.log(styled('  │', c.magenta) + styled('  📝 Manual Location Entry           ', c.bold) + styled('│', c.magenta));
    console.log(styled('  └─────────────────────────────────────┘', c.magenta));
    console.log('');
    console.log(styled(`  Current: ${config.locationName}`, c.dim));
    console.log(styled(`  Coords:  ${config.latitude}, ${config.longitude}`, c.dim));
    console.log('');

    const lat = await ask(`  Latitude  ${styled(`[${config.latitude}]`, c.dim)} › `);
    const lon = await ask(`  Longitude ${styled(`[${config.longitude}]`, c.dim)} › `);
    const name = await ask(`  Name      ${styled(`[${config.locationName}]`, c.dim)} › `);

    config.latitude = parseFloat(lat) || config.latitude;
    config.longitude = parseFloat(lon) || config.longitude;
    config.locationName = name || config.locationName;

    success('Location updated!');
}

// ═══════════════════════════════════════════════════════════════
// API Configuration
// ═══════════════════════════════════════════════════════════════
async function handleAPI() {
    console.log('');
    console.log(styled('  ┌─────────────────────────────────────┐', c.blue));
    console.log(styled('  │', c.blue) + styled('  🔑 API Configuration               ', c.bold) + styled('│', c.blue));
    console.log(styled('  └─────────────────────────────────────┘', c.blue));

    // OpenSky Section
    console.log('');
    console.log(styled('  ─── OpenSky Network ───', c.cyan, c.bold));
    console.log(styled('  Higher rate limits for authenticated requests', c.dim));
    console.log(styled('  Register free at: opensky-network.org', c.dim));
    console.log('');

    const hasOpenSky = config.clientId ? styled('✓ configured', c.green) : styled('○ not set', c.dim);
    console.log(`  Status: ${hasOpenSky}`);

    const id = await ask(`  Client ID     ${styled('[enter to keep]', c.dim)} › `);
    const secret = await ask(`  Client Secret ${styled('[enter to keep]', c.dim)} › `);

    if (id) config.clientId = id;
    if (secret) config.clientSecret = secret;

    // RapidAPI Section
    console.log('');
    console.log(styled('  ─── RapidAPI / AeroDataBox ───', c.yellow, c.bold));
    console.log(styled('  Required for flight route & destination data', c.dim));
    console.log(styled('  Subscribe at: rapidapi.com/aedbx/api/aerodatabox', c.dim));
    console.log('');

    const hasRapid = config.rapidApiKey ? styled('✓ configured', c.green) : styled('○ not set', c.dim);
    console.log(`  Status: ${hasRapid}`);

    const rapid = await ask(`  API Key ${styled('[enter to keep]', c.dim)} › `);
    if (rapid) config.rapidApiKey = rapid;

    // AirLabs Section (Free)
    console.log('');
    console.log(styled('  ─── AirLabs (Free Tier) ───', c.green, c.bold));
    console.log(styled('  1,000 calls/month - perfect for personal use', c.dim));
    console.log(styled('  Get key at: airlabs.co', c.dim));
    console.log('');

    const hasAirLabs = config.airlabsApiKey ? styled('✓ configured', c.green) : styled('○ not set', c.dim);
    console.log(`  Status: ${hasAirLabs}`);

    const airlabs = await ask(`  API Key ${styled('[enter to keep]', c.dim)} › `);
    if (airlabs) config.airlabsApiKey = airlabs;

    success('API credentials updated!');
}

// ═══════════════════════════════════════════════════════════════
// Display Current Config
// ═══════════════════════════════════════════════════════════════
function showCurrentConfig() {
    console.log('');
    console.log(styled('  ─── Current Configuration ───', c.dim));
    console.log('');
    console.log(`  ${styled('📍', c.yellow)} Location:  ${styled(config.locationName, c.white)}`);
    console.log(`  ${styled('🌐', c.cyan)} Coords:    ${styled(`${config.latitude}, ${config.longitude}`, c.dim)}`);
    console.log(`  ${styled('🔑', c.green)} OpenSky:   ${config.clientId ? styled('configured', c.green) : styled('not set', c.dim)}`);
    console.log(`  ${styled('🚀', c.magenta)} RapidAPI:  ${config.rapidApiKey ? styled('configured', c.green) : styled('not set', c.dim)}`);
    console.log(`  ${styled('✈️', c.blue)} AirLabs:   ${config.airlabsApiKey ? styled('configured', c.green) : styled('not set', c.dim)}`);
    console.log('');
}

// ═══════════════════════════════════════════════════════════════
// Save & Exit
// ═══════════════════════════════════════════════════════════════
function saveConfig() {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log('');
    console.log(styled('  ┌─────────────────────────────────────┐', c.green));
    console.log(styled('  │', c.green) + styled('  💾 Configuration Saved!            ', c.bold, c.green) + styled('│', c.green));
    console.log(styled('  └─────────────────────────────────────┘', c.green));
    console.log('');
    console.log(styled('  File: ', c.dim) + styled('config.json', c.white));
    console.log('');
}

// ═══════════════════════════════════════════════════════════════
// Main Menu
// ═══════════════════════════════════════════════════════════════
async function mainMenu() {
    while (true) {
        showBanner();
        showCurrentConfig();

        console.log(styled('  ┌─────────────────────────────────────┐', c.cyan));
        console.log(styled('  │', c.cyan) + styled('           M E N U                   ', c.bold, c.white) + styled('│', c.cyan));
        console.log(styled('  ├─────────────────────────────────────┤', c.cyan));
        console.log(styled('  │', c.cyan) + `  ${styled('1', c.yellow, c.bold)} ${styled('›', c.dim)} Auto-detect Location         ` + styled('│', c.cyan));
        console.log(styled('  │', c.cyan) + `  ${styled('2', c.yellow, c.bold)} ${styled('›', c.dim)} Set Location Manually        ` + styled('│', c.cyan));
        console.log(styled('  │', c.cyan) + `  ${styled('3', c.yellow, c.bold)} ${styled('›', c.dim)} Configure API Keys           ` + styled('│', c.cyan));
        console.log(styled('  │', c.cyan) + `  ${styled('4', c.yellow, c.bold)} ${styled('›', c.dim)} Save & Exit                  ` + styled('│', c.cyan));
        console.log(styled('  └─────────────────────────────────────┘', c.cyan));
        console.log('');

        const choice = await ask(`  Select option ${styled('[1-4]', c.dim)} › `);

        switch (choice.trim()) {
            case '1':
                await handleLocationAuto();
                await ask(styled('\n  Press Enter to continue...', c.dim));
                break;
            case '2':
                await handleLocationManual();
                await ask(styled('\n  Press Enter to continue...', c.dim));
                break;
            case '3':
                await handleAPI();
                await ask(styled('\n  Press Enter to continue...', c.dim));
                break;
            case '4':
                saveConfig();
                console.log(styled('  Restart the server to apply changes:', c.dim));
                console.log(styled('  $ npm run eink', c.cyan, c.bold));
                console.log('');
                console.log(styled('  ✈ Safe travels! ✈', c.yellow));
                console.log('');
                rl.close();
                return;
            default:
                warn('Invalid option. Please enter 1-4.');
                await ask(styled('\n  Press Enter to continue...', c.dim));
        }
    }
}

// Start the CLI
mainMenu();
