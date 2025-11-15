const fileInput = document.getElementById("wordFile");
const wordCountInput = document.getElementById("wordCount");
const wordCountValue = document.getElementById("wordCountValue");
const generateBtn = document.getElementById("generateBtn");
const pdfBtn = document.getElementById("downloadPdfBtn");
const statusMessage = document.getElementById("statusMessage");
const showAnswersToggle = document.getElementById("showAnswers");
const gridElement = document.getElementById("crosswordGrid");
const acrossList = document.getElementById("acrossList");
const downList = document.getElementById("downList");
const themeToggleBtn = document.getElementById("themeToggle");
const rootElement = document.documentElement;

const THEME_STORAGE_KEY = "crossword-theme";
const prefersDarkQuery =
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

let respectSystemPreference = true;

let availableEntries = [];
let puzzleState = null;
let revealAnswers = false;

initializeTheme();

fileInput.addEventListener("change", handleFileSelection);
wordCountInput.addEventListener("input", () => {
  wordCountValue.textContent = wordCountInput.value;
});
generateBtn.addEventListener("click", () => {
  try {
    generatePuzzle();
  } catch (error) {
    setStatus(error.message || "Unable to generate crossword.", true);
  }
});
pdfBtn.addEventListener("click", handlePdfDownload);
showAnswersToggle.addEventListener("change", () => {
  revealAnswers = showAnswersToggle.checked;
  gridElement.classList.toggle("reveal", revealAnswers);
  applyRevealStateToInputs();
});

function initializeTheme() {
  if (!themeToggleBtn) {
    return;
  }

  let storedTheme = null;
  try {
    storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  } catch (_) {
    storedTheme = null;
  }

  respectSystemPreference = !storedTheme;
  const initialTheme =
    storedTheme || (prefersDarkQuery && prefersDarkQuery.matches ? "dark" : "light");
  applyTheme(initialTheme, { persist: Boolean(storedTheme) });

  themeToggleBtn.addEventListener("click", () => {
    const nextTheme = rootElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
  });

  if (prefersDarkQuery && respectSystemPreference) {
    addPrefersDarkListener((event) => {
      if (respectSystemPreference) {
        applyTheme(event.matches ? "dark" : "light", { persist: false });
      }
    });
  }
}

function applyTheme(theme, options = {}) {
  const { persist = true } = options;
  rootElement.setAttribute("data-theme", theme);
  updateThemeToggleUi(theme);

  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (_) {
      // Ignore storage failures (e.g., private browsing).
    }
    respectSystemPreference = false;
  }
}

function updateThemeToggleUi(theme) {
  if (!themeToggleBtn) return;

  const label = theme === "dark" ? "Light mode" : "Dark mode";
  themeToggleBtn.setAttribute("aria-label", `Switch to ${label.toLowerCase()}`);
  themeToggleBtn.classList.toggle("is-dark", theme === "dark");

  const textEl = themeToggleBtn.querySelector(".theme-toggle__label");
  if (textEl) {
    textEl.textContent = label;
  }

  const iconEl = themeToggleBtn.querySelector(".theme-toggle__icon");
  if (iconEl) {
    iconEl.textContent = theme === "dark" ? "☾" : "☀";
  }
}

function addPrefersDarkListener(listener) {
  if (!prefersDarkQuery) return;
  if (typeof prefersDarkQuery.addEventListener === "function") {
    prefersDarkQuery.addEventListener("change", listener);
  } else if (typeof prefersDarkQuery.addListener === "function") {
    prefersDarkQuery.addListener(listener);
  }
}

function handleFileSelection(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      availableEntries = normalizeEntries(parsed);
      updateWordControls(availableEntries.length);
      const hasEnough = availableEntries.length >= 5;
      generateBtn.disabled = !hasEnough;
      const message = hasEnough
        ? `Loaded ${availableEntries.length} entries. Choose up to ${wordCountInput.max} words.`
        : `Loaded ${availableEntries.length} entries. Add at least ${
            5 - availableEntries.length
          } more to enable puzzle generation.`;
      setStatus(message);
    } catch (error) {
      availableEntries = [];
      puzzleState = null;
      gridElement.innerHTML = "";
      acrossList.innerHTML = "";
      downList.innerHTML = "";
      pdfBtn.disabled = true;
      generateBtn.disabled = true;
      setStatus(error.message || "Invalid JSON file.", true);
    }
  };
  reader.onerror = () => {
    setStatus("Unable to read file. Please try again.", true);
  };
  reader.readAsText(file);
}

