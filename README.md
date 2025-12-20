# VectorClock - E-Ink Flight Tracker

A smart flight tracker and clock designed for Raspberry Pi with E-Ink displays. Shows real-time aircraft overhead with instant local lookups, weather, and flight statistics.

![E-Ink Display](screenshots/eink_frame.png)

## Features

### Core
- **Real-time Flight Tracking** via OpenSky Network
- **Local Aircraft Database**: 616,000+ aircraft in SQLite for instant lookups
- **E-Ink Optimized**: High-contrast UI for 800x480 monochrome displays
- **Kindle Mode**: Works on jailbroken Kindles

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

## Installation

```bash
git clone <repository-url>
cd vector-clock
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

## Usage

| Mode | Command | Description |
|------|---------|-------------|
| Desktop | `npm start` | Open http://localhost:3000 |
| E-Ink | `npm run eink` | Puppeteer → screenshots/eink_frame.png |
| Kindle | `npm run kindle` | Access at http://<pi-ip>:3000/kindle |
| Stats | - | http://localhost:3000/stats.html |

**Settings**: Press **S** to open settings panel (radius, scan interval, API mode).

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/opensky` | Proxied OpenSky flight data |
| `GET /api/aircraft-meta/:icao24` | Local DB lookup |
| `GET /api/flight-info/:callsign` | Route data (AirLabs/AeroDataBox) |
| `GET /api/config/api-mode` | Current API mode |
| `GET /api/config/quota` | AirLabs quota usage |
| `GET /api/weather` | Open-Meteo weather |
| `GET /api/logo/:icao` | Airline logo |
| `GET /api/stats` | Flight statistics |

## Project Structure

```
├── server.js          # Backend API
├── app.js             # Frontend logic
├── render.js          # E-Ink screenshot renderer
├── setup.js           # CLI config wizard
├── csv_to_db.py       # CSV → SQLite converter
├── aircraft.db        # 616k aircraft records
├── index.html         # E-Ink display
├── stats.html         # Stats dashboard
├── webview.html       # Desktop view
├── assets/            # Airline logos (SVG)
└── flightaware_logos/ # FlightAware logos (PNG)
```

## Hardware

- Raspberry Pi Zero 2 W / 3B+ / 4 / 5
- Waveshare 4.26" E-Ink HAT (800×480)
- Or: Jailbroken Kindle

## License

MIT
