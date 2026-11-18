# SmartFrame v2 – handoff / next steps

## Current state of this branch (`vigilant-disco`)

The rewrite is **half done and the display is broken until it's finished**:

| File | State |
| --- | --- |
| `static/css/index.css` | Rewritten (plain CSS, no Tailwind CDN, `rem` scales with screen height) |
| `templates/index.html` | Rewritten (new element IDs, see below) |
| `gphotos.py` | New – shared-album sync helper (untested against real Google) |
| `app.py` | **Still the old version** (debug mode on, old endpoints) |
| `static/js/index.js` | **Still the old version**, doesn't match the new HTML |
| `templates/upload.html` | **Still the old version** |

To abandon: `git checkout main -- static/css/index.css templates/index.html && rm gphotos.py`.

## Goals (from your gripes)

1. Clock/temperature must stay visible when a joke shows.
2. Control how photos crop; show two portrait photos side by side.
3. Rewrite the upload app (fast, works on iPhone); reminders become shared notes shown in random order.
4. Wikipedia text scrolls too slowly.
5. Support short silent videos that autoplay.
6. Auto-pull photos from Google Photos.

## Steps

### 1. Rewrite `app.py`
- Keep Flask; load `.env`; **run with `debug=os.getenv('FLASK_DEBUG')=='1'`** (debug + `0.0.0.0` exposes the Werkzeug console to your LAN).
- Storage in `data/` (gitignore it): `settings.json`, `notes.json`, `media_meta.json` (per-photo crop override), `thumbs/`.
- Endpoints:
  - `GET /` → `index.html`; `GET /upload` → new `manage.html`.
  - `GET /api/media` → `[{name,url,kind:image|video,width,height,source:upload|google,fit:auto|fill|fit,added}]` (dimensions via Pillow; `ffprobe` for videos if present).
  - `POST /api/media` (multipart, field `file`, multiple allowed). Images: `ImageOps.exif_transpose`, shrink to ≤2560px, save as JPEG, unique filename (`YYYYmmdd-HHMMSS-<uuid6>.jpg`). Accept HEIC via `pillow-heif` (iPhone). Keep animated GIFs as-is. Videos (`mp4 mov m4v webm`): save to `uploads/.processing/`, then background thread `ffmpeg -an -vf scale='min(1920,iw)':-2 -c:v libx264 -crf 26 -pix_fmt yuv420p -movflags +faststart` → mp4 (copy as-is if no ffmpeg).
  - `DELETE /api/media/<name>`, `PATCH /api/media/<name>` `{fit}`, `GET /api/thumb/<name>` (400px cached JPEG).
  - `GET/POST /api/notes`, `DELETE /api/notes/<id>` (`{id,text≤280,author,created}`); on first read import lines from `static/reminders.txt`.
  - `GET/POST /api/settings` with validation. Defaults: `fit_mode: smart|fill|fit`, `pair_portraits: true`, `photo_seconds: 15`, `max_video_seconds: 60`, `show_jokes: true`, `joke_every: 5`, `note_seconds: 12`, `wiki_speed: slow|normal|fast`, `album_url`, `album_sync_hours: 6`, `album_max_photos: 150`.
  - `POST /api/album/sync`, `GET /api/album/status`, plus a background scheduler thread (every 10 min, sync if due) using `gphotos.sync_album(album_url, UPLOAD_FOLDER, max, save_image)`.
  - `GET /api/weather` – cached 10 min; WeatherAPI with `WEATHER_API_KEY` / `WEATHER_CITY` from `.env`, falling back to keyless Open-Meteo (geocode + WMO code → text/emoji). Returns `{temp,city,desc,icon_url|icon_emoji}`.
  - `GET /api/wikipedia/today` – keep, but return only `{title, extract_html, type, views}`.
