(function(){
    const PANEL_ID = 'cards';
    const BASE_INV = 'CardInventory.v1';
    const BASE_SEL = 'CardInventory.selectedId.v1';
    function getActiveEmail(){
      try { return (JSON.parse(localStorage.getItem('ClickTreeAccount'))?.user?.email || '').toLowerCase(); } catch(_) { return ''; }
    }
    function invKey(){
      const email = getActiveEmail();
      if (!email) return null;
      return `${BASE_INV}::${email}`;
    }
    function selKey(){
      const email = getActiveEmail();
      if (!email) return null;
      return `${BASE_SEL}::${email}`;
    }

    let panel, gridEl, emptyEl, closeBtn, viewerEl, actionsEl;
    let navWired = false;
  
    function ensurePanel(){
      let el = document.getElementById('cards-panel');
      if (!el) {
        el = document.createElement('aside');
        el.id = 'cards-panel';
        el.className = 'panel-shell cards-panel';
        el.setAttribute('aria-hidden', 'true');
        el.innerHTML = `
          <header class="panel-topbar" style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;">
            <div class="cozy-hand" style="font-size:18px;font-weight:600">Card Collection</div>
            <button id="cards-close" class="account-close" title="Close" aria-label="Close">✕</button>
          </header>
          <main class="panel-content cards-layout">
            <section class="cards-view">
              <h2 class="cards-title cozy-hand">Your card</h2>
              <div id="cards-viewer" class="cards-viewer" aria-live="polite"></div>
              <div id="cards-actions" class="cards-actions">
                <button type="button" data-action="export" title="Export PNG">Export</button>
              </div>
            </section>
            <section class="cards-gallery">
              <h2 class="cards-title cozy-hand">Your trees</h2>
              <div id="cards-empty" class="cards-empty cozy-hand">No cards yet. Finish a study session to mint your first card.</div>
              <div id="cards-grid" class="cards-grid" role="list"></div>
            </section>
          </main>
        `;
        document.body.appendChild(el);
      }
      panel = el;
      gridEl   = panel.querySelector('#cards-grid');
      emptyEl  = panel.querySelector('#cards-empty');
      viewerEl = panel.querySelector('#cards-viewer');
      actionsEl = panel.querySelector('#cards-actions');
      closeBtn = panel.querySelector('#cards-close');
      closeBtn.addEventListener('click', () => CardsPanel.close());
      panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') CardsPanel.close(); });
      function wireHoverLight(){
        if (!gridEl || gridEl.dataset.hoverLightWired) return;
        const setLightPos = (el, x, y) => {
          const r = el.getBoundingClientRect();
          el.style.setProperty('--mx', ((x - r.left) / r.width * 100) + '%');
          el.style.setProperty('--my', ((y - r.top) / r.height * 100) + '%');
        };
        gridEl.addEventListener('pointermove', (e) => {
          const t = e.target.closest('.card-thumb'); if (!t) return;
          setLightPos(t, e.clientX, e.clientY);
        });
        gridEl.addEventListener('pointerleave', (e) => {
          const t = e.target.closest('.card-thumb'); if (!t) return;
          t.style.removeProperty('--glow');
          t.style.removeProperty('--mx');
          t.style.removeProperty('--my');
        }, true);
        gridEl.dataset.hoverLightWired = '1';
      }
      wireHoverLight();
      ensureNavWiring();
      return panel;
    }
  
    function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
    function load(){
      try {
        const key = invKey();
        if (!key) return [];
        const data = JSON.parse(localStorage.getItem(key)) || [];
        if (!Array.isArray(data)) return [];
        const owner = getActiveEmail() || '';
        let changed = false;
        const normalized = data.map((item) => {
          if (!item || typeof item !== 'object') return item;
          if (item.ownerEmail) return item;
          changed = true;
          return { ...item, ownerEmail: owner };
        });
        if (changed) save(normalized);
        return normalized;
      } catch(_) {
        return [];
      }
    }
    function save(list){
      try {
        const key = invKey();
        if (!key) return;
        localStorage.setItem(key, JSON.stringify(list));
      } catch(_) {}
    }
    function loadSelected(){
      try {
        const key = selKey();
        if (!key) return '';
        return localStorage.getItem(key)||'';
      } catch(_) { return ''; }
    }
    function saveSelected(id){
      try {
        const key = selKey();
        if (!key) return;
        localStorage.setItem(key, id||'');
      } catch(_) {}
    }

    function migrateLegacy(){
      try {
        const email = getActiveEmail();
        if (!email) return;
        const inventoryKey = invKey();
        const selectedKey = selKey();
        if (!inventoryKey || !selectedKey) return;
        const legacy = localStorage.getItem(BASE_INV);
        if (legacy && !localStorage.getItem(inventoryKey)) {
          localStorage.setItem(inventoryKey, legacy);
          localStorage.removeItem(BASE_INV);
        }
        const legacySel = localStorage.getItem(BASE_SEL);
        if (legacySel && !localStorage.getItem(selectedKey)) {
          localStorage.setItem(selectedKey, legacySel);
          localStorage.removeItem(BASE_SEL);
        }
      } catch(_) {}
    }

    migrateLegacy();

    let cards = load();
    let selectedId = loadSelected();
    let cloudPushedOnce = false, pushTimer = null, pulledThisLogin = false;

    async function syncFromCloudOnce(){
      if (pulledThisLogin) return;
      pulledThisLogin = true;
      const res = await window.clickTreeAPI?.cardsPull?.();
      if (!res?.ok || !res.data) return;
      const email = getActiveEmail();
      if (!email) return;
      const cloud = Array.isArray(res.data.items) ? res.data.items.filter(c => c?.ownerEmail === email) : [];
      if (!cloud.length) return;
      const local = load();
      const byId = new Map(local.map(c => [String(c.id), c]));
      for (const c of cloud) {
        const k = String(c.id);
        if (!byId.has(k)) local.push(c);
      }
      save(local);
      cards = local;
      render();
    }

    function queueCloudPush(){
      clearTimeout(pushTimer);
      pushTimer = setTimeout(async () => {
        const email = getActiveEmail();
        if (!email) return;
        const data = { schema: 'cards-v1', email, items: load() };
        await window.clickTreeAPI?.cardsPush?.(data);
        cloudPushedOnce = true;
      }, 600);
    }

    window.addEventListener('auth:changed', () => {
      migrateLegacy();
      cards = load();
      selectedId = loadSelected();
      pulledThisLogin = false;
      cloudPushedOnce = false;
      render();
      syncFromCloudOnce();
    });

    function render(){
      if (!gridEl || !viewerEl) return;
      const email = getActiveEmail();
      if (!email) {
        if (gridEl) gridEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'none';
        if (actionsEl) actionsEl.style.display = 'none';
        viewerEl.innerHTML = `
          <div class="cards-viewer-empty">
            <p class="cozy-hand" style="font-size:18px;margin-bottom:12px;">Sign in to access your card collection</p>
            <button id="cards-signin" type="button" class="mint-primary">Sign In</button>
          </div>`;
        const btn = viewerEl.querySelector('#cards-signin');
        btn?.addEventListener('click', (ev) => {
          ev.preventDefault();
          window.AccountPanel?.open();
        }, { once: true });
        return;
      }
      if (gridEl) gridEl.style.display = '';
      if (actionsEl) actionsEl.style.display = '';
      emptyEl.style.display = cards.length ? 'none' : 'block';
      if (cards.length && !cards.some(c => String(c.id) === String(selectedId))) {
        selectedId = String(cards[0].id || '');
        saveSelected(selectedId);
      }
      renderGrid();
      renderViewer();
    }

    function seedHue(seed){
      const input = String(seed || '');
      if (!input) return 160;
      let hash = 0;
      for (let i = 0; i < input.length; i++) {
        hash = ((hash * 31) + input.charCodeAt(i)) >>> 0;
      }
      return hash % 360;
    }

    function renderBigCard(card){
      const title = escapeHtml(card.title || 'Study Session');
      const png = escapeHtml(card.png || '');
      const when = card.createdAt ? new Date(card.createdAt).toLocaleString() : '';
      const seed = escapeHtml(String(card.seed ?? ''));
      const hueInput = card.seed || card.id || card.title;
      const accentHue = seedHue(hueInput);
      return `
        <article class="id-card" data-id="${escapeHtml(card.id||'')}" title="${title}" style="margin:12px auto; --accent-hue:${accentHue};">
          <div class="rotate-hint"><span class="arrow">↔</span>Drag to rotate • Double-click to flip</div>
          <div class="card-inner">
            <div class="card-front">
              <div class="character-container">
                <div class="scene-backdrop" aria-hidden="true"></div>
                <div class="character-layer">
                  <img class="pixel-avatar" src="${png}" alt="${title}" />
                </div>
                <div class="front-layer">
                  <img class="front-layer1" src="./assets/CardImages/3dLayer.png" alt="" />
                </div>
              </div>
              <div class="front-letters info">
                <div class="name cozy-hand" style="font-size:22px">${title}</div>
              </div>
            </div>
            <div class="card-back">
              <div class="back-layer">
                <img class="back-layer1" src="./assets/CardImages/3dLayer.png" alt="" />
              </div>
              <div class="back-letters info cozy-hand" style="padding:16px">
                <div style="margin-bottom:6px">${escapeHtml(when)}</div>
                <div>Seed: ${seed}</div>
                <div>Owner: ${escapeHtml(card.ownerEmail || 'guest')}</div>
              </div>
            </div>
          </div>
        </article>
      `;
    }

    function renderGrid(){
      const thumbs = cards.map((card) => {
        const id = escapeHtml(card.id||'');
        const title = escapeHtml(card.title||'');
        const png = escapeHtml(card.png||'');
        const selected = (id === selectedId) ? ' selected' : '';
        const hueInput = card.seed || card.id || card.title;
        const accentHue = seedHue(hueInput);
        return `
      <button class="card-thumb${selected}" role="listitem"
              data-id="${id}" title="${title}"
              aria-selected="${selected ? 'true' : 'false'}"
              style="--accent-hue:${accentHue};">
        <div class="thumb-inner" aria-hidden="true"></div>
        ${png ? `<img class="thumb-img" src="${png}" alt="${title} thumbnail" loading="lazy">` : ''}
        <img class="thumb-frame" src="./assets/CardImages/3dLayer.png" alt="" aria-hidden="true">
      </button>
    `;
      }).join('');
      gridEl.innerHTML = thumbs;
    }

    function renderViewer(){
      const card = cards.find(c => String(c.id) === String(selectedId));
      if (!card) {
        viewerEl.innerHTML = `<div class="cards-viewer-empty"></div>`;
        return;
      }
      viewerEl.innerHTML = renderBigCard(card);
      const big = viewerEl.querySelector('.id-card');
      if (big) attachInteractions(big);
    }

    function scrollSelectedIntoView() {
      const el = gridEl?.querySelector('.card-thumb.selected');
      if (!el) return;
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }

    // --- Keyboard navigation + actions ---
    function getThumbs() {
      return Array.from(gridEl?.querySelectorAll('.card-thumb') || []);
    }
    function getSelectedIndex() {
      const id = String(selectedId || '');
      return getThumbs().findIndex(el => (el.getAttribute('data-id') || '') === id);
    }
    function selectByIndex(nextIdx, { focus = true } = {}) {
      const thumbs = getThumbs();
      if (!thumbs.length) return;
      const idx = Math.max(0, Math.min(nextIdx, thumbs.length - 1));
      const next = thumbs[idx];
      if (!next) return;

      selectedId = next.getAttribute('data-id') || '';
      saveSelected(selectedId);

      // Update selection classes + ARIA quickly
      thumbs.forEach(el => {
        const isSel = (el.getAttribute('data-id') || '') === selectedId;
        el.classList.toggle('selected', isSel);
        el.setAttribute('aria-selected', isSel ? 'true' : 'false');
      });

      renderViewer();
      if (focus) next.focus({ preventScroll: true });
      scrollSelectedIntoView();
    }
    function getColumnCount() {
      if (!gridEl) return 1;
      const cs = getComputedStyle(gridEl);
      const cols = (cs.gridTemplateColumns || '').split(' ').filter(Boolean).length;
      return Math.max(1, cols || 1);
    }

    function ensureNavWiring() {
      if (navWired || !panel) return;
      navWired = true;

      // Keyboard navigation inside the panel
      panel.addEventListener('keydown', (e) => {
        if (panel.getAttribute('aria-hidden') === 'true') return;

        const thumbs = getThumbs();
        if (!thumbs.length) return;

        const idx = getSelectedIndex();
        const cols = getColumnCount();

        // Prevent page scroll when we use arrows/space here
        const block = () => { e.preventDefault(); e.stopPropagation(); };

        switch (e.key) {
          case 'ArrowRight': block(); selectByIndex(idx + 1); break;
          case 'ArrowLeft':  block(); selectByIndex(idx - 1); break;
          case 'ArrowDown':  block(); selectByIndex(idx + cols); break;
          case 'ArrowUp':    block(); selectByIndex(idx - cols); break;
          case 'Home':       block(); selectByIndex(0); break;
          case 'End':        block(); selectByIndex(thumbs.length - 1); break;
          case 'PageDown':   block(); selectByIndex(idx + cols); break;
          case 'PageUp':     block(); selectByIndex(idx - cols); break;
          case 'Enter': {
            // Mimic click on the selected thumb
            const sel = thumbs[Math.max(0, getSelectedIndex())];
            if (sel) { block(); sel.click(); }
            break;
          }
          case ' ':
          case 'Spacebar': {
            // Flip the big card
            const big = viewerEl?.querySelector('.id-card');
            if (big) { block(); big.classList.toggle('flipped'); }
            break;
          }
          case 'e':
          case 'E': {
            // Export current card
            block();
            handleExport?.();
            break;
          }
          default:
            break;
        }
      }, { capture: true });

      // Keep your existing export delegation intact
      const actions = panel.querySelector('#cards-actions');
      if (actions && !actions.dataset.wired) {
        actions.dataset.wired = 'true';
        actions.addEventListener('click', (ev) => {
          const btn = ev.target.closest('button[data-action]');
          if (!btn) return;
          if (btn.getAttribute('data-action') === 'export') handleExport();
        });
      }
    }

    function getSelectedCard() {
      return cards.find(c => String(c.id) === String(selectedId)) || null;
    }

    function handleExport() {
      const card = getSelectedCard();
      if (!card) return;
      const href = card.pngHd || card.png;
      if (!href) return;
      const a = document.createElement('a');
      a.href = href;
      const safe = (card.title || 'card').replace(/[\\/:*?"<>|]+/g, '_');
      a.download = `${safe || 'card'}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }

    // Click → select card
    document.addEventListener('click', (e) => {
      const thumb = e.target.closest?.('.card-thumb');
      if (!thumb || !gridEl?.contains(thumb)) return;
      selectedId = thumb.getAttribute('data-id') || '';
      saveSelected(selectedId);
      // update selection highlight (cheap)
      gridEl.querySelectorAll('.card-thumb').forEach(el => el.classList.toggle('selected', el.getAttribute('data-id') === selectedId));
      renderViewer();
      gridEl.querySelectorAll('.card-thumb').forEach(el => {
        el.setAttribute('aria-selected', el.classList.contains('selected') ? 'true' : 'false');
      });
      scrollSelectedIntoView();
    }, true);

    // Per-card drag/flip interactions (same behavior as idCard.js but scoped per element)
    function attachInteractions(card){
      const inner = card.querySelector('.card-inner');
      if (!inner || card.dataset.wired) return;
      card.dataset.wired = 'true';
      let isDragging=false, prevX=0, prevY=0, rx=0, ry=0;

      card.addEventListener('mousedown', (e)=>{ e.preventDefault(); isDragging=true; prevX=e.clientX; prevY=e.clientY; inner.style.transition='none'; });
      document.addEventListener('mouseup', ()=>{ if(!isDragging) return; isDragging=false; inner.style.transition='transform 0.8s ease-out'; ry=Math.round(ry/180)*180; rx=0; inner.style.transform=`rotateY(${ry}deg) rotateX(${rx}deg)`; }, { passive:true });
      document.addEventListener('mousemove', (e)=>{ if(!isDragging) return; const dx=e.clientX-prevX, dy=e.clientY-prevY; ry+=dx*0.5; rx=Math.max(-20,Math.min(20,rx-dy*0.3)); if(ry>180) ry-=360; if(ry<-180) ry+=360; inner.style.transform=`rotateY(${ry}deg) rotateX(${rx}deg)`; prevX=e.clientX; prevY=e.clientY; });
      card.addEventListener('dblclick', ()=> card.classList.toggle('flipped'));
    }

    const MintOverlay = (() => {
      let overlay, slot, viewBtn, currentOnClose;

      function escHandler(e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          close(false);
        }
      }

      function close(openInventory) {
        if (!overlay) return;
        overlay.classList.remove('open');
        overlay.setAttribute('aria-hidden', 'true');
        document.removeEventListener('keydown', escHandler);
        if (slot) slot.innerHTML = '';
        const cb = currentOnClose;
        currentOnClose = null;
        if (openInventory && typeof cb === 'function') cb();
      }

      function ensureOverlay() {
        if (overlay) return overlay;
        overlay = document.createElement('div');
        overlay.id = 'mint-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.innerHTML = `
  <div class="mint-scrim" data-action="close"></div>
  <div class="mint-dialog" role="dialog" aria-modal="true" aria-label="New card minted">
    <h2 class="mint-title cozy-hand">Congratulations, you got a new card!</h2>
    <div class="mint-card-slot"></div>
    <div class="mint-actions">
      <button type="button" class="mint-primary" data-action="view">View in Inventory</button>
      <button type="button" class="mint-secondary" data-action="close">Keep Studying</button>
    </div>
  </div>
`;
        document.body.appendChild(overlay);
        slot = overlay.querySelector('.mint-card-slot');
        viewBtn = overlay.querySelector('[data-action="view"]');

        viewBtn?.addEventListener('click', (ev) => {
          ev.preventDefault();
          close(true);
        });

        overlay.querySelectorAll('[data-action="close"]').forEach((btn) => {
          btn.addEventListener('click', (ev) => {
            ev.preventDefault();
            close(false);
          });
        });

        return overlay;
      }

      function show(payload, { onClose } = {}) {
        ensureOverlay();
        currentOnClose = onClose;
        if (slot) {
          slot.innerHTML = renderBigCard(payload);
          const card = slot.querySelector('.id-card');
          if (card) {
            card.classList.add('mint-appear');
            attachInteractions(card);
          }
        }
        overlay.classList.add('open');
        overlay.setAttribute('aria-hidden', 'false');
        document.addEventListener('keydown', escHandler);
        viewBtn?.focus({ preventScroll: true });
      }

      function hide({ openInventory = false } = {}) {
        close(openInventory);
      }

      return { show, hide };
    })();
  
    function addCard(payload, { open } = {}){
      if (!payload || !payload.id) return;
      const owner = (getActiveEmail() || '');
      payload.ownerEmail = owner;
      cards.unshift(payload);
      save(cards);
      queueCloudPush();
      selectedId = String(payload.id);
      saveSelected(selectedId);
      render();
      setTimeout(scrollSelectedIntoView, 0);
      if (open) CardsPanel.open();
    }

    // Listen for new minted cards
    window.addEventListener('cards:new', (e) => {
      const payload = e.detail;
      addCard(payload, { open: false });
      MintOverlay.show(payload, { onClose: () => CardsPanel.open() });
    });
  
    // Panel controller (uses panel-registry)
    const controller = window.createPanelController({
      id: PANEL_ID,
      ensurePanel: () => ensurePanel(),
      getElement: () => panel,
      onOpen: () => {
        ensurePanel();
        panel.classList.add('open');
        panel.setAttribute('aria-hidden','false');
        render();
        requestAnimationFrame(() => {
          const sel = gridEl?.querySelector('.card-thumb.selected') || gridEl?.querySelector('.card-thumb');
          sel?.focus({ preventScroll: true });
        });
      },
      onClose: () => { if (!panel) return; panel.classList.remove('open'); panel.setAttribute('aria-hidden','true'); },
      ensureFab: ({ cluster, controller }) => {
        if (!cluster) return;
        let btn = cluster.querySelector('#cards-fab');
        if (!btn) {
          btn = document.createElement('button');
          btn.id = 'cards-fab';
          btn.type = 'button';
          btn.className = 'fab';
          btn.title = 'Card Collection';
          btn.setAttribute('aria-label','Open Card Collection');
          btn.textContent = '🎴';
          cluster.appendChild(btn);
        }
        if (!btn.dataset.panelWired) {
          btn.dataset.panelWired = 'true';
          btn.addEventListener('click', (ev)=>{ ev.preventDefault(); controller.toggle(); });
        }
      },
      transitionMs: 220
    });
  
    const CardsPanel = {
      ensurePanel: () => controller.ensurePanel?.(),
      ensureFab: () => controller.ensureFab?.(),
      open: (opts={}) => controller.open(opts),
      close: (opts={}) => controller.close(opts),
      toggle: () => controller.toggle()
    };
  
    // boot
    ensurePanel(); render(); CardsPanel.ensureFab?.();
    window.CardsPanel = CardsPanel;
  })();
