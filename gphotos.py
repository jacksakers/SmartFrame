"""Best-effort sync of photos from a public Google Photos *shared album* link.

Google's Photos Library API no longer lets apps read a user's own library, so the
frame reads the public share page instead. Share an album (e.g. "Frame") with a link,
paste the link into the frame's settings, and new photos appear automatically.
"""

import hashlib
import os
import re
import tempfile

import requests

FILE_PREFIX = 'gp-'
MIN_SIDE = 500  # skips avatars / cover icons that also appear on the page
_ENTRY = re.compile(r'\["(https://lh3\.googleusercontent\.com/[A-Za-z0-9_\-/]+)",(\d+),(\d+)')
HEADERS = {'User-Agent': 'Mozilla/5.0 (X11; Linux aarch64) SmartFrame/2.0'}


def parse_album(html):
    """Return [(base_url, width, height)] in page order, without duplicates."""
    seen, photos = set(), []
    for url, w, h in _ENTRY.findall(html):
        if url in seen or min(int(w), int(h)) < MIN_SIDE:
            continue
        seen.add(url)
        photos.append((url, int(w), int(h)))
    return photos


def file_name_for(url):
    return FILE_PREFIX + hashlib.sha1(url.encode()).hexdigest()[:16] + '.jpg'


def sync_album(album_url, upload_dir, max_photos, save_image):
    """Download new album photos and drop synced photos that left the album.

    save_image(src_path, dest_name) normalises and stores a downloaded photo.
    """
    if not re.match(r'^https://(photos\.app\.goo\.gl|photos\.google\.com)/', album_url):
        raise ValueError('That does not look like a Google Photos shared album link')
    page = requests.get(album_url, headers=HEADERS, timeout=30)
    page.raise_for_status()
    photos = parse_album(page.text)
    if not photos:
        raise ValueError('No photos found - is the album shared with a link?')

    wanted = {file_name_for(url): url for url, _, _ in photos[-max_photos:]}
    existing = {n for n in os.listdir(upload_dir) if n.startswith(FILE_PREFIX)}
    added = 0
    for name, url in wanted.items():
        if name in existing:
            continue
        r = requests.get(url + '=w2048-h2048', headers=HEADERS, timeout=60)
        r.raise_for_status()
        with tempfile.NamedTemporaryFile(delete=False) as tmp:
            tmp.write(r.content)
        try:
            save_image(tmp.name, name)
            added += 1
        finally:
            os.remove(tmp.name)
    removed = 0
    for name in existing - set(wanted):
        os.remove(os.path.join(upload_dir, name))
        removed += 1
    return {'added': added, 'removed': removed, 'total': len(wanted)}
