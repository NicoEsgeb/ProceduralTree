import { initializeAuth, subscribe, signInWithGoogle, signOut, syncNow, getLastSyncAt } from './auth-controller.js';

const PANEL_ID = 'auth-panel';

let panel;
let closeBtn;
let signedOutSection;
let signedInSection;
let signInBtn;
let signOutBtn;
let syncBtn;
let emailEl;
let avatarEl;
let syncStatusEl;
let syncPillEl;
let errorEl;
let configNoticeEl;
let fabBtn;
let fabObserver = null;
let currentState = null;
let supabaseHintShown = false;
let openFallbackTimer = null;
let registeredWithManager = false;

function updateFabVisual(user) {
  const btn = fabBtn || document.getElementById('account-fab');
  if (!btn) return;
  const email = user?.email || '';
  const initial = email ? email.trim().charAt(0).toUpperCase() : '👤';
  btn.textContent = initial || '👤';
  btn.dataset.signedIn = user ? 'true' : 'false';
  btn.title = user ? `Profile (${email})` : 'Profile';
  btn.setAttribute('aria-label', btn.title);
}

function friendlyAuthErrorMessage(error, supabaseError) {
  const relevantError = error || supabaseError;
  const raw = relevantError?.message || '';

  if (supabaseError) {
    const lowered = raw.toLowerCase();
    const setupHints = ['supabase', 'auth config', 'credentials', 'bridge'];
    if (!raw || setupHints.some((hint) => lowered.includes(hint))) {
      return 'Cloud sync is still getting ready. You can keep saving presets locally and try signing in again soon.';
    }
  }

  if (!error || (supabaseError && error === supabaseError)) {
    return '';
  }

  
  if (!raw) {
    return 'Something went wrong. Please try again.';
  }
  if (/cancel/i.test(raw) || /closed by user/i.test(raw) || /popup/i.test(raw)) {
    return 'Sign-in was cancelled before it finished.';
  }
  if (/timeout/i.test(raw) || /timed out/i.test(raw)) {
    return 'That took a bit too long. Please try again.';
  }
  if (/network|connection|fetch/i.test(raw)) {
    return "We couldn't reach the sync service. Please check your connection and try again.";
  }
  if (/redirect_uri_mismatch/i.test(raw)) {
    return 'Your OAuth client is not a Desktop app or the redirect doesn’t match. Create an OAuth "Desktop app" client in Google Cloud and paste its Client ID into google-oauth.json.';
  }
  if (/invalid_client/i.test(raw)) {
    return 'Invalid Google client ID. Double-check google-oauth.json.';
  }
  if (/invalid_grant/i.test(raw)) {
    return 'Google rejected the one-time code (often code_verifier mismatch or reusing an old code). Try sign-in again.';
  }
  return "We couldn't finish that request. Please try again.";
}

function noteSupabaseSetupIssue(error) {
  if (!error) return;
  if (!supabaseHintShown) {
    supabaseHintShown = true;
    console.info('Cloud sync setup hint: add your Supabase credentials to config/auth.json.', error);
  }
}

