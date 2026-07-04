/* ─────────────────────────────────────────────────────────────────
   Cohort — hero ambient layer: a living network graph.

   A private social graph forming itself: soft champagne nodes in
   slow orbital drift, thin lines forming between neighbours, and
   every few seconds one edge "activates" — a bright pulse travels
   the line and the destination node blooms. An introduction.

   Canvas 2D, zero dependencies, single rAF loop. The canvas draws
   ONLY nodes / edges / pulses on transparency; the CSS behind it
   supplies the base atmosphere and doubles as the static fallback
   whenever this engine declines to start (mobile, coarse pointer,
   reduced motion, no 2D context, no JS).
   ───────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  /* ── Mount + init guards ─────────────────────────────────────── */
  var host = document.querySelector('.hero-ambient');
  if (!host || typeof window.matchMedia !== 'function') return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (matchMedia('(max-width: 820px)').matches) return;
  if (matchMedia('(pointer: coarse)').matches) return;

  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.style.opacity = '0';                    // slow fade-in on boot
  canvas.style.transition = 'opacity 1.4s ease-out';
  host.appendChild(canvas);

  /* ── Constants ───────────────────────────────────────────────── */
  var TAU = Math.PI * 2;
  var CH = '201,166,107';                       // champagne #C9A66B
  var LT = '228,200,143';                       // light champagne #E4C88F
  var DPR = Math.min(window.devicePixelRatio || 1, 2);
  var OVER = 40;                                // home-grid overscan px

  // Layer recipes, back → front. n = count at 1200px hero width.
  // gMul/gA: glow sprite radius multiple + peak alpha. cRGB/cA: core.
  // th/eA/lw: edge threshold px, edge max alpha, line width.
  var RECIPE = [
    { n: 22, r0: 1.0, r1: 1.8, gMul: 3.0, gA: 0.20, cRGB: null, cA: 0,   th: 0,   eA: 0,    lw: 0,   depth: 6  },
    { n: 26, r0: 1.6, r1: 2.6, gMul: 2.5, gA: 0.06, cRGB: CH,   cA: 0.5, th: 170, eA: 0.16, lw: 0.5, depth: 14 },
    { n: 16, r0: 2.2, r1: 3.4, gMul: 4.0, gA: 0.10, cRGB: LT,   cA: 0.9, th: 210, eA: 0.28, lw: 0.7, depth: 26 }
  ];

  /* ── Pre-rendered glow sprites (no shadowBlur, ever) ─────────── */
  function makeGlow(rgb, alpha) {
    var s = document.createElement('canvas');
    s.width = s.height = 64;
    var c = s.getContext('2d');
    var g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(' + rgb + ',' + alpha + ')');
    g.addColorStop(0.4, 'rgba(' + rgb + ',' + alpha * 0.5 + ')');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    return s;
  }
  var pulseGlow = makeGlow(LT, 0.35);

  /* ── Layer state ─────────────────────────────────────────────── */
  var layers = [];
  for (var li = 0; li < 3; li++) {
    var R = RECIPE[li];
    layers.push({
      idx: li, R: R, glow: makeGlow(CH, R.gA),
      n: 0, hx: [], hy: [], ax: [], ay: [],
      w1: [], w2: [], p1: [], p2: [],
      r: [], x: [], y: [], bloom: [],
      conn: []                                  // packed i*64+j, rebuilt per frame
    });
  }

  var W = 1, H = 1;

  function rand(a, b) { return a + Math.random() * (b - a); }

  // Jittered-grid homes across the hero (overscan so nothing pops).
  function populate() {
    var scale = Math.min(1.2, Math.max(0.6, W / 1200));
    var fw = W + OVER * 2, fh = H + OVER * 2;
    for (var k = 0; k < 3; k++) {
      var L = layers[k];
      var n = Math.max(3, Math.round(L.R.n * scale));
      var cols = Math.max(1, Math.round(Math.sqrt(n * fw / fh)));
      var rows = Math.max(1, Math.ceil(n / cols));
      L.n = n;
      for (var i = 0; i < n; i++) {
        var cw = fw / cols, chh = fh / rows;
        L.hx[i] = -OVER + ((i % cols) + 0.5) * cw + rand(-0.45, 0.45) * cw;
        L.hy[i] = -OVER + (((i / cols) | 0) + 0.5) * chh + rand(-0.45, 0.45) * chh;
        L.ax[i] = rand(20, 46);
        L.ay[i] = rand(20, 46);
        L.w1[i] = TAU / rand(30, 70);            // period 30–70 s
        L.w2[i] = TAU / rand(30, 70);
        L.p1[i] = rand(0, TAU);
        L.p2[i] = rand(0, TAU);
        L.r[i] = rand(L.R.r0, L.R.r1);
        L.bloom[i] = -9;
      }
    }
  }

  var inited = false;

  function resize() {
    var b = host.getBoundingClientRect();
    var w = Math.max(1, b.width), h = Math.max(1, b.height);
    if (inited && w === W && h === H) return;
    var ow = W, oh = H;
    W = w; H = h;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);

    var scale = Math.min(1.2, Math.max(0.6, W / 1200));
    var needN = Math.max(3, Math.round(RECIPE[2].n * scale));
    if (!inited || Math.abs(needN - layers[2].n) >= 2) {
      // First boot, or a width change big enough to shift node counts:
      // fresh scatter.
      populate();
      pulses.length = 0;
      ripples.length = 0;
      inited = true;
    } else {
      // Small reflow (e.g. web-font load nudging hero height): scale
      // existing homes into the new box so the graph glides rather
      // than re-scattering — no jump cut. Pulses stay valid.
      var sx = (W + OVER * 2) / (ow + OVER * 2);
      var sy = (H + OVER * 2) / (oh + OVER * 2);
      for (var k = 0; k < 3; k++) {
        var L = layers[k];
        for (var i = 0; i < L.n; i++) {
          L.hx[i] = (L.hx[i] + OVER) * sx - OVER;
          L.hy[i] = (L.hy[i] + OVER) * sy - OVER;
        }
      }
    }
  }

  /* ── Legibility guard: fade edges near the headline ──────────── */
  function centerGuard(x, y) {
    var dx = x - W / 2, dy = y - H / 2;
    var d = Math.sqrt(dx * dx + dy * dy);
    if (d <= 240) return 0.45;
    if (d >= 480) return 1;
    var s = (d - 240) / 240;
    s = s * s * (3 - 2 * s);                     // smoothstep
    return 0.45 + 0.55 * s;
  }

  /* ── Pulses ("introductions") + ripples ──────────────────────── */
  var pulses = [];                               // {L,i,j,t0} — max 2
  var ripples = [];                              // {L,i,t0}
  var nextPulse = performance.now() / 1000 + rand(3.2, 5.5);

  function ease(q) {                             // ease-in-out cubic
    return q < 0.5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2;
  }

  function spawnPulse(t) {
    nextPulse = t + rand(3.2, 5.5);
    if (pulses.length >= 2) return;
    var L = Math.random() < 0.6 ? layers[2] : layers[1];
    if (!L.conn.length) return;                  // nothing connected: skip the beat
    var pk = L.conn[(Math.random() * L.conn.length) | 0];
    pulses.push({ L: L.idx, i: (pk / 64) | 0, j: pk % 64, t0: t });
  }

  /* ── Mouse parallax (window-level; zero until first move) ────── */
  var tx = 0, ty = 0, mx = 0, my = 0;
  window.addEventListener('mousemove', function (e) {
    tx = (e.clientX / window.innerWidth - 0.5) * 2;
    ty = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  /* ── Render loop ─────────────────────────────────────────────── */
  var raf = 0;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    var t = now / 1000;
    mx += (tx - mx) * 0.045;
    my += (ty - my) * 0.045;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    for (var li = 0; li < 3; li++) {
      var L = layers[li], R = L.R;
      var i, j, k, dx, dy;

      // orbital positions: pos = home + (Ax·sin, Ay·cos)
      for (k = 0; k < L.n; k++) {
        L.x[k] = L.hx[k] + L.ax[k] * Math.sin(t * L.w1[k] + L.p1[k]);
        L.y[k] = L.hy[k] + L.ay[k] * Math.cos(t * L.w2[k] + L.p2[k]);
      }

      ctx.save();
      ctx.translate(-mx * R.depth, -my * R.depth);

      // edges (within-layer only)
      if (R.th) {
        L.conn.length = 0;
        var th2 = R.th * R.th;
        ctx.strokeStyle = 'rgb(' + CH + ')';
        ctx.lineWidth = R.lw;
        for (i = 0; i < L.n; i++) {
          for (j = i + 1; j < L.n; j++) {
            dx = L.x[i] - L.x[j];
            dy = L.y[i] - L.y[j];
            var d2 = dx * dx + dy * dy;
            if (d2 >= th2) continue;
            var d = Math.sqrt(d2);
            var a = R.eA * Math.pow(1 - d / R.th, 1.6) *
                    centerGuard((L.x[i] + L.x[j]) / 2, (L.y[i] + L.y[j]) / 2);
            for (k = 0; k < pulses.length; k++) {   // active edge lifts
              if (pulses[k].L === li && pulses[k].i === i && pulses[k].j === j) {
                a = Math.min(0.5, a * 2.5 + 0.15);
              }
            }
            ctx.globalAlpha = a;
            ctx.beginPath();
            ctx.moveTo(L.x[i], L.y[i]);
            ctx.lineTo(L.x[j], L.y[j]);
            ctx.stroke();
            L.conn.push(i * 64 + j);
          }
        }
      }

      // node glows + cores (alpha baked into sprites)
      ctx.globalAlpha = 1;
      for (k = 0; k < L.n; k++) {
        var g = L.r[k] * R.gMul;
        ctx.drawImage(L.glow, L.x[k] - g, L.y[k] - g, g * 2, g * 2);
      }
      if (R.cA) {
        ctx.fillStyle = 'rgba(' + R.cRGB + ',' + R.cA + ')';
        for (k = 0; k < L.n; k++) {
          var age = t - L.bloom[k];               // arrival bloom ×1.6 → 1
          var rr = L.r[k] * (age < 0.5 ? 1 + 0.6 * (1 - age / 0.5) : 1);
          ctx.beginPath();
          ctx.arc(L.x[k], L.y[k], rr, 0, TAU);
          ctx.fill();
        }
      }

      // pulses travelling this layer's edges
      for (k = pulses.length - 1; k >= 0; k--) {
        var P = pulses[k];
        if (P.L !== li) continue;
        var q = (t - P.t0) / 1.1;
        if (q >= 1) {                             // arrival: bloom + ripple
          L.bloom[P.j] = t;
          ripples.push({ L: li, i: P.j, t0: t });
          pulses.splice(k, 1);
          continue;
        }
        var e = ease(q);
        var px = L.x[P.i] + (L.x[P.j] - L.x[P.i]) * e;
        var py = L.y[P.i] + (L.y[P.j] - L.y[P.i]) * e;
        ctx.drawImage(pulseGlow, px - 8, py - 8, 16, 16);
        ctx.fillStyle = 'rgb(' + LT + ')';
        ctx.beginPath();
        ctx.arc(px, py, 2.2, 0, TAU);
        ctx.fill();
      }

      // ripple rings expanding from freshly-introduced nodes
      for (k = ripples.length - 1; k >= 0; k--) {
        var RP = ripples[k];
        if (RP.L !== li) continue;
        var rq = (t - RP.t0) / 0.65;
        if (rq >= 1) { ripples.splice(k, 1); continue; }
        ctx.globalAlpha = 0.45 * (1 - rq);
        ctx.strokeStyle = 'rgb(' + CH + ')';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(L.x[RP.i], L.y[RP.i], 16 * rq, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      ctx.restore();
    }

    if (t >= nextPulse) spawnPulse(t);
  }

  /* ── Lifecycle: pause off-screen / hidden, handle resize ─────── */
  var inView = true;

  function sync() {
    var run = inView && !document.hidden;
    if (run && !raf) raf = requestAnimationFrame(frame);
    else if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  if (typeof IntersectionObserver === 'function') {
    new IntersectionObserver(function (es) {
      inView = es[es.length - 1].isIntersecting;
      sync();
    }, { threshold: 0 }).observe(host);
  }
  document.addEventListener('visibilitychange', sync);

  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(resize).observe(host);
  } else {
    window.addEventListener('resize', resize);
  }

  resize();
  sync();

  // Reveal on the frame after first paint so the transition runs.
  requestAnimationFrame(function () {
    requestAnimationFrame(function () { canvas.style.opacity = '1'; });
  });
})();
