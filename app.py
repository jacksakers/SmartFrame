"""SmartFrame server: display page, media/notes/settings API and Google Photos album sync."""

import html
import json
import logging
import os
import re
import shutil
import subprocess
import threading
import time
import uuid
from datetime import datetime
from urllib.parse import quote

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request, send_from_directory
from PIL import Image, ImageOps
from werkzeug.exceptions import RequestEntityTooLarge

import gphotos

try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
    HEIF_OK = True
except ImportError:
    HEIF_OK = False

load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'static', 'uploads')
PROCESSING_FOLDER = os.path.join(UPLOAD_FOLDER, '.processing')
DATA_DIR = os.path.join(BASE_DIR, 'data')
THUMB_DIR = os.path.join(DATA_DIR, 'thumbs')
SETTINGS_FILE = os.path.join(DATA_DIR, 'settings.json')
NOTES_FILE = os.path.join(DATA_DIR, 'notes.json')
META_FILE = os.path.join(DATA_DIR, 'media_meta.json')
ALBUM_STATE_FILE = os.path.join(DATA_DIR, 'album_state.json')
LEGACY_REMINDERS_FILE = os.path.join(BASE_DIR, 'static', 'reminders.txt')

IMAGE_EXTS = {'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif'}
VIDEO_EXTS = {'mp4', 'mov', 'm4v', 'webm'}
MEDIA_EXTS = IMAGE_EXTS | VIDEO_EXTS
MAX_IMAGE_SIDE = 2560
THUMB_SIDE = 400
NOTE_MAX_LEN = 280

FFMPEG = shutil.which('ffmpeg')
FFPROBE = shutil.which('ffprobe')

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 600 * 1024 * 1024
log = logging.getLogger('smartframe')

for _d in (UPLOAD_FOLDER, PROCESSING_FOLDER, THUMB_DIR):
    os.makedirs(_d, exist_ok=True)

_io_lock = threading.RLock()


# --- JSON storage ---

def read_json(path, default):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def write_json(path, obj):
    tmp = f'{path}.{uuid.uuid4().hex[:6]}.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


# --- Settings ---

def _int_range(lo, hi):
    def check(v):
        if isinstance(v, bool):
            raise ValueError(f'must be a whole number between {lo} and {hi}')
        try:
            n = int(v)
        except (TypeError, ValueError):
            raise ValueError(f'must be a whole number between {lo} and {hi}')
        if not lo <= n <= hi:
            raise ValueError(f'must be between {lo} and {hi}')
        return n
    return check


def _choice(*options):
    def check(v):
        if v not in options:
            raise ValueError('must be one of: ' + ', '.join(options))
        return v
    return check


def _boolean(v):
    if not isinstance(v, bool):
        raise ValueError('must be true or false')
    return v


def _album_url(v):
    if not isinstance(v, str):
        raise ValueError('must be text')
    v = v.strip()
    if v and (len(v) > 500 or not re.match(r'^https://(photos\.app\.goo\.gl|photos\.google\.com)/', v)):
        raise ValueError('must be a Google Photos shared album link')
    return v


SETTINGS_SCHEMA = {
    'fit_mode': ('smart', _choice('smart', 'fill', 'fit')),
    'pair_portraits': (True, _boolean),
    'photo_seconds': (15, _int_range(3, 600)),
    'max_video_seconds': (60, _int_range(5, 600)),
    'show_jokes': (True, _boolean),
    'joke_every': (5, _int_range(2, 50)),
    'note_seconds': (12, _int_range(3, 300)),
    'wiki_speed': ('normal', _choice('slow', 'normal', 'fast')),
    'album_url': ('', _album_url),
    'album_sync_hours': (6, _int_range(1, 168)),
    'album_max_photos': (150, _int_range(5, 1000)),
}


def load_settings():
    stored = read_json(SETTINGS_FILE, {})
    settings = {}
    for key, (default, check) in SETTINGS_SCHEMA.items():
        try:
            settings[key] = check(stored[key]) if key in stored else default
        except ValueError:
            settings[key] = default
    return settings


# --- Media helpers ---

