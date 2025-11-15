const MIN_GRID_SIZE = 10;
const MAX_GRID_SIZE = 25;

export const MIN_WORDS = 5;
export const MAX_WORDS = 25;

export function normalizeEntries(raw) {
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

export function createPuzzle(entries, requestedCount, options = {}) {
  const { onProgress } = options;
  const report = typeof onProgress === "function" ? onProgress : () => {};

  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error("Load a JSON file before generating a crossword.");
  }

  if (requestedCount < MIN_WORDS) {
    throw new Error(`Please select at least ${MIN_WORDS} words.`);
  }

  if (requestedCount > entries.length) {
    throw new Error("Not enough words available for that grid size.");
  }

  report(`Selecting ${requestedCount} random entries from ${entries.length} options…`);
  const words = pickRandomEntries(entries, requestedCount);
  const gridSize = determineGridSize(words);
  report(`Target grid size: ${gridSize}×${gridSize}. Building layout…`);
  const layout = buildCrossword(words, gridSize, report);
  report("Layout complete.");

  return {
    ...layout,
    requestedCount: words.length,
    rows: layout.grid.length,
    cols: layout.grid[0]?.length || 0,
  };
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
  return Math.max(MIN_GRID_SIZE, Math.min(MAX_GRID_SIZE, roughSize));
}

