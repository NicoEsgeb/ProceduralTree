const defaultSettings = {
  depth: 8,
  growthSpeed: 2,
  treeScale: 1.2,
  branchWidth: 1,
  colorMode: 'gradient',
  color: '#2c7a2c',
  gradientStart: '#8B4513',
  gradientEnd: '#228B22',
  seed: '1337'
};

const canvasContainer = document.querySelector('#canvas-container');
const paneContainer = document.querySelector('#pane-container');

function parseSeed(value) {
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  if (trimmed === '') return undefined;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : undefined;
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
    seed: src.seed
  };
}

const settings = cloneSettings(defaultSettings);

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
  seed: parseSeed(settings.seed)
});

if (tree.animation) {
  cancelAnimationFrame(tree.animation);
  tree.animation = null;
}
tree.clearCanvas();

const canvas = canvasContainer.querySelector('canvas');
let lastClick = null;

function applySettingsToTree() {
  tree.depth = settings.depth;
  tree.growthSpeed = settings.growthSpeed;
  tree.treeScale = settings.treeScale;
  tree.branchWidth = settings.branchWidth;
  tree.colorMode = settings.colorMode;
  tree.color = settings.color;
  tree.gradientStart = settings.gradientStart;
  tree.gradientEnd = settings.gradientEnd;
  tree.setSeed(parseSeed(settings.seed));
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
  const x = evt.clientX - rect.left;
  const y = evt.clientY - rect.top;
  return { x, y };
}

canvas.addEventListener('mousedown', (evt) => {
  const pos = withCanvasPosition(evt);
  lastClick = pos;
  drawTreeAt(pos.x, pos.y);
});

window.addEventListener('resize', () => {
  if (!lastClick) return;
  window.requestAnimationFrame(() => {
    drawTreeAt(lastClick.x, lastClick.y);
  });
});

const pane = new Tweakpane.Pane({
  container: paneContainer,
  title: 'ClickTree Controls'
});

const depthInput = pane.addInput(settings, 'depth', {
  label: 'Depth',
  min: 1,
  max: 11,
  step: 1
});

const growthSpeedInput = pane.addInput(settings, 'growthSpeed', {
  label: 'Growth Speed',
  min: 0.5,
  max: 5,
  step: 0.1
});

const treeScaleInput = pane.addInput(settings, 'treeScale', {
  label: 'Tree Scale',
  min: 0.2,
  max: 4,
  step: 0.1
});

const branchWidthInput = pane.addInput(settings, 'branchWidth', {
  label: 'Branch Width',
  min: 0.2,
  max: 5,
  step: 0.1
});

const colorModeInput = pane.addInput(settings, 'colorMode', {
  label: 'Color Mode',
  options: {
    Gradient: 'gradient',
    Solid: 'solid'
  }
});

const colorInput = pane.addInput(settings, 'color', {
  label: 'Color',
  view: 'color'
});

const gradientStartInput = pane.addInput(settings, 'gradientStart', {
  label: 'Gradient Start',
  view: 'color'
});

const gradientEndInput = pane.addInput(settings, 'gradientEnd', {
  label: 'Gradient End',
  view: 'color'
});

const seedInput = pane.addInput(settings, 'seed', {
  label: 'Seed'
});

function updateColorInputsVisibility() {
  const isGradient = settings.colorMode === 'gradient';
  colorInput.hidden = isGradient;
  gradientStartInput.hidden = !isGradient;
  gradientEndInput.hidden = !isGradient;
}

updateColorInputsVisibility();

pane.on('change', (ev) => {
  if (ev.presetKey === 'colorMode') {
    updateColorInputsVisibility();
  }
  if (ev.presetKey === 'seed') {
    settings.seed = String(settings.seed).trim();
  }
});

const actionsFolder = pane.addFolder({ title: 'Actions' });

const redrawButton = actionsFolder.addButton({ title: 'Redraw' });
const randomizeSeedButton = actionsFolder.addButton({ title: 'Randomize Seed' });
const clearButton = actionsFolder.addButton({ title: 'Clear' });
const savePresetButton = actionsFolder.addButton({ title: 'Save Preset' });
const loadPresetButton = actionsFolder.addButton({ title: 'Load Preset' });

actionsFolder.expanded = true;

function randomizeSeed() {
  const newSeed = Math.floor(Math.random() * 1_000_000_000);
  settings.seed = String(newSeed);
  seedInput.refresh();
  redrawFromLastPoint();
}

function clearCanvas() {
  if (tree.animation) {
    cancelAnimationFrame(tree.animation);
    tree.animation = null;
  }
  tree.clearCanvas();
  lastClick = null;
}

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
  const keys = Object.keys(defaultSettings);
  let changed = false;
  keys.forEach((key) => {
    if (preset[key] === undefined || preset[key] === null) return;
    if (key === 'depth' || key === 'growthSpeed' || key === 'treeScale' || key === 'branchWidth') {
      const value = Number(preset[key]);
      if (Number.isFinite(value)) {
        if (key === 'depth') {
          settings[key] = Math.min(11, Math.max(1, Math.round(value)));
        } else if (key === 'growthSpeed') {
          settings[key] = Math.min(5, Math.max(0.5, value));
        } else if (key === 'treeScale') {
          settings[key] = Math.min(4, Math.max(0.2, value));
        } else if (key === 'branchWidth') {
          settings[key] = Math.min(5, Math.max(0.2, value));
        }
        changed = true;
      }
      return;
    }
    if (key === 'seed') {
      settings.seed = String(preset[key]);
      changed = true;
      return;
    }
    settings[key] = preset[key];
    changed = true;
  });
  if (!changed) return;
  depthInput.refresh();
  growthSpeedInput.refresh();
  treeScaleInput.refresh();
  branchWidthInput.refresh();
  colorModeInput.refresh();
  colorInput.refresh();
  gradientStartInput.refresh();
  gradientEndInput.refresh();
  seedInput.refresh();
  updateColorInputsVisibility();
  redrawFromLastPoint();
}

redrawButton.on('click', () => redrawFromLastPoint());
randomizeSeedButton.on('click', () => randomizeSeed());
clearButton.on('click', () => clearCanvas());
savePresetButton.on('click', () => savePreset());
loadPresetButton.on('click', () => loadPreset());

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

if (window.clickTreeAPI?.onPresetSaved) {
  window.clickTreeAPI.onPresetSaved(() => {
    // no-op reserved for future use
  });
}

// Expose for debugging if needed
window.clickTree = {
  draw: drawTreeAt,
  clear: clearCanvas,
  settings,
};
