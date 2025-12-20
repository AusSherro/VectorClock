/**
 * E-Ink Renderer for Raspberry Pi
 * Uses Puppeteer to capture the Flight Tracker page as a monochrome image
 * Designed for Waveshare 4.26" E-Ink HAT (800x480)
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
    URL: 'http://localhost:3000/',
    VIEWPORT: {
        width: 800,
        height: 480,
        deviceScaleFactor: 1
    },
    OUTPUT_DIR: path.join(__dirname, 'screenshots'),
    OUTPUT_FILE: 'eink_frame.png',
    REFRESH_INTERVAL_MS: 10000, // 10 seconds
    GRAYSCALE: true
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

    // Clean up DOM before capture
    await cleanupDOM(page);

    // Wait for data to fetch (API calls can take 1-3s)
    await page.waitForTimeout(5000);

    // Capture screenshot
    await page.screenshot({
        path: outputPath,
        type: 'png',
        fullPage: false,
        clip: {
            x: 0,
            y: 0,
            width: CONFIG.VIEWPORT.width,
            height: CONFIG.VIEWPORT.height
        }
    });

    console.log(`[${new Date().toLocaleTimeString()}] Frame captured: ${outputPath}`);

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
    console.log(`Image ready for E-Ink display: ${imagePath}`);
    return imagePath;
}

/**
 * Main render loop
 */
async function startRenderer() {
    console.log('╔════════════════════════════════════════════╗');
    console.log('║     E-Ink Renderer Started                 ║');
    console.log('╠════════════════════════════════════════════╣');
    console.log(`║  Target: ${CONFIG.URL.padEnd(32)}║`);
    console.log(`║  Viewport: ${CONFIG.VIEWPORT.width}x${CONFIG.VIEWPORT.height}                       ║`);
    console.log(`║  Refresh: Every ${CONFIG.REFRESH_INTERVAL_MS / 1000}s                      ║`);
    console.log('╚════════════════════════════════════════════╝');

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

    // Navigate to the page
    try {
        await page.goto(CONFIG.URL, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });
        console.log('Page loaded successfully');
    } catch (error) {
        console.error('Failed to load page:', error.message);
        console.log('Make sure the server is running: npm start');
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

    // Watch for changes to trigger file
    try {
        fs.watch(triggerFile, async (eventType) => {
            if (eventType === 'change') {
                console.log(`[${new Date().toLocaleTimeString()}] Trigger received, updating...`);
                try {
                    // Slight delay to allow server to finish writing if needed
                    await new Promise(r => setTimeout(r, 100));
                    await page.reload({ waitUntil: 'networkidle2' });
                    await captureFrame(page);
                } catch (e) {
                    console.error('Trigger capture error:', e);
                }
            }
        });
        console.log('Watching for update triggers...');
    } catch (e) {
        console.error('Failed to setup file watcher:', e.message);
    }

    // Set up periodic capture
    setInterval(async () => {
        try {
            // Reload page for fresh data (triggers global refresh on E-Ink)
            await page.reload({ waitUntil: 'networkidle2' });
            await captureFrame(page);
        } catch (error) {
            console.error('Capture error:', error.message);
        }
    }, CONFIG.REFRESH_INTERVAL_MS);

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\nShutting down renderer...');
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
    console.error('Renderer failed:', error);
    process.exit(1);
});