function ensurePanel() {
  if (panel) return panel;

  panel = document.createElement('aside');
  panel.id = PANEL_ID;
  panel.className = 'panel-shell account-panel';
  panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML = `
    <header class="panel-topbar account-topbar">
      <div class="account-title">
        <span class="account-emblem">🌿</span>
        <span>Account</span>
      </div>
      <button id="account-close" class="account-close" type="button" aria-label="Close account panel">✕</button>
    </header>
    <main class="panel-content account-main">
      <section class="account-card account-card-cozy" id="account-signed-out">
        <div class="account-hero">
          <div class="account-hero-illustration" aria-hidden="true">
            <span class="account-hero-sparkle account-hero-sparkle--one">✦</span>
            <span class="account-hero-sparkle account-hero-sparkle--two">❀</span>
            <span class="account-hero-sparkle account-hero-sparkle--three">✶</span>
          </div>
          <h3 class="account-heading">Keep your grove in sync</h3>
          <p class="account-subheading">Rest easy knowing your cozy presets drift with you from session to session.</p>
          <div class="account-signin-shell">
            <button id="account-google-btn" type="button" class="account-primary-btn account-google-btn">
              <span class="account-btn-icon" aria-hidden="true">
                <span class="account-google-dot account-google-dot--blue"></span>
                <span class="account-google-dot account-google-dot--red"></span>
                <span class="account-google-dot account-google-dot--yellow"></span>
                <span class="account-google-dot account-google-dot--green"></span>
              </span>
              <span class="account-btn-text">
                Glide in with Google
                <small>Sign in softly & sync in seconds</small>
              </span>
            </button>
          </div>
          <p class="account-signin-note">We'll open a gentle browser tab for the secure Google login.</p>
        </div>
        <div class="account-benefits" role="list">
          <div class="account-benefit" role="listitem">
            <span class="account-benefit-icon" aria-hidden="true">🌙</span>
            <span class="account-benefit-text">Night or day, your presets stay tucked away safely.</span>
          </div>
          <div class="account-benefit" role="listitem">
            <span class="account-benefit-icon" aria-hidden="true">🪴</span>
            <span class="account-benefit-text">Start a grove on one device and keep growing it anywhere.</span>
          </div>
          <div class="account-benefit" role="listitem">
            <span class="account-benefit-icon" aria-hidden="true">🎵</span>
            <span class="account-benefit-text">Carry the lofi mood you love across every session.</span>
          </div>
        </div>
        <p class="account-footnote">We'll launch your default browser for the secure Google login.</p>
      </section>
      <section class="account-card" id="account-signed-in" hidden>
        <div class="account-profile">
          <div class="account-avatar" id="account-avatar">•</div>
          <div>
            <div class="account-email" id="account-email"></div>
            <div class="account-meta">Connected with Google</div>
          </div>
        </div>
        <div class="account-sync-card">
          <div class="account-sync-row">
            <div>
              <div class="account-sync-title">Cloud presets</div>
              <div class="account-sync-status" id="account-sync-status">Last synced: never</div>
            </div>
            <span class="account-sync-pill" id="account-sync-pill">Signed in</span>
          </div>
          <div class="account-sync-actions">
            <button id="account-sync-btn" type="button" class="account-secondary-btn">
              <span class="account-sync-text">Sync now</span>
            </button>
            <button id="account-signout-btn" type="button" class="account-tertiary-btn">Sign out</button>
          </div>
        </div>
      </section>
      <section class="account-alert" id="account-config-warning" hidden>
        <strong>Cloud sync is almost ready</strong>
        <p>We're putting the finishing touches on secure saves. Feel free to keep working — you'll be able to sign in again shortly.</p>
      </section>
      <section class="account-alert error" id="account-error" hidden></section>
    </main>
    <footer class="account-footer">Secure sign-in powered by Google</footer>
  `;
  document.body.appendChild(panel);

  closeBtn = panel.querySelector('#account-close');
  signedOutSection = panel.querySelector('#account-signed-out');
  signedInSection = panel.querySelector('#account-signed-in');
  signInBtn = panel.querySelector('#account-google-btn');
  signOutBtn = panel.querySelector('#account-signout-btn');
  syncBtn = panel.querySelector('#account-sync-btn');
  emailEl = panel.querySelector('#account-email');
  avatarEl = panel.querySelector('#account-avatar');
  syncStatusEl = panel.querySelector('#account-sync-status');
  syncPillEl = panel.querySelector('#account-sync-pill');
  errorEl = panel.querySelector('#account-error');
  configNoticeEl = panel.querySelector('#account-config-warning');

  closeBtn?.addEventListener('click', () => AccountPanel.close());
  signInBtn?.addEventListener('click', handleSignInClick);
  signOutBtn?.addEventListener('click', handleSignOutClick);
  syncBtn?.addEventListener('click', handleSyncClick);

  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      AccountPanel.close();
    }
  });

  return panel;
}

function formatLastSync(iso) {
  if (!iso) return 'Last synced: not yet';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Last synced: not yet';
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return 'Last synced: just now';
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 45) return 'Last synced: just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `Last synced: ${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `Last synced: ${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `Last synced: ${days} day${days === 1 ? '' : 's'} ago`;
  }
  return `Last synced: ${date.toLocaleDateString()}`;
}

function updateAvatar(email) {
  if (!avatarEl) return;
  if (!email) {
    avatarEl.textContent = '•';
    return;
  }
  const initial = email.trim().charAt(0).toUpperCase();
  avatarEl.textContent = initial || '•';
}

function setBusy(el, busy, busyText) {
  if (!el) return;
  const textSpan = el.querySelector('.account-btn-text') || el.querySelector('.account-sync-text');
  if (busy) {
    el.classList.add('busy');
    el.setAttribute('disabled', 'true');
    if (textSpan) {
      textSpan.dataset.original = textSpan.dataset.original || textSpan.textContent;
      textSpan.textContent = busyText;
    } else {
      el.dataset.original = el.dataset.original || el.textContent;
      el.textContent = busyText;
    }
  } else {
    el.classList.remove('busy');
    el.removeAttribute('disabled');
    if (textSpan && textSpan.dataset.original) {
      textSpan.textContent = textSpan.dataset.original;
    } else if (!textSpan && el.dataset.original) {
      el.textContent = el.dataset.original;
    }
  }
}

