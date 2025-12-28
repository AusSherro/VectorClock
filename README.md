# VectorClock - E-Ink Flight Tracker

A smart flight tracker and clock designed for Raspberry Pi with E-Ink displays. Shows real-time aircraft overhead with instant local lookups, weather, and flight statistics.

![E-Ink Display](screenshots/eink_frame.png)

## Features

### Core
- **Real-time Flight Tracking** via ADSB.lol (default) or OpenSky Network
- **Local Aircraft Database**: 616,000+ aircraft in SQLite for instant lookups
- **E-Ink Optimized**: High-contrast UI for 800x480 monochrome displays
- **Kindle Mode**: Works on jailbroken Kindle Paperwhite

### Data Sources
- **AirLabs API** (Free tier): 1,000 calls/month for route data
- **API.market/AeroDataBox**: Unlimited paid option
- **Local SQLite**: Instant manufacturer/model/operator lookups
- **Open-Meteo**: Weather data

### Smart Features
- **3-Way API Mode**: Free (AirLabs) / Paid (AeroDataBox) / Off
- **First-Time Model Detection**: Shows `NEW★` for new aircraft types
- **ADSB.lol Special Alerts**: Real-time alerts for Military, Emergency, and VIP aircraft
- **Rare Aircraft Alerts**: Highlights A380, 787, RAAF C-17, F-35, etc.
- **Stats Dashboard**: Track sightings, rare aircraft, unique models
- **1,300+ Airline Logos**: Local icons with fallback fetching
- **Remote Settings**: Configure radius, interval, API mode via web UI
- **Literature Clock**: 1,400+ literary quotes replace digital time (toggleable)
- **Spotify Now Playing**: Shows currently playing track with dithered album art
- **Kindle Frontlight Control**: Toggle backlight and brightness remotely

## Installation

```bash
git clone https://github.com/AusSherro/VectorClock.git
cd VectorClock
npm install
```

### Create Aircraft Database (Optional)
```bash
python csv_to_db.py
```
Requires `aircraft-database-complete-2025-08.csv` (31MB, not in repo).

## Configuration

```bash
npm run setup
```

Set location, OpenSky credentials, and API keys.

### Remote Configuration
Access the settings page at `http://<pi-ip>:3000/settings.html` to configure:
- **Scan Radius**: Coverage area (1-50 km)
- **Scan Interval**: Update frequency (10-120 seconds)
- **API Mode**: Free / Paid / Off
- **Kindle Settings**: IP, frontlight brightness, and connection options

## Usage

| Mode | Command | Description |
|------|---------|-------------|
| Desktop | `npm start` | Open http://localhost:3000 |
| E-Ink | `npm run eink` | Puppeteer → screenshots/eink_frame.png |
| Pi E-Paper | `npm run epaper` | Native Python driver for Waveshare HAT |
| Kindle | `npm run kindle` | SSH push to Kindle every 15s |
| Stats | - | http://localhost:3000/stats.html |
| Settings | - | http://localhost:3000/settings.html |

**Keyboard Shortcuts**: Press **S** to open settings panel (radius, scan interval, API mode).

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/opensky` | Proxied OpenSky flight data |
| `GET /api/aircraft-meta/:icao24` | Local DB lookup |
| `GET /api/flight-info/:callsign` | Route data (AirLabs/AeroDataBox) |
| `GET /api/config/api-mode` | Current API mode |
| `GET /api/config/quota` | AirLabs quota usage |
| `GET /api/config/interval` | Scan interval settings |
| `GET /api/config/location` | Scan location & radius |
| `GET /api/config/frontlight` | Kindle frontlight settings |
| `GET /api/weather` | Open-Meteo weather |
| `GET /api/logo/:icao` | Airline logo |
| `GET /api/stats` | Flight statistics |

## Project Structure

```
├── server.js          # Backend API & config endpoints
├── app.js             # Frontend flight tracking logic
├── render.js          # E-Ink screenshot renderer (Puppeteer)
├── kindle-display.js  # Kindle SSH push & display
├── epaper-display.py  # Native Python e-paper driver (Pi Zero 2 W)
├── start_kindle.js    # Kindle mode orchestrator
├── setup.js           # CLI config wizard
├── csv_to_db.py       # CSV → SQLite converter
├── aircraft.db        # 616k aircraft records (generated)
├── airlines.json      # ICAO → airline slug mappings
├── index.html         # E-Ink display UI
├── stats.html         # Stats dashboard
├── settings.html      # Remote configuration UI
├── webview.html       # Desktop preview
├── styles.css         # Shared styles
├── assets/            # Airline logos (SVG)
└── flightaware_logos/ # FlightAware logos (PNG)
```

## Hardware

- Raspberry Pi Zero 2 W / 3B+ / 4 / 5
- Waveshare 4.26" E-Ink HAT (800×480)
- Or: Jailbroken Kindle Paperwhite (7th gen)

## Raspberry Pi E-Paper Setup

For native e-paper display using Waveshare 4.26" HAT on Pi Zero 2 W:

### Hardware Setup
1. Attach the 4.26" E-Paper HAT to the Pi's 40-pin GPIO header
2. Enable SPI: `sudo raspi-config` → Interface Options → SPI → Enable

### Software Setup
```bash
# Install system dependencies
sudo apt-get update
sudo apt-get install python3-pip python3-pil python3-numpy

# Install Python libraries
pip3 install -r requirements-pi.txt

# Clone Waveshare driver library
git clone https://github.com/waveshare/e-Paper.git
cp e-Paper/RaspberryPi_JetsonNano/python/lib/waveshare_epd/epd4in26.py ./
```

### Running
```bash
# Option 1: Run with Node.js server (full features)
npm start &                    # Start server in background
python3 epaper-display.py      # Start e-paper display

# Option 2: Standalone display (connects to remote server)
SERVER_URL=http://192.168.1.100:3000 python3 epaper-display.py
```

The e-paper driver features:
- **Partial refresh** for clock updates (~0.3s vs 3s)
- **Minute-accurate** clock sync
- **Flight detection** triggers instant partial refresh
- **Full refresh** every 6 hours to prevent ghosting

## Kindle Setup


Key requirements:
- Jailbroken Kindle with KUAL and USBNetwork
- SSH key authentication configured
- Run `npm run kindle` to start push mode

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

Current version: **v1.8.0** - Album Art & Music Mode

## License

MIT
