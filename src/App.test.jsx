import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders the title', () => {
    render(<App />);
    // Adjust the text matcher based on actual content if needed
    // Assuming "Crossword" is in the title or header
    const titleElements = screen.getAllByText(/Crossword/i);
    expect(titleElements.length).toBeGreaterThan(0);
  });
});
