/*
  Study Timer Panel – dual-lane (Study + Recall) routine with to-do list
  Matches the YouTube panel shell for consistent in-app tooling.
*/

(function() {
  const TODO_STORAGE_KEY = 'studyTimer.todos';
  const PANEL_ID = 'study-timer';
  const CYCLE_TAGLINE = '30 min learn • 5 min recall • 10 min break';
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

  let panel;
  let startBtn, skipBtn, resetBtn, closeBtn;
  let countdownEl, phaseTitleEl, phaseSubtitleEl, phaseBadgeEl, phaseMetaEl, progressBarEl, cycleEl;
  let todoForm, todoInput, todoListEl, emptyStateEl;

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
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = `
        <header class="timer-topbar">
          <div class="timer-title">Study Timer</div>
          <div class="timer-actions">
            <button id="timer-reset" type="button">Reset Cycle</button>
            <button id="timer-close" class="timer-close" type="button" aria-label="Close study timer">✕</button>
          </div>
        </header>
        <main class="timer-main">
          <section class="timer-hero" aria-labelledby="timer-phase-title">
            <div class="timer-phase-meta">
              <span class="timer-phase-badge" id="timer-phase-badge"></span>
              <span id="timer-phase-meta" aria-live="polite"></span>
            </div>
            <div class="timer-phase-title" id="timer-phase-title"></div>
            <div class="timer-phase-subtitle" id="timer-phase-subtitle"></div>
            <div class="timer-countdown" id="timer-countdown" aria-live="assertive">30:00</div>
            <div class="timer-progress-track" role="presentation">
              <div class="timer-progress-bar" id="timer-progress-bar"></div>
            </div>
            <div class="timer-controls">
              <button id="timer-start" type="button">Start</button>
              <button id="timer-skip" type="button" class="secondary">Skip Phase</button>
            </div>
            <div class="timer-cycle" id="timer-cycle" aria-label="Timer cycle"></div>
          </section>
          <section class="timer-todo-section" aria-labelledby="timer-todo-title">
            <div class="timer-todo-header">
              <div class="timer-todo-title" id="timer-todo-title">Focus Plan</div>
            </div>
            <form class="timer-todo-form" id="timer-todo-form">
              <input id="timer-todo-input" type="text" autocomplete="off" placeholder="Add a task or intention..." aria-label="Add task" />
              <button type="submit">Add</button>
            </form>
            <div class="timer-todo-list" id="timer-todo-list" role="list"></div>
            <div class="timer-empty" id="timer-empty" role="status" hidden>No tasks yet. Sketch your focus plan.</div>
          </section>
        </main>
        <footer class="timer-footer">Dual-lane rhythm: ${CYCLE_TAGLINE}</footer>
      `;
      document.body.appendChild(el);
      panel = el;
    }

    cacheElements();
    wireEvents();
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

    document.addEventListener('keydown', handleGlobalKey, { passive: true });
  }

  function handleGlobalKey(event) {
    if (event.key === 'Escape' && panel?.classList.contains('open')) {
      TimerPanel.close();
    }
  }

  function buildCycle() {
    if (!cycleEl || cycleEl.childElementCount) return;
    PHASES.forEach((phase, index) => {
      const item = document.createElement('div');
      item.className = 'timer-cycle-item';
      item.dataset.phaseIndex = String(index);

      const title = document.createElement('div');
      title.className = 'timer-cycle-title';
      title.textContent = `${index + 1}. ${phase.shortLabel}`;

      const sub = document.createElement('div');
      sub.className = 'timer-cycle-duration';
      sub.textContent = `${minutesFor(phase.duration)} · ${phase.timeline}`;

      item.appendChild(title);
      item.appendChild(sub);
      cycleEl.appendChild(item);
    });
  }

  function updateCycleState() {
    if (!cycleEl) return;
    const items = cycleEl.querySelectorAll('.timer-cycle-item');
    const nextIndex = (currentPhaseIndex + 1) % PHASES.length;
    items.forEach((item) => {
      const idx = Number(item.dataset.phaseIndex || 0);
      if (idx === currentPhaseIndex) {
        item.dataset.state = 'active';
      } else if (idx === nextIndex) {
        item.dataset.state = 'upnext';
      } else {
        delete item.dataset.state;
      }
    });
  }

  function toggleTimer() {
    if (isRunning) pauseTimer();
    else startTimer();
  }

  function startTimer() {
    if (isRunning) return;
    isRunning = true;
    if (intervalId) clearInterval(intervalId);
    intervalId = window.setInterval(tick, 1000);
    updateTimerUI();
  }

  function pauseTimer() {
    if (!isRunning) return;
    isRunning = false;
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
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

  function advancePhase(keepRunning) {
    const resume = keepRunning === true;
    currentPhaseIndex = (currentPhaseIndex + 1) % PHASES.length;
    remainingSeconds = PHASES[currentPhaseIndex].duration;
    updateTimerUI();
    if (!resume) pauseTimer();
  }

  function tick() {
    if (!isRunning) return;
    remainingSeconds -= 1;
    if (remainingSeconds <= 0) {
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

    updateCycleState();
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
      item.className = 'timer-todo-item';
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

  const TimerPanel = {
    open(options = {}) {
      if (!options.fromManager && window.FloatingPanels?.open) {
        window.FloatingPanels.open(PANEL_ID);
        return;
      }
      openPanelInternal();
    },
    close(options = {}) {
      if (!panel) return;
      if (!options.fromManager && window.FloatingPanels?.close) {
        window.FloatingPanels.close(PANEL_ID);
        return;
      }
      closePanelInternal();
    },
    toggle() {
      const isOpen = panel?.classList.contains('open');
      if (isOpen) this.close();
      else this.open();
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
    }
  };

  window.TimerPanel = TimerPanel;
  window.Timer = Timer;

  window.FloatingPanels?.register(PANEL_ID, {
    open: () => openPanelInternal(),
    close: () => closePanelInternal(),
    getElement: () => panel || document.getElementById('timer-panel'),
    transitionMs: 220
  });
})();
