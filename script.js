(function () {
  const storageKey = 'vvcdada-theme';
  const button = document.querySelector('.theme-toggle');
  const saved = localStorage.getItem(storageKey);
  const systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initial = saved === 'light' || saved === 'dark' ? saved : (systemDark ? 'dark' : 'light');

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    if (button) button.setAttribute('aria-label', theme === 'dark' ? '切换浅色模式' : '切换深色模式');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#171c1a' : '#f8f7f4');
  }

  applyTheme(initial);
  if (button) button.addEventListener('click', function () {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(storageKey, next);
    applyTheme(next);
  });
}());
