# Crossword Studio

Crossword Studio is a modern, feature-rich web application for creating, playing, and sharing crossword puzzles. It combines a powerful client-side generator with AI-powered content creation and cloud persistence. This is a side project for me to experiment with 100% prompt driven development without manual code edits to see how far I can get and the current state of AI tools for web development.

## Features

*   **Multiple Word Sources**:
    *   **Upload JSON**: Bring your own curated list of `{ word, clue }` pairs.
    *   **AI Generation**: Describe a theme (e.g., "Space Exploration") and let the built-in AI assistant craft a custom word list for you.
*   **User Accounts**:
    *   Sign up with Email/Password or Google Sign-In.
    *   Secure authentication powered by Firebase.
*   **Cloud Library**:
    *   Save your favorite word lists to the cloud.
    *   Access your saved lists from any device.
*   **Interactive Builder**:
    *   Real-time grid generation.
    *   Adjustable word count (up to 25 words).
    *   Playable interactive grid with "Reveal" mode.
*   **Export**: Generate professional-looking PDFs for printing.
*   **Modern UI**: Fully responsive design with automatic Dark/Light mode support.

## Quick Start

### Prerequisites

*   Node.js installed.
*   A Firebase project (for Auth & Firestore).
*   An OpenAI API key (optional, for AI generation).

### Installation

1.  Install dependencies:
    ```bash
    npm install
    ```

2.  Configure environment variables:
    Create a `.env` file in the root directory with your keys:

    ```env
    # OpenAI (Optional - for AI word generation)
    VITE_OPENAI_API_KEY=your_openai_key_here

    # Firebase (Required - for Auth & Saving)
    VITE_FIREBASE_API_KEY=your_api_key
    VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
    VITE_FIREBASE_PROJECT_ID=your_project_id
    VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
    VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
    VITE_FIREBASE_APP_ID=your_app_id
    VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
    ```

3.  Start the development server:
    ```bash
    npm run dev
    ```

## Firebase Setup

To enable the full feature set:

1.  **Authentication**: Enable "Email/Password" and "Google" sign-in providers in the Firebase Console.
2.  **Firestore**: Create a Firestore database and deploy the security rules included in this project:
    ```bash
    npx firebase deploy --only firestore:rules
    ```

## JSON Format

If uploading your own list, use the following JSON format:

```json
[
  { "word": "seattle", "clue": "Emerald City" },
  { "word": "react", "clue": "A JavaScript library for building UIs" }
]
```

*   Minimum: 5 words
*   Maximum: 25 words (for best grid results)

## Tech Stack

*   **Frontend**: React, Vite
*   **Styling**: Vanilla CSS (Variables, Dark Mode)
*   **Backend**: Firebase (Auth, Firestore)
*   **AI**: OpenAI API
*   **Utilities**: jsPDF (Export), Playwright (E2E Testing), Vitest (Unit Testing)