function render(state) {
  currentState = state;
  ensurePanel();
  const user = state?.user;
  const signedIn = !!user;

  signedInSection?.toggleAttribute('hidden', !signedIn);
  signedOutSection?.toggleAttribute('hidden', signedIn);

  if (signedIn) {
    const email = user.email || 'Signed in';
    if (emailEl) emailEl.textContent = email;
    updateAvatar(email);
    if (syncStatusEl) {
      const lastSync = state.lastSyncAt || getLastSyncAt();
      syncStatusEl.textContent = formatLastSync(lastSync);
    }
    if (syncPillEl) {
      syncPillEl.textContent = state.isSyncing ? 'Syncing…' : 'Signed in';
      syncPillEl.dataset.status = state.isSyncing ? 'syncing' : 'idle';
    }
  }

  const supabaseIssue = !!state.supabaseError;
  if (supabaseIssue) {
    noteSupabaseSetupIssue(state.supabaseError);
  }

  const signInDisabled = state.isAuthenticating || supabaseIssue;
  const syncDisabled = !signedIn || state.isSyncing || state.isAuthenticating;
  const signOutDisabled = state.isAuthenticating;

  if (signInBtn) {
    setBusy(signInBtn, state.isAuthenticating, 'Signing in…');
    if (!state.isAuthenticating) {
      if (signInDisabled) signInBtn.setAttribute('disabled', 'true');
      else signInBtn.removeAttribute('disabled');
    }
  }

  if (syncBtn) {
    setBusy(syncBtn, state.isSyncing, 'Syncing…');
    if (syncDisabled) syncBtn.setAttribute('disabled', 'true');
    else syncBtn.removeAttribute('disabled');
  }

  if (signOutBtn) {
    if (signOutDisabled) signOutBtn.setAttribute('disabled', 'true');
    else signOutBtn.removeAttribute('disabled');
  }

  if (configNoticeEl) {
    configNoticeEl.toggleAttribute('hidden', !supabaseIssue);
  }

  if (errorEl) {
    const friendly = friendlyAuthErrorMessage(state.lastError, state.supabaseError);
    if (friendly) {
      const relevantError = state.lastError || state.supabaseError;
      const raw = relevantError?.message;
      const safeRaw = raw ? raw.replace(/[<>&]/g, (s) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[s])) : '';
      errorEl.innerHTML = friendly + (raw ? `<div style="opacity:.7;font-size:12px;margin-top:6px">Details: ${safeRaw}</div>` : '');
      errorEl.removeAttribute('hidden');
      if (state.lastError && state.lastError !== state.supabaseError) {
        console.warn('Account action failed', state.lastError);
      }
    } else {
      errorEl.setAttribute('hidden', 'true');
      errorEl.textContent = '';
    }
  }

  updateFabVisual(user);
}

async function handleSignInClick() {
  try {
    await signInWithGoogle();
  } catch (error) {
    console.warn('Sign-in failed', error);
  }
}

async function handleSignOutClick() {
  try {
    await signOut();
  } catch (error) {
    console.warn('Sign-out failed', error);
  }
}

async function handleSyncClick() {
  try {
    await syncNow();
  } catch (error) {
    console.warn('Sync failed', error);
  }
}

function openPanelInternal() {
  ensurePanel();
  if (openFallbackTimer) {
    window.clearTimeout(openFallbackTimer);
    openFallbackTimer = null;
  }
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
}

function closePanelInternal() {
  if (!panel) return;
  if (openFallbackTimer) {
    window.clearTimeout(openFallbackTimer);
    openFallbackTimer = null;
  }
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
}

const AccountPanel = {
  open(options = {}) {
    if (!options.fromManager && window.FloatingPanels?.open) {
      window.FloatingPanels.open(PANEL_ID);
      if (openFallbackTimer) {
        window.clearTimeout(openFallbackTimer);
      }
      openFallbackTimer = window.setTimeout(() => {
        if (!panel?.classList.contains('open')) {
          openPanelInternal();
        }
      }, 320);
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

function onFabClick(event) {
  event.preventDefault();
  AccountPanel.toggle();
}

function wireFab(button) {
  if (!button || button.dataset.accountFabWired === 'true') return;
  button.dataset.accountFabWired = 'true';
  button.addEventListener('click', onFabClick);
}

function registerFab() {
  const button = document.getElementById('account-fab');
  fabBtn = button || fabBtn;
  if (!button) return;
  wireFab(button);
  updateFabVisual(currentState?.user);

  if (!fabObserver) {
    fabObserver = new MutationObserver(() => {
      const nextButton = document.getElementById('account-fab');
      if (nextButton && nextButton !== fabBtn) {
        fabBtn = nextButton;
        wireFab(nextButton);
        updateFabVisual(currentState?.user);
      }
    });
    const fabCluster = document.getElementById('fab-cluster') || document.body;
    fabObserver.observe(fabCluster, { childList: true, subtree: true });
  }
}

function registerWithFloatingPanels(attempt = 0) {
  if (registeredWithManager) return;
  if (!window.FloatingPanels?.register) {
    if (attempt > 10) return;
    window.setTimeout(() => registerWithFloatingPanels(attempt + 1), 120);
    return;
  }
  ensurePanel();
  window.FloatingPanels.register(PANEL_ID, {
    open: () => openPanelInternal(),
    close: () => closePanelInternal(),
    getElement: () => panel || document.getElementById(PANEL_ID),
    transitionMs: 220
  });
  registeredWithManager = true;
}


subscribe((state) => {
  render(state);
});

initializeAuth().catch((error) => {
  console.warn('Auth initialization failed', error);
});

window.AccountPanel = AccountPanel;
registerFab();

registerWithFloatingPanels();

document.addEventListener('keydown', (event) => {
  const mod = event.metaKey || event.ctrlKey;
  if (!mod || !event.shiftKey) return;
  if ((event.key || '').toLowerCase() !== 'p') return;
  event.preventDefault();
  AccountPanel.toggle();
});
