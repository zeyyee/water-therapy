const waterTherapySketch = (p) => {
  const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const host = document.getElementById("water-canvas");

  let reduced = reducedQuery.matches;
  let ready = false;
  let pendingTheme = null;
  let theme = "forest";
  let fromTheme = "forest";
  let blend = 1;
  let fading = false;
  let simTime = 0;
  let lastPointer = 0;

  let droplets = [];
  let specks = [];
  let leaves = [];
  let sparkles = [];
  let bubbles = [];
  let motes = [];
  const ripples = [];
  const buffers = { a: null, b: null };

  const FOREST_WATER = [
    { color: [168, 198, 188, 150], f1: 0.012, f2: 0.021, s1: 0.7, s2: 0.45, a1: 7, a2: 3 },
    { color: [96, 156, 158, 185], f1: 0.015, f2: 0.028, s1: 0.9, s2: 0.55, a1: 9, a2: 4 },
    { color: [52, 112, 118, 200], f1: 0.011, f2: 0.02, s1: 0.75, s2: 0.4, a1: 11, a2: 5 },
    { color: [24, 74, 82, 220], f1: 0.009, f2: 0.017, s1: 0.6, s2: 0.35, a1: 8, a2: 3 },
  ];

  function initWorld() {
    const rand = mulberry32(42);
    droplets = Array.from({ length: 18 }, () => ({
      nx: rand(),
      ny: 0.12 + rand() * 0.76,
      depth: rand(),
      phase: rand() * Math.PI * 2,
      vx: 0.008 + rand() * 0.018,
      bob: 0.012 + rand() * 0.03,
      sway: 0.008 + rand() * 0.02,
      speed: 0.35 + rand() * 0.7,
    }));
    droplets.sort((a, b) => a.depth - b.depth);

    specks = Array.from({ length: 28 }, () => ({
      nx: rand(),
      ny: rand(),
      depth: rand(),
      phase: rand() * Math.PI * 2,
      vx: 0.004 + rand() * 0.012,
      r: 1.2 + rand() * 2.2,
    }));

    leaves = Array.from({ length: 11 }, () => ({
      nx: rand(),
      ny: 0.08 + rand() * 0.5,
      depth: rand(),
      phase: rand() * Math.PI * 2,
      rot: rand() * Math.PI,
      drift: 0.008 + rand() * 0.02,
      speed: 0.4 + rand() * 0.8,
      scale: 0.75 + rand() * 0.9,
      warm: rand() > 0.72,
    }));

    sparkles = Array.from({ length: 18 }, () => ({
      nx: rand(),
      ny: 0.68 + rand() * 0.26,
      phase: rand() * Math.PI * 2,
      w: 2 + rand() * 4,
    }));

    bubbles = Array.from({ length: 14 }, () => ({
      nx: rand(),
      ny: rand(),
      depth: rand(),
      phase: rand() * Math.PI * 2,
      speed: 0.025 + rand() * 0.05,
      wobble: 0.6 + rand() * 0.8,
    }));

    motes = Array.from({ length: 36 }, () => ({
      nx: rand(),
      ny: rand(),
      depth: rand(),
      phase: rand() * Math.PI * 2,
      vx: 0.004 + rand() * 0.01,
      r: 1 + rand() * 2.4,
    }));
  }

  p.setup = () => {
    const rect = host.getBoundingClientRect();
    p.createCanvas(Math.max(1, rect.width), Math.max(1, rect.height), p.P2D);
    p.pixelDensity(Math.min(p.displayDensity(), 2));
    p.frameRate(60);
    p.canvas.setAttribute("aria-hidden", "true");
    initWorld();
    ready = true;
    if (pendingTheme) {
      const next = pendingTheme;
      pendingTheme = null;
      setTheme(next);
    }
    if (reduced) p.noLoop();
    new ResizeObserver(() => resizeToParent()).observe(host);
  };

  p.draw = () => {
    const dt = Math.min(Math.max(p.deltaTime || 16.7, 0), 48);
    if (!reduced) simTime += dt;

    if (fading) {
      blend = Math.min(1, blend + dt / 420);
      if (blend >= 1) fading = false;
    }

    for (let i = ripples.length - 1; i >= 0; i -= 1) {
      ripples[i].age += reduced ? 0 : dt;
      if (ripples[i].age > 1600) ripples.splice(i, 1);
    }

    if (fading) {
      const back = bufferFor("a");
      const front = bufferFor("b");
      drawScene(back, fromTheme);
      drawScene(front, theme);
      p.clear();
      p.image(back, 0, 0);
      p.tint(255, Math.round(easeOut(blend) * 255));
      p.image(front, 0, 0);
      p.noTint();
    } else {
      drawScene(p, theme);
    }
  };

  p.windowResized = () => {
    resizeToParent();
  };

  p.mousePressed = () => {
    addRipple(p.mouseX, p.mouseY);
    return false;
  };

  p.touchStarted = () => {
    const touch = p.touches && p.touches[0];
    if (touch) addRipple(touch.x, touch.y);
    else addRipple(p.mouseX, p.mouseY);
    return false;
  };

  function resizeToParent() {
    const width = Math.max(1, Math.floor(host.clientWidth));
    const height = Math.max(1, Math.floor(host.clientHeight));
    if (width === p.width && height === p.height) return;
    p.resizeCanvas(width, height);
    if (reduced) p.redraw();
  }

  function setTheme(next) {
    if (!ready) {
      pendingTheme = next;
      return;
    }
    if (!next || next === theme) return;
    fromTheme = blend < 1 ? fromTheme : theme;
    theme = next;
    if (reduced) {
      blend = 1;
      fading = false;
      p.redraw();
      return;
    }
    blend = 0;
    fading = true;
    if (!p.isLooping()) p.loop();
  }

  function addRipple(x, y) {
    if (theme !== "flow" || reduced) return;
    if (x < 0 || y < 0 || x > p.width || y > p.height) return;
    const now = performance.now();
    if (now - lastPointer < 45) return;
    lastPointer = now;
    ripples.push({ x, y, age: 0 });
    if (ripples.length > 5) ripples.shift();
  }

  function bufferFor(key) {
    const current = buffers[key];
    if (!current || current.width !== p.width || current.height !== p.height) {
      if (current) current.remove();
      buffers[key] = p.createGraphics(p.width, p.height);
      buffers[key].pixelDensity(p.pixelDensity());
    }
    return buffers[key];
  }

  function drawScene(g, scene) {
    if (scene === "flow") drawFlow(g);
    else if (scene === "underwater") drawUnderwater(g);
    else drawForest(g);
  }

  function drawForest(g) {
    const w = g.width;
    const h = g.height;
    const t = simTime / 1000;
    paintGradient(g, w, h, [
      { at: 0, rgb: [32, 58, 44] },
      { at: 0.42, rgb: [112, 132, 96] },
      { at: 0.68, rgb: [214, 196, 164] },
      { at: 1, rgb: [186, 206, 198] },
    ]);

    g.noStroke();
    g.fill(243, 226, 168, 70);
    g.ellipse(w * 0.74 + Math.sin(t * 0.15) * 8, h * 0.16, w * 0.22, h * 0.22);
    g.fill(255, 244, 214, 28);
    g.ellipse(w * 0.74, h * 0.16, w * 0.38, h * 0.3);

    g.fill(78, 104, 74, 150);
    softBlob(g, w * 0.18, h * 0.5, w * 0.42, h * 0.16, t * 0.05);
    g.fill(96, 122, 86, 120);
    softBlob(g, w * 0.78, h * 0.54, w * 0.36, h * 0.12, 1.4);

    drawShafts(g, t, w, h, {
      count: 3,
      spread: 0.22,
      reach: 0.72,
      color: [244, 226, 170, 22],
      origin: 0.18,
    });

    g.fill(24, 48, 34, 235);
    softBlob(g, w * -0.02, h * 0.02, w * 0.34, h * 0.28, 0.2);
    softBlob(g, w * 0.28, h * -0.06, w * 0.26, h * 0.2, 1.1);
    softBlob(g, w * 0.62, h * -0.04, w * 0.22, h * 0.16, 2.2);
    g.fill(18, 40, 30, 220);
    softBlob(g, w * 1.02, h * 0.08, w * 0.32, h * 0.3, 0.6);

    g.fill(63, 96, 68);
    waveBand(g, w, h * 0.6, 18, 0.004, t * 0.2, h * 0.08);
    drawWaves(g, t, w, h, 0.63, FOREST_WATER, h / 800);

    g.noStroke();
    [[0.08, 34, 16], [0.16, 18, 10], [0.84, 40, 18], [0.93, 20, 11]].forEach(([nx, rw, rh]) => {
      const scale = Math.max(0.7, w / 1200);
      const x = nx * w;
      const y = h * 0.655;
      g.fill(78, 86, 70, 190);
      g.ellipse(x, y, rw * scale, rh * scale);
      g.fill(196, 188, 150, 70);
      g.ellipse(x - rw * 0.12, y - rh * 0.2, rw * scale * 0.35, rh * scale * 0.4);
    });

    sparkles.forEach((spark) => {
      const twinkle = 0.5 + 0.5 * Math.sin(t * 2.2 + spark.phase);
      g.noStroke();
      g.fill(255, 246, 214, 30 + twinkle * 150);
      g.ellipse(spark.nx * w, spark.ny * h, spark.w * (0.6 + twinkle), 1.6);
    });

    leaves.forEach((leaf) => {
      const x = wrap(leaf.nx + t * leaf.drift) * w;
      const y = leaf.ny * h + Math.sin(t * leaf.speed + leaf.phase) * (8 + leaf.depth * 10);
      drawLeaf(
        g,
        x,
        y,
        leaf.scale * (0.85 + leaf.depth * 0.4),
        leaf.rot + Math.sin(t * 0.8 + leaf.phase) * 0.4,
        leaf.warm
      );
    });
  }

  function drawFlow(g) {
    const w = g.width;
    const h = g.height;
    const t = simTime / 1000;
    paintGradient(g, w, h, [
      { at: 0, rgb: [10, 42, 62] },
      { at: 0.46, rgb: [18, 96, 112] },
      { at: 1, rgb: [8, 52, 68] },
    ]);

    g.noStroke();
    g.fill(190, 236, 230, 28);
    g.ellipse(w * 0.5 + Math.sin(t * 0.2) * 20, h * 0.32, w * 0.55, h * 0.36);

    g.stroke(176, 224, 216, 22);
    g.strokeWeight(1.6);
    g.noFill();
    for (let i = 0; i < 7; i += 1) {
      g.beginShape();
      for (let x = 0; x <= w; x += 18) {
        const y = h * (0.12 + i * 0.12)
          + Math.sin(x * 0.007 + t * 0.55 + i) * 16
          + Math.sin(x * 0.018 - t * 0.8 + i) * 7;
        g.vertex(x, y);
      }
      g.endShape();
    }

    specks.forEach((speck) => {
      const x = wrap(speck.nx + t * speck.vx * (0.4 + speck.depth)) * w;
      const y = speck.ny * h + Math.sin(t * 0.7 + speck.phase) * 12 * speck.depth;
      g.noStroke();
      g.fill(214, 242, 240, 24 + speck.depth * 55);
      g.ellipse(x, y, speck.r * (0.6 + speck.depth), speck.r * (0.6 + speck.depth));
    });

    drawRipples(g);

    droplets.forEach((drop) => {
      const unit = Math.min(w, h);
      const radius = (0.02 + drop.depth * 0.055) * unit;
      const baseX = wrap(drop.nx + t * drop.vx * (0.35 + drop.depth)) * (w + radius) - radius * 0.5;
      const baseY = drop.ny * h + Math.sin(t * drop.speed + drop.phase) * drop.bob * h;
      const sway = Math.cos(t * drop.speed * 0.65 + drop.phase) * drop.sway * w;
      const [ox, oy] = displacement(baseX, baseY);
      const breathe = 1 + Math.sin(t * 0.85 + drop.phase) * 0.045;
      drawDroplet(g, baseX + sway + ox, baseY + oy, radius * breathe, drop.depth, t + drop.phase);
    });
  }

  function drawUnderwater(g) {
    const w = g.width;
    const h = g.height;
    const t = simTime / 1000;
    paintGradient(g, w, h, [
      { at: 0, rgb: [16, 48, 86] },
      { at: 0.28, rgb: [8, 28, 58] },
      { at: 0.7, rgb: [6, 24, 40] },
      { at: 1, rgb: [4, 12, 22] },
    ]);

    g.noStroke();
    g.fill(150, 210, 220, 18);
    g.rect(0, 0, w, h * 0.08);
    for (let i = 0; i < 8; i += 1) {
      const x = wrap(i / 8 + t * 0.02) * w;
      g.fill(186, 230, 232, 16 + (i % 3) * 8);
      g.ellipse(x, h * 0.05, 80 + (i % 4) * 20, 8);
    }

    drawShafts(g, t, w, h, {
      count: 5,
      spread: 0.16,
      reach: 0.92,
      color: [154, 214, 224, 18],
      origin: 0.08,
    });

    motes.forEach((mote) => {
      const x = wrap(mote.nx + t * mote.vx * (0.3 + mote.depth)) * w;
      const y = wrap(mote.ny + Math.sin(t * 0.25 + mote.phase) * 0.01 + t * 0.004) * h;
      g.noStroke();
      g.fill(170, 210, 216, 18 + mote.depth * 40);
      g.ellipse(x, y, mote.r, mote.r);
    });

    bubbles.forEach((bubble) => {
      const depth = 0.35 + bubble.depth * 0.65;
      const radius = (5 + bubble.depth * 16) * Math.max(0.75, Math.min(w, h) / 900);
      const y = h + radius - wrap(bubble.ny + t * bubble.speed * (0.65 + bubble.depth)) * (h + radius * 3);
      const x = bubble.nx * w + Math.sin(t * bubble.wobble + bubble.phase) * (10 + bubble.depth * 16);
      drawBubble(g, x, y, radius, depth);
    });

    g.noStroke();
    g.fill(3, 8, 16, 50);
    g.ellipse(w * 0.5, h * 1.05, w * 1.35, h * 0.55);
  }

  function drawDroplet(g, x, y, radius, depth, phase) {
    const body = 70 + depth * 50;
    const glass = 36 + depth * 40;
    g.noStroke();
    g.fill(4, 24, 36, 16 + depth * 22);
    g.ellipse(x + radius * 0.08, y + radius * 0.72, radius * 1.35, radius * 0.38);

    g.fill(186, 228, 226, body);
    g.ellipse(x, y, radius * 2, radius * 1.92);
    g.fill(120, 196, 198, glass);
    g.ellipse(x - radius * 0.08, y + radius * 0.08, radius * 1.35, radius * 1.42);
    g.fill(18, 70, 86, 28 + depth * 24);
    g.ellipse(
      x + radius * 0.24 + Math.sin(phase) * radius * 0.04,
      y + radius * 0.2,
      radius * 0.82,
      radius * 0.95
    );
    g.fill(232, 250, 248, 34 + depth * 30);
    g.ellipse(x - radius * 0.16, y - radius * 0.08, radius * 0.72, radius * 0.5);

    g.fill(255, 255, 255, 150 + depth * 70);
    g.ellipse(x - radius * 0.32, y - radius * 0.34, radius * 0.26, radius * 0.16);
    g.fill(255, 255, 255, 70);
    g.ellipse(x + radius * 0.18, y + radius * 0.28, radius * 0.12, radius * 0.08);

    g.noFill();
    g.stroke(255, 255, 255, 50 + depth * 50);
    g.strokeWeight(Math.max(1, radius * 0.035));
    g.arc(x, y, radius * 1.78, radius * 1.7, -2.55, -0.55);
    g.noStroke();
  }

  function drawBubble(g, x, y, radius, depth) {
    g.noStroke();
    g.fill(170, 214, 220, 12 + depth * 16);
    g.ellipse(x, y, radius * 2.1, radius * 2.1);
    g.noFill();
    g.stroke(198, 232, 234, 50 + depth * 70);
    g.strokeWeight(1);
    g.ellipse(x, y, radius * 2, radius * 2);
    g.noStroke();
    g.fill(255, 255, 255, 90 + depth * 50);
    g.ellipse(x - radius * 0.32, y - radius * 0.34, radius * 0.32, radius * 0.2);
  }

  function drawRipples(g) {
    ripples.forEach((ripple) => {
      const u = ripple.age / 1600;
      const radius = 10 + u * Math.min(g.width, g.height) * 0.22;
      const alpha = (1 - u) * 70;
      g.noFill();
      g.stroke(210, 242, 238, alpha);
      g.strokeWeight(1.4);
      g.ellipse(ripple.x, ripple.y, radius * 2, radius * 0.62);
      g.stroke(255, 255, 255, alpha * 0.55);
      g.strokeWeight(1);
      g.ellipse(ripple.x, ripple.y, radius * 1.2, radius * 0.34);
    });
  }

  function drawLeaf(g, x, y, scale, rotation, warm) {
    g.push();
    g.translate(x, y);
    g.rotate(rotation);
    g.scale(scale);
    g.noStroke();
    g.fill(warm ? [176, 156, 78, 210] : [58, 104, 64, 215]);
    g.beginShape();
    g.vertex(0, -18);
    g.bezierVertex(12, -12, 14, 2, 0, 18);
    g.bezierVertex(-14, 2, -12, -12, 0, -18);
    g.endShape(g.CLOSE);
    g.stroke(warm ? [120, 96, 40, 160] : [28, 58, 34, 150]);
    g.strokeWeight(0.8);
    g.line(0, -12, 0, 13);
    g.pop();
  }

  function drawShafts(g, time, w, h, options) {
    g.noStroke();
    for (let i = 0; i < options.count; i += 1) {
      const sway = Math.sin(time * 0.35 + i * 0.8) * 26;
      const x = w * (options.origin + i * options.spread) + sway;
      const top = 28 + i * 8;
      g.fill(options.color[0], options.color[1], options.color[2], options.color[3]);
      g.quad(x, -10, x + top, -10, x + top * 2.4, h * options.reach, x - top * 0.4, h * options.reach);
    }
  }

  function drawWaves(g, time, w, h, baseRatio, layers, ampScale) {
    layers.forEach((layer, index) => {
      const base = h * baseRatio + index * h * 0.045;
      g.noStroke();
      g.fill(layer.color[0], layer.color[1], layer.color[2], layer.color[3]);
      g.beginShape();
      g.vertex(0, h);
      g.vertex(0, base);
      for (let x = 0; x <= w; x += 14) {
        const y = base
          + Math.sin(x * layer.f1 + time * layer.s1 + index) * layer.a1 * ampScale
          + Math.sin(x * layer.f2 - time * layer.s2) * layer.a2 * ampScale;
        g.vertex(x, y);
      }
      g.vertex(w, h);
      g.endShape(g.CLOSE);
    });
  }

  function waveBand(g, w, y, amplitude, frequency, shift, depth) {
    g.beginShape();
    g.vertex(0, y + depth);
    for (let x = 0; x <= w; x += 16) {
      g.vertex(x, y + Math.sin(x * frequency + shift) * amplitude);
    }
    g.vertex(w, y + depth);
    g.endShape(g.CLOSE);
  }

  function softBlob(g, cx, cy, rx, ry, salt) {
    g.beginShape();
    const steps = 16;
    for (let i = 0; i < steps; i += 1) {
      const angle = (i / steps) * Math.PI * 2;
      const warp = 1 + 0.14 * Math.sin(angle * 3 + salt);
      g.vertex(cx + Math.cos(angle) * rx * warp, cy + Math.sin(angle) * ry * warp);
    }
    g.endShape(g.CLOSE);
  }

  function displacement(x, y) {
    let ox = 0;
    let oy = 0;
    ripples.forEach((ripple) => {
      const u = ripple.age / 1600;
      const dx = x - ripple.x;
      const dy = y - ripple.y;
      const dist = Math.hypot(dx, dy) || 1;
      const wave = Math.sin(dist / 26 - u * 9) * Math.exp(-dist / 190) * (1 - u);
      ox += (dx / dist) * wave * 18;
      oy += (dy / dist) * wave * 12;
    });
    return [ox, oy];
  }

  function paintGradient(g, w, h, stops) {
    const bands = 42;
    g.noStroke();
    for (let i = 0; i < bands; i += 1) {
      const rgb = sampleGradient(stops, i / (bands - 1));
      g.fill(rgb[0], rgb[1], rgb[2]);
      g.rect(0, (h * i) / bands, w, h / bands + 1);
    }
  }

  reducedQuery.addEventListener("change", (event) => {
    reduced = event.matches;
    if (reduced) {
      blend = 1;
      fading = false;
      p.noLoop();
      p.redraw();
    } else {
      p.loop();
    }
  });

  window.waterTherapy = {
    setTheme,
    getTheme() {
      return theme;
    },
  };
};

function sampleGradient(stops, amount) {
  let index = 0;
  while (index < stops.length - 2 && amount > stops[index + 1].at) index += 1;
  const from = stops[index];
  const to = stops[index + 1];
  const span = to.at - from.at || 1;
  const u = (amount - from.at) / span;
  return [
    from.rgb[0] + (to.rgb[0] - from.rgb[0]) * u,
    from.rgb[1] + (to.rgb[1] - from.rgb[1]) * u,
    from.rgb[2] + (to.rgb[2] - from.rgb[2]) * u,
  ];
}

function easeOut(amount) {
  return 1 - (1 - amount) ** 3;
}

function wrap(value) {
  return ((value % 1) + 1) % 1;
}

function mulberry32(seed) {
  let state = seed;
  return function random() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

new p5(waterTherapySketch, "water-canvas");
