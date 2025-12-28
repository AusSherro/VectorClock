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
# Album Art Manager (Dithering)
# ═══════════════════════════════════════════════════════════════

# Bayer matrix for ordered dithering
BAYER_MATRIX_4x4 = [
    [0,  8,  2, 10],
    [12, 4, 14,  6],
    [3, 11,  1,  9],
    [15, 7, 13,  5]
]

class AlbumArtManager:
    """
    Manages album art fetching, caching, and dithering for e-ink display.
    
    Supported dithering algorithms:
    - floyd: Floyd-Steinberg (smooth, organic patterns)
    - atkinson: Atkinson (Mac Classic style, higher contrast)
    - ordered: Ordered/Bayer (geometric screentone patterns)
    """
    
    def __init__(self):
        self.cached_url: Optional[str] = None
        self.cached_art: Optional[Image.Image] = None
        self.cached_dithered: Dict[str, Image.Image] = {}  # algorithm -> dithered image
        
        # Display settings (fetched from server)
        self.display_mode = 'thumbnail'  # 'thumbnail' or 'music'
        self.dither_algorithm = 'floyd'  # 'floyd', 'atkinson', 'ordered'
        self.show_album_art = True
        
        # Thumbnail size for "now playing" bar
        self.thumbnail_size = 50
        # Large size for "music mode"
        self.music_mode_size = 180
    
    def fetch_settings(self, server_url: str) -> None:
        """Fetch album art display settings from server."""
        if not REQUESTS_AVAILABLE:
            return
        try:
            response = requests.get(f"{server_url}/api/config/spotify-display", timeout=5)
            if response.status_code == 200:
                data = response.json()
                self.display_mode = data.get('displayMode', 'thumbnail')
                self.dither_algorithm = data.get('ditherAlgorithm', 'floyd')
                self.show_album_art = data.get('showAlbumArt', True)
                log.info(f"Album art settings: mode={self.display_mode}, dither={self.dither_algorithm}")
        except Exception as e:
            log.debug(f"Could not fetch album art settings: {e}")
    
    def get_dithered_art(self, url: str, size: int) -> Optional[Image.Image]:
        """
        Fetch album art and apply dithering.
        Returns cached version if URL unchanged.
        """
        if not url:
            log.debug("Album art: No URL provided")
            return None
        
        if not self.show_album_art:
            log.debug("Album art: Disabled in settings")
            return None
        
        if not REQUESTS_AVAILABLE or not PIL_AVAILABLE:
            log.debug("Album art: Missing requests or PIL")
            return None
        
        # Check cache
        cache_key = f"{self.dither_algorithm}_{size}"
        if url == self.cached_url and cache_key in self.cached_dithered:
            log.debug(f"Album art: Using cached {cache_key}")
            return self.cached_dithered[cache_key]
        
        try:
            # Fetch new album art if URL changed
            if url != self.cached_url:
                log.info(f"Fetching album art: {url[:60]}...")
                response = requests.get(url, timeout=10)
                if response.status_code != 200:
                    log.warning(f"Album art fetch failed: HTTP {response.status_code}")
                    return None
                
                from io import BytesIO
                self.cached_art = Image.open(BytesIO(response.content))
                self.cached_url = url
                self.cached_dithered = {}  # Clear dither cache
                log.info(f"Album art loaded: {self.cached_art.size} {self.cached_art.mode}")
            
            if not self.cached_art:
                log.debug("Album art: No cached art available")
                return None
            
            # Resize to target size
            art = self.cached_art.copy()
            art = art.resize((size, size), Image.Resampling.LANCZOS)
            
            # Convert to grayscale
            art = art.convert('L')
            
            # Apply dithering
            dithered = self._apply_dithering(art, self.dither_algorithm)
            
            # Cache the result
            self.cached_dithered[cache_key] = dithered
            log.info(f"Album art dithered ({self.dither_algorithm}): {size}x{size}")
            
            return dithered
            
        except Exception as e:
            log.warning(f"Album art fetch/dither error: {e}")
            import traceback
            log.debug(traceback.format_exc())
            return None
    
    def _apply_dithering(self, image: Image.Image, algorithm: str) -> Image.Image:
        """Apply the specified dithering algorithm to a grayscale image."""
        if algorithm == 'atkinson':
            return self._dither_atkinson(image)
        elif algorithm == 'ordered':
            return self._dither_ordered(image)
        else:  # floyd (default)
            return self._dither_floyd_steinberg(image)
    
    def _dither_floyd_steinberg(self, image: Image.Image) -> Image.Image:
        """
        Floyd-Steinberg dithering.
        Distributes error to neighboring pixels for smooth gradients.
        """
        img = image.copy()
        pixels = img.load()
        width, height = img.size
        
        for y in range(height):
            for x in range(width):
                old_pixel = pixels[x, y]
                new_pixel = 255 if old_pixel > 127 else 0
                pixels[x, y] = new_pixel
                error = old_pixel - new_pixel
                
                # Distribute error to neighbors
                if x + 1 < width:
                    pixels[x + 1, y] = max(0, min(255, int(pixels[x + 1, y] + error * 7 / 16)))
                if y + 1 < height:
                    if x > 0:
                        pixels[x - 1, y + 1] = max(0, min(255, int(pixels[x - 1, y + 1] + error * 3 / 16)))
                    pixels[x, y + 1] = max(0, min(255, int(pixels[x, y + 1] + error * 5 / 16)))
                    if x + 1 < width:
                        pixels[x + 1, y + 1] = max(0, min(255, int(pixels[x + 1, y + 1] + error * 1 / 16)))
        
        return img.convert('1')
    
    def _dither_atkinson(self, image: Image.Image) -> Image.Image:
        """
        Atkinson dithering (Bill Atkinson, Apple).
        Higher contrast, more stylized - only distributes 6/8 of error.
        """
        img = image.copy()
        pixels = img.load()
        width, height = img.size
        
        for y in range(height):
            for x in range(width):
                old_pixel = pixels[x, y]
                new_pixel = 255 if old_pixel > 127 else 0
                pixels[x, y] = new_pixel
                error = (old_pixel - new_pixel) // 8  # Only 6/8 distributed
                
                # Atkinson error distribution pattern
                if x + 1 < width:
                    pixels[x + 1, y] = max(0, min(255, pixels[x + 1, y] + error))
                if x + 2 < width:
                    pixels[x + 2, y] = max(0, min(255, pixels[x + 2, y] + error))
                if y + 1 < height:
                    if x > 0:
                        pixels[x - 1, y + 1] = max(0, min(255, pixels[x - 1, y + 1] + error))
                    pixels[x, y + 1] = max(0, min(255, pixels[x, y + 1] + error))
                    if x + 1 < width:
                        pixels[x + 1, y + 1] = max(0, min(255, pixels[x + 1, y + 1] + error))
                if y + 2 < height:
                    pixels[x, y + 2] = max(0, min(255, pixels[x, y + 2] + error))
        
        return img.convert('1')
    
    def _dither_ordered(self, image: Image.Image) -> Image.Image:
        """
        Ordered dithering using 4x4 Bayer matrix.
        Creates regular geometric patterns (screentone aesthetic).
        """
        img = image.copy()
        pixels = img.load()
        width, height = img.size
        
        # Normalize Bayer matrix to 0-255 range
        threshold_map = [[((BAYER_MATRIX_4x4[y][x] + 1) / 17) * 255 for x in range(4)] for y in range(4)]
        
        for y in range(height):
            for x in range(width):
                threshold = threshold_map[y % 4][x % 4]
                pixels[x, y] = 255 if pixels[x, y] > threshold else 0
        
        return img.convert('1')


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
    'flight': Region(0, 365, 800, 55),        # Bottom - flight info (adjusted for art)
    'now_playing': Region(0, 420, 800, 60),   # Very bottom - now playing with album art
    'status': Region(550, 0, 250, 60),        # Top right - status
    'music_mode': Region(0, 100, 800, 300),   # Center area for music mode
    'clock_mini': Region(700, 10, 100, 40),   # Top right - mini clock for music mode
    'full': Region(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT),
}