def ext_of(name):
    return name.rsplit('.', 1)[1].lower() if '.' in name else ''


def safe_media_path(name):
    """Absolute path of an existing media file in the upload folder, else None."""
    if not name or name != os.path.basename(name) or name.startswith('.'):
        return None
    if ext_of(name) not in MEDIA_EXTS:
        return None
    path = os.path.join(UPLOAD_FOLDER, name)
    return path if os.path.isfile(path) else None


def new_name(ext):
    return f'{datetime.now():%Y%m%d-%H%M%S}-{uuid.uuid4().hex[:6]}.{ext}'


def store_image(src_path, dest_name=None):
    """Normalise an image (rotate, shrink, JPEG) into the upload folder; returns its name."""
    tmp_out = os.path.join(PROCESSING_FOLDER, f'out-{uuid.uuid4().hex}')
    try:
        with Image.open(src_path) as im:
            if im.format == 'GIF' and getattr(im, 'is_animated', False):
                name = dest_name or new_name('gif')
                shutil.copyfile(src_path, tmp_out)
            else:
                name = dest_name or new_name('jpg')
                if im.format == 'JPEG':
                    im.draft('RGB', (MAX_IMAGE_SIDE, MAX_IMAGE_SIDE))
                im = ImageOps.exif_transpose(im)
                im.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE))
                if im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info):
                    rgba = im.convert('RGBA')
                    bg = Image.new('RGB', rgba.size, 'white')
                    bg.paste(rgba, mask=rgba.getchannel('A'))
                    im = bg
                elif im.mode != 'RGB':
                    im = im.convert('RGB')
                im.save(tmp_out, 'JPEG', quality=88, optimize=True)
        os.replace(tmp_out, os.path.join(UPLOAD_FOLDER, name))
    finally:
        if os.path.exists(tmp_out):
            os.remove(tmp_out)
    return name


_video_lock = threading.Lock()


