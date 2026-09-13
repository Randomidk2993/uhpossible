/* ═══════════════════════════════════════════════════════════
   Viewtube — app.js  (Piped API edition, improved)
   ═══════════════════════════════════════════════════════════ */

const PROXY_BASE = 'https://lucky-sun-99ea.xxgoldenwarriors.workers.dev';

/* ── Piped instances — private.coffee + ducks.party first ── */
const ALL_INSTANCES = [
  { url: 'https://api.piped.private.coffee',    label: 'private.coffee',     flag: '🇦🇹' },
  { url: 'https://pipedapi.ducks.party',         label: 'ducks.party',        flag: '🇳🇱' },
  { url: 'https://pipedapi.kavin.rocks',         label: 'kavin.rocks',        flag: '⭐' },
  { url: 'https://pipedapi-libre.kavin.rocks',   label: 'kavin libre',        flag: '⭐' },
  { url: 'https://pipedapi.adminforge.de',       label: 'adminforge.de',      flag: '🇩🇪' },
  { url: 'https://piped-api.privacy.com.de',     label: 'privacy.com.de',     flag: '🇩🇪' },
  { url: 'https://pipedapi.r4fo.com',            label: 'r4fo.com',           flag: '🇩🇪' },
  { url: 'https://api.piped.yt',                 label: 'piped.yt',           flag: '🇩🇪' },
  { url: 'https://pipedapi.drgns.space',         label: 'drgns.space',        flag: '🇺🇸' },
  { url: 'https://pipedapi.darkness.services',   label: 'darkness.services',  flag: '🇺🇸' },
];

/* ── State ── */
let currentQuery    = '';
let currentPage     = 1;
let currentNextpage = null;
let currentVideo    = '';
let activeInstance  = ALL_INSTANCES[0].url; // default = private.coffee

/* ── Shorts state ── */
let shortsItems       = [];   // array of short video objects
let shortsIndex       = 0;    // currently visible short
let shortsLoading     = false;
let shortsNextpage    = null;
let shortsRegion      = 'US';
let shortsIsTransitioning = false;

/* ── DOM helpers ── */
const $  = id => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

