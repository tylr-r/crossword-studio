import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { MAX_WORDS, MIN_WORDS, normalizeEntries } from "./lib/crossword";

const THEME_STORAGE_KEY = "crossword-theme";

function getStoredTheme() {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function getSystemTheme() {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

function getInitialTheme() {
  const stored = getStoredTheme();
  if (stored) {
    return stored;
  }
  return getSystemTheme();
}

export default function App() {
  const [entries, setEntries] = useState([]);
  const [wordCount, setWordCount] = useState(10);
  const [puzzle, setPuzzle] = useState(null);
  const [status, setStatus] = useState("");
  const [statusError, setStatusError] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  const [cellValues, setCellValues] = useState({});
  const [activeCell, setActiveCell] = useState(null);
  const [activeDirection, setActiveDirection] = useState("across");
  const [theme, setTheme] = useState(getInitialTheme);
  const [respectSystem, setRespectSystem] = useState(() => !getStoredTheme());
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationSteps, setGenerationSteps] = useState([]);
  const workerRef = useRef(null);
  const fileInputRef = useRef(null);

  const sliderEnabled = entries.length >= MIN_WORDS;
  const sliderMax = sliderEnabled ? Math.min(MAX_WORDS, entries.length) : MAX_WORDS;
  const canGenerate = sliderEnabled;
  const canDownloadPdf = Boolean(puzzle);
  const showBuilder = entries.length > 0;
  const showResultsPanel = showBuilder;
  const gridRows = puzzle?.grid.length || 0;
  const gridCols = puzzle?.grid[0]?.length || 0;
  const filledCells = puzzle ? puzzle.grid.flat().filter(Boolean).length : 0;
  const gridSummary = puzzle
    ? [
        { label: "Grid", value: `${gridRows}×${gridCols}` },
        { label: "Words", value: `${puzzle.requestedCount}` },
        { label: "Letters", value: `${filledCells}` },
      ]
    : [
        { label: "Grid", value: "Awaiting" },
        { label: "Words", value: "—" },
        { label: "Letters", value: "—" },
      ];

  const statusClass = useMemo(() => {
    if (!status) return "";
    return statusError ? "is-error" : "";
  }, [status, statusError]);

  const placementLookup = useMemo(() => {
    if (!puzzle?.placements?.length) {
      return { cellMap: {}, clueMap: new Map() };
    }
    const cellMap = {};
    const clueMap = new Map();
    puzzle.placements.forEach((placement) => {
      const { direction, row, col, word, number } = placement;
      if (Number.isFinite(number)) {
        clueMap.set(`${direction}:${number}`, placement);
      }
      for (let i = 0; i < word.length; i += 1) {
        const cellRow = direction === "down" ? row + i : row;
        const cellCol = direction === "across" ? col + i : col;
        const key = `${cellRow}-${cellCol}`;
        if (!cellMap[key]) {
          cellMap[key] = {};
        }
        cellMap[key][direction] = placement;
      }
    });
    return { cellMap, clueMap };
  }, [puzzle]);

  const activeCellKey = activeCell ? `${activeCell.row}-${activeCell.col}` : null;

  const activePlacement = useMemo(() => {
    if (!activeCellKey) return null;
    const placementOptions = placementLookup.cellMap[activeCellKey];
    if (!placementOptions) return null;
    return placementOptions[activeDirection] || placementOptions.across || placementOptions.down || null;
  }, [activeCellKey, activeDirection, placementLookup]);

  const highlightedCells = useMemo(() => {
    if (!activePlacement) return new Set();
    const set = new Set();
    for (let i = 0; i < activePlacement.word.length; i += 1) {
      const row = activePlacement.row + (activePlacement.direction === "down" ? i : 0);
      const col = activePlacement.col + (activePlacement.direction === "across" ? i : 0);
      set.add(`${row}-${col}`);
    }
    return set;
  }, [activePlacement]);

  const activeClueKey = activePlacement ? `${activePlacement.direction}:${activePlacement.number}` : null;
  const canToggleDirection =
    Boolean(activeCellKey) &&
    Boolean(placementLookup.cellMap[activeCellKey]?.across && placementLookup.cellMap[activeCellKey]?.down);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    if (!respectSystem) {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
      } catch {
        // ignore
      }
    } else {
      try {
        localStorage.removeItem(THEME_STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  }, [theme, respectSystem]);

  useEffect(() => {
    if (typeof window === "undefined" || !respectSystem) {
      return undefined;
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (event) => {
      setTheme(event.matches ? "dark" : "light");
    };
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handler);
    } else if (typeof media.addListener === "function") {
      media.addListener(handler);
    }
    return () => {
      if (typeof media.removeEventListener === "function") {
        media.removeEventListener("change", handler);
      } else if (typeof media.removeListener === "function") {
        media.removeListener(handler);
      }
    };
  }, [respectSystem]);

  useEffect(() => {
    setWordCount((prev) => {
      const next = Math.min(Math.max(prev, MIN_WORDS), sliderMax || MIN_WORDS);
      return Number.isNaN(next) ? MIN_WORDS : next;
    });
  }, [sliderMax]);

  useEffect(() => {
    setCellValues({});
    setActiveCell(null);
  }, [puzzle]);

  useEffect(() => {
    const worker = new Worker(new URL("./workers/crosswordWorker.js", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;

    worker.onmessage = (event) => {
      const { type, puzzle: puzzleData, message } = event.data || {};

      if (type === "progress" && message) {
        setGenerationSteps((prev) => {
          const lastStep = prev[prev.length - 1];
          if (lastStep === message) {
            return prev;
          }
          return [message];
        });
        return;
      }

      setIsGenerating(false);
      setGenerationSteps([]);

      if (type === "success" && puzzleData) {
        setPuzzle(puzzleData);
        setShowAnswers(false);
        setActiveCell(null);
        setActiveDirection("across");
        setStatus(`${puzzleData.requestedCount} words placed on a ${puzzleData.rows}×${puzzleData.cols} grid.`);
        setStatusError(false);
      } else {
        setStatus(message || "Unable to generate crossword.");
        setStatusError(true);
      }
    };

    worker.onerror = () => {
      setIsGenerating(false);
      setGenerationSteps([]);
      setStatus("Generation failed due to an unexpected error.");
      setStatusError(true);
    };

    return () => {
      worker.terminate();
    };
  }, []);

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const normalized = normalizeEntries(parsed);
      setEntries(normalized);
      setPuzzle(null);
      setShowAnswers(false);
      setCellValues({});
      setStatus(
        normalized.length >= MIN_WORDS
          ? `Loaded ${normalized.length} entries. Choose up to ${Math.min(MAX_WORDS, normalized.length)} words.`
          : `Loaded ${normalized.length} entries. Need ${MIN_WORDS - normalized.length} more to generate.`,
      );
      setStatusError(false);
    } catch (error) {
      setEntries([]);
      setPuzzle(null);
      setShowAnswers(false);
      setCellValues({});
      setStatus(error.message || "Invalid JSON file.");
      setStatusError(true);
    }
  };

  const handleGenerate = () => {
    if (!workerRef.current) {
      setStatus("Puzzle generator not ready. Please try again.");
      setStatusError(true);
      return;
    }
    setIsGenerating(true);
    setStatus("Generating crossword...");
    setStatusError(false);
    setShowAnswers(false);
    setGenerationSteps(["Starting puzzle generation…"]);
    workerRef.current.postMessage({ entries, wordCount });
  };

  const handleDownloadPdf = async () => {
    if (!puzzle) {
      setStatus("Generate a crossword before exporting.");
      setStatusError(true);
      return;
    }

    try {
      setStatus("Preparing PDF...");
      setStatusError(false);
      const { jsPDF } = await import("jspdf");

      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const margin = 12;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const rows = puzzle.grid.length;
      const cols = puzzle.grid[0]?.length || 0;
      if (cols === 0) {
        setStatus("No grid data available to export.");
        setStatusError(true);
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

      drawGridOnPdf(doc, puzzle, startX, currentY, cellSize);
      currentY += rows * cellSize + 8;

      doc.setFontSize(12);
      const afterAcross = writeClueSection(
        doc,
        "Across",
        puzzle.acrossClues,
        margin,
        pageWidth,
        pageHeight,
        currentY,
      );
      writeClueSection(
        doc,
        "Down",
        puzzle.downClues,
        margin,
        pageWidth,
        pageHeight,
        afterAcross + 2,
      );

      doc.save("crossword.pdf");
      setStatus("PDF downloaded.");
    } catch (error) {
      setStatus(error?.message || "Unable to prepare PDF.");
      setStatusError(true);
    }
  };

  const applyThemeChoice = (value) => {
    if (value === "system") {
      setRespectSystem(true);
      setTheme(getSystemTheme());
    } else {
      setRespectSystem(false);
      setTheme(value);
    }
  };

  const handleCellInput = (row, col, value) => {
    const key = `${row}-${col}`;
    const sanitized = value.toUpperCase().replace(/[^A-Z]/g, "");
    const nextChar = sanitized.slice(-1);
    setCellValues((prev) => ({ ...prev, [key]: nextChar }));

    if (!nextChar || showAnswers) {
      return;
    }

    const placementOptions = placementLookup.cellMap[key];
    if (!placementOptions) return;

    let direction = activeDirection;
    if (!placementOptions[direction]) {
      direction = placementOptions.across ? "across" : placementOptions.down ? "down" : null;
    }
    const placement = direction ? placementOptions[direction] : null;
    if (!placement) return;

    const index = direction === "across" ? col - placement.col : row - placement.row;
    if (index >= placement.word.length - 1) {
      return;
    }

    const nextRow = direction === "across" ? row : row + 1;
    const nextCol = direction === "across" ? col + 1 : col;
    setActiveCell({ row: nextRow, col: nextCol });
    setActiveDirection(direction);
  };

  const handleCellSelect = (row, col, options = {}) => {
    if (!puzzle) return;
    const key = `${row}-${col}`;
    const placementOptions = placementLookup.cellMap[key];
    if (!placementOptions) return;

    const isSameCell = activeCell?.row === row && activeCell?.col === col;
    const shouldToggle = Boolean(options.toggleDirection) || (isSameCell && placementOptions.across && placementOptions.down);

    let nextDirection = activeDirection;
    if (shouldToggle) {
      if (nextDirection === "across" && placementOptions.down) {
        nextDirection = "down";
      } else if (nextDirection === "down" && placementOptions.across) {
        nextDirection = "across";
      }
    }

    if (!placementOptions[nextDirection]) {
      nextDirection = placementOptions.across ? "across" : "down";
    }

    setActiveCell({ row, col });
    setActiveDirection(nextDirection);
  };

  const handleClueSelect = (direction, number) => {
    if (!puzzle) return;
    const placement = placementLookup.clueMap.get(`${direction}:${number}`);
    if (!placement) return;
    setActiveCell({ row: placement.row, col: placement.col });
    setActiveDirection(direction);
  };

  const handleToggleDirection = () => {
    if (!activeCell) return;
    handleCellSelect(activeCell.row, activeCell.col, { toggleDirection: true });
  };

  const resetFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleResetAll = () => {
    setEntries([]);
    setPuzzle(null);
    setShowAnswers(false);
    setCellValues({});
    setStatus("");
    setStatusError(false);
    resetFileInput();
  };
  return (
    <main className={`app-shell ${showBuilder ? "mode-builder" : "mode-upload"}`}>
      <header className="app-header">
        <div className="brand">
          <span className="logo-grid" aria-hidden="true">
            <span className="logo-cell" />
            <span className="logo-cell" />
            <span className="logo-cell" />
          </span>
          <p>Crossword Studio</p>
        </div>
        <label className="theme-select">
          <span className="sr-only">Theme</span>
          <select
            value={respectSystem ? "system" : theme}
            onChange={(event) => applyThemeChoice(event.target.value)}
          >
            <option value="dark">Dark mode</option>
            <option value="light">Light mode</option>
            <option value="system">System</option>
          </select>
        </label>
      </header>

      {!showBuilder ? (
        <section className="panel upload-only" aria-label="Upload word list">

          <input
            ref={fileInputRef}
            type="file"
            id="wordFile"
            accept="application/json"
            onChange={handleFileChange}
            className="input-hidden"
          />
          <label htmlFor="wordFile" className="upload-zone full">
            <div className="upload-illustration" aria-hidden="true">
              <span className="upload-dot" />
              <span className="upload-dot" />
              <span className="upload-dot" />
            </div>
            <div>
              <strong>Drag & drop or click to upload</strong>
              <p>Accepts .json files.</p>
            </div>
          </label>

          {status ? (
            <div id="statusMessage" role="status" className={`status-callout compact ${statusClass}`}>
              <p>{status}</p>
            </div>
          ) : (
            <p className="upload-tip">Upload a JSON file to get started.</p>
          )}
        </section>
      ) : (
        <>
          <section className="panel builder-controls" aria-label="Crossword setup">
            <div className="builder-header">
              <div>
                <p className="section-label">Word list</p>
                <p className="entry-count">{entries.length} entries</p>
              </div>
              <button type="button" className="text-button" onClick={handleResetAll}>
                Upload new file
              </button>
            </div>

            <div className="slider-field condensed">
              <div className="slider-inline">
                <span>Words in grid</span>
                <strong>{wordCount}</strong>
              </div>
              <input
                type="range"
                min={MIN_WORDS}
                max={sliderMax}
                value={wordCount}
                onChange={(event) => setWordCount(Number(event.target.value))}
                disabled={!sliderEnabled}
                id="wordCount"
              />
            </div>

            <div className="actions compact builder-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canGenerate || isGenerating}
                onClick={handleGenerate}
                aria-busy={isGenerating}
              >
                {isGenerating ? "Generating…" : "Generate"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!canDownloadPdf || isGenerating}
                onClick={handleDownloadPdf}
              >
                Print PDF
              </button>
              <button type="button" className="btn btn-tertiary" onClick={handleResetAll}>
                Reset
              </button>
            </div>
            {status ? (
              <p role="status" className={`builder-status ${statusClass}`}>
                {status}
              </p>
            ) : null}
          </section>

          {showResultsPanel ? (
            <section className="panel results" aria-live="polite">
              <div className="flow-header results-header">
                <div>
                  <p className="section-label">Preview</p>
                  <h2>Puzzle &amp; clues</h2>
                  <p className="muted">
                    {puzzle ? "Adjust above and regenerate anytime." : "Generate to preview the crossword."}
                  </p>
                </div>
                <div className="results-tools">
                  {puzzle ? (
                    <dl>
                      {gridSummary.map((item) => (
                        <div key={item.label}>
                          <dt>{item.label}</dt>
                          <dd>{item.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  <label className={`switch ${!puzzle ? "is-disabled" : ""}`}>
                    <input
                      type="checkbox"
                      checked={showAnswers}
                      onChange={(event) => setShowAnswers(event.target.checked)}
                      disabled={!puzzle}
                    />
                    <span className="switch-handle" aria-hidden="true" />
                    <span className="switch-label">Reveal</span>
                  </label>
                </div>
              </div>

              <div className="results-body">
                <div className="grid-column">
                  <div className="grid-toolbar">
                    {activePlacement ? (
                      <div className="active-clue-card">
                        <div className="active-clue-meta">
                          <span className={`direction-pill direction-${activePlacement.direction}`}>
                            {activePlacement.direction === "across" ? "Across" : "Down"}
                          </span>
                          <span className="active-clue-number">{activePlacement.number}</span>
                        </div>
                        <p className="active-clue-text">{activePlacement.clue}</p>
                        <div className="active-clue-actions">
                          <span className="clue-length">{activePlacement.word.length} letters</span>
                          <button
                            type="button"
                            className="text-button"
                            onClick={handleToggleDirection}
                            disabled={!canToggleDirection}
                          >
                            Switch direction
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="active-clue-placeholder">Tap a cell or clue to start solving.</p>
                    )}
                  </div>

                  <div id="gridWrapper" aria-busy={isGenerating}>
                    {isGenerating ? <LoadingState steps={generationSteps} /> : null}
                    {puzzle ? (
                      <CrosswordGrid
                        grid={puzzle.grid}
                        numbersMap={puzzle.numbersMap}
                        showAnswers={showAnswers}
                        cellValues={cellValues}
                        onCellChange={handleCellInput}
                        onCellSelect={handleCellSelect}
                        activeCell={activeCell}
                        activeDirection={activeDirection}
                        highlightedCells={highlightedCells}
                      />
                    ) : (
                      <EmptyState />
                    )}
                  </div>
                </div>
                <div className="clues-stack">
                  {puzzle ? (
                    <div className="clue-columns">
                      <ClueList
                        title="Across"
                        direction="across"
                        clues={puzzle?.acrossClues || []}
                        activeClueKey={activeClueKey}
                        onSelectClue={handleClueSelect}
                      />
                      <ClueList
                        title="Down"
                        direction="down"
                        clues={puzzle?.downClues || []}
                        activeClueKey={activeClueKey}
                        onSelectClue={handleClueSelect}
                      />
                    </div>
                  ) : (
                    <div className="empty-clues">
                      <p>Clues unlock right after generation.</p>
                    </div>
                  )}
                </div>
              </div>
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}

function CrosswordGrid({
  grid,
  numbersMap,
  showAnswers,
  cellValues,
  onCellChange,
  onCellSelect,
  activeCell,
  activeDirection,
  highlightedCells = new Set(),
}) {
  const cols = grid[0]?.length || 0;
  const gridRef = useRef(null);
  const [cellSize, setCellSize] = useState(36);

  useEffect(() => {
    const updateSize = () => {
      if (!gridRef.current || !cols) {
        return;
      }
      const padding = 32; // matches the 1.25rem padding inside the grid
      const gap = 6;
      const width = gridRef.current.clientWidth - padding;
      if (width <= 0) return;
      const available = width - gap * Math.max(cols - 1, 0);
      const computed = Math.floor(available / cols);
      const next = Math.max(20, Math.min(36, computed));
      setCellSize(next);
    };

    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, [cols]);

  useEffect(() => {
    if (!gridRef.current || !activeCell || showAnswers) {
      return;
    }
    const key = `${activeCell.row}-${activeCell.col}`;
    const input = gridRef.current.querySelector(`input[data-cell="${key}"]`);
    if (input && document.activeElement !== input) {
      input.focus();
      input.select();
    }
  }, [activeCell, showAnswers]);

  const handleSelection = (row, col, options = {}) => {
    if (typeof onCellSelect === "function") {
      onCellSelect(row, col, options);
    }
  };

  return (
    <div
      ref={gridRef}
      id="crosswordGrid"
      className={`crossword-grid ${showAnswers ? "reveal" : ""} ${
        activeDirection ? `direction-${activeDirection}` : ""
      }`}
      style={{ "--cols": cols, "--cell-size": `${cellSize}px` }}
    >
      {grid.map((row, rowIndex) =>
        row.map((value, colIndex) => {
          const key = `${rowIndex}-${colIndex}`;
          const number = numbersMap[rowIndex]?.[colIndex];
          if (value) {
            const isActive = activeCell?.row === rowIndex && activeCell?.col === colIndex;
            const isHighlighted = highlightedCells.has(key);
            const cellClassNames = [
              "cell",
              isHighlighted ? "is-highlighted" : "",
              isActive ? "is-active" : "",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <div key={key} className={cellClassNames}>
                {number ? <span className="number">{number}</span> : null}
                <input
                  className="cell-input"
                  type="text"
                  maxLength={1}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  inputMode="latin"
                  data-cell={key}
                  value={showAnswers ? value : cellValues[key] || ""}
                  onChange={(event) => onCellChange(rowIndex, colIndex, event.target.value)}
                  onFocus={(event) => {
                    event.target.select();
                    handleSelection(rowIndex, colIndex);
                  }}
                  onClick={(event) =>
                    handleSelection(rowIndex, colIndex, { toggleDirection: event.detail > 1 })
                  }
                  disabled={showAnswers}
                />
                <span className="letter" aria-hidden="true">
                  {value}
                </span>
              </div>
            );
          }
          return (
            <div key={key} className="cell filled">
              {number ? <span className="number">{number}</span> : null}
            </div>
          );
        }),
      )}
    </div>
  );
}

function ClueList({ title, clues, direction, activeClueKey, onSelectClue }) {
  if (!clues.length) {
    return (
      <div className="clue-group is-empty">
        <div className="clue-group__header">
          <span className="clue-title">{title}</span>
          <span className="pill">0</span>
        </div>
        <p className="hint">Clues unlock after generating.</p>
      </div>
    );
  }

  return (
    <div className="clue-group">
      <div className="clue-group__header">
        <span className="clue-title">{title}</span>
        <span className="pill">{clues.length}</span>
      </div>
      <div className="clue-list">
        {clues.map((clue) => {
          const clueKey = `${direction}:${clue.number}`;
          const isActive = clueKey === activeClueKey;
          return (
            <button
              key={clue.number}
              type="button"
              className={`clue-item ${isActive ? "is-active" : ""}`}
              onClick={() => onSelectClue?.(direction, clue.number)}
            >
              <span className="clue-number">{clue.number}</span>
              <div className="clue-copy">
                <span>{clue.clue}</span>
                <span className="clue-length">{clue.answerLength} letters</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <div>
        <p className="empty-eyebrow">Waiting for a crossword</p>
        <p>Upload entries, set a count, and tap Generate to preview the grid.</p>
      </div>
    </div>
  );
}

function LoadingState({ steps }) {
  const latest = steps?.[steps.length - 1] || "";
  const progress = parseProgress(latest);
  const percent = progress ? Math.round((progress.current / progress.total) * 100) : null;
  return (
    <div className="generation-indicator" role="status" aria-live="polite">
      <div className="generation-card">
        <div className="generation-headline">
          <span className="spinner" aria-hidden="true" />
          <div>
            <p className="generation-title">Generating puzzle…</p>
            {latest ? <p className="generation-note">{latest}</p> : null}
          </div>
        </div>
        {progress ? (
          <div className="generation-progress">
            <div className="progress-bar" aria-hidden="true">
              <span style={{ width: `${percent}%` }} />
            </div>
            <p className="progress-label">
              {progress.current} / {progress.total}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function parseProgress(step) {
  if (!step) return null;
  const match = step.match(/(\d+)\s*of\s*(\d+)/i);
  if (!match) return null;
  const current = Number(match[1]);
  const total = Number(match[2]);
  if (Number.isNaN(current) || Number.isNaN(total) || total <= 0) {
    return null;
  }
  return { current, total };
}

function drawGridOnPdf(doc, puzzle, startX, startY, cellSize) {
  doc.setDrawColor(30, 32, 45);
  doc.setLineWidth(0.2);
  const rows = puzzle.grid.length;
  const cols = puzzle.grid[0]?.length || 0;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = startX + col * cellSize;
      const y = startY + row * cellSize;
      if (!puzzle.grid[row][col]) {
        doc.setDrawColor(180, 185, 205);
        doc.setFillColor(247, 249, 255);
        doc.rect(x, y, cellSize, cellSize, "FD");
        doc.setDrawColor(30, 32, 45);
      } else {
        doc.rect(x, y, cellSize, cellSize);
        const number = puzzle.numbersMap[row]?.[col];
        if (number) {
          doc.setFontSize(8);
          doc.text(String(number), x + 1.4, y + 2.6);
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
