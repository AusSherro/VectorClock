# Deployment Files

When moving this project to a Raspberry Pi, ensure you transfer the following core files:

## Core Application
- `package.json`
- `package-lock.json`
- `server.js`
- `app.js`
- `render.js`
- `setup.js`
- `styles.css`
- `index.html`
- `webview.html`

## Documentation (Optional but recommended)
- `README.md`
- `CHANGELOG.md`

## Installation on Pi
1. Transfer the files above to a folder (e.g., `~/vector-clock`).
2. Run `npm install` to install dependencies (puppeteer, express, axios, etc.).
3. Run `npm run setup` to configure location and keys.
4. Run `npm run eink` to start.

## Notes
- The `logos/` and `screenshots/` directories will be created automatically.
- `config.json` and `trigger.txt` will be created by the application/setup.