- Use `safe_media_path()` (basename check, allowed extension, no dotfiles) on every filename route. Set `MAX_CONTENT_LENGTH` ≈ 600 MB (videos).
- Remove the hardcoded WeatherAPI key from JS and **rotate it** (it's in git history). Add it to `.env` as `WEATHER_API_KEY`.

### 2. Rewrite `static/js/index.js` (the new `index.html` IDs: `stage`, `clock-time`, `clock-date`, `weather-temp/city/desc/icon/icon-emoji`, `special-wrap`, `special`, `note-text/author`, `teleprompter-container/content`)
- **Joke fix:** never hide the grid. Show joke/advice in `#special` (centre card) and un-hide `#special-wrap`; clock and weather stay put. Fetch jokes with a timeout and hide the card on failure.
- **Slideshow:** two `.slide` layers cross-fading in `#stage`. Each slide holds one or two `.tile`s; a tile has a blurred `.bg` copy plus `.main` with class `fill` (cover) or `fit` (contain).
  - `smart`: landscape → fill; portrait → pair with the next portrait (if `pair_portraits`), else fit over the blurred background. `fill`/`fit` force that for all; per-photo `fit` override wins.
  - Shuffle the queue; re-fetch `/api/media` + `/api/settings` every ~5 min (replaces the broken `<meta refresh>`).
  - Videos: `muted autoplay playsinline`, advance on `ended` (cap at `max_video_seconds`, fallback timer); decide fill/fit from `videoWidth/Height`.
  - Keep night dimming (18:00–07:00) on `#stage`.
- **Notes:** show one random note at a time every `note_seconds` with fade; build with `textContent` (the old code used `innerHTML` → XSS).
- **Weather:** call `/api/weather`; show `icon_url` in the `<img>` or `icon_emoji` in the emoji div.
- **Wikipedia scroll:** use time-based scrolling (`px/sec` from `wiki_speed`, roughly 25/45/80 × viewport-height/1080), advance to the next article when the scroll ends + short pause. Fix the old bug where each 24 h refresh added another `setInterval`. Strip links/styles with `DOMParser`, don't use raw `innerHTML` from the API.
- Clock: `HH:MM` (the old one reset at `--:--:--`).

### 3. New upload/manage app: `templates/manage.html` + `static/js/manage.js` + `static/css/manage.css`
- Mobile-first, vanilla JS, no CDN (the Tailwind CDN is a big reason it was laggy).
- Tabs: **Notes** (default; author name remembered in `localStorage`; big textarea; send button; list with delete), **Add media** (`<input type=file multiple accept="image/*,video/*">`, drag-and-drop, per-file progress via `XMLHttpRequest`), **Library** (grid from `/api/thumb`, video via `<video preload=metadata>`, delete, crop toggle auto/fill/fit), **Settings** (all of the settings above, album link + "Sync now" + status).
- Test on Kelsey's iPhone (HEIC, large photos, flaky wifi → show clear errors and retry).
- Then delete `templates/upload.html` and the legacy `static/reminders.txt` import path once notes are migrated.

### 4. Housekeeping
- `requirements.txt`: add `Pillow`, `pillow-heif`; bump Flask/Werkzeug if you like.
- `.gitignore`: add `data/`, `static/uploads/.processing/`.
- `sudo apt install ffmpeg` on the Pi (video transcoding + dimensions).
- Add a short `README.md` (setup, `.env` keys: `WEATHER_API_KEY`, `WEATHER_CITY`, `WIKIMEDIA_*`, `PORT`).
- Chromium kiosk autostart should open `http://localhost:5000/`.

### 5. Google Photos – important caveat
Google removed the Photos Library API's access to a user's own library (March 2025), so true "pull my recent photos" isn't possible via API. `gphotos.py` instead reads a **public shared-album link**: create an album (e.g. "Frame"), turn on link sharing, paste the link in Settings. Kelsey can add to it too. Photos are stored with a `gp-` prefix, and pruned when removed from the album or beyond `album_max_photos`. It parses an undocumented page format, so it may break; verify it with a real album, and check the assumption that newer photos are last in the page order. Fallback options: Syncthing/rsync from a phone folder, or the Google Photos Picker API (needs OAuth and manual picking).

### 6. Verify
- `python -m venv .venv && pip install -r requirements.txt && python app.py`; open `/` and `/upload`.
- Check: joke keeps clock visible; portrait pairs; fit/fill modes; video autoplay; HEIC upload; note round trip; wiki speed; settings persist across restart.
- Add a few pytest tests (`gphotos.parse_album`, settings validation, upload of a rotated JPEG, note CRUD).
