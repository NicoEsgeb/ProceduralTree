const defaultSettings = {
  depth: 10,
  growthSpeed: 5,
  treeScale: 1,
  branchWidth: 2.7,
  colorMode: 'gradient',
  color: '#2c7a2c',
  gradientStart: '#552C22',
  gradientEnd: '#6D30FD',
  seed: '1337',
  lightDirection: 40,
  lightIntensity: 0.5,
  renderScale: 1,
  backgroundMode: 'dark',
  depthMode: false,          
  depthStrength: 0.6,        // NEW (0..~1.2 feels good)
  // Spotify embed defaults
  spotify: {
    enabled: false,
    link: 'https://open.spotify.com/playlist/37i9dQZF1DXc8kgYqQLMfH', // default Lo-Fi Beats playlist
    size: 'mini',     // mini | compact | card
    position: 'br'    // br | bl | tr | tl
  }
};

let forestDirty = false;                // draw forest layer only when it changes
const DEBUG_LOG = false;                // disable per-frame console logs

let lastAnchorUV = null; // where the last tree is "planted" in UV space


const randomRanges = {
  depth: [3, 11],
  growthSpeed: [0.6, 4.5],
  treeScale: [0.5, 3.5],
  branchWidth: [0.3, 4],
  lightDirection: [0, 359],
  lightIntensity: [0.1, 1]
};

const THEME_STORAGE_KEY = 'ui.theme';
const THEME_MODE_STORAGE_KEY = 'ui.theme.mode';
const THEME_DEFINITIONS = {
  classic: {
    modes: ['light', 'dark'],
    defaultMode: 'dark'
  },
  cozy: {
    modes: ['light', 'dark'],
    defaultMode: 'light'
  }
};

const DEV_MODE_KEY = 'studyTimer.devMode';
function isDevMode() {
  try { return localStorage.getItem(DEV_MODE_KEY) === '1'; } catch (_) { return false; }
}
function setDevMode(enabled) {
  try { localStorage.setItem(DEV_MODE_KEY, enabled ? '1' : '0'); } catch (_) {}
  try { window.dispatchEvent(new CustomEvent('devmode:change', { detail: { enabled } })); } catch (_) {}
}

let activeThemeName = 'classic';
let activeThemeMode = 'dark';

const canvasContainer = document.querySelector('#canvas-container');
const paneContainer = document.querySelector('#pane-container');
let canvas = null;

const controls = {
  depth: document.querySelector('#depth-input'),
  growthSpeed: document.querySelector('#growth-speed-input'),
  treeScale: document.querySelector('#tree-scale-input'),
  branchWidth: document.querySelector('#branch-width-input'),
  lightDirection: document.querySelector('#light-direction-input'),
  lightIntensity: document.querySelector('#light-intensity-input'),
  colorMode: document.querySelector('#color-mode-input'),
  color: document.querySelector('#color-input'),
  gradientStart: document.querySelector('#gradient-start-input'),
  gradientEnd: document.querySelector('#gradient-end-input'),
  seed: document.querySelector('#seed-input'),
  autoSeed: document.querySelector('#auto-seed-input'),
  devMode: document.querySelector('#dev-mode-input'),
  forestMode: document.querySelector('#forest-mode-input'),
  solidGroup: document.querySelector('#solid-color-group'),
  gradientGroups: document.querySelectorAll('.gradient-group'),
  redrawBtn: document.querySelector('#redraw-btn'),
  randomizeTreeBtn: document.querySelector('#randomize-btn'),
  randomizeSeedBtn: document.querySelector('#randomize-seed-btn'),
  clearBtn: document.querySelector('#clear-btn'),
  savePresetBtn: document.querySelector('#save-preset-btn'),
  loadPresetBtn: document.querySelector('#load-preset-btn'),
  renderScaleInput: document.querySelector('#render-scale-input'),
  renderScaleRange: document.querySelector('#render-scale-range'),
  backgroundMode: document.querySelector('#background-mode-input'),
  depthMode: document.querySelector('#depth-mode-input'),              
  depthStrength: document.querySelector('#depth-strength-input'),      
  depthStrengthGroup: document.querySelector('#depth-strength-group'),
  // Spotify controls
  spotifyEnable: document.querySelector('#spotifyEnable'),
  // spotifyLink control removed from UI; still supported if later added
  spotifySize: document.querySelector('#spotifySize'),
  spotifyPosition: document.querySelector('#spotifyPosition'),
  spotifyLinkHint: document.querySelector('#spotifyLinkHint'),
  spotifyLoginBtn: document.querySelector('#spotifyLoginBtn'),
  spotifyOpenBtn: document.querySelector('#spotifyOpenBtn'),
  themeSelect: document.querySelector('#theme-select'),
  themeModeBtn: document.querySelector('#theme-mode-btn')
};

function readStoredTheme() {
  let theme = 'classic';
  let mode = THEME_DEFINITIONS.classic.defaultMode;
  try {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme && storedTheme in THEME_DEFINITIONS) {
      theme = storedTheme;
    }
    const storedMode = localStorage.getItem(THEME_MODE_STORAGE_KEY);
    if (storedMode && THEME_DEFINITIONS[theme].modes.includes(storedMode)) {
      mode = storedMode;
    } else {
      mode = THEME_DEFINITIONS[theme].defaultMode;
    }
  } catch (_e) {
    theme = 'classic';
    mode = THEME_DEFINITIONS.classic.defaultMode;
  }
  return { theme, mode };
}

function applyThemeClass(theme, mode) {
  const themeKey = theme in THEME_DEFINITIONS ? theme : 'classic';
  const themeDef = THEME_DEFINITIONS[themeKey];
  const nextMode = themeDef.modes.includes(mode) ? mode : themeDef.defaultMode;

  activeThemeName = themeKey;
  activeThemeMode = nextMode;

  if (typeof document !== 'undefined' && document.body) {
    const classesToRemove = Array.from(document.body.classList).filter(cls =>
      cls.startsWith('theme-') || cls === 'cozy-theme'
    );
    if (classesToRemove.length) {
      document.body.classList.remove(...classesToRemove);
    }
    const className = `theme-${themeKey}-${nextMode}`;
    document.body.classList.add(className);
    if (themeKey === 'cozy') {
      document.body.classList.add('cozy-theme');
    }
  }

  updateThemeControlsUI();

  persistTheme(themeKey, nextMode);
}

function updateThemeControlsUI() {
  if (controls.themeSelect && controls.themeSelect.value !== activeThemeName) {
    controls.themeSelect.value = activeThemeName;
  }

  if (controls.themeModeBtn) {
    const isDark = activeThemeMode === 'dark';
    controls.themeModeBtn.dataset.mode = isDark ? 'dark' : 'light';
    controls.themeModeBtn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    controls.themeModeBtn.textContent = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
  }
}

function persistTheme(theme, mode) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    localStorage.setItem(THEME_MODE_STORAGE_KEY, mode);
  } catch (_e) {
    // ignore storage failures
  }
}

function initThemeSelector() {
  const initialTheme = readStoredTheme();
  applyThemeClass(initialTheme.theme, initialTheme.mode);
  if (controls.themeSelect) {
    controls.themeSelect.value = initialTheme.theme;
    controls.themeSelect.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) return;
      const selected = target.value in THEME_DEFINITIONS ? target.value : 'classic';
      const themeDef = THEME_DEFINITIONS[selected];
      const desiredMode = themeDef.modes.includes(activeThemeMode) ? activeThemeMode : themeDef.defaultMode;
      applyThemeClass(selected, desiredMode);
    });
  }

  if (controls.themeModeBtn) {
    controls.themeModeBtn.addEventListener('click', () => {
      const themeDef = THEME_DEFINITIONS[activeThemeName];
      const toggledMode = activeThemeMode === 'dark' ? 'light' : 'dark';
      const nextMode = themeDef.modes.includes(toggledMode) ? toggledMode : themeDef.defaultMode;
      applyThemeClass(activeThemeName, nextMode);
    });
  }
}

// ---- Spotify helpers ----
const SPOTIFY_ALLOWED_TYPES = new Set(['track','album','playlist','artist','episode','show']);
const SPOTIFY_LOCAL_KEY = 'clicktree.settings'; // store under .spotify in this JSON blob

