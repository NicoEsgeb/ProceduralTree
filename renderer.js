const defaultSettings = {
  depth: 8,
  growthSpeed: 2,
  treeScale: 1.2,
  branchWidth: 1,
  colorMode: 'gradient',
  color: '#2c7a2c',
  gradientStart: '#8b4513',
  gradientEnd: '#228b22',
  seed: '1337',
  lightDirection: 315,
  lightIntensity: 0.5
};

const randomRanges = {
  depth: [3, 11],
  growthSpeed: [0.6, 4.5],
  treeScale: [0.5, 3.5],
  branchWidth: [0.3, 4],
  lightDirection: [0, 359],
  lightIntensity: [0.1, 1]
};

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
  solidGroup: document.querySelector('#solid-color-group'),
  gradientGroups: document.querySelectorAll('.gradient-group'),
  redrawBtn: document.querySelector('#redraw-btn'),
  randomizeTreeBtn: document.querySelector('#randomize-btn'),
  randomizeSeedBtn: document.querySelector('#randomize-seed-btn'),
  clearBtn: document.querySelector('#clear-btn'),
  savePresetBtn: document.querySelector('#save-preset-btn'),
  loadPresetBtn: document.querySelector('#load-preset-btn')
};

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
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

let autoRandomSeed = true;
let lastClick = null;

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

function drawTreeAt(x, y) {
  applySettingsToTree();
  tree.startTree(x, y);
}

function redrawFromLastPoint() {
  if (lastClick) {
    drawTreeAt(lastClick.x, lastClick.y);
  } else {
    drawTreeAt();
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
  const useGradient = settings.colorMode === 'gradient';
  controls.solidGroup.style.display = useGradient ? 'none' : 'flex';
  controls.gradientGroups.forEach((group) => {
    group.style.display = useGradient ? 'flex' : 'none';
  });
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
  updateColorInputsVisibility();
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
  settings.colorMode = controls.colorMode.value === 'solid' ? 'solid' : 'gradient';
  settings.color = sanitizeColor(controls.color.value, settings.color);
  settings.gradientStart = sanitizeColor(controls.gradientStart.value, settings.gradientStart);
  settings.gradientEnd = sanitizeColor(controls.gradientEnd.value, settings.gradientEnd);
  const seedInputValue = controls.seed.value.trim();
  settings.seed = seedInputValue;
  updateColorInputsVisibility();
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

controls.redrawBtn.addEventListener('click', () => redrawFromLastPoint());
controls.randomizeTreeBtn.addEventListener('click', () => randomizeTreeSettings());
controls.randomizeSeedBtn.addEventListener('click', () => randomizeSeed());
function clearCanvas() {
  if (tree.animation) {
    cancelAnimationFrame(tree.animation);
    tree.animation = null;
  }
  tree.clearCanvas();
  lastClick = null;
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
  drawTreeAt(pos.x, pos.y);
});

window.addEventListener('resize', () => {
  if (!lastClick) return;
  window.requestAnimationFrame(() => {
    drawTreeAt(lastClick.x, lastClick.y);
  });
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
    settings.colorMode = preset.colorMode === 'solid' ? 'solid' : 'gradient';
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

window.clickTree = {
  draw: drawTreeAt,
  clear: clearCanvas,
  randomize: randomizeTreeSettings,
  settings
};
