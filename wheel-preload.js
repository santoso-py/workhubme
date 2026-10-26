// Runs in every website tab, in an isolated world. It forwards only the amount of scrolling
// (two numbers) to the app so two-finger swipes can switch tabs. It reads nothing else from the
// page, changes nothing in it, and exposes nothing to it.
const { ipcRenderer } = require('electron');

window.addEventListener(
  'wheel',
  (event) => {
    if (!event.isTrusted) return; // ignore events the page itself dispatches
    if (event.deltaX === 0 && event.deltaY === 0) return;
    ipcRenderer.send('swipe:wheel', event.deltaX, event.deltaY);
  },
  { capture: true, passive: true },
);
