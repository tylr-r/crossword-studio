import '@testing-library/jest-dom';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => { }, // Deprecated
    removeListener: () => { }, // Deprecated
    addEventListener: () => { },
    removeEventListener: () => { },
    dispatchEvent: () => { },
  }),
});

class Worker {
  constructor(stringUrl) {
    this.url = stringUrl;
    this.onmessage = () => { };
  }

  postMessage(msg) {
    this.onmessage(msg);
  }

  terminate() { }
}

window.Worker = Worker;
