## Crossword Studio

Crossword Studio is a simple React + Vite tool for turning a JSON list of `{ word, clue }` pairs into a printable crossword. Upload a file, pick how many words to place, generate the puzzle, and export a PDF — everything happens in the browser.

### Quick start

```bash
npm install
npm run dev
```

Open the dev URL in your browser. For production builds run `npm run build`.

### JSON format
Provide an array with `word` and `clue` keys:

```json
[
  { "word": "seattle", "clue": "Emerald City" },
  { "word": "madia", "clue": "Your favorite crossword maker" }
]
```

A minimum of **5** entries is required and you can include up to **25** words per puzzle. A ready-to-use sample lives at `public/data/sample-words.json`.

### Basic flow
1. Upload the JSON file on the first screen.
2. Adjust the **Words in grid** slider if needed.
3. Click **Generate** to build the crossword and clues.
4. Reveal answers or download the PDF export.