function normalizeEntries(raw) {
  if (!Array.isArray(raw)) {
    throw new Error("The JSON file must contain an array of entries.");
  }

  const entries = raw
    .map((item, index) => {
      if (typeof item !== "object" || item === null) {
        return null;
      }

      const word =
        item.word ??
        item.answer ??
        item.solution ??
        item.text ??
        item.entry ??
        "";
      const clue =
        item.clue ??
        item.question ??
        item.prompt ??
        item.hint ??
        item.definition ??
        "";

      const cleanWord = word.toString().toUpperCase().replace(/[^A-Z]/g, "");
      const cleanClue = clue.toString().trim();

      if (cleanWord.length < 2 || cleanClue.length === 0) {
        return null;
      }

      return {
        word: cleanWord,
        clue: cleanClue,
        originalIndex: index,
      };
    })
    .filter(Boolean);

  if (entries.length === 0) {
    throw new Error("No valid {word, clue} pairs were found in the file.");
  }

  return entries;
}

function updateWordControls(totalEntries) {
  const hasEnough = totalEntries >= 5;
  wordCountInput.disabled = !hasEnough;

  if (!hasEnough) {
    wordCountInput.min = 5;
    wordCountInput.max = 25;
    wordCountValue.textContent = wordCountInput.value;
    return;
  }

  wordCountInput.min = 5;
  wordCountInput.max = Math.min(25, totalEntries);

  if (Number(wordCountInput.value) > wordCountInput.max) {
    wordCountInput.value = wordCountInput.max;
  }

  wordCountValue.textContent = wordCountInput.value;
}

function generatePuzzle() {
  if (availableEntries.length === 0) {
    throw new Error("Load a JSON file before generating a crossword.");
  }

  if (wordCountInput.disabled) {
    throw new Error("At least 5 valid entries are required to build a puzzle.");
  }

  const requestedCount = Number(wordCountInput.value);
  if (requestedCount < Number(wordCountInput.min)) {
    throw new Error(`Please select at least ${wordCountInput.min} words.`);
  }

  if (requestedCount > availableEntries.length) {
    throw new Error("Not enough words available for that grid size.");
  }

  const words = pickRandomEntries(availableEntries, requestedCount);
  const gridSize = determineGridSize(words);
  const layout = buildCrossword(words, gridSize);

  puzzleState = layout;
  pdfBtn.disabled = false;
  renderGrid(layout.grid, layout.numbersMap);
  renderClues(layout.acrossClues, layout.downClues);
  setStatus(
    `Crossword generated with ${words.length} words on a ${layout.grid.length}×${layout.grid[0].length} grid.`,
  );
}

function pickRandomEntries(entries, count) {
  const shuffled = shuffle([...entries]);
  return shuffled.slice(0, count);
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function determineGridSize(words) {
  const totalLetters = words.reduce((sum, entry) => sum + entry.word.length, 0);
  const roughSize = Math.ceil(Math.sqrt(totalLetters * 2));
  return Math.max(10, Math.min(25, roughSize));
}

function buildCrossword(entries, gridSize) {
  const maxAttempts = 80;
  let bestLayout = null;
  let bestScore = -Infinity;
  let successCount = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const layout = attemptLayout(entries, gridSize);
    if (!layout) {
      continue;
    }

    successCount += 1;
    const score = scoreLayout(layout);
    if (score > bestScore) {
      bestScore = score;
      bestLayout = layout;
      if (score >= 0.85) {
        break;
      }
    }
  }

  if (bestLayout) {
    return bestLayout;
  }

  if (successCount === 0) {
    throw new Error("Unable to place every word. Try fewer words or a different set.");
  }

  throw new Error("Unable to find a compact layout. Generate again or reduce the word count.");
}

function attemptLayout(entries, gridSize) {
  const grid = createEmptyGrid(gridSize);
  const placements = [];
  const attemptWords = shuffle([...entries]);

  for (const entry of attemptWords) {
    const placement = placeWord(entry, grid, placements);
    if (!placement) {
      return null;
    }
    placements.push(placement);
  }

  const trimmed = trimLayout(grid, placements);
  const numbering = assignNumbers(trimmed.grid, trimmed.placements);
  return {
    grid: trimmed.grid,
    placements: numbering.placements,
    numbersMap: numbering.numbersMap,
    acrossClues: numbering.acrossClues,
    downClues: numbering.downClues,
  };
}

