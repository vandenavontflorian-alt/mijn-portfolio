/**
 * cms-loader.js — Decap CMS data loader for FVN Studio
 * Loads JSON data files and markdown cases, populates data-cms and data-cms-media elements.
 */
(function () {
  'use strict';

  const BASE = '';  // same-origin paths

  // ── Utilities ────────────────────────────────────────────────────────────────

  /** Fetch a JSON file, return parsed object or null on error */
  async function fetchJSON(path) {
    try {
      const res = await fetch(BASE + path);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) { return null; }
  }

  /** Fetch a text file, return string or null on error */
  async function fetchText(path) {
    try {
      const res = await fetch(BASE + path);
      if (!res.ok) return null;
      return await res.text();
    } catch (e) { return null; }
  }

  /**
   * Parse YAML-style frontmatter from a markdown string.
   * Returns { data: {}, body: '' }
   */
  function parseFrontmatter(raw) {
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) return { data: {}, body: raw };
    const data = {};
    match[1].split('\n').forEach(line => {
      const sep = line.indexOf(':');
      if (sep === -1) return;
      const key = line.slice(0, sep).trim();
      let val   = line.slice(sep + 1).trim();
      // Remove surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      // Booleans
      if (val === 'true')  val = true;
      if (val === 'false') val = false;
      // Numbers
      if (val !== '' && !isNaN(val)) val = Number(val);
      data[key] = val;
    });
    // Parse list fields — inline [A, B, C] and block (- item per line)
    const lines = match[1].split('\n');
    lines.forEach((line, idx) => {
      const sep = line.indexOf(':');
      if (sep === -1) return;
      const key = line.slice(0, sep).trim();
      const val = line.slice(sep + 1).trim();
      // Inline list: type: [Branding, Packaging]
      if (val.startsWith('[') && val.endsWith(']')) {
        data[key] = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
        return;
      }
      // Block list: type:\n  - Branding\n  - Packaging
      if (val === '') {
        const items = [];
        for (let j = idx + 1; j < lines.length; j++) {
          const itemMatch = lines[j].match(/^\s+-\s+(.+)$/);
          if (!itemMatch) break;
          items.push(itemMatch[1].trim().replace(/^["']|["']$/g, ''));
        }
        if (items.length) data[key] = items;
      }
    });
    return { data, body: match[2] };
  }

  /**
   * Minimal markdown-to-HTML converter (paragraphs, headings, bold, italic, links).
   */
  function markdownToHTML(md) {
    if (!md) return '';
    return md
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
      .split(/\n{2,}/)
      .map(block => block.trim())
      .filter(Boolean)
      .map(block => (/^<[h123]/.test(block) ? block : `<p>${block.replace(/\n/g, '<br>')}</p>`))
      .join('\n');
  }

  /** Deep-get a value from an object by dot-separated key */
  function deepGet(obj, key) {
    return key.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : null), obj);
  }

  // ── Universal media loader ────────────────────────────────────────────────────

  /**
   * laadMedia(element, modus, url)
   * modus: 'afbeelding' | 'video'
   */
  function laadMedia(element, modus, url) {
    if (!element || !url) return;

    if (modus === 'video') {
      // Replace any existing content with a <video>
      element.innerHTML = '';
      const video = document.createElement('video');
      video.src         = url;
      video.autoplay    = true;
      video.muted       = true;
      video.loop        = true;
      video.playsInline = true;
      video.setAttribute('playsinline', '');
      video.style.width  = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'cover';
      element.appendChild(video);
      return;
    }

    // modus === 'afbeelding' (default)
    const tag = element.tagName.toLowerCase();
    if (tag === 'img') {
      element.src = url;
    } else {
      // div / section — use background-image or inject <img>
      const isMediaContainer = element.classList.contains('hero-video')       ||
                               element.classList.contains('about-body__photo') ||
                               element.classList.contains('service-item__image');
      if (isMediaContainer) {
        element.style.backgroundImage = `url('${url}')`;
        element.style.backgroundSize  = 'cover';
        element.style.backgroundPosition = 'center';
      } else {
        element.innerHTML = `<img src="${url}" alt="" style="width:100%;height:100%;object-fit:cover;">`;
      }
    }
  }

  // ── Text & media population ──────────────────────────────────────────────────

  /** Populate all data-cms elements from the merged data store */
  function populateText(store) {
    document.querySelectorAll('[data-cms]').forEach(el => {
      const key = el.getAttribute('data-cms');
      const val = deepGet(store, key);
      if (val === null || val === undefined) return;
      el.textContent = String(val);
    });

    // Populate href attributes via data-cms-href
    document.querySelectorAll('[data-cms-href]').forEach(el => {
      const key = el.getAttribute('data-cms-href');
      const val = deepGet(store, key);
      if (!val) return;
      el.href = String(val);
    });
  }

  /** Populate all data-cms-media elements */
  function populateMedia(store) {
    document.querySelectorAll('[data-cms-media]').forEach(el => {
      const key    = el.getAttribute('data-cms-media');
      // Media fields are stored as { modus: 'afbeelding'|'video', bestand: '/path' }
      // Key may be like 'home.hero' → look for home.hero_modus and home.hero_bestand
      const modus  = deepGet(store, key + '_modus')  || 'afbeelding';
      const url    = deepGet(store, key + '_bestand') || deepGet(store, key);
      if (!url) return;
      laadMedia(el, modus, url);
    });
  }

  // ── Cases loading ─────────────────────────────────────────────────────────────

  /**
   * Load all published cases from _cases/ via a manifest or directory listing.
   * We use a cases-manifest.json file (array of filenames) if available,
   * otherwise fall back to fetching known filenames from the existing HTML.
   */
  function slugify(str) {
    return String(str).toLowerCase()
      .replace(/[àáâãäå]/g, 'a').replace(/[èéêë]/g, 'e')
      .replace(/[ìíîï]/g, 'i').replace(/[òóôõöø]/g, 'o')
      .replace(/[ùúûü]/g, 'u').replace(/ç/g, 'c').replace(/ñ/g, 'n')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  async function loadCases() {
    const data = await fetchJSON('/data/cases.json');
    if (!data || !Array.isArray(data.cases)) return [];

    return data.cases
      .filter(c => c.gepubliceerd !== false)
      .map(c => ({
        slug:        slugify(c.client),
        client:      c.client      || '',
        beschrijving: c.beschrijving || '',
        type:        Array.isArray(c.type)
          ? c.type.map(function(t) { return typeof t === 'object' ? (t.label || t.item || String(t)) : String(t); })
          : (c.type ? [String(c.type)] : []),
        cover:       c.cover       || '',
        cover_modus: c.cover_modus || 'afbeelding',
        hero:        c.hero        || c.cover || '',
        hero_modus:  c.hero_modus  || c.cover_modus || 'afbeelding',
        galerie:     Array.isArray(c.galerie) ? c.galerie : [],
        accordion:   Array.isArray(c.accordion) ? c.accordion : [],
        team:        Array.isArray(c.team) ? c.team : [],
        gepubliceerd: c.gepubliceerd !== false,
      }));
  }

  /** Build a case card element using existing CSS classes */
  function buildCaseCard(c) {
    const article = document.createElement('article');
    article.setAttribute('data-tags', c.type.join(' '));

    const imgInnerClass = 'case-card__img-inner';
    const link = document.createElement('a');
    link.href      = `case-detail.html?case=${c.slug}`;
    link.className = 'case-card';
    link.setAttribute('aria-label', `Case: ${c.client}`);

    const imgWrap = document.createElement('div');
    imgWrap.className = 'case-card__image';

    const imgInner = document.createElement('div');
    imgInner.className = imgInnerClass;
    laadMedia(imgInner, c.cover_modus, c.cover);

    const overlay = document.createElement('div');
    overlay.className = 'case-card__overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = '<span class="case-card__arrow">&rarr;</span>';

    imgWrap.appendChild(imgInner);
    imgWrap.appendChild(overlay);

    const clientEl = document.createElement('h2');
    clientEl.className = 'case-card__client';
    clientEl.textContent = c.client;

    const descEl = document.createElement('p');
    descEl.className = 'case-card__desc';
    descEl.textContent = c.beschrijving;

    const tagsEl = document.createElement('div');
    tagsEl.className = 'case-card__tags';
    tagsEl.setAttribute('aria-label', 'Labels');
    c.type.forEach(t => {
      const span = document.createElement('span');
      span.className = 'tag';
      span.textContent = t;
      tagsEl.appendChild(span);
    });

    link.appendChild(imgWrap);
    link.appendChild(clientEl);
    link.appendChild(descEl);
    link.appendChild(tagsEl);
    article.appendChild(link);

    return article;
  }

  /** Render cases into .cases-grid on cases.html */
  async function renderCasesGrid() {
    const grid = document.getElementById('cases-grid');
    if (!grid) return;

    const cases = await loadCases();
    if (!cases.length) return;

    // Clear static placeholder articles
    grid.querySelectorAll('article').forEach(a => a.remove());

    const initial  = cases.slice(0, 6);
    const extra    = cases.slice(6);

    initial.forEach(c => grid.insertBefore(buildCaseCard(c), grid.querySelector('.cases-more') || null));

    extra.forEach(c => {
      const card = buildCaseCard(c);
      card.classList.add('hidden');
      card.setAttribute('data-more', 'true');
      grid.insertBefore(card, grid.querySelector('.cases-more') || null);
    });

    // Meer-knop: verberg als geen extra cases, update aantal
    const moreWrap  = document.getElementById('cases-more');
    const moreCount = document.querySelector('.cases-more-count');
    if (moreWrap) {
      if (extra.length === 0) {
        moreWrap.classList.add('hidden');
      } else {
        moreWrap.classList.remove('hidden');
        if (moreCount) moreCount.textContent = '(+' + extra.length + ')';}
    }

    // Re-attach filter & load-more (they query fresh articles)
    initCasesFilter(grid);
  }

  /** Re-initialise the filter bar for dynamically built cards */
  function initCasesFilter(grid) {
    const filterBar = document.getElementById('cases-filter');
    const moreWrap  = document.getElementById('cases-more');
    const moreBtn   = document.getElementById('cases-more-btn');
    if (!filterBar) return;

    const filterBtns = filterBar.querySelectorAll('.filter-btn');
    const articles   = () => grid.querySelectorAll('article[data-tags]');

    let activeFilter = 'all';
    let moreLoaded   = false;

    function applyFilter(tag) {
      activeFilter = tag;
      articles().forEach(article => {
        const isExtra = !!article.dataset.more;
        if (isExtra && !moreLoaded) { article.classList.add('hidden'); return; }
        const tags  = article.dataset.tags || '';
        const match = tag === 'all' || tags.split(' ').indexOf(tag) !== -1;
        article.classList.toggle('hidden', !match);
      });
    }

    filterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyFilter(btn.dataset.filter);
      });
    });

    if (moreBtn && moreWrap) {
      moreBtn.addEventListener('click', () => {
        moreLoaded = true;
        moreWrap.classList.add('hidden');
        applyFilter(activeFilter);
      });
    }
  }

  /** Render the 4 most recent cases on index.html into .cases-stack */
  async function renderHomeStack() {
    const stack = document.getElementById('cases-stack');
    if (!stack) return;

    const cases = await loadCases();
    if (!cases.length) return;

    const recent = cases.slice(-4).reverse();
    // Clear existing static stack cards
    stack.querySelectorAll('.stack-card').forEach(el => el.remove());

    recent.forEach(c => {
      const a = document.createElement('a');
      a.href      = `case-detail.html?case=${c.slug}`;
      a.className = 'stack-card';

      const imgWrap = document.createElement('div');
      imgWrap.className = 'stack-card__image';

      const imgInner = document.createElement('div');
      imgInner.className = `home-case__img-inner`;
      laadMedia(imgInner, c.cover_modus, c.cover);

      const overlay = document.createElement('div');
      overlay.className = 'stack-card__overlay';
      overlay.innerHTML = `
        <span class="stack-card__type">${c.type.join(' &amp; ')}</span>
        <p class="stack-card__client">${c.client}</p>
        <p class="stack-card__desc">${c.beschrijving}</p>`;

      imgWrap.appendChild(imgInner);
      imgWrap.appendChild(overlay);
      a.appendChild(imgWrap);
      stack.appendChild(a);
    });
  }

  /** Populate case-detail.html from URL param ?case=slug */
  async function renderCaseDetail() {
    const params = new URLSearchParams(window.location.search);
    const slug   = params.get('case');
    if (!slug) return;

    const data = await fetchJSON('/data/cases.json');
    if (!data || !Array.isArray(data.cases)) return;

    const c = data.cases.find(function (item) {
      return slugify(item.client) === slug;
    });
    if (!c) return;

    // Client name
    document.querySelectorAll('[data-cms="case.client"], .case-info__client').forEach(el => {
      el.textContent = c.client || '';
    });

    // Tags
    const tags = Array.isArray(c.type) ? c.type : (c.type ? [c.type] : []);
    document.querySelectorAll('.scope-tags, .case-info__tags').forEach(el => {
      el.innerHTML = tags.map(t => `<span class="tag">${t}</span>`).join('');
    });

    // Hero media
    document.querySelectorAll('[data-cms-media="case.hero"], .case-hero').forEach(el => {
      laadMedia(el, c.hero_modus || c.cover_modus || 'afbeelding', c.hero || c.cover);
    });

    // Description
    document.querySelectorAll('.case-info__desc').forEach(el => {
      el.textContent = c.beschrijving || '';
    });

    // Team
    const teamEl = document.getElementById('case-team');
    const team = Array.isArray(c.team) ? c.team : [];
    if (teamEl && team.length) {
      teamEl.innerHTML = '<p class="case-info__team-title">Team</p>';
      team.forEach(function (member) {
        const naam = typeof member === 'object' ? (member.naam || '') : String(member);
        const rol  = typeof member === 'object' ? (member.rol  || '') : '';
        const p = document.createElement('p');
        p.className = 'case-info__team-list';
        p.textContent = rol ? naam + ' \u2014 ' + rol : naam;
        teamEl.appendChild(p);
      });
    }

    // Accordion
    const accordionEl = document.getElementById('case-accordion');
    const accordion = Array.isArray(c.accordion) ? c.accordion : [];
    if (accordionEl && accordion.length) {
      accordionEl.innerHTML = '';
      accordion.forEach(function (item, i) {
        const uid = 'acc-dyn-' + i;
        const div = document.createElement('div');
        div.className = 'accordion__item';
        const inhoud = (item.inhoud || '')
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/\n/g, '<br>');
        div.innerHTML =
          '<button class="accordion__trigger" aria-expanded="false"' +
            ' aria-controls="' + uid + '" id="acc-btn-' + uid + '">' +
            (item.titel || '') +
            '<span class="accordion__chevron" aria-hidden="true"></span>' +
          '</button>' +
          '<div class="accordion__body" id="' + uid + '"' +
            ' role="region" aria-labelledby="acc-btn-' + uid + '">' +
            '<div class="accordion__content"><p>' + inhoud + '</p></div>' +
          '</div>';
        accordionEl.appendChild(div);
      });
    }

    // Gallery
    const galleryEl = document.getElementById('case-gallery');
    const galerie = Array.isArray(c.galerie) ? c.galerie : [];
    if (galleryEl && galerie.length) {
      galleryEl.innerHTML = '';
      galerie.forEach(function (item) {
        const layout = item.layout || 'volledig';
        if (layout === 'paar') {
          const pair = document.createElement('div');
          pair.className = 'case-gallery__pair reveal';
          const img1 = document.createElement('div');
          img1.className = 'case-gallery__img';
          img1.setAttribute('role', 'img');
          if (item.bestand) laadMedia(img1, item.modus || 'afbeelding', item.bestand);
          const img2 = document.createElement('div');
          img2.className = 'case-gallery__img';
          img2.setAttribute('role', 'img');
          if (item.bestand_2) laadMedia(img2, item.modus_2 || 'afbeelding', item.bestand_2);
          pair.appendChild(img1);
          pair.appendChild(img2);
          galleryEl.appendChild(pair);
        } else {
          const wrap = document.createElement('div');
          wrap.className = 'case-gallery__item';
          wrap.setAttribute('data-layout', 'full');
          const img = document.createElement('div');
          img.className = 'case-gallery__img reveal';
          img.setAttribute('role', 'img');
          if (item.bestand) laadMedia(img, item.modus || 'afbeelding', item.bestand);
          wrap.appendChild(img);
          galleryEl.appendChild(wrap);
        }
      });
    }

    // Page title
    if (c.client) document.title = c.client + ' \u2014 FVN Studio';
  }

  // ── Disciplines rendering (homepage) ─────────────────────────────────────────

  function renderDisciplines(store) {
    const list = document.getElementById('home-disciplines-list');
    if (!list) return;
    const items = store.home && store.home.disciplines;
    if (!items || !items.length) return;

    list.innerHTML = '';
    items.forEach(function (item) {
      const li = document.createElement('li');
      // Decap slaat enkelvoudige lijstvelden op als string of als object { item: '...' }
      li.textContent = (typeof item === 'object' && item.item) ? item.item : item;
      list.appendChild(li);
    });
  }

  // ── Services rendering ────────────────────────────────────────────────────────

  function renderServices(store) {
    const container = document.getElementById('services-list');
    if (!container) return;
    const diensten = store.services && store.services.diensten;
    if (!diensten || !diensten.length) return;

    // Verwijder statische items, bewaar de CTA sectie buiten container
    container.innerHTML = '';

    const placeholderVariants = ['--1', '--2', '--3'];

    diensten.forEach(function (dienst, i) {
      const isReversed = i % 2 !== 0;
      const num = String(i + 1).padStart(2, '0');
      const slugId = 'svc-' + num + '-title';

      const div = document.createElement('div');
      div.className = 'service-item' + (isReversed ? ' service-item--reversed' : '');
      div.setAttribute('aria-labelledby', slugId);

      const textDiv = document.createElement('div');
      textDiv.className = 'service-item__text visible';
      textDiv.innerHTML =
        '<p class="service-item__number">' + num + '</p>' +
        '<h2 class="service-item__name" id="' + slugId + '">' + (dienst.naam || '') + '</h2>' +
        '<p class="service-item__desc">' + (dienst.omschrijving || '') + '</p>';

      const imgDiv = document.createElement('div');
      imgDiv.className = 'service-item__image visible';
      imgDiv.setAttribute('aria-hidden', 'true');
      const variant = placeholderVariants[i % placeholderVariants.length];
      const placeholder = document.createElement('div');
      placeholder.className = 'service-item__img-placeholder service-item__img-placeholder' + variant;
      imgDiv.appendChild(placeholder);
      if (dienst.beeld_bestand) {
        laadMedia(imgDiv, dienst.beeld_modus || 'afbeelding', dienst.beeld_bestand);
      }

      div.appendChild(textDiv);
      div.appendChild(imgDiv);
      container.appendChild(div);
    });
  }

  // ── Hero content rendering ────────────────────────────────────────────────────

  /**
   * Bouwt de hero-video tekstlaag op basis van CMS-data.
   * Ondersteunt: zichtbaarheid, uitlijning, meerdere tekstblokken (h1/h2/h3/p) en knoppen.
   */
  function renderHeroContent(store) {
    const contentEl = document.getElementById('hero-content');
    if (!contentEl) return;

    const home = store.home || {};

    // Verberg volledige tekstlaag indien uitgeschakeld
    if (home.hero_content_zichtbaar === false) {
      contentEl.style.display = 'none';
      return;
    }

    // Uitlijning
    const uitlijning = home.hero_uitlijning || 'midden';
    contentEl.className = `hero-video__content hero-video__content--${uitlijning}`;

    // Herbouw inhoud
    contentEl.innerHTML = '';

    const blokken = home.hero_blokken || [];
    // Fallback naar oude hero_titel indien geen blokken gedefinieerd
    if (!blokken.length && home.hero_titel) {
      const h1 = document.createElement('h1');
      h1.className = 'hero-video__title';
      h1.textContent = home.hero_titel;
      contentEl.appendChild(h1);
    } else {
      blokken.forEach(function (blok) {
        if (blok.zichtbaar === false) return;
        const tag = blok.tag || 'h1';
        const el = document.createElement(tag);
        if (tag === 'h1') el.className = 'hero-video__title';
        el.textContent = blok.tekst || '';
        contentEl.appendChild(el);
      });
    }

    // Knoppen
    const knoppen = (home.hero_knoppen || []).filter(function (k) {
      return k.zichtbaar !== false && k.tekst;
    });
    if (knoppen.length) {
      const btnsEl = document.createElement('div');
      btnsEl.className = 'hero-video__btns';
      knoppen.forEach(function (knop) {
        const a = document.createElement('a');
        a.href = knop.link || '#';
        a.className = `hero-video__btn hero-video__btn--${knop.stijl || 'primair'}`;
        a.textContent = knop.tekst;
        btnsEl.appendChild(a);
      });
      contentEl.appendChild(btnsEl);
    }

    // Zichtbaar maken nadat inhoud is opgebouwd (voorkomt flash van statische fallback)
    contentEl.style.opacity = '1';
  }

  // ── Filter bar rendering (cases pagina) ──────────────────────────────────────

  function renderFilterBar(store) {
    const bar = document.getElementById('cases-filter');
    if (!bar) return;
    const labels = store.globaal && store.globaal.case_labels;
    if (!labels || !labels.length) return;

    // Bewaar de "Alle" knop, vervang de rest
    const alleBtn = bar.querySelector('[data-filter="all"]');
    bar.innerHTML = '';

    if (alleBtn) {
      bar.appendChild(alleBtn);
    } else {
      const alle = document.createElement('button');
      alle.className = 'filter-btn active';
      alle.setAttribute('data-filter', 'all');
      alle.textContent = 'Alle';
      bar.appendChild(alle);
    }

    labels.forEach(function (label) {
      // Decap list+field slaat op als string of { label: '...' }
      const text = (typeof label === 'object' && label.label) ? label.label : String(label);
      const btn = document.createElement('button');
      btn.className = 'filter-btn';
      btn.setAttribute('data-filter', text);
      btn.textContent = text;
      bar.appendChild(btn);
    });
  }

  // ── Boot ──────────────────────────────────────────────────────────────────────

  async function boot() {
    // Load all JSON data files in parallel
    const [home, about, services, contact, globaal] = await Promise.all([
      fetchJSON('/data/home.json'),
      fetchJSON('/data/about.json'),
      fetchJSON('/data/services.json'),
      fetchJSON('/data/contact.json'),
      fetchJSON('/data/globaal.json'),
    ]);

    // Merge into a flat store keyed by source name
    const store = {
      home:     home     || {},
      about:    about    || {},
      services: services || {},
      contact:  contact  || {},
      globaal:  globaal  || {},
    };

    populateText(store);
    populateMedia(store);
    renderHeroContent(store);
    renderDisciplines(store);
    renderServices(store);
    renderFilterBar(store);

    // Page-specific rendering
    const body = document.body;
    if (body.classList.contains('page-home'))        await renderHomeStack();
    if (body.classList.contains('page-cases'))       await renderCasesGrid();
    if (body.classList.contains('page-case-detail')) await renderCaseDetail();
  }

  // Meer-knop bij statische HTML synchroon bijwerken (voor als CMS niet laadt)
  function syncMoreButton() {
    const moreWrap  = document.getElementById('cases-more');
    const moreCount = document.querySelector('.cases-more-count');
    if (!moreWrap) return;
    const hidden = document.querySelectorAll('#cases-grid [data-more="true"]').length;
    if (hidden === 0) {
      moreWrap.classList.add('hidden');
    } else {
      if (moreCount) moreCount.textContent = '(+' + hidden + ')';
    }
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { syncMoreButton(); boot(); });
  } else {
    syncMoreButton();
    boot();
  }

})();
