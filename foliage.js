(function (global) {
  const DEFAULT_OPTIONS = {
    enabled: true,
    cell: 44,
    baseRadius: 18,
    noise: 0.25,
    squashY: 0.9,
    hue: 130,
    sat: 35,
    light: 35,
    alpha: 0.55,
    seed: 1,
    linkToGrowth: true,
    progress: 1
  };

  function mulberry32(a) {
    let t = a >>> 0;
    return function () {
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clusterTips(tips, cell) {
    if (!Array.isArray(tips) || tips.length === 0) return [];
    const size = cell > 0 ? cell : DEFAULT_OPTIONS.cell;
    const map = new Map();
    for (let i = 0; i < tips.length; i++) {
      const tip = tips[i];
      const gx = Math.floor(tip.x / size);
      const gy = Math.floor(tip.y / size);
      const key = gx + ':' + gy;
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key).push(tip);
    }
    return Array.from(map.values());
  }

  function drawBlob(ctx, cx, cy, radius, rng, opts) {
    const points = Math.max(8, Math.floor(14 + rng() * 6));
    const noise = Math.max(0, opts.noise || 0);
    const squash = opts.squashY !== undefined ? opts.squashY : 0.9;
    const progress = opts.progress !== undefined ? opts.progress : 1;
    const scale = progress > 0 ? progress : 0;
    const finalRadius = radius * scale;
    if (finalRadius <= 0) {
      return;
    }
    ctx.beginPath();
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const jitter = 1 + (rng() * 2 - 1) * noise;
      const r = finalRadius * jitter;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r * squash;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    ctx.fill();
  }

  function renderFoliage(ctx, tips, options) {
    if (!ctx || !Array.isArray(tips) || tips.length === 0 || !options) return;
    const opts = Object.assign({}, DEFAULT_OPTIONS, options);
    if (!opts.enabled) return;

    const progress = opts.linkToGrowth ? clamp01(opts.progress !== undefined ? opts.progress : 1) : 1;
    if (progress <= 0) return;

    const seed = (opts.seed !== undefined && opts.seed !== null) ? (opts.seed >>> 0) : 1;
    const rng = mulberry32(seed);
    const clusters = clusterTips(tips, opts.cell);
    if (!clusters.length) return;

    clusters.sort((a, b) => averageY(a) - averageY(b));

    ctx.save();
    const baseHue = opts.hue;
    const baseSat = opts.sat;
    const baseLight = opts.light;
    const alpha = clamp01((opts.alpha !== undefined ? opts.alpha : DEFAULT_OPTIONS.alpha) * progress);
    ctx.globalAlpha = alpha;

    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];
      const center = centroid(cluster);
      const radius = Math.max(6, opts.baseRadius * Math.sqrt(cluster.length));
      const hue = baseHue + (rng() - 0.5) * 10;
      const sat = clamp01(baseSat + (rng() - 0.5) * 8);
      const light = clamp01(baseLight + (rng() - 0.5) * 8);
      ctx.fillStyle = `hsla(${hue.toFixed(1)}, ${sat.toFixed(1)}%, ${light.toFixed(1)}%, 1)`;
      drawBlob(ctx, center.x, center.y, radius, rng, Object.assign({}, opts, { progress }));
    }
    ctx.restore();
  }

  function clamp01(value) {
    if (!Number.isFinite(value)) return 0;
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  }

  function averageY(points) {
    if (!points.length) return 0;
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
      sum += points[i].y;
    }
    return sum / points.length;
  }

  function centroid(points) {
    let sumX = 0;
    let sumY = 0;
    for (let i = 0; i < points.length; i++) {
      sumX += points[i].x;
      sumY += points[i].y;
    }
    const count = points.length || 1;
    return { x: sumX / count, y: sumY / count };
  }

  global.Foliage = {
    DEFAULT_OPTIONS,
    mulberry32,
    clusterTips,
    drawBlob,
    renderFoliage
  };
})(typeof window !== 'undefined' ? window : globalThis);
