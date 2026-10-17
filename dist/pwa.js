(() => {
  const banner = document.getElementById('install-banner');
  const button = document.getElementById('install-sideout');
  const dialog = document.getElementById('install-dialog');
  const action = document.getElementById('install-confirm');
  const help = document.getElementById('install-instructions');
  const status = document.getElementById('install-status');
  const connection = document.getElementById('connection-status');
  const display = window.matchMedia('(display-mode: standalone)');
  let prompt = null;
  let installed = false;
  const isInstalled = () => installed || display.matches || navigator.standalone === true;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function render() {
    banner.hidden = isInstalled();
    action.hidden = !prompt;
    help.textContent = ios
      ? 'Open Sideout in Safari. Tap Share (or More → Share), choose Add to Home Screen, turn on Open as Web App if shown, then tap Add.'
      : /Android/.test(navigator.userAgent)
        ? 'In Chrome, open the ⋮ menu and choose Add to Home screen → Install. If you opened Sideout inside another app, open this page in Chrome first.'
        : 'In Chrome or Edge, choose the install icon in the address bar, or open the browser menu and choose Install Sideout / Install this site as an app. On a Mac in Safari, choose File → Add to Dock.';
  }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    prompt = event;
    render();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    prompt = null;
    if (dialog.open) dialog.close();
    render();
  });
  display.addEventListener('change', render);
  button.addEventListener('click', () => {
    render();
    status.textContent = '';
    dialog.showModal();
  });
  document.getElementById('install-close').addEventListener('click', () => dialog.close());
  action.addEventListener('click', async () => {
    if (!prompt) return;
    const pending = prompt;
    prompt = null;
    action.disabled = true;
    try {
      await pending.prompt();
      const choice = await pending.userChoice;
      status.textContent = choice.outcome === 'accepted'
        ? 'Your browser is installing Sideout. Look for its icon on your home screen or app launcher.'
        : 'You can install Sideout later from your browser menu.';
    } catch {
      status.textContent = 'Use the browser menu to install Sideout with the steps above.';
    } finally {
      action.disabled = false;
      render();
    }
  });
  function networkStatus() {
    connection.hidden = navigator.onLine !== false;
  }
  window.addEventListener('online', networkStatus);
  window.addEventListener('offline', networkStatus);
  networkStatus();
  render();
  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', {scope: '/', updateViaCache: 'none'}).catch(() => {
        // Installation remains available even when the offline screen cannot register.
      });
    });
  }
})();
