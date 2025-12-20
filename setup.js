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

// Default config
let config = {
    latitude: -33.9117,
    longitude: 151.1552,
    locationName: 'Marrickville, NSW',
    clientId: '',
    clientSecret: '' // OpenSky
};

// Load existing
if (fs.existsSync(CONFIG_FILE)) {
    try {
        config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
    } catch (e) { }
}

function ask(question) {
    return new Promise(resolve => rl.question(question, resolve));
}

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
    console.log('\nDetecting location via IP...');
    try {
        const data = await fetchIPLocation();
        console.log(`\nFound: ${data.city}, ${data.regionName}, ${data.countryCode}`);
        console.log(`Coords: ${data.lat}, ${data.lon}`);

        const confirm = await ask(`Use this location? (Y/n): `);
        if (confirm.toLowerCase() !== 'n') {
            config.latitude = data.lat;
            config.longitude = data.lon;
            config.locationName = `${data.city}, ${data.regionName}`;
            console.log('✅ Location updated.');
        }
    } catch (e) {
        console.error('❌ Failed to detect location:', e.message || e);
    }
}

async function handleLocationManual() {
    console.log('\n--- Manual Location ---');
    config.latitude = parseFloat(await ask(`Latitude [${config.latitude}]: `)) || config.latitude;
    config.longitude = parseFloat(await ask(`Longitude [${config.longitude}]: `)) || config.longitude;
    config.locationName = await ask(`Location Name [${config.locationName}]: `) || config.locationName;
    console.log('✅ Location updated.');
}

async function handleAPI() {
    console.log('\n--- OpenSky API (Optional) ---');
    console.log('Use this for better flight data rates. Leave empty to clear.');
    config.clientId = await ask(`Client ID [${config.clientId ? '***' : 'none'}]: `) || config.clientId;
    config.clientSecret = await ask(`Client Secret [${config.clientSecret ? '***' : 'none'}]: `) || config.clientSecret;

    console.log('\n--- RapidAPI (Optional) ---');
    console.log('Required for Route/Destination data and better Logos (AeroDataBox).');
    config.rapidApiKey = await ask(`RapidAPI Key [${config.rapidApiKey ? '***' : 'none'}]: `) || config.rapidApiKey;

    console.log('✅ API Credentials updated.');
}

function saveConfig() {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log('\n💾 Configuration saved to config.json');
}

async function mainMenu() {
    while (true) {
        console.log('\n╔════════════════════════════════════════════╗');
        console.log('║     Flight Tracker Settings                ║');
        console.log('╠════════════════════════════════════════════╣');
        console.log(`║ 1. Auto-detect Location                    ║`);
        console.log(`║    (${config.locationName}: ${config.latitude}, ${config.longitude})`);
        console.log(`║ 2. Set Location Manually                   ║`);
        console.log(`║ 3. Configure OpenSky API                   ║`);
        console.log(`║ 4. Save & Exit                             ║`);
        console.log('╚════════════════════════════════════════════╝');

        const choice = await ask('Select option: ');

        switch (choice.trim()) {
            case '1': await handleLocationAuto(); break;
            case '2': await handleLocationManual(); break;
            case '3': await handleAPI(); break;
            case '4':
                saveConfig();
                console.log('Please restart the server (npm run eink) to apply changes.');
                rl.close();
                return;
            default: console.log('Invalid option.');
        }
    }
}

mainMenu();
