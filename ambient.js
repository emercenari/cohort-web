/* ─────────────────────────────────────────────────────────────────
   Cohort — hero ambient layer (ambient.js)

   Pairs with ambient.css. Zero dependencies, zero network requests,
   zero rAF loops. Works with or without GSAP on the page.

   Usage:
     <header class="hero" style="position:relative">
       <div class="hero-ambient"></div>   ← first child
       …hero content (z-index ≥ 1)…
     </header>
     <script src="ambient.js"></script>
     <script>
       initHeroAmbient(document.querySelector('.hero-ambient'), {
         // all optional:
         glowOpacity:  0.08,   // champagne glow peak alpha (0.06–0.09 tasteful range)
         driftSeconds: 21,     // glow A loop; glow B runs at 1.6× automatically
         grainOpacity: 0.025,  // film grain layer opacity
       });
     </script>

   What it does:
     1. Builds the four layers (vignette, two glows, grain) inside
        the container. Drift itself is pure CSS (see ambient.css) —
        compositor-only translate3d, no per-frame JS.
     2. Generates a 128×128 monochrome noise tile on an offscreen
        canvas ONCE, sets it as the grain background (data URI).
        The grain is static by design.
     3. IntersectionObserver pauses the CSS animations (class
        .ha-paused) whenever the hero is off-screen.
     4. prefers-reduced-motion is honored by ambient.css (drift
        frozen, static look kept); this file simply skips the
        observer in that case since there is nothing to pause.

   Returns a handle: { destroy() } — removes layers + observer.
   ───────────────────────────────────────────────────────────────── */

(function (global) {
  'use strict';

  var GRAIN_TILE = 128; // px — keep in sync with background-size in ambient.css

  /** Generate a static monochrome noise tile as a PNG data URI. */
  function makeGrainDataURI(size) {
    try {
      var canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      var ctx = canvas.getContext('2d');
      if (!ctx) return null;
      var image = ctx.createImageData(size, size);
      var data = image.data;
      for (var i = 0; i < data.length; i += 4) {
        // Full-range mono noise; the layer's low opacity + overlay
        // blend does the taming. Alpha stays opaque so the tile
        // compresses well and tiles seamlessly.
        var v = (Math.random() * 256) | 0;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
      return canvas.toDataURL('image/png');
    } catch (err) {
      return null; // no grain is a graceful degrade
    }
  }

  function makeLayer(className) {
    var node = document.createElement('div');
    node.className = className;
    node.setAttribute('aria-hidden', 'true');
    return node;
  }

  /**
   * Initialize the ambient layer inside a container element.
   * @param {HTMLElement} containerEl — the .hero-ambient div (class is
   *   added if missing). Must live inside a position:relative hero.
   * @param {Object} [opts]
   * @param {number} [opts.glowOpacity=0.08]  peak champagne alpha
   * @param {number} [opts.driftSeconds=21]   glow A loop duration
   * @param {number} [opts.grainOpacity=0.025] grain layer opacity
   * @returns {{destroy: function}|null}
   */
  function initHeroAmbient(containerEl, opts) {
    if (!containerEl || containerEl.__heroAmbient) {
      return containerEl ? containerEl.__heroAmbient || null : null;
    }
    opts = opts || {};

    containerEl.classList.add('hero-ambient');

    // Tunables → CSS custom properties (defaults live in ambient.css).
    if (typeof opts.glowOpacity === 'number') {
      containerEl.style.setProperty('--ha-glow-alpha', String(opts.glowOpacity));
    }
    if (typeof opts.driftSeconds === 'number') {
      containerEl.style.setProperty('--ha-drift', opts.driftSeconds + 's');
    }
    if (typeof opts.grainOpacity === 'number') {
      containerEl.style.setProperty('--ha-grain-opacity', String(opts.grainOpacity));
    }

    // Build layers.
    var vignette = makeLayer('ha-vignette');
    var glowA = makeLayer('ha-glow ha-glow-a');
    var glowB = makeLayer('ha-glow ha-glow-b');
    var grain = makeLayer('ha-grain');

    var grainURI = makeGrainDataURI(GRAIN_TILE);
    if (grainURI) {
      grain.style.backgroundImage = 'url("' + grainURI + '")';
    }

    containerEl.appendChild(vignette);
    containerEl.appendChild(glowA);
    containerEl.appendChild(glowB);
    containerEl.appendChild(grain);

    // Pause the (CSS) drift when the hero leaves the viewport.
    var observer = null;
    var reduced = false;
    try {
      reduced = global.matchMedia &&
        global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (err) { /* older engines: assume motion is fine */ }

    if (!reduced && typeof global.IntersectionObserver === 'function') {
      observer = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          containerEl.classList.toggle('ha-paused', !entries[i].isIntersecting);
        }
      }, { threshold: 0 });
      observer.observe(containerEl);
    }

    var handle = {
      destroy: function () {
        if (observer) { observer.disconnect(); observer = null; }
        containerEl.classList.remove('ha-paused');
        var nodes = [vignette, glowA, glowB, grain];
        for (var i = 0; i < nodes.length; i++) {
          if (nodes[i].parentNode === containerEl) containerEl.removeChild(nodes[i]);
        }
        delete containerEl.__heroAmbient;
      }
    };

    containerEl.__heroAmbient = handle;
    return handle;
  }

  global.initHeroAmbient = initHeroAmbient;
})(typeof window !== 'undefined' ? window : this);

// Auto-init (script is deferred, DOM is parsed by now)
if (typeof initHeroAmbient === "function") {
  var __ha = document.querySelector(".hero-ambient");
  if (__ha) initHeroAmbient(__ha);
}
