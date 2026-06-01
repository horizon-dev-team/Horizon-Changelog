document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('changelogs');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const monthSelect = document.getElementById('monthSelect');

  const fmtDate = d => d.split('-').reverse().join('.');
  const fmtMonth = m => new Date(m.split('-')[0], m.split('-')[1]-1).toLocaleString('ru', { month: 'long', year: 'numeric' });

  let months = [], idx = 0, cache = {};

  const render = data => {
    container.innerHTML = '';
    const byDate = data.reduce((acc, i) => (acc[i.date] = [...(acc[i.date]||[]), i], acc), {});
    for (const [date, items] of Object.entries(byDate).sort((a,b) => a[0] < b[0] ? 1 : -1)) {
      const bySource = items.reduce((acc, i) => (acc[i.source] = [...(acc[i.source]||[]), i], acc), {});
      let html = `<div class="changelog-date-section"><h2 class="date-header">${fmtDate(date)}</h2>`;
      for (const [src, list] of Object.entries(bySource)) {
        html += `<div class="source-group"><h3 class="source-header">${src}:</h3>`;
        list.forEach(item => {
          const prNumber = item.pr.split('/').pop();
          const repo = REPO_MAP[src];
          const hasLink = !!repo;
          const prUrl = hasLink ? `https://github.com/${repo}/pull/${prNumber}` : '#';
          html += `<div class="changelog-card">
            <div class="card-main">
              <div class="card-content">
                <h4 class="card-title">${item.title || `PR #${item.pr}`}</h4>
                <div class="card-meta">by <span class="author">${item.author}</span></div>
                <ul class="changelog">${item.changes.map(ch => `<li class="${ch.class}">${ch.text}</li>`).join('')}</ul>
              </div>
            </div>
            <div class="card-sidebar">
              <a class="pr-number" href="${prUrl}" ${!hasLink ? 'disabled' : ''} target="_blank">#${prNumber}</a>
              <div class="sidebar-info">
                <div><i class="fas fa-calendar"></i> ${fmtDate(date)}</div>
                <div><i class="fas fa-code"></i> ${src}</div>
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

  const REPO_MAP = {
    '/TG/Station': 'tgstation/tgstation',
    'Horizon =][=': 'horizon-dev-team/Horizon-Dream',
  };

  const load = async i => {
    const month = months[i];
    if (!cache[month]) {
      const res = await fetch(`./changelogs/archive/${month}.json`);
      cache[month] = await res.json();
    }
    render(cache[month]);
    idx = i;
    prevBtn.disabled = i === 0;
    nextBtn.disabled = i === months.length - 1;
    monthSelect.value = month;
  };

  months = await (await fetch('./changelogs/months.json')).json();
  months.forEach(m => monthSelect.add(new Option(fmtMonth(m), m)));

  prevBtn.onclick = () => load(idx - 1);
  nextBtn.onclick = () => load(idx + 1);
  monthSelect.onchange = () => load(months.indexOf(monthSelect.value));

  if (months.length) load(0);
});