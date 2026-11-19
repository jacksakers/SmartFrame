'use strict';

const $ = (id) => document.getElementById(id);

function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
        if (k === 'class') el.className = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v);
    }
    el.append(...children);
    return el;
}

async function api(path, options = {}) {
    let res;
    try {
        res = await fetch(path, options);
    } catch (e) {
        throw new Error('Cannot reach the frame. Check your wifi and try again.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(data.error || `Request failed (${res.status})`);
        err.fields = data.fields;
        throw err;
    }
    return data;
}

function say(el, text, kind = '') {
    el.textContent = text;
    el.className = 'msg ' + kind;
}

// --- Tabs ---

const loaders = { notes: loadNotes, library: loadLibrary, settings: loadSettings };

function showTab(name) {
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${name}`));
    history.replaceState(null, '', `#${name}`);
    if (loaders[name]) loaders[name]();
}

$('tabs').addEventListener('click', (e) => {
    if (e.target.dataset.tab) showTab(e.target.dataset.tab);
});

// --- Notes ---

const authorEl = $('author');
const noteInput = $('note-input');
authorEl.value = localStorage.getItem('sf-author') || '';
authorEl.addEventListener('input', () => localStorage.setItem('sf-author', authorEl.value.trim()));
noteInput.addEventListener('input', () => { $('note-count').textContent = `${noteInput.value.length} / 280`; });

$('note-send').addEventListener('click', async () => {
    const text = noteInput.value.trim();
    if (!text) return say($('note-msg'), 'Write something first.', 'error');
    $('note-send').disabled = true;
    try {
        await api('/api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, author: authorEl.value.trim() }),
        });
        noteInput.value = '';
        $('note-count').textContent = '0 / 280';
        say($('note-msg'), 'Sent!', 'ok');
        loadNotes();
    } catch (e) {
        say($('note-msg'), e.message, 'error');
    } finally {
        $('note-send').disabled = false;
    }
});

async function loadNotes() {
    try {
        const notes = await api('/api/notes');
        const list = $('note-list');
        list.replaceChildren(...notes.slice().reverse().map((n) => h('li', {},
            h('div', { class: 'body' }, n.text, n.author ? h('div', { class: 'by' }, `— ${n.author}`) : ''),
            h('button', {
                class: 'danger',
                onclick: async () => {
                    try { await api(`/api/notes/${encodeURIComponent(n.id)}`, { method: 'DELETE' }); loadNotes(); }
                    catch (e) { say($('note-msg'), e.message, 'error'); }
                },
            }, 'Delete'))));
        if (!notes.length) list.replaceChildren(h('li', { class: 'muted' }, 'No notes yet.'));
    } catch (e) {
        say($('note-msg'), e.message, 'error');
    }
}

// --- Upload ---

const fileInput = $('file-input');
const dropzone = $('dropzone');
const uploadQueue = [];
let uploading = false;

fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });
['dragenter', 'dragover'].forEach((ev) => dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove('over'); }));
dropzone.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));

function addFiles(files) {
    for (const file of files) {
        const bar = h('progress', { max: '100', value: '0' });
        const status = h('div', { class: 'muted' }, 'Waiting…');
        const retry = h('button', { class: 'secondary', hidden: '' }, 'Retry');
        const li = h('li', {}, h('div', { class: 'body' }, h('div', {}, file.name), bar, status), retry);
        const item = { file, bar, status, retry };
        retry.addEventListener('click', () => {
            retry.hidden = true;
            status.className = 'muted';
            status.textContent = 'Waiting…';
            uploadQueue.push(item);
            pump();
        });
        $('upload-list').prepend(li);
        uploadQueue.push(item);
    }
    pump();
}

async function pump() {
    if (uploading) return;
    uploading = true;
    while (uploadQueue.length) await uploadOne(uploadQueue.shift());
    uploading = false;
}

function uploadOne(item) {
    return new Promise((resolve) => {
        const fail = (msg) => {
            item.status.textContent = msg;
            item.status.className = 'err';
            item.retry.hidden = false;
            resolve();
        };
        const form = new FormData();
        form.append('file', item.file);
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/media');
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) item.bar.value = (e.loaded / e.total) * 100;
            item.status.textContent = 'Uploading…';
        };
        xhr.upload.onload = () => { item.status.textContent = 'Processing…'; };
        xhr.onerror = () => fail('Connection lost. Tap Retry.');
        xhr.ontimeout = () => fail('Timed out. Tap Retry.');
        xhr.onload = () => {
            let data = {};
            try { data = JSON.parse(xhr.responseText); } catch (e) { /* non-JSON error page */ }
            if (xhr.status >= 200 && xhr.status < 300 && data.uploaded && data.uploaded.length) {
                item.bar.value = 100;
                item.status.className = 'muted';
                item.status.textContent = data.uploaded[0].processing
                    ? 'Uploaded. The video will appear on the frame in a few minutes.'
                    : 'Added to the frame.';
                resolve();
            } else {
                const detail = (data.errors && data.errors[0] && data.errors[0].error) || data.error;
                fail(detail || `Upload failed (${xhr.status}).`);
            }
        };
        xhr.send(form);
    });
}

