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
  lightIntensity: 0.5,
  renderScale: 1
};

let forestDirty = false;                // draw forest layer only when it changes
const DEBUG_LOG = false;                // disable per-frame console logs


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
  forestMode: document.querySelector('#forest-mode-input'),
  solidGroup: document.querySelector('#solid-color-group'),
  gradientGroups: document.querySelectorAll('.gradient-group'),
  redrawBtn: document.querySelector('#redraw-btn'),
  randomizeTreeBtn: document.querySelector('#randomize-btn'),
  randomizeSeedBtn: document.querySelector('#randomize-seed-btn'),
  clearBtn: document.querySelector('#clear-btn'),
  savePresetBtn: document.querySelector('#save-preset-btn'),
  loadPresetBtn: document.querySelector('#load-preset-btn'),
  renderScale: document.querySelector('#render-scale-input')
};


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

let autoRandomSeed = true;
let lastClick = null;
let forestMode = false;
let forestTrees = []; // Array to store completed trees in forest mode
let growingTrees = []; // Array to store trees currently growing
let masterAnimationId = null; // ID for the master animation loop


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

function createNewTreeData(x, y) {
  // Create a new tree data structure for parallel growth
  const treeData = {
    id: Date.now() + Math.random(), // Unique ID
    treeX: x,
    treeY: y,
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
    seed: parseSeedValue(settings.seed),
    randSeq: null,
    randCounter: 0,
    currentSeed: null,
    fullDepth: 11,
    createdAt: Date.now(), // Track when tree was created
    renderScale: settings.renderScale
  };
  
  // Initialize random sequence if seed is provided
  if (treeData.seed !== undefined) {
    const value = Number(treeData.seed);
    if (Number.isFinite(value)) {
      treeData.currentSeed = value;
      // Calculate dynamic sequence size based on tree complexity
      // Higher depth and scale = more branches = need more random numbers
      var baseCount = 10000;
      var depthMultiplier = Math.pow(2, treeData.depth); // 2^depth branches at max depth
      var scaleMultiplier = treeData.treeScale * 2; // Larger trees have more branches
      var totalCount = Math.min(50000, Math.max(10000, baseCount * depthMultiplier * scaleMultiplier / 10));
      
      treeData.randSeq = [];
      var s = value;
      for (var i = 0; i < totalCount; i++) {
        s = (s * 16807) % 2147483647;
        var rnd = (s - 1) / 2147483646;
        treeData.randSeq.push(rnd);
      }
      treeData.randCounter = 0;
      treeData.randSeqSize = totalCount;
      
      console.log(`Tree created with ${totalCount} random numbers (depth: ${treeData.depth}, scale: ${treeData.treeScale})`);
    }
  }
  
  // Limit the tree scale based on stage height and fullDepth
  var maxScale = tree.stageHeight / (13 * treeData.fullDepth);
  if (treeData.treeScale > maxScale) {
    treeData.treeScale = maxScale;
  }
  
  // Create branches array
  treeData.branches = Array.from({ length: treeData.fullDepth }, function () { return []; });
  
  // Generate the complete tree structure
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
  if (treeData.colorMode === "gradient") {
    var startColor = applyShadingForTreeData(getColorAtYForTreeData(branch.startY, treeData), shade, treeData);
    var endColor = applyShadingForTreeData(getColorAtYForTreeData(branch.endY, treeData), shade, treeData);
    // use scaled endpoints for gradient vector
    const s  = renderScale || 1;
    const p0 = scalePoint(branch.startX, branch.startY, treeData.treeX, treeData.treeY, s);
    const p1 = scalePoint(branch.endX,   branch.endY,   treeData.treeX, treeData.treeY, s);

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
  var angleRad = treeData.lightDirection * (Math.PI / 180);
  var lightX = Math.cos(angleRad);
  var lightY = Math.sin(angleRad);
  var midX = branch.midX;
  var midY = branch.midY;
  var centerX = treeData.treeX;
  var centerY;
  if (Number.isFinite(treeData.treeTop)) {
    centerY = (treeData.treeY + treeData.treeTop) / 2;
  } else {
    centerY = treeData.treeY;
  }
  var vecX = midX - centerX;
  var vecY = midY - centerY;
  var len = Math.sqrt(vecX * vecX + vecY * vecY);
  if (len > 0) {
    vecX /= len;
    vecY /= len;
  }
  var dot = vecX * (-lightX) + vecY * (-lightY);
  return clamp01((dot + 1) / 2);
}

function getColorAtYForTreeData(y, treeData) {
  var start = hexToRgb(treeData.gradientStart);
  var end = hexToRgb(treeData.gradientEnd);
  if (!start || !end) {
    return start || end || [0, 0, 0];
  }
  if (!Number.isFinite(treeData.treeY) || !Number.isFinite(treeData.treeTop) || treeData.treeY === treeData.treeTop) {
    return start.slice();
  }
  var ratio = (treeData.treeY - y) / (treeData.treeY - treeData.treeTop);
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
    
    // Clear canvas first (only if not in forest mode)
    if (!forestMode && growingTrees.length === 0 && forestTrees.length === 0) {
      tree.clearCanvas();
    }
    
    // Draw all forest trees first (background)
    if (forestMode && forestDirty) {
      drawForestTrees();    // paints existing forest once
      forestDirty = false;
    }
    
    // Animate all growing trees
    let hasGrowingTrees = false;
    let completedCount = 0;
    const currentTime = Date.now();
    
    for (let i = growingTrees.length - 1; i >= 0; i--) {
      const treeData = growingTrees[i];
      const treeAge = currentTime - treeData.createdAt;
      
      // Force completion if tree has been growing for more than 30 seconds
      if (treeAge > 30000) {
        console.warn(`Force completing stuck tree after ${treeAge}ms`);
        growingTrees.splice(i, 1);
        completedCount++;
        
        // Store completed tree if in forest mode
        if (forestMode) {
          storeCompletedTreeFromData(treeData);
        }
        continue;
      }
      
      let stillGrowing = animateTreeData(treeData);
      
      if (!stillGrowing) {
        // Tree is fully grown, remove from growing list
        growingTrees.splice(i, 1);
        completedCount++;
        
        // Store completed tree if in forest mode
        if (forestMode) {
          storeCompletedTreeFromData(treeData);
        }
      } else {
        hasGrowingTrees = true;
      }
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
  const s = treeData.renderScale || 1;

  // scale around trunk base
  tree.ctx.save();
  tree.ctx.translate(treeData.treeX, treeData.treeY);
  tree.ctx.scale(s, s);
  tree.ctx.translate(-treeData.treeX, -treeData.treeY);

  const reStrokeCompleted = false;
  if (reStrokeCompleted) {
    for (var d = 0; d < treeData.currentDepth; d++) {
      if (d >= treeData.depth) break;
      for (var k = 0; k < treeData.branches[d].length; k++) {
        var branch = treeData.branches[d][k];
        tree.ctx.beginPath();
        tree.ctx.moveTo(branch.startX, branch.startY);
        tree.ctx.lineTo(branch.endX, branch.endY);
        tree.ctx.lineWidth = branch.lineWidth;
        tree.ctx.strokeStyle = getBranchStrokeStyleForTreeData(tree.ctx, branch, treeData); // no 's'
        tree.ctx.stroke();
        tree.ctx.closePath();
      }
    }
  }

  var stillGrowing = false;
  if (treeData.currentDepth < treeData.depth) {
    var currentDone = true;
    for (var k = 0; k < treeData.branches[treeData.currentDepth].length; k++) {
      var branch = treeData.branches[treeData.currentDepth][k];
      if (branch.cntFrame < branch.frame) {
        // Let the branch draw itself (no manual extra path)
        branch.draw(tree.ctx, treeData.growthSpeed);
        stillGrowing = true;
        currentDone = false;
      } else {
        // fully drawn
        tree.ctx.beginPath();
        tree.ctx.moveTo(branch.startX, branch.startY);
        tree.ctx.lineTo(branch.endX,   branch.endY);
        tree.ctx.lineWidth   = branch.lineWidth;
        tree.ctx.strokeStyle = getBranchStrokeStyleForTreeData(tree.ctx, branch, treeData); // no 's'
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

  tree.ctx.restore();
  return stillGrowing;
}


function drawTreeAt(x, y) {
  applySettingsToTree();
  
  // No limit on growing trees - let the forest grow freely!
  // Removed artificial limits to allow unlimited tree creation
  
  // Create a new tree data structure for parallel growth
  const treeData = createNewTreeData(x, y);
  
  // Add to growing trees list
  growingTrees.push(treeData);
  
  // Start master animation if not already running
  startMasterAnimation();
}

function storeCompletedTreeFromData(treeData) {
  if (!forestMode) return;
  
  // Create a snapshot of the tree data
  const completedTree = {
    branches: stripBranches(treeData.branches.slice(0, treeData.depth)),
    treeX: treeData.treeX,
    treeY: treeData.treeY,
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
    renderScale: treeData.renderScale
  };
  
  forestTrees.push(completedTree);
  forestDirty = true; // flag forest as dirty
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
  if (!forestMode || forestTrees.length === 0) return;

  forestTrees.forEach(t => {
    const s = t.renderScale || 1;
    tree.ctx.save();
    tree.ctx.translate(t.treeX, t.treeY);
    tree.ctx.scale(s, s);
    tree.ctx.translate(-t.treeX, -t.treeY);

    for (let d = 0; d < t.depth && d < t.branches.length; d++) {
      for (let k = 0; k < t.branches[d].length; k++) {
        const branch = t.branches[d][k];
        tree.ctx.beginPath();
        tree.ctx.moveTo(branch.startX, branch.startY);
        tree.ctx.lineTo(branch.endX, branch.endY);
        tree.ctx.lineWidth = branch.lineWidth;
        tree.ctx.strokeStyle = getBranchStrokeStyleForTreeData(tree.ctx, branch, t); // no 's'
        tree.ctx.stroke();
        tree.ctx.closePath();
      }
    }

    tree.ctx.restore();
  });
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
  controls.forestMode.checked = forestMode;
  updateColorInputsVisibility();
  controls.renderScale.value = String(settings.renderScale ?? 1);
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
  settings.renderScale = clamp(Number(controls.renderScale.value) || 1, 0.2, 3);
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
controls.renderScale.addEventListener('change', () => {
  syncSettingsFromInputs();
  if (lastClick) redrawFromLastPoint();
});

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
  }else{
    forestDirty = true;
  }
});

controls.redrawBtn.addEventListener('click', () => redrawFromLastPoint());
controls.randomizeTreeBtn.addEventListener('click', () => randomizeTreeSettings());
controls.randomizeSeedBtn.addEventListener('click', () => randomizeSeed());
function clearCanvas() {
  // Stop master animation
  if (masterAnimationId) {
    cancelAnimationFrame(masterAnimationId);
    masterAnimationId = null;
  }
  
  // Clear growing trees
  growingTrees = [];
  
  tree.clearCanvas();
  lastClick = null;
  forestTrees = []; // Clear forest trees when clearing canvas
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
  
  // In non-forest mode, clear existing trees before starting new one
  if (!forestMode) {
    // Stop master animation
    if (masterAnimationId) {
      cancelAnimationFrame(masterAnimationId);
      masterAnimationId = null;
    }
    
    // Clear growing trees
    growingTrees = [];
    
    // Clear canvas
    tree.clearCanvas();
    forestTrees = [];
  }
  
  drawTreeAt(pos.x, pos.y);
});

window.addEventListener('resize', () => {
  if (forestMode) {
    tree.clearCanvas();  // clear pixels
    forestDirty = true;  // repaint forest once next frame
  }
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