/* ── Formatters ── */
function fmtDuration(s) {
  if (!s || s < 0) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${m}:${String(sec).padStart(2,'0')}`;
}

function fmtCount(n) {
  if (!n) return '';
  if (n >= 1_000_000_000) return (n/1_000_000_000).toFixed(1).replace(/\.0$/,'') + 'B';
  if (n >= 1_000_000)     return (n/1_000_000).toFixed(1).replace(/\.0$/,'') + 'M';
  if (n >= 1_000)         return Math.round(n/1_000) + 'K';
  return String(n);
}

function fmtViews(n) {
  const c = fmtCount(n);
  return c ? c + ' views' : '';
}

function fmtSubs(n) {
  const c = fmtCount(n);
  return c ? c + ' subscribers' : '';
}

function fmtUploadedDate(str) { return str || ''; }

function esc(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function extractId(url) {
  if (!url) return '';
  try {
    const u = new URL(url, 'https://x');
    return u.searchParams.get('v') || '';
  } catch { return ''; }
}

/* ── Custom Dropdown ── */
function buildInstanceDropdown() {
  const wrapper = $('instance-dropdown-wrapper');
  if (!wrapper) return;

  const trigger = wrapper.querySelector('.dd-trigger');
  const list    = wrapper.querySelector('.dd-list');
  if (!trigger || !list) return;

  // Populate list items
  list.innerHTML = '';
  ALL_INSTANCES.forEach(inst => {
    const item = document.createElement('div');
    item.className = 'dd-item';
    item.dataset.url = inst.url;
    item.innerHTML = `<span class="dd-flag">${inst.flag}</span><span class="dd-label">${inst.label}</span>`;
    if (inst.url === activeInstance) item.classList.add('active');
    item.addEventListener('click', () => {
      selectInstance(inst.url, inst.label, inst.flag);
      closeDropdown();
    });
    list.appendChild(item);
  });

  // Trigger toggle
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = wrapper.classList.contains('open');
    isOpen ? closeDropdown() : openDropdown();
  });

  document.addEventListener('click', closeDropdown);
}

function openDropdown() {
  const wrapper = $('instance-dropdown-wrapper');
  if (!wrapper) return;
  wrapper.classList.add('open');
  // Scroll active item into view
  const activeItem = wrapper.querySelector('.dd-item.active');
  if (activeItem) {
    setTimeout(() => activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
  }
}

function closeDropdown() {
  const wrapper = $('instance-dropdown-wrapper');
  if (wrapper) wrapper.classList.remove('open');
}

function selectInstance(url, label, flag) {
  activeInstance = url;
  // Update trigger text
  const triggerLabel = document.querySelector('.dd-trigger-label');
  const triggerFlag  = document.querySelector('.dd-trigger-flag');
  if (triggerLabel) triggerLabel.textContent = label;
  if (triggerFlag)  triggerFlag.textContent  = flag;
  // Update active class in list
  document.querySelectorAll('.dd-item').forEach(item => {
    item.classList.toggle('active', item.dataset.url === url);
  });
  // Reset home grid so it reloads
  $('home-grid').innerHTML = '';
  setInstanceStatus('checking');
}

function updateDropdownActive(url) {
  const inst = ALL_INSTANCES.find(i => i.url === url);
  if (!inst) return;
  selectInstance(url, inst.label, inst.flag);
}

/* ── Instance status indicator ── */
function setInstanceStatus(state) {
  const statusEl = $('instance-status');
  if (!statusEl) return;
  statusEl.className = 'instance-status-badge status-' + state;

  const states = {
    ok:       { dot: '', label: activeInstance ? new URL(activeInstance).hostname : 'Connected', tip: 'Instance is responding' },
    error:    { dot: '', label: 'Unavailable',  tip: 'Instance unavailable — trying others' },
    checking: { dot: '', label: 'Connecting…',  tip: 'Checking instance…' },
    trying:   { dot: '', label: 'Trying next…', tip: 'Falling back to another instance' },
  };

  const s = states[state] || states.checking;
  statusEl.innerHTML = `<span class="status-dot"></span><span class="status-label">${esc(s.label)}</span>`;
  statusEl.title = s.tip;
}

/* ── Auto-fallback fetch ── */
async function fetchWithFallback(path, params = {}) {
  if (!PROXY_BASE || PROXY_BASE.includes('YOUR-WORKER')) {
    throw new Error('PROXY_BASE not set — edit app.js and add your Cloudflare Worker URL.');
  }

  const selected = activeInstance || ALL_INSTANCES[0].url;
  const ordered  = [selected, ...ALL_INSTANCES.map(i=>i.url).filter(u => u !== selected)];

  let lastErr;
  let tried = 0;
  for (const instanceUrl of ordered) {
    tried++;
    if (tried > 1) {
      setInstanceStatus('trying');
      // Animate the dropdown to scroll to the new instance being tried
      animateDropdownScroll(instanceUrl);
      await delay(320); // brief pause so animation is visible
    }
    try {
      const data = await doFetch(instanceUrl, path, params);
      if (instanceUrl !== activeInstance) {
        updateDropdownActive(instanceUrl);
        const inst = ALL_INSTANCES.find(i=>i.url===instanceUrl);
        toast(`✓ Switched to ${inst ? inst.label : new URL(instanceUrl).hostname}`);
      }
      setInstanceStatus('ok');
      return data;
    } catch (e) {
      lastErr = e;
      if (e.name === 'AbortError') throw e;
      // continue to next
    }
  }
  setInstanceStatus('error');
  throw lastErr || new Error('All Piped instances failed');
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function animateDropdownScroll(url) {
  // Visually flash the status and scroll list if open
  const item = document.querySelector(`.dd-item[data-url="${CSS.escape(url)}"]`);
  if (!item) return;
  document.querySelectorAll('.dd-item').forEach(el => el.classList.remove('trying'));
  item.classList.add('trying');
  const list = document.querySelector('.dd-list');
  if (list && $('instance-dropdown-wrapper')?.classList.contains('open')) {
    item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

async function doFetch(instanceUrl, path, params) {
  const targetUrl = new URL(instanceUrl + path);
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
      throw new Error(`HTTP ${res.status}${body ? ': ' + body.slice(0,120) : ''}`);
    }
    const text = await res.text();
    if (text.trimStart().startsWith('<')) {
      throw new Error('Instance returned HTML (bot-challenged or down)');
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

/* ── Toast ── */
let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 4500);
}

/* ── View switching ── */
function showView(id) {
  // Regular .view sections use display toggling
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

  const isShorts = id === 'view-shorts';
  document.body.classList.toggle('shorts-active', isShorts);

  if (isShorts) {
    // Shorts is position:fixed — just add active, no scroll needed
    $('view-shorts').classList.add('active');
  } else {
    // Remove shorts active class if switching away
    $('view-shorts')?.classList.remove('active');
    $(id).classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

/* ── State boxes ── */
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

/* ── HOME / TRENDING ── */
function navHome() {
  history.pushState({}, '', location.pathname);
  setNavActive('nav-home');
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

/* ── SEARCH ── */
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
    const filter = $('type-sel').value;
    const params = {
      q:      currentQuery,
      filter: filter === 'all' ? 'all' : filter,
    };
    if (currentNextpage && currentPage > 1) {
      params.nextpage = currentNextpage;
    }

    const data = await apiGet('/search', params);
    hideState('search-state');

    const items = data.items || data;
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
    currentPage     = Math.max(1, currentPage + delta);
    currentNextpage = null;
    if (currentPage === 1) { runSearch(); return; }
  }
  currentPage = Math.max(1, currentPage + delta);
  runSearch();
  window.scrollTo({ top: 0 });
}

/* ── RENDER helpers ── */
function renderGrid(containerId, items) {
  const grid = $(containerId);
  items.forEach(item => {
    if (item.type === 'stream' || item.url?.includes('/watch')) {
      grid.appendChild(makeVideoCard(item));
    } else if (item.type === 'channel' || item.url?.includes('/channel')) {
      grid.appendChild(makeChannelCard(item));
    } else if (item.type === 'playlist') {
      grid.appendChild(makeVideoCard(item));
    }
  });
}

function makeVideoCard(v) {
  const videoId = extractId(v.url);
  const thumb   = v.thumbnail || '';
  const dur     = fmtDuration(v.duration);
  const card    = el('article', 'video-card');
  card.setAttribute('tabindex', '0');
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', v.title || 'Video');

  const uploaderUrl = v.uploaderUrl || '';
  const channelId   = uploaderUrl.replace('/channel/','');

  card.innerHTML = `
    <div class="thumb-wrap">
      ${thumb ? `<img class="thumb" src="${esc(thumb)}" alt="" loading="lazy" decoding="async" />` : '<div class="thumb-placeholder"></div>'}
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
  const thumb = ch.thumbnail || '';
  const card  = el('article', 'channel-card');
  const subTxt = ch.subscribers > 0 ? fmtSubs(ch.subscribers) : '';
  card.innerHTML = `
    ${thumb ? `<img class="ch-card-avatar" src="${esc(thumb)}" alt="" loading="lazy" />` : '<div class="ch-card-avatar"></div>'}
    <div class="ch-card-info">
      <p class="ch-card-name">${esc(ch.name || '')}</p>
      ${subTxt ? `<p class="ch-card-subs"><span class="sub-icon">👥</span>${esc(subTxt)}</p>` : ''}
      ${ch.description ? `<p class="ch-card-desc">${esc(ch.description.slice(0,120))}${ch.description.length > 120 ? '…' : ''}</p>` : ''}
    </div>`;
  return card;
}

