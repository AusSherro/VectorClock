/**
 * Kindle Display Push - Sends rendered images to Kindle via SSH/SCP
 * For jailbroken Kindle Paperwhite 7th gen with USBNetwork
 * Uses SSH key authentication
 */

const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const os = require('os');

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
    push: (msg) => console.log(styled(`  📤 ${msg}`, c.magenta)),
    kindle: (msg) => console.log(styled(`  📱 ${msg}`, c.yellow)),
    time: () => styled(`[${new Date().toLocaleTimeString()}]`, c.dim),
};

// Configuration
const CONFIG = {
    KINDLE_IP: '192.168.68.123',
    KINDLE_USER: 'root',
    SSH_KEY_PATH: path.join(os.homedir(), '.ssh', 'id_rsa_kindle'),
    REMOTE_PATH: '/tmp/vectorclock.png',
    LOCAL_IMAGE: path.join(__dirname, 'screenshots', 'eink_frame.png'),
    SSH_PORT: 22,
    PUSH_INTERVAL_MS: 15000,
};

let privateKey = null;
let lastImageHash = null;

/**
 * Load SSH private key
 */
function loadPrivateKey() {
    if (privateKey) return privateKey;

    try {
        privateKey = fs.readFileSync(CONFIG.SSH_KEY_PATH);
        log.success(`SSH key loaded from ${styled(CONFIG.SSH_KEY_PATH, c.dim)}`);
        return privateKey;
    } catch (e) {
        throw new Error(`Cannot load SSH key: ${e.message}\nExpected at: ${CONFIG.SSH_KEY_PATH}`);
    }
}

/**
 * Simple hash to detect if image changed
 */
function getFileHash(filePath) {
    try {
        const stats = fs.statSync(filePath);
        return `${stats.size}-${stats.mtimeMs}`;
    } catch (e) {
        return null;
    }
}

/**
 * Get SSH connection options
 */
function getConnectionOptions() {
    return {
        host: CONFIG.KINDLE_IP,
        port: CONFIG.SSH_PORT,
        username: CONFIG.KINDLE_USER,
        privateKey: loadPrivateKey(),
        keepaliveInterval: 30000,
        keepaliveCountMax: 10,
        readyTimeout: 20000,
    };
}

/**
 * Execute command on Kindle and return output
 */
function execCommand(command) {
    return new Promise((resolve, reject) => {
        const conn = new Client();

        conn.on('ready', () => {
            conn.exec(command, (err, stream) => {
                if (err) {
                    conn.end();
                    return reject(err);
                }

                let stdout = '';
                let stderr = '';

                stream.on('data', (data) => {
                    stdout += data.toString();
                });

                stream.stderr.on('data', (data) => {
                    stderr += data.toString();
                });

                stream.on('close', (code) => {
                    conn.end();
                    resolve({ code, stdout, stderr });
                });
            });
        }).on('error', (err) => {
            reject(err);
        }).connect(getConnectionOptions());
    });
}

/**
 * Wake Kindle screen
 */
async function wakeKindle() {
    try {
        await execCommand('lipc-set-prop com.lab126.powerd preventScreenSaver 1');
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Set Kindle frontlight brightness
 * @param {number} level - 0 (off) to 24 (max brightness)
 */
async function setFrontlight(level = 0) {
    try {
        const clampedLevel = Math.max(0, Math.min(24, level));
        await execCommand(`lipc-set-prop com.lab126.powerd flIntensity ${clampedLevel}`);
        log.info(`Frontlight: ${styled(String(clampedLevel), c.yellow)}/24`);
        return true;
    } catch (e) {
        log.warn('Frontlight command failed');
        return false;
    }
}

/**
 * Test SSH connection
 */
async function testConnection() {
    log.info('Testing SSH connection...');
    const result = await execCommand('ls /tmp');
    if (result.code === 0) {
        log.success('Connection established');
    } else {
        throw new Error('Command failed');
    }
    return true;
}

/**
 * Sync frontlight settings from server and apply to Kindle
 */
async function syncFrontlight() {
    try {
        const http = require('http');
        const flSettings = await new Promise((resolve) => {
            http.get('http://localhost:3000/api/config/frontlight', (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try { resolve(JSON.parse(data)); }
                    catch { resolve({ enabled: false, brightness: 0 }); }
                });
            }).on('error', () => resolve({ enabled: false, brightness: 0 }));
        });

        const brightness = flSettings.enabled ? flSettings.brightness : 0;
        await setFrontlight(brightness);
    } catch (e) {
        // Silently fail - will retry next cycle
    }
}

/**
 * Main function to push image to Kindle
 */
