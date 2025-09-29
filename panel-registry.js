/*
  FloatingPanels registry
  Keeps slide-in utility panels mutually exclusive and coordinates transitions.
*/

(function() {
  const DEFAULT_TRANSITION_MS = 260;
  const registry = new Map();
  let activeId = null;
  let pendingOpen = null; // { token, id }

  function safeCall(fn, payload) {
    if (typeof fn !== 'function') return;
    try {
      fn(payload);
    } catch (err) {
      console.error('FloatingPanels handler failed', err);
    }
  }

  function waitForClose(entry, elementHint) {
    const getEl = entry && typeof entry.getElement === 'function' ? entry.getElement : null;
    const el = elementHint || (getEl ? getEl() : null);
    const hasTransition = entry && typeof entry.transitionMs === 'number';
    const duration = hasTransition ? entry.transitionMs : DEFAULT_TRANSITION_MS;

    return new Promise((resolve) => {
      if (!el) {
        window.setTimeout(resolve, duration);
        return;
      }

      let resolved = false;
      const cleanup = () => {
        if (resolved) return;
        resolved = true;
        window.clearTimeout(timerId);
        el.removeEventListener('transitionend', onTransitionEnd);
        resolve();
      };

      const onTransitionEnd = (event) => {
        if (event.target !== el) return;
        if (event.propertyName && event.propertyName !== 'transform') return;
        cleanup();
      };

      const timerId = window.setTimeout(cleanup, duration + 80);
      el.addEventListener('transitionend', onTransitionEnd);
    });
  }

  const FloatingPanels = {
    register(id, handlers = {}) {
      if (!id || typeof id !== 'string') return;
      registry.set(id, {
        transitionMs: DEFAULT_TRANSITION_MS,
        ...handlers
      });
    },
    unregister(id) {
      if (!id) return;
      registry.delete(id);
      if (activeId === id) activeId = null;
      if (pendingOpen && pendingOpen.id === id) pendingOpen = null;
    },
    open(id) {
      const entry = registry.get(id);
      if (!entry) return;

      const token = Symbol('panel-open');
      pendingOpen = { token, id };

      if (activeId === id) {
        pendingOpen = null;
        safeCall(entry.open, { fromManager: true });
        return;
      }

      const prevId = activeId;
      const prevEntry = prevId ? registry.get(prevId) : null;

      const proceed = () => {
        if (!pendingOpen || pendingOpen.token !== token || pendingOpen.id !== id) return;
        pendingOpen = null;
        activeId = id;
        safeCall(entry.open, { fromManager: true });
      };

      if (prevEntry) {
        activeId = null;
        const prevElement = typeof prevEntry.getElement === 'function' ? prevEntry.getElement() : null;
        const wasOpen = !!(prevElement && prevElement.classList && prevElement.classList.contains('open'));
        safeCall(prevEntry.close, { fromManager: true });
        if (wasOpen) {
          waitForClose(prevEntry, prevElement).then(proceed);
        } else {
          proceed();
        }
      } else {
        proceed();
      }
    },
    close(id) {
      const entry = registry.get(id);
      if (!entry) return;
      if (pendingOpen && pendingOpen.id === id) {
        pendingOpen = null;
      }
      if (activeId === id) {
        activeId = null;
      }
      safeCall(entry.close, { fromManager: true });
    },
    closeActive() {
      if (activeId) this.close(activeId);
    },
    notifyClosed(id) {
      if (activeId === id) activeId = null;
      if (pendingOpen && pendingOpen.id === id) pendingOpen = null;
    },
    getActive() {
      return activeId;
    }
  };

  window.FloatingPanels = FloatingPanels;
})();
