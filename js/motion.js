/* motion.js — smooth, springy micro-interactions.
   Pure Web Animations API. No dependencies. Honors reduced-motion. */
(function (global) {
  'use strict';

  var REDUCED = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Spring-like easings (slight overshoot = "pop").
  var EASE = {
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',   // overshoot
    softSpring: 'cubic-bezier(0.22, 1.2, 0.36, 1)', // gentle overshoot
    out: 'cubic-bezier(0.16, 1, 0.3, 1)',
    inOut: 'cubic-bezier(0.65, 0, 0.35, 1)'
  };

  function animate(el, keyframes, opts) {
    if (!el || !el.animate) return { finished: Promise.resolve() };
    if (REDUCED) {
      // Snap to the final frame.
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
    reduced: REDUCED,

    /* Entrance: fade + rise with a springy settle. */
    enter: function (el, opts) {
      opts = opts || {};
      return animate(el, [
        { opacity: 0, transform: 'translateY(' + (opts.y || 12) + 'px) scale(' + (opts.scale || 0.985) + ')' },
        { opacity: 1, transform: 'translateY(0) scale(1)' }
      ], {
        duration: opts.duration || 460,
        delay: opts.delay || 0,
        easing: EASE.softSpring,
        fill: 'both'
      });
    },

    /* Stagger a list of elements into view. */
    stagger: function (els, opts) {
      opts = opts || {};
      var step = opts.step || 42;
      var max = opts.maxDelay || 480;
      Array.prototype.forEach.call(els, function (el, i) {
        Motion.enter(el, { delay: Math.min(i * step, max), y: opts.y, duration: opts.duration });
      });
    },

    /* Attention pop (used on status/priority change). */
    pop: function (el, opts) {
      opts = opts || {};
      return animate(el, [
        { transform: 'scale(1)' },
        { transform: 'scale(' + (opts.scale || 1.14) + ')' },
        { transform: 'scale(1)' }
      ], { duration: opts.duration || 340, easing: EASE.spring });
    },

    /* A quick celebratory pulse ring for milestone completion. */
    celebrate: function (el) {
      if (REDUCED || !el) return;
      var rect = el.getBoundingClientRect();
      var ring = document.createElement('span');
      ring.className = 'fx-ring';
      ring.style.left = (rect.left + rect.width / 2) + 'px';
      ring.style.top = (rect.top + rect.height / 2) + 'px';
      document.body.appendChild(ring);
      ring.animate([
        { transform: 'translate(-50%,-50%) scale(0.3)', opacity: 0.55 },
        { transform: 'translate(-50%,-50%) scale(2.4)', opacity: 0 }
      ], { duration: 620, easing: EASE.out }).finished.then(function () { ring.remove(); });
    },

    /* FLIP: capture positions, run `mutate` (which reorders the DOM),
       then animate every tracked child from its old box to the new one. */
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
        ], { duration: 460, easing: EASE.softSpring });
      });
    },

    /* Animate a progress bar fill to a target percentage. */
    fill: function (el, pct) {
      if (!el) return;
      var target = Math.max(0, Math.min(100, pct));
      if (REDUCED) { el.style.width = target + '%'; return; }
      var start = parseFloat(el.dataset.pct || '0');
      el.dataset.pct = String(target);
      var from = el.getBoundingClientRect().width;
      el.style.width = target + '%';
      var to = el.getBoundingClientRect().width;
      el.animate([{ width: from + 'px' }, { width: to + 'px' }],
        { duration: 620, easing: EASE.softSpring });
    },

    /* Count a number up/down. */
    countUp: function (el, to, opts) {
      opts = opts || {};
      var from = opts.from != null ? opts.from : (parseFloat(el.dataset.val || '0') || 0);
      var fmt = opts.format || function (v) { return Math.round(v); };
      el.dataset.val = String(to);
      if (REDUCED) { el.textContent = fmt(to); return; }
      var dur = opts.duration || 700;
      var startT = null;
      function frame(t) {
        if (startT === null) startT = t;
        var p = Math.min(1, (t - startT) / dur);
        var e = 1 - Math.pow(1 - p, 3); // easeOutCubic
        el.textContent = fmt(from + (to - from) * e);
        if (p < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    },

    /* Spring-in a modal panel. */
    modalIn: function (panel, backdrop) {
      animate(backdrop, [{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: EASE.out, fill: 'both' });
      return animate(panel, [
        { opacity: 0, transform: 'translateY(18px) scale(0.96)' },
        { opacity: 1, transform: 'translateY(0) scale(1)' }
      ], { duration: 420, easing: EASE.softSpring, fill: 'both' });
    },

    modalOut: function (panel, backdrop) {
      animate(backdrop, [{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: EASE.inOut, fill: 'both' });
      return animate(panel, [
        { opacity: 1, transform: 'translateY(0) scale(1)' },
        { opacity: 0, transform: 'translateY(10px) scale(0.98)' }
      ], { duration: 200, easing: EASE.inOut, fill: 'both' });
    }
  };

  global.Motion = Motion;
})(window);
