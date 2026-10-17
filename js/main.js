(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var lenis = null;

  // Scroll animations: selector → AOS effect. Custom effects (reveal,
  // slide-in-far, draw) are defined in style.css → "Animations".
  // stagger: delay step per matched element; staggerGroup: restart the stagger every N items.
  var ANIMATIONS = [
    { selector: '.header__inner > *', effect: 'fade-down', delay: 200, stagger: 100 },
    { selector: '.hero__title', effect: 'fade-left', delay: 300, duration: 1200 },
    { selector: '.hero__tagline', effect: 'fade-up', delay: 500 },
    { selector: '.stat-card', effect: 'fade-up', delay: 700, stagger: 120 },
    { selector: '.hero__actions .btn', effect: 'fade-up', delay: 800, stagger: 120 },

    { selector: '.about .label', effect: 'fade-up' },
    { selector: '.about__photo', effect: 'reveal', duration: 1200, stagger: 100, staggerGroup: 4 },

    { selector: '.expertise__region', effect: 'fade-left' },
    { selector: '.expertise__title-line', effect: 'fade-up', stagger: 150 },
    { selector: '.expertise__years-line', effect: 'fade-right', stagger: 150 },
    { selector: '.expertise__p', effect: 'fade-up' },
    { selector: '.expertise__based', effect: 'fade-up' },

    { selector: '.services__label', effect: 'fade-up' },
    { selector: '.service-card', effect: 'fade-up', stagger: 120 },
    { selector: '.services__btn', effect: 'fade-up' },
    { selector: '.services__heading', effect: 'fade-up', duration: 1200 },
    // .services__case is animated by initCaseLid() (which also fades the 01/02 block in on desktop)
    { selector: '.feature', effect: 'fade-up', delay: 300, stagger: 150 },

    { selector: '.lessons__head .label', effect: 'fade-right' },
    { selector: '.lessons__rule', effect: 'draw', duration: 1400 },
    { selector: '.lessons__title-line', effect: 'fade-right', stagger: 120 },
    { selector: '.lessons__text', effect: 'fade-up' },
    { selector: '.lessons__btn', effect: 'fade-up', delay: 150 },

    { selector: '.footer__title', effect: 'fade-up' },
    { selector: '.booking-form > .field-wrap, .booking-form__submit', effect: 'fade-up', stagger: 80 },
    { selector: '.footer__rule', effect: 'draw', duration: 1400 },
    { selector: '.footer__year, .footer__legal-link', effect: 'fade', stagger: 100 },
    { selector: '.footer__group', effect: 'fade-up', stagger: 150 },
    { selector: '.to-top', effect: 'zoom-in' },
    // Last items on the page: offset 0, otherwise they sit below the trigger line at max scroll
    { selector: '.footer__divider', effect: 'draw', duration: 1400, offset: 0 },
    { selector: '.footer__contact, .footer__dev', effect: 'fade-up', stagger: 100, offset: 0 }
  ];

  // Parallax: translateY = (viewport centre − section centre) × speed
  var PARALLAX = [
    { selector: '.hero__portrait', speed: 0.06 },
    { selector: '.lessons__palettes', speed: 0.015 },
    { selector: '.footer__portrait', speed: 0.06 }
  ];

  // Scroll-linked drift: the element slides in by `x` px and fades in while its
  // top moves from `start` to `end` (fractions of the viewport height).
  // Positive `x` comes in from the right, negative from the left.
  var SCRUB = [
    { selector: '.expertise__city', x: 260, start: 1, end: 0.35 },
    { selector: '.polaroid', x: -260, start: 1, end: 0.35 }
  ];

  // Scroll fill: words go muted → full colour while the block's top moves from
  // `start` to the point where its bottom reaches `end` (viewport fractions).
  // `soft` = how many words are mid-transition at once.
  var FILL = [
    { selector: '.about__text', start: 0.85, end: 0.5, soft: 4 }
  ];

  // Makeup case: the lid swings open (rotateX from `angle` to 0) while the
  // hinge moves from `start` to `end` (viewport fractions). `hinge` = hinge
  // line / photo width (photo 1312 wide, hinge at y 565). `reveal` fades in
  // during the last `revealFrom`…1 of the progress (the 01/02 text on the lid).
  // Desktop/laptop: starts while the hinge is still below the fold, so the lid
  // is already lifting when "Considered for every setting" comes into view.
  // `compact` (≤1279): 01/02 sit above the case, not on the lid, so they keep
  // their own AOS fade and the lid opens once the case itself is in view.
  var CASE_LID = {
    selector: '[data-case-lid]',
    hinge: 565 / 1312,
    angle: -100,
    start: 1.8,
    end: 0.75,
    reveal: '.services__features',
    revealFrom: 0.65,
    compact: { media: '(max-width: 1279px)', start: 0.95, end: 0.45, reveal: false }
  };

  // Shared scroll loop for parallax, scrub and fill.
  // Performance rules (low-end devices):
  // - Geometry is measured only when layout can change (init, resize, load,
  //   fonts, document size change) and cached in page coordinates.
  // - On scroll, effects only compute from scrollY and write styles: no
  //   layout reads, so no forced style/layout recalcs per frame.
  // - With Lenis the update runs inside Lenis' own rAF tick (same frame as
  //   the scroll position change), so layers never lag a frame behind.
  // - Styles are written only when the value actually changes.
  var scrollEffects = [];
  var lastScrollY = null;

  function clamp01(value) {
    return Math.min(1, Math.max(0, value));
  }

  // Top of a node in page coordinates, ignoring its own translate
  // (offsetTop is not affected by transforms; see CLAUDE.md).
  function layoutPageTop(node) {
    var parent = node.offsetParent || document.body;
    return parent.getBoundingClientRect().top + window.scrollY + node.offsetTop;
  }

  // Writes an inline style property only if the value changed
  function setStyle(node, cache, prop, value) {
    if (cache[prop] === value) return;
    cache[prop] = value;
    if (prop.charAt(0) === '-') node.style.setProperty(prop, value);
    else node.style[prop] = value;
  }

  function measureScrollEffects() {
    scrollEffects.forEach(function (effect) { effect.measure(); });
    renderScrollEffects(true);
  }

  function renderScrollEffects(force) {
    var y = window.scrollY;
    if (!force && y === lastScrollY) return;
    lastScrollY = y;
    var vh = window.innerHeight;
    scrollEffects.forEach(function (effect) { effect.update(y, vh); });
  }

  function addScrollEffect(effect) {
    if (!scrollEffects.length) {
      var ticking = false;
      window.addEventListener('scroll', function () {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
          ticking = false;
          renderScrollEffects(false);
        });
      }, { passive: true });

      if (lenis) {
        lenis.on('scroll', function () { renderScrollEffects(false); });
      }

      var measuring = false;
      var scheduleMeasure = function () {
        if (measuring) return;
        measuring = true;
        requestAnimationFrame(function () {
          measuring = false;
          measureScrollEffects();
        });
      };
      window.addEventListener('resize', scheduleMeasure);
      window.addEventListener('load', scheduleMeasure);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleMeasure);
      if ('ResizeObserver' in window) new ResizeObserver(scheduleMeasure).observe(document.body);
    }
    scrollEffects.push(effect);
    effect.measure();
    effect.update(window.scrollY, window.innerHeight);
  }

  // Keeps --fixed-vh (set in <head>) in sync when the width changes,
  // but ignores height-only resizes from mobile browser toolbars.
  function initFixedVh() {
    var lastWidth = window.innerWidth;
    window.addEventListener('resize', function () {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      document.documentElement.style.setProperty('--fixed-vh', window.innerHeight + 'px');
    });
  }

  function initSmoothScroll() {
    if (reduceMotion || typeof window.Lenis !== 'function') return;

    lenis = new window.Lenis({ lerp: 0.1, smoothWheel: true });

    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
  }

  // In-page links: smooth with Lenis, native otherwise
  function initAnchors() {
    document.addEventListener('click', function (event) {
      var link = event.target.closest('a[href^="#"]');
      if (!link) return;
      var id = link.getAttribute('href');
      if (id.length < 2) return;
      var target = document.querySelector(id);
      if (!target) return;
      event.preventDefault();
      scrollToTarget(target);
    });
  }

  function scrollToTarget(target) {
    if (lenis) {
      lenis.scrollTo(target);
    } else {
      var top = target === 0 ? 0 : target.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: top, behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  }

  function initScrollTop() {
    var buttons = document.querySelectorAll('[data-scroll-top]');
    if (!buttons.length) return;

    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        scrollToTarget(0);
      });
    });
  }

  function initAnimations() {
    if (reduceMotion || !window.AOS) {
      document.documentElement.classList.remove('aos-pending');
      return;
    }

    ANIMATIONS.forEach(function (item) {
      var nodes = document.querySelectorAll(item.selector);
      nodes.forEach(function (node, index) {
        var step = item.staggerGroup ? index % item.staggerGroup : index;
        // aos.css only ships delay rules in steps of 50ms
        var delay = Math.round(((item.delay || 0) + (item.stagger || 0) * step) / 50) * 50;
        node.setAttribute('data-aos', item.effect);
        if (delay) node.setAttribute('data-aos-delay', String(Math.min(delay, 3000)));
        if (item.duration) node.setAttribute('data-aos-duration', String(item.duration));
        if (item.offset !== undefined) node.setAttribute('data-aos-offset', String(item.offset));
      });
    });

    window.AOS.init({
      once: true,
      duration: 900,
      easing: 'ease-out-cubic',
      offset: 80
    });

    // Late images and fonts can shift trigger positions
    window.addEventListener('load', function () {
      window.AOS.refresh();
    });
  }

  function initParallax() {
    if (reduceMotion) return;

    var layers = [];
    PARALLAX.forEach(function (item) {
      document.querySelectorAll(item.selector).forEach(function (node) {
        var section = node.closest('section, footer');
        if (!section) return;
        node.setAttribute('data-parallax', '');
        layers.push({ node: node, section: section, speed: item.speed });
      });
    });
    if (!layers.length) return;

    addScrollEffect({
      measure: function () {
        layers.forEach(function (layer) {
          var rect = layer.section.getBoundingClientRect();
          layer.top = rect.top + window.scrollY;
          layer.height = rect.height;
          layer.cache = layer.cache || {};
        });
      },
      update: function (y, vh) {
        layers.forEach(function (layer) {
          var top = layer.top - y;
          if (top > vh || top + layer.height < 0) return; // off-screen: keep last value
          var offset = (vh / 2 - (top + layer.height / 2)) * layer.speed;
          setStyle(layer.node, layer.cache, 'translate', '0 ' + offset.toFixed(1) + 'px');
        });
      }
    });
  }

  function initScrub() {
    if (reduceMotion) return;

    var items = [];
    SCRUB.forEach(function (item) {
      document.querySelectorAll(item.selector).forEach(function (node) {
        node.setAttribute('data-scrub', '');
        items.push({ node: node, config: item });
      });
    });
    if (!items.length) return;

    addScrollEffect({
      measure: function () {
        items.forEach(function (item) {
          item.top = layoutPageTop(item.node);
          item.cache = item.cache || {};
        });
      },
      update: function (y, vh) {
        items.forEach(function (item) {
          var c = item.config;
          var top = item.top - y;
          var progress = clamp01((c.start * vh - top) / ((c.start - c.end) * vh));
          var eased = progress * progress * (3 - 2 * progress); // smoothstep: soft start and finish
          setStyle(item.node, item.cache, 'translate', ((1 - eased) * c.x).toFixed(1) + 'px 0');
          setStyle(item.node, item.cache, 'opacity', clamp01(progress * 1.6).toFixed(3));
        });
      }
    });
  }

  // Builds the lid from a clone of the case photo (same URL, no extra
  // download) plus its velvet outside, then drives the rotation from scroll.
  function initCaseLid() {
    if (reduceMotion) return;
    var box = document.querySelector(CASE_LID.selector);
    var picture = box && box.querySelector('picture');
    if (!picture) return;

    var lid = document.createElement('div');
    lid.className = 'services__case-lid';
    lid.setAttribute('aria-hidden', 'true');

    var front = document.createElement('div');
    front.className = 'services__case-lid-front';
    var clone = picture.cloneNode(true);
    var cloneImg = clone.querySelector('img');
    cloneImg.className = 'services__case-lid-photo';
    cloneImg.alt = '';
    front.appendChild(clone);

    var back = document.createElement('div');
    back.className = 'services__case-lid-back';
    ['tl', 'tr', 'bl', 'br'].forEach(function (corner) {
      var span = document.createElement('span');
      span.className = 'services__case-corner services__case-corner--' + corner;
      back.appendChild(span);
    });
    var clasp = document.createElement('span');
    clasp.className = 'services__case-clasp';
    back.appendChild(clasp);

    lid.appendChild(front);
    lid.appendChild(back);
    box.appendChild(lid);
    box.classList.add('is-case-3d');

    var reveal = document.querySelector(CASE_LID.reveal);
    var compactQuery = window.matchMedia(CASE_LID.compact.media);
    var compactSettings = Object.assign({}, CASE_LID, CASE_LID.compact);
    var c = CASE_LID;
    var boxCache = {};
    var lidCache = {};
    var revealCache = {};
    var hingeTop = 0;
    var open = null;

    addScrollEffect({
      measure: function () {
        c = compactQuery.matches ? compactSettings : CASE_LID;
        if (!c.reveal && reveal) {
          // Compact: 01/02 are not on the lid, leave them to their own animation
          setStyle(reveal, revealCache, 'opacity', '');
          setStyle(reveal, revealCache, 'translate', '');
        }
        var hinge = box.offsetWidth * c.hinge;
        setStyle(box, boxCache, '--case-hinge', hinge.toFixed(1) + 'px');
        hingeTop = layoutPageTop(box) + hinge;
      },
      update: function (y, vh) {
        var progress = clamp01((c.start * vh - (hingeTop - y)) / ((c.start - c.end) * vh));
        var eased = progress * progress * (3 - 2 * progress); // smoothstep
        setStyle(lid, lidCache, 'transform', 'rotateX(' + (c.angle * (1 - eased)).toFixed(2) + 'deg)');

        var isOpen = progress >= 1;
        if (isOpen !== open) {
          open = isOpen;
          box.classList.toggle('is-case-open', isOpen);
        }

        if (reveal && c.reveal) {
          var shown = clamp01((progress - c.revealFrom) / (1 - c.revealFrom));
          setStyle(reveal, revealCache, 'opacity', shown.toFixed(3));
          setStyle(reveal, revealCache, 'translate', '0 ' + ((1 - shown) * 30).toFixed(1) + 'px');
        }
      }
    });
  }

  // Wraps every word of the block's text nodes in <span class="fill-word">,
  // keeping spaces and <br>s untouched.
  function splitWords(root) {
    var words = [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    textNodes.forEach(function (textNode) {
      var parts = textNode.textContent.split(/(\s+)/);
      var fragment = document.createDocumentFragment();
      parts.forEach(function (part) {
        if (!part) return;
        if (/^\s+$/.test(part)) {
          fragment.appendChild(document.createTextNode(part));
          return;
        }
        var span = document.createElement('span');
        span.className = 'fill-word';
        span.textContent = part;
        fragment.appendChild(span);
        words.push(span);
      });
      textNode.parentNode.replaceChild(fragment, textNode);
    });
    return words;
  }

  function initFill() {
    if (reduceMotion) return;

    var blocks = [];
    FILL.forEach(function (item) {
      document.querySelectorAll(item.selector).forEach(function (node) {
        var words = splitWords(node);
        if (!words.length) return;
        node.classList.add('is-fill');
        blocks.push({ node: node, words: words, config: item, values: [] });
      });
    });
    if (!blocks.length) return;

    addScrollEffect({
      measure: function () {
        blocks.forEach(function (block) {
          var rect = block.node.getBoundingClientRect();
          block.top = rect.top + window.scrollY;
          block.height = rect.height;
        });
      },
      update: function (y, vh) {
        blocks.forEach(function (block) {
          var c = block.config;
          var top = block.top - y;
          var from = c.start * vh;                 // block top at `start`…
          var to = c.end * vh - block.height;      // …until block bottom reaches `end`
          var progress = clamp01((from - top) / (from - to));
          var head = progress * (block.words.length + c.soft);

          block.words.forEach(function (word, i) {
            var value = Math.round(clamp01((head - i) / c.soft) * 100) / 100;
            if (block.values[i] === value) return;
            block.values[i] = value;
            word.style.setProperty('--fill', value);
          });
        });
      }
    });
  }

  // Booking form validation. Rules per [data-validate]; the message shows
  // inside the field (.field-error), the field gets aria-invalid.
  // Errors appear on blur (if something was typed) or on submit, and clear
  // live while the user fixes the value.
  var VALIDATORS = {
    name: function (value) {
      if (!value) return 'Enter your name';
      var letters = value.match(/\p{L}/gu) || [];
      return letters.length < 2 ? 'Name is too short' : '';
    },
    phone: function (value) {
      if (!value) return 'Enter your phone';
      var digits = value.replace(/\D/g, '').length;
      return digits < 7 || digits > 15 ? 'Check the number' : '';
    },
    email: function (value) {
      if (!value) return 'Enter your email';
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) ? '' : 'Check the email';
    }
  };

  function initBookingForm() {
    var form = document.querySelector('[data-booking-form]');
    if (!form) return;

    var fields = Array.prototype.slice.call(form.querySelectorAll('[data-validate]'));
    var status = form.querySelector('[data-form-status]');
    var submitted = false;
    var statusTimer = null;

    function validate(field) {
      var rule = VALIDATORS[field.getAttribute('data-validate')];
      var message = rule ? rule(field.value.trim()) : '';
      var wrap = field.closest('.field-wrap');
      var error = document.getElementById(field.getAttribute('aria-describedby'));

      if (error && message) error.textContent = message;
      // Clear stale text after the fade-out, so screen readers don't announce it
      if (error && !message) {
        setTimeout(function () {
          if (field.getAttribute('aria-invalid') !== 'true') error.textContent = '';
        }, 300);
      }
      if (wrap) wrap.classList.toggle('is-invalid', Boolean(message));
      field.setAttribute('aria-invalid', message ? 'true' : 'false');
      return !message;
    }

    function setStatus(text) {
      if (!status) return;
      clearTimeout(statusTimer);
      status.textContent = text;
      status.classList.toggle('is-visible', Boolean(text));
      if (text) {
        statusTimer = setTimeout(function () { setStatus(''); }, 6000);
      }
    }

    fields.forEach(function (field) {
      field.addEventListener('blur', function () {
        if (submitted || field.value.trim()) validate(field);
      });

      field.addEventListener('input', function () {
        // Phone: keep only digits, +, spaces, brackets and dashes
        if (field.getAttribute('data-validate') === 'phone') {
          var clean = field.value.replace(/[^\d+()\-\s]/g, '');
          if (clean !== field.value) field.value = clean;
        }
        if (field.getAttribute('aria-invalid') === 'true') validate(field);
        setStatus('');
      });
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      submitted = true;

      var firstInvalid = null;
      fields.forEach(function (field) {
        if (!validate(field) && !firstInvalid) firstInvalid = field;
      });

      if (firstInvalid) {
        firstInvalid.focus();
        return;
      }

      // No backend yet: confirm and reset (see CLAUDE.md → Content flagged)
      form.reset();
      submitted = false;
      fields.forEach(function (field) { field.removeAttribute('aria-invalid'); });
      setStatus('Thank you! Julia will get back to you shortly.');
    });
  }

  // "Worldtime (12:50 pm)" — live time for the city in data-worldtime (IANA zone).
  function initWorldtime() {
    var nodes = document.querySelectorAll('[data-worldtime]');
    if (!nodes.length) return;

    function render() {
      nodes.forEach(function (node) {
        var time;
        try {
          time = new Intl.DateTimeFormat('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: node.getAttribute('data-worldtime')
          }).format(new Date());
        } catch (e) {
          return; // unknown zone: keep the static fallback text
        }
        node.textContent = 'Worldtime (' + time.toLowerCase() + ')';
      });
    }

    render();
    setInterval(render, 30000);
  }

  document.addEventListener('DOMContentLoaded', function () {
    initFixedVh();
    initSmoothScroll();
    initAnchors();
    initScrollTop();
    initAnimations();
    initParallax();
    initScrub();
    initCaseLid();
    initFill();
    initBookingForm();
    initWorldtime();
  });
})();