# ═══════════════════════════════════════════════════════════════
# Display Renderer
# ═══════════════════════════════════════════════════════════════

class DisplayRenderer:
    """Renders content to the e-paper display."""
    
    def __init__(self):
        self.fonts = FontManager()
        self.album_art = AlbumArtManager()
        self.epd = None
        self.image = None
        self.draw = None
        self.last_full_refresh = 0
        self.current_minute = -1
        self.current_flight = None
        self.music_mode_active = False
        
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
        """Draw Spotify now playing info with optional album art thumbnail."""
        region = REGIONS['now_playing']
        
        # Clear region
        self.draw.rectangle(region.bounds, fill=255)
        
        if not now_playing or not now_playing.get('playing'):
            return
        
        artist = now_playing.get('artist', '')
        track = now_playing.get('track', '')
        album_art_url = now_playing.get('albumArt') or now_playing.get('albumArtSmall')
        
        # Debug logging
        log.debug(f"Now playing: {artist} - {track}")
        log.debug(f"Album art URL: {album_art_url[:50] if album_art_url else 'None'}...")
        log.debug(f"Album art settings: mode={self.album_art.display_mode}, show={self.album_art.show_album_art}")
        
        # Try to render album art thumbnail
        art_width = 0
        art_x = 10
        art_size = self.album_art.thumbnail_size
        
        # Render album art only in thumbnail mode (music mode is handled separately)
        if album_art_url and self.album_art.show_album_art:
            if self.album_art.display_mode == 'thumbnail':
                dithered = self.album_art.get_dithered_art(album_art_url, art_size)
                if dithered:
                    # Center vertically in region
                    art_y = region.y + (region.height - art_size) // 2
                    self.image.paste(dithered, (art_x, art_y))
                    art_width = art_size + 15  # Add padding after art
                    log.info(f"Album art rendered at ({art_x}, {art_y})")
                else:
                    log.warning("Album art dithering returned None")
        
        # Draw track info
        if artist and track:
            font_track = self.fonts.get(16)
            font_artist = self.fonts.get(12)
            
            # Truncate if too long
            max_len = 50 if art_width > 0 else 60
            if len(track) > max_len:
                track = track[:max_len - 3] + "..."
            if len(artist) > max_len:
                artist = artist[:max_len - 3] + "..."
            
            text_x = art_x + art_width
            
            # Track name (larger)
            self.draw.text((text_x, region.y + 8), f"♪ {track}", font=font_track, fill=0)
            # Artist name (smaller, below)
            self.draw.text((text_x, region.y + 30), artist, font=font_artist, fill=0)
    
    def _draw_music_mode(self, now_playing: Optional[Dict], now: datetime):
        """
        Draw full music mode with large album art replacing clock/date.
        Mini clock shown in corner.
        """
        if not now_playing or not now_playing.get('playing'):
            return False
        
        album_art_url = now_playing.get('albumArt') or now_playing.get('albumArtSmall')
        if not album_art_url:
            return False
        
        art_size = self.album_art.music_mode_size
        dithered = self.album_art.get_dithered_art(album_art_url, art_size)
        if not dithered:
            return False
        
        region = REGIONS['music_mode']
        
        # Draw large centered album art
        art_x = (DISPLAY_WIDTH - art_size) // 2
        art_y = region.y + 10
        self.image.paste(dithered, (art_x, art_y))
        
        # Draw track and artist info below art
        artist = now_playing.get('artist', '')
        track = now_playing.get('track', '')
        album = now_playing.get('album', '')
        
        info_y = art_y + art_size + 15
        
        # Track name (large)
        font_track = self.fonts.get(24)
        if len(track) > 35:
            track = track[:32] + "..."
        bbox = self.draw.textbbox((0, 0), track, font=font_track)
        text_width = bbox[2] - bbox[0]
        self.draw.text(((DISPLAY_WIDTH - text_width) // 2, info_y), track, font=font_track, fill=0)
        
        # Artist name
        font_artist = self.fonts.get(18)
        if len(artist) > 40:
            artist = artist[:37] + "..."
        bbox = self.draw.textbbox((0, 0), artist, font=font_artist)
        text_width = bbox[2] - bbox[0]
        self.draw.text(((DISPLAY_WIDTH - text_width) // 2, info_y + 30), artist, font=font_artist, fill=0)
        
        # Draw mini clock in corner
        mini_region = REGIONS['clock_mini']
        time_str = now.strftime('%H:%M')
        font_mini = self.fonts.get(20)
        self.draw.text((mini_region.x, mini_region.y), time_str, font=font_mini, fill=0)
        
        return True
    
    def render_full(self, weather: Optional[Dict], flight: Optional[Dict], 
                    special_alerts: Dict = None, now_playing: Optional[Dict] = None):
        """Perform a full display render and refresh."""
        if not self.draw:
            return
        
        now = datetime.now()
        
        # Clear entire display
        self.draw.rectangle([0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT], fill=255)
        
        # Check for music mode
        music_mode_rendered = False
        if (self.album_art.display_mode == 'music' and 
            now_playing and now_playing.get('playing') and 
            self.album_art.show_album_art):
            music_mode_rendered = self._draw_music_mode(now_playing, now)
        
        if music_mode_rendered:
            # In music mode, still show weather and flight info
            self._draw_weather(weather)
            self._draw_flight(flight)
            self._draw_status(special_alerts or {})
            self.music_mode_active = True
        else:
            # Normal layout
            self._draw_clock(now)
            self._draw_date(now)
            self._draw_weather(weather)
            self._draw_flight(flight)
            self._draw_status(special_alerts or {})
            self._draw_now_playing(now_playing)
            self.music_mode_active = False
        
        # Push to display
        if self.epd:
            self.epd.display(self.epd.getbuffer(self.image))
            self.last_full_refresh = time.time()
            log.info("Full refresh complete" + (" (music mode)" if music_mode_rendered else ""))
        else:
            # Simulation mode - save to file
            self.image.save('epaper_preview.png')
            log.info("Preview saved to epaper_preview.png" + (" (music mode)" if music_mode_rendered else ""))
        
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
        
        # Fetch album art display settings
        self.renderer.album_art.fetch_settings(SERVER_URL)
        
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
