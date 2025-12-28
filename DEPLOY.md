# Deployment Guide

Deploy VectorClock to your Raspberry Pi with these steps.

## Required Files

### Core Application
- `package.json` / `package-lock.json`
- `server.js`
- `app.js`
- `render.js`
- `setup.js`
- `styles.css`
- `index.html`
- `webview.html`

### Data Files
- `aircraft.db` - Local aircraft database (46MB, 616k records)

### Assets (Optional but recommended)
- `assets/` - Local airline logo SVGs
- `flightaware_logos/` - FlightAware PNG logos (1300+)

## Installation on Pi

```bash
# 1. Transfer files to Pi
scp -r ./vector-clock pi@raspberrypi:~/

# 2. SSH into Pi
ssh pi@raspberrypi

# 3. Install dependencies
cd ~/vector-clock
npm install

# 4. Configure location and API keys
npm run setup

# 5. Start the application
npm run eink
```

## Auto-generated Files
These are created automatically:
- `config.json` - Location and API keys
- `trigger.txt` - E-Ink update trigger
- `screenshots/` - Rendered frames
- `logos/` - Cached airline logos
- `flight_stats.db` - Flight sighting history (SQLite)

## Memory Considerations (Pi Zero 2 W)

The `aircraft.db` file is 46MB but queries are instant via indexed lookups. If regenerating the database from CSV:

```bash
python csv_to_db.py
```

This uses chunked reading (10k rows at a time) to stay within memory limits.

## Running as a Service

Create `/etc/systemd/system/vectorclock.service`:

```ini
[Unit]
Description=VectorClock Flight Tracker
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/vector-clock
ExecStart=/usr/bin/npm run eink
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl enable vectorclock
sudo systemctl start vectorclock
```

---

## Native E-Paper Display (Waveshare 4.26" HAT)

The preferred mode for production deployment on Raspberry Pi Zero 2 W.

### Setup
```bash
# Enable SPI
sudo raspi-config  # Interface Options → SPI → Enable

# Install Python dependencies
pip3 install -r requirements-pi.txt

# Clone Waveshare library
git clone https://github.com/waveshare/e-Paper.git
cp e-Paper/RaspberryPi_JetsonNano/python/lib/waveshare_epd/epd4in26.py ./
```

### Run with Server
```bash
npm start &                  # Start Node.js server in background
python3 epaper-display.py    # Start e-paper display driver
```

### Run as Service
Create `/etc/systemd/system/vectorclock-epaper.service`:
```ini
[Unit]
Description=VectorClock E-Paper Display
After=network.target vectorclock.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/vector-clock
ExecStart=/usr/bin/python3 epaper-display.py
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable:
```bash
sudo systemctl enable vectorclock-epaper
sudo systemctl start vectorclock-epaper
```

### Features
- **Partial refresh**: Clock updates in ~0.3s (vs 3s full refresh)
- **Anti-ghosting**: Full refresh every 6 hours
- **Low power**: No browser/Puppeteer overhead
- **Memory efficient**: Designed for Pi Zero's 512MB RAM

---


## Kindle Paperwhite Display (Temporary/Testing)

Use a jailbroken Kindle Paperwhite as an E-Ink display before buying dedicated hardware.

### Requirements
- Kindle Paperwhite 7th gen (jailbroken)
- USBNetwork extension installed
- SSH key configured at `~/.ssh/id_rsa_kindle`

### Kindle Setup
1. Jailbreak the Kindle using [kindlemodding.org](https://kindlemodding.org)
2. Install KUAL and USBNetwork
3. Enable WiFi SSH: Type `;un` in Kindle search bar
4. Configure SSH key authentication:
   ```bash
   ssh-keygen -t rsa -f ~/.ssh/id_rsa_kindle
   # Copy public key to Kindle's /mnt/us/usbnet/etc/authorized_keys
   ```

### 3. Remote Configuration (NEW)
You can configure settings without SSH by visiting the Settings page:
`http://<pi-ip>:3000/settings.html`

- **Scan Radius**: Adjust coverage area (default 5km)
- **Scan Interval**: Adjust update frequency (default 30s)
- **API Mode**: Toggle between Free/Paid/Off
- **Kindle Config**: Set IP and monitoring options for the display

### 4. Kindle Connection Stability (NEW)
The system now includes auto-wake and keep-alive features to prevent the Kindle from sleeping or timing out.
- SSH Keep-Alive packets sent every 30s
- `lipc-set-prop` wake commands sent before every push
- Auto-retry logic for connection drops

If connection still fails, check:
1.  **USBNetwork**: Ensure it's enabled (`;un` in search bar, then toggle to "USBNetwork")
2.  **WiFi Prevent Sleep**: Install the "Prevent Screen Saver" KUAL extension or run:
    ```bash
    lipc-set-prop com.lab126.powerd preventScreenSaver 1
    ```
    (The script attempts to run this automatically via SSH)

### Running
```bash
npm run kindle
```

This will:
1. Start the server on port 3000
2. Render at 800x480 with 1.8x scale (fills Kindle screen)
3. Rotate 90° for landscape viewing
4. Convert to 8-bit grayscale (required by eips)
5. Push to Kindle every 15 seconds

### Configuration
Edit `kindle-display.js` to change:
- `KINDLE_IP` - Your Kindle's IP address (default: 192.168.68.123)
- `PUSH_INTERVAL_MS` - Update frequency (default: 15000ms)

### Troubleshooting
- **Connection timeout**: Wake up Kindle, re-enable USBNetwork (`;un`)
- **White screen**: Image format issue - ensure 8-bit grayscale
- **Small image**: Ensure render.js has correct scale factor (1.8x)

> **Note**: The main `npm start` and `npm run eink` commands are NOT affected by Kindle changes. They work with the standard Waveshare E-Ink display.

