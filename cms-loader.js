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
    // Parse list fields (tags: [A, B, C])
    match[1].split('\n').forEach(line => {
      const sep = line.indexOf(':');
      if (sep === -1) return;
      const key = line.slice(0, sep).trim();
      const val = line.slice(sep + 1).trim();
      if (val.startsWith('[') && val.endsWith(']')) {
        data[key] = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
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
  async function loadCases() {
    // Try manifest first
    let filenames = await fetchJSON('/_cases/manifest.json');
    if (!filenames) {
      // Fall back: derive filenames from existing case-card data-case attributes
      filenames = Array.from(document.querySelectorAll('[data-case-slug]'))
        .map(el => el.getAttribute('data-case-slug') + '.md');
    }
    if (!filenames || !filenames.length) return [];

    const cases = [];
    for (const fn of filenames) {
      const raw = await fetchText('/_cases/' + fn);
      if (!raw) continue;
      const { data, body } = parseFrontmatter(raw);
      if (!data.gepubliceerd) continue;
      cases.push({
        slug: fn.replace(/\.md$/, ''),
        client: data.client || '',
        beschrijving: data.beschrijving || '',
        type: Array.isArray(data.type) ? data.type : (data.type ? [data.type] : []),
        cover: data.cover || '',
        cover_modus: data.cover_modus || 'afbeelding',
        hero: data.hero || data.cover || '',
        hero_modus: data.hero_modus || data.cover_modus || 'afbeelding',
        galerie: Array.isArray(data.galerie) ? data.galerie : [],
        volgorde: data.volgorde || 99,
        gepubliceerd: data.gepubliceerd,
        body,
      });
    }

    return cases.sort((a, b) => a.volgorde - b.volgorde);
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

    const recent = cases.slice(0, 4);
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

    const raw = await fetchText(`/_cases/${slug}.md`);
    if (!raw) return;

    const { data, body } = parseFrontmatter(raw);

    // Client name
    document.querySelectorAll('[data-cms="case.client"]').forEach(el => {
      el.textContent = data.client || '';
    });

    // Scope / tags
    const tags = Array.isArray(data.type) ? data.type : (data.type ? [data.type] : []);
    document.querySelectorAll('.scope-tags').forEach(el => {
      el.innerHTML = tags.map(t => `<span class="tag">${t}</span>`).join('');
    });

    // Hero media
    document.querySelectorAll('[data-cms-media="case.hero"]').forEach(el => {
      laadMedia(el, data.hero_modus || data.cover_modus || 'afbeelding', data.hero || data.cover);
    });

    // Body content
    document.querySelectorAll('[data-cms="case.body"]').forEach(el => {
      el.innerHTML = markdownToHTML(body);
    });

    // Gallery
    const galerie = Array.isArray(data.galerie) ? data.galerie : [];
    document.querySelectorAll('[data-cms-media^="case.galerie_"]').forEach((el, i) => {
      const g = galerie[i];
      if (!g) return;
      const modus  = g.modus  || 'afbeelding';
      const bestand = g.bestand || g;
      laadMedia(el, modus, bestand);
    });

    // Update page title
    if (data.client) document.title = `${data.client} — FVN Studio`;
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

    // Page-specific rendering
    const body = document.body;
    if (body.classList.contains('page-home'))        await renderHomeStack();
    if (body.classList.contains('page-cases'))       await renderCasesGrid();
    if (body.classList.contains('page-case-detail')) await renderCaseDetail();
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