function scoreLayout(layout) {
  const rows = layout.grid.length;
  const cols = layout.grid[0]?.length || 0;
  if (rows === 0 || cols === 0) {
    return 0;
  }

  let filled = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (layout.grid[row][col]) {
        filled += 1;
      }
    }
  }

  const coverageScore = filled / (rows * cols);
  const intersectionBonus = countIntersections(layout.placements) * 0.02;
  return coverageScore + intersectionBonus;
}

function countIntersections(placements) {
  const usage = new Map();

  placements.forEach((placement) => {
    const deltaRow = placement.direction === "down" ? 1 : 0;
    const deltaCol = placement.direction === "across" ? 1 : 0;
    for (let i = 0; i < placement.word.length; i += 1) {
      const key = `${placement.row + deltaRow * i}:${placement.col + deltaCol * i}`;
      usage.set(key, (usage.get(key) || 0) + 1);
    }
  });

  let intersections = 0;
  usage.forEach((count) => {
    if (count > 1) {
      intersections += 1;
    }
  });

  return intersections;
}

function createEmptyGrid(size) {
  return Array.from({ length: size }, () => Array(size).fill(null));
}

function placeWord(entry, grid, placements) {
  if (!entry.word) return null;

  if (placements.length === 0) {
    const row = Math.floor(grid.length / 2);
    const col = Math.max(0, Math.floor((grid[0].length - entry.word.length) / 2));
    if (canPlace(entry.word, row, col, "across", grid)) {
      return commitPlacement(entry, row, col, "across", grid);
    }
  }

  const intersectionCandidates = collectIntersectionCandidates(entry.word, placements);
  for (const candidate of intersectionCandidates) {
    if (canPlace(entry.word, candidate.row, candidate.col, candidate.direction, grid)) {
      return commitPlacement(entry, candidate.row, candidate.col, candidate.direction, grid);
    }
  }

  const fallback = findFallbackPosition(entry.word, grid);
  if (fallback) {
    return commitPlacement(entry, fallback.row, fallback.col, fallback.direction, grid);
  }

  return null;
}

function collectIntersectionCandidates(word, placements) {
  const candidates = [];

  placements.forEach((placed) => {
    for (let i = 0; i < word.length; i += 1) {
      const currentLetter = word[i];
      for (let j = 0; j < placed.word.length; j += 1) {
        if (placed.word[j] !== currentLetter) continue;
        if (placed.direction === "across") {
          candidates.push({
            row: placed.row + j - i,
            col: placed.col + j,
            direction: "down",
          });
        } else {
          candidates.push({
            row: placed.row + j,
            col: placed.col + j - i,
            direction: "across",
          });
        }
      }
    }
  });

  return shuffle(candidates);
}

function findFallbackPosition(word, grid) {
  const size = grid.length;
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (canPlace(word, row, col, "across", grid)) {
        return { row, col, direction: "across" };
      }
      if (canPlace(word, row, col, "down", grid)) {
        return { row, col, direction: "down" };
      }
    }
  }
  return null;
}

function canPlace(word, row, col, direction, grid) {
  const size = grid.length;
  const deltaRow = direction === "down" ? 1 : 0;
  const deltaCol = direction === "across" ? 1 : 0;
  const endRow = row + deltaRow * (word.length - 1);
  const endCol = col + deltaCol * (word.length - 1);

  if (row < 0 || col < 0 || endRow >= size || endCol >= size) {
    return false;
  }

  const beforeRow = row - deltaRow;
  const beforeCol = col - deltaCol;
  if (isInsideGrid(beforeRow, beforeCol, size) && grid[beforeRow][beforeCol]) {
    return false;
  }

  const afterRow = row + deltaRow * word.length;
  const afterCol = col + deltaCol * word.length;
  if (isInsideGrid(afterRow, afterCol, size) && grid[afterRow][afterCol]) {
    return false;
  }

  for (let i = 0; i < word.length; i += 1) {
    const currentRow = row + deltaRow * i;
    const currentCol = col + deltaCol * i;
    const existing = grid[currentRow][currentCol];

    if (existing && existing !== word[i]) {
      return false;
    }
  }

  return true;
}

function isInsideGrid(row, col, size) {
  return row >= 0 && col >= 0 && row < size && col < size;
}