async function pushToKindle() {
    // Check if new image exists
    if (!fs.existsSync(CONFIG.LOCAL_IMAGE)) {
        return;
    }

    // Check hash
    const currentHash = getFileHash(CONFIG.LOCAL_IMAGE);
    if (!currentHash || currentHash === lastImageHash) {
        // Image hasn't changed
    }

    console.log(`${log.time()} ${styled('Pushing to Kindle...', c.magenta)}`);
    const connOpts = getConnectionOptions();

    try {
        await new Promise((resolve, reject) => {
            const client = new Client();

            client.on('ready', () => {
                log.success('Connected');

                // Wake Kindle and sync frontlight settings
                wakeKindle().then(() => syncFrontlight()).then(() => {
                    client.sftp((err, sftp) => {
                        if (err) {
                            client.end();
                            return reject(err);
                        }

                        log.success('SFTP session opened');

                        sftp.fastPut(CONFIG.LOCAL_IMAGE, CONFIG.REMOTE_PATH, {}, (err) => {
                            if (err) {
                                client.end();
                                return reject(err);
                            }

                            log.success('Image transferred');
                            lastImageHash = currentHash;

                            // Execute eips
                            client.exec(`eips -g ${CONFIG.REMOTE_PATH}`, (err, stream) => {
                                if (err) {
                                    client.end();
                                    return reject(err);
                                }

                                stream.on('close', () => {
                                    console.log(styled('  ✓ Display updated!', c.green, c.bold));
                                    sftp.end();
                                    client.end();
                                    resolve();
                                });

                                stream.on('data', (data) => log.info(`→ ${data}`));
                                stream.stderr.on('data', (data) => log.error(`${data}`));
                            });
                        });
                    });
                });
            }).on('error', (err) => {
                reject(err);
            }).connect(connOpts);
        });
    } catch (e) {
        log.error(`Connection error: ${e.message}`);

        if (e.message.includes('Timed out') || e.message.includes('Connection refused')) {
            log.warn('Retrying in 5 seconds...');
        }
    }
}

/**
 * Clear Kindle screen
 */
async function clearScreen() {
    log.kindle('Clearing screen...');
    const result = await execCommand('eips -c');
    if (result.code === 0) {
        log.success('Screen cleared');
    } else {
        log.warn(`Clear failed: ${result.stderr}`);
    }
    return result.code === 0;
}

/**
 * Start the push loop
 */
async function startPushLoop() {
    console.log('');
    console.log(styled('  ╔═══════════════════════════════════════════════════════╗', c.magenta));
    console.log(styled('  ║', c.magenta) + styled('  📤  KINDLE DISPLAY PUSH                              ', c.bold, c.white) + styled('║', c.magenta));
    console.log(styled('  ╠═══════════════════════════════════════════════════════╣', c.magenta));
    console.log(styled('  ║', c.magenta) + `  ${styled('Kindle:', c.dim)}   ${styled(CONFIG.KINDLE_IP, c.cyan)}`.padEnd(66) + styled('║', c.magenta));
    console.log(styled('  ║', c.magenta) + `  ${styled('Auth:', c.dim)}     ${styled('SSH Key', c.green)} (${styled(CONFIG.SSH_KEY_PATH.split(path.sep).pop(), c.dim)})`.padEnd(76) + styled('║', c.magenta));
    console.log(styled('  ║', c.magenta) + `  ${styled('Interval:', c.dim)} Every ${styled(`${CONFIG.PUSH_INTERVAL_MS / 1000}s`, c.yellow)}`.padEnd(68) + styled('║', c.magenta));
    console.log(styled('  ╚═══════════════════════════════════════════════════════╝', c.magenta));
    console.log('');

    // Test connection first
    try {
        loadPrivateKey();
        await testConnection();
        await wakeKindle();
        await clearScreen();
        await syncFrontlight();
    } catch (e) {
        log.error(`Cannot connect to Kindle: ${e.message}`);
        console.log('');
        console.log(styled('  ─── Troubleshooting ───', c.yellow, c.bold));
        console.log(styled('  1. Is the Kindle connected to WiFi?', c.dim));
        console.log(styled('  2. Is USBNetwork enabled (WiFi mode)?', c.dim));
        console.log(styled(`  3. Can you ping ${CONFIG.KINDLE_IP}?`, c.dim));
        console.log(styled(`  4. SSH key at: ${CONFIG.SSH_KEY_PATH}`, c.dim));
        console.log('');
        log.warn('Will keep retrying connection...');
    }

    // Initial push
    try {
        await pushToKindle();
    } catch (e) {
        log.error(`First push failed: ${e.message}`);
    }

    // Periodic push
    setInterval(async () => {
        try {
            await pushToKindle();
        } catch (e) {
            log.error(`Push loop error: ${e.message}`);
        }
    }, CONFIG.PUSH_INTERVAL_MS);
}

// Start
startPushLoop();
