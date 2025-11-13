## Crossword Builder

Simple static web app that converts a JSON list of `{word, clue}` entries into a printable crossword puzzle (PDF). No build tooling or servers are required—just open `index.html` in a modern browser.

### Features
- Upload any JSON file containing between 5 and 25 question/answer pairs.
- Choose how many words (5–25) to include in the grid.
- Auto-layout engine places words with shared letters and trims unused rows/columns.
- View Across/Down clue lists and optionally reveal the grid answers on-screen.
- Export a clean, solver-friendly PDF with the grid and clues.

### Usage
1. Open `index.html` in your browser (double-click or run `open index.html` on macOS).
2. Click **Word & clue JSON** and select a JSON file (see format below).
3. Use the slider to pick how many words to include (enabled once 5+ entries are loaded).
4. Press **Generate Crossword** to see the grid and clues.
5. Use **Download PDF** to save a print-ready copy. Toggle **Show solutions** to display answers on-screen before exporting.

### JSON format
Provide an array of objects with `word` and `clue` keys. Extra keys are ignored, and words are automatically uppercased and stripped of non-letter characters.

```json
[
  { "word": "planet", "clue": "Orbits a star." },
  { "word": "galaxy", "clue": "Collection of billions of stars." },
  { "word": "nebula", "clue": "Colorful cloud of dust and gas." }
]
```

> Tip: A ready-to-use sample lives at `data/sample-words.json`.

### Implementation notes
- Entirely client-side (vanilla JS + CSS). Uses [`jspdf`](https://github.com/parallax/jsPDF) via CDN for PDF export.
- Crossword builder attempts multiple randomized layouts per generation; if placement fails, try again with fewer words or a different list.
- Grids are automatically cropped to the smallest rectangle containing every letter so printouts stay compact.
