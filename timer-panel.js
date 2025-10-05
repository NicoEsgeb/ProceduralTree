/*
  Study Timer Panel – dual-lane (Study + Recall) routine with to-do list
  Matches the YouTube panel shell for consistent in-app tooling.
*/

(function() {
  const TODO_STORAGE_KEY = 'studyTimer.todos';
  const TITLE_STORAGE_KEY = 'studyTimer.sessionTitle';
  const PANEL_ID = 'study-timer';
  const CYCLE_TAGLINE = '30 min learn • 5 min recall • 10 min break';
  const DEV_MODE_KEY = 'studyTimer.devMode';
  const DEV_SECONDS = 5;
  function isDevMode() {
    try { return localStorage.getItem(DEV_MODE_KEY) === '1'; } catch (_) { return false; }
  }
  const PHASES = [
    {
      id: 'learn',
      label: 'Focus Session',
      shortLabel: 'Learn',
      description: 'Deep work to absorb and explore new material.',
      timeline: 'Deep work focus',
      duration: 30 * 60
    },
    {
      id: 'recall',
      label: 'Active Recall',
      shortLabel: 'Recall',
      description: 'Summarise, annotate, and write what you just learned.',
      timeline: 'Notes + reflection',
      duration: 5 * 60
    },
    {
      id: 'break',
      label: 'Recharge',
      shortLabel: 'Break',
      description: 'Step away, hydrate, stretch, and reset your focus.',
      timeline: 'Mindful reset',
      duration: 10 * 60
    }
  ];

  function applyDevDurations() {
    const dev = isDevMode();
    PHASES.forEach((p) => {
      if (dev) {
        p.duration = DEV_SECONDS; // 5s for focus/recall/break while testing
      } else {
        // restore intended defaults
        if (p.id === 'learn')  p.duration = 30 * 60;
        if (p.id === 'recall') p.duration = 5 * 60;
        if (p.id === 'break')  p.duration = 10 * 60;
      }
    });
  }
  applyDevDurations();

  let panel;
  let startBtn, skipBtn, resetBtn, closeBtn;
  let countdownEl, phaseTitleEl, phaseSubtitleEl, phaseBadgeEl, phaseMetaEl, progressBarEl, cycleEl;
  let todoForm, todoInput, todoListEl, emptyStateEl;
  let sessionTitleInput;

  let todos = [];
  let intervalId = null;
  let isRunning = false;
  let currentPhaseIndex = 0;
  let remainingSeconds = PHASES[0].duration;

  function ensurePanel() {
    if (panel) return panel;
    panel = document.getElementById('timer-panel');
    if (!panel) {
      const el = document.createElement('aside');
      el.id = 'timer-panel';
      el.classList.add('panel-shell', 'account-panel');
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = `
        <header class="panel-topbar account-topbar">
          <div class="timer-title">Study Timer</div>
          <div class="timer-actions">
            <button id="timer-reset" class="account-tertiary-btn" type="button">Reset Cycle</button>
            <button id="timer-close" class="account-close" type="button" aria-label="Close study timer">✕</button>
          </div>
        </header>
        <main class="panel-content account-main">
          <div class="account-stack">
            <section class="timer-hero account-card account-card-cozy" aria-labelledby="timer-phase-title">
              <div class="account-profile-hero timer-focus-hero">
                <div class="timer-phase-meta">
                  <span class="timer-phase-badge account-pill" id="timer-phase-badge"></span>
                  <span id="timer-phase-meta" aria-live="polite"></span>
                </div>
                <div class="timer-phase-title" id="timer-phase-title"></div>
                <div class="timer-phase-subtitle" id="timer-phase-subtitle"></div>
                <div class="timer-countdown" id="timer-countdown" aria-live="assertive">30:00</div>
                <div class="timer-progress-track" role="presentation">
                  <div class="timer-progress-bar" id="timer-progress-bar"></div>
                </div>
                <div class="timer-session-row">
                  <input id="timer-session-title" type="text" maxlength="80"
                         placeholder="Name this session (e.g., 'CNF practice')"
                         aria-label="Study session title" />
                </div>
              </div>
              <div class="timer-controls">
                <button id="timer-start" class="account-primary-btn" type="button">Start</button>
                <button id="timer-skip" class="account-tertiary-btn" type="button">Skip Phase</button>
              </div>
              <div class="timer-cycle-block account-badges-block">
                <h4 class="account-section-title">Study Phase</h4>
                <div class="timer-cycle account-badges" id="timer-cycle" role="list" aria-label="Study phases"></div>
              </div>
            </section>
            <section class="timer-todo-section account-card account-card-cozy" aria-labelledby="timer-todo-title">
              <div class="timer-todo-header">
                <div class="timer-todo-title" id="timer-todo-title">Focus Plan</div>
              </div>
              <form class="timer-todo-form" id="timer-todo-form">
                <input id="timer-todo-input" type="text" autocomplete="off" placeholder="Add a task or intention..." aria-label="Add task" />
                <button type="submit" class="account-primary-btn">Add</button>
              </form>
              <div class="timer-todo-list" id="timer-todo-list" role="list"></div>
              <div class="timer-empty" id="timer-empty" role="status" hidden>No tasks yet. Sketch your focus plan.</div>
            </section>
          </div>
        </main>
        <footer class="account-footnote timer-footer">Dual-lane rhythm: ${CYCLE_TAGLINE}</footer>
      `;
      document.body.appendChild(el);
      panel = el;
    } else {
      if (!panel.classList.contains('panel-shell')) {
        panel.classList.add('panel-shell');
      }
      if (!panel.classList.contains('account-panel')) {
        panel.classList.add('account-panel');
      }

      const header = panel.querySelector('header');
      if (header) {
        header.classList.remove('timer-topbar');
        header.classList.add('panel-topbar', 'account-topbar');
      }

      const mainSection = panel.querySelector('main');
      if (mainSection) {
        mainSection.classList.remove('timer-main');
        mainSection.classList.add('panel-content', 'account-main');

        let stack = mainSection.querySelector('.account-stack');
        if (!stack) {
          stack = document.createElement('div');
          stack.classList.add('account-stack');
          const sections = Array.from(mainSection.querySelectorAll('section'));
          sections.forEach((section) => stack.appendChild(section));
          mainSection.insertBefore(stack, mainSection.firstChild);
        }

        const heroSection = mainSection.querySelector('.timer-hero');
        if (heroSection) {
          heroSection.classList.add('account-card', 'account-card-cozy');
          const badge = heroSection.querySelector('#timer-phase-badge');
          badge?.classList.add('account-pill');

          let focusShell = heroSection.querySelector('.timer-focus-hero');
          if (!focusShell) {
            focusShell = document.createElement('div');
            focusShell.classList.add('account-profile-hero', 'timer-focus-hero');
            const insertionPoint = heroSection.querySelector('.timer-phase-meta') || heroSection.firstChild;
            heroSection.insertBefore(focusShell, insertionPoint);

            const wrapSelectors = [
              '.timer-phase-meta',
              '.timer-phase-title',
              '.timer-phase-subtitle',
              '.timer-countdown',
              '.timer-progress-track',
              '.timer-session-row'
            ];
            wrapSelectors.forEach((selector) => {
              const node = heroSection.querySelector(selector);
              if (node && node !== focusShell) {
                focusShell.appendChild(node);
              }
            });
          } else {
            focusShell.classList.add('account-profile-hero');
          }
        }

        const todoSection = mainSection.querySelector('.timer-todo-section');
        if (todoSection) {
          todoSection.classList.add('account-card', 'account-card-cozy');
        }
      }

      const footer = panel.querySelector('footer');
      if (footer) {
        footer.classList.add('account-footnote', 'timer-footer');
      }

      const resetButton = panel.querySelector('#timer-reset');
      resetButton?.classList.add('account-tertiary-btn');

      const closeButton = panel.querySelector('#timer-close');
      if (closeButton) {
        closeButton.classList.remove('timer-close');
        closeButton.classList.add('account-close');
      }

      const startButton = panel.querySelector('#timer-start');
      if (startButton) {
        startButton.classList.add('account-primary-btn');
      }

      const skipButton = panel.querySelector('#timer-skip');
      if (skipButton) {
        skipButton.classList.remove('secondary');
        skipButton.classList.add('account-tertiary-btn');
      }

      const addTodoButton = panel.querySelector('#timer-todo-form button[type="submit"]');
      if (addTodoButton) {
        addTodoButton.classList.add('account-primary-btn');
      }

      const cycleElExisting = panel.querySelector('#timer-cycle');
      if (cycleElExisting) {
        cycleElExisting.classList.add('timer-cycle', 'account-badges');
        cycleElExisting.setAttribute('role', 'list');
        cycleElExisting.setAttribute('aria-label', 'Study phases');

        let cycleBlock = cycleElExisting.closest('.timer-cycle-block');
        if (!cycleBlock) {
          cycleBlock = document.createElement('div');
          cycleBlock.classList.add('timer-cycle-block', 'account-badges-block');
          const heading = document.createElement('h4');
          heading.classList.add('account-section-title');
          heading.textContent = 'Study Phase';
          cycleBlock.appendChild(heading);
          cycleElExisting.parentElement?.insertBefore(cycleBlock, cycleElExisting);
          cycleBlock.appendChild(cycleElExisting);
        } else {
          cycleBlock.classList.add('account-badges-block');
          const heading = cycleBlock.querySelector('.account-section-title');
          if (heading) heading.textContent = 'Study Phase';
          else {
            const newHeading = document.createElement('h4');
            newHeading.classList.add('account-section-title');
            newHeading.textContent = 'Study Phase';
            cycleBlock.insertBefore(newHeading, cycleBlock.firstChild);
          }
        }

        const hasModernItems = cycleElExisting.querySelector('.account-badge');
        if (!hasModernItems) {
          cycleElExisting.innerHTML = '';
        } else {
          cycleElExisting.querySelectorAll('.timer-cycle-item').forEach((item) => {
            item.classList.add('account-badge', 'timer-cycle-item');
            item.classList.remove('account-card', 'account-card-cozy');
            item.setAttribute('role', 'listitem');
            if (!item.querySelector('.account-badge-state')) {
              const stateSpan = document.createElement('span');
              stateSpan.classList.add('account-badge-state', 'timer-cycle-state');
              item.appendChild(stateSpan);
            }
          });
        }
      }

      panel.querySelectorAll('.timer-todo-item').forEach((item) => {
        item.classList.add('account-card', 'account-card-cozy');
      });
    }

    cacheElements();
    wireEvents();
    hydrateSessionTitle();
    hydrateTodos();
    buildCycle();
    updateTimerUI();
    return panel;
  }

  function cacheElements() {
    startBtn = panel.querySelector('#timer-start');
    skipBtn = panel.querySelector('#timer-skip');
    resetBtn = panel.querySelector('#timer-reset');
    closeBtn = panel.querySelector('#timer-close');
    countdownEl = panel.querySelector('#timer-countdown');
    phaseTitleEl = panel.querySelector('#timer-phase-title');
    phaseSubtitleEl = panel.querySelector('#timer-phase-subtitle');
    phaseBadgeEl = panel.querySelector('#timer-phase-badge');
    phaseMetaEl = panel.querySelector('#timer-phase-meta');
    progressBarEl = panel.querySelector('#timer-progress-bar');
    cycleEl = panel.querySelector('#timer-cycle');
    todoForm = panel.querySelector('#timer-todo-form');
    todoInput = panel.querySelector('#timer-todo-input');
    todoListEl = panel.querySelector('#timer-todo-list');
    emptyStateEl = panel.querySelector('#timer-empty');
    sessionTitleInput = panel.querySelector('#timer-session-title');

    phaseTitleEl?.classList.add('cozy-hand');
  }

  function wireEvents() {
    if (!panel) return;
    startBtn?.addEventListener('click', toggleTimer);
    skipBtn?.addEventListener('click', () => advancePhase(isRunning));
    resetBtn?.addEventListener('click', resetCycle);
    closeBtn?.addEventListener('click', () => TimerPanel.close());

    todoForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = todoInput?.value?.trim();
      if (!value) return;
      addTodo(value);
      if (todoInput) {
        todoInput.value = '';
        todoInput.focus();
      }
    });

    todoListEl?.addEventListener('change', (event) => {
      const checkbox = event.target;
      if (!(checkbox instanceof HTMLInputElement) || checkbox.type !== 'checkbox') return;
      const item = checkbox.closest('.timer-todo-item');
      if (!item) return;
      const id = item.dataset.id;
      if (!id) return;
      toggleTodo(id, checkbox.checked);
    });

    todoListEl?.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const btn = target.closest('.timer-todo-delete');
      if (!btn) return;
      const item = btn.closest('.timer-todo-item');
      if (!item) return;
      const id = item.dataset.id;
      if (!id) return;
      removeTodo(id);
    });

    sessionTitleInput?.addEventListener('input', handleSessionTitleInput);

    document.addEventListener('keydown', handleGlobalKey, { passive: true });
  }

  function handleSessionTitleInput() {
    const value = sessionTitleInput?.value ?? '';
    persistSessionTitle(value);
    sessionTitleInput?.classList.remove('needs-title');
    refreshStartGuard();
  }

  function handleGlobalKey(event) {
    if (event.key === 'Escape' && panel?.classList.contains('open')) {
      TimerPanel.close();
    }
  }

  function buildCycle() {
    if (!cycleEl || cycleEl.childElementCount) return;
    cycleEl.classList.add('timer-cycle', 'account-badges');
    cycleEl.setAttribute('role', 'list');
    cycleEl.setAttribute('aria-label', 'Study phases');
    PHASES.forEach((phase, index) => {
      const item = document.createElement('div');
      item.className = 'account-badge timer-cycle-item';
      item.dataset.phaseIndex = String(index);
      item.setAttribute('role', 'listitem');

      const icon = document.createElement('span');
      icon.className = 'account-badge-icon timer-cycle-icon';
      icon.textContent = String(index + 1);

      const info = document.createElement('div');
      info.className = 'account-badge-info';

      const title = document.createElement('span');
      title.className = 'account-badge-title timer-cycle-title';
      title.textContent = phase.label;

      const sub = document.createElement('span');
      sub.className = 'account-badge-desc timer-cycle-duration';
      sub.textContent = `${minutesFor(phase.duration)} · ${phase.timeline}`;

      info.appendChild(title);
      info.appendChild(sub);

      const state = document.createElement('span');
      state.className = 'account-badge-state timer-cycle-state';
      state.textContent = 'Ready';

      item.appendChild(icon);
      item.appendChild(info);
      item.appendChild(state);
      cycleEl.appendChild(item);
    });
  }

  function updateCycleState() {
    if (!cycleEl) return;
    const items = cycleEl.querySelectorAll('.timer-cycle-item');
    const nextIndex = (currentPhaseIndex + 1) % PHASES.length;
    items.forEach((item) => {
      const idx = Number(item.dataset.phaseIndex || 0);
      const stateLabel = item.querySelector('.timer-cycle-state');
      if (idx === currentPhaseIndex) {
        item.dataset.state = 'active';
        if (stateLabel) stateLabel.textContent = 'Now';
      } else if (idx === nextIndex) {
        item.dataset.state = 'upnext';
        if (stateLabel) stateLabel.textContent = 'Up next';
      } else {
        delete item.dataset.state;
        if (stateLabel) stateLabel.textContent = 'Ready';
      }
    });
  }

  function toggleTimer() {
    if (isRunning) pauseTimer();
    else startTimer();
  }

  function emitTimerEvent(name, detail = {}) {
    try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch (_) {}
  }

  function startTimer() {
    if (isRunning) return;
    if (requiresSessionTitle()) {
      sessionTitleInput?.focus();
      sessionTitleInput?.classList.add('needs-title');
      refreshStartGuard();
      return;
    }

    // If we're sitting at the end of Break (cycle finished), reset to Learn
    if (currentPhaseIndex === PHASES.length - 1 && remainingSeconds <= 0) {
      currentPhaseIndex = 0;
      remainingSeconds = PHASES[0].duration;
      updateTimerUI();
    }

    isRunning = true;
    if (intervalId) clearInterval(intervalId);
    intervalId = window.setInterval(tick, 1000);

    // Notify listeners when a Focus (learn) session actually starts/resumes
    const phase = PHASES[currentPhaseIndex];
    if (phase?.id === 'learn') {
      const title = readSessionTitle();
      const isResume = remainingSeconds < phase.duration;
      const evtName = isResume ? 'study:focus-resume' : 'study:focus-start';
      emitTimerEvent(evtName, { durationSec: remainingSeconds, title });
    }
    updateTimerUI();
  }

  function pauseTimer() {
    if (!isRunning) return;
    isRunning = false;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    // Pause notification (only relevant to Focus phase)
    const phase = PHASES[currentPhaseIndex];
    if (phase?.id === 'learn') {
      emitTimerEvent('study:focus-pause', { remainingSec: remainingSeconds, title: readSessionTitle() });
    }
    updateTimerUI();
  }

  function resetCycle() {
    const wasRunning = isRunning;
    pauseTimer();
    currentPhaseIndex = 0;
    remainingSeconds = PHASES[0].duration;
    updateTimerUI();
    if (wasRunning) startTimer();
  }

  // Stop advancing after the final phase; do NOT wrap to 0
  function advancePhase(keepRunning) {
    const resume = keepRunning === true;
    const prev = PHASES[currentPhaseIndex];
    const nextIndex = currentPhaseIndex + 1;

    // If we just left Focus, announce completion of the growth phase
    if (prev?.id === 'learn') {
      emitTimerEvent('study:focus-complete', { title: readSessionTitle() });
    }

    // If we've finished the last phase (Break), stop and announce cycle completion
    if (nextIndex >= PHASES.length) {
      pauseTimer();
      emitTimerEvent('study:cycle-complete', { title: readSessionTitle() });
      currentPhaseIndex = 0;
      remainingSeconds = PHASES[0].duration;
      updateTimerUI();
      return;
    }

    // Otherwise, move to the next phase
    currentPhaseIndex = nextIndex;
    remainingSeconds = PHASES[currentPhaseIndex].duration;
    updateTimerUI();

    if (!resume) pauseTimer();
  }

  function tick() {
    if (!isRunning) return;
    remainingSeconds -= 1;
    if (remainingSeconds <= 0) {
      // Advance, but do not wrap. If it's the last phase, advancePhase will stop.
      advancePhase(true);
    } else {
      updateTimerUI();
    }
  }

  function updateTimerUI() {
    const phase = PHASES[currentPhaseIndex];
    phaseBadgeEl.textContent = phase.shortLabel;
    phaseTitleEl.textContent = phase.label;
    phaseSubtitleEl.textContent = phase.description;
    phaseMetaEl.textContent = `Phase ${currentPhaseIndex + 1} of ${PHASES.length} · ${CYCLE_TAGLINE}`;
    countdownEl.textContent = formatTime(Math.max(0, remainingSeconds));

    const progress = 1 - (remainingSeconds / phase.duration);
    const clamped = Math.min(Math.max(progress, 0), 1);
    progressBarEl.style.width = `${clamped * 100}%`;

    startBtn.textContent = isRunning ? 'Pause' : 'Start';
    startBtn.setAttribute('aria-pressed', isRunning ? 'true' : 'false');
    refreshStartGuard();

    updateCycleState();
  }

  function refreshStartGuard() {
    if (!startBtn) return;
    startBtn.disabled = !!requiresSessionTitle();
  }

  function minutesFor(seconds) {
    return `${Math.round(seconds / 60)} min`;
  }

  function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${pad(minutes)}:${pad(seconds)}`;
  }

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function hydrateTodos() {
    let stored = [];
    try {
      const raw = localStorage.getItem(TODO_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          stored = parsed.filter(item => item && typeof item.text === 'string');
        }
      }
    } catch (_err) {
      stored = [];
    }
    todos = stored.map((item) => ({
      id: String(item.id ?? cryptoRandom()),
      text: item.text,
      done: !!item.done
    }));
    renderTodos();
  }

  function cryptoRandom() {
    try {
      return crypto.randomUUID();
    } catch (_err) {
      return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
  }

  function persistTodos() {
    try {
      localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(todos));
    } catch (_err) {
      // ignore persistence issues
    }
  }

  function addTodo(text) {
    const trimmed = text.trim();
    if (!trimmed) return;
    todos.push({ id: cryptoRandom(), text: trimmed, done: false });
    renderTodos();
    persistTodos();
  }

  function toggleTodo(id, complete) {
    const target = todos.find((todo) => todo.id === id);
    if (!target) return;
    target.done = complete;
    renderTodos();
    persistTodos();
  }

  function removeTodo(id) {
    todos = todos.filter((todo) => todo.id !== id);
    renderTodos();
    persistTodos();
  }

  function renderTodos() {
    if (!todoListEl) return;
    todoListEl.innerHTML = '';
    if (!todos.length) {
      if (emptyStateEl) emptyStateEl.hidden = false;
      return;
    }
    if (emptyStateEl) emptyStateEl.hidden = true;

    todos.forEach((todo) => {
      const item = document.createElement('div');
      item.className = 'timer-todo-item account-card account-card-cozy';
      item.dataset.id = todo.id;
      item.dataset.complete = todo.done ? 'true' : 'false';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'timer-todo-checkbox';
      checkbox.checked = !!todo.done;
      checkbox.setAttribute('aria-label', todo.done ? 'Mark task as not done' : 'Mark task as done');

      const text = document.createElement('div');
      text.className = 'timer-todo-text';
      text.textContent = todo.text;

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'timer-todo-delete';
      deleteBtn.setAttribute('aria-label', 'Delete task');
      deleteBtn.textContent = '✕';

      item.appendChild(checkbox);
      item.appendChild(text);
      item.appendChild(deleteBtn);
      todoListEl.appendChild(item);
    });
  }

  function openPanelInternal() {
    ensurePanel();
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    updateTimerUI();
    requestAnimationFrame(() => {
      if (startBtn && panel.classList.contains('open')) startBtn.focus({ preventScroll: true });
    });
  }

  function closePanelInternal() {
    if (!panel) return;
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
  }

  const timerController = window.createPanelController({
    id: PANEL_ID,
    ensurePanel: () => ensurePanel(),
    getElement: () => panel || document.getElementById('timer-panel'),
    onOpen: () => openPanelInternal(),
    onClose: () => closePanelInternal(),
    ensureFab: ({ cluster, controller }) => {
      if (!cluster) return;
      let btn = cluster.querySelector('#timer-fab');
      if (!btn) {
        btn = document.createElement('button');
        btn.id = 'timer-fab';
        btn.type = 'button';
        btn.classList.add('fab');
        btn.title = 'Study Timer';
        btn.setAttribute('aria-label', 'Open Study Timer panel');
        btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 1h-6v2h6V1zm-2 15h-2V9h2v7zm7-5c0 4.97-4.03 9-9 9s-9-4.03-9-9c0-4.62 3.5-8.44 8-8.94V4h2V2.06c4.5.5 8 4.32 8 8.94zm-2 0c0-3.86-3.14-7-7-7s-7 3.14-7 7 3.14 7 7 7 7-3.14 7-7z"/></svg>';
        cluster.appendChild(btn);
      } else {
        btn.type = 'button';
        btn.classList.add('fab');
        btn.title = btn.title || 'Study Timer';
        btn.setAttribute('aria-label', btn.getAttribute('aria-label') || 'Open Study Timer panel');
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

  window.addEventListener('devmode:change', () => {
    const wasRunning = isRunning;
    pauseTimer();
    applyDevDurations();
    currentPhaseIndex = 0;
    remainingSeconds = PHASES[0].duration;
    updateTimerUI();
    if (wasRunning) startTimer();
  });

  const TimerPanel = {
    ensurePanel: () => timerController.ensurePanel(),
    ensureFab: () => timerController.ensureFab?.(),
    open(options = {}) {
      timerController.open(options);
    },
    close(options = {}) {
      timerController.close(options);
    },
    toggle() {
      timerController.toggle();
    }
  };

  const Timer = {
    getPhase() {
      const current = PHASES[currentPhaseIndex] || PHASES[0];
      const phaseMap = {
        learn: 'Focus',
        recall: 'Recall',
        break: 'Break'
      };
      return {
        phase: phaseMap[current.id] || current.label || 'Focus',
        remainingMs: Math.max(0, remainingSeconds * 1000)
      };
    },
    getSessionTitle() {
      return readSessionTitle();
    }
  };

  function hydrateSessionTitle() {
    if (!sessionTitleInput) return;
    try {
      const stored = localStorage.getItem(TITLE_STORAGE_KEY);
      if (typeof stored === 'string') {
        sessionTitleInput.value = stored;
      }
    } catch (_err) {
      // ignore
    }
    sessionTitleInput.classList.remove('needs-title');
    refreshStartGuard();
  }

  function persistSessionTitle(value) {
    try {
      localStorage.setItem(TITLE_STORAGE_KEY, value);
    } catch (_err) {
      // ignore persistence issues
    }
  }

  function readSessionTitle() {
    return (sessionTitleInput?.value || '').trim();
  }

  function requiresSessionTitle() {
    const phase = PHASES[currentPhaseIndex];
    return !isRunning && phase?.id === 'learn' && remainingSeconds === phase.duration && !readSessionTitle();
  }

  window.TimerPanel = TimerPanel;
  window.Timer = Timer;

  timerController.ensureFab?.();
})();
