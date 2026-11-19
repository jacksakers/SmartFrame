# SmartFrame

Photo/video frame for a Raspberry Pi with a clock, weather, shared notes and a Wikipedia ticker.

## Features

- **Slideshow** of uploaded photos and short silent videos, shuffled, with cross-fades. It dims between 6 pm and 7 am.
- **Smart cropping:** landscape photos fill the screen, and portrait photos are shown whole over a blurred background. Two portraits can sit side by side. Each photo can override the crop (auto, fill or fit).
- **Clock and weather** are always visible, including while a joke is showing. Weather uses WeatherAPI if a key is set and otherwise the free Open-Meteo.
- **Shared notes:** anyone on the network can post a short note (up to 280 characters). The frame shows one random note at a time.
- **Jokes and advice:** every few slides a dad joke or piece of advice appears in a card in the centre.
- **Wikipedia ticker:** the featured and most-read articles scroll at a speed you choose (slow, normal or fast).
- **Phone-friendly manage page** for notes, uploads, the photo library and settings. Photos are rotated, shrunk and converted to JPEG on upload. Videos are converted to silent MP4 with ffmpeg.
- **Google Photos sync** from a shared album link.

## Using it

Open `http://<pi-address>:5000/upload` on a phone or laptop on the same network.

| Tab | What it does |
| --- | --- |
| **Notes** | Enter your name (remembered on that device), write a note and tap Send. The list shows the notes on the frame, each with a Delete button. |
| **Add media** | Choose or drag in photos and videos. Each file shows its progress and has a Retry button if the connection drops. Videos appear on the frame a few minutes after upload, once processed. |
| **Library** | Thumbnails of everything on the frame. Set a crop per item (Auto, Fill or Fit) or delete it. |
| **Settings** | See below. Tap Save settings. The frame picks changes up within about 5 minutes. |

### Settings

| Setting | Effect |
| --- | --- |
| Cropping | Smart, always fill, or always fit. A per-photo override in the Library wins. |
| Two portraits side by side | Pairs portrait photos in Smart mode. |
| Seconds per photo | How long each photo is shown. |
| Longest video | Videos are cut off after this many seconds. |
| Jokes and advice, every N slides | Turn the centre card on or off and set how often it appears. |
| Seconds per note | How long each note stays up. |
| Wikipedia scroll speed | Slow, normal or fast. |
| Shared album link, sync every N hours, keep at most N photos | Google Photos sync (see below). |

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

### Running as a service

Create the virtualenv somewhere that supports symlinks, such as `~/smartframe-venv`. A USB drive formatted as exFAT, FAT or NTFS does not. Then set these in the `[Service]` section of the unit file:

```ini
WorkingDirectory=/path/to/SmartFrame
ExecStart=/home/<user>/smartframe-venv/bin/python app.py
Restart=on-failure
```

Apply it with `sudo systemctl daemon-reload && sudo systemctl restart smart-frame`. Check the logs with `journalctl -u smart-frame -n 50`.

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

Google no longer lets apps read your own library. Create a shared album (for example "Frame"), turn on link sharing and paste the link under Settings, then tap Sync now or wait for the next scheduled sync. Anyone who can add to the album can add to the frame. Synced photos are marked "Google" in the Library. They are removed from the frame when they leave the album or fall outside the newest N photos. The sync parses an undocumented page format and may break.

## Tests

```bash
pip install pytest && python -m pytest tests
```
