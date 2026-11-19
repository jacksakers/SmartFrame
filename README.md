# SmartFrame

Photo/video frame for a Raspberry Pi with a clock, weather, shared notes and a Wikipedia ticker.

## Setup

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
sudo apt install ffmpeg   # video transcoding and dimensions
python app.py
```

Optional: `pip install pillow-heif` (needs `libheif-dev`) accepts raw HEIC files. iPhones normally convert photos to JPEG on upload, so it is usually not needed.

- Display: `http://localhost:5000/` (point the Chromium kiosk autostart here).
- Manage (notes, media, settings): `http://<pi-address>:5000/upload` from a phone or laptop on the same network. There is no login, so keep it on a trusted LAN.

## `.env`

| Key | Purpose |
| --- | --- |
| `WEATHER_API_KEY` | WeatherAPI key. Optional; falls back to keyless Open-Meteo. |
| `WEATHER_CITY` | e.g. `West Columbia` or `West Columbia, SC`. |
| `WIKIMEDIA_ACCESS_TOKEN`, `WIKIMEDIA_USER_AGENT` | Optional Wikimedia credentials. |
| `PORT` | Defaults to `5000`. |
| `FLASK_DEBUG` | Set to `1` for debug mode (never on a shared network). |

Runtime data (settings, notes, thumbnails) lives in `data/`.

## Google Photos

Google no longer lets apps read your own library. Create a shared album, turn on link sharing and paste the link under Settings. The sync parses an undocumented page format and may break.

## Tests

```bash
pip install pytest && python -m pytest tests
```
