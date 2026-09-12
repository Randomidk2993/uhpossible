/* ═══════════════════════════════════════════════════════════
   Viewtube — app.js  (Piped API edition)
   GitHub Pages frontend + Cloudflare Worker CORS proxy
   ═══════════════════════════════════════════════════════════

   ⚠️  SETUP: Set your Cloudflare Worker URL below.
*/

const PROXY_BASE = 'https://lucky-sun-99ea.xxgoldenwarriors.workers.dev';

/* ───────────────────────────────────────────────────────── */

// ── Piped API instances (ordered by preference) ──────────
// Piped has no bot-challenge walls on server-to-server requests.
// Source: https://github.com/TeamPiped/Piped/wiki/Instances
const ALL_INSTANCES = [
  'https://pipedapi.kavin.rocks',        // official
  'https://pipedapi-libre.kavin.rocks',  // official libre
  'https://pipedapi.adminforge.de',      // 🇩🇪
  'https://piped-api.privacy.com.de',    // 🇩🇪
  'https://pipedapi.r4fo.com',           // 🇩🇪
  'https://api.piped.yt',                // 🇩🇪
  'https://pipedapi.drgns.space',        // 🇺🇸
  'https://pipedapi.darkness.services',  // 🇺🇸
  'https://api.piped.private.coffee',    // 🇦🇹
  'https://pipedapi.ducks.party',        // 🇳🇱
];

// ── State ────────────────────────────────────────────────
let currentQuery    = '';
let currentPage     = 1;
let currentNextpage = null; // Piped uses cursor-based pagination
let currentVideo    = '';

// ── DOM helpers ──────────────────────────────────────────
const $  = id => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

// ── Formatters ───────────────────────────────────────────
function fmtDuration(s) {
  if (!s || s < 0) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${m}:${String(sec).padStart(2,'0')}`;
}

function fmtViews(n) {
  if (!n) return '';
  if (n >= 1_000_000) return (n/1_000_000).toFixed(1).replace(/\.0$/,'') + 'M views';
  if (n >= 1_000)     return Math.round(n/1_000) + 'K views';
  return n + ' views';
}

// Piped returns relative strings like "3 months ago" — pass through directly
function fmtUploadedDate(str) {
  return str || '';
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Extract video ID from a Piped url field ("/watch?v=XYZ") ──
function extractId(url) {
  if (!url) return '';
  try {
    // url is like "/watch?v=VIDEO_ID"
    const u = new URL(url, 'https://x');
    return u.searchParams.get('v') || '';
  } catch { return ''; }
}

// ── Instance status indicator ─────────────────────────────
function setInstanceStatus(state) {
  const el = $('instance-status');
  if (!el) return;
  el.textContent = { ok: '🟢', error: '🔴', checking: '🟡' }[state] || '';
  el.title = state === 'ok' ? 'Instance is responding'
           : state === 'error' ? 'Instance unavailable'
           : 'Checking instance…';
}

function onInstanceChange() {
  $('home-grid').innerHTML = '';
  setInstanceStatus('checking');
}

// ── Core fetch with auto-fallback across all instances ────
async function fetchWithFallback(path, params = {}) {
  if (!PROXY_BASE || PROXY_BASE.includes('YOUR-WORKER')) {
    throw new Error('PROXY_BASE not set — edit app.js and add your Cloudflare Worker URL.');
  }

  const sel      = $('instance-sel');
  const selected = sel?.value || ALL_INSTANCES[0];
  const ordered  = [selected, ...ALL_INSTANCES.filter(u => u !== selected)];

  let lastErr;
  for (const instance of ordered) {
    try {
      const data = await doFetch(instance, path, params);
      if (sel && sel.value !== instance) {
        sel.value = instance;
        toast(`Switched to ${new URL(instance).hostname}`);
      }
      setInstanceStatus('ok');
      return data;
    } catch (e) {
      lastErr = e;
      if (e.name === 'AbortError') throw e;
    }
  }
  setInstanceStatus('error');
  throw lastErr || new Error('All Piped instances failed');
}

async function doFetch(instance, path, params) {
  const targetUrl = new URL(instance + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) targetUrl.searchParams.set(k, v);
  });

  const proxyUrl = new URL(PROXY_BASE);
  proxyUrl.searchParams.set('url', targetUrl.toString());

  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 14_000);

  try {
    const res = await fetch(proxyUrl.toString(), { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}${body ? ': ' + body.slice(0, 120) : ''}`);
    }
    const text = await res.text();
    if (text.trimStart().startsWith('<')) {
      throw new Error('Instance returned HTML instead of JSON (bot-challenged or down)');
    }
    return JSON.parse(text);
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function apiGet(path, params = {}) {
  return fetchWithFallback(path, params);
}

// ── Toast notification ───────────────────────────────────
let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 4500);
}

