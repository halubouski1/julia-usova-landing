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
  // Lessons palettes ring: angles at the section's extremes (t = ±1: its centre
  // a half-viewport-plus-half-height away from the viewport centre); 0 at the
  // centre. Kept moderate: the photo's background gradient turns with the ring.
  var PALETTE_SPIN = {
    selector: '.lessons__palettes',
    spin: 30,   // rotateZ, degrees
    turn: 10,   // rotateY
    tilt: 7,    // rotateX
    perspective: 1800
  };

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
      if (!link || link.hasAttribute('data-popup-open')) return;
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

  // Lessons: clones the palettes photo (same URL, no extra download) into a
  // circle-masked layer that spins and tilts with the scroll. Runs before
  // initParallax(), so the copy (same class) gets the same parallax drift.
  function initPaletteSpin() {
    if (reduceMotion) return;
    var base = document.querySelector(PALETTE_SPIN.selector);
    var picture = base && base.closest('picture');
    var section = base && base.closest('section');
    if (!picture || !section) return;

    var clone = picture.cloneNode(true);
    var img = clone.querySelector('img');
    img.classList.add('lessons__palettes--spin');
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    picture.parentNode.insertBefore(clone, picture.nextSibling);

    var c = PALETTE_SPIN;
    var cache = {};
    var top = 0;
    var height = 0;
    var placement = ''; // the photo's own transform (desktop centres it with translateX(-50%))

    addScrollEffect({
      measure: function () {
        var rect = section.getBoundingClientRect();
        top = rect.top + window.scrollY;
        height = rect.height;
        var own = getComputedStyle(base).transform;
        placement = own && own !== 'none' ? own + ' ' : '';
      },
      update: function (y, vh) {
        var center = top - y + height / 2;
        if (center < -height || center > vh + height) return; // off-screen: keep last value
        var t = Math.max(-1, Math.min(1, (center - vh / 2) / (vh / 2 + height / 2)));
        setStyle(img, cache, 'transform', placement +
          'perspective(' + c.perspective + 'px) rotateX(' + (t * c.tilt).toFixed(2) + 'deg) rotateY(' +
          (-t * c.turn).toFixed(2) + 'deg) rotate(' + (t * c.spin).toFixed(2) + 'deg)');
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
  // Rules return a message key; the text comes from the form's data-msg-* attribute
  // (each language version carries its own, see src/index.html), English as fallback.
  var VALIDATORS = {
    name: function (value) {
      if (!value) return 'name-empty';
      var letters = value.match(/\p{L}/gu) || [];
      return letters.length < 2 ? 'name-short' : '';
    },
    phone: function (value) {
      if (!value) return 'phone-empty';
      var digits = value.replace(/\D/g, '').length;
      return digits < 7 || digits > 15 ? 'phone-invalid' : '';
    },
    email: function (value) {
      if (!value) return 'email-empty';
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) ? '' : 'email-invalid';
    }
  };

  var FORM_MESSAGES = {
    'name-empty': 'Enter your name',
    'name-short': 'Name is too short',
    'phone-empty': 'Enter your phone',
    'phone-invalid': 'Check the number',
    'email-empty': 'Enter your email',
    'email-invalid': 'Check the email',
    sent: 'Thank you! Your enquiry has been sent. Julia will get back to you to confirm the date.'
  };

  // Every [data-booking-form] (footer, menu) gets the same validation
  function initBookingForm() {
    document.querySelectorAll('[data-booking-form]').forEach(initForm);
  }

  function initForm(form) {
    var fields = Array.prototype.slice.call(form.querySelectorAll('[data-validate]'));
    var status = form.querySelector('[data-form-status]');
    var submitted = false;
    var statusTimer = null;

    function text(key) {
      return form.getAttribute('data-msg-' + key) || FORM_MESSAGES[key] || '';
    }

    function validate(field) {
      var rule = VALIDATORS[field.getAttribute('data-validate')];
      var key = rule ? rule(field.value.trim()) : '';
      var message = key ? text(key) : '';
      var wrap = field.closest('.field-wrap');
      var error = document.getElementById(field.getAttribute('aria-describedby'));

      if (error && message) {
        error.textContent = message;
        // Reserve exactly the message's width (+ its right offset + 10px),
        // so typed text never runs under it, whatever the language
        var right = parseFloat(getComputedStyle(error).right) || 0;
        field.style.paddingRight = Math.ceil(error.offsetWidth + right + 10) + 'px';
      }
      if (!message) field.style.paddingRight = '';
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
      setStatus(text('sent'));
      form.dispatchEvent(new CustomEvent('booking:sent'));
    });
  }

  // Language switcher ([data-lang-link]): remembers the choice (the inline <head>
  // script reads it on the English home page) and opens the other version at the
  // section that is on screen now (the last section whose top is above 40 % of the viewport).
  function initLanguage() {
    var links = document.querySelectorAll('[data-lang-link]');
    if (!links.length) return;

    function currentSection() {
      var line = window.innerHeight * 0.4;
      var id = '';
      document.querySelectorAll('section[id], footer[id]').forEach(function (section) {
        if (section.getBoundingClientRect().top <= line) id = section.id;
      });
      return id;
    }

    links.forEach(function (link) {
      link.addEventListener('click', function () {
        try {
          localStorage.setItem('lang', link.getAttribute('data-lang-link'));
        } catch (e) {
          // storage blocked: the switch still works, it just isn't remembered
        }
        var section = currentSection();
        var url = link.getAttribute('href').split('#')[0];
        link.setAttribute('href', section ? url + '#' + section : url);
      });
    });
  }

  // "Worldtime (12:50 pm)" — live time for the city in data-worldtime (IANA zone).
  // Label from data-worldtime-label, format from the page language:
  // English 12-hour "12:50 pm", the other versions 24-hour "12:50".
  // Modal dialogs (menu, popup): [hidden] while closed, CSS animates
  // .is-open, hidden is set again after the closing transition. Esc and
  // [data-dialog-close] close; Tab stays inside; the page does not scroll
  // (Lenis stopped, html.is-dialog-open); focus returns to the opener.
  var DIALOG_CLOSE_MS = 500;

  function createDialog(dialog, options) {
    var panel = dialog.querySelector(options.panel);
    var closeTimer = null;
    var opener = null;

    function isOpen() {
      return dialog.classList.contains('is-open');
    }

    function focusables() {
      return Array.prototype.filter.call(
        dialog.querySelectorAll('a[href], button, input'),
        function (el) { return !el.disabled && el.offsetParent !== null; }
      );
    }

    function open(from) {
      clearTimeout(closeTimer);
      opener = from || null;
      dialog.hidden = false;
      dialog.scrollTop = 0;
      dialog.offsetWidth; // start the transition from the closed state
      dialog.classList.add('is-open');
      document.documentElement.classList.add('is-dialog-open');
      if (lenis) lenis.stop();
      if (options.onOpen) options.onOpen();
      var first = dialog.querySelector(options.focus);
      if (first) first.focus({ preventScroll: true });
    }

    function close(restoreFocus) {
      if (!isOpen()) return;
      dialog.classList.remove('is-open');
      document.documentElement.classList.remove('is-dialog-open');
      if (lenis) lenis.start();
      if (options.onClose) options.onClose();
      closeTimer = setTimeout(function () { dialog.hidden = true; }, reduceMotion ? 0 : DIALOG_CLOSE_MS);
      if (restoreFocus && opener) opener.focus({ preventScroll: true });
    }

    dialog.addEventListener('click', function (event) {
      if (event.target.closest('[data-dialog-close]')) close(true);
    });

    document.addEventListener('keydown', function (event) {
      if (!isOpen()) return;
      if (event.key === 'Escape') {
        close(true);
        return;
      }
      if (event.key === 'Tab') {
        var items = focusables();
        if (!items.length) return;
        var first = items[0];
        var last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        } else if (!panel.contains(document.activeElement)) {
          event.preventDefault();
          first.focus();
        }
      }
    });

    return { open: open, close: close, isOpen: isOpen };
  }

  // Custom dropdown: [data-select] wrap with a [data-select-button], a
  // role="listbox" [data-select-list] of role="option" items and a hidden
  // [data-select-input]. Mouse/touch: click to open, click an option.
  // Keyboard: ↓/↑/Enter/Space open; in the list ↓/↑/Home/End move,
  // Enter/Space choose, Esc/Tab close. Click outside closes.
  function initSelect() {
    document.querySelectorAll('[data-select]').forEach(function (wrap) {
      var button = wrap.querySelector('[data-select-button]');
      var list = wrap.querySelector('[data-select-list]');
      var input = wrap.querySelector('[data-select-input]');
      var valueEl = wrap.querySelector('[data-select-value]');
      if (!button || !list || !input || !valueEl) return;

      var options = Array.prototype.slice.call(list.querySelectorAll('[role="option"]'));
      var placeholder = valueEl.innerHTML;
      var active = -1;

      function isOpen() {
        return wrap.classList.contains('is-open');
      }

      function setActive(index) {
        active = Math.max(0, Math.min(options.length - 1, index));
        options.forEach(function (option, i) {
          option.classList.toggle('is-active', i === active);
        });
        list.setAttribute('aria-activedescendant', options[active].id);
      }

      function selectedIndex() {
        for (var i = 0; i < options.length; i++) {
          if (options[i].getAttribute('aria-selected') === 'true') return i;
        }
        return -1;
      }

      function open() {
        if (isOpen()) return;
        wrap.classList.add('is-open');
        button.setAttribute('aria-expanded', 'true');
        setActive(Math.max(0, selectedIndex()));
        list.focus({ preventScroll: true });
      }

      function close(focusButton) {
        if (!isOpen()) return;
        wrap.classList.remove('is-open');
        button.setAttribute('aria-expanded', 'false');
        if (focusButton) button.focus({ preventScroll: true });
      }

      function choose(index) {
        var option = options[index];
        options.forEach(function (o) { o.setAttribute('aria-selected', o === option ? 'true' : 'false'); });
        input.value = option.getAttribute('data-value');
        valueEl.innerHTML = option.innerHTML;
        button.title = option.textContent; // full name if the field cuts it
        wrap.classList.add('has-value');
        close(true);
      }

      function reset() {
        options.forEach(function (o) { o.setAttribute('aria-selected', 'false'); });
        input.value = '';
        valueEl.innerHTML = placeholder;
        button.removeAttribute('title');
        wrap.classList.remove('has-value');
      }

      button.addEventListener('click', function () {
        if (isOpen()) close(true);
        else open();
      });

      button.addEventListener('keydown', function (event) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          open();
        }
      });

      list.addEventListener('click', function (event) {
        var option = event.target.closest('[role="option"]');
        if (option) choose(options.indexOf(option));
      });

      list.addEventListener('mousemove', function (event) {
        var option = event.target.closest('[role="option"]');
        if (option && options.indexOf(option) !== active) setActive(options.indexOf(option));
      });

      list.addEventListener('keydown', function (event) {
        switch (event.key) {
          case 'ArrowDown': event.preventDefault(); setActive(active + 1); break;
          case 'ArrowUp': event.preventDefault(); setActive(active - 1); break;
          case 'Home': event.preventDefault(); setActive(0); break;
          case 'End': event.preventDefault(); setActive(options.length - 1); break;
          case 'Enter':
          case ' ': event.preventDefault(); choose(active); break;
          case 'Escape': event.preventDefault(); event.stopPropagation(); close(true); break;
          case 'Tab': close(false); break;
        }
      });

      document.addEventListener('click', function (event) {
        if (isOpen() && !wrap.contains(event.target)) close(false);
      });

      var form = wrap.closest('form');
      if (form) form.addEventListener('reset', function () { setTimeout(reset, 0); });
    });
  }

  // Burger menu: [data-menu], opened by [data-menu-toggle]; a link inside
  // closes it, then initAnchors (document listener) scrolls
  function initMenu() {
    var menu = document.querySelector('[data-menu]');
    var toggle = document.querySelector('[data-menu-toggle]');
    if (!menu || !toggle) return;

    var dialog = createDialog(menu, {
      panel: '.menu__panel',
      focus: '.menu__link',
      onOpen: function () { toggle.setAttribute('aria-expanded', 'true'); },
      onClose: function () { toggle.setAttribute('aria-expanded', 'false'); }
    });

    toggle.addEventListener('click', function () { dialog.open(toggle); });

    menu.addEventListener('click', function (event) {
      if (event.target.closest('a[href^="#"]')) dialog.close(false);
    });
  }

  // Consultation popup: [data-popup], opened by every [data-popup-open]
  // (their href="#…" stays as the no-JS fallback)
  function initPopup() {
    var popup = document.querySelector('[data-popup]');
    if (!popup) return;

    var form = popup.querySelector('[data-booking-form]');
    var done = popup.querySelector('[data-popup-done]');

    // Every opening starts with the form; the thank-you state is reset here
    // (the popup is still hidden, so nothing visibly jumps)
    function showForm() {
      popup.classList.remove('is-sent');
      popup.setAttribute('aria-labelledby', 'popup-title');
      if (done) done.setAttribute('aria-hidden', 'true');
    }

    var dialog = createDialog(popup, { panel: '.popup__panel', focus: '.popup__form .field', onOpen: showForm });
    showForm();

    if (form && done) {
      form.addEventListener('booking:sent', function () {
        popup.classList.add('is-sent');
        popup.setAttribute('aria-labelledby', 'popup-done-title');
        done.removeAttribute('aria-hidden');
        var title = done.querySelector('#popup-done-title');
        if (title) title.focus({ preventScroll: true });
      });
    }

    document.addEventListener('click', function (event) {
      var trigger = event.target.closest('[data-popup-open]');
      if (!trigger) return;
      event.preventDefault();
      dialog.open(trigger);
    });
  }

  function initWorldtime() {
    var nodes = document.querySelectorAll('[data-worldtime]');
    if (!nodes.length) return;
    var locale = document.documentElement.lang || 'en';
    var english = /^en\b/i.test(locale);

    function render() {
      nodes.forEach(function (node) {
        var time;
        try {
          time = new Intl.DateTimeFormat(english ? 'en-US' : locale, {
            hour: english ? 'numeric' : '2-digit',
            minute: '2-digit',
            hour12: english,
            timeZone: node.getAttribute('data-worldtime')
          }).format(new Date());
        } catch (e) {
          return; // unknown zone: keep the static fallback text
        }
        var label = node.getAttribute('data-worldtime-label') || 'Worldtime';
        node.textContent = label + ' (' + (english ? time.toLowerCase() : time) + ')';
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
    initPaletteSpin();
    initParallax();
    initScrub();
    initCaseLid();
    initFill();
    initBookingForm();
    initSelect();
    initMenu();
    initPopup();
    initWorldtime();
    initLanguage();
  });
})();
