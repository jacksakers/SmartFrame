'use strict';

const $ = (id) => document.getElementById(id);
const els = {
    stage: $('stage'),
    time: $('clock-time'), date: $('clock-date'),
    temp: $('weather-temp'), city: $('weather-city'), desc: $('weather-desc'),
    icon: $('weather-icon'), iconEmoji: $('weather-icon-emoji'),
    specialWrap: $('special-wrap'), special: $('special'),
    note: $('note-widget'), noteText: $('note-text'), noteAuthor: $('note-author'),
    wrapper: $('teleprompter-container'), wiki: $('teleprompter-content'),
};

const DEFAULTS = {
    fit_mode: 'smart', pair_portraits: true, photo_seconds: 15, max_video_seconds: 60,
    show_jokes: true, joke_every: 5, note_seconds: 12, wiki_speed: 'normal',
};
const WIKI_PX_PER_SEC = { slow: 25, normal: 45, fast: 80 }; // at 1080px viewport height
const FADE_MS = 1300;

let settings = { ...DEFAULTS };
let media = [];
let queue = [];
let lastShown = null;

// --- Helpers ---

async function getJSON(url, timeoutMs = 10000, headers = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const r = await fetch(url, { signal: ctrl.signal, headers, cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
    } finally {
        clearTimeout(timer);
    }
}

function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function withTimeout(promise, ms) {
    return Promise.race([promise, sleep(ms).then(() => { throw new Error('timeout'); })]);
}

function loaded(el, event) {
    return new Promise((resolve, reject) => {
        el.addEventListener(event, resolve, { once: true });
        el.addEventListener('error', () => reject(new Error('load failed')), { once: true });
    });
}

// --- Clock + night dimming ---

function updateClock() {
    const now = new Date();
    els.time.textContent = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    els.date.textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    const night = now.getHours() >= 18 || now.getHours() < 7;
    els.stage.style.filter = night ? 'brightness(0.5)' : 'brightness(1)';
}

// --- Weather ---

async function updateWeather() {
    try {
        const w = await getJSON('/api/weather');
        els.temp.textContent = `${w.temp}°`;
        els.city.textContent = w.city;
        els.desc.textContent = w.desc || '';
        els.icon.hidden = !w.icon_url;
        els.iconEmoji.hidden = !w.icon_emoji;
        if (w.icon_url) els.icon.src = w.icon_url;
        if (w.icon_emoji) els.iconEmoji.textContent = w.icon_emoji;
    } catch (e) {
        console.warn('Weather failed', e);
        if (els.temp.textContent === '--°') els.city.textContent = 'Weather unavailable';
    }
}

// --- Notes (one random note at a time) ---

let notes = [];
let lastNoteId = null;
let noteTimer = null;

async function refreshNotes() {
    try {
        notes = await getJSON('/api/notes');
        if (!noteTimer) rotateNote();
    } catch (e) {
        console.warn('Notes failed', e);
    }
}

async function rotateNote() {
    if (!notes.length) {
        els.note.style.opacity = 0;
        noteTimer = setTimeout(rotateNote, 10000);
        return;
    }
    const choices = notes.length > 1 ? notes.filter((n) => n.id !== lastNoteId) : notes;
    const note = choices[Math.floor(Math.random() * choices.length)];
    lastNoteId = note.id;
    els.note.style.opacity = 0;
    await sleep(600);
    els.noteText.textContent = note.text;
    els.noteAuthor.textContent = note.author ? `— ${note.author}` : '';
    els.note.style.opacity = 1;
    noteTimer = setTimeout(rotateNote, settings.note_seconds * 1000);
}

// --- Jokes / advice (shown in the centre card, never hides the widgets) ---

const SPECIAL_SOURCES = [
    {
        title: 'Dad Joke',
        fetch: async () => (await getJSON('https://icanhazdadjoke.com/', 6000, { Accept: 'application/json' })).joke,
    },
    {
        title: 'Some Advice',
        fetch: async () => (await getJSON('https://api.adviceslip.com/advice', 6000)).slip.advice,
    },
];
let specialGen = 0;
let slidesSinceSpecial = 0;

function hideSpecial() {
    specialGen++;
    els.special.classList.add('hidden');
    els.specialWrap.classList.add('hidden');
}

async function showSpecial() {
    const gen = ++specialGen;
    const source = SPECIAL_SOURCES[Math.floor(Math.random() * SPECIAL_SOURCES.length)];
    try {
        const text = await source.fetch();
        if (!text || gen !== specialGen) return;
        const h2 = document.createElement('h2');
        h2.textContent = source.title;
        const p = document.createElement('p');
        p.textContent = `“${text}”`;
        els.special.replaceChildren(h2, p);
        els.special.classList.remove('hidden');
        els.specialWrap.classList.remove('hidden');
    } catch (e) {
        console.warn('Special content failed', e);
    }
}

// --- Slideshow ---

const orientation = (m) => (m.width && m.height && m.height > m.width * 1.05 ? 'portrait' : 'landscape');
const modeFor = (m) => (m.fit !== 'auto' ? m.fit : settings.fit_mode);

function takeNext() {
    if (!queue.length) {
        queue = shuffle(media);
        if (queue.length > 1 && lastShown && queue[0].name === lastShown) queue.push(queue.shift());
    }
    const item = queue.shift();
    lastShown = item.name;
    return item;
}

// Returns [{item, cls, auto}] for one slide: one tile, or two portraits side by side.
function planSlide() {
    const first = takeNext();
    const mode = modeFor(first);
    const portrait = orientation(first) === 'portrait';
    if (mode === 'smart' && first.kind === 'image' && portrait && settings.pair_portraits) {
        const i = queue.findIndex((m) => m.kind === 'image' && modeFor(m) === 'smart' && orientation(m) === 'portrait');
        if (i >= 0) {
            const second = queue.splice(i, 1)[0];
            return [{ item: first, cls: 'fit' }, { item: second, cls: 'fit' }];
        }
    }
    const cls = mode === 'smart' ? (portrait ? 'fit' : 'fill') : mode;
    return [{ item: first, cls, auto: mode === 'smart' }];
}

function buildTile({ item, cls, auto }) {
    const tile = document.createElement('div');
    tile.className = 'tile';
    let main, ready;
    if (item.kind === 'video') {
        main = document.createElement('video');
        main.muted = true;
        main.defaultMuted = true;
        main.playsInline = true;
        main.preload = 'auto';
        main.className = `main ${cls}`;
        main.src = item.url;
        ready = loaded(main, 'loadeddata').then(() => {
            if (auto && main.videoHeight > main.videoWidth * 1.05) main.className = 'main fit';
        });
    } else {
        if (cls === 'fit') {
            const bg = new Image();
            bg.className = 'bg';
            bg.alt = '';
            bg.src = item.url;
            tile.append(bg);
        }
        main = new Image();
        main.className = `main ${cls}`;
        main.alt = '';
        main.src = item.url;
        ready = loaded(main, 'load');
    }
    tile.append(main);
    return { tile, main, ready, item };
}

let current = null;
let advanceTimer = null;

function scheduleAdvance(ms) {
    clearTimeout(advanceTimer);
    advanceTimer = setTimeout(showNext, ms);
}

function disposeSlide(slide) {
    slide.el.querySelectorAll('video').forEach((v) => {
        v.pause();
        v.removeAttribute('src');
        v.load();
    });
    slide.el.remove();
}

async function showNext() {
    clearTimeout(advanceTimer);
    if (!media.length) {
        els.stage.style.background = '#222';
        await refreshData();
        scheduleAdvance(15000);
        return;
    }
    els.stage.style.background = '';

    const tiles = planSlide().map(buildTile);
    const el = document.createElement('div');
    el.className = 'slide';
    tiles.forEach((t) => el.append(t.tile));
    els.stage.append(el);
    const slide = { el };

    try {
        await withTimeout(Promise.all(tiles.map((t) => t.ready)), 20000);
    } catch (e) {
        console.warn('Skipping media that failed to load', tiles.map((t) => t.item.name), e);
        disposeSlide(slide);
        scheduleAdvance(1000);
        return;
    }

    const prev = current;
    current = slide;
    el.getBoundingClientRect(); // commit initial opacity so the fade runs
    el.classList.add('active');
    if (prev) {
        prev.el.classList.remove('active');
        setTimeout(() => disposeSlide(prev), FADE_MS + 200);
    }

    hideSpecial();
    slidesSinceSpecial++;
    if (settings.show_jokes && slidesSinceSpecial >= settings.joke_every) {
        slidesSinceSpecial = 0;
        showSpecial();
    }

    const video = tiles[0].main.tagName === 'VIDEO' ? tiles[0].main : null;
    if (!video) {
        scheduleAdvance(settings.photo_seconds * 1000);
        return;
    }
    const cap = settings.max_video_seconds;
    const seconds = Number.isFinite(video.duration) ? Math.min(video.duration + 3, cap) : cap;
    scheduleAdvance(seconds * 1000);
    video.addEventListener('ended', () => { if (current === slide) scheduleAdvance(300); }, { once: true });
    video.play().catch(() => scheduleAdvance(1000));
}

async function refreshData() {
    try {
        const [m, s] = await Promise.all([getJSON('/api/media'), getJSON('/api/settings')]);
        settings = { ...DEFAULTS, ...s };
        media = m;
        const byName = new Map(m.map((i) => [i.name, i]));
        queue = queue.filter((i) => byName.has(i.name)).map((i) => byName.get(i.name));
    } catch (e) {
        console.warn('Refresh failed', e);
    }
}

// --- Wikipedia teleprompter ---

const WIKI_KEEP = new Set(['p', 'b', 'strong', 'i', 'em', 'br']);
const WIKI_DROP = new Set(['script', 'style', 'sup', 'img', 'figure', 'table']);
let articles = [];
let articleIndex = 0;

function cleanInto(src, dest) {
    for (const n of src.childNodes) {
        if (n.nodeType === Node.TEXT_NODE) {
            dest.append(n.textContent);
        } else if (n.nodeType === Node.ELEMENT_NODE) {
            const tag = n.tagName.toLowerCase();
            if (WIKI_DROP.has(tag)) continue;
            if (WIKI_KEEP.has(tag)) {
                const el = document.createElement(tag === 'b' ? 'strong' : tag === 'i' ? 'em' : tag);
                cleanInto(n, el);
                dest.append(el);
            } else {
                cleanInto(n, dest);
            }
        }
    }
}

function parseHtml(markup) {
    return new DOMParser().parseFromString(markup || '', 'text/html').body;
}

function renderArticle(article) {
    const meta = document.createElement('div');
    meta.className = 'meta';
    const views = article.views ? ` • ${Math.round(article.views / 1000)}K views` : '';
    meta.textContent = (article.type === 'featured' ? '⭐ Featured' : '📈 Trending') + views;
    const title = document.createElement('h3');
    title.textContent = parseHtml(article.title).textContent;
    const body = document.createElement('div');
    cleanInto(parseHtml(article.extract_html), body);
    els.wiki.replaceChildren(meta, title, body);
}

async function loadArticles() {
    try {
        const data = await getJSON('/api/wikipedia/today', 15000);
        if (data.articles && data.articles.length) articles = data.articles;
    } catch (e) {
        console.warn('Wikipedia failed', e);
    }
}

// Single sequential loop (no per-refresh intervals): time-based scroll, then the next article.
async function runWikiLoop() {
    for (;;) {
        if (!articles.length) {
            await loadArticles();
            if (!articles.length) {
                els.wiki.textContent = 'Articles unavailable';
                await sleep(5 * 60 * 1000);
                continue;
            }
        }
        renderArticle(articles[articleIndex % articles.length]);
        articleIndex++;
        els.wiki.style.transform = 'translate3d(0,0,0)';
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

        const viewport = els.wrapper.clientHeight;
        const maxScroll = Math.max(0, els.wiki.offsetHeight - viewport + viewport * 0.15);
        const speed = WIKI_PX_PER_SEC[settings.wiki_speed] * (window.innerHeight / 1080);
        const scrollMs = maxScroll > 0 ? (maxScroll / speed) * 1000 : 0;
        const endPause = maxScroll > 0 ? 4000 : 12000;
        const t0 = performance.now() + 3000;

        await new Promise((resolve) => {
            const frame = (now) => {
                if (scrollMs > 0) {
                    const p = Math.min(Math.max(now - t0, 0) / scrollMs, 1);
                    els.wiki.style.transform = `translate3d(0,${-maxScroll * p}px,0)`;
                }
                if (now < t0 + scrollMs + endPause) requestAnimationFrame(frame);
                else resolve();
            };
            requestAnimationFrame(frame);
        });
    }
}

// --- Start ---

async function init() {
    updateClock();
    setInterval(updateClock, 1000);

    updateWeather();
    setInterval(updateWeather, 10 * 60 * 1000);

    await refreshData();
    setInterval(refreshData, 5 * 60 * 1000);
    showNext();

    refreshNotes();
    setInterval(refreshNotes, 2 * 60 * 1000);

    runWikiLoop();
    setInterval(loadArticles, 6 * 60 * 60 * 1000);
}

document.addEventListener('DOMContentLoaded', init);
