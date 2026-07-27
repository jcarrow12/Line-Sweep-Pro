/* motion.js — the house motion style ("On Air" / Rundown direction).
   One settle curve, three speeds. Everything decelerates into place —
   no overshoot, no bounce. Pure Web Animations API. Honors reduced-motion.

   Mirrors the SNY Mets motion library tokens:
     --ease-settle   cubic-bezier(0.22, 1, 0.36, 1)   decelerate into place
     --ease-standard cubic-bezier(0.4, 0, 0.2, 1)      symmetric ease
     130ms fast (taps, chips, hovers) · 190ms base (reorders, panels,
     selection) · 280ms slow (larger surfaces). */
(function (global) {
  'use strict';

  var REDUCED = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // House curves. `settle` is the signature decelerate-into-place ease.
  var SETTLE = 'cubic-bezier(0.22, 1, 0.36, 1)';
  var STANDARD = 'cubic-bezier(0.4, 0, 0.2, 1)';

  var EASE = {
    settle: SETTLE,
    standard: STANDARD,
    // Back-compat aliases — all resolve to the house curves (no overshoot).
    out: SETTLE,
    inOut: STANDARD,
    spring: SETTLE,
    softSpring: SETTLE
  };

  // Three speeds (ms).
  var DUR = { fast: 130, base: 190, slow: 280 };

  function animate(el, keyframes, opts) {
    if (!el || !el.animate) return { finished: Promise.resolve() };
    if (REDUCED) {
      var last = keyframes[keyframes.length - 1];
      Object.keys(last).forEach(function (k) {
        if (k !== 'offset' && k !== 'easing') el.style[k] = last[k];
      });
      return { finished: Promise.resolve(), cancel: function () {} };
    }
    return el.animate(keyframes, opts);
  }

  var Motion = {
    EASE: EASE,
    DUR: DUR,
    reduced: REDUCED,

    /* Entrance: fade + a small rise that settles into place (no scale bounce). */
    enter: function (el, opts) {
      opts = opts || {};
      return animate(el, [
        { opacity: 0, transform: 'translateY(' + (opts.y || 8) + 'px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ], {
        duration: opts.duration || DUR.base,
        delay: opts.delay || 0,
        easing: SETTLE,
        fill: 'both'
      });
    },

    /* Stagger a list into view — quick, tight cadence. */
    stagger: function (els, opts) {
      opts = opts || {};
      var step = opts.step || 22;
      var max = opts.maxDelay || 260;
      Array.prototype.forEach.call(els, function (el, i) {
        Motion.enter(el, { delay: Math.min(i * step, max), y: opts.y, duration: opts.duration });
      });
    },

    /* Restrained feedback on change (e.g. status/priority). A small settle,
       not a pop — matches the house lift scale of ~1.01–1.05. */
    pop: function (el, opts) {
      opts = opts || {};
      return animate(el, [
        { transform: 'scale(1)' },
        { transform: 'scale(' + (opts.scale || 1.05) + ')' },
        { transform: 'scale(1)' }
      ], { duration: opts.duration || DUR.base, easing: SETTLE });
    },

    /* Milestone completion — an on-brand acknowledgement: a quick settle
       emphasis, kept restrained (no celebratory ring — color/flourish is
       reserved, per the house direction). */
    celebrate: function (el) {
      if (REDUCED || !el) return;
      animate(el, [
        { transform: 'scale(1)' },
        { transform: 'scale(1.03)' },
        { transform: 'scale(1)' }
      ], { duration: DUR.slow, easing: SETTLE });
    },

    /* FLIP: capture positions, run `mutate` (reorders the DOM), then settle
       every tracked child from old box to new — emulating the library's
       spring layout at the base speed. */
    flip: function (items, mutate) {
      if (REDUCED) { mutate(); return; }
      var first = new Map();
      Array.prototype.forEach.call(items, function (el) {
        first.set(el, el.getBoundingClientRect());
      });
      mutate();
      Array.prototype.forEach.call(items, function (el) {
        var a = first.get(el);
        if (!a) return;
        var b = el.getBoundingClientRect();
        var dx = a.left - b.left;
        var dy = a.top - b.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
        el.animate([
          { transform: 'translate(' + dx + 'px,' + dy + 'px)' },
          { transform: 'translate(0,0)' }
        ], { duration: DUR.base, easing: SETTLE });
      });
    },

    /* Animate a progress bar fill to a target percentage.
       Animate width (not scaleX) so the fill keeps its full pill radius at
       every value — a scaled pill squishes its rounded caps at low percentages.
       The % label lives beside the bar, so no text rides over the fill. */
    fill: function (el, pct) {
      if (!el) return;
      var target = Math.max(0, Math.min(100, pct));
      el.dataset.pct = String(target);
      if (REDUCED) { el.style.width = target + '%'; return; }
      var from = el.getBoundingClientRect().width;
      el.style.width = target + '%';
      var to = el.getBoundingClientRect().width;
      el.animate([{ width: from + 'px' }, { width: to + 'px' }],
        { duration: DUR.slow, easing: SETTLE });
    },

    /* Count a number up/down (decelerating). */
    countUp: function (el, to, opts) {
      opts = opts || {};
      var from = opts.from != null ? opts.from : (parseFloat(el.dataset.val || '0') || 0);
      var fmt = opts.format || function (v) { return Math.round(v); };
      el.dataset.val = String(to);
      if (REDUCED) { el.textContent = fmt(to); return; }
      var dur = opts.duration || 460;
      var startT = null;
      function frame(t) {
        if (startT === null) startT = t;
        var p = Math.min(1, (t - startT) / dur);
        var e = 1 - Math.pow(1 - p, 3); // easeOutCubic — a settle
        el.textContent = fmt(from + (to - from) * e);
        if (p < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    },

    /* Modal: fade-and-settle over the slow speed (larger surface).
       The backdrop blur is static; only its tint layer fades (via the .is-open
       class + a CSS transition), so we never animate opacity on the filtered
       layer. Just the panel is animated here. */
    modalIn: function (panel, backdrop) {
      if (backdrop) { backdrop.classList.remove('is-open'); void backdrop.offsetWidth; backdrop.classList.add('is-open'); }
      return animate(panel, [
        { opacity: 0, transform: 'translateY(10px) scale(0.99)' },
        { opacity: 1, transform: 'translateY(0) scale(1)' }
      ], { duration: DUR.slow, easing: SETTLE, fill: 'both' });
    },

    modalOut: function (panel, backdrop) {
      if (backdrop) backdrop.classList.remove('is-open');
      return animate(panel, [
        { opacity: 1, transform: 'translateY(0) scale(1)' },
        { opacity: 0, transform: 'translateY(6px) scale(0.995)' }
      ], { duration: DUR.base, easing: STANDARD, fill: 'both' });
    }
  };

  global.Motion = Motion;
})(window);
