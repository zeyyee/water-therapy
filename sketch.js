const waterTherapySketch = (p) => {
  const host = document.getElementById("water-canvas");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const ripples = [];
  const surfaceTraces = [];
  const sunGlints = [];
  const leaves = [];
  const fish = [];
  const maxRipples = 26;
  const rippleLifetime = 2.6;

  let mode = "lake";
  let motionEnabled = !reducedMotion.matches;
  let elapsed = 0;
  let lastTrailAt = 0;
  let lastTrailX = null;
  let lastTrailY = null;
  let lastTouchAt = 0;
  let pointerX = -1000;
  let pointerY = -1000;
  let pointerSeenAt = 0;
  let lastFishRippleAt = 0;
  let lastLeafRippleAt = 0;
  let draggedLeaf = null;
  let resizeObserver = null;

  p.setup = () => {
    const rect = host.getBoundingClientRect();
    p.createCanvas(Math.max(1, rect.width), Math.max(1, rect.height), p.P2D);
    p.pixelDensity(Math.min(p.displayDensity(), 2));
    p.frameRate(48);
    p.canvas.setAttribute("aria-hidden", "true");
    initializeWaterDetails();
    resizeObserver = new ResizeObserver(resizeToParent);
    resizeObserver.observe(host);
    if (!motionEnabled) p.noLoop();
    p.redraw();
  };

  p.draw = () => {
    const dt = Math.min(Math.max(p.deltaTime || 16.7, 0), 48) / 1000;
    if (motionEnabled) elapsed += dt;

    for (let i = ripples.length - 1; i >= 0; i -= 1) {
      ripples[i].age += motionEnabled ? dt : 0;
      if (ripples[i].age >= rippleLifetime) ripples.splice(i, 1);
    }

    if (motionEnabled) {
      if (mode === "river") updateLeaves(dt);
      if (mode === "ocean") updateFish(dt);
    }

    drawWater();
  };

  p.windowResized = resizeToParent;

  p.mouseMoved = () => {
    rememberPointer(p.mouseX, p.mouseY);
    if (performance.now() - lastTouchAt > 500) addTrailRipple(p.mouseX, p.mouseY, 0.34);
  };

  p.mousePressed = () => {
    rememberPointer(p.mouseX, p.mouseY);
    if (performance.now() - lastTouchAt > 500) {
      draggedLeaf = mode === "river" ? findLeaf(p.mouseX, p.mouseY) : null;
      if (draggedLeaf) {
        draggedLeaf.grabbed = true;
        addRipple(draggedLeaf.x, draggedLeaf.y, 0.55);
      } else {
        addRipple(p.mouseX, p.mouseY, 1);
      }
    }
  };

  p.mouseDragged = () => {
    rememberPointer(p.mouseX, p.mouseY);
    if (performance.now() - lastTouchAt > 500) movePointer(p.mouseX, p.mouseY);
  };

  p.mouseReleased = () => {
    releaseLeaf();
  };

  p.touchStarted = () => {
    lastTouchAt = performance.now();
    const touch = p.touches && p.touches[0];
    if (!touch) return;
    rememberPointer(touch.x, touch.y);
    draggedLeaf = mode === "river" ? findLeaf(touch.x, touch.y) : null;
    if (draggedLeaf) {
      draggedLeaf.grabbed = true;
      addRipple(draggedLeaf.x, draggedLeaf.y, 0.55);
    } else {
      addRipple(touch.x, touch.y, 1);
    }
  };

  p.touchMoved = () => {
    lastTouchAt = performance.now();
    const touch = p.touches && p.touches[0];
    if (touch) {
      rememberPointer(touch.x, touch.y);
      movePointer(touch.x, touch.y);
    }
  };

  p.touchEnded = () => {
    releaseLeaf();
  };

  function initializeWaterDetails() {
    for (let i = 0; i < 56; i += 1) {
      surfaceTraces.push({
        x: p.random(-0.18, 0.94),
        y: p.random(0.08, 0.98),
        length: p.random(0.055, 0.32),
        amplitude: p.random(1.5, 9),
        frequency: p.random(0.0025, 0.010),
        speed: p.random(0.06, 0.34),
        phase: p.random(p.TWO_PI),
        depth: p.random(),
        weight: p.random(0.65, 1.8),
        tint: p.random() > 0.56 ? 1 : 0,
      });
    }

    for (let i = 0; i < 144; i += 1) {
      const x = p.random(0.04, 0.82);
      const reflectionCenter = 0.12 + x * 0.32;
      sunGlints.push({
        x,
        y: p.constrain(reflectionCenter + p.random(-0.105, 0.105), 0.035, 0.72),
        width: p.random(3, 25),
        tilt: p.random(-0.35, 0.35),
        phase: p.random(p.TWO_PI),
        rate: p.random(0.35, 1.25),
        brightness: p.random(0.22, 0.82),
        depth: p.random(),
      });
    }

    for (let i = 0; i < 7; i += 1) {
      leaves.push({
        x: p.random(p.width),
        y: p.random(p.height * 0.22, p.height * 0.82),
        size: p.random(13, 22),
        speed: p.random(18, 37),
        phase: p.random(p.TWO_PI),
        vx: 0,
        vy: 0,
        grabbed: false,
      });
    }

    for (let i = 0; i < 3; i += 1) {
      fish.push({
        x: p.random(p.width),
        y: p.random(p.height * 0.32, p.height * 0.78),
        size: p.random(17, 27),
        speed: p.random(17, 29),
        direction: p.random() > 0.5 ? 1 : -1,
        phase: p.random(p.TWO_PI),
      });
    }
  }

  function resizeToParent() {
    if (!host || !p.canvas) return;
    const width = Math.max(1, Math.floor(host.clientWidth));
    const height = Math.max(1, Math.floor(host.clientHeight));
    if (width === p.width && height === p.height) return;
    p.resizeCanvas(width, height);
    p.redraw();
  }

  function setMode(nextMode) {
    if (!["lake", "river", "ocean"].includes(nextMode) || mode === nextMode) return;
    mode = nextMode;
    releaseLeaf();
    if (!p.isLooping()) p.redraw();
  }

  function setMotionEnabled(enabled) {
    motionEnabled = Boolean(enabled);
    if (motionEnabled) {
      p.loop();
    } else {
      p.noLoop();
      p.redraw();
    }
  }

  function rememberPointer(x, y) {
    pointerX = x;
    pointerY = y;
    pointerSeenAt = performance.now();
  }

  function addTrailRipple(x, y, strength) {
    if (!motionEnabled || x < 0 || y < 0 || x > p.width || y > p.height) return;
    const now = performance.now();
    const movedEnough = lastTrailX === null || Math.hypot(x - lastTrailX, y - lastTrailY) >= 24;
    if (!movedEnough || now - lastTrailAt < 78) return;
    addRipple(x, y, strength);
    lastTrailAt = now;
    lastTrailX = x;
    lastTrailY = y;
  }

  function addRipple(x, y, strength) {
    if (!motionEnabled || x < 0 || y < 0 || x > p.width || y > p.height) return;
    ripples.push({
      x,
      y,
      age: 0,
      strength,
      size: p.random(0.82, 1.18),
      phase: p.random(p.TWO_PI),
    });
    if (ripples.length > maxRipples) ripples.shift();
    if (!p.isLooping()) p.redraw();
  }

  function drawWater() {
    drawDepth();
    if (mode === "river") drawRiver();
    if (mode === "ocean") drawOcean();
    drawSurfaceTraces();
    drawSunGlints();
    drawRipples();
  }

  function drawDepth() {
    const colors = mode === "ocean"
      ? [[142, 211, 211], [97, 183, 195], [61, 145, 169], [38, 112, 143]]
      : mode === "river"
        ? [[153, 213, 193], [106, 187, 177], [66, 151, 155], [44, 119, 137]]
        : [[164, 218, 199], [116, 193, 185], [72, 157, 166], [47, 124, 145]];
    const bands = 88;
    p.noStroke();
    for (let i = 0; i < bands; i += 1) {
      const position = i / (bands - 1);
      const color = sampleWaterColor(colors, position);
      const softVariation = p.noise(position * 3.7, elapsed * 0.018) * 7 - 3.5;
      p.fill(
        p.constrain(color[0] + softVariation, 0, 255),
        p.constrain(color[1] + softVariation, 0, 255),
        p.constrain(color[2] + softVariation, 0, 255),
      );
      p.rect(0, (p.height * i) / bands, p.width, p.height / bands + 1);
    }

    // A restrained wash shifts the same procedural surface between water settings.
    if (mode === "river") p.fill(97, 164, 119, 16);
    else if (mode === "ocean") p.fill(46, 139, 177, 18);
    else p.fill(222, 244, 224, 8);
    p.rect(0, 0, p.width, p.height);
  }

  function drawRiver() {
    drawLeaves();
  }

  function drawOcean() {
    drawFish();
  }

  function drawSunGlints() {
    if (mode === "river") drawReflectionField(0.1, 0.34, 0.8);
    else if (mode === "ocean") drawReflectionField(0.24, 0.58, 0.92);
    else drawReflectionField(0.18, 0.5, 1);
  }

  function drawReflectionField(minY, maxY, strength) {
    const w = p.width;
    const h = p.height;
    const glintsPerFrame = mode === "lake" ? 144 : 96;
    p.noFill();
    for (let i = 0; i < glintsPerFrame; i += 1) {
      const glint = sunGlints[i];
      if (glint.y < minY || glint.y > maxY) continue;
      const flicker = 0.32 + 0.68 * (0.5 + 0.5 * Math.sin(elapsed * glint.rate + glint.phase));
      const alpha = glint.brightness * flicker * strength * (glint.depth < 0.48 ? 62 : 38);
      const x = glint.x * w + Math.sin(elapsed * 0.12 + glint.phase) * 4;
      const y = glint.y * h + Math.sin(elapsed * 0.32 + glint.phase) * 3;
      p.stroke(glint.depth < 0.48 ? 246 : 202, glint.depth < 0.48 ? 251 : 235, 224, alpha);
      p.strokeWeight(glint.depth < 0.3 ? 1.5 : 0.8);
      p.line(x, y, x + glint.width, y + glint.tilt * glint.width);
    }
  }

  function drawSurfaceTraces() {
    const w = p.width;
    const h = p.height;
    const speedScale = mode === "river" ? 1.7 : mode === "ocean" ? 1.15 : 0.72;
    for (const trace of surfaceTraces) {
      const startX = trace.x * w;
      const endX = Math.min(w + 8, startX + trace.length * w);
      if (endX <= startX) continue;
      const baseY = trace.y * h;
      const step = Math.max(10, (endX - startX) / 12);
      const depthFade = 0.62 + trace.depth * 0.5;
      const alpha = (trace.tint ? 20 : 31) * depthFade;
      const color = trace.tint
        ? [242, 252, 235]
        : trace.depth > 0.64 ? [76, 153, 166] : [202, 237, 226];
      p.noFill();
      p.stroke(color[0], color[1], color[2], alpha);
      p.strokeWeight(trace.weight);
      p.beginShape();
      for (let x = startX; x <= endX + step; x += step) {
        const nx = x * trace.frequency;
        const wave = Math.sin(nx + elapsed * trace.speed * speedScale + trace.phase) * trace.amplitude;
        const irregular = (p.noise(x * 0.002 + trace.phase, trace.depth * 6, elapsed * 0.025) - 0.5)
          * trace.amplitude * 2.4;
        const longSwell = Math.sin(x * 0.0018 - elapsed * 0.11 + trace.phase) * trace.amplitude * 0.7;
        p.curveVertex(x, baseY + wave + irregular + longSwell);
      }
      p.endShape();
    }
  }

  function updateLeaves(dt) {
    for (const leaf of leaves) {
      if (leaf.grabbed) continue;
      leaf.x += leaf.speed * dt + leaf.vx * dt;
      leaf.y += Math.sin(elapsed * 0.72 + leaf.phase) * 5 * dt + leaf.vy * dt;
      leaf.vx *= Math.pow(0.08, dt);
      leaf.vy *= Math.pow(0.08, dt);
      if (leaf.x > p.width + leaf.size * 2) {
        leaf.x = -leaf.size * 2;
        leaf.y = p.random(p.height * 0.2, p.height * 0.84);
        leaf.speed = p.random(18, 37);
      }
    }
  }

  function drawLeaves() {
    for (const leaf of leaves) {
      const angle = Math.sin(elapsed * 0.5 + leaf.phase) * 0.28 + leaf.vx * 0.0015;
      p.push();
      p.translate(leaf.x, leaf.y);
      p.rotate(angle);
      p.noStroke();
      p.fill(80, 133, 93, 190);
      p.beginShape();
      p.vertex(-leaf.size, 0);
      p.bezierVertex(-leaf.size * 0.25, -leaf.size * 0.8, leaf.size * 0.65, -leaf.size * 0.58, leaf.size, 0);
      p.bezierVertex(leaf.size * 0.28, leaf.size * 0.72, -leaf.size * 0.56, leaf.size * 0.58, -leaf.size, 0);
      p.endShape(p.CLOSE);
      p.stroke(211, 231, 185, 175);
      p.strokeWeight(0.9);
      p.line(-leaf.size * 0.78, 0, leaf.size * 0.78, 0);
      p.pop();
    }
  }

  function findLeaf(x, y) {
    let closest = null;
    let closestDistance = Infinity;
    for (const leaf of leaves) {
      const distance = Math.hypot(x - leaf.x, y - leaf.y);
      if (distance < leaf.size * 1.2 && distance < closestDistance) {
        closest = leaf;
        closestDistance = distance;
      }
    }
    return closest;
  }

  function movePointer(x, y) {
    if (draggedLeaf) {
      draggedLeaf.vx = (x - draggedLeaf.x) * 6;
      draggedLeaf.vy = (y - draggedLeaf.y) * 6;
      draggedLeaf.x = p.constrain(x, 0, p.width);
      draggedLeaf.y = p.constrain(y, 0, p.height);
      const now = performance.now();
      if (now - lastLeafRippleAt > 175) {
        addRipple(draggedLeaf.x, draggedLeaf.y, 0.46);
        lastLeafRippleAt = now;
      }
      return;
    }
    addTrailRipple(x, y, 0.4);
  }

  function releaseLeaf() {
    if (!draggedLeaf) return;
    draggedLeaf.grabbed = false;
    draggedLeaf.vx += 24;
    addRipple(draggedLeaf.x, draggedLeaf.y, 0.62);
    draggedLeaf = null;
  }

  function updateFish(dt) {
    const pointerIsRecent = performance.now() - pointerSeenAt < 850;
    for (const swimmer of fish) {
      const distance = Math.hypot(pointerX - swimmer.x, pointerY - swimmer.y);
      const avoiding = pointerIsRecent && distance < 150;
      if (avoiding) swimmer.direction = pointerX < swimmer.x ? 1 : -1;
      const pace = avoiding ? 1.75 : 1;
      swimmer.x += swimmer.direction * swimmer.speed * pace * dt;
      swimmer.y += Math.sin(elapsed * 0.78 + swimmer.phase) * 7 * dt;
      if (swimmer.x > p.width + swimmer.size * 2) swimmer.x = -swimmer.size * 2;
      if (swimmer.x < -swimmer.size * 2) swimmer.x = p.width + swimmer.size * 2;
    }

    if (elapsed - lastFishRippleAt > 0.7) {
      const swimmer = fish[Math.floor(elapsed * 0.7) % fish.length];
      addRipple(swimmer.x - swimmer.direction * swimmer.size * 0.55, swimmer.y, 0.16);
      lastFishRippleAt = elapsed;
    }
  }

  function drawFish() {
    for (const swimmer of fish) {
      const size = swimmer.size;
      p.push();
      p.translate(swimmer.x, swimmer.y);
      p.scale(swimmer.direction, 1);
      p.noStroke();
      p.fill(223, 246, 234, 152);
      p.ellipse(0, 0, size * 1.45, size * 0.56);
      p.triangle(-size * 0.48, 0, -size * 0.98, -size * 0.32, -size * 0.98, size * 0.32);
      p.fill(245, 251, 235, 190);
      p.ellipse(size * 0.43, -size * 0.08, 2, 2);
      p.pop();
    }
  }

  function drawRipples() {
    const scale = Math.min(p.width, p.height);
    for (const ripple of ripples) {
      const progress = Math.min(1, ripple.age / rippleLifetime);
      const ease = 1 - (1 - progress) ** 2;
      const radius = 5 + ease * scale * 0.22 * ripple.size;
      const alpha = (1 - progress) ** 1.45 * 88 * ripple.strength;
      p.noFill();
      p.stroke(219, 245, 232, alpha);
      p.strokeWeight(1.15);
      p.ellipse(ripple.x, ripple.y, radius * 2, radius * 1.08);
      p.stroke(250, 255, 246, alpha * 0.55);
      p.strokeWeight(0.8);
      p.ellipse(ripple.x, ripple.y, radius * 1.72, radius * 0.86);
    }
  }

  reducedMotion.addEventListener("change", (event) => {
    if (event.matches) setMotionEnabled(false);
  });

  window.waterTherapy = {
    setMode,
    getMode() {
      return mode;
    },
    setMotionEnabled,
    getMotionEnabled() {
      return motionEnabled;
    },
  };
};

function sampleWaterColor(stops, position) {
  const scaled = position * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  const amount = scaled - index;
  return stops[index].map((value, channel) => value + (stops[index + 1][channel] - value) * amount);
}

new p5(waterTherapySketch, "water-canvas");
