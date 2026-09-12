/* ──────────────────────────────────────────────
   Viewtube — Invidious-powered YouTube frontend
   Uses public Invidious API (no key required)
   ────────────────────────────────────────────── */

// ── State ──────────────────────────────────────
let currentQuery = '';
let currentPage  = 1;
let currentVideoId = '';

// ── Helpers ────────────────────────────────────
const $ = id => document.getElementById(id);
const instance = () => $('instance-select').value;

/** Format seconds → M:SS or H:MM:SS */
function formatDuration(seconds) {
  if (!seconds || seconds < 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

/** Compact view count: 1.2M, 340K, etc. */
function formatViews(n) {
  if (!n) return '0 views';
  if (n >= 1_000_000) return (n/1_000_000).toFixed(1).replace(/\.0$/,'') + 'M views';
  if (n >= 1_000)     return (n/1_000).toFixed(1).replace(/\.0$/,'') + 'K views';
  return n + ' views';
}

/** Convert Unix timestamp → relative text */
function formatDate(unix) {
  if (!unix) return '';
  const d = new Date(unix * 1000);
  const diff = (Date.now() - d) / 1000;
  if (diff < 60)       return 'just now';
  if (diff < 3600)     return Math.floor(diff/60) + ' min ago';
  if (diff < 86400)    return Math.floor(diff/3600) + ' hr ago';
  if (diff < 2592000)  return Math.floor(diff/86400) + ' days ago';
  if (diff < 31536000) return Math.floor(diff/2592000) + ' mo ago';
  return Math.floor(diff/31536000) + ' yr ago';
}

/** Best thumbnail from Invidious videoThumbnails array */
function bestThumb(thumbs) {
  if (!thumbs || !thumbs.length) return '';
  const order = ['maxresdefault','sddefault','high','medium','default'];
  for (const q of order) {
    const t = thumbs.find(x => x.quality === q);
    if (t) return t.url;
  }
  return thumbs[0].url;
}

/** Fetch wrapper with timeout */
async function apiFetch(path, params = {}) {
  const url = new URL(instance() + path);
  Object.entries(params).forEach(([k,v]) => v !== undefined && url.searchParams.set(k, v));
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url.toString(), { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// ── View switching ──────────────────────────────
function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $(id).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function showHome() {
  showView('view-home');
  if (!$('trending-grid').children.length) loadTrending();
}

// ── Instance change ─────────────────────────────
function onInstanceChange() {
  // Re-fetch whatever is currently showing
  const active = document.querySelector('.view.active');
  if (active.id === 'view-home') {
    $('trending-grid').innerHTML = '';
    loadTrending();
  } else if (active.id === 'view-search' && currentQuery) {
    currentPage = 1;
    runSearch();
  } else if (active.id === 'view-watch' && currentVideoId) {
    loadVideo(currentVideoId);
  }
}

// ── Trending ────────────────────────────────────
async function loadTrending() {
  const region = $('region-select').value;
  $('trending-loading').classList.remove('hidden');
  $('trending-error').classList.add('hidden');
  $('trending-grid').innerHTML = '';

  try {
    const data = await apiFetch('/api/v1/trending', { region, type: 'default' });
    $('trending-loading').classList.add('hidden');
    renderVideoGrid('trending-grid', data);
  } catch (e) {
    $('trending-loading').classList.add('hidden');
    showError('trending-error', 'Could not load trending videos.', loadTrending);
  }
}

// ── Search ──────────────────────────────────────
function handleSearch(e) {
  e.preventDefault();
  const q = $('search-input').value.trim();
  if (!q) return;
  currentQuery = q;
  currentPage  = 1;
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
  $('search-loading').classList.remove('hidden');
  $('search-error').classList.add('hidden');
  $('search-pagination').classList.add('hidden');

  const sort   = $('sort-select').value;
  const type   = $('type-select').value;

  try {
    const data = await apiFetch('/api/v1/search', {
      q: currentQuery,
      page: currentPage,
      sort_by: sort,
      type: type === 'all' ? undefined : type,
    });

    $('search-loading').classList.add('hidden');

    if (!data || !data.length) {
      showError('search-error', 'No results found. Try a different query or instance.', null);
      return;
    }

    renderVideoGrid('search-grid', data);

    // Pagination
    $('search-pagination').classList.remove('hidden');
    $('page-indicator').textContent = `Page ${currentPage}`;
    $('prev-page-btn').disabled = currentPage <= 1;
    $('next-page-btn').disabled = data.length < 20;
  } catch (e) {
    $('search-loading').classList.add('hidden');
    showError('search-error', `Search failed: ${e.message}. Try switching instance.`, runSearch);
  }
}

function changePage(delta) {
  currentPage = Math.max(1, currentPage + delta);
  runSearch();
}

// ── Render helpers ──────────────────────────────
function renderVideoGrid(containerId, items) {
  const grid = $(containerId);
  items.forEach(item => {
    if (item.type === 'video' || (!item.type && item.videoId)) {
      grid.appendChild(makeVideoCard(item));
    } else if (item.type === 'channel') {
      grid.appendChild(makeChannelCard(item));
    }
    // playlists: skip for now (could be added later)
  });
}

function makeVideoCard(v) {
  const thumb = bestThumb(v.videoThumbnails);
  const dur   = formatDuration(v.lengthSeconds);

  const card = document.createElement('article');
  card.className = 'video-card';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', v.title);

  card.innerHTML = `
    <div class="video-thumb-wrap">
      <img class="video-thumb" src="${thumb}" alt="" loading="lazy" onerror="this.style.opacity=0" />
      ${dur ? `<span class="video-duration">${dur}</span>` : ''}
    </div>
    <div class="video-info">
      <p class="video-card-title">${escHtml(v.title)}</p>
      <p class="video-card-channel">${escHtml(v.author || '')}</p>
      <p class="video-card-meta">
        <span>${formatViews(v.viewCount)}</span>
        <span>${formatDate(v.published)}</span>
      </p>
    </div>
  `;

  card.addEventListener('click', () => loadVideo(v.videoId));
  card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') loadVideo(v.videoId); });
  return card;
}

function makeChannelCard(ch) {
  const thumb = ch.authorThumbnails?.find(t => t.width >= 88)?.url || '';
  const card = document.createElement('article');
  card.className = 'channel-card';
  card.innerHTML = `
    ${thumb ? `<img class="channel-card-avatar" src="${thumb}" alt="" loading="lazy" />` : '<div class="channel-card-avatar"></div>'}
    <div>
      <p class="channel-card-name">${escHtml(ch.author || ch.channelHandle || '')}</p>
      <p class="channel-card-subs">${ch.subCountText || ''}</p>
    </div>
  `;
  return card;
}

// ── Watch / Video ───────────────────────────────
async function loadVideo(videoId) {
  currentVideoId = videoId;
  showView('view-watch');

  // Reset UI
  $('player-area').innerHTML = '<div id="player-loading" class="player-loading"><div class="spinner large"></div></div>';
  $('video-meta').classList.add('hidden');
  $('related-list').innerHTML = '';
  $('related-loading').classList.remove('hidden');
  $('watch-on-yt').href = `https://www.youtube.com/watch?v=${videoId}`;

  // Build the embed player immediately (YouTube allows direct embeds from anywhere)
  const iframe = document.createElement('iframe');
  iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`;
  iframe.allowFullscreen = true;
  iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
  iframe.onload = () => {
    const loading = $('player-loading');
    if (loading) loading.remove();
  };

  $('player-area').innerHTML = '';
  $('player-area').appendChild(iframe);

  // Fetch metadata from Invidious
  try {
    const v = await apiFetch(`/api/v1/videos/${videoId}`);

    $('video-title').textContent = v.title || '';
    $('video-views').textContent = formatViews(v.viewCount);
    $('video-date').textContent  = formatDate(v.published);
    $('video-description').textContent = v.description || 'No description.';

    if (v.likeCount > 0) {
      $('video-likes').textContent = '👍 ' + formatViews(v.likeCount).replace(' views','');
      $('video-likes').classList.remove('hidden');
    }

    $('channel-name').textContent = v.author || '';
    $('channel-subs').textContent = v.subCountText || '';

    const avatarThumb = v.authorThumbnails?.find(t => t.width >= 48)?.url;
    if (avatarThumb) {
      $('channel-avatar').innerHTML = `<img src="${avatarThumb}" alt="" />`;
    }

    $('video-meta').classList.remove('hidden');

    // Related videos
    $('related-loading').classList.add('hidden');
    if (v.recommendedVideos?.length) {
      renderRelated(v.recommendedVideos.slice(0, 14));
    }
  } catch(e) {
    $('related-loading').classList.add('hidden');
    // Metadata failed — player still works, just show minimal info
    $('video-title').textContent = 'Video';
    $('video-meta').classList.remove('hidden');
  }
}

function renderRelated(videos) {
  const list = $('related-list');
  videos.forEach(v => {
    const thumb = bestThumb(v.videoThumbnails);
    const card  = document.createElement('div');
    card.className = 'related-card';
    card.innerHTML = `
      <div class="related-thumb">
        <img src="${thumb}" alt="" loading="lazy" />
        ${v.lengthSeconds ? `<span class="video-duration">${formatDuration(v.lengthSeconds)}</span>` : ''}
      </div>
      <div class="related-info">
        <p class="related-title">${escHtml(v.title || '')}</p>
        <p class="related-channel">${escHtml(v.author || '')}</p>
        <p class="related-meta">${formatViews(v.viewCount)}</p>
      </div>
    `;
    card.addEventListener('click', () => loadVideo(v.videoId));
    list.appendChild(card);
  });
}

// ── Error display ───────────────────────────────
function showError(elId, message, retryFn) {
  const el = $(elId);
  el.innerHTML = `<strong>Oops</strong>${escHtml(message)}
    ${retryFn ? `<br/><button class="retry-btn" onclick="(${retryFn.name || '('+retryFn.toString()+')'})()">Try again</button>` : ''}`;
  el.classList.remove('hidden');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ── URL routing (deep-link / back button) ───────
function parseUrl() {
  const p = new URLSearchParams(location.search);
  const v = p.get('v');
  const q = p.get('q');
  if (v) {
    loadVideo(v);
  } else if (q) {
    $('search-input').value = q;
    currentQuery = q;
    showView('view-search');
    runSearch();
  } else {
    showHome();
  }
}

// Update URL without reload
function pushState(params) {
  const url = new URL(location.href);
  url.search = '';
  Object.entries(params).forEach(([k,v]) => v && url.searchParams.set(k,v));
  history.pushState(null, '', url.toString());
}

// Intercept navigation to update URL
const origLoadVideo  = loadVideo;
const origRunSearch  = runSearch;
window.loadVideo = function(id) { pushState({v:id}); origLoadVideo(id); };

window.addEventListener('popstate', parseUrl);

// ── Boot ────────────────────────────────────────
parseUrl();
