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
- `airlines.json` - ICAO to airline slug mappings
- `csv_to_db.py` - Database converter (only if regenerating DB)
- `aircraft-database-complete-2025-08.csv` - Source CSV (only if regenerating)

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
- `flight_stats.json` - Flight sighting history

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
