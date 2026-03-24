const legendBtn = document.getElementById('open-legend-button');
const legendText = document.getElementById('legend-text');
const closeLegendBtn = document.getElementById('close-legend-button');

if (legendBtn && legendText && closeLegendBtn) {
  // Открытие легенды
  legendBtn.addEventListener('click', () => {
    legendText.classList.remove('hide');
    legendText.classList.add('show');
    legendBtn.style.display = 'none';
  });

  // Закрытие легенды
  closeLegendBtn.addEventListener('click', () => {
    legendText.classList.remove('show');
    legendText.classList.add('hide');
    
    setTimeout(() => {
      legendText.style.display = 'none';
      legendText.classList.remove('hide');
      legendBtn.style.display = 'flex';
    }, 300);
  });
}