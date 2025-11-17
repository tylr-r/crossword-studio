import { MAX_WORDS, MIN_WORDS, normalizeEntries } from "./crossword";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/responses";
const DEFAULT_TARGET_WORDS = 20;

export async function generateWordListFromTheme(theme, options = {}) {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Set VITE_OPENAI_API_KEY in your environment to enable AI word generation.");
  }

  const sanitizedTheme = theme?.trim();
  if (!sanitizedTheme) {
    throw new Error("Enter a theme or subject before generating words.");
  }

  const requestedCount = clampCount(options.count ?? DEFAULT_TARGET_WORDS);
  const payload = {
    model: "gpt-5.1",
    temperature: 0.4,
    input: buildPrompt(sanitizedTheme, requestedCount),
    max_output_tokens: 2000,
  };

  const response = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = `OpenAI request failed with status ${response.status}.`;
    try {
      const errorBody = await response.json();
      if (errorBody?.error?.message) {
        message = errorBody.error.message;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const data = await response.json();
  const textOutput = extractTextFromResponse(data);
  const parsed = parseEntriesFromText(textOutput);
  const normalized = normalizeEntries(parsed);

  if (normalized.length < MIN_WORDS) {
    throw new Error(`The AI response only produced ${normalized.length} usable entries. Try again.`);
  }

  return normalized;
}

function clampCount(value) {
  if (!Number.isFinite(value)) return DEFAULT_TARGET_WORDS;
  return Math.max(MIN_WORDS, Math.min(MAX_WORDS, Math.round(value)));
}

function buildPrompt(theme, count) {
  return [
    "You help people build crossword puzzles.",
    `Create ${count} diverse crossword entries for the theme "${theme}".`,
    "Reply with JSON only. Format: [{\"word\":\"APPLE\",\"clue\":\"Keeps doctors away\"}, …].",
    "Rules:",
    "- Each word must be 3-12 letters using only A-Z characters; uppercase preferred.",
    "- Each clue should be a brief, human-friendly phrase (4-10 words).",
    "- Avoid duplicate words and keep clues specific to the theme.",
  ].join("\n");
}

function extractTextFromResponse(data) {
  if (Array.isArray(data?.output_text) && data.output_text.length) {
    return data.output_text.join("\n");
  }

  if (Array.isArray(data?.output)) {
    const textPieces = data.output
      .flatMap((item) => item?.content ?? [])
      .map((content) => content?.text ?? "")
      .filter(Boolean);
    if (textPieces.length) {
      return textPieces.join("\n");
    }
  }

  if (Array.isArray(data?.choices)) {
    const choiceText = data.choices
      .map((choice) => choice?.message?.content)
      .filter(Boolean)
      .join("\n");
    if (choiceText) {
      return choiceText;
    }
  }

  throw new Error("OpenAI response did not contain any text output.");
}

function parseEntriesFromText(text) {
  if (!text) {
    throw new Error("Received an empty response from the AI service.");
  }

  const trimmed = text.trim();
  const asJson = tryParseJson(trimmed);
  if (asJson) {
    return asJson;
  }

  const fenceMatch = trimmed.match(/```(?:json)?([\s\S]*?)```/i);
  if (fenceMatch) {
    const fenced = fenceMatch[1].trim();
    const parsedFence = tryParseJson(fenced);
    if (parsedFence) {
      return parsedFence;
    }
  }

  const firstBracket = trimmed.indexOf("[");
  const lastBracket = trimmed.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    const sliced = trimmed.slice(firstBracket, lastBracket + 1);
    const parsedSlice = tryParseJson(sliced);
    if (parsedSlice) {
      return parsedSlice;
    }
  }

  throw new Error("Unable to parse AI response. Please try again.");
}

function tryParseJson(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
