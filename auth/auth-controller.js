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
      } catch {}
    });
    try {
      localStorage.setItem('ClickTreeAccount', JSON.stringify({
        user: state.user,
        lastSyncAt: state.lastSyncAt
      }));
    } catch {}
  }
  
  export async function initializeAuth() {
    try {
      const raw = localStorage.getItem('ClickTreeAccount');
      if (raw) {
        const saved = JSON.parse(raw);
        state.user = saved.user || null;
        state.lastSyncAt = saved.lastSyncAt || null;
      }
    } catch {}
    emit();
  }
  
  export function subscribe(fn) {
    if (typeof fn === 'function') {
      listeners.add(fn);
      try {
        fn({ ...state });
      } catch {}
    }
    return () => listeners.delete(fn);
  }
  
  export async function signInWithGoogle() {
    state.isAuthenticating = true;
    state.lastError = null;
    emit();
    await new Promise(r => setTimeout(r, 400));
    // Fake a user for now; Step 2 will replace this with real Google OAuth.
    state.user = { email: 'you@example.com' };
    state.isAuthenticating = false;
    emit();
  }
  
  export async function signOut() {
    state.isAuthenticating = true;
    emit();
    await new Promise(r => setTimeout(r, 200));
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