function commitPlacement(entry, row, col, direction, grid) {
  const deltaRow = direction === "down" ? 1 : 0;
  const deltaCol = direction === "across" ? 1 : 0;

  for (let i = 0; i < entry.word.length; i += 1) {
    const currentRow = row + deltaRow * i;
    const currentCol = col + deltaCol * i;
    grid[currentRow][currentCol] = entry.word[i];
  }

  return {
    word: entry.word,
    clue: entry.clue,
    row,
    col,
    direction,
  };
}

function trimLayout(grid, placements) {
  let minRow = grid.length - 1;
  let maxRow = 0;
  let minCol = grid.length - 1;
  let maxCol = 0;
  let hasLetters = false;

  for (let row = 0; row < grid.length; row += 1) {
    for (let col = 0; col < grid[row].length; col += 1) {
      if (grid[row][col]) {
        hasLetters = true;
        minRow = Math.min(minRow, row);
        maxRow = Math.max(maxRow, row);
        minCol = Math.min(minCol, col);
        maxCol = Math.max(maxCol, col);
      }
    }
  }

  if (!hasLetters) {
    return { grid, placements };
  }

  const trimmedGrid = [];
  for (let row = minRow; row <= maxRow; row += 1) {
    const newRow = [];
    for (let col = minCol; col <= maxCol; col += 1) {
      newRow.push(grid[row][col]);
    }
    trimmedGrid.push(newRow);
  }

  const adjustedPlacements = placements.map((placement) => ({
    ...placement,
    row: placement.row - minRow,
    col: placement.col - minCol,
  }));

  return {
    grid: trimmedGrid,
    placements: adjustedPlacements,
  };
}

function assignNumbers(grid, placements) {
  const rows = grid.length;
  const cols = grid[0]?.length || 0;
  const numbersMap = Array.from({ length: rows }, () => Array(cols).fill(null));
  const placementMap = new Map();

  placements.forEach((placement) => {
    placementMap.set(`${placement.direction}:${placement.row}:${placement.col}`, placement);
    placement.number = null;
  });

  let counter = 1;
  const acrossClues = [];
  const downClues = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (!grid[row][col]) continue;

      const startAcross =
        placementMap.has(`across:${row}:${col}`) &&
        (col === 0 || !grid[row][col - 1]);
      const startDown =
        placementMap.has(`down:${row}:${col}`) &&
        (row === 0 || !grid[row - 1][col]);

      if (!startAcross && !startDown) {
        continue;
      }

      const number = counter;
      numbersMap[row][col] = number;
      counter += 1;

      if (startAcross) {
        const placement = placementMap.get(`across:${row}:${col}`);
        placement.number = number;
        acrossClues.push({
          number,
          clue: placement.clue,
          answerLength: placement.word.length,
        });
      }

      if (startDown) {
        const placement = placementMap.get(`down:${row}:${col}`);
        placement.number = number;
        downClues.push({
          number,
          clue: placement.clue,
          answerLength: placement.word.length,
        });
      }
    }
  }

  return { numbersMap, acrossClues, downClues, placements };
}

function renderGrid(grid, numbersMap) {
  gridElement.style.setProperty("--cols", grid[0]?.length || 0);
  gridElement.innerHTML = "";

  for (let row = 0; row < grid.length; row += 1) {
    for (let col = 0; col < grid[row].length; col += 1) {
      const cellValue = grid[row][col];
      const cell = document.createElement("div");
      cell.className = cellValue ? "cell filled" : "cell";

      const number = numbersMap[row]?.[col];
      if (number) {
        const numberEl = document.createElement("span");
        numberEl.className = "number";
        numberEl.textContent = number;
        cell.appendChild(numberEl);
      }

      if (cellValue) {
        const input = createCellInput(cellValue);
        cell.appendChild(input);

        const letter = document.createElement("span");
        letter.className = "letter";
        letter.textContent = cellValue;
        cell.appendChild(letter);
      }

      gridElement.appendChild(cell);
    }
  }

  gridElement.classList.toggle("reveal", revealAnswers);
  if (revealAnswers) {
    applyRevealStateToInputs();
  }
}

function createCellInput(answer) {
  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 1;
  input.autocomplete = "off";
  input.autocorrect = "off";
  input.autocapitalize = "off";
  input.spellcheck = false;
  input.inputMode = "latin";
  input.className = "cell-input";
  input.dataset.answer = answer;
  input.addEventListener("input", handleCellInput);
  input.addEventListener("focus", handleCellFocus);
  return input;
}

