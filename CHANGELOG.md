# Changelog

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