def _process_video(src_path, name):
    out = None
    with _video_lock:  # one transcode at a time; the Pi is small
        try:
            dest = os.path.join(UPLOAD_FOLDER, name)
            if FFMPEG:
                out = os.path.join(PROCESSING_FOLDER, f'out-{uuid.uuid4().hex}.mp4')
                subprocess.run(
                    [FFMPEG, '-y', '-i', src_path, '-an',
                     '-vf', "scale='min(1920,iw)':-2",
                     '-c:v', 'libx264', '-crf', '26', '-preset', 'veryfast',
                     '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out],
                    check=True, capture_output=True, timeout=3600)
                os.replace(out, dest)
                os.remove(src_path)
            else:
                os.replace(src_path, dest)
        except Exception:
            log.exception('Video processing failed for %s', name)
            for p in (src_path, out):
                if p and os.path.exists(p):
                    os.remove(p)


def queue_video(src_path, ext):
    name = new_name('mp4' if FFMPEG else ext)
    threading.Thread(target=_process_video, args=(src_path, name), daemon=True).start()
    return name


_info_cache = {}


def media_info(name, path, kind):
    """(width, height, duration) with EXIF orientation applied; cached per file version."""
    st = os.stat(path)
    key = (name, st.st_mtime_ns, st.st_size)
    if key in _info_cache:
        return _info_cache[key]
    width = height = duration = None
    try:
        if kind == 'image':
            with Image.open(path) as im:
                width, height = im.size
                if im.getexif().get(0x0112) in (5, 6, 7, 8):
                    width, height = height, width
        elif FFPROBE:
            out = subprocess.run(
                [FFPROBE, '-v', 'error', '-select_streams', 'v:0',
                 '-show_entries', 'stream=width,height:format=duration', '-of', 'json', path],
                capture_output=True, text=True, timeout=20, check=True).stdout
            data = json.loads(out)
            stream = (data.get('streams') or [{}])[0]
            width, height = stream.get('width'), stream.get('height')
            raw_duration = data.get('format', {}).get('duration')
            duration = float(raw_duration) if raw_duration else None
    except Exception:
        log.warning('Could not read dimensions of %s', name)
    _info_cache[key] = (width, height, duration)
    return _info_cache[key]


def list_media():
    meta = read_json(META_FILE, {})
    items = []
    for name in os.listdir(UPLOAD_FOLDER):
        path = safe_media_path(name)
        if not path:
            continue
        kind = 'video' if ext_of(name) in VIDEO_EXTS else 'image'
        width, height, duration = media_info(name, path, kind)
        items.append({
            'name': name,
            'url': '/static/uploads/' + quote(name),
            'kind': kind,
            'width': width,
            'height': height,
            'duration': duration,
            'source': 'google' if name.startswith(gphotos.FILE_PREFIX) else 'upload',
            'fit': meta.get(name, {}).get('fit', 'auto'),
            'added': int(os.path.getmtime(path)),
        })
    items.sort(key=lambda m: m['added'], reverse=True)
    return items


def remove_media_files(name):
    path = safe_media_path(name)
    if not path:
        return False
    os.remove(path)
    thumb = os.path.join(THUMB_DIR, name + '.jpg')
    if os.path.exists(thumb):
        os.remove(thumb)
    with _io_lock:
        meta = read_json(META_FILE, {})
        if meta.pop(name, None) is not None:
            write_json(META_FILE, meta)
    return True


# --- Notes ---

def _import_legacy_notes():
    try:
        with open(LEGACY_REMINDERS_FILE, 'r', encoding='utf-8') as f:
            lines = [l.strip() for l in f if l.strip()]
    except FileNotFoundError:
        return []
    now = datetime.now().isoformat(timespec='seconds')
    return [{'id': uuid.uuid4().hex[:8], 'text': l[:NOTE_MAX_LEN], 'author': '', 'created': now}
            for l in lines if not l.startswith('Add your reminders here')]


def load_notes():
    with _io_lock:
        if not os.path.exists(NOTES_FILE):
            notes = _import_legacy_notes()
            write_json(NOTES_FILE, notes)
            return notes
        return read_json(NOTES_FILE, [])


# --- Weather ---

_WMO = {
    0: ('Clear', '☀️', '🌙'), 1: ('Mostly clear', '🌤️', '🌙'), 2: ('Partly cloudy', '⛅', '☁️'),
    3: ('Overcast', '☁️', '☁️'), 45: ('Fog', '🌫️', '🌫️'), 48: ('Fog', '🌫️', '🌫️'),
    51: ('Light drizzle', '🌦️', '🌧️'), 53: ('Drizzle', '🌦️', '🌧️'), 55: ('Heavy drizzle', '🌧️', '🌧️'),
    56: ('Freezing drizzle', '🌧️', '🌧️'), 57: ('Freezing drizzle', '🌧️', '🌧️'),
    61: ('Light rain', '🌦️', '🌧️'), 63: ('Rain', '🌧️', '🌧️'), 65: ('Heavy rain', '🌧️', '🌧️'),
    66: ('Freezing rain', '🌧️', '🌧️'), 67: ('Freezing rain', '🌧️', '🌧️'),
    71: ('Light snow', '🌨️', '🌨️'), 73: ('Snow', '❄️', '❄️'), 75: ('Heavy snow', '❄️', '❄️'),
    77: ('Snow grains', '❄️', '❄️'), 80: ('Rain showers', '🌦️', '🌧️'), 81: ('Rain showers', '🌧️', '🌧️'),
    82: ('Violent showers', '🌧️', '🌧️'), 85: ('Snow showers', '🌨️', '🌨️'), 86: ('Snow showers', '🌨️', '🌨️'),
    95: ('Thunderstorm', '⛈️', '⛈️'), 96: ('Thunderstorm, hail', '⛈️', '⛈️'), 99: ('Thunderstorm, hail', '⛈️', '⛈️'),
}
_weather_cache = {'ts': 0, 'data': None}
WEATHER_TTL = 600


def _weather_from_weatherapi(key, city):
    r = requests.get('https://api.weatherapi.com/v1/current.json',
                     params={'key': key, 'q': city, 'aqi': 'no'}, timeout=10)
    r.raise_for_status()
    d = r.json()
    icon = d['current']['condition']['icon']
    return {
        'temp': round(d['current']['temp_f']),
        'city': d['location']['name'],
        'desc': d['current']['condition']['text'],
        'icon_url': 'https:' + icon if icon.startswith('//') else icon,
    }


def _weather_from_open_meteo(city):
    name, _, region = city.partition(',')
    region = region.strip().lower()
    g = requests.get('https://geocoding-api.open-meteo.com/v1/search',
                     params={'name': name.strip(), 'count': 10, 'language': 'en'}, timeout=10)
    g.raise_for_status()
    places = g.json().get('results') or []
    if not places:
        raise ValueError(f'City not found: {city}')
    place = next((p for p in places if region and region in (
        str(p.get('admin1', '')).lower(), str(p.get('country_code', '')).lower(),
        str(p.get('country', '')).lower())), places[0])
    w = requests.get('https://api.open-meteo.com/v1/forecast', params={
        'latitude': place['latitude'], 'longitude': place['longitude'],
        'current': 'temperature_2m,weather_code,is_day', 'temperature_unit': 'fahrenheit',
    }, timeout=10)
    w.raise_for_status()
    cur = w.json()['current']
    desc, day_icon, night_icon = _WMO.get(cur['weather_code'], ('', '🌡️', '🌡️'))
    return {
        'temp': round(cur['temperature_2m']),
        'city': place['name'],
        'desc': desc,
        'icon_emoji': day_icon if cur.get('is_day', 1) else night_icon,
    }


# --- Wikipedia ---

_wiki_cache = {'ts': 0, 'data': None}
WIKI_TTL = 3600


# --- Album sync ---

_album_lock = threading.Lock()
_album_status = {'running': False, 'last_attempt': None, 'ok': None, 'message': '',
                 **read_json(ALBUM_STATE_FILE, {})}


def run_album_sync(settings):
    """Sync the configured album; safe to call from any thread, no-op if already running."""
    if not _album_lock.acquire(blocking=False):
        return
    _album_status['running'] = True
    ok, message = False, ''
    try:
        result = gphotos.sync_album(settings['album_url'], UPLOAD_FOLDER,
                                    settings['album_max_photos'], store_image)
        ok = True
        message = f"Added {result['added']}, removed {result['removed']}, {result['total']} in album"
    except Exception as e:
        log.exception('Album sync failed')
        message = str(e)
    finally:
        _album_status.update(running=False, last_attempt=time.time(), ok=ok, message=message)
        with _io_lock:
            write_json(ALBUM_STATE_FILE, {k: _album_status[k] for k in ('last_attempt', 'ok', 'message')})
        _album_lock.release()


def _album_scheduler():
    time.sleep(30)
    while True:
        try:
            s = load_settings()
            last = _album_status.get('last_attempt')
            interval = s['album_sync_hours'] * 3600 if _album_status.get('ok') else 3600
            if s['album_url'] and (last is None or time.time() - last >= interval):
                run_album_sync(s)
        except Exception:
            log.exception('Album scheduler error')
        time.sleep(600)


# --- Routes ---

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/upload')
def manage():
    return render_template('manage.html')


@app.after_request
def no_store_api(resp):
    if request.path.startswith('/api/') and not request.path.startswith('/api/thumb/'):
        resp.headers['Cache-Control'] = 'no-store'
    return resp


@app.errorhandler(RequestEntityTooLarge)
def too_large(_):
    return jsonify({'error': 'File is too large (limit 600 MB)'}), 413


@app.route('/api/media', methods=['GET'])
def get_media():
    return jsonify(list_media())


@app.route('/api/media', methods=['POST'])
def upload_media():
    files = request.files.getlist('file')
    if not files:
        return jsonify({'error': 'No file provided'}), 400
    uploaded, errors = [], []
    for f in files:
        label = os.path.basename(f.filename or '') or 'file'
        ext = ext_of(label)
        if ext not in MEDIA_EXTS:
            errors.append({'file': label, 'error': 'Unsupported file type'})
            continue
        if ext in ('heic', 'heif') and not HEIF_OK:
            errors.append({'file': label, 'error': 'HEIC support is not installed on the frame (pip install pillow-heif)'})
            continue
        tmp = os.path.join(PROCESSING_FOLDER, f'in-{uuid.uuid4().hex}.{ext}')
        is_video = ext in VIDEO_EXTS
        try:
            f.save(tmp)
            if is_video:
                name = queue_video(tmp, ext)  # the worker thread now owns tmp
            else:
                name = store_image(tmp)
            uploaded.append({'file': label, 'name': name, 'kind': 'video' if is_video else 'image',
                             'processing': is_video})
        except Exception:
            log.exception('Upload failed for %s', label)
            errors.append({'file': label, 'error': 'Could not read that file'})
        finally:
            if not is_video and os.path.exists(tmp):
                os.remove(tmp)
    return jsonify({'uploaded': uploaded, 'errors': errors}), (201 if uploaded else 400)


@app.route('/api/media/<name>', methods=['DELETE'])
def delete_media(name):
    if not remove_media_files(name):
        return jsonify({'error': 'Not found'}), 404
    return jsonify({'ok': True})


@app.route('/api/media/<name>', methods=['PATCH'])
def patch_media(name):
    if not safe_media_path(name):
        return jsonify({'error': 'Not found'}), 404
    fit = (request.get_json(silent=True) or {}).get('fit')
    if fit not in ('auto', 'fill', 'fit'):
        return jsonify({'error': 'fit must be auto, fill or fit'}), 400
    with _io_lock:
        meta = read_json(META_FILE, {})
        if fit == 'auto':
            meta.pop(name, None)
        else:
            meta[name] = {**meta.get(name, {}), 'fit': fit}
        write_json(META_FILE, meta)
    return jsonify({'ok': True, 'fit': fit})


@app.route('/api/thumb/<name>')
def get_thumb(name):
    path = safe_media_path(name)
    if not path or ext_of(name) in VIDEO_EXTS:
        return jsonify({'error': 'Not found'}), 404
    thumb = os.path.join(THUMB_DIR, name + '.jpg')
    if not os.path.exists(thumb) or os.path.getmtime(thumb) < os.path.getmtime(path):
        with Image.open(path) as im:
            im.draft('RGB', (THUMB_SIDE * 2, THUMB_SIDE * 2))
            im = ImageOps.exif_transpose(im)
            im.thumbnail((THUMB_SIDE, THUMB_SIDE))
            im.convert('RGB').save(thumb, 'JPEG', quality=80)
    return send_from_directory(THUMB_DIR, name + '.jpg', max_age=86400)


@app.route('/api/notes', methods=['GET'])
def get_notes():
    return jsonify(load_notes())


@app.route('/api/notes', methods=['POST'])
def add_note():
    data = request.get_json(silent=True) or {}
    text = str(data.get('text', '')).strip()
    author = str(data.get('author', '')).strip()[:40]
    if not text:
        return jsonify({'error': 'Note text cannot be empty'}), 400
    if len(text) > NOTE_MAX_LEN:
        return jsonify({'error': f'Note is too long (max {NOTE_MAX_LEN} characters)'}), 400
    note = {'id': uuid.uuid4().hex[:8], 'text': text, 'author': author,
            'created': datetime.now().isoformat(timespec='seconds')}
    with _io_lock:
        notes = load_notes()
        notes.append(note)
        write_json(NOTES_FILE, notes)
    return jsonify(note), 201


@app.route('/api/notes/<note_id>', methods=['DELETE'])
def delete_note(note_id):
    with _io_lock:
        notes = load_notes()
        remaining = [n for n in notes if n['id'] != note_id]
        if len(remaining) == len(notes):
            return jsonify({'error': 'Not found'}), 404
        write_json(NOTES_FILE, remaining)
    return jsonify({'ok': True})


@app.route('/api/settings', methods=['GET'])
def get_settings():
    return jsonify(load_settings())


@app.route('/api/settings', methods=['POST'])
def update_settings():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({'error': 'Expected a JSON object'}), 400
    updates, errors = {}, {}
    for key, value in data.items():
        if key not in SETTINGS_SCHEMA:
            errors[key] = 'unknown setting'
            continue
        try:
            updates[key] = SETTINGS_SCHEMA[key][1](value)
        except ValueError as e:
            errors[key] = str(e)
    if errors:
        return jsonify({'error': 'Invalid settings', 'fields': errors}), 400
    with _io_lock:
        settings = {**load_settings(), **updates}
        write_json(SETTINGS_FILE, settings)
    return jsonify(settings)


@app.route('/api/album/sync', methods=['POST'])
def album_sync():
    settings = load_settings()
    if not settings['album_url']:
        return jsonify({'error': 'Save a shared album link first'}), 400
    if not _album_status['running']:
        _album_status['running'] = True
        threading.Thread(target=run_album_sync, args=(settings,), daemon=True).start()
    return jsonify(_album_status), 202


@app.route('/api/album/status')
def album_status():
    return jsonify(_album_status)


@app.route('/api/weather')
def get_weather():
    now = time.time()
    if _weather_cache['data'] and now - _weather_cache['ts'] < WEATHER_TTL:
        return jsonify(_weather_cache['data'])
    city = os.getenv('WEATHER_CITY', 'West Columbia')
    key = os.getenv('WEATHER_API_KEY', '')
    try:
        try:
            if not key:
                raise ValueError('no WeatherAPI key')
            data = _weather_from_weatherapi(key, city)
        except Exception:
            data = _weather_from_open_meteo(city)
    except Exception:
        log.exception('Weather lookup failed')
        if _weather_cache['data']:
            return jsonify(_weather_cache['data'])
        return jsonify({'error': 'Weather unavailable'}), 502
    _weather_cache.update(ts=now, data=data)
    return jsonify(data)


@app.route('/api/wikipedia/today')
def get_wikipedia_today():
    now = time.time()
    if _wiki_cache['data'] and now - _wiki_cache['ts'] < WIKI_TTL:
        return jsonify(_wiki_cache['data'])
    token = os.getenv('WIKIMEDIA_ACCESS_TOKEN', '')
    headers = {'User-Agent': os.getenv('WIKIMEDIA_USER_AGENT', 'SmartFrame/2.0')}
    if token and token != 'YOUR_WIKIMEDIA_TOKEN':
        headers['Authorization'] = f'Bearer {token}'
    url = f'https://api.wikimedia.org/feed/v1/wikipedia/en/featured/{datetime.now():%Y/%m/%d}'
    try:
        r = requests.get(url, headers=headers, timeout=10)
        r.raise_for_status()
        data = r.json()
    except Exception:
        log.exception('Wikipedia fetch failed')
        if _wiki_cache['data']:
            return jsonify(_wiki_cache['data'])
        return jsonify({'error': 'Could not fetch Wikipedia articles'}), 502

    def shape(article, kind):
        extract = article.get('extract_html') or html.escape(article.get('extract', ''))
        title = article.get('titles', {}).get('display') or article.get('title', '')
        if not extract or title.startswith(('Special:', 'Main Page')):
            return None
        return {'title': title, 'extract_html': extract, 'type': kind, 'views': article.get('views', 0)}

    articles = []
    if data.get('tfa'):
        articles.append(shape(data['tfa'], 'featured'))
    for a in data.get('mostread', {}).get('articles', []):
        articles.append(shape(a, 'mostread'))
    articles = [a for a in articles if a]
    if not articles:
        return jsonify({'error': 'No articles found'}), 404
    _wiki_cache.update(ts=now, data={'articles': articles})
    return jsonify(_wiki_cache['data'])


def _clean_stale_processing():
    for n in os.listdir(PROCESSING_FOLDER):
        os.remove(os.path.join(PROCESSING_FOLDER, n))


if __name__ == '__main__':
    debug = os.getenv('FLASK_DEBUG') == '1'
    # The debug reloader runs this block twice; only the child should own background work.
    if not debug or os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
        _clean_stale_processing()
        threading.Thread(target=_album_scheduler, daemon=True).start()
    app.run(host='0.0.0.0', port=int(os.getenv('PORT', '5000')), debug=debug)