function handleCellInput(event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;

  const sanitized = input.value.toUpperCase().replace(/[^A-Z]/g, "");
  input.value = sanitized.slice(-1);
  if (input.value && input.dataset) {
    input.dataset.userValue = input.value;
  } else if (input.dataset) {
    delete input.dataset.userValue;
  }
}

function handleCellFocus(event) {
  const input = event.target;
  if (input instanceof HTMLInputElement) {
    requestAnimationFrame(() => input.select());
  }
}

function applyRevealStateToInputs() {
  const inputs = gridElement.querySelectorAll(".cell-input");
  inputs.forEach((input) => {
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    if (revealAnswers) {
      if (typeof input.dataset.userValue === "undefined") {
        input.dataset.userValue = input.value || "";
      }
      input.value = input.dataset.answer || "";
      input.disabled = true;
    } else {
      const storedValue = input.dataset.userValue ?? "";
      input.value = storedValue;
      input.disabled = false;
      delete input.dataset.userValue;
    }
  });
}

function renderClues(acrossClues, downClues) {
  acrossList.innerHTML = acrossClues
    .map(
      (item) =>
        `<li><span class="clue-number">${item.number}</span><span>${escapeHtml(item.clue)} (${item.answerLength})</span></li>`,
    )
    .join("");

  downList.innerHTML = downClues
    .map(
      (item) =>
        `<li><span class="clue-number">${item.number}</span><span>${escapeHtml(item.clue)} (${item.answerLength})</span></li>`,
    )
    .join("");
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("is-error", isError);
}

function handlePdfDownload() {
  if (!puzzleState) {
    setStatus("Generate a crossword before exporting.", true);
    return;
  }

  if (!window.jspdf || !window.jspdf.jsPDF) {
    setStatus("PDF library failed to load. Check your connection.", true);
    return;
  }

  const doc = new window.jspdf.jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const margin = 12;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const rows = puzzleState.grid.length;
  const cols = puzzleState.grid[0]?.length || 0;
  if (cols === 0) {
    setStatus("No grid data available to export.", true);
    return;
  }
  const cellSize = Math.min(10, (pageWidth - margin * 2) / cols);
  const gridWidth = cellSize * cols;
  const startX = (pageWidth - gridWidth) / 2;
  let currentY = margin + 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Crossword Puzzle", margin, currentY);
  currentY += 6;

  drawGridOnPdf(doc, startX, currentY, cellSize);
  currentY += rows * cellSize + 8;

  doc.setFontSize(12);
  const afterAcross = writeClueSection(
    doc,
    "Across",
    puzzleState.acrossClues,
    margin,
    pageWidth,
    pageHeight,
    currentY,
  );
  writeClueSection(
    doc,
    "Down",
    puzzleState.downClues,
    margin,
    pageWidth,
    pageHeight,
    afterAcross + 2,
  );

  doc.save("crossword.pdf");
}

function drawGridOnPdf(doc, startX, startY, cellSize) {
  doc.setDrawColor(0);
  doc.setLineWidth(0.2);
  const rows = puzzleState.grid.length;
  const cols = puzzleState.grid[0]?.length || 0;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = startX + col * cellSize;
      const y = startY + row * cellSize;
      if (!puzzleState.grid[row][col]) {
        doc.setFillColor(10, 10, 18);
        doc.rect(x, y, cellSize, cellSize, "F");
      } else {
        doc.rect(x, y, cellSize, cellSize);
        const number = puzzleState.numbersMap[row]?.[col];
        if (number) {
          doc.setFontSize(7);
          doc.text(String(number), x + 1.2, y + 2.5);
        }
      }
    }
  }
}

function writeClueSection(doc, title, clues, margin, pageWidth, pageHeight, startY) {
  let y = startY;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  if (y > pageHeight - margin) {
    doc.addPage();
    y = margin;
  }
  doc.text(title, margin, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  clues.forEach((clue) => {
    const text = `${clue.number}. ${clue.clue} (${clue.answerLength})`;
    const wrapped = doc.splitTextToSize(text, pageWidth - margin * 2);
    if (y + wrapped.length * 5 > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
    doc.text(wrapped, margin, y);
    y += wrapped.length * 5;
  });

  return y;
}
