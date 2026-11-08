// 首屏主题预设：在 React 水合前应用主题，避免浅色用户闪深色（v2 A5 P3）。
// 读取顺序：① localStorage 中由 applyTheme 维护的同步镜像（零闪烁）；
// ② chrome.storage.local 的设置（异步，首次启动兜底）；③ 默认 dark。
// store 初始化后 applyTheme 会统一校正。
(function () {
  var apply = function (theme) {
    var root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme === 'light' ? 'light' : 'dark');
  };
  var resolve = function (theme) {
    if (theme === 'system') {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    return theme === 'light' ? 'light' : 'dark';
  };

  try {
    var mirrored = localStorage.getItem('sbh:theme');
    if (mirrored === 'light' || mirrored === 'dark') {
      apply(mirrored);
      return;
    }
  } catch (error) {
    // localStorage 不可读时走异步分支
  }

  try {
    var storage = window.chrome && window.chrome.storage && window.chrome.storage.local;
    if (storage && typeof storage.get === 'function') {
      storage.get(['sbh:settings'], function (result) {
        try {
          var settings = result && result['sbh:settings'];
          apply(resolve(settings && typeof settings.theme === 'string' ? settings.theme : 'dark'));
        } catch (error) {
          apply('dark');
        }
      });
      return;
    }
  } catch (error) {
    // chrome API 不可用（网页预览模式）时按默认处理
  }

  apply('dark');
})();