/* ── WATCH / VIDEO ── */
function loadVideo(videoId) {
  currentVideo = videoId;
  history.pushState({}, '', `?v=${videoId}`);
  showView('view-watch');

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
    const v = await apiGet(`/streams/${videoId}`);

    $('v-title').textContent = v.title || '';
    $('v-views').textContent = fmtViews(v.views);
    $('v-date').textContent  = v.uploadDate ? new Date(v.uploadDate).toLocaleDateString() : '';
    $('v-desc').textContent  = v.description || 'No description.';

    // Likes
    if (v.likes > 0) {
      $('v-likes').innerHTML = `<span class="likes-thumb">👍</span>${fmtCount(v.likes)}`;
      $('v-likes').classList.remove('hidden');
    } else {
      $('v-likes').classList.add('hidden');
    }

    // Channel info with subscriber count
    $('ch-name').textContent = v.uploader || '';
    const subCount = v.uploaderSubscriberCount;
    if (subCount > 0) {
      $('ch-subs').innerHTML = `<span class="sub-icon">👥</span>${fmtSubs(subCount)}`;
    } else {
      $('ch-subs').textContent = '';
    }

    $('ch-avatar').innerHTML = v.uploaderAvatar
      ? `<img src="${esc(v.uploaderAvatar)}" alt="" loading="lazy" />`
      : '';

    $('video-meta').classList.remove('hidden');

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
/* ══════════════════════════════════════════════════════════
   SHORTS  — scroll-snap full-viewport feed
   ══════════════════════════════════════════════════════════ */

/* ── Config ── */
// Only show videos ≤ 60 s. duration=0 means Piped didn't report it — 
// we include those since Piped routinely omits duration for real Shorts.
// Anything with a known duration > 60s is excluded.
const MAX_SHORT_DURATION = 60;

const SHORTS_QUERIES = [
  '#shorts',
  '#short',
  'shorts funny 2025',
  'viral shorts',
  'shorts trending',
];

/* ── Helpers ── */
function isActualShort(v) {
  if (!v || !v.url) return false;
  const dur = v.duration;
  // Keep if duration unknown/zero OR within limit
  if (dur === undefined || dur === null || dur <= 0) return true;
  return dur <= MAX_SHORT_DURATION;
}

function dedupByVideoId(arr) {
  const seen = new Set();
  return arr.filter(v => {
    const id = extractId(v.url);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/* ── Nav ── */
function navShorts() {
  history.pushState({}, '', '?shorts=1');
  setNavActive('nav-shorts');
  showView('view-shorts');
  if (shortsItems.length === 0) loadShorts();
}

function setNavActive(activeId) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const btn = $(activeId);
  if (btn) btn.classList.add('active');
}

/* ── Load ── */
async function loadShorts() {
  if (shortsLoading) return;
  shortsLoading = true;

  const scroller = $('shorts-scroller');
  const ph = $('shorts-placeholder');
  if (ph) ph.innerHTML = '<div class="spinner large"></div><p>Finding Shorts…</p>';

  try {
    const collected = [];

    // Search each query and strictly filter to ≤60s (or unknown duration)
    for (const q of SHORTS_QUERIES) {
      if (collected.length >= 25) break;
      try {
        const data  = await apiGet('/search', { q, filter: 'videos' });
        const items = (data.items || []).filter(isActualShort);
        collected.push(...items);
        if (!shortsNextpage && data.nextpage) shortsNextpage = data.nextpage;
      } catch (_) { /* try next */ }
    }

    // Fallback: trending, strictly filtered
    if (collected.length === 0) {
      try {
        const data = await apiGet('/trending', { region: shortsRegion });
        if (Array.isArray(data)) collected.push(...data.filter(isActualShort));
      } catch (_) {}
    }

    const unique = dedupByVideoId(collected);

    if (!unique.length) {
      if (ph) ph.innerHTML = `
        <strong>No Shorts found</strong>
        <p>The current Piped instance couldn't return short videos.<br>Try switching instances using the dropdown.</p>
        <button class="retry-btn" onclick="loadShorts()">Try again</button>`;
      return;
    }

    shortsItems = unique;
    shortsIndex = 0;

    // Remove placeholder, render all items into scroller
    if (ph) ph.remove();
    renderAllShorts(scroller);

    // Observe scroll to track active index
    initShortsScrollObserver(scroller);

  } catch (e) {
    if (ph) ph.innerHTML = `
      <strong>Error loading Shorts</strong>
      <p>${esc(e.message)}</p>
      <button class="retry-btn" onclick="loadShorts()">Try again</button>`;
  } finally {
    shortsLoading = false;
  }
}

/* ── Render all items ── */
function renderAllShorts(scroller) {
  shortsItems.forEach((v, idx) => {
    const item = makeShortItem(v, idx);
    scroller.appendChild(item);
  });
}

function makeShortItem(v, idx) {
  const videoId = extractId(v.url);
  const thumb   = v.thumbnail || '';
  const dur     = v.duration > 0 ? fmtDuration(v.duration) : '';

  const item = document.createElement('div');
  item.className = 'short-item';
  item.dataset.idx = idx;

  item.innerHTML = `
    <div class="short-inner">
      ${thumb ? `<img class="short-thumb" src="${esc(thumb)}" alt="" loading="lazy" decoding="async" />` : ''}
      ${dur ? `<div class="short-duration">${esc(dur)}</div>` : ''}

      <button class="short-play-btn" aria-label="Play ${esc(v.title || 'short')}" data-videoid="${esc(videoId)}">
        <div class="short-play-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="white"><polygon points="6,3 20,12 6,21"/></svg>
        </div>
      </button>

      <div class="short-iframe-wrap" id="short-if-${esc(idx)}"></div>

      <div class="short-info">
        <p class="short-channel">${esc(v.uploader || v.uploaderName || '')}</p>
        <p class="short-title">${esc(v.title || '')}</p>
        <p class="short-meta">${fmtViews(v.views)}</p>
      </div>

      <div class="short-actions">
        <a class="short-act" href="https://www.youtube.com/shorts/${esc(videoId)}"
           target="_blank" rel="noopener" title="Open on YouTube">
          <div class="short-act-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
          </div>
          <span>YouTube</span>
        </a>
        <button class="short-act" onclick="loadVideo('${esc(videoId)}')" title="Full page">
          <div class="short-act-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="9 3 9 9 3 9"/></svg>
          </div>
          <span>Expand</span>
        </button>
      </div>
    </div>`;

  // Play button handler
  item.querySelector('.short-play-btn').addEventListener('click', () => {
    playShortInItem(item, videoId, idx);
  });

  return item;
}

function playShortInItem(item, videoId, idx) {
  const ifWrap  = item.querySelector('.short-iframe-wrap');
  const playBtn = item.querySelector('.short-play-btn');
  const thumb   = item.querySelector('.short-thumb');
  if (!ifWrap) return;

  ifWrap.innerHTML = `<iframe
    src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&loop=1&playlist=${videoId}"
    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
    allowfullscreen></iframe>`;
  ifWrap.classList.add('active');
  if (playBtn) playBtn.style.display = 'none';
  if (thumb)   thumb.style.opacity   = '0';
}

/* ── Scroll observer — tracks which item is visible ── */
function initShortsScrollObserver(scroller) {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const idx = Number(entry.target.dataset.idx);
        shortsIndex = idx;

        // Pause iframes in items that scrolled away
        document.querySelectorAll('.short-item').forEach((el, i) => {
          if (i !== idx) {
            const iw = el.querySelector('.short-iframe-wrap');
            if (iw && iw.classList.contains('active')) {
              iw.innerHTML = '';
              iw.classList.remove('active');
              const pb = el.querySelector('.short-play-btn');
              const th = el.querySelector('.short-thumb');
              if (pb) pb.style.display = '';
              if (th) th.style.opacity = '';
            }
          }
        });

        // Preload more when near the end
        if (idx >= shortsItems.length - 4) preloadMoreShorts();
      }
    });
  }, { root: scroller, threshold: 0.6 });

  scroller.querySelectorAll('.short-item').forEach(el => obs.observe(el));
  // Store observer to add new items later
  scroller._observer = obs;
}

