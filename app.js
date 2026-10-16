(() => {
  const canvas = document.getElementById("surface");
  const ctx = canvas.getContext("2d", { alpha: false });
  const noseEl = document.getElementById("nose");
  const cardEl = document.getElementById("card");
  const drawBtn = document.getElementById("draw-btn");
  const stage = document.querySelector(".stage");

  const LINE_COUNT = 3;
  const PARTICLES_PER_LINE = 3400;
  const MAX_LINES = 12;
  const CARD_BASE_W = 118;
  const CARD_BASE_H = 74;
  const RAIL_THICKNESS = 12;

  let lines = [];
  let freeParticles = [];
  let cssW = 0;
  let cssH = 0;

  let pointer = { x: 0, y: 0, down: false, inside: false };
  const touches = new Map();
  let cardMode = false;
  let cardState = null;
  let stroke = null;

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function lerpAngle(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }

  function thicknessAt(t, maxThickness) {
    const envelope = Math.sin(Math.PI * clamp(t, 0, 1));
    return maxThickness * (0.12 + 0.88 * Math.pow(envelope, 1.15));
  }

  function gaussian() {
    return (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 2;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cssW = rect.width;
    cssH = rect.height;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function makeParticle(x, y, sizeScale = 1) {
    const size = rand(0.3, 1.85) * sizeScale;
    const shade = rand(0.8, 1);
    return {
      x,
      y,
      size,
      shade,
      life: 1,
      vx: 0,
      vy: 0,
      snorting: false,
      spark: size > 1.45 && Math.random() > 0.65,
    };
  }

  function pointOnPath(path, t) {
    const target = clamp(t, 0, 1) * path.totalLength;
    let acc = 0;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      const seg = b.dist;
      if (acc + seg >= target || i === path.length - 1) {
        const local = seg < 0.0001 ? 0 : (target - acc) / seg;
        const x = a.x + (b.x - a.x) * local;
        const y = a.y + (b.y - a.y) * local;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        return { x, y, nx: -dy / len, ny: dx / len };
      }
      acc += seg;
    }
    const last = path[path.length - 1];
    return { x: last.x, y: last.y, nx: last.nx || 0, ny: last.ny || 1 };
  }

  function fillLineParticles(line, count) {
    const particles = [];
    const maxT = line.maxThickness;
    const bend = line.bend || 0;

    for (let i = 0; i < count; i++) {
      const along =
        Math.random() < 0.58
          ? clamp(0.5 + (Math.random() - 0.5) * Math.pow(Math.random(), 0.6), 0, 1)
          : Math.random();

      const thick = thicknessAt(along, maxT);
      if (thick < 1.8 && Math.random() > 0.4) continue;

      const spread = gaussian() * thick * 0.48;
      let px;
      let py;

      if (line.vertical) {
        py = line.y1 + (line.y2 - line.y1) * along + rand(-0.5, 0.5);
        px = line.x + Math.sin(along * Math.PI) * bend + spread + rand(-0.3, 0.3);
      } else if (line.path && line.path.length > 1 && line.path.totalLength > 1) {
        const p = pointOnPath(line.path, along);
        px = p.x + p.nx * spread + rand(-0.3, 0.3);
        py = p.y + p.ny * spread + rand(-0.3, 0.3);
      } else {
        continue;
      }

      const edgeFactor = 1 - Math.min(1, Math.abs(spread) / (thick * 0.5 + 0.001));
      particles.push(
        makeParticle(px, py, 0.5 + 0.75 * edgeFactor * thicknessAt(along, 1))
      );
    }

    const dust = Math.floor(count * 0.14);
    for (let i = 0; i < dust; i++) {
      const along = 0.22 + Math.random() * 0.56;
      const thick = thicknessAt(along, maxT);
      const spread = (Math.random() - 0.5) * thick * 1.0;
      if (line.vertical) {
        particles.push(
          makeParticle(
            line.x + Math.sin(along * Math.PI) * bend + spread,
            line.y1 + (line.y2 - line.y1) * along,
            rand(0.3, 0.7)
          )
        );
      } else if (line.path && line.path.length > 1) {
        const p = pointOnPath(line.path, along);
        particles.push(
          makeParticle(p.x + p.nx * spread, p.y + p.ny * spread, rand(0.3, 0.7))
        );
      }
    }

    line.particles = particles;
  }

  function createVerticalLine(index) {
    const marginX = cssW * 0.2;
    const usable = cssW - marginX * 2;
    const line = {
      x: marginX + (usable / (LINE_COUNT - 1)) * index + rand(-4, 4),
      y1: cssH * 0.14 + rand(-6, 6),
      y2: cssH * 0.76 + rand(-6, 6),
      bend: rand(-8, 8),
      maxThickness: rand(11, 16),
      vertical: true,
      particles: [],
    };
    fillLineParticles(line, PARTICLES_PER_LINE);
    return line;
  }

  function seedLines() {
    lines = Array.from({ length: LINE_COUNT }, (_, i) => createVerticalLine(i));
    freeParticles = [];
    stroke = null;
  }

  function canvasPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
      rect,
    };
  }

  function cardMetrics(state) {
    const scale = clamp(state.length / 140, 0.75, 1.55);
    const w = CARD_BASE_W * scale;
    const h = CARD_BASE_H * scale;
    return { w, h, halfW: w / 2, halfH: h / 2 };
  }

  function cardEdgeTip(state, moveX, moveY) {
    const { halfH } = cardMetrics(state);
    const px = -Math.sin(state.angle);
    const py = Math.cos(state.angle);

    let side = state.edgeSide || 1;
    if (moveX * moveX + moveY * moveY > 1) {
      side = moveX * px + moveY * py >= 0 ? -1 : 1;
      state.edgeSide = side;
    }

    return {
      x: state.x + px * halfH * side,
      y: state.y + py * halfH * side,
      nx: px * side,
      ny: py * side,
    };
  }

  function updateNose(clientX, clientY, inside) {
    if (cardMode) {
      noseEl.classList.remove("visible", "snorting");
      return;
    }
    const rect = stage.getBoundingClientRect();
    noseEl.style.left = `${clientX - rect.left}px`;
    noseEl.style.top = `${clientY - rect.top}px`;
    noseEl.classList.toggle("visible", inside);
  }

  function updateCardVisual() {
    if (!cardMode || !cardState) {
      cardEl.classList.remove("visible");
      return;
    }
    const rect = stage.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const { w, h } = cardMetrics(cardState);
    cardEl.style.left = `${cardState.x + (canvasRect.left - rect.left)}px`;
    cardEl.style.top = `${cardState.y + (canvasRect.top - rect.top)}px`;
    cardEl.style.transform = `rotate(${cardState.angle}rad)`;
    cardEl.style.width = `${w}px`;
    cardEl.style.height = `${h}px`;
    cardEl.style.marginLeft = `${-w / 2}px`;
    cardEl.style.marginTop = `${-h / 2}px`;
    cardEl.classList.add("visible");
  }

  function distanceToLine(px, py, line) {
    let best = Infinity;
    if (line.path && line.path.length > 1) {
      for (let i = 0; i <= 48; i++) {
        const p = pointOnPath(line.path, i / 48);
        best = Math.min(best, Math.hypot(px - p.x, py - p.y));
      }
      return best;
    }
    for (let i = 0; i <= 48; i++) {
      const t = i / 48;
      const x = line.x + Math.sin(t * Math.PI) * line.bend;
      const y = line.y1 + (line.y2 - line.y1) * t;
      best = Math.min(best, Math.hypot(px - x, py - y));
    }
    return best;
  }

  function snortAt(x, y, power = 1) {
    let any = false;
    const radius = 28 * power;

    for (const line of lines) {
      if (distanceToLine(x, y, line) > radius + (line.maxThickness || 14)) continue;
      for (const p of line.particles) {
        if (p.life <= 0 || p.snorting) continue;
        if (Math.hypot(p.x - x, p.y - y) < radius) {
          p.snorting = true;
          p.vx = (x - p.x) * rand(0.08, 0.18) * power;
          p.vy = (y - p.y) * rand(0.08, 0.18) * power - rand(0.3, 1.4);
          p.life = rand(0.35, 0.7);
          any = true;
        }
      }
    }
    noseEl.classList.toggle("snorting", any);
  }

  function beginStroke(tip) {
    const path = [{ x: tip.x, y: tip.y, dist: 0, nx: tip.nx, ny: tip.ny }];
    path.totalLength = 0;

    const line = {
      vertical: false,
      path,
      maxThickness: RAIL_THICKNESS,
      bend: 0,
      particles: [],
      live: true,
    };

    lines.push(line);
    if (lines.length > MAX_LINES) lines.shift();

    stroke = {
      line,
      lastTip: { ...tip },
      armed: false,
    };
  }

  function appendPathPoint(path, x, y, nx, ny) {
    const prev = path[path.length - 1];
    const dist = Math.hypot(x - prev.x, y - prev.y);
    if (dist < 1.2) return 0;
    path.push({ x, y, dist, nx, ny });
    path.totalLength += dist;
    return dist;
  }

  function depositRail(from, to) {
    if (!stroke) return;
    const line = stroke.line;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.8) return;

    const tx = dx / dist;
    const ty = dy / dist;
    const nx = -ty;
    const ny = tx;

    appendPathPoint(line.path, to.x, to.y, nx, ny);

    const steps = Math.max(2, Math.ceil(dist * 2.4));
    const thick = RAIL_THICKNESS;

    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      const bx = from.x + dx * t;
      const by = from.y + dy * t;

      for (let g = 0; g < 14; g++) {
        const u = gaussian();
        if (Math.abs(u) > 0.95 && Math.random() > 0.3) continue;
        const across = u * thick * 0.45;
        const edgeFactor = 1 - Math.min(1, Math.abs(u));
        line.particles.push(
          makeParticle(
            bx + nx * across + rand(-0.25, 0.25),
            by + ny * across + rand(-0.25, 0.25),
            0.5 + 0.75 * edgeFactor
          )
        );
      }

      if (Math.random() > 0.55) {
        const across = rand(-thick * 0.65, thick * 0.65);
        line.particles.push(
          makeParticle(bx + nx * across, by + ny * across, rand(0.25, 0.55))
        );
      }
    }

    if (line.particles.length > 9000) {
      line.particles.splice(0, line.particles.length - 7500);
    }
  }

  function finalizeStroke() {
    if (!stroke || !stroke.line) {
      stroke = null;
      return;
    }
    const line = stroke.line;
    line.live = false;

    if (!line.path || line.path.totalLength < 24 || !stroke.armed) {
      lines = lines.filter((l) => l !== line);
      stroke = null;
      return;
    }

    const density = clamp(Math.floor(line.path.totalLength * 16), 2200, 5500);
    fillLineParticles(line, density);
    stroke = null;
  }

  function syncCardFromTouches() {
    if (touches.size < 2) {
      if (cardMode) finalizeStroke();
      cardMode = false;
      cardState = null;
      updateCardVisual();
      return;
    }

    const pts = [...touches.values()].slice(0, 2);
    const rawX = (pts[0].x + pts[1].x) / 2;
    const rawY = (pts[0].y + pts[1].y) / 2;
    const rawAngle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
    const rawLength = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);

    if (!cardMode || !cardState) {
      cardMode = true;
      cardState = {
        x: rawX,
        y: rawY,
        angle: rawAngle,
        length: rawLength,
        edgeSide: 1,
      };
      noseEl.classList.remove("visible", "snorting");
      pointer.down = false;

      const tip = cardEdgeTip(cardState, 0, 1);
      beginStroke(tip);
      updateCardVisual();
      return;
    }

    cardState.x = lerp(cardState.x, rawX, 0.55);
    cardState.y = lerp(cardState.y, rawY, 0.55);
    cardState.angle = lerpAngle(cardState.angle, rawAngle, 0.4);
    cardState.length = lerp(cardState.length, rawLength, 0.45);

    const tip = cardEdgeTip(
      cardState,
      cardState.x - (stroke?.lastTip?.x || cardState.x),
      cardState.y - (stroke?.lastTip?.y || cardState.y)
    );

    if (!stroke) beginStroke(tip);

    const last = stroke.lastTip;
    const moved = Math.hypot(tip.x - last.x, tip.y - last.y);

    if (!stroke.armed) {
      if (moved > 6) {
        stroke.armed = true;
        stroke.lastTip = { ...tip };
        stroke.line.path[0].x = tip.x;
        stroke.line.path[0].y = tip.y;
      }
    } else if (moved > 1.5) {
      depositRail(last, tip);
      stroke.lastTip = { ...tip };
    }

    updateCardVisual();
  }

  function cleanupLines() {
    lines = lines.filter((line) => {
      if (line.particles.length > 10000) {
        line.particles.splice(0, line.particles.length - 10000);
      }
      line.particles = line.particles.filter((p) => {
        if (p.life <= 0) {
          freeParticles.push({
            x: p.x,
            y: p.y,
            vx: rand(-0.4, 0.4),
            vy: rand(-0.8, -0.1),
            size: p.size * 0.55,
            life: rand(0.15, 0.4),
          });
          return false;
        }
        return true;
      });
      return line.particles.length > 0;
    });
  }

  function drawParticles() {
    for (const line of lines) {
      for (const p of line.particles) {
        if (p.snorting) {
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 1.04;
          p.vy *= 1.03;
          p.life -= 0.045;
          if (p.life <= 0) continue;
        }

        const alpha = Math.max(0, Math.min(1, p.life)) * (0.55 + p.shade * 0.42);
        const c = Math.floor(230 + p.shade * 25);
        ctx.beginPath();
        ctx.fillStyle = `rgba(${c}, ${c - 1}, ${Math.floor(c - 3)}, ${alpha})`;
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        if (p.spark && p.life > 0.82) {
          ctx.fillStyle = `rgba(255,255,255,${0.25 * alpha})`;
          ctx.fillRect(p.x, p.y, 0.8, 0.8);
        }
      }
    }

    for (let i = freeParticles.length - 1; i >= 0; i--) {
      const p = freeParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.045;
      if (p.life <= 0) {
        freeParticles.splice(i, 1);
        continue;
      }
      ctx.beginPath();
      ctx.fillStyle = `rgba(245,245,240,${p.life * 0.65})`;
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function frame() {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, cssW, cssH);

    if (!cardMode && pointer.down && pointer.inside) {
      snortAt(pointer.x, pointer.y, 1.15);
    }

    drawParticles();
    cleanupLines();
    requestAnimationFrame(frame);
  }

  function onPointerMove(e) {
    if (cardMode) return;
    if (e.pointerType === "touch" && touches.size > 0) return;
    const pt = canvasPoint(e.clientX, e.clientY);
    pointer.x = pt.x;
    pointer.y = pt.y;
    pointer.inside =
      pt.x >= 0 && pt.y >= 0 && pt.x <= pt.rect.width && pt.y <= pt.rect.height;
    updateNose(e.clientX, e.clientY, pointer.inside);
  }

  function onPointerDown(e) {
    if (e.target === drawBtn) return;
    if (e.pointerType === "touch") return;
    pointer.down = true;
    onPointerMove(e);
    if (pointer.inside) snortAt(pointer.x, pointer.y, 1.3);
  }

  function onPointerUp(e) {
    if (e.pointerType === "touch") return;
    pointer.down = false;
    noseEl.classList.remove("snorting");
  }

  function onTouchStart(e) {
    if (e.target === drawBtn) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      const pt = canvasPoint(t.clientX, t.clientY);
      touches.set(t.identifier, {
        x: pt.x,
        y: pt.y,
        clientX: t.clientX,
        clientY: t.clientY,
      });
    }

    if (touches.size >= 2) {
      syncCardFromTouches();
    } else if (touches.size === 1) {
      const t = [...touches.values()][0];
      pointer.down = true;
      pointer.x = t.x;
      pointer.y = t.y;
      pointer.inside = true;
      updateNose(t.clientX, t.clientY, true);
      snortAt(t.x, t.y, 1.3);
    }
  }

  function onTouchMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (!touches.has(t.identifier)) continue;
      const pt = canvasPoint(t.clientX, t.clientY);
      touches.set(t.identifier, {
        x: pt.x,
        y: pt.y,
        clientX: t.clientX,
        clientY: t.clientY,
      });
    }

    if (touches.size >= 2) {
      syncCardFromTouches();
    } else if (touches.size === 1 && !cardMode) {
      const t = [...touches.values()][0];
      pointer.down = true;
      pointer.x = t.x;
      pointer.y = t.y;
      pointer.inside = true;
      updateNose(t.clientX, t.clientY, true);
    }
  }

  function onTouchEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) touches.delete(t.identifier);

    if (touches.size >= 2) {
      syncCardFromTouches();
    } else {
      if (cardMode) finalizeStroke();
      cardMode = false;
      cardState = null;
      updateCardVisual();

      if (touches.size === 1) {
        const t = [...touches.values()][0];
        pointer.down = true;
        pointer.x = t.x;
        pointer.y = t.y;
        pointer.inside = true;
        updateNose(t.clientX, t.clientY, true);
      } else {
        pointer.down = false;
        noseEl.classList.remove("visible", "snorting");
      }
    }
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);

  canvas.addEventListener("touchstart", onTouchStart, { passive: false });
  canvas.addEventListener("touchmove", onTouchMove, { passive: false });
  canvas.addEventListener("touchend", onTouchEnd, { passive: false });
  canvas.addEventListener("touchcancel", onTouchEnd, { passive: false });

  drawBtn.addEventListener("click", () => seedLines());
  window.addEventListener("resize", () => {
    resize();
    seedLines();
  });

  resize();
  seedLines();
  requestAnimationFrame(frame);
})();
