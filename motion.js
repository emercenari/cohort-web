/*
 * Cohort — motion.js
 * Cinematic-but-editorial animation layer. Quiet, confident, plays once.
 *
 * Safety rails:
 *  - Adds .js to <html> ONLY when GSAP + ScrollTrigger loaded and
 *    prefers-reduced-motion is off. Without .js the site is fully static
 *    (arcs drawn, counters at final values — the HTML defaults).
 *  - gsap.matchMedia() splits desktop (Lenis, parallax, bg crossfade,
 *    magnetic buttons, cursor glow) from mobile (fades + phone micro-anims).
 *  - Everything registers after document.fonts.ready so ScrollTrigger
 *    measures settled layout.
 */
(function () {
  'use strict';

  var docEl = document.documentElement;

  // ── Guards ──────────────────────────────────────────────────────
  if (!window.gsap || !window.ScrollTrigger) return; // CDN failed → static site
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return; // end states are the HTML defaults

  docEl.classList.add('js');
  gsap.registerPlugin(ScrollTrigger);

  var NAV_OFFSET = 64;
  var COUNTER_SEL = '.arc-num, .gauge-num, [data-count]';

  // ── J. Number-counter utility ───────────────────────────────────
  // Reusable for gauge, arcs, streak, "3 need tending". Targets are read
  // from the DOM in prepData() — never hardcoded here.
  function counterTween(el, duration, ease) {
    var target = parseFloat(el.dataset.animTarget) || 0;
    var proxy = { v: 0 };
    return gsap.to(proxy, {
      v: target,
      duration: duration,
      ease: ease || 'power2.out',
      onUpdate: function () { el.textContent = Math.round(proxy.v); },
      onComplete: function () { el.textContent = String(target); }
    });
  }

  // ── Data prep (read end states from DOM before ever overwriting) ─
  function prepData() {
    // Arc + gauge rings: stash target dashoffset and "empty" dasharray.
    document.querySelectorAll('.phone .arc svg, .phone .gauge svg').forEach(function (svg) {
      var ring = svg.querySelectorAll('circle')[1];
      if (!ring) return;
      ring.dataset.animTarget = ring.getAttribute('stroke-dashoffset');
      ring.dataset.animStart = ring.getAttribute('stroke-dasharray');
    });
    // Counters: stash final integer.
    document.querySelectorAll(COUNTER_SEL).forEach(function (el) {
      var m = el.textContent.match(/\d+/);
      el.dataset.animTarget = m ? m[0] : '0';
    });
    // Typewriter bubble: stash text and reserve final height (no layout jump).
    var bubble = document.querySelector('.draft-bubble');
    if (bubble) {
      bubble.dataset.fullText = bubble.textContent;
      bubble.style.minHeight = bubble.offsetHeight + 'px';
    }
  }

  function zeroMicroStates() {
    document.querySelectorAll(COUNTER_SEL).forEach(function (el) { el.textContent = '0'; });
    var bubble = document.querySelector('.draft-bubble');
    if (bubble) bubble.textContent = '';
  }

  function restoreMicroStates() {
    document.querySelectorAll(COUNTER_SEL).forEach(function (el) {
      if (el.dataset.animTarget) el.textContent = el.dataset.animTarget;
    });
    var bubble = document.querySelector('.draft-bubble');
    if (bubble) {
      bubble.textContent = bubble.dataset.fullText || bubble.textContent;
      bubble.classList.remove('typing');
    }
  }

  // ── A. Hero load sequence (~1.2s, plays once) ───────────────────
  function heroIntro() {
    var inners = document.querySelectorAll('.hero .h-line-inner');
    var tl = gsap.timeline({ defaults: { ease: 'expo.out', duration: 1 } });
    tl.fromTo('nav', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6, ease: 'power1.out' }, 0);
    tl.fromTo('.hero .caps', { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.7 }, 0);
    // NOTE: the .js CSS puts translateY(135%) on the inners so nothing
    // flashes before this runs. GSAP parses that as a px "y", so we must
    // explicitly zero y while animating yPercent.
    if (inners[0]) tl.fromTo(inners[0], { y: 0, yPercent: 135 }, { y: 0, yPercent: 0 }, 0.1);
    if (inners[1]) tl.fromTo(inners[1], { y: 0, yPercent: 135 }, { y: 0, yPercent: 0 }, 0.22);
    tl.fromTo('.hero .container > p:not(.caps)', { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.9 }, 0.55);
    tl.fromTo('.hero-ctas .btn', { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.8, stagger: 0.09 }, 0.7);
    // The signature beat: the champagne dot lands last.
    tl.fromTo('.hero .h-dot', { scale: 0, autoAlpha: 0, transformOrigin: '0% 100%' },
      { scale: 1, autoAlpha: 1, duration: 0.5, ease: 'back.out(2)' }, 1.0);
  }

  // ── D. Phone micro-animations (built into each chapter timeline) ─
  function buildMicro(chapter, index, tl, pos) {
    var phone = chapter.querySelector('.phone');
    if (!phone) return;

    // Phones 1 + 2: arc rings draw in + numbers count up.
    if (index === 0 || index === 1) {
      phone.querySelectorAll('.arc').forEach(function (arc, j) {
        var ring = arc.querySelectorAll('circle')[1];
        var at = pos + j * 0.15;
        if (ring) {
          tl.fromTo(ring, { strokeDashoffset: parseFloat(ring.dataset.animStart) },
            { strokeDashoffset: parseFloat(ring.dataset.animTarget), duration: 1.1, ease: 'power2.out' }, at);
        }
        var num = arc.querySelector('.arc-num');
        if (num) tl.add(counterTween(num, 1.1), at);
      });
    }

    // Phone 1: "3 need tending" counts up quickly.
    if (index === 0) {
      var sub = phone.querySelector('[data-count]');
      if (sub) tl.add(counterTween(sub, 0.5), pos);
    }

    // Phone 2: rows enter sequentially, quiet-day spans pulse twice, gently.
    if (index === 1) {
      var rows = phone.querySelectorAll('.row');
      tl.fromTo(rows, { autoAlpha: 0, y: 10 },
        { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power2.out', stagger: 0.14 }, pos);
      var quietSpans = phone.querySelectorAll('.row .row-sub > span');
      // 2 cycles: 1 → 0.55 → 1 → 0.55 → 1, 4 × 0.4s = 1.6s total.
      tl.to(quietSpans, { opacity: 0.55, duration: 0.4, repeat: 3, yoyo: true, ease: 'sine.inOut', stagger: 0.22 }, pos + 0.8);
    }

    // Phone 3: typewriter draft, then tone pills + send button.
    if (index === 2) {
      var bubble = phone.querySelector('.draft-bubble');
      if (bubble) {
        var full = bubble.dataset.fullText || '';
        var total = Math.min(full.length * 0.028, 3.2); // 28ms/char, capped at 3.2s
        var proxy = { n: 0 };
        tl.to(proxy, {
          n: full.length,
          duration: total,
          ease: 'none',
          onStart: function () { bubble.classList.add('typing'); },
          onUpdate: function () { bubble.textContent = full.slice(0, Math.round(proxy.n)); },
          onComplete: function () { bubble.classList.remove('typing'); bubble.textContent = full; }
        }, pos);
        var after = pos + total + 0.08;
        tl.fromTo(phone.querySelectorAll('.tone-pills .tone'), { autoAlpha: 0, y: 8 },
          { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power2.out', stagger: 0.08 }, after);
        tl.fromTo(phone.querySelector('.send-btn'), { autoAlpha: 0, y: 8 },
          { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power2.out' }, after + 0.16);
      }
    }

    // Phone 4: gauge draws + counts, stats stagger, birthday nudge drops in.
    if (index === 3) {
      var ring4 = phone.querySelector('.gauge svg circle:nth-of-type(2)');
      if (ring4) {
        tl.fromTo(ring4, { strokeDashoffset: parseFloat(ring4.dataset.animStart) },
          { strokeDashoffset: parseFloat(ring4.dataset.animTarget), duration: 1.5, ease: 'power2.out' }, pos);
      }
      var gaugeNum = phone.querySelector('.gauge-num');
      if (gaugeNum) tl.add(counterTween(gaugeNum, 1.5), pos);
      tl.fromTo(phone.querySelectorAll('.stat'), { autoAlpha: 0, y: 12 },
        { autoAlpha: 1, y: 0, duration: 0.7, ease: 'power2.out', stagger: 0.1 }, pos + 0.15);
      var streak = phone.querySelector('.stat-v[data-count]');
      if (streak) tl.add(counterTween(streak, 0.8), pos + 0.35);
      tl.fromTo(phone.querySelector('.nudge-card'), { autoAlpha: 0, y: -14 },
        { autoAlpha: 1, y: 0, duration: 0.8, ease: 'power2.out' }, pos + 1.3);
    }
  }

  // ── C. Chapter reveals ──────────────────────────────────────────
  function setupChapters(desktop) {
    gsap.fromTo('.chapters-head .caps', { autoAlpha: 0, y: 16 }, {
      autoAlpha: 1, y: 0, duration: 0.9, ease: 'expo.out',
      scrollTrigger: { trigger: '.chapters-head', start: 'top 85%', once: true }
    });

    gsap.utils.toArray('.chapter').forEach(function (chapter, i) {
      var flip = chapter.classList.contains('flip');
      var copyKids = chapter.querySelectorAll('.chapter-copy > *');
      var phoneSide = chapter.querySelector('.chapter-phone');
      // x/rotate side-entrances are desktop-only; mobile keeps simple fade/rise.
      var copyX = desktop ? (flip ? 24 : -24) : 0;
      var phoneX = desktop ? (flip ? -32 : 32) : 0;
      var phoneRot = desktop ? (flip ? -1.2 : 1.2) : 0;

      var tl = gsap.timeline({
        scrollTrigger: { trigger: chapter, start: 'top 78%', once: true },
        defaults: { ease: 'expo.out' }
      });
      tl.fromTo(copyKids, { autoAlpha: 0, y: 28, x: copyX },
        { autoAlpha: 1, y: 0, x: 0, duration: 1.0, stagger: 0.09 }, 0);
      tl.fromTo(phoneSide, { autoAlpha: 0, y: 40, x: phoneX, rotationZ: phoneRot },
        { autoAlpha: 1, y: 0, x: 0, rotationZ: 0, duration: 1.2 }, 0.15);
      // Micro-anims fire ~0.4s after the phone starts moving (0.15 + 0.4).
      buildMicro(chapter, i, tl, 0.55);
    });
  }

  // ── E. Founder / Philosophy / Waitlist reveals ──────────────────
  function setupFounder() {
    var tl = gsap.timeline({
      scrollTrigger: { trigger: '.founder', start: 'top 75%', once: true },
      defaults: { ease: 'expo.out' }
    });
    tl.fromTo('.founder .caps', { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.7 }, 0);
    tl.fromTo('.founder-avatar', { autoAlpha: 0, scale: 0.85 }, { autoAlpha: 1, scale: 1, duration: 0.8, ease: 'power2.out' }, 0.1);
    tl.fromTo('.founder blockquote', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.9 }, 0.35);
    tl.fromTo('.founder figcaption', { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.8 }, 0.6);
  }

  function setupPhilosophy() {
    var tl = gsap.timeline({
      scrollTrigger: { trigger: '.philosophy', start: 'top 75%', once: true },
      defaults: { ease: 'expo.out' }
    });
    tl.fromTo('.philosophy .caps', { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.7 }, 0);
    tl.fromTo('.philosophy h2', { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 1.0 }, 0.12);
    tl.fromTo('.philosophy p', { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.9 }, 0.3);
  }

  function setupWaitlist() {
    var kids = document.querySelectorAll('.waitlist .container > *');
    var tl = gsap.timeline({
      scrollTrigger: { trigger: '.waitlist', start: 'top 78%', once: true },
      defaults: { ease: 'expo.out' }
    });
    tl.fromTo(kids, { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.08 }, 0);
    // The dot reuses the hero's small scale-in beat.
    var dot = document.querySelector('.waitlist h2 .dot');
    if (dot) tl.fromTo(dot, { scale: 0, transformOrigin: '0% 100%' }, { scale: 1, duration: 0.5, ease: 'back.out(2)' }, 0.45);
  }

  // ── B. Lenis smooth scroll (desktop only) ───────────────────────
  function setupLenis() {
    if (!window.Lenis) return null;
    var lenis = new Lenis({ lerp: 0.12, wheelMultiplier: 1 });
    lenis.on('scroll', ScrollTrigger.update);
    var raf = function (t) { lenis.raf(t * 1000); };
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);
    // CSS smooth-behavior fights Lenis's per-frame scrollTop writes.
    var prevBehavior = docEl.style.scrollBehavior;
    docEl.style.scrollBehavior = 'auto';

    // Anchor links scroll via Lenis with the sticky-nav offset.
    var onClick = function (e) {
      var a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a || a.classList.contains('skip-link')) return; // skip-link keeps native jump + focus
      var href = a.getAttribute('href');
      if (href === '#') {
        e.preventDefault();
        lenis.scrollTo(0);
        return;
      }
      var target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, { offset: -NAV_OFFSET });
    };
    document.addEventListener('click', onClick);

    return function () {
      document.removeEventListener('click', onClick);
      gsap.ticker.remove(raf);
      gsap.ticker.lagSmoothing(500, 33); // GSAP defaults
      lenis.destroy();
      docEl.style.scrollBehavior = prevBehavior;
    };
  }

  // ── F. Section background crossfade (desktop, scrubbed) ─────────
  // Conservative variant: sections keep their own opaque backgrounds;
  // the body behind softens toward the next section's tone so edges
  // never pop. Disabled on mobile / reduced motion.
  function setupBgCrossfade() {
    var styles = getComputedStyle(docEl);
    var navy = styles.getPropertyValue('--navy').trim();
    var navyDeep = styles.getPropertyValue('--navy-deep').trim();

    // navy → navy-deep as the founder section approaches.
    gsap.fromTo(document.body, { backgroundColor: navy }, {
      backgroundColor: navyDeep, ease: 'none', immediateRender: false,
      scrollTrigger: { trigger: '.founder', start: 'top 90%', end: 'top 40%', scrub: 0.6 }
    });
    // back to navy while the (opaque cream) philosophy section covers the
    // viewport, so the waitlist arrives on its designed navy ground.
    gsap.fromTo(document.body, { backgroundColor: navyDeep }, {
      backgroundColor: navy, ease: 'none', immediateRender: false,
      scrollTrigger: { trigger: '.philosophy', start: 'top 40%', end: 'bottom bottom', scrub: 0.6 }
    });
  }

  // ── G. Footer parallax (desktop, scrubbed) ──────────────────────
  function setupFooterParallax() {
    gsap.fromTo('.footer-inner', { yPercent: -25 }, {
      yPercent: 0, ease: 'none',
      scrollTrigger: { trigger: 'footer', start: 'top bottom', end: 'bottom bottom', scrub: true }
    });
  }

  // ── H + I. Magnetic buttons + cursor glow (desktop pointer) ─────
  function setupPointerFX() {
    var RING = 40; // proximity ring in px
    var MAX = 4;   // max magnetic translate in px

    var magnets = gsap.utils.toArray('.btn, .nav-cta, .wl-form button').map(function (el) {
      return {
        el: el,
        qx: gsap.quickTo(el, 'x', { duration: 0.4, ease: 'power3.out' }),
        qy: gsap.quickTo(el, 'y', { duration: 0.4, ease: 'power3.out' })
      };
    });

    var glow = document.createElement('div');
    glow.className = 'cursor-glow';
    glow.setAttribute('aria-hidden', 'true');
    document.body.appendChild(glow);
    gsap.set(glow, { x: -600, y: -600 });
    var gx = gsap.quickTo(glow, 'x', { duration: 0.5, ease: 'power3' });
    var gy = gsap.quickTo(glow, 'y', { duration: 0.5, ease: 'power3' });
    var go = gsap.quickTo(glow, 'opacity', { duration: 0.4, ease: 'power2.out' });

    var onMove = function (e) {
      // Glow follows the cursor; hidden over the cream philosophy section.
      gx(e.clientX);
      gy(e.clientY);
      var overCream = e.target && e.target.closest && e.target.closest('.philosophy');
      go(overCream ? 0 : 1);
      // Magnetic pull, precise not bouncy.
      for (var i = 0; i < magnets.length; i++) {
        var m = magnets[i];
        var r = m.el.getBoundingClientRect();
        if (e.clientX > r.left - RING && e.clientX < r.right + RING &&
            e.clientY > r.top - RING && e.clientY < r.bottom + RING) {
          var dx = e.clientX - (r.left + r.width / 2);
          var dy = e.clientY - (r.top + r.height / 2);
          m.qx(gsap.utils.clamp(-MAX, MAX, dx * 0.08));
          m.qy(gsap.utils.clamp(-MAX, MAX, dy * 0.08));
        } else {
          m.qx(0);
          m.qy(0);
        }
      }
    };
    var onLeave = function () {
      go(0);
      magnets.forEach(function (m) { m.qx(0); m.qy(0); });
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    docEl.addEventListener('mouseleave', onLeave);

    return function () {
      window.removeEventListener('mousemove', onMove);
      docEl.removeEventListener('mouseleave', onLeave);
      glow.remove();
    };
  }

  // ── Boot ────────────────────────────────────────────────────────
  function initMotion() {
    prepData();
    heroIntro();

    var mm = gsap.matchMedia();
    mm.add({
      desktop: '(min-width: 821px) and (pointer: fine)',
      mobile: '(max-width: 820px), (pointer: coarse)'
    }, function (ctx) {
      var desktop = !!(ctx.conditions && ctx.conditions.desktop);
      var cleanups = [];

      zeroMicroStates();
      setupChapters(desktop);
      setupFounder();
      setupPhilosophy();
      setupWaitlist();

      if (desktop) {
        cleanups.push(setupLenis());
        setupBgCrossfade();
        setupFooterParallax();
        cleanups.push(setupPointerFX());
      }

      return function () {
        cleanups.forEach(function (fn) { if (fn) fn(); });
        restoreMicroStates();
      };
    });
  }

  // Register everything only after fonts settle (with a safety timeout),
  // so ScrollTrigger positions and the bubble height are measured correctly.
  var fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
  Promise.race([
    fontsReady,
    new Promise(function (resolve) { setTimeout(resolve, 2500); })
  ]).then(function () {
    try {
      initMotion();
    } catch (err) {
      // Fail open: reveal the static site rather than risk hidden content.
      docEl.classList.remove('js');
      console.warn('[cohort] motion disabled:', err);
    }
  });
})();
