import '@testing-library/jest-dom';

// JSDOM doesn't implement scrollIntoView
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// Newer Node versions ship an experimental global `localStorage` that
// shadows JSDOM's and is unusable without --localstorage-file. Point the
// globals back at JSDOM's real Storage so tests behave the same on every
// runtime (and Storage.prototype spies keep working).
const jsdomWindow = (globalThis as unknown as { jsdom?: { window: Window } }).jsdom?.window;
if (jsdomWindow) {
  for (const name of ['localStorage', 'sessionStorage'] as const) {
    const storage = jsdomWindow[name];
    Object.defineProperty(globalThis, name, { configurable: true, value: storage });
    Object.defineProperty(window, name, { configurable: true, value: storage });
  }
}