/* ── Preload more shorts ── */
async function preloadMoreShorts() {
  if (shortsLoading || !shortsNextpage) return;
  shortsLoading = true;
  try {
    const data  = await apiGet('/search', { q: '#shorts', filter: 'videos', nextpage: shortsNextpage });
    const items = (data.items || []).filter(isActualShort);
    shortsNextpage = data.nextpage || null;

    const scroller  = $('shorts-scroller');
    const startIdx  = shortsItems.length;
    const newUnique = dedupByVideoId([...shortsItems, ...items]).slice(startIdx);

    newUnique.forEach((v, i) => {
      const item = makeShortItem(v, startIdx + i);
      scroller.appendChild(item);
      if (scroller._observer) scroller._observer.observe(item);
    });
    shortsItems.push(...newUnique);
  } catch (_) {}
  finally { shortsLoading = false; }
}

/* ── Keyboard for shorts ── */
document.addEventListener('keydown', e => {
  if (!$('view-shorts')?.classList.contains('active')) return;
  const scroller = $('shorts-scroller');
  if (!scroller) return;
  const items = scroller.querySelectorAll('.short-item');
  if (!items.length) return;

  if (e.key === 'ArrowDown' || e.key === 'j') {
    e.preventDefault();
    const next = items[Math.min(shortsIndex + 1, items.length - 1)];
    if (next) next.scrollIntoView({ behavior: 'smooth' });
  }
  if (e.key === 'ArrowUp' || e.key === 'k') {
    e.preventDefault();
    const prev = items[Math.max(shortsIndex - 1, 0)];
    if (prev) prev.scrollIntoView({ behavior: 'smooth' });
  }
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    const cur = items[shortsIndex];
    if (cur) {
      const btn = cur.querySelector('.short-play-btn');
      if (btn && btn.style.display !== 'none') btn.click();
    }
  }
});


/* ── URL routing ── */
function route() {
  const p = new URLSearchParams(location.search);
  const v = p.get('v');
  const q = p.get('q');
  const s = p.get('shorts');
  if (v) {
    setNavActive('nav-home');
    loadVideo(v);
  } else if (q) {
    setNavActive('nav-home');
    $('q').value    = q;
    currentQuery    = q;
    currentNextpage = null;
    showView('view-search');
    runSearch();
  } else if (s) {
    navShorts();
  } else {
    setNavActive('nav-home');
    showView('view-home');
    loadTrending();
  }
}

window.addEventListener('popstate', route);

/* ── Boot ── */
document.addEventListener('DOMContentLoaded', () => {
  buildInstanceDropdown();
  setInstanceStatus('checking');
  route();
});
