const legendBtn = document.getElementById('open-legend-button');
const legendText = document.getElementById('legend-text');

if (legendBtn && legendText) {
  legendBtn.addEventListener('click', () => {
    if (legendText.classList.contains('show')) {
      legendText.classList.remove('show');
      legendText.classList.add('hide');
      legendBtn.classList.remove('active');
      
      setTimeout(() => {
        legendText.style.display = 'none';
        legendText.classList.remove('hide');
      }, 300);
    } else {
      legendText.style.display = 'block';
      setTimeout(() => {
        legendText.classList.add('show');
        legendText.classList.remove('hide');
      }, 10);
      legendBtn.classList.add('active');
    }
  });
}

const startTime = performance.now();
window.addEventListener('load', () => {
  const loadTime = (performance.now() - startTime) / 1000;
  document.getElementById('load-time').textContent = loadTime.toFixed(2);
});