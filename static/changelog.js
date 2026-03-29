document.addEventListener('DOMContentLoaded', () => {
  const changelogContainer = document.getElementById('changelogs');
  const loadMoreButton = document.createElement('button');
  loadMoreButton.textContent = 'Загрузить больше старых записей';
  loadMoreButton.className = 'btn btn-outline';
  loadMoreButton.style.margin = '20px auto';
  loadMoreButton.style.display = 'block';

  const DATA_URL = './changelogs/changelogs.json';
  const INITIAL_DAYS = 5;
  const BATCH_DAYS = 5;

  let changelogData = [];
  let dates = [];
  let visibleCount = 0;

  function formatDate(dateString) {
    const [year, month, day] = dateString.split('-');
    return `${day}.${month}.${year}`;
  }

  function groupByDate(items) {
    const map = new Map();
    items.forEach((entry) => {
      if (!map.has(entry.date)) map.set(entry.date, []);
      map.get(entry.date).push(entry);
    });
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }

  function renderDateBlocks(count) {
    const newVisible = Math.min(count, dates.length);
    if (newVisible <= visibleCount) return;

    const visibleDates = dates.slice(0, newVisible);
    changelogContainer.innerHTML = '';

    for (const [date, entries] of visibleDates) {
      const formatted = formatDate(date);
      const dateSection = document.createElement('div');
      dateSection.className = 'changelog-date-section';
      dateSection.dataset.date = formatted;

      const h2 = document.createElement('h2');
      h2.className = 'date-header';
      h2.textContent = formatted;
      dateSection.appendChild(h2);

      const sources = new Map();
      entries.forEach((item) => {
        if (!sources.has(item.source)) sources.set(item.source, []);
        sources.get(item.source).push(item);
      });

      for (const [source, sourceItems] of sources.entries()) {
        const sourceGroup = document.createElement('div');
        sourceGroup.className = 'source-group';
        sourceGroup.dataset.author = source;

        const h3 = document.createElement('h3');
        h3.className = 'source-header';
        h3.textContent = `${source}:`;
        sourceGroup.appendChild(h3);

        sourceItems.forEach((item) => {
          const card = document.createElement('div');
          card.className = 'changelog-card';

          const main = document.createElement('div');
          main.className = 'card-main';

          const content = document.createElement('div');
          content.className = 'card-content';

          const h4 = document.createElement('h4');
          h4.className = 'card-title';
          h4.textContent = item.title || `PR #${item.pr}`;

          const meta = document.createElement('div');
          meta.className = 'card-meta';
          meta.textContent = `by ${item.author}`;

          const ul = document.createElement('ul');
          ul.className = 'changelog';

          item.changes.forEach((ch) => {
            const li = document.createElement('li');
            li.className = ch.class || 'tweak';
            li.textContent = ch.text;
            ul.appendChild(li);
          });

          content.appendChild(h4);
          content.appendChild(meta);
          content.appendChild(ul);
          main.appendChild(content);

          const sidebar = document.createElement('div');
          sidebar.className = 'card-sidebar';

          const prLink = document.createElement('a');
          prLink.className = 'pr-number';
          prLink.href = item.url || '#';
          prLink.textContent = `#${item.pr}`;
          prLink.target = '_blank';

          const sidebarInfo = document.createElement('div');
          sidebarInfo.className = 'sidebar-info';
          sidebarInfo.innerHTML = `<div><i class="fas fa-calendar"></i> ${formatted}</div><div><i class="fas fa-code"></i> ${source}</div>`;

          sidebar.appendChild(prLink);
          sidebar.appendChild(sidebarInfo);

          card.appendChild(main);
          card.appendChild(sidebar);

          sourceGroup.appendChild(card);
        });

        dateSection.appendChild(sourceGroup);
      }

      changelogContainer.appendChild(dateSection);
    }

    visibleCount = newVisible;
    const hasMore = visibleCount < dates.length;
    loadMoreButton.style.display = hasMore ? 'block' : 'none';

    document.dispatchEvent(new CustomEvent('changelog:updated'));
  }

  loadMoreButton.addEventListener('click', () => {
    renderDateBlocks(visibleCount + BATCH_DAYS);
  });

  changelogContainer.appendChild(loadMoreButton);

  fetch(DATA_URL)
    .then((res) => {
      if (!res.ok) throw new Error('Failed to load changelog data');
      return res.json();
    })
    .then((data) => {
      changelogData = data;
      changelogData.forEach((item) => {
        item.url = `https://github.com/horizon-dev-team/HORIZON-Project-Prototype/pull/${item.pr.split('/').pop()}`;
      });

      const grouped = groupByDate(changelogData);
      dates = grouped;

      renderDateBlocks(INITIAL_DAYS);
    })
    .catch((error) => {
      changelogContainer.innerHTML = '<div class="alert alert-danger">Ошибка загрузки чеклинга: ' + error.message + '</div>';
      loadMoreButton.style.display = 'none';
      console.error(error);
    });
});