// ── View switching ───────────────────────────────────────
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $(id).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── State boxes ──────────────────────────────────────────
function showState(boxId, type, msg, retryFn) {
  const box = $(boxId);
  box.className = 'state-box' + (type === 'error' ? ' error' : '');
  box.innerHTML = type === 'loading'
    ? `<div class="spinner" aria-hidden="true"></div><p>${esc(msg)}</p>`
    : type === 'error'
      ? `<strong>Something went wrong</strong><p>${esc(msg)}</p>
         ${retryFn ? `<button class="retry-btn" onclick="(${retryFn.name})()">Try again</button>` : ''}`
      : `<p>${esc(msg)}</p>`;
  box.classList.remove('hidden');
}
function hideState(boxId) { $(boxId).classList.add('hidden'); }

// ── HOME / TRENDING ──────────────────────────────────────
// Piped: GET /trending?region=US → array of stream objects
function navHome() {
  history.pushState({}, '', location.pathname);
  showView('view-home');
  if (!$('home-grid').children.length) loadTrending();
}

async function loadTrending() {
  $('home-grid').innerHTML = '';
  showState('home-state', 'loading', 'Loading trending…');
  setInstanceStatus('checking');

  try {
    const region = $('region-sel').value;
    const data   = await apiGet('/trending', { region });
    hideState('home-state');
    if (!data?.length) { showState('home-state', 'empty', 'No trending videos found.'); return; }
    renderGrid('home-grid', data);
  } catch (e) {
    showState('home-state', 'error', e.message, loadTrending);
  }
}

// ── SEARCH ───────────────────────────────────────────────
// Piped: GET /search?q=...&filter=videos&nextpage=...
function handleSearch(e) {
  e.preventDefault();
  const q = $('q').value.trim();
  if (!q) return;
  currentQuery    = q;
  currentPage     = 1;
  currentNextpage = null;
  history.pushState({}, '', `?q=${encodeURIComponent(q)}`);
  showView('view-search');
  runSearch();
}

function rerunSearch() {
  if (!currentQuery) return;
  currentPage     = 1;
  currentNextpage = null;
  runSearch();
}

async function runSearch() {
  $('search-heading').textContent = `"${currentQuery}"`;
  $('search-grid').innerHTML = '';
  $('pagination').classList.add('hidden');
  showState('search-state', 'loading', 'Searching…');
  setInstanceStatus('checking');

  try {
    const filter = $('type-sel').value;   // videos | channels | playlists | all
    const params = {
      q:      currentQuery,
      filter: filter === 'all' ? 'all' : filter,
    };
    // Piped uses nextpage cursor for pagination
    if (currentNextpage && currentPage > 1) {
      params.nextpage = currentNextpage;
    }

    const data = await apiGet('/search', params);
    hideState('search-state');

    const items = data.items || data; // Piped returns { items, nextpage } or just []
    currentNextpage = data.nextpage || null;

    if (!items?.length) {
      showState('search-state', 'empty', 'No results. Try a different query or switch instance.');
      return;
    }

    renderGrid('search-grid', items);

    $('page-lbl').textContent = `Page ${currentPage}`;
    $('btn-prev').disabled    = currentPage <= 1;
    $('btn-next').disabled    = !currentNextpage;
    $('pagination').classList.remove('hidden');
  } catch (e) {
    showState('search-state', 'error', e.message, runSearch);
  }
}

function changePage(delta) {
  if (delta < 0) {
    // Piped doesn't support going back via cursor — reload from start
    currentPage     = Math.max(1, currentPage + delta);
    currentNextpage = null;
    if (currentPage === 1) { runSearch(); return; }
  }
  currentPage = Math.max(1, currentPage + delta);
  runSearch();
  window.scrollTo({ top: 0 });
}

// ── RENDER helpers ────────────────────────────────────────
function renderGrid(containerId, items) {
  const grid = $(containerId);
  items.forEach(item => {
    // Piped item types: stream (video), channel, playlist
    if (item.type === 'stream' || item.url?.includes('/watch')) {
      grid.appendChild(makeVideoCard(item));
    } else if (item.type === 'channel' || item.url?.includes('/channel')) {
      grid.appendChild(makeChannelCard(item));
    } else if (item.type === 'playlist') {
      grid.appendChild(makeVideoCard(item)); // render playlist like a video card
    }
  });
}

function makeVideoCard(v) {
  // Piped field names differ from Invidious:
  //   thumbnail  (not videoThumbnails array)
  //   duration   (seconds, int)
  //   views      (not viewCount)
  //   uploadedDate (relative string, not unix)
  //   uploader   (not author)
  //   url        ("/watch?v=ID")
  const videoId = extractId(v.url);
  const thumb   = v.thumbnail || '';
  const dur     = fmtDuration(v.duration);
  const card    = el('article', 'video-card');
  card.setAttribute('tabindex', '0');
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', v.title || 'Video');
  card.innerHTML = `
    <div class="thumb-wrap">
      ${thumb ? `<img class="thumb" src="${esc(thumb)}" alt="" loading="lazy" decoding="async" />` : ''}
      ${dur ? `<span class="duration">${esc(dur)}</span>` : ''}
    </div>
    <div class="card-body">
      <p class="card-title">${esc(v.title || '')}</p>
      <p class="card-channel">${esc(v.uploader || v.uploaderName || '')}</p>
      <p class="card-meta">
        ${v.views ? `<span>${fmtViews(v.views)}</span>` : ''}
        ${v.uploadedDate ? `<span>${esc(fmtUploadedDate(v.uploadedDate))}</span>` : ''}
        ${v.uploaded ? `<span>${esc(fmtUploadedDate(v.uploaded))}</span>` : ''}
      </p>
    </div>`;
  if (videoId) {
    const go = () => loadVideo(videoId);
    card.addEventListener('click', go);
    card.addEventListener('keydown', e => (e.key === 'Enter' || e.key === ' ') && go());
  }
  return card;
}

