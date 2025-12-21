# Changelog

## [1.4.0] - 2025-12-21 - Stats Redesign & Remote Settings

### Added
- **Remote Configuration** (`/settings.html`):
  - Configure Scan Radius (km) and Interval (seconds)
  - Toggle API Mode (Free/Paid/Off)
  - Manage Kindle IP and settings
  - Set Manual Location coordinates
- **Stats Page Redesign** (`/stats.html`):
  - New modern UI with navigation bar and tabs
  - "Today" and "This Week" counters
  - "Flights by Hour" bar chart
  - Search/Filter for Recent Sightings
  - Sortable table columns
- **Kindle Connection Stability**:
  - SSH Keep-Alive (every 30s) preventing timeouts
  - Auto-wake command (`lipc-set-prop`) before updates
  - Robust retry logic for connection failures

### Changed
- Server now exposes `/api/config/interval` and `/api/config/location`
- `app.js` syncs settings from server every 60 seconds
- `kindle-display.js` completely rewritten for reliability

---

## [1.3.0] - 2025-12-21 - Kindle Paperwhite Display Support

### Added
- **Kindle Display Mode**: Use jailbroken Kindle Paperwhite as E-Ink display
  - SSH key authentication for secure connection
  - Auto-scaling: 800x480 → 1072x1448 (1.8x scale factor)
  - 90° rotation for landscape viewing
  - 8-bit grayscale conversion for eips compatibility
- **New Files**:
  - `kindle-display.js` - SCP/SSH push to Kindle
  - `start_kindle.js` - Orchestrates server + renderer + push
- **New Command**: `npm run kindle` - Full Kindle display mode

### Technical Details
- Kindle Paperwhite 7th gen: 1072x1448 framebuffer with rotate:3
- Uses `sharp` for image processing (rotate, resize, grayscale)
- Uses `ssh2` for SFTP transfer and remote command execution
- Pushes to Kindle every 15 seconds via `eips -g` command

---

## [1.2.0] - 2025-12-21 - AirLabs Integration & Stats Dashboard

### Added
- **AirLabs API Integration**: Free tier (1,000 calls/month) for route data
  - Query by flight_icao (callsign), returns origin/destination/aircraft
  - Perfect for personal use desk clocks
- **3-Way API Mode**: Free (AirLabs) / Paid (AeroDataBox) / Off
  - Settings panel with radio buttons
  - Quota display shows usage (X/1000)
- **Rare Aircraft Detection**: 45+ types including:
  - Widebodies: A380, A350, 787, 777, 747
  - RAAF Military: C-17, KC-30A, E-7A Wedgetail, P-8A Poseidon, F-35
  - Classics: A340, MD-11, DC-10, Concorde
  - Private jets: G650, G700, Global Express
- **First-Time Model Detection**: Shows `NEW★` when a new aircraft type flies over
- **Enhanced Stats Dashboard** (`/stats.html`):
  - Rare Sightings count and table
  - Unique Models with first-seen dates
  - Countries count
  - Aircraft Model Timeline

### Changed
- Expanded ICAO_TO_SLUG mapping for Australian airlines (VOZ, VAU, JST, etc.)
- recordFlightSighting now sends typecode, country, distance, altitude

---

## [1.1.0] - 2025-12-21 - Local Aircraft Database

### Added
- **Local SQLite Database**: 616k aircraft records for instant lookups
- **Database Converter**: `csv_to_db.py` Python script
- **New Endpoint**: `GET /api/aircraft-meta/:icao24`

### Changed
- Aircraft display shows "Manufacturer Model" (bold styling)
- Dependencies: Added `better-sqlite3`

---

## [1.0.0] - E-Ink & Stability Release

### Added
- E-Ink optimized UI (800x480 monochrome)
- Configuration wizard (`npm run setup`)
- Airline logo proxying and caching
- Puppeteer renderer for E-Ink screenshots

### Fixed
- Weather API IPv4/timeout issues
- UI artifact cleanup
