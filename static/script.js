// sidebar-filter.js

document.addEventListener('DOMContentLoaded', function() {
  // Получаем все даты из чейнджлогов
  const dateSections = document.querySelectorAll('.changelog-date-section');
  const allDates = Array.from(dateSections).map(section => ({
    date: section.getAttribute('data-date'),
    element: section,
    year: parseInt(section.getAttribute('data-date').split('.')[2]),
    month: parseInt(section.getAttribute('data-date').split('.')[1]) - 1,
    day: parseInt(section.getAttribute('data-date').split('.')[0])
  }));
  
  // Группируем даты по месяцам
  const monthsMap = new Map();
  
  allDates.forEach(item => {
    const monthKey = `${item.year}-${item.month}`;
    if (!monthsMap.has(monthKey)) {
      monthsMap.set(monthKey, {
        year: item.year,
        month: item.month,
        monthName: new Date(item.year, item.month).toLocaleString('ru', { month: 'long' }),
        dates: []
      });
    }
    monthsMap.get(monthKey).dates.push(item);
  });
  
  // Получаем список месяцев и сортируем по убыванию (новые сверху)
  const monthsList = Array.from(monthsMap.values()).sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });
  
  // Настройки пагинации
  const ITEMS_PER_PAGE = 1;
  let currentPage = 0;
  let totalPages = Math.ceil(monthsList.length / ITEMS_PER_PAGE);
  
  // Элементы DOM
  const monthsListContainer = document.getElementById('months-list-container');
  const paginationPrev = document.getElementById('pagination-prev');
  const paginationNext = document.getElementById('pagination-next');
  
  // Рендер списка месяцев
  function renderMonthsList() {
    if (!monthsListContainer) return;
    
    const start = currentPage * ITEMS_PER_PAGE;
    const end = Math.min(start + ITEMS_PER_PAGE, monthsList.length);
    const pageMonths = monthsList.slice(start, end);
    
    monthsListContainer.innerHTML = '';
    
    pageMonths.forEach(month => {
      const li = document.createElement('li');
      li.setAttribute('data-month', `${month.year}-${month.month}`);
      li.innerHTML = `<b>${month.monthName} ${month.year}</b>`;
      
      li.addEventListener('click', function() {
        document.querySelectorAll('.dates-list li').forEach(l => l.classList.remove('active'));
        this.classList.add('active');
        filterByMonth(month.year, month.month);
      });
      
      monthsListContainer.appendChild(li);
    });
    
    updatePaginationButtons();
    
    // Активируем первый месяц
    const hasActive = document.querySelector('.dates-list li.active');
    if (!hasActive && pageMonths.length > 0) {
      const firstMonth = pageMonths[0];
      const firstMonthElement = document.querySelector(`.dates-list li[data-month="${firstMonth.year}-${firstMonth.month}"]`);
      if (firstMonthElement) {
        firstMonthElement.classList.add('active');
        filterByMonth(firstMonth.year, firstMonth.month);
      }
    }
  }
  
  // Фильтрация по месяцу
  function filterByMonth(year, month) {
    allDates.forEach(item => {
      if (item.year === year && item.month === month) {
        item.element.style.display = 'block';
      } else {
        item.element.style.display = 'none';
      }
    });
  }
  
  function updatePaginationButtons() {
    if (paginationPrev) paginationPrev.disabled = currentPage === 0;
    if (paginationNext) paginationNext.disabled = currentPage >= totalPages - 1;
  }
  
  if (paginationPrev) {
    paginationPrev.addEventListener('click', () => {
      if (currentPage > 0) {
        currentPage--;
        renderMonthsList();
      }
    });
  }
  
  if (paginationNext) {
    paginationNext.addEventListener('click', () => {
      if (currentPage < totalPages - 1) {
        currentPage++;
        renderMonthsList();
      }
    });
  }
  
  if (monthsList.length > 0) {
    renderMonthsList();
  }
});