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
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $(id).classList.add('active');
  document.body.classList.toggle('shorts-active', id === 'view-shorts');
  window.scrollTo({ top: 0, behavior: 'smooth' });
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
   SHORTS
   ══════════════════════════════════════════════════════════ */

function isShort(v) {
  // Shorts are ≤ 60 seconds. Piped includes them in trending/search.
  return v.duration > 0 && v.duration <= 60;
}

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

async function loadShorts() {
  if (shortsLoading) return;
  shortsLoading = true;
  showState('shorts-state', 'loading', 'Loading Shorts…');
  setInstanceStatus('checking');

  try {
    // Fetch trending and filter to shorts (≤60s)
    // We may need multiple pages to collect enough shorts
    let collected = [];
    let nextpage  = null;
    let attempts  = 0;

    while (collected.length < 10 && attempts < 4) {
      attempts++;
      const params = { region: shortsRegion };
      // Piped trending doesn't have nextpage, so try search as backup
      let data;
      if (attempts === 1) {
        data = await apiGet('/trending', params);
        if (Array.isArray(data)) {
          collected.push(...data.filter(isShort));
        }
      } else {
        // Fall back to searching "#shorts" for more content
        const sParams = { q: '#shorts', filter: 'videos' };
        if (nextpage) sParams.nextpage = nextpage;
        data = await apiGet('/search', sParams);
        const items = data.items || [];
        nextpage = data.nextpage || null;
        collected.push(...items.filter(isShort));
        if (!nextpage) break;
      }
    }

    if (!collected.length) {
      showState('shorts-state', 'empty', 'No Shorts found. Try a different region.');
      shortsLoading = false;
      return;
    }

    hideState('shorts-state');
    shortsItems   = collected;
    shortsIndex   = 0;
    shortsNextpage = nextpage;

    renderShortsItem(0, true);
    updateShortsNav();
  } catch (e) {
    showState('shorts-state', 'error', e.message, loadShorts);
  } finally {
    shortsLoading = false;
  }
}

function renderShortsItem(idx, instant = false) {
  const feed    = $('shorts-feed');
  const sidebar = $('shorts-sidebar');
  if (!feed || !sidebar) return;

  const v = shortsItems[idx];
  if (!v) return;

  const videoId = extractId(v.url);
  const thumb   = v.thumbnail || '';

  // Build card HTML
  feed.innerHTML = `
    <div class="shorts-card ${instant ? '' : 'shorts-enter'}" id="shorts-card">
      <div class="shorts-player-wrap" id="shorts-player-wrap">
        ${thumb ? `<img class="shorts-thumb" id="shorts-thumb" src="${esc(thumb)}" alt="" />` : ''}
        <button class="shorts-play-overlay" id="shorts-play-btn" onclick="playShort('${esc(videoId)}')" aria-label="Play">
          <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
            <circle cx="22" cy="22" r="22" fill="rgba(0,0,0,0.55)"/>
            <polygon points="17,13 35,22 17,31" fill="white"/>
          </svg>
        </button>
        <div id="shorts-iframe-wrap" class="shorts-iframe-wrap hidden"></div>
      </div>
      <div class="shorts-info">
        <p class="shorts-title">${esc(v.title || '')}</p>
        <p class="shorts-channel">${esc(v.uploader || v.uploaderName || '')}</p>
        <p class="shorts-meta">${fmtViews(v.views)}${v.uploadedDate ? ' · ' + esc(v.uploadedDate) : ''}</p>
      </div>
      <div class="shorts-counter">${idx + 1} / ${shortsItems.length}</div>
    </div>`;

  // Sidebar actions
  sidebar.innerHTML = `
    <div class="shorts-actions">
      <button class="short-action-btn" onclick="playShort('${esc(videoId)}')" title="Play">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
        <span>Play</span>
      </button>
      <button class="short-action-btn" onclick="loadVideo('${esc(videoId)}')" title="Full page">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="9 3 9 9 3 9"/></svg>
        <span>Expand</span>
      </button>
      <a class="short-action-btn" href="https://www.youtube.com/shorts/${esc(videoId)}" target="_blank" rel="noopener" title="Open on YouTube">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
        <span>YouTube</span>
      </a>
      <div class="short-action-divider"></div>
      <span class="short-action-label">${fmtDuration(v.duration)}</span>
    </div>`;

  // Preload next if close to end
  if (idx >= shortsItems.length - 3) preloadMoreShorts();
}

function playShort(videoId) {
  const iWrap  = $('shorts-iframe-wrap');
  const playBtn = $('shorts-play-btn');
  const thumb  = $('shorts-thumb');
  if (!iWrap) return;

  iWrap.innerHTML = `<iframe
    src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&loop=1&playlist=${videoId}"
    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
    allowfullscreen title="Short video player"></iframe>`;

  iWrap.classList.remove('hidden');
  if (playBtn) playBtn.style.display = 'none';
  if (thumb)   thumb.style.display   = 'none';
}

function shortsNav(dir) {
  if (shortsIsTransitioning) return;
  const newIdx = shortsIndex + dir;
  if (newIdx < 0 || newIdx >= shortsItems.length) return;

  shortsIsTransitioning = true;
  shortsIndex = newIdx;

  // Stop any playing iframe first
  const iWrap = $('shorts-iframe-wrap');
  if (iWrap) iWrap.innerHTML = '';

  renderShortsItem(shortsIndex);
  updateShortsNav();

  setTimeout(() => { shortsIsTransitioning = false; }, 340);
}

function updateShortsNav() {
  const up   = $('shorts-up');
  const down = $('shorts-down');
  if (up)   up.disabled   = shortsIndex <= 0;
  if (down) down.disabled = shortsIndex >= shortsItems.length - 1;
}

async function preloadMoreShorts() {
  if (shortsLoading || !shortsNextpage) return;
  shortsLoading = true;
  try {
    const data  = await apiGet('/search', { q: '#shorts', filter: 'videos', nextpage: shortsNextpage });
    const items = (data.items || []).filter(isShort);
    shortsNextpage = data.nextpage || null;
    shortsItems.push(...items);
    updateShortsNav();
    // Refresh counter
    const counter = document.querySelector('.shorts-counter');
    if (counter) counter.textContent = `${shortsIndex + 1} / ${shortsItems.length}`;
  } catch (_) { /* silent */ }
  finally { shortsLoading = false; }
}

/* Keyboard navigation for Shorts */
document.addEventListener('keydown', e => {
  if (!$('view-shorts')?.classList.contains('active')) return;
  if (e.key === 'ArrowUp'   || e.key === 'k') { e.preventDefault(); shortsNav(-1); }
  if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); shortsNav(1); }
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    const v = shortsItems[shortsIndex];
    if (v) playShort(extractId(v.url));
  }
});

/* Touch swipe for Shorts */
(function() {
  let touchStartY = 0;
  document.addEventListener('touchstart', e => {
    if (!$('view-shorts')?.classList.contains('active')) return;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchend', e => {
    if (!$('view-shorts')?.classList.contains('active')) return;
    const dy = touchStartY - e.changedTouches[0].clientY;
    if (Math.abs(dy) > 60) shortsNav(dy > 0 ? 1 : -1);
  }, { passive: true });
})();

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