function makeChannelCard(ch) {
  // Piped channel fields: name, thumbnail, subscribers, description, url
  const thumb = ch.thumbnail || '';
  const card  = el('article', 'channel-card');
  card.innerHTML = `
    ${thumb ? `<img class="ch-card-avatar" src="${esc(thumb)}" alt="" loading="lazy" />` : '<div class="ch-card-avatar"></div>'}
    <div>
      <p class="ch-card-name">${esc(ch.name || '')}</p>
      <p class="ch-card-subs">${ch.subscribers > 0 ? fmtViews(ch.subscribers).replace(' views','') + ' subs' : ''}</p>
    </div>`;
  return card;
}

// ── WATCH / VIDEO ─────────────────────────────────────────
// Piped: GET /streams/:videoId
function loadVideo(videoId) {
  currentVideo = videoId;
  history.pushState({}, '', `?v=${videoId}`);
  showView('view-watch');

  // Embed immediately via YouTube nocookie (no proxy needed for playback)
  $('player-wrap').innerHTML = '';
  const iframe       = document.createElement('iframe');
  iframe.src         = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`;
  iframe.allow       = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  iframe.allowFullscreen = true;
  iframe.title       = 'Video player';
  $('player-wrap').appendChild(iframe);

  $('video-meta').classList.add('hidden');
  $('related').innerHTML = '';
  $('yt-link').href = `https://www.youtube.com/watch?v=${videoId}`;

  fetchVideoMeta(videoId);
}

async function fetchVideoMeta(videoId) {
  try {
    // Piped /streams/:videoId response fields:
    //   title, description, views, likes, uploader, uploaderUrl,
    //   uploaderAvatar, uploaderSubscriberCount, uploadDate,
    //   relatedStreams[], thumbnailUrl, duration
    const v = await apiGet(`/streams/${videoId}`);

    $('v-title').textContent = v.title || '';
    $('v-views').textContent = fmtViews(v.views);
    $('v-date').textContent  = v.uploadDate ? new Date(v.uploadDate).toLocaleDateString() : '';
    $('v-desc').textContent  = v.description || 'No description.';

    if (v.likes > 0) {
      $('v-likes').textContent = '👍 ' + fmtViews(v.likes).replace(' views', '');
      $('v-likes').classList.remove('hidden');
    } else {
      $('v-likes').classList.add('hidden');
    }

    $('ch-name').textContent = v.uploader || '';
    $('ch-subs').textContent = v.uploaderSubscriberCount > 0
      ? fmtViews(v.uploaderSubscriberCount).replace(' views', '') + ' subscribers'
      : '';

    $('ch-avatar').innerHTML = v.uploaderAvatar
      ? `<img src="${esc(v.uploaderAvatar)}" alt="" loading="lazy" />`
      : '';

    $('video-meta').classList.remove('hidden');

    // Related streams — Piped calls them relatedStreams
    if (v.relatedStreams?.length) {
      v.relatedStreams.slice(0, 15).forEach(r => {
        $('related').appendChild(makeRelatedCard(r));
      });
    }
  } catch (e) {
    $('v-title').textContent = 'Video';
    $('video-meta').classList.remove('hidden');
    toast('Metadata unavailable: ' + e.message);
  }
}

function makeRelatedCard(v) {
  const videoId = extractId(v.url);
  const thumb   = v.thumbnail || '';
  const card    = el('div', 'related-card');
  card.innerHTML = `
    <div class="rel-thumb">
      ${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy" decoding="async" />` : ''}
      ${v.duration ? `<span class="duration">${esc(fmtDuration(v.duration))}</span>` : ''}
    </div>
    <div class="rel-info">
      <p class="rel-title">${esc(v.title || '')}</p>
      <p class="rel-channel">${esc(v.uploader || v.uploaderName || '')}</p>
      <p class="rel-meta">${fmtViews(v.views)}</p>
    </div>`;
  if (videoId) card.addEventListener('click', () => loadVideo(videoId));
  return card;
}

// ── URL routing ──────────────────────────────────────────
function route() {
  const p = new URLSearchParams(location.search);
  const v = p.get('v');
  const q = p.get('q');
  if (v) {
    loadVideo(v);
  } else if (q) {
    $('q').value    = q;
    currentQuery    = q;
    currentNextpage = null;
    showView('view-search');
    runSearch();
  } else {
    showView('view-home');
    loadTrending();
  }
}

window.addEventListener('popstate', route);

// ── Boot ─────────────────────────────────────────────────
route();
