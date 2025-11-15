import { createPuzzle } from "../lib/crossword";

self.onmessage = (event) => {
  const { entries, wordCount } = event.data || {};
  try {
    const puzzle = createPuzzle(entries, wordCount);
    self.postMessage({ type: "success", puzzle });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error?.message || "Unable to generate crossword.",
    });
  }
};