function debounce(fn, wait) {
  let t = null;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

function toSpotifyEmbedUrl(input) {
  if (!input || typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;

  // Allow spotify:{type}:{id}
  if (raw.startsWith('spotify:')) {
    const parts = raw.split(':');
    if (parts.length >= 3) {
      const type = parts[1];
      const id = parts[2].split('?')[0];
      if (SPOTIFY_ALLOWED_TYPES.has(type) && id) {
        return `https://open.spotify.com/embed/${type}/${encodeURIComponent(id)}`;
      }
    }
    return null;
  }

  // Allow https://open.spotify.com/... (remove possible locale prefix like /intl-en)
  try {
    const url = new URL(raw);
    if (url.hostname !== 'open.spotify.com') return null;
    const segments = url.pathname.split('/').filter(Boolean);
    let idx = 0;
    if (segments[0] && segments[0].startsWith('intl-')) idx = 1;
    const type = segments[idx];
    const id = segments[idx + 1];
    if (!type || !id || !SPOTIFY_ALLOWED_TYPES.has(type)) return null;

    // Allowlist a few harmless params
    const allowed = new URLSearchParams();
    const keep = ['utm_source','si','theme'];
    for (const [k, v] of url.searchParams.entries()) {
      if (keep.includes(k)) allowed.set(k, v);
    }
    // Default to dark theme if none provided
    if (!allowed.has('theme')) allowed.set('theme', '0');
    const qs = allowed.toString();
    const base = `https://open.spotify.com/embed/${type}/${encodeURIComponent(id)}`;
    return qs ? `${base}?${qs}` : base;
  } catch (_e) {
    return null;
  }
}

function loadLocalSpotifySettings() {
  try {
    const raw = localStorage.getItem(SPOTIFY_LOCAL_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.spotify && typeof parsed.spotify === 'object') {
      const s = parsed.spotify;
      settings.spotify = {
        enabled: !!s.enabled,
        link: typeof s.link === 'string' && s.link.trim() ? s.link : DEFAULT_SPOTIFY_LINK,
        size: (s.size === 'mini' || s.size === 'compact' || s.size === 'card') ? s.size : 'mini',
        position: (s.position === 'br' || s.position === 'bl' || s.position === 'tr' || s.position === 'tl') ? s.position : 'br'
      };
    }
  } catch (_e) {
    // ignore
  }
}

function saveLocalSpotifySettings() {
  try {
    const raw = localStorage.getItem(SPOTIFY_LOCAL_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed.spotify = {
      enabled: !!settings.spotify.enabled,
      link: settings.spotify.link || '',
      size: settings.spotify.size || 'mini',
      position: settings.spotify.position || 'br'
    };
    localStorage.setItem(SPOTIFY_LOCAL_KEY, JSON.stringify(parsed));
  } catch (_e) {
    // ignore
  }
}

function applySpotifySettings(force = false) {
  const overlay = document.getElementById('spotifyOverlay');
  const iframe = document.getElementById('spotifyIframe');
  const hint = controls.spotifyLinkHint;
  if (!overlay || !iframe) return;

  // Reset position classes
  overlay.classList.remove('pos-br','pos-bl','pos-tr','pos-tl');
  const posClass = `pos-${settings.spotify.position || 'br'}`;
  overlay.classList.add(posClass);

  // Size mapping
  let width = 250, height = 80, maxW = '';
  if (settings.spotify.size === 'compact') { width = 352; height = 152; }
  else if (settings.spotify.size === 'card') { width = '100%'; height = 352; maxW = '420px'; }
  overlay.style.maxWidth = maxW;
  iframe.setAttribute('width', String(width));
  iframe.setAttribute('height', String(height));
  iframe.setAttribute('frameborder', '0');
  iframe.setAttribute('loading', 'lazy');
  iframe.setAttribute('allow', 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture');

  const enabled = !!settings.spotify.enabled;
  let embedUrl = toSpotifyEmbedUrl(settings.spotify.link);
  if (!embedUrl) embedUrl = toSpotifyEmbedUrl(DEFAULT_SPOTIFY_LINK);

  // Validation hint
  if (hint) { hint.textContent = ''; }

  if (enabled && embedUrl) {
    if (force || iframe.src !== embedUrl) iframe.src = embedUrl;
    overlay.classList.add('show');
  } else {
    overlay.classList.remove('show');
    // Clear src to avoid background activity when hidden
    if (!enabled) iframe.removeAttribute('src');
  }
}

function initSpotifyUI() {
  // Initialize control values
  if (controls.spotifyEnable) controls.spotifyEnable.checked = !!settings.spotify.enabled;
  if (controls.spotifySize) controls.spotifySize.value = settings.spotify.size || 'mini';
  if (controls.spotifyPosition) controls.spotifyPosition.value = settings.spotify.position || 'br';

  const applyAndSave = () => { applySpotifySettings(); saveLocalSpotifySettings(); };

  if (controls.spotifyEnable) {
    controls.spotifyEnable.addEventListener('change', () => {
      settings.spotify.enabled = !!controls.spotifyEnable.checked;
      applyAndSave();
    });
  }
  if (controls.spotifySize) {
    controls.spotifySize.addEventListener('change', () => {
      settings.spotify.size = controls.spotifySize.value;
      applyAndSave();
    });
  }
  if (controls.spotifyPosition) {
    controls.spotifyPosition.addEventListener('change', () => {
      settings.spotify.position = controls.spotifyPosition.value;
      applyAndSave();
    });
  }
  // No link field: always use saved/default link

  if (controls.spotifyLoginBtn) {
    controls.spotifyLoginBtn.addEventListener('click', async () => {
      try {
        await window.clickTreeAPI?.openSpotifyLogin();
        // Reload the iframe to reflect login state
        applySpotifySettings(true);
      } catch (_e) {}
    });
  }

  if (controls.spotifyOpenBtn) {
    controls.spotifyOpenBtn.addEventListener('click', async () => {
      const openUrl = toSpotifyOpenUrl(settings.spotify.link) || toSpotifyOpenUrl(DEFAULT_SPOTIFY_LINK);
      if (openUrl) {
        await window.clickTreeAPI?.openExternal(openUrl);
      }
    });
  }

  // Initial paint
  applySpotifySettings();
}

function toSpotifyOpenUrl(input) {
  if (!input || typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;
  if (raw.startsWith('spotify:')) {
    const parts = raw.split(':');
    if (parts.length >= 3) {
      const type = parts[1];
      const id = parts[2].split('?')[0];
      if (SPOTIFY_ALLOWED_TYPES.has(type) && id) {
        return `https://open.spotify.com/${type}/${encodeURIComponent(id)}`;
      }
    }
    return null;
  }
  try {
    const url = new URL(raw);
    if (url.hostname !== 'open.spotify.com') return null;
    const segments = url.pathname.split('/').filter(Boolean);
    let idx = 0;
    if (segments[0] && segments[0].startsWith('intl-')) idx = 1;
    const type = segments[idx];
    const id = segments[idx + 1];
    if (!type || !id || !SPOTIFY_ALLOWED_TYPES.has(type)) return null;
    return `https://open.spotify.com/${type}/${encodeURIComponent(id)}`;
  } catch (_e) {
    return null;
  }
}

// === Background image meta & "cover" transform ===
const BG_URL = 'assets/CaveImages/cave1.png'; // same path used by CSS
const bgImg = new Image();
let bgReady = false;
bgImg.onload = () => {
  bgReady = true;
  updateCoverTransform();

  // Normalize any old anchors that were captured before the image was ready
  normalizeAnchorsToImageSpace();   // upgrades lastAnchorUV + all stored trees

  // Repaint whatever is on screen
  tree.clearCanvas();
  staticDirty = true;
  repaintStaticLayer();
  if (forestMode && forestTrees.length) { forestDirty = true; drawForestTrees(); }
  else if (growingTrees.length) { startMasterAnimation(); }
  else { drawCompletedSingleTree(); }
};

bgImg.src = BG_URL;

let cover = { scale: 1, offsetX: 0, offsetY: 0 };

function updateCoverTransform() {
  const w = canvasContainer.clientWidth;
  const h = canvasContainer.clientHeight;
  if (settings.backgroundMode === 'cave' && bgReady) {
    const s = Math.max(w / bgImg.naturalWidth, h / bgImg.naturalHeight);
    cover.scale = s;
    cover.offsetX = (w - bgImg.naturalWidth * s) * 0.5;
    cover.offsetY = (h - bgImg.naturalHeight * s) * 0.5;
  } else {
    cover.scale = 1;
    cover.offsetX = 0;
    cover.offsetY = 0;
  }
}

function paintBackground() {
  // Always fill something (dark) so the canvas is opaque
  tree.ctx.fillStyle = '#0e0f10';
  tree.ctx.fillRect(0, 0, tree.stageWidth, tree.stageHeight);

  if (settings.backgroundMode === 'cave' && bgReady) {
    updateCoverTransform();
    const w = bgImg.naturalWidth  * cover.scale;
    const h = bgImg.naturalHeight * cover.scale;
    tree.ctx.drawImage(bgImg, cover.offsetX, cover.offsetY, w, h);

    // optional: subtle dark overlay like your CSS had
    tree.ctx.fillStyle = 'rgba(0,0,0,0.35)';
    tree.ctx.fillRect(0, 0, tree.stageWidth, tree.stageHeight);
  }
}


// Convert canvas pixel -> image UV (0..1)
function canvasToImageUV(pt) {
  updateCoverTransform();
  if (!(settings.backgroundMode === 'cave' && bgReady)) {
    // fall back to container-relative UV if there is no image
    return { u: pt.x / tree.stageWidth, v: pt.y / tree.stageHeight, space: 'canvas' };
  }
  const ix = (pt.x - cover.offsetX) / cover.scale;
  const iy = (pt.y - cover.offsetY) / cover.scale;
  return {
    u: Math.min(1, Math.max(0, ix / bgImg.naturalWidth)),
    v: Math.min(1, Math.max(0, iy / bgImg.naturalHeight)),
    space: 'image'
  };
}

// Convert image UV (or canvas UV) -> canvas pixel
function uvToCanvasXY(uv) {
  updateCoverTransform();

  // Upgrade stored canvas-UV to image-UV the first time we can
  if (uv && uv.space === 'canvas' && settings.backgroundMode === 'cave' && bgReady) {
    const xy = { x: uv.u * tree.stageWidth, y: uv.v * tree.stageHeight };
    const imgUV = canvasToImageUV(xy);
    // persist the upgrade so future resizes stay locked to the image
    uv.u = imgUV.u;
    uv.v = imgUV.v;
    uv.space = 'image';
  }

  // Canvas-space fallback
  if (!uv || uv.space === 'canvas') {
    return { x: uv.u * tree.stageWidth, y: uv.v * tree.stageHeight };
  }

  // Image-space → canvas pixels
  const ix = uv.u * bgImg.naturalWidth;
  const iy = uv.v * bgImg.naturalHeight;
  return {
    x: cover.offsetX + ix * cover.scale,
    y: cover.offsetY + iy * cover.scale
  };
}

function sampleBaseColorHexAtUV(uv) {
  // Make sure the static background is up-to-date
  repaintStaticLayer();

  const p = uvToCanvasXY(uv);
  // getImageData uses device pixels; staticCtx is scaled by pixelRatio
  const dx = Math.max(0, Math.min(staticCanvas.width  - 1, Math.round(p.x * tree.pixelRatio)));
  const dy = Math.max(0, Math.min(staticCanvas.height - 1, Math.round(p.y * tree.pixelRatio)));

  try {
    const data = staticCtx.getImageData(dx, dy, 1, 1).data; // [r,g,b,a]
    return rgbToHex([data[0], data[1], data[2]]);
  } catch (_e) {
    // Fallback to current configured start if sampling fails
    return settings.gradientStart;
  }
}



// --- Upgrade stored UVs to image-space once the cave image is ready ---
function upgradeAnchorToImageSpace(anchor) {
  if (!anchor || anchor.space !== 'canvas') return anchor;
  if (!(settings.backgroundMode === 'cave' && bgReady)) return anchor;
  // Convert old canvas-UV (relative to stage) -> image-UV using current cover
  const xy = { x: anchor.u * tree.stageWidth, y: anchor.v * tree.stageHeight };
  return canvasToImageUV(xy); // returns {u,v,space:'image'}
}

function normalizeAnchorsToImageSpace() {
  if (!(settings.backgroundMode === 'cave' && bgReady)) return;

  if (lastAnchorUV) lastAnchorUV = upgradeAnchorToImageSpace(lastAnchorUV);
  if (completedSingleTree && completedSingleTree.uv) {
    completedSingleTree.uv = upgradeAnchorToImageSpace(completedSingleTree.uv);
  }
  for (let i = 0; i < growingTrees.length; i++) {
    if (growingTrees[i].uv) growingTrees[i].uv = upgradeAnchorToImageSpace(growingTrees[i].uv);
  }
  for (let i = 0; i < forestTrees.length; i++) {
    if (forestTrees[i].uv) forestTrees[i].uv = upgradeAnchorToImageSpace(forestTrees[i].uv);
  }
}



// Tree scale that tracks window/background scale
function scaledTreeRenderScale(treeData) {
  const base = treeData.renderScaleBase || 1;
  // only multiply by cover.scale when anchored to the image
  return (treeData.uv && treeData.uv.space === 'image') ? base * cover.scale : base;
}



function stripBranches(levels) {
  return levels.map(level =>
    level.map(({ startX, startY, endX, endY, lineWidth, midX, midY }) => ({
      startX, startY, endX, endY, lineWidth, midX, midY
    }))
  );
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

// Depth sort key: top (far) first, bottom (near) last
function depthSortKey(t) {
  // Prefer image-space V if we have it, otherwise normalise by canvas height
  if (t && t.uv && typeof t.uv.v === 'number') {
    return t.uv.v;             // 0 = top (far), 1 = bottom (near)
  }
  // Fallback: use current Y in canvas space
  const y = (t && Number.isFinite(t.treeY)) ? t.treeY : 0;
  return y / Math.max(1, tree.stageHeight);
}


function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max, precision = 2) {
  const val = Math.random() * (max - min) + min;
  return Number(val.toFixed(precision));
}

function randomHexColor() {
  return `#${Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0')}`;
}

function scalePoint(x, y, pivotX, pivotY, s) {
  return { x: pivotX + (x - pivotX) * s, y: pivotY + (y - pivotY) * s };
}


function parseSeedValue(value) {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  if (trimmed === '') return undefined;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function sanitizeColor(color, fallback) {
  if (typeof color !== 'string') return fallback;
  const normalized = color.trim().toLowerCase();
  return /^#([0-9a-f]{6})$/.test(normalized) ? normalized : fallback;
}

function cloneSettings(src) {
  return {
    depth: src.depth,
    growthSpeed: src.growthSpeed,
    treeScale: src.treeScale,
    branchWidth: src.branchWidth,
    colorMode: src.colorMode,
    color: src.color,
    gradientStart: src.gradientStart,
    gradientEnd: src.gradientEnd,
    seed: src.seed,
    lightDirection: src.lightDirection,
    lightIntensity: src.lightIntensity
  };
}

const settings = {
  ...defaultSettings
};

initThemeSelector();

// Load persisted Spotify settings from localStorage
loadLocalSpotifySettings();

// after: const settings = { ...defaultSettings };

function applyBackground() {
  // We now render the background image directly on the canvas,
  // so don't use the CSS background at all.
  canvasContainer.classList.remove('bg-image');
}


if (controls.backgroundMode) {
  controls.backgroundMode.value = settings.backgroundMode;
  controls.backgroundMode.addEventListener('change', (e) => {
    settings.backgroundMode = e.target.value;
    applyBackground();
    updateCoverTransform();
    forestDirty = true;
    staticDirty = true;
    repaintStaticLayer();  // force one repaint
    if (lastAnchorUV && !forestMode) redrawFromLastPoint(); // keep single tree glued
  });
}


applyBackground(); // set initial background


let autoRandomSeed = true;
let lastClick = null;
let forestMode = false;
let forestTrees = []; // Array to store completed trees in forest mode
let growingTrees = []; // Array to store trees currently growing
let masterAnimationId = null; // ID for the master animation loop
let completedSingleTree = null; // snapshot of last finished tree in single-tree mode



const tree = new window.TreePlugin({
  container: canvasContainer,
  depth: settings.depth,
  growthSpeed: settings.growthSpeed,
  treeScale: settings.treeScale,
  branchWidth: settings.branchWidth,
  colorMode: settings.colorMode,
  color: settings.color,
  gradientStart: settings.gradientStart,
  gradientEnd: settings.gradientEnd,
  seed: parseSeedValue(settings.seed),
  lightDirection: settings.lightDirection,
  lightIntensity: settings.lightIntensity
});

if (tree.animation) {
  cancelAnimationFrame(tree.animation);
  tree.animation = null;
}
tree.clearCanvas();

canvas = canvasContainer.querySelector('canvas');

let staticCanvas = document.createElement('canvas');
let staticCtx = staticCanvas.getContext('2d');
staticCanvas.style.position = 'absolute';
staticCanvas.style.inset = '0';
canvasContainer.insertBefore(staticCanvas, canvas); // behind the live canvas

// ✅ Make sure layering + input are correct
staticCanvas.style.zIndex = '0';
staticCanvas.style.pointerEvents = 'none';   // <-- let clicks pass through
canvas.style.position = 'absolute';
canvas.style.inset = '0';
canvas.style.zIndex = '1';

let staticDirty = true;
// When false, repaintStaticLayer() will draw only the background (no forest)
let showForestOnStatic = true;


function resizeStatic() {
  staticCanvas.width  = tree.stageWidth * tree.pixelRatio;
  staticCanvas.height = tree.stageHeight * tree.pixelRatio;
  staticCtx.setTransform(tree.pixelRatio, 0, 0, tree.pixelRatio, 0, 0);
  staticDirty = true;
}
resizeStatic();

function repaintStaticLayer() {
  if (!staticDirty) return;

  // Background (moved off the animated canvas)
  staticCtx.fillStyle = '#0e0f10';
  staticCtx.fillRect(0, 0, tree.stageWidth, tree.stageHeight);
  if (settings.backgroundMode === 'cave' && bgReady) {
    updateCoverTransform();
    const w = bgImg.naturalWidth  * cover.scale;
    const h = bgImg.naturalHeight * cover.scale;
    staticCtx.drawImage(bgImg, cover.offsetX, cover.offsetY, w, h);
    staticCtx.fillStyle = 'rgba(0,0,0,0.35)';
    staticCtx.fillRect(0, 0, tree.stageWidth, tree.stageHeight);
  }

  // Finished forest (draw once)
  if (showForestOnStatic && forestMode && forestTrees.length) {
    // Build draw list with current (x,y) and sort by depth if Depth Mode is ON
    const drawList = forestTrees.map(t => {
      // Recompute canvas-space position from UV for this frame
      let x = t.treeX, y = t.treeY;
      if (t.uv) {
        const p = uvToCanvasXY(t.uv);
        x = p.x; y = p.y;
      }
      return { t, x, y };
    });

    if (settings.depthMode) {
      drawList.sort((a, b) => depthSortKey(a.t) - depthSortKey(b.t));
    }

    for (const item of drawList) {
      const t = item.t;
      // Persist the recomputed position so branch shaders/gradients stay consistent
      t.treeX = item.x; 
      t.treeY = item.y;

      const s = scaledTreeRenderScale(t);
      staticCtx.save();
      staticCtx.translate(t.treeX, t.treeY);
      staticCtx.scale(s, s);
      staticCtx.translate(-t.treeX, -t.treeY);
      const dx = t.treeX - (t.originX ?? t.treeX);
      const dy = t.treeY - (t.originY ?? t.treeY);
      staticCtx.translate(dx, dy);

      for (let d = 0; d < t.depth && d < t.branches.length; d++) {
        for (let k = 0; k < t.branches[d].length; k++) {
          const b = t.branches[d][k];
          staticCtx.beginPath();
          staticCtx.moveTo(b.startX, b.startY);
          staticCtx.lineTo(b.endX, b.endY);
          staticCtx.lineWidth = b.lineWidth;
          staticCtx.strokeStyle = getBranchStrokeStyleForTreeData(staticCtx, b, t);
          staticCtx.stroke();
        }
      }
      staticCtx.restore();
    }
  }


  staticDirty = false;
}


function applySettingsToTree() {
  tree.depth = settings.depth;
  tree.growthSpeed = settings.growthSpeed;
  tree.treeScale = settings.treeScale;
  tree.branchWidth = settings.branchWidth;
  tree.colorMode = settings.colorMode;
  tree.color = settings.color;
  tree.gradientStart = settings.gradientStart;
  tree.gradientEnd = settings.gradientEnd;
  if (typeof tree.setLightDirection === 'function') {
    tree.setLightDirection(settings.lightDirection);
  } else {
    tree.lightDirection = settings.lightDirection;
  }
  if (typeof tree.setLightIntensity === 'function') {
    tree.setLightIntensity(settings.lightIntensity);
  } else {
    tree.lightIntensity = Math.min(1, Math.max(0, settings.lightIntensity));
  }
  tree.setSeed(parseSeedValue(settings.seed));
}

function createNewTreeData(x, y, uvFromCaller) {
  const uv = uvFromCaller || canvasToImageUV({ x, y });
  const spawn = uvToCanvasXY(uv);
  const baseColorHex = sampleBaseColorHexAtUV(uv);

  // NEW: depth-based extra scale (affects this tree only)
  let rsBase = settings.renderScale;
  if (settings.depthMode && uv) {
    rsBase *= depthScaleForUV(uv);
  }

  const treeData = {
    id: Date.now() + Math.random(),
    // anchor + position driven by UV
    uv,
    treeX: spawn.x,
    treeY: spawn.y,
    originX: spawn.x,   // <-- store planting origin
    originY: spawn.y,
    baseColorHex,

    // per-tree settings
    treeTop: Infinity,
    currentDepth: 0,
    depth: settings.depth,
    growthSpeed: settings.growthSpeed,
    treeScale: settings.treeScale,
    branchWidth: settings.branchWidth,
    colorMode: settings.colorMode,
    color: settings.color,
    gradientStart: settings.gradientStart,
    gradientEnd: settings.gradientEnd,
    lightDirection: settings.lightDirection,
    lightIntensity: settings.lightIntensity,

    // RNG / determinism
    seed: parseSeedValue(settings.seed),
    randSeq: null,
    randCounter: 0,
    currentSeed: null,

    fullDepth: 11,
    createdAt: Date.now(),

    // render scaling (base stays constant; frame scale derives from cover)
    renderScaleBase: rsBase,
    renderScale: rsBase    
  };

  // Init deterministic RNG sequence if seeded
  if (treeData.seed !== undefined) {
    const value = Number(treeData.seed);
    if (Number.isFinite(value)) {
      treeData.currentSeed = value;

      const baseCount = 10000;
      const depthMultiplier = Math.pow(2, treeData.depth);
      const scaleMultiplier = treeData.treeScale * 2;
      const totalCount = Math.min(50000, Math.max(10000, (baseCount * depthMultiplier * scaleMultiplier) / 10));

      treeData.randSeq = [];
      let s = value;
      for (let i = 0; i < totalCount; i++) {
        s = (s * 16807) % 2147483647;
        const rnd = (s - 1) / 2147483646;
        treeData.randSeq.push(rnd);
      }
      treeData.randCounter = 0;
      treeData.randSeqSize = totalCount;

      console.log(`Tree created with ${totalCount} random numbers (depth: ${treeData.depth}, scale: ${treeData.treeScale})`);
    }
  }

  // Cap treeScale by *available headroom* above planting point,
  // so the tree never grows outside the top of the canvas.
  const headroom = Math.max(24, Math.floor(spawn.y)); // px from top to planting Y
  const maxScale = headroom / (13 * treeData.fullDepth);
  treeData.treeScale = Math.min(treeData.treeScale, Math.max(0.15, maxScale));

  // Pre-generate structure
  treeData.branches = Array.from({ length: treeData.fullDepth }, () => []);
  createBranchForTreeData(treeData, treeData.treeX, treeData.treeY, -90, 0);

  return treeData;
}


function createBranchForTreeData(treeData, startX, startY, angle, depth) {
  // Stop recursion when reaching the full depth
  if (depth === treeData.fullDepth) return;
  
  var scale = treeData.treeScale;
  // Calculate branch length; longer for the trunk (depth 0)
  var len = (depth === 0 ? randomForTreeData(treeData, 10, 13) : randomForTreeData(treeData, 0, 11)) * scale;
  var factor = treeData.fullDepth - depth;
  
  // Determine end coordinates based on angle, length, and scaling factor
  var endX = startX + Math.cos(degToRad(angle)) * len * factor;
  var endY = startY + Math.sin(degToRad(angle)) * len * factor;
  
  // Update the top position of the tree if necessary
  if (startY < treeData.treeTop) treeData.treeTop = startY;
  if (endY < treeData.treeTop) treeData.treeTop = endY;
  
  var branchWidthFactor = treeData.branchWidth;
  
  // Create a branch object with properties and a draw method
  var branch = {
    startX: startX,
    startY: startY,
    endX: endX,
    endY: endY,
    lineWidth: factor * branchWidthFactor,
    frame: 100,
    cntFrame: 0,
    gapX: (endX - startX) / 100,
    gapY: (endY - startY) / 100,
    treeData: treeData,
    midX: (startX + endX) / 2,
    midY: (startY + endY) / 2,
    draw: function (ctx, speed) {
      // Draw the branch gradually until it is fully drawn
      if (this.cntFrame < this.frame) {
        ctx.beginPath();
        var progress = this.cntFrame / this.frame;
        var currX = this.startX + (this.endX - this.startX) * progress;
        var currY = this.startY + (this.endY - this.startY) * progress;
        ctx.moveTo(this.startX, this.startY);
        ctx.lineTo(currX, currY);
        ctx.lineWidth = this.lineWidth;
        // Set stroke style based on light-aware gradient or solid color
        ctx.strokeStyle = getBranchStrokeStyleForTreeData(ctx, this, this.treeData);
        ctx.stroke();
        ctx.closePath();
        // Increment the frame counter based on growthSpeed
        this.cntFrame += speed;
        return false;
      }
      return true;
    }
  };
  
  // Add the branch to the corresponding depth level
  treeData.branches[depth].push(branch);
  
  // Recursively create left and right sub-branches with adjusted angles
  createBranchForTreeData(treeData, endX, endY, angle - randomForTreeData(treeData, 15, 23), depth + 1);
  createBranchForTreeData(treeData, endX, endY, angle + randomForTreeData(treeData, 15, 23), depth + 1);
}

function regenerateRandomSequence(treeData) {
  if (treeData.currentSeed === undefined) return;
  
  console.log(`Regenerating random sequence for tree (used ${treeData.randCounter}/${treeData.randSeq.length})`);
  
  // Generate new sequence starting from where we left off
  var s = treeData.currentSeed + treeData.randCounter; // Offset the seed
  var totalCount = treeData.randSeqSize || 50000;
  
  treeData.randSeq = [];
  for (var i = 0; i < totalCount; i++) {
    s = (s * 16807) % 2147483647;
    var rnd = (s - 1) / 2147483646;
    treeData.randSeq.push(rnd);
  }
  treeData.randCounter = 0;
}

function randomForTreeData(treeData, min, max) {
  // Use deterministic random sequence if available; otherwise, fallback to Math.random()
  if (treeData.randSeq && treeData.randCounter < treeData.randSeq.length) {
    // Warn if we're using more than 80% of our random sequence
    if (treeData.randCounter > treeData.randSeq.length * 0.8) {
      console.warn(`Tree using ${Math.round(treeData.randCounter/treeData.randSeq.length*100)}% of random sequence (${treeData.randCounter}/${treeData.randSeq.length})`);
    }
    return min + treeData.randSeq[treeData.randCounter++] * (max - min);
  } else if (treeData.randSeq && treeData.currentSeed !== undefined) {
    // Regenerate sequence if we have a seed but exhausted the current one
    regenerateRandomSequence(treeData);
    return min + treeData.randSeq[treeData.randCounter++] * (max - min);
  } else {
    // Fallback to Math.random() if sequence is not available
    return Math.random() * (max - min) + min;
  }
}

function degToRad(degree) {
  return degree * (Math.PI / 180);
}

function getBranchStrokeStyleForTreeData(ctx, branch, treeData, renderScale = 1) {

  var shade = getShadeFactorForTreeData(branch, treeData);
  if (treeData.colorMode === "gradient" || treeData.colorMode === "baseGradient") {

    // Colors (unchanged)
    var startColor = applyShadingForTreeData(getColorAtYForTreeData(branch.startY, treeData), shade, treeData);
    var endColor   = applyShadingForTreeData(getColorAtYForTreeData(branch.endY,   treeData), shade, treeData);
    // ✅ Build gradient in *final canvas coords* using the same transform
    // we use to draw branches: scale about (treeX, treeY) + anchor delta translate.
    const s  = scaledTreeRenderScale(treeData);               // same scale used to draw
    const dx = treeData.treeX - (treeData.originX ?? treeData.treeX);
    const dy = treeData.treeY - (treeData.originY ?? treeData.treeY);
    const p0 = scalePoint(branch.startX, branch.startY, treeData.treeX, treeData.treeY, s);
    const p1 = scalePoint(branch.endX,   branch.endY,   treeData.treeX, treeData.treeY, s);
    p0.x += dx; p0.y += dy;
    p1.x += dx; p1.y += dy;
    const gradient = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
    gradient.addColorStop(0, rgbToHex(startColor));
    gradient.addColorStop(1, rgbToHex(endColor));
    return gradient;
  }
  var solid = hexToRgb(treeData.color) || [0, 0, 0];
  var shaded = applyShadingForTreeData(solid, shade, treeData);
  return rgbToHex(shaded);
}

function getShadeFactorForTreeData(branch, treeData) {
  const angleRad = treeData.lightDirection * (Math.PI / 180);
  const lightX = Math.cos(angleRad);
  const lightY = Math.sin(angleRad);
  // Work entirely in planting/object space:
  const midX = branch.midX;
  const midY = branch.midY;
  const baseX = (treeData.originX ?? treeData.treeX);
  const baseY = (treeData.originY ?? treeData.treeY);
  const centerY = Number.isFinite(treeData.treeTop) ? (baseY + treeData.treeTop) / 2 : baseY;
  let vecX = midX - baseX;
  let vecY = midY - centerY;
  const len = Math.hypot(vecX, vecY) || 1;
  vecX /= len; vecY /= len;
  const dot = vecX * (-lightX) + vecY * (-lightY);
  return clamp01((dot + 1) / 2);
}

function getColorAtYForTreeData(y, treeData) {
  let start, end;

  if (treeData.colorMode === 'baseGradient') {
    start = hexToRgb(treeData.baseColorHex || treeData.gradientStart);
    end   = hexToRgb(treeData.gradientEnd);
  } else {
    start = hexToRgb(treeData.gradientStart);
    end   = hexToRgb(treeData.gradientEnd);
  }

  if (!start || !end) return start || end || [0, 0, 0];

  // Use planting origin as the fixed reference so resizes don’t change the mix
  const baseY = (treeData.originY ?? treeData.treeY);
  if (!Number.isFinite(baseY) || !Number.isFinite(treeData.treeTop) || baseY === treeData.treeTop) {
    return start.slice();
  }
  let ratio = (baseY - y) / (baseY - treeData.treeTop);
  ratio = clamp01(ratio);
  return mixRgb(start, end, ratio);
}



function applyShadingForTreeData(rgb, shade, treeData) {
  if (!rgb) return [0, 0, 0];
  var intensity = treeData.lightIntensity;
  var amount = (shade - 0.5) * 2 * intensity;
  if (amount > 0) {
    return mixRgb(rgb, [255, 255, 255], amount);
  }
  if (amount < 0) {
    return mixRgb(rgb, [0, 0, 0], -amount);
  }
  return rgb.slice();
}

function hexToRgb(hex) {
  if (typeof hex !== "string") return null;
  var normalized = hex.trim();
  if (!/^#?[0-9a-fA-F]{6}$/.test(normalized)) return null;
  if (normalized[0] === "#") {
    normalized = normalized.slice(1);
  }
  var bigint = parseInt(normalized, 16);
  return [
    (bigint >> 16) & 255,
    (bigint >> 8) & 255,
    bigint & 255
  ];
}

function rgbToHex(rgb) {
  if (!rgb) return "#000000";
  return "#" + rgb.map(function (value) {
    var clamped = Math.max(0, Math.min(255, Math.round(value)));
    return clamped.toString(16).padStart(2, "0");
  }).join("");
}

function mixRgb(a, b, t) {
  t = clamp01(t);
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ];
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}


function startMasterAnimation() {
  if (masterAnimationId) return; // Already running
  
  function masterAnimate() {
    const startTime = performance.now();
    


    // Clear only the animated (top) canvas this frame
    // Clear only the animated (top) canvas this frame
    tree.clearCanvas();

    // ---- Depth-correct composite when growing ----
    const finishedList = forestMode
      ? forestTrees
      : (completedSingleTree ? [completedSingleTree] : []);

    const compositeNow =
      settings.depthMode && growingTrees.length > 0 && finishedList.length > 0;

    // Toggle forest visibility on the static layer
    const desiredShowForest = !compositeNow;
    if (showForestOnStatic !== desiredShowForest) {
      showForestOnStatic = desiredShowForest;
      staticDirty = true;
    }
    repaintStaticLayer();          // static = background only when compositing

    if (compositeNow) {
      // Paint background on the live canvas for this frame
      paintBackground();

      // One mixed, depth-sorted draw list: far (small v) -> near (big v)
      const items = [
        ...finishedList.map(t => ({ kind: 'finished', t })),
        ...growingTrees.map((t, idx) => ({ kind: 'growing', t, idx }))
      ].sort((a, b) => depthSortKey(a.t) - depthSortKey(b.t));

      const doneIdx = [];
      let hasGrowingTrees = false;

      for (const it of items) {
        if (it.kind === 'finished') {
          drawFinishedTree(it.t);
        } else {
          const still = animateTreeData(it.t);  // draws progressive frame
          if (still) hasGrowingTrees = true;
          else doneIdx.push(it.idx);
        }
      }

      // Remove newly finished from the growing list and persist them
      if (doneIdx.length) {
        doneIdx.sort((a, b) => b - a).forEach(i => {
          const t = growingTrees[i];
          if (!t) return;
          growingTrees.splice(i, 1);
          if (forestMode) {
            storeCompletedTreeFromData(t);
            forestDirty = true;
          } else {
            completedSingleTree = snapshotFromTreeData(t);
          }
        });
      }

      // Schedule next frame
      masterAnimationId = requestAnimationFrame(masterAnimate);
      return;  // IMPORTANT: skip the old non-composite path this frame
    }


    

    // When idle in single-tree mode, keep the last tree visible.
    // (In forest mode, do nothing here — the static layer shows the forest.)
    if (!growingTrees.length && !forestMode && completedSingleTree) {
      drawCompletedSingleTree();
    }

    // (no forest redraw here)


    
    // Animate all growing trees
    let hasGrowingTrees = false;
    let completedCount = 0;
    const currentTime = Date.now();

    // 0) Pre-pass: force-complete any stuck trees (keep your old behaviour)
    for (let i = growingTrees.length - 1; i >= 0; i--) {
      const treeData = growingTrees[i];
      const treeAge = currentTime - treeData.createdAt;

      if (treeAge > 30000) {
        console.warn(`Force completing stuck tree after ${treeAge}ms`);
        growingTrees.splice(i, 1);
        completedCount++;
        if (forestMode) {
          storeCompletedTreeFromData(treeData);
          forestDirty = true;
        } else {
          completedSingleTree = snapshotFromTreeData(treeData);
        }
      }
    }

    // 1) Build draw order
    //    - If Depth Mode ON: top (far/smaller) first → bottom (near/larger) last
    //    - If Depth Mode OFF: keep original reversed ordering (most recent first)
    const order = (() => {
      if (!settings.depthMode) {
        // mimic your original reverse loop visually
        return growingTrees.map((t, idx) => ({ idx, key: -idx }))
                           .sort((a, b) => a.key - b.key);
      }

      // Depth mode: use uv.v if present, otherwise normalise y by canvas height
      return growingTrees.map((t, idx) => {
        let v;
        if (t.uv && typeof t.uv.v === 'number') {
          v = t.uv.v; // 0 = top (far), 1 = bottom (near)
        } else {
          const y = t.uv ? uvToCanvasXY(t.uv).y : (t.treeY || 0);
          v = y / Math.max(1, tree.stageHeight);
        }
        return { idx, key: v };
      }).sort((a, b) => a.key - b.key); // far → near
    })();

    // 2) Draw in the chosen order and collect finished indices
    const finished = [];
    for (const { idx } of order) {
      const treeData = growingTrees[idx];
      if (!treeData) continue; // may have been removed in pre-pass

      const stillGrowing = animateTreeData(treeData); // draws this tree
      if (stillGrowing) {
        hasGrowingTrees = true;
      } else {
        finished.push(idx);
      }
    }

    // 3) Remove finished trees and persist them as before
    if (finished.length) {
      finished.sort((a, b) => b - a).forEach(i => {
        const treeData = growingTrees[i];
        if (!treeData) return;
        growingTrees.splice(i, 1);
        completedCount++;

        if (forestMode) {
          storeCompletedTreeFromData(treeData);
          forestDirty = true;
        } else {
          completedSingleTree = snapshotFromTreeData(treeData);
        }
      });
    }

    
    // Performance monitoring
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    // Log performance info every 60 frames (roughly once per second at 60fps)
    if (DEBUG_LOG && frameCount % 60 === 0) {
      console.log(`Animation frame: ${growingTrees.length} growing, ${forestTrees.length} completed, ${duration.toFixed(2)}ms`);
    }    
    frameCount++;
    
    // Continue animation if there are growing trees or forest mode is active
    if (hasGrowingTrees || forestMode) {
      masterAnimationId = requestAnimationFrame(masterAnimate);
    } else {
      masterAnimationId = null;
      frameCount = 0;
    }
  }
  
  masterAnimationId = requestAnimationFrame(masterAnimate);
}

let frameCount = 0; // For performance monitoring

function animateTreeData(treeData) {
  // Lock to background and compute per-frame scale once
  if (treeData.uv) {
    const p = uvToCanvasXY(treeData.uv);
    treeData.treeX = p.x;
    treeData.treeY = p.y;
  }
  const s = scaledTreeRenderScale(treeData);

  // Apply a single transform for the whole draw
  tree.ctx.save();
  tree.ctx.translate(treeData.treeX, treeData.treeY);
  tree.ctx.scale(s, s);
  tree.ctx.translate(-treeData.treeX, -treeData.treeY);
  // Shift geometry from old origin -> new origin before scaling-about-new-origin
  const dx = treeData.treeX - treeData.originX;
  const dy = treeData.treeY - treeData.originY;
  tree.ctx.translate(dx, dy);
  let stillGrowing = false;

  // Draw fully completed depths (0 .. currentDepth-1)
  for (let d = 0; d < treeData.currentDepth && d < treeData.depth; d++) {
    for (let k = 0; k < treeData.branches[d].length; k++) {
      const branch = treeData.branches[d][k];
      tree.ctx.beginPath();
      tree.ctx.moveTo(branch.startX, branch.startY);
      tree.ctx.lineTo(branch.endX, branch.endY);
      tree.ctx.lineWidth = branch.lineWidth;
      tree.ctx.strokeStyle = getBranchStrokeStyleForTreeData(tree.ctx, branch, treeData);
      tree.ctx.stroke();
      tree.ctx.closePath();
    }
  }

  // Animate the current depth
  if (treeData.currentDepth < treeData.depth) {
    let currentDone = true;

    for (let k = 0; k < treeData.branches[treeData.currentDepth].length; k++) {
      const branch = treeData.branches[treeData.currentDepth][k];
      if (branch.cntFrame < branch.frame) {
        branch.draw(tree.ctx, treeData.growthSpeed); // updates its own cntFrame
        stillGrowing = true;
        currentDone = false;
      } else {
        tree.ctx.beginPath();
        tree.ctx.moveTo(branch.startX, branch.startY);
        tree.ctx.lineTo(branch.endX, branch.endY);
        tree.ctx.lineWidth = branch.lineWidth;
        tree.ctx.strokeStyle = getBranchStrokeStyleForTreeData(tree.ctx, branch, treeData);
        tree.ctx.stroke();
        tree.ctx.closePath();
      }
    }

    if (currentDone) {
      treeData.currentDepth++;
      stillGrowing = true;
      if (treeData.currentDepth >= treeData.depth) {
        const age = Date.now() - treeData.createdAt;
        console.log(`Tree completed: depth ${treeData.currentDepth}/${treeData.depth}, age: ${age}ms`);
      }
    }
  }

  tree.ctx.restore(); // exactly one restore for one save
  return stillGrowing;
}



function drawTreeAt(x, y, opts) {
  applySettingsToTree();
  const treeData = createNewTreeData(x, y, opts?.uv);

  // Show the sampled color in the disabled picker so it matches the result
  if (settings.colorMode === 'baseGradient') {
    // purely UI — keeps controls in sync; rendering uses treeData.baseColorHex
    if (controls.gradientStart) controls.gradientStart.value = treeData.baseColorHex;
    // if you also want settings to mirror it:
    // settings.gradientStart = treeData.baseColorHex;
  }

  growingTrees.push(treeData);
  startMasterAnimation();
}




function snapshotFromTreeData(treeData) {
  return {
    branches: stripBranches(treeData.branches.slice(0, treeData.depth)),
    treeX: treeData.treeX,
    treeY: treeData.treeY,
    originX: treeData.originX,
    originY: treeData.originY,
    treeTop: treeData.treeTop,
    depth: treeData.depth,
    treeScale: treeData.treeScale,
    branchWidth: treeData.branchWidth,
    colorMode: treeData.colorMode,
    color: treeData.color,
    gradientStart: treeData.gradientStart,
    gradientEnd: treeData.gradientEnd,
    lightDirection: treeData.lightDirection,
    lightIntensity: treeData.lightIntensity,
    seed: treeData.seed,
    renderScale: treeData.renderScale,
    renderScaleBase: treeData.renderScaleBase,
    uv: treeData.uv,
    baseColorHex: treeData.baseColorHex,
  };
}


function storeCompletedTreeFromData(treeData) {
  if (!forestMode) return;
  
  // Create a snapshot of the tree data
  const completedTree = {
    branches: stripBranches(treeData.branches.slice(0, treeData.depth)),
    treeX: treeData.treeX,
    treeY: treeData.treeY,
    originX: treeData.originX,
    originY: treeData.originY,
    treeTop: treeData.treeTop,
    depth: treeData.depth,
    treeScale: treeData.treeScale,
    branchWidth: treeData.branchWidth,
    colorMode: treeData.colorMode,
    color: treeData.color,
    gradientStart: treeData.gradientStart,
    gradientEnd: treeData.gradientEnd,
    lightDirection: treeData.lightDirection,
    lightIntensity: treeData.lightIntensity,
    seed: treeData.seed,
    renderScale: treeData.renderScale,
    renderScaleBase: treeData.renderScaleBase,
    uv: treeData.uv,
    baseColorHex: treeData.baseColorHex,
  };
  
  forestTrees.push(completedTree);
  forestDirty = true;
  staticDirty = true;
}

function storeCompletedTreeFromInstance(treeInstance) {
  if (!forestMode) return;
  
  // Create a snapshot of the tree instance data
  const completedTree = {
    branches: JSON.parse(JSON.stringify(treeInstance.branches)),
    treeX: treeInstance.treeX,
    treeY: treeInstance.treeY,
    treeTop: treeInstance.treeTop,
    depth: treeInstance.depth,
    treeScale: treeInstance.treeScale,
    branchWidth: treeInstance.branchWidth,
    colorMode: treeInstance.colorMode,
    color: treeInstance.color,
    gradientStart: treeInstance.gradientStart,
    gradientEnd: treeInstance.gradientEnd,
    lightDirection: treeInstance.lightDirection,
    lightIntensity: treeInstance.lightIntensity,
    seed: treeInstance.seed
  };
  
  forestTrees.push(completedTree);
}

function storeCompletedTree() {
  if (!forestMode) return;
  
  // Create a snapshot of the current tree data
  const completedTree = {
    branches: JSON.parse(JSON.stringify(tree.branches)),
    treeX: tree.treeX,
    treeY: tree.treeY,
    treeTop: tree.treeTop,
    depth: tree.depth,
    treeScale: tree.treeScale,
    branchWidth: tree.branchWidth,
    colorMode: tree.colorMode,
    color: tree.color,
    gradientStart: tree.gradientStart,
    gradientEnd: tree.gradientEnd,
    lightDirection: tree.lightDirection,
    lightIntensity: tree.lightIntensity,
    seed: tree.seed
  };
  
  forestTrees.push(completedTree);
}

function drawForestTrees() {
  tree.clearCanvas();
  paintBackground();
  if (!forestMode || forestTrees.length === 0) return;

  // Prepare a sorted list when Depth Mode is ON
  const drawList = forestTrees.map(t => {
    if (t.uv) {
      const p = uvToCanvasXY(t.uv);
      t.treeX = p.x; t.treeY = p.y;
    }
    return t;
  });

  if (settings.depthMode) {
    drawList.sort((a, b) => depthSortKey(a) - depthSortKey(b));
  }

  for (const t of drawList) {
    const s = scaledTreeRenderScale(t);
    tree.ctx.save();
    tree.ctx.translate(t.treeX, t.treeY);
    tree.ctx.scale(s, s);
    tree.ctx.translate(-t.treeX, -t.treeY);
    const dx = t.treeX - (t.originX ?? t.treeX);
    const dy = t.treeY - (t.originY ?? t.treeY);
    tree.ctx.translate(dx, dy);

    for (let d = 0; d < t.depth && d < t.branches.length; d++) {
      for (let k = 0; k < t.branches[d].length; k++) {
        const b = t.branches[d][k];
        tree.ctx.beginPath();
        tree.ctx.moveTo(b.startX, b.startY);
        tree.ctx.lineTo(b.endX, b.endY);
        tree.ctx.lineWidth = b.lineWidth;
        tree.ctx.strokeStyle = getBranchStrokeStyleForTreeData(tree.ctx, b, t);
        tree.ctx.stroke();
        tree.ctx.closePath();
      }
    }
    tree.ctx.restore();
  }
}



function drawCompletedSingleTree() {
  tree.clearCanvas();
  paintBackground();

  const t = completedSingleTree;
  if (!t) return;

  if (t.uv) {
    const p = uvToCanvasXY(t.uv);
    t.treeX = p.x;
    t.treeY = p.y;
  }
  const s = scaledTreeRenderScale(t);

  tree.ctx.save();
  tree.ctx.translate(t.treeX, t.treeY);
  tree.ctx.scale(s, s);
  tree.ctx.translate(-t.treeX, -t.treeY);

  // ✅ anchor fix for completed single tree
  const dx = t.treeX - (t.originX ?? t.treeX);
  const dy = t.treeY - (t.originY ?? t.treeY);
  tree.ctx.translate(dx, dy);

  for (let d = 0; d < t.depth && d < t.branches.length; d++) {
    for (let k = 0; k < t.branches[d].length; k++) {
      const branch = t.branches[d][k];
      tree.ctx.beginPath();
      tree.ctx.moveTo(branch.startX, branch.startY);
      tree.ctx.lineTo(branch.endX, branch.endY);
      tree.ctx.lineWidth = branch.lineWidth;
      tree.ctx.strokeStyle = getBranchStrokeStyleForTreeData(tree.ctx, branch, t);
      tree.ctx.stroke();
      tree.ctx.closePath();
    }
  }

  tree.ctx.restore();
}

function depthScaleForUV(uv) {
  const v = Math.min(1, Math.max(0, uv?.v ?? 1));
  const s = clamp(Number(settings.depthStrength) || 0, 0, 3); // was 1.5
  const minFactor = Math.max(0.02, 1 - s);                    // was 0.1 → allow much smaller at top
  const gamma = 1 + s * 0.8;                                  // curve for extra punch
  const shaped = Math.pow(v, gamma);
  return minFactor + (1 - minFactor) * shaped;
}



function redrawFromLastPoint() {
  // Stop master animation
  if (masterAnimationId) {
    cancelAnimationFrame(masterAnimationId);
    masterAnimationId = null;
  }
  
  // Clear growing trees
  growingTrees = [];
  
  // Clear canvas and forest trees if not in forest mode
  if (!forestMode) {
    tree.clearCanvas();
    forestTrees = [];
  }
  
  if (lastAnchorUV) {
    const spawn = uvToCanvasXY(lastAnchorUV);
    drawTreeAt(spawn.x, spawn.y, { uv: lastAnchorUV });
  } else if (lastClick) {
    // Fall back to converting the old pixel click to UV once
    const uv = canvasToImageUV(lastClick);
    const spawn = uvToCanvasXY(uv);
    drawTreeAt(spawn.x, spawn.y, { uv });
  }
  
}

function withCanvasPosition(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top
  };
}

function updateColorInputsVisibility() {
  const mode = settings.colorMode;
  const useGradient = (mode === 'gradient' || mode === 'baseGradient');

  // Solid vs gradient visibility
  controls.solidGroup.style.display = mode === 'solid' ? 'flex' : 'none';
  controls.gradientGroups.forEach((group) => {
    group.style.display = useGradient ? 'flex' : 'none';
  });

  // In baseGradient, start color is sampled; disable that input
  const startGroup = controls.gradientStart.closest('.control-group');
  if (mode === 'baseGradient') {
    controls.gradientStart.disabled = true;
    if (startGroup) startGroup.style.opacity = 0.6;
    controls.gradientStart.title = 'Start color comes from the background at the base';
  } else {
    controls.gradientStart.disabled = false;
    if (startGroup) startGroup.style.opacity = 1;
    controls.gradientStart.title = '';
  }
}


function refreshControls() {
  controls.depth.value = settings.depth;
  controls.growthSpeed.value = settings.growthSpeed;
  controls.treeScale.value = settings.treeScale;
  controls.branchWidth.value = settings.branchWidth;
  controls.lightDirection.value = settings.lightDirection;
  controls.lightIntensity.value = settings.lightIntensity;
  controls.colorMode.value = settings.colorMode;
  controls.color.value = sanitizeColor(settings.color, '#2c7a2c');
  controls.gradientStart.value = sanitizeColor(settings.gradientStart, '#8b4513');
  controls.gradientEnd.value = sanitizeColor(settings.gradientEnd, '#228b22');
  controls.seed.value = settings.seed ?? '';
  controls.autoSeed.checked = autoRandomSeed;
  controls.forestMode.checked = forestMode;
  if (controls.depthMode) controls.depthMode.checked = settings.depthMode;
  if (controls.depthStrength) controls.depthStrength.value = String(settings.depthStrength);
  updateColorInputsVisibility();
  updateDepthControlsVisibility();
  updateColorInputsVisibility();
  const s = String(settings.renderScale ?? 1);
  if (controls.renderScaleInput) controls.renderScaleInput.value = s;
  if (controls.renderScaleRange) controls.renderScaleRange.value = s;
  updateThemeControlsUI();
}

function setSeedValue(newSeed, { refresh = true, redraw = true } = {}) {
  const stringValue = newSeed === undefined || newSeed === null ? '' : String(newSeed).trim();
  settings.seed = stringValue;
  if (refresh) {
    controls.seed.value = settings.seed;
  }
  if (redraw && lastClick) {
    redrawFromLastPoint();
  }
}

function randomizeSeed({ redraw = true } = {}) {
  const seed = randomInt(1, 999_999_999);
  setSeedValue(seed, { refresh: true, redraw });
}

function randomizeTreeSettings() {
  settings.depth = clamp(randomInt(randomRanges.depth[0], randomRanges.depth[1]), 1, 11);
  settings.growthSpeed = clamp(randomFloat(randomRanges.growthSpeed[0], randomRanges.growthSpeed[1]), 0.5, 5);
  settings.treeScale = clamp(randomFloat(randomRanges.treeScale[0], randomRanges.treeScale[1]), 0.2, 4);
  settings.branchWidth = clamp(randomFloat(randomRanges.branchWidth[0], randomRanges.branchWidth[1]), 0.2, 5);
  settings.lightDirection = clamp(randomInt(randomRanges.lightDirection[0], randomRanges.lightDirection[1]), 0, 359);
  settings.lightIntensity = clamp(randomFloat(randomRanges.lightIntensity[0], randomRanges.lightIntensity[1]), 0, 1);

  const useGradient = Math.random() < 0.7;
  settings.colorMode = useGradient ? 'gradient' : 'solid';
  if (useGradient) {
    settings.gradientStart = randomHexColor();
    let end = randomHexColor();
    if (end === settings.gradientStart) {
      end = randomHexColor();
    }
    settings.gradientEnd = end;
    settings.color = randomHexColor();
  } else {
    const solid = randomHexColor();
    settings.color = solid;
    settings.gradientStart = solid;
    settings.gradientEnd = solid;
  }

  randomizeSeed({ redraw: false });
  refreshControls();
  if (typeof tree.setLightDirection === 'function') {
    tree.setLightDirection(settings.lightDirection);
  }
  if (typeof tree.setLightIntensity === 'function') {
    tree.setLightIntensity(settings.lightIntensity);
  }
  redrawFromLastPoint();
}

function syncSettingsFromInputs() {
  settings.depth = clamp(Number(controls.depth.value) || defaultSettings.depth, 1, 11);
  settings.growthSpeed = clamp(Number(controls.growthSpeed.value) || defaultSettings.growthSpeed, 0.5, 5);
  settings.treeScale = clamp(Number(controls.treeScale.value) || defaultSettings.treeScale, 0.2, 4);
  settings.branchWidth = clamp(Number(controls.branchWidth.value) || defaultSettings.branchWidth, 0.2, 5);
  const num = controls.renderScaleInput ? Number(controls.renderScaleInput.value) : NaN;
  const rng = controls.renderScaleRange ? Number(controls.renderScaleRange.value) : NaN;
  const chosen = Number.isFinite(num) ? num : (Number.isFinite(rng) ? rng : 1);
  settings.renderScale = clamp(chosen, 0.02, 8);  // was 0.2–3
  const rawDirection = Number(controls.lightDirection.value);
  if (Number.isFinite(rawDirection)) {
    let normalized = rawDirection % 360;
    if (normalized < 0) normalized += 360;
    settings.lightDirection = normalized;
  }
  const rawIntensity = Number(controls.lightIntensity.value);
  if (Number.isFinite(rawIntensity)) {
    settings.lightIntensity = clamp(rawIntensity, 0, 1);
  }
  const cm = controls.colorMode.value;
  settings.colorMode = (cm === 'solid' || cm === 'baseGradient') ? cm : 'gradient'; 
  settings.depthMode = !!(controls.depthMode && controls.depthMode.checked);
  settings.depthStrength = clamp(Number(controls.depthStrength?.value) || 0.6, 0, 3);
  updateDepthControlsVisibility(); 
  settings.color = sanitizeColor(controls.color.value, settings.color);
  settings.gradientStart = sanitizeColor(controls.gradientStart.value, settings.gradientStart);
  settings.gradientEnd = sanitizeColor(controls.gradientEnd.value, settings.gradientEnd);
  const seedInputValue = controls.seed.value.trim();
  settings.seed = seedInputValue;
  updateColorInputsVisibility();
}

if (controls.depthMode) {
  controls.depthMode.addEventListener('change', () => {
    syncSettingsFromInputs();
    // Depth Mode affects trees you plant from now on.
  });
}
if (controls.depthStrength) {
  controls.depthStrength.addEventListener('input', () => {
    syncSettingsFromInputs();
    // Strength affects new trees; existing ones keep their planted scale.
  });
}

function drawFinishedTree(t, ctx = tree.ctx) {
  // Keep tree glued to background
  if (t.uv) {
    const p = uvToCanvasXY(t.uv);
    t.treeX = p.x; t.treeY = p.y;
  }
  const s = scaledTreeRenderScale(t);

  ctx.save();
  ctx.translate(t.treeX, t.treeY);
  ctx.scale(s, s);
  ctx.translate(-t.treeX, -t.treeY);

  // anchor delta so gradients/shading stay stable
  const dx = t.treeX - (t.originX ?? t.treeX);
  const dy = t.treeY - (t.originY ?? t.treeY);
  ctx.translate(dx, dy);

  for (let d = 0; d < t.depth && d < t.branches.length; d++) {
    for (let k = 0; k < t.branches[d].length; k++) {
      const b = t.branches[d][k];
      ctx.beginPath();
      ctx.moveTo(b.startX, b.startY);
      ctx.lineTo(b.endX, b.endY);
      ctx.lineWidth = b.lineWidth;
      ctx.strokeStyle = getBranchStrokeStyleForTreeData(ctx, b, t);
      ctx.stroke();
      ctx.closePath();
    }
  }
  ctx.restore();
}



function updateDepthControlsVisibility() {
  if (controls.depthStrengthGroup) {
    controls.depthStrengthGroup.style.display = settings.depthMode ? 'flex' : 'none';
  }
}


function onRenderScaleChange(val) {
  settings.renderScale = clamp(Number(val) || 1, 0.02, 3);
  if (controls.renderScaleInput) controls.renderScaleInput.value = String(settings.renderScale);
  if (controls.renderScaleRange) controls.renderScaleRange.value  = String(settings.renderScale);
  if (lastClick) redrawFromLastPoint();
  if (completedSingleTree) { completedSingleTree.renderScaleBase = settings.renderScale; drawCompletedSingleTree(); }
}

if (controls.renderScaleInput) {
  controls.renderScaleInput.addEventListener('input', (e) => onRenderScaleChange(e.target.value));
}
if (controls.renderScaleRange) {
  controls.renderScaleRange.addEventListener('input', (e) => onRenderScaleChange(e.target.value));
}

controls.depth.addEventListener('change', () => {
  syncSettingsFromInputs();
  if (lastClick) redrawFromLastPoint();
});
controls.growthSpeed.addEventListener('change', () => {
  syncSettingsFromInputs();
  if (lastClick) redrawFromLastPoint();
});
controls.treeScale.addEventListener('change', () => {
  syncSettingsFromInputs();
  if (lastClick) redrawFromLastPoint();
});
controls.branchWidth.addEventListener('change', () => {
  syncSettingsFromInputs();
  if (lastClick) redrawFromLastPoint();
});
controls.lightDirection.addEventListener('change', () => {
  syncSettingsFromInputs();
  if (typeof tree.setLightDirection === 'function') {
    tree.setLightDirection(settings.lightDirection);
  }
  if (lastClick) redrawFromLastPoint();
});
controls.lightIntensity.addEventListener('input', () => {
  syncSettingsFromInputs();
  if (typeof tree.setLightIntensity === 'function') {
    tree.setLightIntensity(settings.lightIntensity);
  }
  if (lastClick) redrawFromLastPoint();
});
controls.colorMode.addEventListener('change', () => {
  syncSettingsFromInputs();
  refreshControls();
  if (lastClick) redrawFromLastPoint();
});
controls.color.addEventListener('change', () => {
  syncSettingsFromInputs();
  if (lastClick) redrawFromLastPoint();
});
controls.gradientStart.addEventListener('change', () => {
  syncSettingsFromInputs();
  if (lastClick) redrawFromLastPoint();
});
controls.gradientEnd.addEventListener('change', () => {
  syncSettingsFromInputs();
  if (lastClick) redrawFromLastPoint();
});
controls.seed.addEventListener('change', () => {
  syncSettingsFromInputs();
  if (lastClick) redrawFromLastPoint();
});

controls.autoSeed.addEventListener('change', () => {
  autoRandomSeed = controls.autoSeed.checked;
});

if (controls.devMode) {
  controls.devMode.checked = isDevMode();
  controls.devMode.addEventListener('change', () => setDevMode(controls.devMode.checked));
}

controls.forestMode.addEventListener('change', () => {
  forestMode = controls.forestMode.checked;
  if (!forestMode) {
    // Stop master animation
    if (masterAnimationId) {
      cancelAnimationFrame(masterAnimationId);
      masterAnimationId = null;
    }
    
    // Clear growing trees and forest trees when exiting forest mode
    growingTrees = [];
    forestTrees = [];
    tree.clearCanvas();
    forestDirty = false;
    } else {
        forestDirty = true;
        staticDirty = true;
        repaintStaticLayer();
      }
});

controls.redrawBtn.addEventListener('click', () => redrawFromLastPoint());
controls.randomizeTreeBtn.addEventListener('click', () => randomizeTreeSettings());
controls.randomizeSeedBtn.addEventListener('click', () => randomizeSeed());
function clearCanvas() {
  completedSingleTree = null;
  // Stop master animation
  if (masterAnimationId) {
    cancelAnimationFrame(masterAnimationId);
    masterAnimationId = null;
  }
  
  // Clear growing trees
  growingTrees = [];
  
  forestTrees = [];           // clear finished trees
  tree.clearCanvas();         // clear live/top canvas
  lastClick = null;
  lastAnchorUV = null;        // (optional) forget last anchor
  // ✅ also clear the static layer (where finished trees are drawn)
  forestDirty = false;
  staticDirty = true;
  repaintStaticLayer();
}

controls.clearBtn.addEventListener('click', () => {
  clearCanvas();
});
controls.savePresetBtn.addEventListener('click', () => savePreset());
controls.loadPresetBtn.addEventListener('click', () => loadPreset());

canvas.addEventListener('mousedown', (evt) => {
  if (evt.button !== 0) return;
  const pos = withCanvasPosition(evt);
  if (autoRandomSeed) {
    setSeedValue(randomInt(1, 999_999_999), { refresh: true, redraw: false });
  }
  lastClick = pos;

  // NEW: compute persistent UV anchor
  lastAnchorUV = canvasToImageUV(pos);

  if (!forestMode) {
    completedSingleTree = null; // starting a fresh growth
    if (masterAnimationId) { cancelAnimationFrame(masterAnimationId); masterAnimationId = null; }
    growingTrees = [];
    tree.clearCanvas();
    forestTrees = [];
  }

  // pass the UV anchor down so the tree stores it
  drawTreeAt(pos.x, pos.y, { uv: lastAnchorUV });
});


window.addEventListener('resize', () => {
  resizeStatic();
  staticDirty = true;
  repaintStaticLayer();
  // 1) Resize the canvas FIRST so stageWidth/Height are fresh
  if (typeof tree.resize === 'function') tree.resize();

  // 2) Recompute CSS cover transform for the new container size
  updateCoverTransform();

  // 3) Permanently upgrade any old canvas-space anchors to image-space
  normalizeAnchorsToImageSpace();

  // 4) Redraw whatever exists (don’t auto-spawn a new tree)
  tree.clearCanvas();

  if (forestMode && forestTrees.length) {
    forestDirty = true;
    drawForestTrees();
    return;
  }

  if (growingTrees.length) {
    startMasterAnimation();
    return;
  }

  if (completedSingleTree) {
    drawCompletedSingleTree();
    return;
  }
});






async function savePreset() {
  try {
    const snapshot = cloneSettings(settings);
    await window.clickTreeAPI?.savePreset(snapshot);
  } catch (error) {
    console.error('Failed to save preset:', error);
  }
}

async function loadPreset() {
  try {
    const loaded = await window.clickTreeAPI?.loadPreset();
    if (!loaded) return;
    applyPreset(loaded);
  } catch (error) {
    console.error('Failed to load preset:', error);
  }
}

// Build a linear gradient in tree-local coordinates.
// Call this AFTER you've applied the transform for the tree.
function makeTreeGradient(ctx, t) {
  // Direction and length are in "tree units" so the look is stable across resizes
  const L = t.lightDir || { x: 0.6, y: -0.8 };  // unit-ish light direction
  const len = t.lightRange || 380;              // how far light fades across the tree

  // Center the gradient roughly around the seed/origin
  const cx = t.originX ?? t.treeX;
  const cy = t.originY ?? t.treeY;

  const x0 = cx - L.x * len;
  const y0 = cy - L.y * len;
  const x1 = cx + L.x * len;
  const y1 = cy + L.y * len;

  const g = ctx.createLinearGradient(x0, y0, x1, y1);

  // Use your existing palette or keep deterministic per-tree stops
  const stops = t.lightStops || [
    { p: 0.00, c: '#ffe5be' },  // highlight
    { p: 0.45, c: '#c88a5a' },  // mid
    { p: 1.00, c: '#2a1c12' },  // shadow
  ];
  for (const s of stops) g.addColorStop(s.p, s.c);
  return g;
}


function applyPreset(preset) {
  if (!preset || typeof preset !== 'object') return;
  if (preset.depth !== undefined) {
    settings.depth = clamp(Number(preset.depth), 1, 11);
  }
  if (preset.growthSpeed !== undefined) {
    settings.growthSpeed = clamp(Number(preset.growthSpeed), 0.5, 5);
  }
  if (preset.treeScale !== undefined) {
    settings.treeScale = clamp(Number(preset.treeScale), 0.2, 4);
  }
  if (preset.branchWidth !== undefined) {
    settings.branchWidth = clamp(Number(preset.branchWidth), 0.2, 5);
  }
  if (preset.lightIntensity !== undefined) {
    const numericIntensity = Number(preset.lightIntensity);
    if (Number.isFinite(numericIntensity)) {
      settings.lightIntensity = clamp(numericIntensity, 0, 1);
    }
  }
  if (preset.lightDirection !== undefined) {
    const numericDir = Number(preset.lightDirection);
    if (Number.isFinite(numericDir)) {
      let normalized = numericDir % 360;
      if (normalized < 0) normalized += 360;
      settings.lightDirection = normalized;
    }
  }
  if (preset.colorMode !== undefined) {
    const cm = String(preset.colorMode);
    settings.colorMode = (cm === 'solid' || cm === 'baseGradient') ? cm : 'gradient';
  }  
  if (preset.color !== undefined) {
    settings.color = sanitizeColor(preset.color, settings.color);
  }
  if (preset.gradientStart !== undefined) {
    settings.gradientStart = sanitizeColor(preset.gradientStart, settings.gradientStart);
  }
  if (preset.gradientEnd !== undefined) {
    settings.gradientEnd = sanitizeColor(preset.gradientEnd, settings.gradientEnd);
  }
  if (preset.seed !== undefined) {
    settings.seed = String(preset.seed);
  }
  refreshControls();
  redrawFromLastPoint();
}

if (window.clickTreeAPI?.onMenuAction) {
  window.clickTreeAPI.onMenuAction((action) => {
    if (action === 'save-preset') {
      savePreset();
    } else if (action === 'load-preset') {
      loadPreset();
    }
  });
}

if (window.clickTreeAPI?.onPresetLoaded) {
  window.clickTreeAPI.onPresetLoaded((preset) => {
    if (preset) {
      applyPreset(preset);
    }
  });
}

refreshControls();

// Initialize Spotify controls and overlay after controls are ready
initSpotifyUI();

window.clickTree = {
  draw: drawTreeAt,
  clear: clearCanvas,
  randomize: randomizeTreeSettings,
  settings
};
const DEFAULT_SPOTIFY_LINK = 'https://open.spotify.com/playlist/37i9dQZF1DXc8kgYqQLMfH';

// --- YouTube Panel integration (minimal hooks) ---
// Optional: expose API key from env if available (harmless when undefined)
try {
  if (typeof window !== 'undefined' && typeof process !== 'undefined' && process.env && process.env.YOUTUBE_API_KEY) {
    window.YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
  }
} catch (_e) {}

window.YtPanel?.ensureFab?.();
window.TimerPanel?.ensureFab?.();

// === Study Timer integration: auto-grow a centered tree during Focus ===
(function(){
  // Choose the visual center in canvas UV space (0..1). Adjust if you prefer.
  // const CENTER_UV = { u: 0.5, v: 0.5, space: 'canvas' };
  const CENTER_UV = { u: 0.5, v: 0.88, space: 'canvas' };
  const FPS = 60;         // rAF target; good enough for pacing
  const FRAME_PER_DEPTH = 100; // each depth layer uses 0..100 "frames"

  function spawnStudyTree(durationSec, title) {
    if (!Number.isFinite(durationSec) || durationSec <= 1) return;

    // Optional: randomize seed so each study tree is unique
    try { setSeedValue(randomInt(1, 999_999_999), { refresh: true, redraw: false }); } catch(_){ }

    // In single-tree mode, clear the previous live drawing
    if (!forestMode) {
      completedSingleTree = null;
      growingTrees = [];
      tree.clearCanvas();
    }

    // Convert center UV to canvas XY and plant
    const spawn = uvToCanvasXY(CENTER_UV);
    drawTreeAt(spawn.x, spawn.y, { uv: CENTER_UV });

    // Calibrate growth so the whole tree finishes exactly in durationSec.
    // Total time ≈ (depth * FRAME_PER_DEPTH) / (growthSpeed * FPS)
    // => growthSpeed = (depth * FRAME_PER_DEPTH) / (FPS * durationSec)
    const t = growingTrees[growingTrees.length - 1];
    if (t) {
      const targetDepth = t.depth || settings.depth || 8;
      t.growthSpeed = (targetDepth * FRAME_PER_DEPTH) / (FPS * durationSec);
    }

    startMasterAnimation();
  }

  // Start/resume from timer
  window.addEventListener('study:focus-start', (e) => {
    const { durationSec, title } = e.detail || {};
    spawnStudyTree(durationSec, title);
  });
  window.addEventListener('study:focus-resume', (e) => {
    // Keep growing with whatever speed was set; just ensure animation is running
    startMasterAnimation();
  });
  window.addEventListener('study:focus-pause', () => {
    // Pause growth by stopping the animation loop (state is preserved)
    if (masterAnimationId) { cancelAnimationFrame(masterAnimationId); masterAnimationId = null; }
  });
  // On completion we do nothing here yet — later you can snapshot into a card.
})();

// -- Card snapshot: build a TRANSPARENT PNG with only the finished tree and announce it --
(function(){
  // Draw the finished tree onto a transparent offscreen canvas, crop its alpha bounds,
  // then fit+center it into (targetW x targetH) with padding.
  function makeTransparentTreePNG(targetW = 300, targetH = 400, padding = 20) {
    try {
      if (!completedSingleTree) return null;

      // 1) Draw only the tree (no background) in stage coordinates.
      const pr = tree.pixelRatio || 1;
      const src = document.createElement('canvas');
      src.width  = Math.max(1, Math.floor(tree.stageWidth  * pr));
      src.height = Math.max(1, Math.floor(tree.stageHeight * pr));
      const sctx = src.getContext('2d');
      sctx.setTransform(pr, 0, 0, pr, 0, 0); // stage coords
      drawFinishedTree(completedSingleTree, sctx);

      // 2) Find non-transparent bounds (alpha > 0).
      const img = sctx.getImageData(0, 0, src.width, src.height);
      const data = img.data;
      let minX = src.width, minY = src.height, maxX = 0, maxY = 0, found = false;
      for (let y = 0; y < src.height; y++) {
        for (let x = 0; x < src.width; x++) {
          const a = data[(y * src.width + x) * 4 + 3];
          if (a > 0) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
            found = true;
          }
        }
      }
      if (!found) return null;
      // Inflate crop box slightly to avoid 1px clipping from AA
      const padPx = Math.round((tree.pixelRatio || 1) * 6);
      minX = Math.max(0, minX - padPx);
      minY = Math.max(0, minY - padPx);
      maxX = Math.min(src.width  - 1, maxX + padPx);
      maxY = Math.min(src.height - 1, maxY + padPx);
      const cw = maxX - minX + 1;
      const ch = maxY - minY + 1;

      // 3) Fit+center the crop into the card frame.
      const out = document.createElement('canvas');
      out.width = targetW;
      out.height = targetH;
      const octx = out.getContext('2d');

      const innerW = Math.max(1, targetW - padding * 2);
      const innerH = Math.max(1, targetH - padding * 2);
      const scale = Math.min(innerW / cw, innerH / ch);
      const dw = cw * scale, dh = ch * scale;
      const dx = (targetW - dw) * 0.5;
      const dy = (targetH - dh) * 0.5;

      octx.drawImage(src, minX, minY, cw, ch, dx, dy, dw, dh);
      return out.toDataURL('image/png');
    } catch (e) {
      console.warn('Card snapshot failed', e);
      return null;
    }
  }

  function makeId() {
    return 'card_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  // Use the transparent snapshot instead of copying the live canvas
  window.addEventListener('study:cycle-complete', (e) => {
    const title = (e && e.detail && e.detail.title) ? String(e.detail.title) : 'Untitled Session';
    const previewPng = makeTransparentTreePNG(300, 400, 20);
    if (!previewPng) return;
    const hdPng = makeTransparentTreePNG(900, 1200, 40);
    const payload = {
      id: makeId(),
      title,
      png: previewPng,
      pngHd: hdPng || null,
      seed: (window.clickTree?.settings?.seed ?? ''),
      createdAt: new Date().toISOString()
    };
    window.dispatchEvent(new CustomEvent('cards:new', { detail: payload }));
  });
})();
