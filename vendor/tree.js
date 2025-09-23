/*!\n * tree.js - Growing tree animation plugin\n * Source: https://github.com/w3labkr/js-growing-tree\n *\n * MIT License\n *\n * Copyright (c) 2025 W3LabKr\n *\n * Permission is hereby granted, free of charge, to any person obtaining a copy\n * of this software and associated documentation files (the "Software"), to deal\n * in the Software without restriction, including without limitation the rights\n * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell\n * copies of the Software, and to permit persons to whom the Software is\n * furnished to do so, subject to the following conditions:\n *\n * The above copyright notice and this permission notice shall be included in all\n * copies or substantial portions of the Software.\n *\n * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\n * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\n * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\n * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\n * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\n * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\n * SOFTWARE.\n */
(function() {
  function TreePlugin(options) {
    options = options || {};
    this.container = options.container || document.body;
    // Fixed fullDepth for generating the complete tree structure internally
    this.fullDepth = 11;
    // Depth to display to the user (may be less than fullDepth)
    this.depth = options.depth || this.fullDepth;
    this.pixelRatio = window.devicePixelRatio > 1 ? 2 : 1;
    this.growthSpeed = options.growthSpeed || 1;
    this.treeScale = options.treeScale || 1;
    this.branchWidth = options.branchWidth || 1;
    this.colorMode = options.colorMode || "gradient";
    this.color = options.color || "#000";
    this.gradientStart = options.gradientStart || "#8B4513";
    this.gradientEnd = options.gradientEnd || "#228B22";
    var initialDirection = options.lightDirection !== undefined ? Number(options.lightDirection) : 315;
    if (!Number.isFinite(initialDirection)) {
      initialDirection = 315;
    }
    this.lightDirection = ((initialDirection % 360) + 360) % 360;
    var providedIntensity = options.lightIntensity !== undefined ? Number(options.lightIntensity) : 0.5;
    if (!Number.isFinite(providedIntensity)) {
      providedIntensity = 0.5;
    }
    this.lightIntensity = Math.min(1, Math.max(0, providedIntensity));
    this.seed = undefined;
    this.randSeq = null;
    this.randCounter = 0;
    this.currentSeed = null;
    this.origin = options.origin ? {
      x: Number(options.origin.x),
      y: Number(options.origin.y)
    } : null;
    this.lastOrigin = null;
    this.setSeed(options.seed);
    this.setLightDirection(this.lightDirection);
    this.canvas = document.createElement("canvas");
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");
    this.branches = [];
    this.animation = null;
    // currentDepth: the current depth level being animated (starting from the root)
    this.currentDepth = 0;
    this.addEventListeners();
    this.resize();
    // Start the tree using configured origin or the default bottom-center point
    var initialOrigin = this.origin || { x: this.stageWidth / 2, y: this.stageHeight };
    this.startTree(initialOrigin.x, initialOrigin.y);
  }

  TreePlugin.prototype.addEventListeners = function () {
    // Listen for window resize events and call the resize method
    window.addEventListener("resize", this.resize.bind(this));
  };

  TreePlugin.prototype.resize = function () {
    // Update stage dimensions and canvas size according to the container
    this.stageWidth = this.container.clientWidth;
    this.stageHeight = this.container.clientHeight;
    this.canvas.width = this.stageWidth * this.pixelRatio;
    this.canvas.height = this.stageHeight * this.pixelRatio;
    this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    this.clearCanvas();
  };

  TreePlugin.prototype.clearCanvas = function () {
    // Clear the entire canvas area
    this.ctx.clearRect(0, 0, this.stageWidth, this.stageHeight);
  };

  TreePlugin.prototype.setSeed = function (seed) {
    if (seed === undefined || seed === null || seed === "") {
      this.seed = undefined;
      this.randSeq = null;
      this.currentSeed = null;
      this.randCounter = 0;
      return;
    }
    var value = Number(seed);
    if (!Number.isFinite(value)) {
      this.seed = undefined;
      this.randSeq = null;
      this.currentSeed = null;
      this.randCounter = 0;
      return;
    }
    this.seed = value;
    this.currentSeed = value;
    var totalCount = 10000;
    this.randSeq = [];
    var s = value;
    for (var i = 0; i < totalCount; i++) {
      s = (s * 16807) % 2147483647;
      var rnd = (s - 1) / 2147483646;
      this.randSeq.push(rnd);
    }
    this.randCounter = 0;
  };

  TreePlugin.prototype.startTree = function (posX, posY) {
    if (posX === undefined || posY === undefined) {
      var fallback = this.lastOrigin || this.origin || { x: this.stageWidth / 2, y: this.stageHeight };
      posX = fallback.x;
      posY = fallback.y;
    }
    // Cancel any ongoing animation if exists
    if (this.animation) cancelAnimationFrame(this.animation);
    this.clearCanvas();
    if (this.seed !== undefined) {
      // Reset or regenerate the deterministic random sequence when needed
      if (this.currentSeed !== this.seed || !this.randSeq) {
        this.setSeed(this.seed);
      } else {
        this.randCounter = 0;
      }
    }
    // Create an array of branches for each depth level (size: fullDepth)
    this.branches = Array.from({ length: this.fullDepth }, function () { return []; });
    this.currentDepth = 0;
    this.treeTop = Infinity;
    this.treeX = posX;
    this.treeY = posY;
    this.lastOrigin = { x: posX, y: posY };
    // Limit the tree scale based on stage height and fullDepth
    var maxScale = this.stageHeight / (13 * this.fullDepth);
    if (this.treeScale > maxScale) {
      this.treeScale = maxScale;
    }
    // Generate the complete tree structure based on fullDepth (deterministic using seed)
    this.createBranch(this.treeX, this.treeY, -90, 0);
    // Initialize animation frames for each branch to 0
    for (var d = 0; d < this.fullDepth; d++) {
      for (var k = 0; k < this.branches[d].length; k++) {
        this.branches[d][k].cntFrame = 0;
      }
    }
    this.animate();
  };

  TreePlugin.prototype.random = function (min, max) {
    // Use deterministic random sequence if available; otherwise, fallback to Math.random()
    if (this.randSeq) {
      return min + this.randSeq[this.randCounter++] * (max - min);
    } else {
      return Math.random() * (max - min) + min;
    }
  };

  TreePlugin.prototype.degToRad = function (degree) {
    // Convert degrees to radians
    return degree * (Math.PI / 180);
  };

  TreePlugin.prototype.createBranch = function (startX, startY, angle, depth) {
    // Stop recursion when reaching the full depth
    if (depth === this.fullDepth) return;
    var scale = this.treeScale;
    // Calculate branch length; longer for the trunk (depth 0)
    var len = (depth === 0 ? this.random(10, 13) : this.random(0, 11)) * scale;
    var factor = this.fullDepth - depth;
    // Determine end coordinates based on angle, length, and scaling factor
    var endX = startX + Math.cos(this.degToRad(angle)) * len * factor;
    var endY = startY + Math.sin(this.degToRad(angle)) * len * factor;
    // Update the top position of the tree if necessary
    if (startY < this.treeTop) this.treeTop = startY;
    if (endY < this.treeTop) this.treeTop = endY;
    var branchWidthFactor = this.branchWidth;
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
      plugin: this,
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
          ctx.strokeStyle = this.plugin.getBranchStrokeStyle(ctx, this);
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
    this.branches[depth].push(branch);
    // Recursively create left and right sub-branches with adjusted angles
    this.createBranch(endX, endY, angle - this.random(15, 23), depth + 1);
    this.createBranch(endX, endY, angle + this.random(15, 23), depth + 1);
  };

  TreePlugin.prototype.animate = function () {
    // Clear the canvas for redrawing
    this.clearCanvas();

    // Draw already completed branches (from root up to currentDepth-1) fully
    for (var d = 0; d < this.currentDepth; d++) {
      if (d >= this.depth) break;
      for (var k = 0; k < this.branches[d].length; k++) {
        var branch = this.branches[d][k];
        this.ctx.beginPath();
        this.ctx.moveTo(branch.startX, branch.startY);
        this.ctx.lineTo(branch.endX, branch.endY);
        this.ctx.lineWidth = branch.lineWidth;
        this.ctx.strokeStyle = this.getBranchStrokeStyle(this.ctx, branch);
        this.ctx.stroke();
        this.ctx.closePath();
      }
    }

    var stillGrowing = false;
    // Animate the branches at the current depth level
    if (this.currentDepth < this.depth) {
      var currentDone = true;
      for (var k = 0; k < this.branches[this.currentDepth].length; k++) {
        var branch = this.branches[this.currentDepth][k];
        if (branch.cntFrame < branch.frame) {
          branch.draw(this.ctx, this.growthSpeed);
          stillGrowing = true;
          currentDone = false;
        } else {
          // If the branch is fully drawn, draw it as a complete line
          this.ctx.beginPath();
          this.ctx.moveTo(branch.startX, branch.startY);
          this.ctx.lineTo(branch.endX, branch.endY);
          this.ctx.lineWidth = branch.lineWidth;
          this.ctx.strokeStyle = this.getBranchStrokeStyle(this.ctx, branch);
          this.ctx.stroke();
          this.ctx.closePath();
        }
      }
      // If all branches at the current depth are complete, move to the next depth level
      if (currentDone) {
        this.currentDepth++;
        stillGrowing = true;
      }
    }

    // Continue the animation if there are still branches growing
    if (stillGrowing) {
      this.animation = requestAnimationFrame(this.animate.bind(this));
    } else {
      cancelAnimationFrame(this.animation);
    }
  };

  TreePlugin.prototype.clamp01 = function (value) {
    if (!Number.isFinite(value)) return 0;
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  };

  TreePlugin.prototype.setLightDirection = function (direction) {
    var numeric = Number(direction);
    if (!Number.isFinite(numeric)) return;
    this.lightDirection = ((numeric % 360) + 360) % 360;
  };

  TreePlugin.prototype.setLightIntensity = function (intensity) {
    this.lightIntensity = this.clamp01(Number(intensity));
  };

  TreePlugin.prototype.hexToRgb = function (hex) {
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
  };

  TreePlugin.prototype.rgbToHex = function (rgb) {
    if (!rgb) return "#000000";
    return "#" + rgb.map(function (value) {
      var clamped = Math.max(0, Math.min(255, Math.round(value)));
      return clamped.toString(16).padStart(2, "0");
    }).join("");
  };

  TreePlugin.prototype.mixRgb = function (a, b, t) {
    t = this.clamp01(t);
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t
    ];
  };

  TreePlugin.prototype.getColorAtY = function (y) {
    var start = this.hexToRgb(this.gradientStart);
    var end = this.hexToRgb(this.gradientEnd);
    if (!start || !end) {
      return start || end || [0, 0, 0];
    }
    if (!Number.isFinite(this.treeY) || !Number.isFinite(this.treeTop) || this.treeY === this.treeTop) {
      return start.slice();
    }
    var ratio = (this.treeY - y) / (this.treeY - this.treeTop);
    ratio = this.clamp01(ratio);
    return this.mixRgb(start, end, ratio);
  };

  TreePlugin.prototype.getShadeFactor = function (branch) {
    var angleRad = this.lightDirection * (Math.PI / 180);
    var lightX = Math.cos(angleRad);
    var lightY = Math.sin(angleRad);
    var midX = branch.midX;
    var midY = branch.midY;
    var centerX = this.treeX;
    var centerY;
    if (Number.isFinite(this.treeTop)) {
      centerY = (this.treeY + this.treeTop) / 2;
    } else {
      centerY = this.treeY;
    }
    var vecX = midX - centerX;
    var vecY = midY - centerY;
    var len = Math.sqrt(vecX * vecX + vecY * vecY);
    if (len > 0) {
      vecX /= len;
      vecY /= len;
    }
    var dot = vecX * (-lightX) + vecY * (-lightY);
    return this.clamp01((dot + 1) / 2);
  };

  TreePlugin.prototype.applyShading = function (rgb, shade) {
    if (!rgb) return [0, 0, 0];
    var intensity = this.lightIntensity;
    var amount = (shade - 0.5) * 2 * intensity;
    if (amount > 0) {
      return this.mixRgb(rgb, [255, 255, 255], amount);
    }
    if (amount < 0) {
      return this.mixRgb(rgb, [0, 0, 0], -amount);
    }
    return rgb.slice();
  };

  TreePlugin.prototype.getBranchStrokeStyle = function (ctx, branch) {
    var shade = this.getShadeFactor(branch);
    if (this.colorMode === "gradient") {
      var startColor = this.applyShading(this.getColorAtY(branch.startY), shade);
      var endColor = this.applyShading(this.getColorAtY(branch.endY), shade);
      var gradient = ctx.createLinearGradient(branch.startX, branch.startY, branch.endX, branch.endY);
      gradient.addColorStop(0, this.rgbToHex(startColor));
      gradient.addColorStop(1, this.rgbToHex(endColor));
      return gradient;
    }
    var solid = this.hexToRgb(this.color) || [0, 0, 0];
    var shaded = this.applyShading(solid, shade);
    return this.rgbToHex(shaded);
  };

  // Expose TreePlugin globally
  window.TreePlugin = TreePlugin;
})();
