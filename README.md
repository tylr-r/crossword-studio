## Crossword Builder (React + Vite)

Modern React port of the crossword generator. The UI now renders through Vite + React, while the original crossword layout logic lives in `src/lib/crossword.js`.

### Getting started

```bash
npm install
npm run dev
```

The dev server prints a local URL. Open it in a browser to use the builder. For a production build run `npm run build`.

### Usage
1. Click **Word & clue JSON** and provide a file that contains 5–25 `{ "word": "...", "clue": "..." }` entries. A ready-to-use sample lives at `public/data/sample-words.json`.
2. Adjust **Words in grid** to the desired count once the slider unlocks.
3. Pick **Generate crossword** to render the grid + clues. Use **Show solutions** to reveal answers.
4. Press **Download PDF** for a printer-friendly export created with `jspdf`.

### Implementation notes
- The crossword layout algorithm is the same one used in the previous static build; it now returns data structures that React renders as components.
- The UI mirrors the existing styling with CSS living in `src/App.css`.
- `jspdf` is a direct dependency (no CDN) so builds stay offline-friendly.
