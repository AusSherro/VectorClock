#!/usr/bin/env python3
"""
VectorClock E-Paper Display Driver
For Waveshare 4.26" E-Paper HAT (800x480) on Raspberry Pi Zero 2 W

Native Python renderer - draws directly to display without intermediate images.
Uses partial refresh for clock/flight updates, full refresh periodically.

Key Features:
- Minute-accurate clock updates via partial refresh (~0.3s)
- Flight detection triggers partial refresh
- Full refresh every 6 hours to prevent ghosting
- Fetches data from the Node.js server APIs

Setup on Pi:
1. Enable SPI: sudo raspi-config -> Interface Options -> SPI -> Enable
2. Install deps: sudo apt-get install python3-pip python3-pil python3-numpy
3. Install libs: sudo pip3 install RPi.GPIO spidev requests
4. Clone Waveshare lib: git clone https://github.com/waveshare/e-Paper.git
5. Copy driver: cp e-Paper/RaspberryPi_JetsonNano/python/lib/waveshare_epd/epd4in26.py ./
"""

import os
import sys
import time
import json
import signal
import logging
from datetime import datetime
from threading import Thread, Event
from typing import Optional, Dict, Any, Tuple

# Try to import display libraries (will fail on non-Pi systems)
try:
    from PIL import Image, ImageDraw, ImageFont
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False
    print("⚠ PIL not available - install with: pip3 install Pillow")

try:
    from waveshare_epd import epd4in26
    EPAPER_AVAILABLE = True
except ImportError:
    EPAPER_AVAILABLE = False
    print("⚠ Waveshare EPD library not found - display simulation mode")

try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False
    print("⚠ requests not available - install with: pip3 install requests")

# ═══════════════════════════════════════════════════════════════
# Configuration
# ═══════════════════════════════════════════════════════════════

# Display dimensions (Waveshare 4.26")
DISPLAY_WIDTH = 800
DISPLAY_HEIGHT = 480

# Server configuration
SERVER_URL = os.environ.get('SERVER_URL', 'http://localhost:3000')

# Timing configuration
CLOCK_UPDATE_INTERVAL = 60      # Update clock every 60 seconds (on the minute)
FLIGHT_CHECK_INTERVAL = 15      # Check for flights every 15 seconds
WEATHER_UPDATE_INTERVAL = 600   # Update weather every 10 minutes
FULL_REFRESH_INTERVAL = 21600   # Full refresh every 6 hours (prevents ghosting)

# Font paths (adjust for your system)
FONT_PATHS = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    'C:/Windows/Fonts/arial.ttf',  # Windows fallback for testing
]

# Logging setup
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)s | %(message)s',
    datefmt='%H:%M:%S'
)
log = logging.getLogger('epaper')

# ═══════════════════════════════════════════════════════════════
# Font Manager
# ═══════════════════════════════════════════════════════════════

class FontManager:
    """Manages fonts with fallback support."""
    
    def __init__(self):
        self.fonts: Dict[str, ImageFont.FreeTypeFont] = {}
        self.base_path = self._find_font()
        
    def _find_font(self) -> Optional[str]:
        """Find an available font on the system."""
        for path in FONT_PATHS:
            if os.path.exists(path):
                return path
        return None
    
    def get(self, size: int, bold: bool = True) -> ImageFont.FreeTypeFont:
        """Get a font at the specified size."""
        key = f"{size}_{bold}"
        if key not in self.fonts:
            if self.base_path:
                try:
                    self.fonts[key] = ImageFont.truetype(self.base_path, size)
                except Exception:
                    self.fonts[key] = ImageFont.load_default()
            else:
                self.fonts[key] = ImageFont.load_default()
        return self.fonts[key]


# ═══════════════════════════════════════════════════════════════
# Data Fetcher
# ═══════════════════════════════════════════════════════════════

