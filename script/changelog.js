document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('changelogs');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const monthSelect = document.getElementById('monthSelect');
  const sourceAllBtn = document.getElementById('sourceAllBtn');
  const sourceUpstreamBtn = document.getElementById('sourceUpstreamBtn');
  const sourceHorizonBtn = document.getElementById('sourceHorizonBtn');

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

  let months = [], idx = 0, cache = {};

  const REPO_MAP = {
    '/TG/Station': 'tgstation/tgstation',
    'Horizon =][=': 'horizon-dev-team/Horizon-Dream',
  };

  let currentSource = 'all';

  const render = data => {
    container.innerHTML = '';
    const byDate = data.reduce((acc, i) => (acc[i.date] = [...(acc[i.date]||[]), i], acc), {});

    for (const [date, items] of Object.entries(byDate).sort((a,b) => a[0] < b[0] ? 1 : -1)) {
      const bySource = items.reduce((acc, i) => (acc[i.source] = [...(acc[i.source]||[]), i], acc), {});
      let html = `<div class="changelog-date-section"><h2 class="date-header">${esc(fmtDate(date))}</h2>`;

      for (const [src, list] of Object.entries(bySource)) {
        html += `<div class="source-group"><h3 class="source-header">${esc(src)}:</h3>`;

        list.sort((a, b) => {
          const dateA = a.upstream_date || a.date;
          const dateB = b.upstream_date || b.date;
          if (dateA > dateB) return -1;
          if (dateA < dateB) return 1;
          return 0;
        });

        list.forEach(item => {
          const prNumber = esc(item.pr.split('/').pop());
          let repoSlug = item.repo || REPO_MAP[src] || '';
          const hasLink = !!repoSlug;
          const prUrl = hasLink ? `https://github.com/${repoSlug}/pull/${prNumber}` : '#';
          let repoDisplayName = src; // По умолчанию берем источник (Horizon =][=)
          if (repoSlug) {
            const slugParts = repoSlug.split('/');
            repoDisplayName = slugParts[slugParts.length - 1];
          }
          if (repoSlug.includes('tgstation')) repoDisplayName = '/TG/Station';

          const displayDate = item.upstream_date || date;
          const title = esc(item.title || `PR #${item.pr}`);
          const author = esc(item.author);

          const changesHtml = item.changes.map(ch =>
            `<li class="${esc(ch.class)}">${esc(ch.text)}</li>`
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

          html += `<div class="changelog-card">
            <div class="card-main">
              <div class="card-content">
                <h4 class="card-title">${title}</h4>
                <div class="card-meta">by <span class="author">${author}</span></div>

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
        });
        html += `</div>`;
      }
      html += `</div>`;
      container.innerHTML += html;
    }
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

  months = await (await fetch('./changelogs/months.json')).json();
  months.forEach(m => monthSelect.add(new Option(fmtMonth(m), m)));
  setSource('all');

  if (sourceAllBtn) sourceAllBtn.addEventListener('click', () => setSource('all') || load(idx));
  if (sourceUpstreamBtn) sourceUpstreamBtn.addEventListener('click', () => setSource('/TG/Station') || load(idx));
  if (sourceHorizonBtn) sourceHorizonBtn.addEventListener('click', () => setSource('Horizon =][=') || load(idx));

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
        const month = months[idx];
        const data = cache[month] || [];
        const item = data.find(i => String(i.pr) === prId && i.source === source && i.date === date);

        if (item && item.body) {
          bodyDiv.innerHTML = window.parseMarkdown(item.body);
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

  if (months.length) load(0);
});