import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { normalizeEntries, MAX_WORDS, MIN_WORDS } from "./lib/crossword";

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

function getInitialTheme() {
  const stored = getStoredTheme();
  if (stored) {
    return stored;
  }
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

export default function App() {
  const [entries, setEntries] = useState([]);
  const [wordCount, setWordCount] = useState(10);
  const [puzzle, setPuzzle] = useState(null);
  const [status, setStatus] = useState("");
  const [statusError, setStatusError] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  const [cellValues, setCellValues] = useState({});
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
  const hasUpload = entries.length > 0;
  const showResultsPanel = hasUpload;
  const entryPreview = entries.slice(0, 3);
  const sampleWords = entryPreview
    .map((entry) => entry.word)
    .filter(Boolean)
    .join(" • ");
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

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    if (!respectSystem) {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
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
          const next = [...prev, message];
          return next.slice(-5);
        });
        return;
      }

      setIsGenerating(false);
      setGenerationSteps([]);

      if (type === "success" && puzzleData) {
        setPuzzle(puzzleData);
        setShowAnswers(false);
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

  const toggleTheme = () => {
    setRespectSystem(false);
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  const handleCellChange = (key, value) => {
    const sanitized = value.toUpperCase().replace(/[^A-Z]/g, "");
    const next = sanitized.slice(-1);
    setCellValues((prev) => ({ ...prev, [key]: next }));
  };

  const resetFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };
  return (
    <main className="app-shell">
      <header className="hero">
        <div className="hero__copy">
          <p className="eyebrow">Crossword studio</p>
          <h1>Build calm crosswords from your own list.</h1>
          <p>Upload JSON, pick a word count, and download a clean printable grid.</p>
        </div>
        <div className="hero__actions">
          <button
            type="button"
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            className={`theme-toggle ${theme === "dark" ? "is-dark" : ""}`}
            onClick={toggleTheme}
          >
            <span className="theme-toggle__icon" aria-hidden="true">
              {theme === "dark" ? "☾" : "☀"}
            </span>
            <span className="theme-toggle__label">{theme === "dark" ? "Light" : "Dark"} mode</span>
          </button>
        </div>
      </header>

      <section className="panel setup-card" aria-label="Crossword setup">
        <div className="flow-header">
          <span className="step-badge" aria-hidden="true">
            1
          </span>
          <div>
            <h2>Upload words</h2>
            <p className="muted">JSON array with simple word and clue pairs.</p>
          </div>
          {hasUpload ? (
            <button type="button" className="text-button" onClick={resetFileInput}>
              Clear
            </button>
          ) : null}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          id="wordFile"
          accept="application/json"
          onChange={handleFileChange}
          className="input-hidden"
        />
        <label htmlFor="wordFile" className="upload-zone">
          <div className="upload-illustration" aria-hidden="true">
            <span className="upload-dot" />
            <span className="upload-dot" />
            <span className="upload-dot" />
          </div>
          <div>
            <strong>{entries.length ? "Replace file" : "Drag & drop JSON"}</strong>
            <p>{entries.length ? "Use a different list anytime." : "Or click to pick a file."}</p>
          </div>
        </label>

        <div className="setup-meta">
          <div>
            <p className="summary-label">Entries</p>
            <p className="summary-value">{entries.length || 0}</p>
          </div>
          <div>
            <p className="summary-label">Sample</p>
            <p className="summary-value">{sampleWords || "—"}</p>
          </div>
        </div>

        {hasUpload ? (
          <>
            <div className="slider-field simple">
              <div className="label-row">
                <p className="summary-label">Words in grid</p>
                <p className="slider-value">{wordCount}</p>
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
            <div className="actions">
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
                Download PDF
              </button>
            </div>
          </>
        ) : (
          <p className="setup-hint">Add at least {MIN_WORDS} entries to unlock the builder.</p>
        )}

        {status ? (
          <div id="statusMessage" role="status" className={`status-callout compact ${statusClass}`}>
            <p>{status}</p>
          </div>
        ) : null}
      </section>

      {showResultsPanel ? (
        <section className="panel results" aria-live="polite">
          <div className="flow-header">
            <span className="step-badge" aria-hidden="true">
              2
            </span>
            <div>
              <h2>Preview &amp; clues</h2>
              <p className="muted">{puzzle ? "Tweak inputs and regenerate anytime." : "Generate to see the grid."}</p>
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
            <div id="gridWrapper" aria-busy={isGenerating}>
              {isGenerating ? <LoadingState steps={generationSteps} /> : null}
              {puzzle ? (
                <CrosswordGrid
                  grid={puzzle.grid}
                  numbersMap={puzzle.numbersMap}
                  showAnswers={showAnswers}
                  cellValues={cellValues}
                  onCellChange={handleCellChange}
                />
              ) : (
                <EmptyState />
              )}
            </div>
            <div className="clues-stack">
              {puzzle ? (
                <div className="clue-columns">
                  <ClueList title="Across" clues={puzzle?.acrossClues || []} />
                  <ClueList title="Down" clues={puzzle?.downClues || []} />
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
    </main>
  );
}

function CrosswordGrid({ grid, numbersMap, showAnswers, cellValues, onCellChange }) {
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

  return (
    <div
      ref={gridRef}
      id="crosswordGrid"
      className={`crossword-grid ${showAnswers ? "reveal" : ""}`}
      style={{ "--cols": cols, "--cell-size": `${cellSize}px` }}
    >
      {grid.map((row, rowIndex) =>
        row.map((value, colIndex) => {
          const key = `${rowIndex}-${colIndex}`;
          const number = numbersMap[rowIndex]?.[colIndex];
          if (!value) {
            return (
              <div key={key} className="cell">
                {number ? <span className="number">{number}</span> : null}
              </div>
            );
          }
          return (
            <div key={key} className="cell filled">
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
                value={showAnswers ? value : cellValues[key] || ""}
                onChange={(event) => onCellChange(key, event.target.value)}
                onFocus={(event) => event.target.select()}
                disabled={showAnswers}
              />
              <span className="letter" aria-hidden="true">
                {value}
              </span>
            </div>
          );
        }),
      )}
    </div>
  );
}

function ClueList({ title, clues }) {
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
      <ol>
        {clues.map((clue) => (
          <li key={clue.number}>
            <span className="clue-number">{clue.number}</span>
            <div className="clue-copy">
              <span>{clue.clue}</span>
              <span className="clue-length">{clue.answerLength} letters</span>
            </div>
          </li>
        ))}
      </ol>
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
  const hasSteps = Boolean(steps?.length);
  const showList = hasSteps && steps.length > 1;
  return (
    <div className="generation-indicator" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <div>
        <p className="generation-title">Generating puzzle…</p>
        {showList ? (
          <ul className="generation-steps">
            {steps.map((step, index) => (
              <li key={`${step}-${index}`}>{step}</li>
            ))}
          </ul>
        ) : hasSteps ? (
          <p className="generation-single">{steps[0]}</p>
        ) : null}
      </div>
    </div>
  );
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