class DataFetcher:
    """Fetches data from the VectorClock server APIs."""
    
    def __init__(self, server_url: str):
        self.server_url = server_url.rstrip('/')
        self.location = {'latitude': -33.9117, 'longitude': 151.1552, 'name': 'Sydney'}
        self.last_flight = None
        self.weather = None
        
    def fetch_json(self, endpoint: str, timeout: int = 10) -> Optional[Dict]:
        """Fetch JSON from an API endpoint."""
        if not REQUESTS_AVAILABLE:
            return None
        try:
            url = f"{self.server_url}{endpoint}"
            response = requests.get(url, timeout=timeout)
            if response.status_code == 200:
                return response.json()
        except Exception as e:
            log.warning(f"API error {endpoint}: {e}")
        return None
    
    def get_location(self) -> Dict:
        """Fetch configured location from server."""
        data = self.fetch_json('/api/config/location')
        if data and 'latitude' in data:
            self.location = data
        return self.location
    
    def get_weather(self) -> Optional[Dict]:
        """Fetch current weather."""
        data = self.fetch_json('/api/weather')
        if data:
            self.weather = data
        return self.weather
    
    def get_flights(self) -> Optional[Dict]:
        """Fetch nearby flights."""
        loc = self.location
        lat, lon = loc['latitude'], loc['longitude']
        
        # Create bounding box (roughly 50km)
        delta = 0.5
        endpoint = f"/api/opensky?lamin={lat-delta}&lamax={lat+delta}&lomin={lon-delta}&lomax={lon+delta}"
        
        data = self.fetch_json(endpoint)
        if data and 'states' in data and data['states']:
            # Find closest flight
            closest = None
            min_dist = float('inf')
            
            for state in data['states']:
                if len(state) >= 7 and state[5] and state[6]:
                    # state[5] = longitude, state[6] = latitude
                    dist = self._haversine(lat, lon, state[6], state[5])
                    if dist < min_dist:
                        min_dist = dist
                        closest = {
                            'icao24': state[0],
                            'callsign': (state[1] or '').strip(),
                            'latitude': state[6],
                            'longitude': state[5],
                            'altitude': state[7] if len(state) > 7 else None,
                            'velocity': state[9] if len(state) > 9 else None,
                            'distance': round(dist, 1),
                            # ADSB.lol enriched data
                            'typecode': state[17] if len(state) > 17 else None,
                            'registration': state[18] if len(state) > 18 else None,
                        }
            
            return closest
        return None
    
    def get_special_alerts(self) -> Dict:
        """Fetch special aircraft alerts (military, emergency, VIP)."""
        loc = self.location
        endpoint = f"/api/special-alerts?lat={loc['latitude']}&lon={loc['longitude']}&range=100"
        return self.fetch_json(endpoint) or {'military': [], 'emergency': [], 'vip': []}
    
    def get_now_playing(self) -> Optional[Dict]:
        """Fetch Spotify now playing track."""
        data = self.fetch_json('/api/spotify/now-playing', timeout=5)
        if data and data.get('playing'):
            return data
        return None
    
    def _haversine(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculate distance between two points in km."""
        from math import radians, cos, sin, sqrt, atan2
        R = 6371  # Earth radius in km
        
        lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        
        a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
        c = 2 * atan2(sqrt(a), sqrt(1-a))
        
        return R * c


# ═══════════════════════════════════════════════════════════════
# Display Regions (for partial refresh)
# ═══════════════════════════════════════════════════════════════

class Region:
    """Defines a rectangular region for partial updates."""
    
    def __init__(self, x: int, y: int, width: int, height: int):
        self.x = x
        self.y = y
        self.width = width
        self.height = height
    
    @property
    def bounds(self) -> Tuple[int, int, int, int]:
        return (self.x, self.y, self.x + self.width, self.y + self.height)


# Pre-defined display regions
REGIONS = {
    'clock': Region(200, 160, 400, 160),      # Center - large clock
    'date': Region(250, 320, 300, 40),        # Below clock - date
    'weather': Region(0, 0, 250, 100),        # Top left - weather
    'flight': Region(0, 380, 800, 70),        # Bottom - flight info (reduced height)
    'now_playing': Region(0, 450, 800, 30),   # Very bottom - now playing
    'status': Region(550, 0, 250, 60),        # Top right - status
    'full': Region(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT),
}


# ═══════════════════════════════════════════════════════════════
# Display Renderer
# ═══════════════════════════════════════════════════════════════

class DisplayRenderer:
    """Renders content to the e-paper display."""
    
    def __init__(self):
        self.fonts = FontManager()
        self.epd = None
        self.image = None
        self.draw = None
        self.last_full_refresh = 0
        self.current_minute = -1
        self.current_flight = None
        
        self._init_display()
    
    def _init_display(self):
        """Initialize the e-paper display."""
        if EPAPER_AVAILABLE:
            try:
                self.epd = epd4in26.EPD()
                self.epd.init()
                self.epd.Clear()
                log.info("✓ E-Paper display initialized")
            except Exception as e:
                log.error(f"Display init failed: {e}")
                self.epd = None
        else:
            log.info("📺 Running in simulation mode (no display)")
        
        # Create image buffer
        if PIL_AVAILABLE:
            self.image = Image.new('1', (DISPLAY_WIDTH, DISPLAY_HEIGHT), 255)
            self.draw = ImageDraw.Draw(self.image)
    
    def clear(self):
        """Clear the entire display."""
        if self.draw:
            self.draw.rectangle([0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT], fill=255)
        if self.epd:
            self.epd.Clear()
        self.last_full_refresh = time.time()
        log.info("Display cleared")
    
    def _draw_clock(self, now: datetime):
        """Draw the main clock."""
        region = REGIONS['clock']
        
        # Clear region
        self.draw.rectangle(region.bounds, fill=255)
        
        # Draw time
        time_str = now.strftime('%H:%M')
        font = self.fonts.get(120)
        
        # Center the text
        bbox = self.draw.textbbox((0, 0), time_str, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        
        x = region.x + (region.width - text_width) // 2
        y = region.y + (region.height - text_height) // 2
        
        self.draw.text((x, y), time_str, font=font, fill=0)
    
    def _draw_date(self, now: datetime):
        """Draw the date below the clock."""
        region = REGIONS['date']
        
        # Clear region
        self.draw.rectangle(region.bounds, fill=255)
        
        # Draw date
        date_str = now.strftime('%A, %d %B')
        font = self.fonts.get(24)
        
        bbox = self.draw.textbbox((0, 0), date_str, font=font)
        text_width = bbox[2] - bbox[0]
        
        x = region.x + (region.width - text_width) // 2
        y = region.y + 5
        
        self.draw.text((x, y), date_str, font=font, fill=0)
    
    def _draw_weather(self, weather: Optional[Dict]):
        """Draw weather information."""
        region = REGIONS['weather']
        
        # Clear region
        self.draw.rectangle(region.bounds, fill=255)
        
        if not weather or 'temp' not in weather:
            return
        
        font_large = self.fonts.get(36)
        font_small = self.fonts.get(18)
        
        # Temperature
        temp_str = f"{weather['temp']}°C"
        self.draw.text((10, 10), temp_str, font=font_large, fill=0)
        
        # Condition
        condition = weather.get('condition', '')
        icon = weather.get('icon', '')
        self.draw.text((10, 55), f"{icon} {condition}", font=font_small, fill=0)
        
        # Humidity
        humidity = weather.get('humidity')
        if humidity:
            self.draw.text((10, 78), f"💧 {humidity}%", font=font_small, fill=0)
    
    def _draw_flight(self, flight: Optional[Dict]):
        """Draw flight information."""
        region = REGIONS['flight']
        
        # Clear region
        self.draw.rectangle(region.bounds, fill=255)
        
        if not flight:
            # Draw "No aircraft nearby" or leave empty
            font = self.fonts.get(20)
            self.draw.text((10, region.y + 40), "✈ Scanning for aircraft...", font=font, fill=0)
            return
        
        font_large = self.fonts.get(28)
        font_medium = self.fonts.get(22)
        font_small = self.fonts.get(18)
        
        y = region.y + 10
        
        # Callsign and distance
        callsign = flight.get('callsign', flight.get('icao24', 'Unknown'))
        distance = flight.get('distance', '?')
        self.draw.text((10, y), f"✈ {callsign}", font=font_large, fill=0)
        self.draw.text((350, y + 5), f"{distance} km away", font=font_medium, fill=0)
        
        y += 40
        
        # Aircraft type and registration
        typecode = flight.get('typecode', '')
        registration = flight.get('registration', '')
        
        info_parts = []
        if typecode:
            info_parts.append(typecode)
        if registration:
            info_parts.append(f"[{registration}]")
        
        altitude = flight.get('altitude')
        if altitude:
            info_parts.append(f"FL{int(altitude / 30.48):03d}")
        
        if info_parts:
            self.draw.text((10, y), ' • '.join(info_parts), font=font_small, fill=0)
    
    def _draw_status(self, special_alerts: Dict):
        """Draw status/alert indicators."""
        region = REGIONS['status']
        
        # Clear region
        self.draw.rectangle(region.bounds, fill=255)
        
        font = self.fonts.get(16)
        
        alerts = []
        if special_alerts.get('emergency'):
            alerts.append("🚨 EMERGENCY")
        if special_alerts.get('military'):
            alerts.append(f"🎖 MIL ({len(special_alerts['military'])})")
        if special_alerts.get('vip'):
            alerts.append("⭐ VIP")
        
        if alerts:
            y = region.y + 5
            for alert in alerts[:2]:  # Max 2 alerts
                self.draw.text((region.x + 5, y), alert, font=font, fill=0)
                y += 22
    
    def _draw_now_playing(self, now_playing: Optional[Dict]):
        """Draw Spotify now playing info."""
        region = REGIONS['now_playing']
        
        # Clear region
        self.draw.rectangle(region.bounds, fill=255)
        
        if not now_playing or not now_playing.get('playing'):
            return
        
        font = self.fonts.get(14)
        
        artist = now_playing.get('artist', '')
        track = now_playing.get('track', '')
        
        if artist and track:
            text = f"♪ {artist} — {track}"
            # Truncate if too long
            if len(text) > 80:
                text = text[:77] + "..."
            
            # Center the text
            bbox = self.draw.textbbox((0, 0), text, font=font)
            text_width = bbox[2] - bbox[0]
            x = (DISPLAY_WIDTH - text_width) // 2
            
            self.draw.text((x, region.y + 5), text, font=font, fill=0)
    
    def render_full(self, weather: Optional[Dict], flight: Optional[Dict], 
                    special_alerts: Dict = None, now_playing: Optional[Dict] = None):
        """Perform a full display render and refresh."""
        if not self.draw:
            return
        
        now = datetime.now()
        
        # Clear entire display
        self.draw.rectangle([0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT], fill=255)
        
        # Draw all elements
        self._draw_clock(now)
        self._draw_date(now)
        self._draw_weather(weather)
        self._draw_flight(flight)
        self._draw_status(special_alerts or {})
        self._draw_now_playing(now_playing)
        
        # Push to display
        if self.epd:
            self.epd.display(self.epd.getbuffer(self.image))
            self.last_full_refresh = time.time()
            log.info("Full refresh complete")
        else:
            # Simulation mode - save to file
            self.image.save('epaper_preview.png')
            log.info("Preview saved to epaper_preview.png")
        
        self.current_minute = now.minute
        self.current_flight = flight
    
    def partial_update_clock(self):
        """Update just the clock region."""
        if not self.draw:
            return
        
        now = datetime.now()
        if now.minute == self.current_minute:
            return  # No change needed
        
        self._draw_clock(now)
        self._draw_date(now)
        
        if self.epd:
            # Note: Partial refresh support depends on the specific display model
            # The 4.26" supports partial refresh via init_part() method
            try:
                self.epd.display_Partial(self.epd.getbuffer(self.image))
                log.info(f"Clock updated: {now.strftime('%H:%M')}")
            except AttributeError:
                # Fallback to full refresh if partial not available
                self.epd.display(self.epd.getbuffer(self.image))
        else:
            self.image.save('epaper_preview.png')
        
        self.current_minute = now.minute
    
    def partial_update_flight(self, flight: Optional[Dict], special_alerts: Dict = None):
        """Update just the flight region."""
        if not self.draw:
            return
        
        # Check if flight changed
        new_callsign = flight.get('callsign') if flight else None
        old_callsign = self.current_flight.get('callsign') if self.current_flight else None
        
        if new_callsign == old_callsign and not special_alerts:
            return  # No change
        
        self._draw_flight(flight)
        self._draw_status(special_alerts or {})
        
        if self.epd:
            try:
                self.epd.display_Partial(self.epd.getbuffer(self.image))
                log.info(f"Flight updated: {new_callsign or 'None'}")
            except AttributeError:
                self.epd.display(self.epd.getbuffer(self.image))
        else:
            self.image.save('epaper_preview.png')
        
        self.current_flight = flight
    
    def needs_full_refresh(self) -> bool:
        """Check if a full refresh is needed (to prevent ghosting)."""
        return time.time() - self.last_full_refresh > FULL_REFRESH_INTERVAL
    
    def cleanup(self):
        """Clean up display resources."""
        if self.epd:
            try:
                self.epd.sleep()
                log.info("Display entered sleep mode")
            except Exception as e:
                log.error(f"Cleanup error: {e}")


# ═══════════════════════════════════════════════════════════════
# Main Application
# ═══════════════════════════════════════════════════════════════

class VectorClockDisplay:
    """Main application controller."""
    
    def __init__(self):
        self.fetcher = DataFetcher(SERVER_URL)
        self.renderer = DisplayRenderer()
        self.running = Event()
        self.running.set()
        
        # State
        self.weather = None
        self.flight = None
        self.special_alerts = {}
        self.now_playing = None
        
        # Timing
        self.last_weather_update = 0
        self.last_flight_check = 0
        
        # Signal handlers
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
    
    def _signal_handler(self, sig, frame):
        """Handle shutdown signals."""
        log.info("Shutdown signal received")
        self.running.clear()
    
    def _wait_for_minute(self):
        """Wait until the start of the next minute."""
        now = datetime.now()
        seconds_to_wait = 60 - now.second
        log.info(f"Waiting {seconds_to_wait}s for next minute...")
        time.sleep(seconds_to_wait)
    
    def _update_weather(self):
        """Update weather data if needed."""
        now = time.time()
        if now - self.last_weather_update >= WEATHER_UPDATE_INTERVAL:
            self.weather = self.fetcher.get_weather()
            self.last_weather_update = now
            if self.weather:
                log.info(f"Weather: {self.weather.get('temp')}°C, {self.weather.get('condition')}")
    
    def _update_flight(self):
        """Update flight data if needed."""
        now = time.time()
        if now - self.last_flight_check >= FLIGHT_CHECK_INTERVAL:
            self.flight = self.fetcher.get_flights()
            self.special_alerts = self.fetcher.get_special_alerts()
            self.now_playing = self.fetcher.get_now_playing()
            self.last_flight_check = now
            
            if self.flight:
                log.info(f"Flight: {self.flight.get('callsign')} @ {self.flight.get('distance')}km")
            if self.now_playing:
                log.info(f"Now Playing: {self.now_playing.get('artist')} - {self.now_playing.get('track')}")
    
    def run(self):
        """Main run loop."""
        log.info("=" * 60)
        log.info("VectorClock E-Paper Display Starting")
        log.info(f"Server: {SERVER_URL}")
        log.info(f"Display: {DISPLAY_WIDTH}x{DISPLAY_HEIGHT}")
        log.info("=" * 60)
        
        # Initial data fetch
        self.fetcher.get_location()
        self._update_weather()
        self._update_flight()
        
        # Initial full render
        self.renderer.render_full(self.weather, self.flight, self.special_alerts, self.now_playing)
        
        # Wait for the next minute boundary for synchronization
        self._wait_for_minute()
        
        # Main loop
        while self.running.is_set():
            try:
                loop_start = time.time()
                
                # Update data
                self._update_weather()
                self._update_flight()
                
                # Check if full refresh needed (anti-ghosting)
                if self.renderer.needs_full_refresh():
                    log.info("Performing anti-ghosting full refresh")
                    self.renderer.render_full(self.weather, self.flight, self.special_alerts, self.now_playing)
                else:
                    # Partial updates
                    self.renderer.partial_update_clock()
                    self.renderer.partial_update_flight(self.flight, self.special_alerts)
                
                # Calculate sleep time to hit next minute boundary
                now = datetime.now()
                seconds_to_next_minute = 60 - now.second
                
                # But also check for flights more frequently
                sleep_time = min(seconds_to_next_minute, FLIGHT_CHECK_INTERVAL)
                
                # Account for loop execution time
                elapsed = time.time() - loop_start
                sleep_time = max(1, sleep_time - elapsed)
                
                time.sleep(sleep_time)
                
            except Exception as e:
                log.error(f"Loop error: {e}")
                time.sleep(5)
        
        # Cleanup
        self.renderer.cleanup()
        log.info("VectorClock Display stopped")


# ═══════════════════════════════════════════════════════════════
# Entry Point
# ═══════════════════════════════════════════════════════════════

def main():
    """Entry point."""
    print("""
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ██╗   ██╗███████╗ ██████╗████████╗ ██████╗ ██████╗     ║
║   ██║   ██║██╔════╝██╔════╝╚══██╔══╝██╔═══██╗██╔══██╗    ║
║   ██║   ██║█████╗  ██║        ██║   ██║   ██║██████╔╝    ║
║   ╚██╗ ██╔╝██╔══╝  ██║        ██║   ██║   ██║██╔══██╗    ║
║    ╚████╔╝ ███████╗╚██████╗   ██║   ╚██████╔╝██║  ██║    ║
║     ╚═══╝  ╚══════╝ ╚═════╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝    ║
║                                                           ║
║             E-Paper Display Driver v1.0                   ║
║        Waveshare 4.26" HAT (800x480)                      ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    """)
    
    if not PIL_AVAILABLE:
        print("ERROR: PIL/Pillow is required. Install with: pip3 install Pillow")
        sys.exit(1)
    
    if not REQUESTS_AVAILABLE:
        print("ERROR: requests is required. Install with: pip3 install requests")
        sys.exit(1)
    
    if not EPAPER_AVAILABLE:
        print("WARNING: Running in simulation mode (no e-paper hardware)")
        print("         Preview will be saved to epaper_preview.png")
        print("")
    
    app = VectorClockDisplay()
    app.run()


if __name__ == '__main__':
    main()
