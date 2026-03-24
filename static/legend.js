const legendBtn = document.getElementById('open-legend-button');
const legendText = document.getElementById('legend-text');
const closeLegendBtn = document.getElementById('close-legend-button');

if (legendBtn && legendText && closeLegendBtn) {
  legendBtn.addEventListener('click', () => {
    legendText.style.display = 'block';
    void legendText.offsetHeight;
    legendText.classList.add('show');
    legendText.classList.remove('hide');
    legendBtn.style.display = 'none';
  });

  closeLegendBtn.addEventListener('click', () => {
    legendText.classList.remove('show');
    legendText.classList.add('hide');
    
    setTimeout(() => {
      legendText.style.display = 'none';
      legendBtn.style.display = 'flex';
    }, 300);
  });
}