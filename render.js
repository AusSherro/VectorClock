/**
 * E-Ink Renderer for Raspberry Pi / Kindle
 * Uses Puppeteer to capture the Flight Tracker page as a monochrome image
 * Designed for Waveshare 4.26" E-Ink HAT (800x480) or Kindle Paperwhite
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════
// ANSI Colors & Styling
// ═══════════════════════════════════════════════════════════════
const c = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    magenta: '\x1b[35m',
    blue: '\x1b[34m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
};

const styled = (text, ...styles) => styles.join('') + text + c.reset;
const log = {
    success: (msg) => console.log(styled(`  ✓ ${msg}`, c.green)),
    error: (msg) => console.log(styled(`  ✗ ${msg}`, c.red)),
    info: (msg) => console.log(styled(`  ℹ ${msg}`, c.cyan)),
    warn: (msg) => console.log(styled(`  ⚠ ${msg}`, c.yellow)),
    frame: (msg) => console.log(styled(`  📸 ${msg}`, c.magenta)),
    time: () => styled(`[${new Date().toLocaleTimeString()}]`, c.dim),
};

// Try to load sharp for Kindle rotation (optional dependency)
let sharp;
try {
    sharp = require('sharp');
} catch (e) {
    sharp = null;
}

// Configuration
const KINDLE_MODE = process.env.KINDLE_MODE === 'true';

const CONFIG = {
    URL: 'http://localhost:3000/',
    VIEWPORT: KINDLE_MODE ? {
        width: 800,
        height: 480,
        deviceScaleFactor: 1.8
    } : {
        width: 800,
        height: 480,
        deviceScaleFactor: 1
    },
    KINDLE_WIDTH: 1072,
    KINDLE_HEIGHT: 1448,
    OUTPUT_DIR: path.join(__dirname, 'screenshots'),
    OUTPUT_FILE: 'eink_frame.png',
    REFRESH_INTERVAL_MS: 15000,
    GRAYSCALE: true,
    KINDLE_MODE: KINDLE_MODE
};

// Ensure output directory exists
if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
    fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
}

/**
 * Clean up the DOM before screenshot
 * Removes scrollbars, settings buttons, and other unwanted elements
 */
async function cleanupDOM(page) {
    await page.evaluate(() => {
        // Remove scrollbars
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';

        // Remove any scrollbar styling
        const style = document.createElement('style');
        style.textContent = `
            ::-webkit-scrollbar { display: none !important; }
            * { scrollbar-width: none !important; }
            body { margin: 5px !important; }
        `;
        document.head.appendChild(style);

        // Remove settings button if present
        const settingsBtn = document.getElementById('settings-btn');
        if (settingsBtn) {
            settingsBtn.remove();
        }

        // Remove settings modal if present
        const settingsModal = document.getElementById('settings-modal');
        if (settingsModal) {
            settingsModal.remove();
        }

        // Force E-Ink mode class
        document.body.classList.add('eink-mode', 'low-power');
    });
}

/**
 * Capture a screenshot of the page
 */
async function captureFrame(page) {
    const outputPath = path.join(CONFIG.OUTPUT_DIR, CONFIG.OUTPUT_FILE);
    const tempPath = path.join(CONFIG.OUTPUT_DIR, 'temp_frame.png');

    // Clean up DOM before capture
    await cleanupDOM(page);

    // Wait for page JavaScript to initialize (location + first flight fetch)
    // app.js initLocation() calls fetchFlights() automatically after getting location
    // We just need to wait for that natural flow to complete
    await page.waitForTimeout(5000);

    // Check if flight info is visible
    const hasFlightInfo = await page.evaluate(() => {
        const topInfo = document.getElementById('top-info');
        return topInfo && !topInfo.classList.contains('hidden');
    });

    if (hasFlightInfo) {
        log.info('Flight data detected in DOM');
    }

    // For Kindle mode, capture to temp file first for rotation
    const capturePath = (CONFIG.KINDLE_MODE && sharp) ? tempPath : outputPath;

    // Capture screenshot
    await page.screenshot({
        path: capturePath,
        type: 'png',
        fullPage: false,
        clip: {
            x: 0,
            y: 0,
            width: CONFIG.VIEWPORT.width,
            height: CONFIG.VIEWPORT.height
        }
    });

    // For Kindle: rotate 90° clockwise, resize to fill screen, convert to 8-bit grayscale
    // Kindle eips requires 8-bit grayscale PNG without alpha channel at exact framebuffer size
    if (CONFIG.KINDLE_MODE && sharp) {
        await sharp(capturePath)
            .rotate(90)                        // Rotate for landscape viewing
            .resize(CONFIG.KINDLE_WIDTH, CONFIG.KINDLE_HEIGHT, { fit: 'fill' })  // Fill exact framebuffer
            .removeAlpha()                     // Remove alpha channel
            .grayscale()                       // Convert to grayscale
            .png({ compressionLevel: 9 })
            .toColourspace('b-w')              // Force to 8-bit grayscale
            .toFile(outputPath);

        // Clean up temp file
        try { fs.unlinkSync(tempPath); } catch (e) { }

        console.log(`${log.time()} ${styled('Kindle frame ready', c.magenta)}`);
    } else {
        console.log(`${log.time()} ${styled('Frame captured', c.green)}`);
    }

    return outputPath;
}

