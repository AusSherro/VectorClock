/**
 * Kindle Mode Starter
 * Runs: Server → Renderer → Kindle Display Push
 * For jailbroken Kindle Paperwhite 7th gen
 */

const { spawn } = require('child_process');
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
    step: (num, msg) => console.log(styled(`  ${num}`, c.yellow, c.bold) + styled(` › ${msg}`, c.white)),
};

// Configuration
const KINDLE_IP = '192.168.68.116';

// Show beautiful startup banner
console.clear();
console.log('');
console.log(styled('  ╔═══════════════════════════════════════════════════════════════╗', c.yellow));
console.log(styled('  ║', c.yellow) + '                                                             ' + styled('║', c.yellow));
console.log(styled('  ║', c.yellow) + styled('   📱 KINDLE DISPLAY MODE                                    ', c.bold, c.white) + styled('║', c.yellow));
console.log(styled('  ║', c.yellow) + styled('   VectorClock → Kindle Paperwhite                           ', c.dim) + styled('║', c.yellow));
console.log(styled('  ║', c.yellow) + '                                                             ' + styled('║', c.yellow));
console.log(styled('  ╠═══════════════════════════════════════════════════════════════╣', c.yellow));
console.log(styled('  ║', c.yellow) + '                                                             ' + styled('║', c.yellow));
console.log(styled('  ║', c.yellow) + `   ${styled('Kindle IP:', c.dim)}   ${styled(KINDLE_IP, c.cyan)}                              ` + styled('║', c.yellow));
console.log(styled('  ║', c.yellow) + `   ${styled('Render:', c.dim)}      ${styled('800×480', c.green)} @ ${styled('1.8x', c.yellow)} scale → ${styled('1072×1448', c.green)}       ` + styled('║', c.yellow));
console.log(styled('  ║', c.yellow) + `   ${styled('Refresh:', c.dim)}     Every ${styled('15s', c.cyan)}                               ` + styled('║', c.yellow));
console.log(styled('  ║', c.yellow) + '                                                             ' + styled('║', c.yellow));
console.log(styled('  ╚═══════════════════════════════════════════════════════════════╝', c.yellow));
console.log('');

// Track child processes
let server, renderer, kindlePush;

// Helper to spawn with environment
function spawnWithEnv(script, env = {}) {
    return spawn('node', [script], {
        stdio: 'inherit',
        shell: true,
        env: { ...process.env, ...env }
    });
}

// Cleanup function
function cleanup() {
    console.log('');
    console.log(styled('  ┌─────────────────────────────────────┐', c.red));
    console.log(styled('  │', c.red) + styled('  🛑 Shutting down...                ', c.bold, c.white) + styled('│', c.red));
    console.log(styled('  └─────────────────────────────────────┘', c.red));
    console.log('');
    if (kindlePush) kindlePush.kill();
    if (renderer) renderer.kill();
    if (server) server.kill();
    process.exit(0);
}

// Startup sequence
console.log(styled('  ─── Startup Sequence ───', c.dim));
console.log('');

// Step 1: Start Server
log.step('1', 'Starting Express Server...');
server = spawnWithEnv('server.js');

server.on('error', (err) => {
    log.error(`Server error: ${err.message}`);
    cleanup();
});

// Step 2: Wait for server, then start renderer
setTimeout(() => {
    log.step('2', 'Starting Puppeteer Renderer (Kindle mode)...');
    renderer = spawnWithEnv('render.js', { KINDLE_MODE: 'true' });

    renderer.on('error', (err) => {
        log.error(`Renderer error: ${err.message}`);
    });

    // Step 3: Wait for first frame, then start Kindle push
    setTimeout(() => {
        log.step('3', 'Starting Kindle SSH Push...');
        console.log('');
        kindlePush = spawnWithEnv('kindle-display.js');

        kindlePush.on('error', (err) => {
            log.error(`Kindle push error: ${err.message}`);
        });

        kindlePush.on('close', (code) => {
            if (code !== 0) {
                log.warn(`Kindle push exited with code ${code}`);
            }
        });

        // Show ready message
        setTimeout(() => {
            console.log('');
            console.log(styled('  ┌─────────────────────────────────────┐', c.green));
            console.log(styled('  │', c.green) + styled('  ✓ All systems running!             ', c.bold, c.white) + styled('│', c.green));
            console.log(styled('  └─────────────────────────────────────┘', c.green));
            console.log('');
            log.info(`Web UI:  ${styled('http://localhost:3000', c.cyan)}`);
            log.info(`Stats:   ${styled('http://localhost:3000/stats.html', c.cyan)}`);
            log.info(`Settings: ${styled('http://localhost:3000/settings.html', c.cyan)}`);
            console.log('');
            console.log(styled('  💡 Press Ctrl+C to stop', c.dim));
            console.log('');
        }, 2000);

    }, 8000); // Wait 8s for first screenshot to be ready

}, 3000); // Wait 3s for server

// Handle graceful shutdown
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// Keep process alive
setInterval(() => { }, 1000);
