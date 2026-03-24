/* ============================================================
   FVN Studio — script.js
   Works across all pages. Every feature is gated by checking
   whether the relevant element exists on the current page.
   ============================================================ */

(function () {
  'use strict';

  /* ============================================================
     1. Nav transparency (homepage only) + scroll class
     ============================================================ */
  const nav = document.getElementById('main-nav');

  if (nav) {
    const isHome = document.body.classList.contains('page-home');

    function updateNav() {
      if (isHome) {
        if (window.scrollY > 60) {
          nav.classList.add('scrolled');
          nav.classList.remove('nav--transparent');
        } else {
          nav.classList.remove('scrolled');
          nav.classList.add('nav--transparent');
        }
      } else {
        nav.classList.remove('nav--transparent');
        nav.classList.add('scrolled');
      }
    }

    updateNav();
    window.addEventListener('scroll', updateNav, { passive: true });
  }

  /* ============================================================
     2. Mobile hamburger menu
     ============================================================ */
  const navToggle = document.getElementById('nav-toggle');
  const navLinks  = document.getElementById('nav-links');

  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('open');
      navToggle.classList.toggle('open', isOpen);
      navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      navToggle.setAttribute('aria-label', isOpen ? 'Menu sluiten' : 'Menu openen');
      document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    navLinks.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        navToggle.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
        navToggle.setAttribute('aria-label', 'Menu openen');
        document.body.style.overflow = '';
      });
    });
  }

  /* ============================================================
     3. Video mute/unmute toggle (homepage)
     ============================================================ */
  const muteBtn   = document.getElementById('video-mute-btn');
  const heroVideo = document.getElementById('hero-video');

  if (muteBtn && heroVideo) {
    function getMuteIcon() {
      return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
    }

    function getUnmuteIcon() {
      return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
    }

    muteBtn.addEventListener('click', () => {
      heroVideo.muted = !heroVideo.muted;
      const nowMuted = heroVideo.muted;
      muteBtn.setAttribute('aria-label', nowMuted ? 'Geluid aan' : 'Geluid uit');
      muteBtn.innerHTML = nowMuted ? getMuteIcon() : getUnmuteIcon();
    });
  }

  /* ============================================================
     4. IntersectionObserver — scroll reveal (fade-up)
     ============================================================ */
  const revealEls = document.querySelectorAll('.reveal');

  if (revealEls.length > 0) {
    if ('IntersectionObserver' in window) {
      const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            revealObserver.unobserve(entry.target);
          }
        });
      }, {
        threshold: 0.1,
        rootMargin: '0px 0px -40px 0px'
      });

      revealEls.forEach(el => revealObserver.observe(el));
    } else {
      revealEls.forEach(el => el.classList.add('visible'));
    }
  }

  /* ============================================================
     5. Cases title animation — split letters, staggered reveal
     ============================================================ */
  const casesBigTitle = document.querySelector('.cases-big-title');
  const casesSubtitle = document.querySelector('.cases-subtitle');

  if (casesBigTitle) {
    const text = casesBigTitle.textContent;
    casesBigTitle.textContent = '';

    text.split('').forEach((char, i) => {
      const span = document.createElement('span');
      span.classList.add('letter');
      span.textContent = char === ' ' ? '\u00A0' : char;
      span.style.transitionDelay = (i * 55) + 'ms';
      casesBigTitle.appendChild(span);
    });

    // Double rAF to ensure CSS transitions are registered
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        casesBigTitle.querySelectorAll('.letter').forEach(span => {
          span.classList.add('visible');
        });

        if (casesSubtitle) {
          const lastDelay = (text.length - 1) * 55;
          setTimeout(() => {
            casesSubtitle.classList.add('visible');
          }, lastDelay + 200);
        }
      });
    });
  }

  /* ============================================================
     6. Accordion (case-detail) — maxHeight toggle
     ============================================================ */
  document.addEventListener('click', function (e) {
    const trigger = e.target.closest('.accordion__trigger');
    if (!trigger) return;
    const item = trigger.closest('.accordion__item');
    if (!item) return;
    const body = item.querySelector('.accordion__body');
    if (!body) return;

    const isOpen = item.classList.contains('open');
    if (isOpen) {
      body.style.maxHeight = body.scrollHeight + 'px';
      requestAnimationFrame(() => { body.style.maxHeight = '0'; });
      item.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
    } else {
      item.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
      body.style.maxHeight = body.scrollHeight + 'px';
      body.addEventListener('transitionend', function onEnd() {
        if (item.classList.contains('open')) body.style.maxHeight = 'none';
        body.removeEventListener('transitionend', onEnd);
      });
    }
  });

  /* ============================================================
     7. Contact form validation + Formspree submission
     ============================================================ */
  const contactForm = document.getElementById('contact-form');

  if (contactForm) {
    const f = {
      naam:         { el: document.getElementById('f-naam'),         err: document.getElementById('err-naam') },
      email:        { el: document.getElementById('f-email'),        err: document.getElementById('err-email') },
      omschrijving: { el: document.getElementById('f-omschrijving'), err: document.getElementById('err-omschrijving') },
      type:         { el: document.getElementById('f-type'),         err: document.getElementById('err-type') }
    };

    const formSuccess = document.getElementById('form-success');
    const submitBtn   = contactForm.querySelector('button[type="submit"]');

    function isValidEmail(val) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
    }

    function setFieldError(field, msg) {
      if (!field.el) return;
      field.el.classList.add('invalid');
      field.el.setAttribute('aria-invalid', 'true');
      if (field.err) field.err.textContent = msg;
    }

    function clearFieldError(field) {
      if (!field.el) return;
      field.el.classList.remove('invalid');
      field.el.removeAttribute('aria-invalid');
      if (field.err) field.err.textContent = '';
    }

    // Live clearing of errors
    Object.values(f).forEach(field => {
      if (!field.el) return;
      const evType = field.el.tagName === 'SELECT' ? 'change' : 'input';
      field.el.addEventListener(evType, () => clearFieldError(field));
    });

    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      Object.values(f).forEach(field => clearFieldError(field));
      if (formSuccess) {
        formSuccess.classList.remove('visible');
        formSuccess.textContent = '';
      }

      let valid = true;

      if (f.naam.el && f.naam.el.value.trim().length < 2) {
        setFieldError(f.naam, 'Vul je naam in (minimaal 2 tekens).');
        valid = false;
      }

      if (f.email.el && !isValidEmail(f.email.el.value)) {
        setFieldError(f.email, 'Vul een geldig e-mailadres in.');
        valid = false;
      }

      if (f.omschrijving.el && f.omschrijving.el.value.trim().length < 20) {
        setFieldError(f.omschrijving, 'Omschrijving is te kort (minimaal 20 tekens).');
        valid = false;
      }

      if (!valid) {
        const firstInvalid = contactForm.querySelector('.invalid');
        if (firstInvalid) firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Versturen\u2026';
      }

      try {
        const formData = new FormData(contactForm);
        const response = await fetch(contactForm.action, {
          method: 'POST',
          body: formData,
          headers: { 'Accept': 'application/json' }
        });

        if (response.ok) {
          contactForm.reset();
          if (formSuccess) {
            formSuccess.textContent = '\u2713 Bedankt! Je aanvraag is ontvangen. We nemen zo snel mogelijk contact op.';
            formSuccess.classList.add('visible');
            formSuccess.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        } else {
          let errMsg = 'Er is iets misgegaan. Probeer het opnieuw.';
          try {
            const data = await response.json();
            if (data && data.errors) errMsg = data.errors.map(err => err.message).join(', ');
          } catch (_) {}
          if (formSuccess) {
            formSuccess.textContent = errMsg;
            formSuccess.classList.add('visible');
          }
        }
      } catch (err) {
        if (formSuccess) {
          formSuccess.textContent = 'Versturen mislukt. Controleer je verbinding en probeer het opnieuw.';
          formSuccess.classList.add('visible');
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Verstuur aanvraag';
        }
      }
    });
  }

  /* ============================================================
     8. Cases page — filter by tag
     ============================================================ */
  const filterBar  = document.getElementById('cases-filter');
  const casesGrid  = document.getElementById('cases-grid');

  if (filterBar && casesGrid) {
    const filterBtns  = filterBar.querySelectorAll('.filter-btn');
    const articles    = casesGrid.querySelectorAll('article[data-tags]');
    const moreWrap    = document.getElementById('cases-more');
    const moreBtn     = document.getElementById('cases-more-btn');

    let activeFilter  = 'all';
    let moreLoaded    = false;

    function applyFilter(tag) {
      activeFilter = tag;

      articles.forEach(function (article) {
        const isExtra = !!article.dataset.more;
        // Extra cases stay hidden until "meer tonen" is clicked
        if (isExtra && !moreLoaded) {
          article.classList.add('hidden');
          return;
        }

        const tags  = article.dataset.tags || '';
        const match = tag === 'all' || tags.split(' ').indexOf(tag) !== -1;
        article.classList.toggle('hidden', !match);
      });
    }

    filterBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        filterBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        applyFilter(btn.dataset.filter);
      });
    });

    // Load more
    if (moreBtn && moreWrap) {
      moreBtn.addEventListener('click', function () {
        moreLoaded = true;
        moreWrap.classList.add('hidden');   // hide the button
        applyFilter(activeFilter);           // re-apply current filter to include extras
      });
    }
  }

  /* ============================================================
     9. Services page — directional slide-in animation
        Normal items  (text left,  image right): text ← left, image → right
        Reversed items (image left, text right): text → right, image ← left
        Text leads; image follows with an 80 ms CSS transition-delay.
     ============================================================ */
  (function () {
    var serviceItems = document.querySelectorAll('.service-item');
    if (!serviceItems.length) return;

    // Tag each child with its slide direction before observing
    serviceItems.forEach(function (item) {
      var text     = item.querySelector('.service-item__text');
      var image    = item.querySelector('.service-item__image');
      var reversed = item.classList.contains('service-item--reversed');

      if (text)  text.classList.add(reversed ? 'slide-from-right' : 'slide-from-left');
      if (image) image.classList.add(reversed ? 'slide-from-left'  : 'slide-from-right');
    });

    var svcObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;

        var text  = entry.target.querySelector('.service-item__text');
        var image = entry.target.querySelector('.service-item__image');

        if (text)  text.classList.add('visible');
        if (image) image.classList.add('visible');   // CSS handles the 80 ms delay

        svcObserver.unobserve(entry.target);
      });
    }, { threshold: 0.18 });

    serviceItems.forEach(function (item) { svcObserver.observe(item); });
  }());

  /* ============================================================
     10. Homepage cases — sticky stacking parallax
        As the next card slides up, the card underneath:
        - scales down (recedes into depth)
        - blurs progressively
        - fades slightly
     ============================================================ */
  const casesStack = document.getElementById('cases-stack');

  if (casesStack) {
    // Cards are direct children — no wrapper divs
    const stackCards = casesStack.querySelectorAll('.stack-card');
    const navH = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--nav-h')
    ) || 72;

    function updateStack() {
      const vh = window.innerHeight;

      stackCards.forEach(function (card, i) {
        const nextCard = stackCards[i + 1];

        // Last card — always fully visible, no out-animation needed
        if (!nextCard) {
          card.style.transform = '';
          card.style.filter    = '';
          card.style.opacity   = '';
          return;
        }

        // Track how far the NEXT card has scrolled upward.
        // Because nextCard is also sticky, getBoundingClientRect().top:
        //   = vh     → card just entered at the bottom of the screen
        //   = navH   → card has arrived and is now stuck at the top
        // We drive the out-animation on the CURRENT card over this range.
        const nextTop  = nextCard.getBoundingClientRect().top;
        const travelPx = vh - navH;
        const raw      = (vh - nextTop) / travelPx;
        const progress = Math.max(0, Math.min(1, raw));

        if (progress <= 0) {
          card.style.transform = '';
          card.style.filter    = '';
          card.style.opacity   = '';
          return;
        }

        // Smoothstep easing for an organic, non-linear feel
        const eased   = progress * progress * (3 - 2 * progress);

        const scale   = 1 - eased * 0.09;   // 1.00 → 0.91
        const blur    = eased * 12;          // 0 px → 12 px
        const opacity = 1 - eased * 0.5;    // 1.00 → 0.50

        card.style.transform = 'scale(' + scale.toFixed(5) + ')';
        card.style.filter    = blur > 0.05 ? 'blur(' + blur.toFixed(2) + 'px)' : '';
        card.style.opacity   = opacity.toFixed(5);
      });
    }

    window.addEventListener('scroll', updateStack, { passive: true });
    updateStack(); // run once on load for mid-scroll page refreshes
  }

})();