// --- Library ---

async function loadLibrary() {
    try {
        const items = await api('/api/media');
        const grid = $('library-grid');
        say($('library-msg'), items.length ? `${items.length} item${items.length === 1 ? '' : 's'}` : 'No media yet.');
        grid.replaceChildren(...items.map(card));
    } catch (e) {
        say($('library-msg'), e.message, 'error');
    }
}

function card(m) {
    const thumb = m.kind === 'video'
        ? h('video', { src: `${m.url}#t=0.1`, preload: 'metadata', muted: '', playsinline: '' })
        : h('img', { src: `/api/thumb/${encodeURIComponent(m.name)}`, loading: 'lazy', alt: '' });
    const fit = h('select', {
        onchange: async (e) => {
            try {
                await api(`/api/media/${encodeURIComponent(m.name)}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fit: e.target.value }),
                });
            } catch (err) { say($('library-msg'), err.message, 'error'); }
        },
    }, ...[['auto', 'Auto crop'], ['fill', 'Fill'], ['fit', 'Fit']].map(([v, t]) => {
        const o = h('option', { value: v }, t);
        o.selected = m.fit === v;
        return o;
    }));
    const del = h('button', {
        class: 'danger',
        onclick: async () => {
            if (!confirm('Delete this from the frame?')) return;
            try { await api(`/api/media/${encodeURIComponent(m.name)}`, { method: 'DELETE' }); loadLibrary(); }
            catch (err) { say($('library-msg'), err.message, 'error'); }
        },
    }, 'Delete');
    const badge = m.kind === 'video' ? 'Video' : m.source === 'google' ? 'Google' : '';
    return h('div', { class: 'card' },
        h('div', { class: 'thumb' }, thumb, badge ? h('span', { class: 'badge' }, badge) : ''),
        h('div', { class: 'tools' }, fit, del));
}

// --- Settings ---

const settingEls = [...document.querySelectorAll('[data-setting]')];

async function loadSettings() {
    try {
        const s = await api('/api/settings');
        for (const el of settingEls) {
            if (el.type === 'checkbox') el.checked = !!s[el.id];
            else el.value = s[el.id];
        }
        loadAlbumStatus();
    } catch (e) {
        say($('settings-msg'), e.message, 'error');
    }
}

async function saveSettings() {
    const body = {};
    for (const el of settingEls) {
        body[el.id] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value.trim();
    }
    try {
        await api('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        say($('settings-msg'), 'Saved. The frame picks changes up within a few minutes.', 'ok');
        return true;
    } catch (err) {
        const fields = err.fields ? Object.entries(err.fields).map(([k, v]) => `${k}: ${v}`).join('; ') : '';
        say($('settings-msg'), fields || err.message, 'error');
        return false;
    }
}

$('settings-form').addEventListener('submit', (e) => {
    e.preventDefault();
    saveSettings();
});

let albumPoll = null;

function renderAlbumStatus(s) {
    const when = s.last_attempt ? new Date(s.last_attempt * 1000).toLocaleString() : null;
    $('album-status').textContent = s.running ? 'Syncing…'
        : when ? `Last sync ${when}: ${s.ok ? '' : 'failed – '}${s.message}` : 'Not synced yet.';
}

async function loadAlbumStatus() {
    try {
        const s = await api('/api/album/status');
        renderAlbumStatus(s);
        clearTimeout(albumPoll);
        if (s.running) albumPoll = setTimeout(loadAlbumStatus, 2000);
    } catch (e) {
        $('album-status').textContent = e.message;
    }
}

$('album-sync').addEventListener('click', async () => {
    try {
        // Sync uses the saved link, so save the form first.
        if (!(await saveSettings())) return;
        renderAlbumStatus(await api('/api/album/sync', { method: 'POST' }));
        loadAlbumStatus();
    } catch (e) {
        say($('settings-msg'), e.message, 'error');
    }
});

const initial = location.hash.slice(1);
showTab(document.getElementById(`tab-${initial}`) ? initial : 'notes');
