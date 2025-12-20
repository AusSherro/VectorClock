# Changelog

## [1.0.0] - E-Ink & Stability Update

### Added
- **E-Ink Support**: Optimized `index.html` and `styles.css` for 800x480 resolution.
  - Added strict monochrome styling.
  - Hidden status bars and non-essential UI elements in `eink-mode`.
- **Configuration Wizard**: New `npm run setup` script for easy location and API configuration.
- **Instant Updates**: Implemented a file-watcher system (`trigger.txt`) to immediately refresh the E-Ink display when flights appear or disappear.
- **Airline Logos**: Backend now proxies and caches logos from FlightRadar24 (`/api/logo/:icao`), converting them to monochrome-friendly formats/fallbacks.
- **Renderer**: `render.js` now uses Puppeteer to capture `screenshots/eink_frame.png` for display drivers.

### Fixed
- **Weather API**: Switched from `node-fetch` to `axios` and forced IPv4 to resolve timeouts and DNS issues. Added `User-Agent` headers.
- **UI Cleanliness**: Fixed issue where "Fetching..." and "Scanning..." text persisted on screen. Now hidden via global CSS rules.
- **Stability**: Added automatic server restart handling in renderer and robust error logging.

### Changed
- **Project Structure**: 
  - `index.html` is now the E-Ink dedicated view.
  - Original full-color view renamed to `webview.html` (accessible via `iframe` or direct load if needed).
- **Dependencies**: Added `axios` and `puppeteer`.