/**
 * Convert to grayscale/monochrome using simple pixel manipulation
 * Note: For true 1-bit monochrome, use an external tool like ImageMagick
 */
async function convertToMonochrome(imagePath) {
    // This is a placeholder - for actual monochrome conversion,
    // you would use Sharp or ImageMagick:
    // sharp(imagePath).grayscale().threshold(128).toFile(outputPath)

    // For now, we return the original PNG which works with most E-Ink drivers
    log.success(`Image ready for E-Ink display`);
    return imagePath;
}

/**
 * Main render loop
 */
async function startRenderer() {
    const modeLabel = CONFIG.KINDLE_MODE ? 'Kindle' : 'E-Ink';
    const modeIcon = CONFIG.KINDLE_MODE ? '📱' : '🖥️';
    const modeColor = CONFIG.KINDLE_MODE ? c.yellow : c.cyan;

    console.log('');
    console.log(styled('  ╔═══════════════════════════════════════════════════════╗', modeColor));
    console.log(styled('  ║', modeColor) + styled(`  ${modeIcon}  ${modeLabel.toUpperCase()} RENDERER`, c.bold, c.white) + '                         ' + styled('║', modeColor));
    console.log(styled('  ╠═══════════════════════════════════════════════════════╣', modeColor));
    console.log(styled('  ║', modeColor) + `  ${styled('Target:', c.dim)}   ${styled(CONFIG.URL, c.white)}`.padEnd(66) + styled('║', modeColor));
    console.log(styled('  ║', modeColor) + `  ${styled('Size:', c.dim)}     ${styled(`${CONFIG.VIEWPORT.width}×${CONFIG.VIEWPORT.height}`, c.green)} @ ${styled(`${CONFIG.VIEWPORT.deviceScaleFactor}x`, c.yellow)} scale`.padEnd(66) + styled('║', modeColor));
    console.log(styled('  ║', modeColor) + `  ${styled('Refresh:', c.dim)}  Every ${styled(`${CONFIG.REFRESH_INTERVAL_MS / 1000}s`, c.cyan)}`.padEnd(68) + styled('║', modeColor));
    console.log(styled('  ╚═══════════════════════════════════════════════════════╝', modeColor));
    console.log('');

    // Get location from server config for geolocation override
    let geoLocation = { latitude: -33.9117, longitude: 151.1552 };
    try {
        const configResponse = await fetch('http://localhost:3000/api/config/location');
        if (configResponse.ok) {
            const configData = await configResponse.json();
            geoLocation = { latitude: configData.latitude, longitude: configData.longitude };
            log.success(`Location: ${configData.latitude}, ${configData.longitude}`);
        }
    } catch (e) {
        log.warn('Using default location (Sydney)');
    }

    // Launch browser
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-software-rasterizer'
        ]
    });

    // Create page with E-Ink viewport
    const page = await browser.newPage();
    await page.setViewport(CONFIG.VIEWPORT);

    // Grant geolocation permission and set coordinates
    const context = browser.defaultBrowserContext();
    await context.overridePermissions('http://localhost:3000', ['geolocation']);
    await page.setGeolocation(geoLocation);

    // Navigate to the page
    try {
        await page.goto(CONFIG.URL, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });
        log.success('Page loaded successfully');
    } catch (error) {
        log.error(`Failed to load page: ${error.message}`);
        log.warn('Make sure the server is running: npm start');
        await browser.close();
        process.exit(1);
    }

    // Initial capture
    await captureFrame(page);

    // Set up file watcher for immediate updates
    const triggerFile = path.join(__dirname, 'trigger.txt');
    // Ensure file exists
    if (!fs.existsSync(triggerFile)) {
        try { fs.writeFileSync(triggerFile, ''); } catch (e) { }
    }

    // Watch for changes to trigger file (with debounce)
    let lastTriggerTime = 0;
    const TRIGGER_DEBOUNCE_MS = 5000; // 5 second cooldown between triggers

    try {
        fs.watch(triggerFile, async (eventType) => {
            if (eventType === 'change') {
                const now = Date.now();
                if (now - lastTriggerTime < TRIGGER_DEBOUNCE_MS) {
                    return; // Skip - too soon since last trigger
                }
                lastTriggerTime = now;

                console.log(`${log.time()} ${styled('Trigger received', c.yellow)}, updating...`);
                try {
                    // Don't reload! Just capture current page state
                    await new Promise(r => setTimeout(r, 500));
                    await captureFrame(page);
                } catch (e) {
                    log.error(`Capture error: ${e.message}`);
                }
            }
        });
        log.info('Watching for update triggers...');
    } catch (e) {
        log.error(`Failed to setup file watcher: ${e.message}`);
    }

    // Set up periodic capture
    setInterval(async () => {
        try {
            // Reload page for fresh data (triggers global refresh on E-Ink)
            await page.reload({ waitUntil: 'networkidle2' });
            await captureFrame(page);
        } catch (error) {
            log.error(`Capture error: ${error.message}`);
        }
    }, CONFIG.REFRESH_INTERVAL_MS);

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log('');
        log.warn('Shutting down renderer...');
        await browser.close();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        await browser.close();
        process.exit(0);
    });
}

// Run the renderer
startRenderer().catch(error => {
    log.error(`Renderer failed: ${error}`);
    process.exit(1);
});
