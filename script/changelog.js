document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('changelogs');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const monthSelect = document.getElementById('monthSelect');
  const sourceAllBtn = document.getElementById('sourceAllBtn');
  const sourceUpstreamBtn = document.getElementById('sourceUpstreamBtn');
  const sourceHorizonBtn = document.getElementById('sourceHorizonBtn');
  const searchInput = document.getElementById('searchInput');
  const searchClearBtn = document.getElementById('searchClearBtn');
  const fuzzyToggleBtn = document.getElementById('fuzzyToggleBtn');
  const searchResultCount = document.getElementById('searchResultCount');
  const searchHintBtn = document.getElementById('searchHintBtn');
  const searchHintPopover = document.getElementById('searchHintPopover');
  const FUZZY_STORAGE_KEY = 'horizon-changelog-fuzzy';

  const fmtDate = d => d.split('-').reverse().join('.');
  const fmtMonth = m => new Date(m.split('-')[0], m.split('-')[1]-1).toLocaleString('ru', { month: 'long', year: 'numeric' });

  const esc = (str) => {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  // Для подсветки: ё→е, lowercase
  const norm = (str) => {
    if (str === null || str === undefined) return '';
    return String(str).toLowerCase().replace(/ё/g, 'е');
  };

  const highlight = (str, ranges) => {
    if (!ranges || ranges.length === 0) return esc(str);
    const n = norm(str);
    if (n.length !== str.length) {
      return esc(str);
    }
    const sorted = ranges.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const merged = [];
    for (const r of sorted) {
      if (merged.length && r[0] <= merged[merged.length - 1][1]) {
        merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], r[1]);
      } else {
        merged.push([r[0], r[1]]);
      }
    }
    let html = '';
    let pos = 0;
    for (const [s, e] of merged) {
      if (s > pos) html += esc(str.slice(pos, s));
      html += '<mark class="search-hit">' + esc(str.slice(s, e)) + '</mark>';
      pos = e;
    }
    if (pos < str.length) html += esc(str.slice(pos));
    return html;
  };

  let months = [], idx = 0, cache = {};
  const searchEngine = new window.ChangelogSearch();
  let searchIndexBuilt = false;
  let allItemsCache = null;

  const REPO_MAP = {
    '/TG/Station': 'tgstation/tgstation',
    'Horizon =][=': 'horizon-dev-team/Horizon-Dream',
  };

  let currentSource = 'all';
  let currentSearch = '';

  const render = (data) => {
    container.innerHTML = '';
    const wrapped = data.map(d => (d && d.item !== undefined ? d : { item: d, matches: {}, score: 0 }));
    const isSearchMode = wrapped.some(w => w.score > 0);

    const sortedSourceEntries = (obj) => {
      return Object.entries(obj).sort((a, b) => {
        if (a[0] === 'Horizon =][=') return -1;
        if (b[0] === 'Horizon =][=') return 1;
        return 0;
      });
    };

    if (isSearchMode) {
      const bySource = wrapped.reduce((acc, w) => {
        const s = w.item.source || '-';
        if (!acc[s]) acc[s] = [];
        acc[s].push(w);
        return acc;
      }, {});
      let html = `<div class="changelog-date-section">
        <h2 class="date-header">Результаты поиска</h2>`;

      for (const [src, list] of sortedSourceEntries(bySource)) {
        list.sort((a, b) => b.score - a.score);
        html += `<div class="source-group"><h3 class="source-header">${esc(src)}:</h3>`;
        list.forEach(({item, matches}) => {
          html += renderCard(item, matches);
        });
        html += `</div>`;
      }
      html += `</div>`;
      container.innerHTML = html;
      return;
    }

    // Обычный режим - группировка по дате
    const byDate = wrapped.reduce((acc, w) => {
      const i = w.item;
      const groupDate = i.upstream_date || i.date;
      if (!acc[groupDate]) acc[groupDate] = [];
      acc[groupDate].push(w);
      return acc;
    }, {});

    for (const [date, items] of Object.entries(byDate).sort((a,b) => a[0] < b[0] ? 1 : -1)) {
      const bySource = items.reduce((acc, w) => (acc[w.item.source] = [...(acc[w.item.source]||[]), w], acc), {});
      let html = `<div class="changelog-date-section"><h2 class="date-header">${esc(fmtDate(date))}</h2>`;

      for (const [src, list] of sortedSourceEntries(bySource)) {
        html += `<div class="source-group"><h3 class="source-header">${esc(src)}:</h3>`;

        list.sort((a, b) => {
          const dateA = a.item.upstream_date || a.item.date;
          const dateB = b.item.upstream_date || b.item.date;
          if (dateA > dateB) return -1;
          if (dateA < dateB) return 1;
          return 0;
        });

        list.forEach(({item, matches}) => {
          html += renderCard(item, matches);
        });
        html += `</div>`;
      }
      html += `</div>`;
      container.innerHTML += html;
    }
  };

  // Рендер одной карточки
  const renderCard = (item, matches) => {
    const prNumberRaw = String(item.pr).split('/').pop();
    const prNumber = esc(prNumberRaw);
    const src = item.source;
    let repoSlug = item.repo || REPO_MAP[src] || '';
    const hasLink = !!repoSlug;
    const prUrl = hasLink ? `https://github.com/${repoSlug}/pull/${prNumberRaw}` : '#';
    let repoDisplayName = src;
    if (repoSlug) {
      const slugParts = repoSlug.split('/');
      repoDisplayName = slugParts[slugParts.length - 1];
    }
    if (repoSlug.includes('tgstation')) repoDisplayName = '/TG/Station';

    const displayDate = item.upstream_date || item.date;
    const titleHtml = highlight(item.title || `PR #${item.pr}`, matches.title || []);
    const authorHtml = highlight(item.author, matches.author || []);

    // changes: подсветка
    const changesMatchesByIdx = {};
    if (matches.changes) {
      for (const cm of matches.changes) {
        if (!changesMatchesByIdx[cm.idx]) changesMatchesByIdx[cm.idx] = [];
        changesMatchesByIdx[cm.idx].push(...cm.ranges);
      }
    }
    const changesHtml = item.changes.map((ch, ci) =>
      `<li class="${esc(ch.class)}">${highlight(ch.text, changesMatchesByIdx[ci] || [])}</li>`
    ).join('');

    let bodyHtml = '';
    if (item.body && item.body.trim() !== '') {
      bodyHtml = `
        <button class="btn btn-outline btn-sm pr-body-toggle" data-pr-id="${esc(item.pr)}" data-pr-source="${esc(item.source)}" data-pr-date="${esc(item.date)}" aria-expanded="false">
          <i class="fas fa-chevron-down"></i> Подробнее
        </button>
        <div class="pr-body" style="display: none;"></div>
      `;
    }

    return `<div class="changelog-card">
      <div class="card-main">
        <div class="card-content">
          <h4 class="card-title">${titleHtml}</h4>
          <div class="card-meta">by <span class="author">${authorHtml}</span></div>

          ${bodyHtml}
          <ul class="changelog">${changesHtml}</ul>

        </div>
      </div>
      <div class="card-sidebar">
        <a class="pr-number" href="${prUrl}" ${!hasLink ? 'disabled' : ''} target="_blank">#${prNumber}</a>
        <div class="sidebar-info">
          <div><i class="fas fa-calendar"></i> ${esc(fmtDate(displayDate))}</div>
          <div><i class="fas fa-code"></i> ${esc(repoDisplayName)}</div>
        </div>
      </div>
    </div>`;
  };

  const setSource = s => {
    currentSource = s;
    const setBtn = (btn, v) => {
      if (!btn) return;
      const active = v === currentSource;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    };
    setBtn(sourceAllBtn, 'all');
    setBtn(sourceUpstreamBtn, '/TG/Station');
    setBtn(sourceHorizonBtn, 'Horizon =][=');
  };

  const load = async i => {
    const month = months[i];
    if (!cache[month]) {
      const res = await fetch(`./changelogs/archive/${month}.json`);
      cache[month] = await res.json();
    }
    let data = cache[month] || [];
    const sel = currentSource || 'all';
    if (sel && sel !== 'all') {
      data = data.filter(item => item && item.source === sel);
    }
    render(data);
    idx = i;
    prevBtn.disabled = i === 0;
    nextBtn.disabled = i === months.length - 1;
    monthSelect.value = month;
  };

  const applyFilters = async () => {
    if (currentSearch) {
      // Подгружаем все месяцы и строим индекс один раз
      const fetches = months.map(async m => {
        if (!cache[m]) {
          try {
            const res = await fetch(`./changelogs/archive/${m}.json`);
            cache[m] = await res.json();
          } catch (e) {
            console.error("Ошибка загрузки месяца", m, e);
            return [];
          }
        }
        return cache[m];
      });

      if (!searchIndexBuilt) {
        allItemsCache = (await Promise.all(fetches)).flat();
        searchEngine.setItems(allItemsCache);
        searchIndexBuilt = true;
      }

      let scope = allItemsCache;
      const sel = currentSource || 'all';
      if (sel && sel !== 'all') {
        scope = scope.filter(item => item && item.source === sel);
      }

      const searchResults = searchEngine.search(currentSearch);
      const filteredData = searchResults.filter(r => {
        const item = r.item;
        if (sel && sel !== 'all' && item.source !== sel) return false;
        return true;
      });

      render(filteredData);

      if (searchResultCount) {
        const n = filteredData.length;
        searchResultCount.textContent = n === 0
          ? 'Ничего не найдено'
          : `Найдено: ${n}`;
        searchResultCount.classList.toggle('empty', n === 0);
        searchResultCount.style.display = '';
      }

      prevBtn.disabled = true;
      nextBtn.disabled = true;
      monthSelect.disabled = true;
    } else {
      monthSelect.disabled = false;
      if (searchResultCount) searchResultCount.style.display = 'none';
      load(idx);
    }
  };

  months = await (await fetch('./changelogs/months.json')).json();
  months.forEach(m => monthSelect.add(new Option(fmtMonth(m), m)));
  setSource('all');

  if (sourceAllBtn) sourceAllBtn.addEventListener('click', () => { setSource('all'); applyFilters(); });
  if (sourceUpstreamBtn) sourceUpstreamBtn.addEventListener('click', () => { setSource('/TG/Station'); applyFilters(); });
  if (sourceHorizonBtn) sourceHorizonBtn.addEventListener('click', () => { setSource('Horizon =][='); applyFilters(); });

  prevBtn.onclick = () => load(idx - 1);
  nextBtn.onclick = () => load(idx + 1);
  monthSelect.onchange = () => load(months.indexOf(monthSelect.value));

  // Lazy parsing PR
  container.addEventListener('click', function(e) {
    const btn = e.target.closest('.pr-body-toggle');
    if (!btn) return;

    const bodyDiv = btn.nextElementSibling;
    if (!bodyDiv || !bodyDiv.classList.contains('pr-body')) return;

    const isExpanded = btn.getAttribute('aria-expanded') === 'true';

    if (isExpanded) {
      bodyDiv.style.display = 'none';
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML = '<i class="fas fa-chevron-down"></i> Подробнее';
    } else {
      if (bodyDiv.innerHTML.trim() === '') {
        const prId = btn.getAttribute('data-pr-id');
        const source = btn.getAttribute('data-pr-source');
        const date = btn.getAttribute('data-pr-date');
        let item = null;
        for (const m of months) {
          if (cache[m]) {
            item = cache[m].find(i => String(i.pr) === prId && i.source === source && i.date === date);
            if (item) break;
          }
        }

        if (item && item.body) {
          bodyDiv.innerHTML = window.parseMarkdown(item.body, item.repo);
        }
      }

      bodyDiv.style.display = 'block';
      btn.setAttribute('aria-expanded', 'true');
      btn.innerHTML = '<i class="fas fa-chevron-up"></i> Свернуть';
    }
  });

  document.addEventListener('click', function(e) {
    const mediaBtn = e.target.closest('.media-link[data-media-url]');
    if (!mediaBtn) return;
    e.preventDefault();
    const url = mediaBtn.getAttribute('data-media-url');
    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.style.width = '100%';
    iframe.style.maxWidth = '100%';
    iframe.style.aspectRatio = '16 / 9';
    iframe.style.height = 'auto';
    iframe.style.minHeight = '315px';
    iframe.style.border = '1px solid rgba(255, 255, 255, 0.1)';
    iframe.style.borderRadius = '4px';
    iframe.style.margin = '0.5rem 0 1rem 0';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;
    mediaBtn.replaceWith(iframe);
  });

  const loadFuzzyState = () => {
    try {
      const v = localStorage.getItem(FUZZY_STORAGE_KEY);
      if (v === 'false') return false;
      if (v === 'true') return true;
    } catch (e) { /* localStorage недоступен */ }
    return true;
  };

  const saveFuzzyState = (enabled) => {
    try { localStorage.setItem(FUZZY_STORAGE_KEY, enabled ? 'true' : 'false'); } catch (e) {}
  };

  const updateFuzzyToggleUI = (enabled) => {
    if (!fuzzyToggleBtn) return;
    fuzzyToggleBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    fuzzyToggleBtn.classList.toggle('active', enabled);
    fuzzyToggleBtn.title = enabled
      ? 'Fuzzy-поиск: опечатки до 1-2 символов и аббревиатуры (rvnt→revenant). Нажмите, чтобы переключить в точный режим.'
      : 'Точный поиск: только подстрочные совпадения. Нажмите, чтобы включить fuzzy (опечатки, аббревиатуры).';
  };

  // Инициализация fuzzy-состояния
  let fuzzyEnabled = loadFuzzyState();
  searchEngine.setFuzzyEnabled(fuzzyEnabled);
  updateFuzzyToggleUI(fuzzyEnabled);

  if (fuzzyToggleBtn) {
    fuzzyToggleBtn.addEventListener('click', () => {
      fuzzyEnabled = !fuzzyEnabled;
      searchEngine.setFuzzyEnabled(fuzzyEnabled);
      saveFuzzyState(fuzzyEnabled);
      updateFuzzyToggleUI(fuzzyEnabled);
      if (currentSearch) applyFilters();
    });
  }


  const updateClearButtonVisibility = () => {
    if (!searchClearBtn) return;
    searchClearBtn.style.display = searchInput.value ? '' : 'none';
  };

  if (searchInput) {
    searchInput.addEventListener('input', updateClearButtonVisibility);

    // Кнопка очистки
    if (searchClearBtn) {
      searchClearBtn.addEventListener('click', () => {
        searchInput.value = '';
        updateClearButtonVisibility();
        if (currentSearch) {
          currentSearch = '';
          if (searchResultCount) searchResultCount.style.display = 'none';
          monthSelect.disabled = false;
          load(idx);
        }
        searchInput.focus();
      });
    }

    // Enter - применить запрос. Для очистки есть кнопка ×.
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const q = searchInput.value.trim();
        if (q === currentSearch) return;
        currentSearch = q;
        updateClearButtonVisibility();
        applyFilters();
      }
    });
  }

  // Поповер с подсказкой по синтаксису
  if (searchHintBtn && searchHintPopover) {
    const toggleHint = (show) => {
      const shouldShow = show !== undefined ? show : searchHintPopover.style.display !== 'block';
      searchHintPopover.style.display = shouldShow ? 'block' : 'none';
      searchHintBtn.setAttribute('aria-expanded', shouldShow ? 'true' : 'false');
    };
    searchHintBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleHint();
    });
    document.addEventListener('click', (e) => {
      if (!searchHintPopover.contains(e.target) && e.target !== searchHintBtn) {
        toggleHint(false);
      }
    });
  }

  if (months.length) load(0);
});