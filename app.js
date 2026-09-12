/* ═══════════════════════════════════════════════════════════
   Viewtube — app.js
   GitHub Pages frontend + Cloudflare Worker CORS proxy
   ═══════════════════════════════════════════════════════════

   ⚠️  SETUP: Set your Cloudflare Worker URL below.
       After deploying cloudflare-worker.js to CF Workers,
       paste your worker URL here (no trailing slash):
*/

const PROXY_BASE = 'https://lucky-sun-99ea.xxgoldenwarriors.workers.dev';

/* ───────────────────────────────────────────────────────── */

// ── State ────────────────────────────────────────────────
let currentQuery = '';
let currentPage  = 1;
let currentVideo = '';

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

function fmtDate(unix) {
  if (!unix) return '';
  const diff = (Date.now() / 1000) - unix;
  if (diff < 60)        return 'just now';
  if (diff < 3600)      return Math.floor(diff/60) + ' min ago';
  if (diff < 86400)     return Math.floor(diff/3600) + ' hr ago';
  if (diff < 2_592_000) return Math.floor(diff/86400) + ' days ago';
  if (diff < 31_536_000)return Math.floor(diff/2_592_000) + ' mo ago';
  return Math.floor(diff/31_536_000) + ' yr ago';
}

function bestThumb(thumbs) {
  if (!thumbs?.length) return '';
  const pref = ['maxresdefault','sddefault','high','medium','default'];
  for (const q of pref) {
    const t = thumbs.find(x => x.quality === q);
    if (t?.url) return t.url;
  }
  return thumbs[0]?.url || '';
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── API via Cloudflare Worker proxy ──────────────────────
async function apiGet(path, params = {}) {
  if (!PROXY_BASE || PROXY_BASE.includes('YOUR-WORKER')) {
    throw new Error('PROXY_BASE not set — edit app.js and add your Cloudflare Worker URL.');
  }

  const instance = $('instance-sel').value;
  const targetUrl = new URL(instance + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) targetUrl.searchParams.set(k, v);
  });

  const proxyUrl = new URL(PROXY_BASE);
  proxyUrl.searchParams.set('url', targetUrl.toString());

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 14_000);

  try {
    const res = await fetch(proxyUrl.toString(), { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}${body ? ': ' + body.slice(0,120) : ''}`);
    }
    return await res.json();
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
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
function navHome() {
  history.pushState({}, '', location.pathname);
  showView('view-home');
  if (!$('home-grid').children.length) loadTrending();
}

async function loadTrending() {
  $('home-grid').innerHTML = '';
  showState('home-state', 'loading', 'Loading trending…');

  try {
    const region = $('region-sel').value;
    const data = await apiGet('/api/v1/trending', { region, type: 'default' });
    hideState('home-state');
    if (!data?.length) { showState('home-state', 'empty', 'No trending videos found.'); return; }
    renderGrid('home-grid', data);
  } catch (e) {
    showState('home-state', 'error', e.message, loadTrending);
  }
}

// ── SEARCH ───────────────────────────────────────────────
function handleSearch(e) {
  e.preventDefault();
  const q = $('q').value.trim();
  if (!q) return;
  currentQuery = q;
  currentPage  = 1;
  history.pushState({}, '', `?q=${encodeURIComponent(q)}`);
  showView('view-search');
  runSearch();
}

function rerunSearch() {
  if (!currentQuery) return;
  currentPage = 1;
  runSearch();
}

async function runSearch() {
  $('search-heading').textContent = `"${currentQuery}"`;
  $('search-grid').innerHTML = '';
  $('pagination').classList.add('hidden');
  showState('search-state', 'loading', 'Searching…');

  try {
    const sort = $('sort-sel').value;
    const type = $('type-sel').value;
    const data = await apiGet('/api/v1/search', {
      q: currentQuery,
      page: currentPage,
      sort_by: sort,
      type: type === 'all' ? undefined : type,
    });

    hideState('search-state');

    if (!data?.length) {
      showState('search-state', 'empty', 'No results. Try a different query or switch instance.');
      return;
    }

    renderGrid('search-grid', data);

    $('page-lbl').textContent = `Page ${currentPage}`;
    $('btn-prev').disabled = currentPage <= 1;
    $('btn-next').disabled = data.length < 20;
    $('pagination').classList.remove('hidden');
  } catch (e) {
    showState('search-state', 'error', e.message, runSearch);
  }
}

function changePage(delta) {
  currentPage = Math.max(1, currentPage + delta);
  runSearch();
  window.scrollTo({ top: 0 });
}

// ── RENDER helpers ────────────────────────────────────────
function renderGrid(containerId, items) {
  const grid = $(containerId);
  items.forEach(item => {
    if (item.type === 'video' || item.videoId) {
      grid.appendChild(makeVideoCard(item));
    } else if (item.type === 'channel') {
      grid.appendChild(makeChannelCard(item));
    }
  });
}

function makeVideoCard(v) {
  const thumb = bestThumb(v.videoThumbnails);
  const dur   = fmtDuration(v.lengthSeconds);
  const card  = el('article', 'video-card');
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
      <p class="card-channel">${esc(v.author || '')}</p>
      <p class="card-meta">
        ${v.viewCount ? `<span>${fmtViews(v.viewCount)}</span>` : ''}
        ${v.published  ? `<span>${fmtDate(v.published)}</span>` : ''}
      </p>
    </div>`;
  const go = () => loadVideo(v.videoId);
  card.addEventListener('click', go);
  card.addEventListener('keydown', e => (e.key === 'Enter' || e.key === ' ') && go());
  return card;
}

function makeChannelCard(ch) {
  const thumb = ch.authorThumbnails?.find(t => t.width >= 88)?.url || '';
  const card  = el('article', 'channel-card');
  card.innerHTML = `
    ${thumb ? `<img class="ch-card-avatar" src="${esc(thumb)}" alt="" loading="lazy" />` : '<div class="ch-card-avatar"></div>'}
    <div>
      <p class="ch-card-name">${esc(ch.author || ch.channelHandle || '')}</p>
      <p class="ch-card-subs">${esc(ch.subCountText || '')}</p>
    </div>`;
  return card;
}

// ── WATCH / VIDEO ─────────────────────────────────────────
function loadVideo(videoId) {
  currentVideo = videoId;
  history.pushState({}, '', `?v=${videoId}`);
  showView('view-watch');

  // Embed player immediately (YouTube-nocookie — no CORS issues, no proxy needed)
  $('player-wrap').innerHTML = '';
  const iframe = document.createElement('iframe');
  iframe.src  = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`;
  iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  iframe.allowFullscreen = true;
  iframe.title = 'Video player';
  $('player-wrap').appendChild(iframe);

  // Reset meta
  $('video-meta').classList.add('hidden');
  $('related').innerHTML = '';
  $('yt-link').href = `https://www.youtube.com/watch?v=${videoId}`;

  // Fetch metadata + related asynchronously
  fetchVideoMeta(videoId);
}

async function fetchVideoMeta(videoId) {
  try {
    const v = await apiGet(`/api/v1/videos/${videoId}`);

    $('v-title').textContent = v.title || '';
    $('v-views').textContent = fmtViews(v.viewCount);
    $('v-date').textContent  = fmtDate(v.published);
    $('v-desc').textContent  = v.description || 'No description.';

    if (v.likeCount > 0) {
      $('v-likes').textContent = '👍 ' + fmtViews(v.likeCount).replace(' views','');
      $('v-likes').classList.remove('hidden');
    } else {
      $('v-likes').classList.add('hidden');
    }

    $('ch-name').textContent = v.author || '';
    $('ch-subs').textContent = v.subCountText || '';

    const avThumb = v.authorThumbnails?.find(t => t.width >= 48)?.url;
    $('ch-avatar').innerHTML = avThumb
      ? `<img src="${esc(avThumb)}" alt="" loading="lazy" />`
      : '';

    $('video-meta').classList.remove('hidden');

    // Related
    if (v.recommendedVideos?.length) {
      v.recommendedVideos.slice(0, 15).forEach(r => {
        $('related').appendChild(makeRelatedCard(r));
      });
    }
  } catch (e) {
    // Player is already working — just show minimal title
    $('v-title').textContent = 'Video';
    $('video-meta').classList.remove('hidden');
    toast('Metadata unavailable: ' + e.message);
  }
}

function makeRelatedCard(v) {
  const thumb = bestThumb(v.videoThumbnails);
  const card  = el('div', 'related-card');
  card.innerHTML = `
    <div class="rel-thumb">
      ${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy" decoding="async" />` : ''}
      ${v.lengthSeconds ? `<span class="duration">${esc(fmtDuration(v.lengthSeconds))}</span>` : ''}
    </div>
    <div class="rel-info">
      <p class="rel-title">${esc(v.title || '')}</p>
      <p class="rel-channel">${esc(v.author || '')}</p>
      <p class="rel-meta">${fmtViews(v.viewCount)}</p>
    </div>`;
  card.addEventListener('click', () => loadVideo(v.videoId));
  return card;
}

// ── URL routing (deep links + back/forward) ───────────────
function route() {
  const p = new URLSearchParams(location.search);
  const v = p.get('v');
  const q = p.get('q');
  if (v) {
    loadVideo(v);
  } else if (q) {
    $('q').value = q;
    currentQuery = q;
    showView('view-search');
    runSearch();
  } else {
    showView('view-home');
    loadTrending();
  }
}

window.addEventListener('popstate', route);

// ── Boot ──────────────────────────────────────────────────
route();
