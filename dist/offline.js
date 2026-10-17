document.getElementById('retry').addEventListener('click', () => location.reload());
function connection() {
  document.getElementById('network').textContent = navigator.onLine
    ? 'Your device has a connection. Tap Try again to reopen Sideout.'
    : 'Waiting for a connection…';
}
window.addEventListener('online', connection);
window.addEventListener('offline', connection);
connection();