function buildCrossword(entries, gridSize, report = () => {}) {
  const maxAttempts = 80;
  let bestLayout = null;
  let bestScore = -Infinity;
  let successCount = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    report(`Layout attempt ${attempt + 1} of ${maxAttempts}`);
    const layout = attemptLayout(entries, gridSize);
    if (!layout) {
      continue;
    }

    successCount += 1;
    const score = scoreLayout(layout);
    if (score > bestScore) {
      report(`Better layout found (score ${(score * 100).toFixed(0)}%).`);
      bestScore = score;
      bestLayout = layout;
      if (score >= 0.85) {
        report("High-quality layout achieved. Stopping early.");
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
  const usage = createUsageGrid(gridSize);
  const overlapMatrix = buildOverlapMatrix(entries);
  const overlapTotals = calculateOverlapTotals(entries.length, overlapMatrix);
  const placements = [];
  const used = new Set();

  const initialIndex = selectInitialEntryIndex(entries, overlapTotals);
  const initialEntry = entries[initialIndex];
  if (!initialEntry || !initialEntry.word) {
    return null;
  }

  const centerRow = Math.floor(gridSize / 2);
  const centerCol = Math.max(0, Math.floor((gridSize - initialEntry.word.length) / 2));
  if (!canPlace(initialEntry.word, centerRow, centerCol, "across", grid, usage)) {
    return null;
  }

  const { placement: firstPlacement } = applyPlacement(
    initialEntry,
    initialIndex,
    centerRow,
    centerCol,
    "across",
    grid,
    usage,
  );
  placements.push(firstPlacement);
  used.add(initialIndex);

  if (!backtrackPlace(grid, usage, placements, entries, used, overlapMatrix, overlapTotals)) {
    return null;
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

function buildOverlapMatrix(entries) {
  const matrix = new Map();
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = 0; j < entries.length; j += 1) {
      if (i === j) continue;
      const key = `${i}:${j}`;
      matrix.set(key, computeLetterOverlaps(entries[i].word, entries[j].word));
    }
  }
  return matrix;
}

function computeLetterOverlaps(wordA = "", wordB = "") {
  const overlaps = [];
  for (let i = 0; i < wordA.length; i += 1) {
    for (let j = 0; j < wordB.length; j += 1) {
      if (wordA[i] === wordB[j]) {
        overlaps.push({ aIndex: i, bIndex: j });
      }
    }
  }
  return overlaps;
}

function calculateOverlapTotals(count, matrix) {
  return Array.from({ length: count }, (_, index) => {
    let total = 0;
    for (let j = 0; j < count; j += 1) {
      if (index === j) continue;
      const overlaps = matrix.get(`${index}:${j}`);
      if (overlaps) {
        total += overlaps.length;
      }
    }
    return total;
  });
}

function selectInitialEntryIndex(entries, overlapTotals) {
  let bestIndex = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < entries.length; i += 1) {
    const score = overlapTotals[i] ?? 0;
    if (
      score > bestScore ||
      (score === bestScore && entries[i].word.length > entries[bestIndex].word.length)
    ) {
      bestIndex = i;
      bestScore = score;
    }
  }
  return bestIndex;
}

function backtrackPlace(grid, usage, placements, entries, used, overlapMatrix, overlapTotals) {
  if (placements.length === entries.length) {
    return true;
  }

  const nextEntries = selectNextEntries(entries, used, placements, overlapMatrix, overlapTotals);
  for (const candidate of nextEntries) {
    const options = generatePlacementOptions(candidate, placements, overlapMatrix);
    for (const option of options) {
      if (!canPlace(candidate.entry.word, option.row, option.col, option.direction, grid, usage)) {
        continue;
      }

      const { placement, filledCells, usageUpdates } = applyPlacement(
        candidate.entry,
        candidate.index,
        option.row,
        option.col,
        option.direction,
        grid,
        usage,
      );
      placements.push(placement);
      used.add(candidate.index);

      if (backtrackPlace(grid, usage, placements, entries, used, overlapMatrix, overlapTotals)) {
        return true;
      }

      placements.pop();
      used.delete(candidate.index);
      revertPlacement(grid, usage, filledCells, usageUpdates);
    }
  }

  return false;
}

function selectNextEntries(entries, used, placements, overlapMatrix, overlapTotals) {
  const candidates = [];

  entries.forEach((entry, index) => {
    if (used.has(index)) return;
    const overlapScore = placements.reduce((score, placement) => {
      const overlaps = overlapMatrix.get(`${index}:${placement.entryIndex}`) || [];
      return score + overlaps.length;
    }, 0);

    if (overlapScore === 0) {
      return;
    }

    candidates.push({
      entry,
      index,
      overlapScore,
      potential: overlapTotals[index] ?? 0,
    });
  });

  candidates.sort((a, b) => {
    if (b.overlapScore !== a.overlapScore) {
      return b.overlapScore - a.overlapScore;
    }
    if (b.potential !== a.potential) {
      return b.potential - a.potential;
    }
    return b.entry.word.length - a.entry.word.length;
  });

  return candidates;
}

function generatePlacementOptions(candidate, placements, overlapMatrix) {
  const options = [];
  const seen = new Set();

  placements.forEach((placement) => {
    const overlaps = overlapMatrix.get(`${candidate.index}:${placement.entryIndex}`) || [];
    overlaps.forEach(({ aIndex, bIndex }) => {
      let row;
      let col;
      let direction;
      if (placement.direction === "across") {
        direction = "down";
        row = placement.row - aIndex;
        col = placement.col + bIndex;
      } else {
        direction = "across";
        row = placement.row + bIndex;
        col = placement.col - aIndex;
      }
      const key = `${row}:${col}:${direction}`;
      if (!seen.has(key)) {
        seen.add(key);
        options.push({ row, col, direction });
      }
    });
  });

  return options;
}

function applyPlacement(entry, entryIndex, row, col, direction, grid, usage) {
  const deltaRow = direction === "down" ? 1 : 0;
  const deltaCol = direction === "across" ? 1 : 0;
  const filledCells = [];
  const usageKey = direction === "across" ? "across" : "down";
  const usageUpdates = [];

  for (let i = 0; i < entry.word.length; i += 1) {
    const currentRow = row + deltaRow * i;
    const currentCol = col + deltaCol * i;
    if (!grid[currentRow][currentCol]) {
      filledCells.push({ row: currentRow, col: currentCol });
      grid[currentRow][currentCol] = entry.word[i];
    }
    usage[currentRow][currentCol][usageKey] = true;
    usageUpdates.push({ row: currentRow, col: currentCol, key: usageKey });
  }

  return {
    placement: {
      word: entry.word,
      clue: entry.clue,
      row,
      col,
      direction,
      entryIndex,
    },
    filledCells,
    usageUpdates,
  };
}

function revertPlacement(grid, usage, filledCells, usageUpdates) {
  usageUpdates.forEach(({ row, col, key }) => {
    usage[row][col][key] = false;
    if (!usage[row][col].across && !usage[row][col].down) {
      grid[row][col] = null;
    }
  });
  filledCells.forEach((cell) => {
    if (!usage[cell.row][cell.col].across && !usage[cell.row][cell.col].down) {
      grid[cell.row][cell.col] = null;
    }
  });
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

function createUsageGrid(size) {
  return Array.from({ length: size }, () =>
    Array.from({ length: size }, () => ({ across: false, down: false })),
  );
}

function canPlace(word, row, col, direction, grid, usage) {
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

    if (!existing) {
      if (direction === "across") {
        const aboveRow = currentRow - 1;
        const belowRow = currentRow + 1;
        if (
          isInsideGrid(aboveRow, currentCol, size) &&
          grid[aboveRow][currentCol] &&
          !usage[aboveRow][currentCol].down
        ) {
          return false;
        }
        if (
          isInsideGrid(belowRow, currentCol, size) &&
          grid[belowRow][currentCol] &&
          !usage[belowRow][currentCol].down
        ) {
          return false;
        }
      } else {
        const leftCol = currentCol - 1;
        const rightCol = currentCol + 1;
        if (
          isInsideGrid(currentRow, leftCol, size) &&
          grid[currentRow][leftCol] &&
          !usage[currentRow][leftCol].across
        ) {
          return false;
        }
        if (
          isInsideGrid(currentRow, rightCol, size) &&
          grid[currentRow][rightCol] &&
          !usage[currentRow][rightCol].across
        ) {
          return false;
        }
      }
    }
  }

  return true;
}

function isInsideGrid(row, col, size) {
  return row >= 0 && col >= 0 && row < size && col < size;
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
