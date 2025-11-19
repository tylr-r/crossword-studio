import { describe, expect, it, vi } from 'vitest';
import { createPuzzle, MIN_WORDS, normalizeEntries } from './crossword';

describe('normalizeEntries', () => {
  it('should normalize valid entries', () => {
    const input = [
      { word: 'HELLO', clue: 'Greeting' },
      { word: 'world', clue: 'Planet ' },
    ];
    const expected = [
      { word: 'HELLO', clue: 'Greeting', originalIndex: 0 },
      { word: 'WORLD', clue: 'Planet', originalIndex: 1 },
    ];
    expect(normalizeEntries(input)).toEqual(expected);
  });

  it('should throw error if all entries are invalid', () => {
    const input = [
      { word: 'A', clue: 'Too short' }, // Too short
      { word: 'GOOD', clue: '' }, // No clue
      null, // Null item
      { word: '123', clue: 'Numbers' }, // Invalid characters
    ];
    expect(() => normalizeEntries(input)).toThrow(/No valid {word, clue} pairs/);
  });

  it('should throw error for empty input', () => {
    expect(() => normalizeEntries([])).toThrow(/No valid {word, clue} pairs/);
  });

  it('should throw error for non-array input', () => {
    expect(() => normalizeEntries('invalid')).toThrow(/must contain an array/);
  });
});

describe('createPuzzle', () => {
  const validEntries = Array.from({ length: 10 }, (_, i) => ({
    word: `TEST${i}`,
    clue: `Clue ${i}`,
    originalIndex: i,
  }));

  it('should throw error if entries are not loaded', () => {
    expect(() => createPuzzle([], 5)).toThrow(/Load a JSON file/);
  });

  it('should throw error if requested count is too low', () => {
    expect(() => createPuzzle(validEntries, MIN_WORDS - 1)).toThrow(/Please select at least/);
  });

  it('should throw error if requested count is more than available', () => {
    expect(() => createPuzzle(validEntries, 15)).toThrow(/Not enough words/);
  });

  it('should generate a puzzle with valid layout', () => {
    const result = createPuzzle(validEntries, 5);
    expect(result).toHaveProperty('grid');
    expect(result).toHaveProperty('placements');
    expect(result.placements.length).toBeLessThanOrEqual(5);
    expect(result.grid.length).toBeGreaterThan(0);
  });

  it('should call onProgress callback', () => {
    const onProgress = vi.fn();
    createPuzzle(validEntries, 5, { onProgress });
    expect(onProgress).toHaveBeenCalled();
  });
});
