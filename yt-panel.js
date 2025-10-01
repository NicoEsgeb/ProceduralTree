/*
  In-app YouTube Panel: slide-in aside with player, search, and playlist modes.
  - Uses YouTube IFrame Player API
  - Optional YouTube Data API v3 for search (API key from window.YOUTUBE_API_KEY or localStorage['youtube.apiKey'])
  - No new BrowserWindow; injected into index.html DOM
*/

(function(){
  const LS_VOLUME = 'youtube.volume';
  const LS_PANEL_WIDTH = 'youtube.panelWidth';
  const LS_API_KEY = 'youtube.apiKey';
  const LS_LAST_TAB = 'youtube.tab';

  
  const FEATURED_SUGGESTIONS = [
    {
      label: 'lofi hip hop radio 📚',
      description: 'beats to relax/study to',
      art: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault_live.jpg',
      queue: [
        { id: 'jfKfPfyJRdk', title: 'lofi hip hop radio 📚 beats to relax/study to' }
      ]
    },
    {
      label: 'synthwave radio 🌌',
      description: 'beats to chill/game to',
      art: 'https://i.ytimg.com/vi/4xDzrJKXOOY/hqdefault_live.jpg',
      queue: [
        { id: '4xDzrJKXOOY', title: 'synthwave radio 🌌 beats to chill/game to' }
      ]
    },
    {
      label: 'lofi hip hop radio 💤',
      description: 'beats to sleep/chill to',
      art: 'https://i.ytimg.com/vi/28KRPhVzCus/hqdefault_live.jpg',
      queue: [
        { id: '28KRPhVzCus', title: 'lofi hip hop radio 💤 beats to sleep/chill to' }
      ]
    },
    {
      label: 'dark ambient radio 🌃',
      description: 'music to escape/dream to',
      art: 'https://i.ytimg.com/vi/S_MOd40zlYU/hqdefault_live.jpg',
      queue: [
        { id: 'S_MOd40zlYU', title: 'dark ambient radio 🌃 music to escape/dream to' }
      ]
    },
    {
      label: 'jazz lofi radio 🎷',
      description: 'beats to chill/study to',
      art: 'https://i.ytimg.com/vi/HuFYqnbVbzY/hqdefault_live.jpg',
      queue: [
        { id: 'HuFYqnbVbzY', title: 'jazz lofi radio 🎷 beats to chill/study to' }
      ]
    },
    {
      label: 'sleep ambient radio 😴',
      description: 'relaxing music to fall asleep to',
      art: 'https://i.ytimg.com/vi/xORCbIptqcc/hqdefault_live.jpg',
      queue: [
        { id: 'xORCbIptqcc', title: 'sleep ambient radio 😴 relaxing music to fall asleep to' }
      ]
    },
    {
      label: 'Study With Me 📚',
      description: 'Pomodoro session',
      art: 'https://i.ytimg.com/vi/1oDrJba2PSs/hqdefault_live.jpg',
      queue: [
        { id: '1oDrJba2PSs', title: 'Study With Me 📚 Pomodoro' }
      ]
    },
    {
      label: 'asian lofi radio ⛩️',
      description: 'beats to relax/study to',
      art: 'https://i.ytimg.com/vi/Na0w3Mz46GA/hqdefault_live.jpg',
      queue: [
        { id: 'Na0w3Mz46GA', title: 'asian lofi radio ⛩️ beats to relax/study to' }
      ]
    },
    {
      label: 'chill guitar radio 🎸',
      description: 'music to study/relax to',
      art: 'https://i.ytimg.com/vi/E_XmwjgRLz8/hqdefault_live.jpg',
      queue: [
        { id: 'E_XmwjgRLz8', title: 'chill guitar radio 🎸 music to study/relax to' }
      ]
    },
    {
      label: 'Halloween lofi radio 🧟‍♀️',
      description: 'spooky beats to get chills to',
      art: 'https://i.ytimg.com/vi/5t10mu8yWpI/hqdefault_live.jpg',
      queue: [
        { id: '5t10mu8yWpI', title: 'Halloween lofi radio 🧟‍♀️ - spooky beats to get chills to' }
      ]
    },
    {
      label: 'bossa lofi radio 🌴',
      description: 'chill music for relaxing days',
      art: 'https://i.ytimg.com/vi/Zq9-4INDsvY/hqdefault_live.jpg',
      queue: [
        { id: 'Zq9-4INDsvY', title: 'bossa lofi radio 🌴 chill music for relaxing days' }
      ]
    },
    {
      label: 'peaceful piano radio 🎹',
      description: 'music to focus/study to',
      art: 'https://i.ytimg.com/vi/TtkFsfOP9QI/hqdefault_live.jpg',
      queue: [
        { id: 'TtkFsfOP9QI', title: 'peaceful piano radio 🎹 music to focus/study to' }
      ]
    }
  ];

  let panel, searchForm, searchInput, resultsEl, apikeyTip, apikeyInput, apikeySaveBtn;
  let playlistInfo, playlistSuggestionsEl;
  let tabSearchBtn, tabPlaylistBtn, tabSearchPanel, tabPlaylistPanel;
  let prevBtn, playBtn, nextBtn, volumeInput, nowTitleEl, spinnerEl, closeBtn;
  let resizeHandle;

  let ytScriptLoading = false;
  let ytReadyPromise = null;
  let player = null;
  let isPlayerReady = false;
  let isPlaying = false;

  // Queue state for curated radios or queued search results
  let currentQueue = [];
  let queueIndex = -1;
  let lastLoadedItem = null; // { type:'video'|'playlist', id, title? }
  let hasActiveMedia = false;

  const BLOCKED_VIDEO_IDS = new Set();
  const BLOCKED_VIDEO_REASONS = new Map();
  const EMBED_CHECK_CACHE = new Map();

  function ensurePanel() {
    const existing = document.getElementById('yt-panel');
    if (existing) {
      panel = existing;
      if (!panel.classList.contains('panel-shell')) {
        panel.classList.add('panel-shell');
      }
      return panel;
    }
    const el = document.createElement('aside');
    el.id = 'yt-panel';
    el.classList.add('panel-shell');
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <div class="yt-resize-handle" role="separator" aria-orientation="vertical" aria-label="Resize YouTube panel" tabindex="0"></div>
      <header class="panel-topbar yt-topbar">
        <div class="yt-title">YouTube</div>
        <div class="yt-tabs" role="tablist">
          <button id="yt-tab-search" class="yt-tab active" role="tab" aria-selected="true" aria-controls="yt-tabpanel-search">Search</button>
          <button id="yt-tab-playlist" class="yt-tab" role="tab" aria-selected="false" aria-controls="yt-tabpanel-playlist">Live Radios</button>
        </div>
        <div class="yt-actions">
          <form id="yt-search-form" class="yt-search" role="search">
            <input id="yt-search-input" type="search" placeholder="Search YouTube" autocomplete="off" aria-label="Search YouTube" />
            <button id="yt-search-btn" type="submit" aria-label="Search">Search</button>
          </form>
          <button id="yt-close" class="yt-close" title="Close" aria-label="Close">✕</button>
        </div>
      </header>
      <div class="yt-player-wrap">
        <div class="yt-player" aria-label="YouTube player">
          <div id="ytp-iframe"></div>
          <div class="yt-spinner" id="yt-spinner" aria-hidden="true"></div>
        </div>
      </div>
      <div class="yt-controls">
        <button id="yt-prev" title="Previous" aria-label="Previous">⏮</button>
        <button id="yt-play" title="Play/Pause" aria-label="Play/Pause">▶</button>
        <button id="yt-next" title="Next" aria-label="Next">⏭</button>
        <input id="yt-volume" type="range" min="0" max="100" step="1" aria-label="Volume" />
        <div id="yt-nowtitle" class="yt-nowtitle" title=""></div>
      </div>
      <main class="panel-content yt-content">
        <section id="yt-tabpanel-search" class="yt-tabpanel active" role="tabpanel" aria-labelledby="yt-tab-search">
          <div id="yt-api-key-tip" class="yt-apikey-tip" hidden>
            <label>Optional API key
              <input id="yt-apikey-input" type="text" placeholder="Paste YouTube Data API key" />
            </label>
            <button id="yt-apikey-save">Save</button>
          </div>
          <div id="yt-results" class="yt-results" aria-live="polite"></div>
        </section>
        <section id="yt-tabpanel-playlist" class="yt-tabpanel" role="tabpanel" aria-labelledby="yt-tab-playlist" hidden>
          <div id="yt-playlist-info" class="yt-playlist-info"></div>
          <div id="yt-playlist-suggestions" class="yt-suggestions"></div>
        </section>
      </main>
      <footer class="yt-footer">Powered by YouTube • Results via YouTube Data API</footer>
    `;
    document.body.appendChild(el);

    // cache refs
    panel = el;
    searchForm = panel.querySelector('#yt-search-form');
    searchInput = panel.querySelector('#yt-search-input');
    resultsEl = panel.querySelector('#yt-results');
    apikeyTip = panel.querySelector('#yt-api-key-tip');
    apikeyInput = panel.querySelector('#yt-apikey-input');
    apikeySaveBtn = panel.querySelector('#yt-apikey-save');
    playlistInfo = panel.querySelector('#yt-playlist-info');
    playlistSuggestionsEl = panel.querySelector('#yt-playlist-suggestions');
    tabSearchBtn = panel.querySelector('#yt-tab-search');
    tabPlaylistBtn = panel.querySelector('#yt-tab-playlist');
    tabSearchPanel = panel.querySelector('#yt-tabpanel-search');
    tabPlaylistPanel = panel.querySelector('#yt-tabpanel-playlist');
    prevBtn = panel.querySelector('#yt-prev');
    playBtn = panel.querySelector('#yt-play');
    nextBtn = panel.querySelector('#yt-next');
    volumeInput = panel.querySelector('#yt-volume');
    nowTitleEl = panel.querySelector('#yt-nowtitle');
    spinnerEl = panel.querySelector('#yt-spinner');
    closeBtn = panel.querySelector('#yt-close');
    resizeHandle = panel.querySelector('.yt-resize-handle');

    // set initial width from LS
    try {
      const savedW = localStorage.getItem(LS_PANEL_WIDTH);
      if (savedW) panel.style.width = savedW;
    } catch(_) {}

    wireUI();
    disableControls(true);
    initYouTubePlayer();
    return panel;
  }

  function wireUI() {
    // Tabs
    tabSearchBtn.addEventListener('click', () => setTab('search'));
    tabPlaylistBtn.addEventListener('click', () => setTab('playlist'));

    // Close button
    closeBtn.addEventListener('click', () => YtPanel.close());

    // Search
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = searchInput.value.trim();
      if (!q) return;
      doSearch(q);
    });

    // Results delegation (cards + utility buttons)
    resultsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.dataset.action === 'show-featured') {
        setTab('playlist');
        return;
      }
      if (btn.dataset.action === 'play-suggestion') {
        const idx = Number(btn.getAttribute('data-index'));
        loadSuggestion(idx);
        return;
      }
      const card = e.target.closest('.yt-card');
      if (!card) return;
      const id = card.getAttribute('data-video-id');
      const title = card.getAttribute('data-title') || '';
      if (btn.classList.contains('yt-playnow')) {
        currentQueue = [{ id, title }];
        queueIndex = 0;
        ytLoadVideo(id, title, true);
      } else if (btn.classList.contains('yt-queue')) {
        queueAdd(id, title);
      }
    });

    if (playlistSuggestionsEl) {
      playlistSuggestionsEl.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action="play-suggestion"]');
        if (!btn) return;
        const idx = Number(btn.getAttribute('data-index'));
        loadSuggestion(idx);
      });
    }

    // API key UI
    apikeySaveBtn.addEventListener('click', () => {
      const k = (apikeyInput.value || '').trim();
      if (!k) { toast('API key is empty'); return; }
      try { localStorage.setItem(LS_API_KEY, k); } catch(_) {}
      hideApiKeyTip();
      toast('API key saved. You can search now.');
      updateSearchUI();
      if (searchInput.value.trim()) doSearch(searchInput.value.trim());
    });

    // Controls
    prevBtn.addEventListener('click', ytPrev);
    playBtn.addEventListener('click', ytPlayPause);
    nextBtn.addEventListener('click', ytNext);
    volumeInput.addEventListener('input', (e) => ytSetVolume(Number(e.target.value)));

    // Keyboard shortcuts
    document.addEventListener('keydown', onGlobalKeyDown, true);

    // Resize handle
    let resizing = false;
    let startX = 0; let startW = 0;
    const minW =  parseInt(getComputedStyle(document.documentElement).getPropertyValue('--ytp-min-width')) || 380;
    const maxW =  parseInt(getComputedStyle(document.documentElement).getPropertyValue('--ytp-max-width')) || 640;
    function onMove(ev) {
      if (!resizing) return;
      const dx = startX - ev.clientX; // dragging left edge
      let w = Math.min(maxW, Math.max(minW, startW + dx));
      panel.style.width = w + 'px';
    }
    function onUp() {
      if (!resizing) return;
      resizing = false;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      try { localStorage.setItem(LS_PANEL_WIDTH, panel.style.width); } catch(_) {}
    }
    resizeHandle.addEventListener('pointerdown', (ev) => {
      resizing = true; startX = ev.clientX; startW = panel.getBoundingClientRect().width;
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });

    updateSearchUI();
    renderPlaylistSuggestions();

    // restore last tab preference (default playlist when no key)
    const defaultTab = (() => {
      const key = getApiKey();
      try {
        const stored = localStorage.getItem(LS_LAST_TAB);
        if (stored === 'search' || stored === 'playlist') {
          if (!key && stored === 'search') return 'playlist';
          return stored;
        }
      } catch (_) {}
      return key ? 'search' : 'playlist';
    })();
    setTab(defaultTab);
  }

  function onGlobalKeyDown(e) {
    // Cmd/Ctrl+Shift+Y toggles
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'Y' || e.key === 'y')) {
      e.preventDefault();
      YtPanel.toggle();
      return;
    }
    // ESC closes if open
    if (e.key === 'Escape' && panel && panel.classList.contains('open')) {
      e.preventDefault();
      YtPanel.close();
      return;
    }
    // Space toggles play when focus inside panel
    if (e.key === ' ' || e.code === 'Space') {
      const target = e.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      const within = panel && document.activeElement && panel.contains(document.activeElement);
      if (within || (panel && panel.matches(':hover'))) {
        e.preventDefault();
        ytPlayPause();
      }
    }
    // Enter in search input triggers search (handled by form submit), no-op here
  }

  function focusLiveRadioSuggestion() {
    const firstPlayButton = playlistSuggestionsEl?.querySelector('button[data-action="play-suggestion"]');
    firstPlayButton?.focus();
  }

  function setTab(which) {
    const target = (which === 'playlist') ? 'playlist' : 'search';
    const isSearch = target === 'search';
    tabSearchBtn.classList.toggle('active', isSearch);
    tabPlaylistBtn.classList.toggle('active', !isSearch);
    tabSearchBtn.setAttribute('aria-selected', String(isSearch));
    tabPlaylistBtn.setAttribute('aria-selected', String(!isSearch));
    tabSearchPanel.hidden = !isSearch;
    tabPlaylistPanel.hidden = isSearch;
    tabSearchPanel.classList.toggle('active', isSearch);
    tabPlaylistPanel.classList.toggle('active', !isSearch);
    if (isSearch) {
      updateSearchUI();
      searchInput?.focus();
    } else {
      focusLiveRadioSuggestion();
    }
    try { localStorage.setItem(LS_LAST_TAB, target); } catch (_) {}
  }

  function showApiKeyTip() {
    apikeyTip.hidden = false;
  }
  function hideApiKeyTip() {
    apikeyTip.hidden = true;
  }
  function getApiKey() {
    const k = (window.YOUTUBE_API_KEY || '').trim ? (window.YOUTUBE_API_KEY || '').trim() : window.YOUTUBE_API_KEY;
    if (k) return k;
    try {
      const fromLS = localStorage.getItem(LS_API_KEY);
      if (fromLS) return fromLS;
    } catch(_) {}
    return '';
  }

  function setSearchMessage(message, mark) {
    if (!resultsEl) return;
    resultsEl.dataset.state = 'message';
    if (mark) resultsEl.dataset.message = mark;
    else delete resultsEl.dataset.message;
    resultsEl.innerHTML = `<div class="yt-message">${message}</div>`;
  }

  function clearSearchMessage(mark) {
    if (!resultsEl) return;
    if (mark && resultsEl.dataset.message !== mark) return;
    delete resultsEl.dataset.state;
    delete resultsEl.dataset.message;
    if (!resultsEl.hasChildNodes()) {
      resultsEl.innerHTML = '';
    }
  }

  function updateSearchUI() {
    if (!searchInput) return;
    const hasKey = !!getApiKey();
    searchInput.placeholder = 'Search YouTube';
    if (!hasKey) {
      showApiKeyTip();
      if (!resultsEl.dataset.state) {
        setSearchMessage('Built-in search finds music without an API key. Paste your own YouTube Data API key below for official results and richer metadata.', 'nokey-tip');
      }
    } else {
      hideApiKeyTip();
      clearSearchMessage('nokey-tip');
    }
  }

  function renderPlaylistSuggestions() {
    if (!playlistSuggestionsEl) return;
    if (!Array.isArray(FEATURED_SUGGESTIONS) || !FEATURED_SUGGESTIONS.length) {
      playlistSuggestionsEl.innerHTML = '';
      return;
    }
    const cards = renderSuggestionCards(FEATURED_SUGGESTIONS.map((mix, idx) => ({ suggestion: mix, index: idx })));
    playlistSuggestionsEl.innerHTML = `
      <h3 class="yt-suggestions-title">Lofi Girl Live Radios</h3>
      ${cards}
    `;
  }

  function getSuggestionMatches(term) {
    const fallback = FEATURED_SUGGESTIONS.map((suggestion, index) => ({ suggestion, index }));
    if (!term || !term.trim()) return fallback;
    const needle = term.trim().toLowerCase();
    const matches = FEATURED_SUGGESTIONS.map((suggestion, index) => ({ suggestion, index }))
      .filter(({ suggestion }) => {
        const hay = `${suggestion.label} ${suggestion.description || ''}`.toLowerCase();
        return hay.includes(needle);
      });
    return matches.length ? matches : fallback;
  }

  function renderSuggestionCards(entries) {
    if (!entries || !entries.length) return '';
    return entries.map(({ suggestion, index }) => `
      <article class="yt-suggestion" data-index="${index}">
        <img src="${escapeHtml(suggestion.art)}" alt="${escapeHtml(suggestion.label)} cover" loading="lazy" />
        <div class="yt-suggestion-body">
          <div class="name">${escapeHtml(suggestion.label)}</div>
          <div class="desc">${escapeHtml(suggestion.description || '')}</div>
          <button type="button" data-action="play-suggestion" data-index="${index}">Play</button>
        </div>
      </article>
    `).join('');
  }

  function loadSuggestion(idx) {
    const suggestion = FEATURED_SUGGESTIONS[idx];
    if (!suggestion || !Array.isArray(suggestion.queue) || !suggestion.queue.length) return;
    currentQueue = suggestion.queue.map(item => ({ id: item.id, title: item.title || suggestion.label }));
    queueIndex = 0;
    const first = currentQueue[0];
    if (!first) return;
    setTab('playlist');
    playlistInfo.textContent = `Now playing: ${suggestion.label}`;
    ytLoadVideo(first.id, first.title || suggestion.label, true);
    toast(`Playing ${suggestion.label}`);
  }

  function disableControls(disabled) {
    [prevBtn, playBtn, nextBtn, volumeInput].forEach((el) => el.disabled = !!disabled);
    spinnerEl.style.display = disabled ? 'grid' : 'none';
  }

  function initYouTubePlayer() {
    loadYouTubeIFrameAPI().then(() => {
      player = new YT.Player('ytp-iframe', {
        width: '100%',
        height: '100%',
        playerVars: {
          controls: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          enablejsapi: 1,
          origin: window.location.origin
        },
        events: {
          onReady: onPlayerReady,
          onStateChange: onPlayerStateChange,
          onError: onPlayerError
        }
      });
    }).catch((err) => {
      console.error('Failed to load IFrame API', err);
      toast('Failed to load YouTube player');
    });
  }

  function onPlayerReady() {
    isPlayerReady = true;
    disableControls(false);
    let vol = 50;
    try { const saved = Number(localStorage.getItem(LS_VOLUME)); if (Number.isFinite(saved)) vol = saved; } catch(_) {}
    player.setVolume(vol);
    volumeInput.value = String(vol);
    try { player.stopVideo(); } catch (_) {}
    hasActiveMedia = false;
    lastLoadedItem = null;
  }

  function onPlayerStateChange(ev) {
    const s = ev.data;
    // YT.PlayerState.PLAYING = 1, PAUSED = 2, ENDED = 0
    if (s === YT.PlayerState.PLAYING) {
      isPlaying = true;
      playBtn.textContent = '⏸';
      updateNowTitle();
    } else if (s === YT.PlayerState.PAUSED) {
      isPlaying = false;
      playBtn.textContent = '▶';
    } else if (s === YT.PlayerState.ENDED) {
      isPlaying = false;
      playBtn.textContent = '▶';
      // if we have an app queue, advance
      if (Array.isArray(currentQueue) && currentQueue.length > 0) {
        if (queueIndex < currentQueue.length - 1) {
          queueIndex++;
          const next = currentQueue[queueIndex];
          ytLoadVideo(next?.id, next?.title, true);
        }
      }
    }
  }

  function onPlayerError(ev) {
    const code = ev?.data;
    console.warn('YT error', code, ev);
    if (code === 100 || code === 101 || code === 150) {
      handleBlockedPlayback('That video can only be watched on YouTube.', code);
      return;
    }
    if (code === 2 || code === 5) {
      toast('YouTube hit a playback issue. Try another video.');
      return;
    }
    toast('YouTube player error');
  }

  function handleBlockedPlayback(message, code) {
    const blockedId = lastLoadedItem?.id || null;
    const baseMessage = blockedId ? (BLOCKED_VIDEO_REASONS.get(blockedId) || message) : message;
    const fallbackMessage = baseMessage || 'That video can only be watched on YouTube.';
    let removedIdx = -1;
    let messageText = fallbackMessage;
    if (blockedId) {
      markVideoBlocked(blockedId, fallbackMessage, code);
      removedIdx = removeFromQueueById(blockedId);
      messageText = BLOCKED_VIDEO_REASONS.get(blockedId) || fallbackMessage;
    }
    isPlaying = false;
    hasActiveMedia = false;
    lastLoadedItem = null;
    playBtn.textContent = '▶';
    const advanced = advanceQueueAfterBlock(removedIdx);
    if (!advanced) {
      nowTitleEl.textContent = '';
      nowTitleEl.title = '';
      toast(`${messageText} No more playable videos are queued.`);
    } else {
      toast(messageText);
    }
  }

  function advanceQueueAfterBlock(startIndex) {
    if (!Array.isArray(currentQueue) || currentQueue.length === 0) {
      queueIndex = -1;
      return false;
    }
    if (typeof startIndex === 'number' && startIndex >= 0) {
      queueIndex = startIndex;
    }
    if (queueIndex < 0) queueIndex = 0;
    if (queueIndex >= currentQueue.length) queueIndex = currentQueue.length - 1;
    let next = currentQueue[queueIndex];
    while (next && BLOCKED_VIDEO_IDS.has(next.id)) {
      removeFromQueueById(next.id);
      if (!Array.isArray(currentQueue) || currentQueue.length === 0) {
        queueIndex = -1;
        return false;
      }
      if (queueIndex >= currentQueue.length) queueIndex = currentQueue.length - 1;
      next = currentQueue[queueIndex];
    }
    if (!next) {
      return false;
    }
    setTimeout(() => {
      ytLoadVideo(next.id, next.title, true);
    }, 0);
    return true;
  }

  function removeFromQueueById(videoId) {
    if (!videoId || !Array.isArray(currentQueue) || currentQueue.length === 0) {
      return -1;
    }
    const idx = currentQueue.findIndex((item) => item.id === videoId);
    if (idx === -1) return -1;
    currentQueue.splice(idx, 1);
    if (queueIndex > idx) queueIndex -= 1;
    if (queueIndex >= currentQueue.length) queueIndex = currentQueue.length - 1;
    if (currentQueue.length === 0) queueIndex = -1;
    return idx;
  }

  function markVideoBlocked(videoId, reason, code) {
    if (!videoId) return;
    BLOCKED_VIDEO_IDS.add(videoId);
    if (reason) {
      const hasCode = typeof reason === 'string' && reason.includes('YouTube error');
      const decorated = (code && !hasCode) ? `${reason} (YouTube error ${code})` : reason;
      BLOCKED_VIDEO_REASONS.set(videoId, decorated);
    }
    EMBED_CHECK_CACHE.set(videoId, false);
    pruneBlockedResults();
    console.warn('Marked video as blocked', videoId, reason, code);
  }

  function pruneBlockedResults() {
    if (!resultsEl || BLOCKED_VIDEO_IDS.size === 0) return;
    const cards = resultsEl.querySelectorAll('.yt-card');
    if (!cards || !cards.length) return;
    let removed = 0;
    cards.forEach((card) => {
      const id = card.getAttribute('data-video-id');
      if (id && BLOCKED_VIDEO_IDS.has(id)) {
        card.remove();
        removed++;
      }
    });
    if (removed > 0 && !resultsEl.querySelector('.yt-card')) {
      setSearchMessage('No playable videos found. Try a different search or open on YouTube.', 'no-playable');
    }
  }

  function updateNowTitle() {
    try {
      const data = player && player.getVideoData ? player.getVideoData() : null;
      const t = data && data.title ? data.title : '';
      const title = t || lastLoadedItem?.title || '';
      if (title) {
        nowTitleEl.textContent = title;
        nowTitleEl.title = title;
      }
    } catch(_) {}
  }

  function queueAdd(id, title) {
    if (!id) return;
    if (BLOCKED_VIDEO_IDS.has(id)) {
      const msg = BLOCKED_VIDEO_REASONS.get(id) || 'That video can only be watched on YouTube.';
      toast(msg);
      return;
    }
    if (!Array.isArray(currentQueue)) currentQueue = [];
    currentQueue.push({ id, title: title || '' });
    if (queueIndex === -1) queueIndex = 0;
    toast('Added to queue');
  }

  function ytPlayPause() {
    if (!isPlayerReady) return;
    if (!hasActiveMedia) { toast('Pick something to play first'); return; }
    try {
      const st = player.getPlayerState();
      if (st === YT.PlayerState.PLAYING) { player.pauseVideo(); isPlaying = false; playBtn.textContent = '▶'; }
      else { player.playVideo(); isPlaying = true; playBtn.textContent = '⏸'; }
    } catch(_) {}
  }

  function ytNext() {
    if (!isPlayerReady || !hasActiveMedia) { toast('Nothing to skip yet'); return; }
    if (currentQueue && currentQueue.length > 0) {
      if (queueIndex < currentQueue.length - 1) {
        queueIndex++;
        const next = currentQueue[queueIndex];
        ytLoadVideo(next?.id, next?.title, true);
      } else {
        toast('End of queue');
      }
    } else if (lastLoadedItem?.type === 'playlist') {
      try { player.nextVideo(); } catch(_) {}
    } else {
      toast('Queue is empty. Use + Queue or load a playlist.');
    }
  }

  function ytPrev() {
    if (!isPlayerReady || !hasActiveMedia) { toast('Nothing to rewind yet'); return; }
    if (currentQueue && currentQueue.length > 0) {
      if (queueIndex > 0) {
        queueIndex--;
        const prev = currentQueue[queueIndex];
        ytLoadVideo(prev?.id, prev?.title, true);
      } else {
        toast('Start of queue');
      }
    } else if (lastLoadedItem?.type === 'playlist') {
      try { player.previousVideo(); } catch(_) {}
    } else {
      toast('Queue is empty. Use + Queue or load a playlist.');
    }
  }

  function ytSetVolume(v) {
    if (!isPlayerReady) return;
    const vol = Math.max(0, Math.min(100, Number(v)));
    try { player.setVolume(vol); } catch(_) {}
    try { localStorage.setItem(LS_VOLUME, String(vol)); } catch(_) {}
  }

  function ytLoadVideo(id, fallbackTitle, play = false) {
    if (!isPlayerReady || !id) return;
    if (BLOCKED_VIDEO_IDS.has(id)) {
      const msg = BLOCKED_VIDEO_REASONS.get(id) || 'That video can only be watched on YouTube.';
      lastLoadedItem = { type: 'video', id, title: fallbackTitle || '' };
      handleBlockedPlayback(msg);
      return;
    }
    try {
      // Autoplay only after user gesture: this function is called from buttons/gestures
      player.loadVideoById({ videoId: id });
      if (play) player.playVideo();
      const current = (queueIndex >= 0 && currentQueue[queueIndex]) ? currentQueue[queueIndex] : { id, title: fallbackTitle || '' };
      if (!Array.isArray(currentQueue) || !currentQueue.length) {
        currentQueue = [current];
        queueIndex = 0;
      }
      const title = fallbackTitle || current.title || '';
      if (title) { nowTitleEl.textContent = title; nowTitleEl.title = title; }
      lastLoadedItem = { type: 'video', id, title };
      hasActiveMedia = true;
    } catch(_) {}
  }

  function ytLoadPlaylist(listId, focusTitle = false) {
    if (!isPlayerReady || !listId) return;
    try {
      currentQueue = [];
      queueIndex = -1;
      if (typeof player.cuePlaylist === 'function') {
        player.cuePlaylist({ list: listId });
      } else {
        player.loadPlaylist({ list: listId });
      }
      // We don't call play automatically; the user can press Play
      playlistInfo.textContent = `Loaded playlist: ${listId}`;
      if (focusTitle) nowTitleEl.textContent = `Playlist • ${listId}`;
      nowTitleEl.title = nowTitleEl.textContent;
      lastLoadedItem = { type: 'playlist', id: listId, title: `Playlist • ${listId}` };
      hasActiveMedia = true;
      toast('Playlist loaded. Press play when you are ready.');
    } catch(_) {}
  }

  // --- YouTube Data API (search) ---
  async function doSearch(query) {
    const term = typeof query === 'string' ? query.trim() : '';
    if (!term) return;
    setTab('search');
    const key = getApiKey();
    if (key) {
      await searchWithApiKey(term, key);
      return;
    }
    await searchWithoutApiKey(term);
  }

  async function searchWithApiKey(query, key) {
    hideApiKeyTip();
    if (resultsEl) {
      resultsEl.dataset.state = 'loading';
      resultsEl.innerHTML = '<div class="yt-message">Searching…</div>';
    }
    try {
      const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
      searchUrl.search = new URLSearchParams({
        part: 'snippet',
        type: 'video',
        maxResults: '20',
        videoEmbeddable: 'true',
        safeSearch: 'moderate',
        q: query
      }).toString();
      const sRes = await fetch(searchUrl.toString() + `&key=${encodeURIComponent(key)}`);
      if (!sRes.ok) throw new Error(`API ${sRes.status}`);
      const sJson = await sRes.json();
      const items = Array.isArray(sJson.items) ? sJson.items : [];
      const ids = items.map(it => it.id && it.id.videoId).filter(Boolean);
      let durationMap = {};
      if (ids.length) {
        const vidsUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
        vidsUrl.search = new URLSearchParams({
          part: 'contentDetails,status',
          id: ids.join(',')
        }).toString();
        const vRes = await fetch(vidsUrl.toString() + `&key=${encodeURIComponent(key)}`);
        if (vRes.ok) {
          const vJson = await vRes.json();
          for (const v of (vJson.items || [])) {
            const vid = v.id;
            if (!vid) continue;
            durationMap[vid] = parseISODuration(v.contentDetails?.duration || 'PT0S');
            const status = v.status || {};
            if (status.embeddable === false || status.privacyStatus !== 'public') {
              const reason = status.embeddable === false
                ? 'Uploader disabled embedding for this video.'
                : 'This video is not publicly available.';
              markVideoBlocked(vid, reason);
              continue;
            }
            const blockedRegions = status.regionRestriction?.blocked || [];
            if (Array.isArray(blockedRegions) && blockedRegions.length) {
              const reason = 'This video is blocked in some regions and may not play here.';
              markVideoBlocked(vid, reason);
            }
          }
        }
      }
      const filtered = await filterEmbeddableItems(items, durationMap);
      if (!filtered.items.length) {
        setSearchMessage('No playable videos found. Try a different search or open on YouTube.', 'no-playable');
        return;
      }
      renderResults(filtered.items, filtered.durationMap);
    } catch (e) {
      console.warn('Search failed', e);
      toast('Search failed (check API key or quota).');
      setSearchMessage('Search hit an error. Double-check your API key or try again later. Playlist mode and featured mixes keep working offline.', 'error');
    }
  }

  async function searchWithoutApiKey(query) {
    showApiKeyTip();
    if (resultsEl) {
      resultsEl.dataset.state = 'loading';
      resultsEl.innerHTML = '<div class="yt-message">Searching…</div>';
    }
    try {
      if (!window.clickTreeAPI || typeof window.clickTreeAPI.youtubeSearch !== 'function') {
        throw new Error('bridge-unavailable');
      }
      const response = await window.clickTreeAPI.youtubeSearch(query);
      if (!response || !response.ok) {
        throw new Error(response?.error || 'search-failed');
      }
      const videos = Array.isArray(response.results) ? response.results : [];
      if (!videos.length) {
        setSearchMessage('No results found. Try a different search or load a playlist.', 'empty');
        return;
      }
      const durationMap = {};
      const items = videos.map((video) => {
        if (video.id) {
          durationMap[video.id] = video.duration || '';
        }
        return {
          id: { videoId: video.id },
          snippet: {
            title: video.title || '',
            channelTitle: video.channel || '',
            thumbnails: {
              medium: { url: video.thumbnail || '' },
              high: { url: video.thumbnail || '' }
            }
          }
        };
      });
      const filtered = await filterEmbeddableItems(items, durationMap);
      if (!filtered.items.length) {
        setSearchMessage('No playable videos found. Try a different search or open on YouTube.', 'no-playable');
        return;
      }
      renderResults(filtered.items, filtered.durationMap);
    } catch (error) {
      console.warn('Search failed', error);
      toast('Search failed. Loading a YouTube mix instead.');
      playSearchFallback(query);
    }
  }

  async function filterEmbeddableItems(items, durationMap = {}) {
    if (!Array.isArray(items) || !items.length) {
      return { items: [], durationMap: {} };
    }
    const checks = await Promise.all(items.map(async (item) => {
      const id = item?.id?.videoId;
      if (!id || BLOCKED_VIDEO_IDS.has(id)) return null;
      const playable = await isVideoEmbeddable(id);
      return playable ? { item, id } : null;
    }));
    const filteredItems = [];
    const filteredDuration = {};
    for (const entry of checks) {
      if (!entry) continue;
      filteredItems.push(entry.item);
      if (durationMap && Object.prototype.hasOwnProperty.call(durationMap, entry.id)) {
        filteredDuration[entry.id] = durationMap[entry.id];
      }
    }
    return { items: filteredItems, durationMap: filteredDuration };
  }

  async function isVideoEmbeddable(videoId) {
    if (!videoId) return false;
    if (BLOCKED_VIDEO_IDS.has(videoId)) return false;
    if (EMBED_CHECK_CACHE.has(videoId)) {
      return EMBED_CHECK_CACHE.get(videoId);
    }
    const bridge = window.clickTreeAPI;
    if (bridge && typeof bridge.youtubeCheckEmbeddable === 'function') {
      try {
        const result = await bridge.youtubeCheckEmbeddable(videoId);
        if (result) {
          if (result.embeddable === false) {
            const reason = result.reason || 'That video can only be watched on YouTube.';
            BLOCKED_VIDEO_REASONS.set(videoId, reason);
            BLOCKED_VIDEO_IDS.add(videoId);
            EMBED_CHECK_CACHE.set(videoId, false);
            return false;
          }
          if (result.embeddable === true) {
            EMBED_CHECK_CACHE.set(videoId, true);
            return true;
          }
          if (result.ok === false && result.error) {
            console.warn('Embed check inconclusive', result.error);
          }
        }
      } catch (err) {
        console.warn('IPC embed check failed', err);
      }
    }
    EMBED_CHECK_CACHE.set(videoId, true);
    return true;
  }

  function playSearchFallback(query) {
    if (!isPlayerReady) { toast('Player is still loading, try again in a moment.'); return; }
    const term = query.trim();
    if (!term) return;
    try {
      currentQueue = [];
      queueIndex = -1;
      if (typeof player.loadPlaylist === 'function') {
        player.loadPlaylist({ listType: 'search', list: term });
        player.playVideo();
      } else if (typeof player.cuePlaylist === 'function') {
        player.cuePlaylist({ listType: 'search', list: term });
        player.playVideo();
      }
      hasActiveMedia = true;
      lastLoadedItem = { type: 'search', id: term, title: `Search • ${term}` };
      nowTitleEl.textContent = `Search • ${term}`;
      nowTitleEl.title = `Search • ${term}`;
      const matches = getSuggestionMatches(term);
      const cards = renderSuggestionCards(matches);
      const safe = escapeHtml(term);
      resultsEl.dataset.state = 'results';
      resultsEl.dataset.message = 'search-fallback';
      resultsEl.innerHTML = `
        <h3 class="yt-suggestions-title">Mixes for “${safe}”</h3>
        <div class="yt-suggestions">${cards}</div>
        <p class="yt-note">Want more choices? Paste a YouTube Data API key below to browse full results.</p>
      `;
    } catch (err) {
      console.warn('Fallback search failed', err);
      toast('Could not start playback for that search. Try again soon.');
    }
  }

  function parseISODuration(iso) {
    // PT#H#M#S
    const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso);
    if (!m) return '0:00';
    const h = Number(m[1]||0), mi = Number(m[2]||0), s = Number(m[3]||0);
    const mm = String(mi).padStart(2,'0');
    const ss = String(s).padStart(2,'0');
    return h ? `${h}:${mm}:${ss}` : `${mi}:${ss}`;
  }

  function escapeHtml(s) {
    return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  }

  function renderResults(items, durationMap) {
    if (!Array.isArray(items) || items.length === 0) {
      setSearchMessage('No results found. Try a different search or load a playlist.', 'empty');
      return;
    }
    if (resultsEl) {
      resultsEl.dataset.state = 'results';
      delete resultsEl.dataset.message;
    }
    const frags = [];
    for (const it of items) {
      const id = it.id?.videoId; if (!id) continue;
      const sn = it.snippet || {};
      const title = sn.title || '';
      const channel = sn.channelTitle || '';
      const thumb = (sn.thumbnails?.medium?.url) || (sn.thumbnails?.high?.url) || '';
      const dur = durationMap[id] || '';
      frags.push(`
        <article class="yt-card" data-video-id="${escapeHtml(id)}" data-title="${escapeHtml(title)}" title="${escapeHtml(title)}">
          <img src="${escapeHtml(thumb)}" alt="${escapeHtml(title)} thumbnail" loading="lazy" />
          <div class="yt-meta">
            <div class="t">${escapeHtml(title)}</div>
            <div class="s">${escapeHtml(channel)}${dur?` • ${dur}`:''}</div>
          </div>
          <div class="yt-card-actions">
            <button class="yt-playnow">Play Now</button>
            <button class="yt-queue">+ Queue</button>
          </div>
        </article>
      `);
    }
    frags.push('<div class="yt-message"><button type="button" data-action="show-featured">Browse featured mixes</button></div>');
    resultsEl.innerHTML = frags.join('');
    pruneBlockedResults();
  }

  // --- IFrame Loader ---
  function loadYouTubeIFrameAPI() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (ytReadyPromise) return ytReadyPromise;
    ytReadyPromise = new Promise((resolve, reject) => {
      if (ytScriptLoading) return; // should not happen twice
      ytScriptLoading = true;
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      tag.onerror = () => reject(new Error('Failed to load YouTube IFrame API'));
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function() {
        prev && prev();
        resolve();
      };
    });
    return ytReadyPromise;
  }

  // --- Toast ---
  let toastEl = null; let toastTimer = 0;
  function toast(msg, ms = 2400) {
    if (!panel) return;
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'yt-toast';
      panel.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.style.display = 'none'; }, ms);
  }

  // --- Public API & boot ---
  const PANEL_ID = 'youtube';

  function openPanelInternal() {
    ensurePanel();
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    updateSearchUI();
    if (tabSearchBtn?.classList.contains('active')) {
      searchInput?.focus();
    } else {
      focusLiveRadioSuggestion();
    }
  }

  function closePanelInternal() {
    if (!panel) return;
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
  }

  const ytController = window.createPanelController({
    id: PANEL_ID,
    ensurePanel: () => ensurePanel(),
    getElement: () => panel,
    onOpen: () => openPanelInternal(),
    onClose: () => closePanelInternal(),
    ensureFab: ({ cluster, controller }) => {
      if (!cluster) return;
      let btn = cluster.querySelector('#yt-fab');
      if (!btn) {
        btn = document.createElement('button');
        btn.id = 'yt-fab';
        btn.type = 'button';
        btn.classList.add('fab');
        btn.title = 'YouTube (Cmd/Ctrl+Shift+Y)';
        btn.setAttribute('aria-label', 'Open YouTube panel');
        btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 15l5.19-3L10 9v6zm11-3c0 2.12-.17 3.5-.5 4.38-.33.9-1.05 1.62-1.95 1.95C17.67 18.67 12 18.67 12 18.67s-5.67 0-6.55-.34c-.9-.33-1.62-1.05-1.95-1.95C3.17 15.5 3 14.12 3 12c0-2.12.17-3.5.5-4.38.33-.9 1.05-1.62 1.95-1.95C6.33 5.33 12 5.33 12 5.33s5.67 0 6.55.34c.9.33 1.62 1.05 1.95 1.95.33.88.5 2.26.5 4.38z"/></svg>';
        cluster.appendChild(btn);
      } else {
        btn.type = 'button';
        btn.classList.add('fab');
        btn.title = btn.title || 'YouTube (Cmd/Ctrl+Shift+Y)';
        btn.setAttribute('aria-label', btn.getAttribute('aria-label') || 'Open YouTube panel');
      }
      if (!btn.dataset.panelWired) {
        btn.dataset.panelWired = 'true';
        btn.addEventListener('click', (event) => {
          event.preventDefault();
          controller.toggle();
        });
      }
    },
    transitionMs: 220
  });

  const YtPanel = {
    ensurePanel: () => ytController.ensurePanel(),
    ensureFab: () => ytController.ensureFab?.(),
    open(options = {}) {
      ytController.open(options);
    },
    close(options = {}) {
      ytController.close(options);
    },
    toggle() {
      ytController.toggle();
    },
    getCurrentTitle() {
      if (!hasActiveMedia) return '';
      return lastLoadedItem?.title || '';
    }
  };

  window.YtPanel = YtPanel;

  ytController.ensureFab?.();

  // Expose control helpers
  window.ytPlayPause = ytPlayPause;
  window.ytNext = ytNext;
  window.ytPrev = ytPrev;
  window.ytSetVolume = ytSetVolume;
  window.ytLoadVideo = (id) => ytLoadVideo(id, undefined, true);
  window.ytLoadPlaylist = (listId) => ytLoadPlaylist(listId, true);

})();
