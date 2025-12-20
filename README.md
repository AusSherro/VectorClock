# VectorClock (E-Ink Edition)

A smart flight tracker and clock designed for Raspberry Pi with a Waveshare 4.26" E-Ink display (800x480). It displays real-time aircraft information, weather, and ISS position in a clean, high-contrast interface.

![E-Ink Display](screenshots/eink_frame.png)

## Features

- **Real-time Flight Tracking**: Uses OpenSky Network to track aircraft within a configurable radius.
- **E-Ink Optimization**:
  - High-contrast, bold UI designed for 800x480 monochrome displays.
  - "Global Refresh" logic to prevent ghosting.
  - **Instant Updates**: Immediately refreshes the screen when a flight enters/leaves, bypassing the clock interval.
- **Smart Data**:
  - **Airline Logos**: Automatically fetches and caches airline logos from FlightRadar24.
  - **Weather**: Current temperature, wind, and conditions via Open-Meteo (IPv4 forced for stability).
  - **ISS Integration**: Alerts when the International Space Station is nearby/overhead.
- **Configuration Wizard**: Easy CLI menu to set location and API keys.

## Hardware Requirements

- **Raspberry Pi** (Zero 2 W, 3B+, 4, or 5)
- **Waveshare 4.26inch E-Ink Display HAT** (800×480)
- Internet Connection

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd flight-tracker
   ```

2. Install dependencies:
   ```bash
   npm install
   ```
   *Note: This installs Puppeteer (Chromium), which is used to render the screen.*

## Configuration

Run the automated setup wizard to configure your location and API keys:

```bash
npm run setup
```

- **Location**: Auto-detect via IP or enter coordinates manually.
- **OpenSky API**: Optional. Add your credentials to increase rate limits and see more flights.

## Usage

### On Raspberry Pi (E-Ink Mode)

Run the full stack (Server + Renderer):

```bash
npm run eink
```

This starts:
1. **Node Server** (`Enable-IPv4`): Fetches flight/weather data.
2. **Puppeteer Renderer**: Captures the UI and saves it to `screenshots/eink_frame.png` for your E-Ink driver to pick up.

### On Desktop (Development)

To view the web interface:

```bash
npm start
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

- `server.js`: Backend API proxy (Weather, OpenSky, Logos). Handles caching and IPv4 enforcement.
- `app.js`: Frontend logic. Manages display state, flight rotation, and "Trigger" signaling.
- `render.js`: Puppeteer script. Watches `trigger.txt` for immediate updates and screenshots the UI.
- `setup.js`: CLI configuration tool.
- `styles.css`: CSS variables and E-Ink specific overrides (`eink-mode`).

## License

MIT
