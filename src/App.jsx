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
        setStatus(
          `Crossword generated with ${puzzleData.requestedCount} words on a ${puzzleData.rows}×${puzzleData.cols} grid.`,
        );
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
          : `Loaded ${normalized.length} entries. Add at least ${Math.max(
              MIN_WORDS - normalized.length,
              0,
            )} more to enable puzzle generation.`,
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
    <main className="page">
      <header className="page-header">
        <div>
          <h1>Crossword Builder</h1>
          <p>Create a printable crossword from your own word list.</p>
        </div>
        <button
          type="button"
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          className={`theme-toggle ${theme === "dark" ? "is-dark" : ""}`}
          onClick={toggleTheme}
        >
          <span className="theme-toggle__icon" aria-hidden="true">
            {theme === "dark" ? "☾" : "☀"}
          </span>
          <span className="theme-toggle__label">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
        </button>
      </header>

      <section className="card controls">
        <div className="field">
          <label htmlFor="wordFile">Word &amp; clue JSON</label>
          <input
            ref={fileInputRef}
            type="file"
            id="wordFile"
            accept="application/json"
            onChange={handleFileChange}
          />
          <p className="hint">
            Provide an array of &#123;"word": "...", "clue": "..."&#125; entries (see README).
          </p>
          <button type="button" className="link-button" onClick={resetFileInput}>
            Clear selection
          </button>
        </div>

        <div className="field slider-field">
          <div className="label-row">
            <label htmlFor="wordCount">Words in grid</label>
            <span id="wordCountValue">{wordCount}</span>
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

        <div className="field checkbox-field">
          <label className="checkbox">
            <input
              type="checkbox"
              id="showAnswers"
              checked={showAnswers}
              disabled={!puzzle}
              onChange={(event) => setShowAnswers(event.target.checked)}
            />
            <span>Show solutions</span>
          </label>
        </div>

        <div className="actions">
          <button
            type="button"
            disabled={!canGenerate || isGenerating}
            onClick={handleGenerate}
            aria-busy={isGenerating}
          >
            {isGenerating ? "Generating..." : "Generate Crossword"}
          </button>
          <button
            type="button"
            className="download-btn"
            disabled={!canDownloadPdf || isGenerating}
            onClick={handleDownloadPdf}
          >
            Download PDF
          </button>
        </div>
        {status && (
          <p id="statusMessage" role="status" className={statusClass}>
            {status}
          </p>
        )}
      </section>

      <section className="card puzzle" aria-live="polite">
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
        <div className="clues">
          <ClueList title="Across" clues={puzzle?.acrossClues || []} />
          <ClueList title="Down" clues={puzzle?.downClues || []} />
        </div>
      </section>
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
      const padding = 20; // padding: 10px on each side
      const gap = 4;
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
      <div>
        <h2>{title}</h2>
        <p className="hint">Upload a word list to see {title.toLowerCase()} clues.</p>
      </div>
    );
  }

  return (
    <div>
      <h2>{title}</h2>
      <ol>
        {clues.map((clue) => (
          <li key={clue.number}>
            <span className="clue-number">{clue.number}</span>
            <span>
              {clue.clue} ({clue.answerLength})
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <p>Load a JSON file to generate your crossword.</p>
    </div>
  );
}

function LoadingState({ steps }) {
  return (
    <div className="generation-indicator" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <div>
        <p className="generation-title">Generating puzzle…</p>
        {steps?.length ? (
          <ul className="generation-steps">
            {steps.map((step, index) => (
              <li key={`${step}-${index}`}>{step}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function drawGridOnPdf(doc, puzzle, startX, startY, cellSize) {
  doc.setDrawColor(0);
  doc.setLineWidth(0.2);
  const rows = puzzle.grid.length;
  const cols = puzzle.grid[0]?.length || 0;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = startX + col * cellSize;
      const y = startY + row * cellSize;
      if (!puzzle.grid[row][col]) {
        doc.setFillColor(10, 10, 18);
        doc.rect(x, y, cellSize, cellSize, "F");
      } else {
        doc.rect(x, y, cellSize, cellSize);
        const number = puzzle.numbersMap[row]?.[col];
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
