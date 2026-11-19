import io
import json

import pytest
from PIL import Image

import app as smartframe
import gphotos


@pytest.fixture
def client(tmp_path, monkeypatch):
    data = tmp_path / 'data'
    uploads = tmp_path / 'uploads'
    (data / 'thumbs').mkdir(parents=True)
    (uploads / '.processing').mkdir(parents=True)
    monkeypatch.setattr(smartframe, 'DATA_DIR', str(data))
    monkeypatch.setattr(smartframe, 'THUMB_DIR', str(data / 'thumbs'))
    monkeypatch.setattr(smartframe, 'SETTINGS_FILE', str(data / 'settings.json'))
    monkeypatch.setattr(smartframe, 'NOTES_FILE', str(data / 'notes.json'))
    monkeypatch.setattr(smartframe, 'META_FILE', str(data / 'media_meta.json'))
    monkeypatch.setattr(smartframe, 'LEGACY_REMINDERS_FILE', str(tmp_path / 'reminders.txt'))
    monkeypatch.setattr(smartframe, 'UPLOAD_FOLDER', str(uploads))
    monkeypatch.setattr(smartframe, 'PROCESSING_FOLDER', str(uploads / '.processing'))
    smartframe._info_cache.clear()
    return smartframe.app.test_client()


def test_parse_album_filters_small_and_duplicate():
    page = ('["https://lh3.googleusercontent.com/abc123",4000,3000,1]'
            '["https://lh3.googleusercontent.com/abc123",4000,3000,1]'
            '["https://lh3.googleusercontent.com/avatar",96,96,1]'
            '["https://lh3.googleusercontent.com/def456",3000,4000,1]')
    assert gphotos.parse_album(page) == [
        ('https://lh3.googleusercontent.com/abc123', 4000, 3000),
        ('https://lh3.googleusercontent.com/def456', 3000, 4000),
    ]


def test_settings_defaults_and_validation(client):
    assert client.get('/api/settings').get_json()['photo_seconds'] == 15
    ok = client.post('/api/settings', json={'photo_seconds': 20, 'fit_mode': 'fill'})
    assert ok.status_code == 200 and ok.get_json()['photo_seconds'] == 20
    bad = client.post('/api/settings', json={'photo_seconds': 1, 'fit_mode': 'zoom', 'nope': 1,
                                             'album_url': 'https://evil.example/x'})
    assert bad.status_code == 400
    assert set(bad.get_json()['fields']) == {'photo_seconds', 'fit_mode', 'nope', 'album_url'}
    assert client.get('/api/settings').get_json()['photo_seconds'] == 20  # rejected update changed nothing


def test_upload_rotated_jpeg(client):
    im = Image.new('RGB', (400, 200), 'red')
    exif = im.getexif()
    exif[0x0112] = 6  # rotate 90 CW, so the stored 400x200 displays as 200x400
    buf = io.BytesIO()
    im.save(buf, 'JPEG', exif=exif)
    buf.seek(0)
    res = client.post('/api/media', data={'file': (buf, 'IMG_1.jpg')}, content_type='multipart/form-data')
    assert res.status_code == 201
    name = res.get_json()['uploaded'][0]['name']
    item = next(m for m in client.get('/api/media').get_json() if m['name'] == name)
    assert (item['width'], item['height']) == (200, 400)
    assert client.get(f'/api/thumb/{name}').status_code == 200


def test_upload_rejects_bad_type_and_traversal(client):
    res = client.post('/api/media', data={'file': (io.BytesIO(b'x'), 'evil.php')}, content_type='multipart/form-data')
    assert res.status_code == 400
    assert client.delete('/api/media/..%2Fapp.py').status_code == 404
    assert client.patch('/api/media/.hidden.jpg', json={'fit': 'fill'}).status_code == 404


def test_patch_fit_override(client):
    buf = io.BytesIO()
    Image.new('RGB', (50, 50)).save(buf, 'JPEG')
    buf.seek(0)
    name = client.post('/api/media', data={'file': (buf, 'a.jpg')},
                       content_type='multipart/form-data').get_json()['uploaded'][0]['name']
    assert client.patch(f'/api/media/{name}', json={'fit': 'fit'}).status_code == 200
    assert client.get('/api/media').get_json()[0]['fit'] == 'fit'
    assert client.patch(f'/api/media/{name}', json={'fit': 'bogus'}).status_code == 400
    assert client.delete(f'/api/media/{name}').status_code == 200
    assert client.get('/api/media').get_json() == []


def test_notes_crud_and_legacy_import(client, tmp_path):
    (tmp_path / 'reminders.txt').write_text('Eat the tomato\n')
    first = client.get('/api/notes').get_json()
    assert [n['text'] for n in first] == ['Eat the tomato']

    created = client.post('/api/notes', json={'text': ' hi ', 'author': 'Kelsey'})
    assert created.status_code == 201
    note_id = created.get_json()['id']
    assert client.post('/api/notes', json={'text': ''}).status_code == 400
    assert client.post('/api/notes', json={'text': 'x' * 281}).status_code == 400

    assert client.delete(f'/api/notes/{note_id}').status_code == 200
    assert client.delete(f'/api/notes/{note_id}').status_code == 404
    assert len(client.get('/api/notes').get_json()) == 1
    assert json.loads((tmp_path / 'data' / 'notes.json').read_text())[0]['text'] == 'Eat the tomato'
