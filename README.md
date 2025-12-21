# VectorClock - E-Ink Flight Tracker

A smart flight tracker and clock designed for Raspberry Pi with E-Ink displays. Shows real-time aircraft overhead with instant local lookups, weather, and flight statistics.

![E-Ink Display](screenshots/eink_frame.png)

## Features

### Core
- **Real-time Flight Tracking** via OpenSky Network
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
- **Rare Aircraft Alerts**: Highlights A380, 787, RAAF C-17, F-35, etc.
- **Stats Dashboard**: Track sightings, rare aircraft, unique models
- **1,300+ Airline Logos**: Local icons with fallback fetching
- **Remote Settings**: Configure radius, interval, API mode via web UI
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

## Kindle Setup

See [DEPLOY.md](DEPLOY.md) for detailed Kindle jailbreak and configuration instructions.

Key requirements:
- Jailbroken Kindle with KUAL and USBNetwork
- SSH key authentication configured
- Run `npm run kindle` to start push mode

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

Current version: **v1.4.0** - Stats Redesign & Remote Settings

## License

MIT
