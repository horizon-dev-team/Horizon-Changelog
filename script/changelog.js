document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('changelogs');
  const btn = Object.assign(document.createElement('button'), {
    textContent: 'Загрузить старые записи',
    className: 'btn btn-outline',
    style: 'margin:20px auto;display:block'
  });
  
  let months = [], loaded = 0;
  const format = d => d.split('-').reverse().join('.');
  const groupByDate = items => Object.entries(items.reduce((acc, i) => (acc[i.date] = [...(acc[i.date]||[]), i], acc), {}))
    .sort((a,b) => a[0] < b[0] ? 1 : -1);
  const render = data => {
    for (let [date, entries] of groupByDate(data)) {
      const section = document.createElement('div');
      section.className = 'changelog-date-section';
      section.innerHTML = `<h2 class="date-header">${format(date)}</h2>`;
      const bySource = entries.reduce((acc, i) => (acc[i.source] = [...(acc[i.source]||[]), i], acc), {});
      for (let [source, items] of Object.entries(bySource)) {
        const group = document.createElement('div');
        group.className = 'source-group';
        group.innerHTML = `<h3 class="source-header">${source}:</h3>`;
        
        items.forEach(item => {
          group.innerHTML += `
            <div class="changelog-card">
              <div class="card-main">
                <div class="card-content">
                  <h4 class="card-title">${item.title || `PR #${item.pr}`}</h4>
                  <div class="card-meta">by<a class="author">${item.author}</a></div>
                  <ul class="changelog">${item.changes.map(ch => `<li class="${ch.class || 'tweak'}">${ch.text}</li>`).join('')}</ul>
                </div>
              </div>
              <div class="card-sidebar">
                <a class="pr-number" href="${item.url || '#'}" target="_blank">#${item.pr}</a>
                <div class="sidebar-info">
                  <div><i class="fas fa-calendar"></i> ${format(date)}</div>
                  <div><i class="fas fa-code"></i> ${source}</div>
                </div>
              </div>
            </div>
          `;
        });
        section.appendChild(group);
      }
      container.appendChild(section);
    }
    container.appendChild(btn);
  };
  const load = async m => {
    btn.disabled = true;
    try {
      const res = await fetch(`./changelogs/archive/${m}.json`);
      const data = await res.json();
      data.forEach(i => i.url = `https://github.com/${i.source === '/TG/Station' ? 'tgstation/tgstation' : 'horizon-dev-team/HORIZON-Project-Prototype'}/pull/${i.pr.split('/').pop()}`);
      render(data);
      loaded++;
    } catch(e) { container.innerHTML += `<div class="alert alert-danger">Ошибка: ${e.message}</div>`; }
    finally { btn.disabled = false; btn.style.display = loaded < months.length ? 'block' : 'none'; }
  };
  btn.onclick = () => loaded < months.length && load(months[loaded]);
  container.appendChild(btn);
  try {
    months = await (await fetch('./changelogs/months.json')).json();
    months.length ? load(months[0]) : (container.innerHTML = '<div class="alert alert-info">Нет записей</div>', btn.style.display = 'none');
  } catch(e) { container.innerHTML = `<div class="alert alert-danger">Ошибка: ${e.message}</div>`; btn.style.display = 'none'; }
});

const start = performance.now();
window.addEventListener('load', () => document.getElementById('load-time') && (document.getElementById('load-time').textContent = ((performance.now() - start)/1000).toFixed(2)));