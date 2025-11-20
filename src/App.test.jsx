import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

// Mock the AuthContext
vi.mock('./contexts/AuthContext', () => ({
  useAuth: () => ({
    currentUser: null,
    logout: vi.fn(),
    login: vi.fn(),
    signup: vi.fn(),
    googleLogin: vi.fn(),
  }),
}));

// Mock Firebase
vi.mock('./lib/firebase', () => ({
  auth: {},
  db: {},
}));

describe('App', () => {
  it('renders the title', () => {
    render(<App />);
    // Adjust the text matcher based on actual content if needed
    // Assuming "Crossword" is in the title or header
    const titleElements = screen.getAllByText(/Crossword/i);
    expect(titleElements.length).toBeGreaterThan(0);
  });
});
