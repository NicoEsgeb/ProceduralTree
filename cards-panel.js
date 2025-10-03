(function(){
    const PANEL_ID = 'cards';
    const LS_KEY = 'CardInventory.v1';
    const LS_SELECTED = 'CardInventory.selectedId.v1';
  
    let panel, gridEl, emptyEl, closeBtn, viewerEl;
  
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
      closeBtn = panel.querySelector('#cards-close');
      closeBtn.addEventListener('click', () => CardsPanel.close());
      panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') CardsPanel.close(); });
      return panel;
    }
  
    function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
    function load(){ try { return JSON.parse(localStorage.getItem(LS_KEY))||[]; } catch(_) { return []; } }
    function save(list){ try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch(_) {} }
    function loadSelected(){ try { return localStorage.getItem(LS_SELECTED)||''; } catch(_) { return ''; } }
    function saveSelected(id){ try { localStorage.setItem(LS_SELECTED, id||''); } catch(_) {} }

    let cards = load();
    let selectedId = loadSelected();

    function render(){
      if (!gridEl || !viewerEl) return;
      emptyEl.style.display = cards.length ? 'none' : 'block';
      if (cards.length && !cards.some(c => String(c.id) === String(selectedId))) {
        selectedId = String(cards[0].id || '');
        saveSelected(selectedId);
      }
      renderGrid();
      renderViewer();
    }

    function renderBigCard(card){
      const title = escapeHtml(card.title || 'Study Session');
      const png = escapeHtml(card.png || '');
      const when = card.createdAt ? new Date(card.createdAt).toLocaleString() : '';
      const seed = escapeHtml(String(card.seed ?? ''));
      return `
        <article class="id-card" data-id="${escapeHtml(card.id||'')}" title="${title}" style="margin:12px auto">
          <div class="rotate-hint"><span class="arrow">↔</span>Drag to rotate • Double-click to flip</div>
          <div class="card-inner">
            <div class="card-front">
              <div class="character-container">
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
        const img = png ? `<img src="${png}" alt="${title} thumbnail" loading="lazy" />` : '';
        return `<button class="card-thumb${selected}" role="listitem" data-id="${id}" title="${title}">${img}</button>`;
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

    // Click → select card
    document.addEventListener('click', (e) => {
      const thumb = e.target.closest?.('.card-thumb');
      if (!thumb || !gridEl?.contains(thumb)) return;
      selectedId = thumb.getAttribute('data-id') || '';
      saveSelected(selectedId);
      // update selection highlight (cheap)
      gridEl.querySelectorAll('.card-thumb').forEach(el => el.classList.toggle('selected', el.getAttribute('data-id') === selectedId));
      renderViewer();
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
  
    function addCard(payload, { open } = {}){
      if (!payload || !payload.id) return;
      cards.unshift(payload);
      save(cards);
      selectedId = String(payload.id);
      saveSelected(selectedId);
      render();
      if (open) CardsPanel.open();
    }
  
    // Listen for new minted cards
    window.addEventListener('cards:new', (e) => addCard(e.detail, { open: true }));
  
    // Panel controller (uses panel-registry)
    const controller = window.createPanelController({
      id: PANEL_ID,
      ensurePanel: () => ensurePanel(),
      getElement: () => panel,
      onOpen: () => { ensurePanel(); panel.classList.add('open'); panel.setAttribute('aria-hidden','false'); render(); },
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