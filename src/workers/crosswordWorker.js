import { createPuzzle } from "../lib/crossword";

self.onmessage = (event) => {
  const { entries, wordCount } = event.data || {};
  try {
    const sendProgress = (message) => {
      self.postMessage({ type: "progress", message });
    };
    sendProgress("Preparing generator…");
    const puzzle = createPuzzle(entries, wordCount, { onProgress: sendProgress });
    self.postMessage({ type: "success", puzzle });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error?.message || "Unable to generate crossword.",
    });
  }
};
