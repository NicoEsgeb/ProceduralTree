// auth/auth-controller.js
let state = {
    user: null,
    isAuthenticating: false,
    isSyncing: false,
    lastError: null,
    supabaseError: null,
    lastSyncAt: null
  };
  const listeners = new Set();
  
  function emit() {
    const snapshot = { ...state };
    listeners.forEach(fn => {
      try {
        fn(snapshot);
    } catch (error) {
        console.warn('ClickTree auth listener failed', error);
      }
    });
    try {
      localStorage.setItem('ClickTreeAccount', JSON.stringify({
        user: state.user,
        lastSyncAt: state.lastSyncAt
      }));
    } catch (error) {
        console.warn('ClickTree auth state could not be saved', error);
      }
  }
  
  export async function initializeAuth() {
    try {
      const raw = localStorage.getItem('ClickTreeAccount');
      if (raw) {
        const saved = JSON.parse(raw);
        state.user = saved.user || null;
        state.lastSyncAt = saved.lastSyncAt || null;
      }
    } catch (error) {
        console.warn('ClickTree auth state could not be restored', error);
      }
    emit();
  }
  
  export function subscribe(fn) {
    if (typeof fn === 'function') {
      listeners.add(fn);
      try {
        fn({ ...state });
    } catch (error) {
        console.warn('ClickTree auth subscriber rejected initial state', error);
      }
    }
    return () => listeners.delete(fn);
  }
  
  export async function signInWithGoogle() {
    state.isAuthenticating = true;
    state.lastError = null;
    emit();
    try {
      const result = await window.clickTreeAPI?.googleLogin?.();
      if (!result?.ok) throw new Error(result?.error || 'login-failed');
      state.user = result.user || null;
    } catch (err) {
      state.lastError = err;
    } finally {
      state.isAuthenticating = false;
      emit();
    }
  }
  
  export async function signOut() {
    state.isAuthenticating = true;
    emit();
    try {
      await window.clickTreeAPI?.googleLogout?.();
    } catch (_) {}
    state.user = null;
    state.isAuthenticating = false;
    emit();
  }
  
  export async function syncNow() {
    if (!state.user) return;
    state.isSyncing = true;
    emit();
    await new Promise(r => setTimeout(r, 300));
    state.lastSyncAt = new Date().toISOString();
    state.isSyncing = false;
    emit();
  }
  
  export function getLastSyncAt() {
    return state.lastSyncAt || null;
  }