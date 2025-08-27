# Trivia Show Mode – API & Data Contracts (Non-Negotiables)

These rules are **red-line requirements**. Code must not violate them.

---

## 1. fetchShowBundle.js

- Input: `(showId: string)`
- MAY also accept `roundId` but must function with only `showId`.
- MUST query Airtable for:
  - Show record (basic info).
  - ONLY rounds linked to that show (filter by Show = showId).
  - Questions, categories, images, audio for those rounds.
  - Teams and scores for that show.

- Response shape (exact):
  ```js
  {
    show,                   // Airtable show record
    Rounds: [               // Array of rounds for that show only
      {
        id,
        Round: {
          Round,            // Round name (e.g. "Round 1")
          Show,             // Linked show (must match showId)
          "Round order"
        }
      }
    ],
    groupedQuestions: {...}, // By category ID then question ID
    teams: [...],
    questions: [...],
    scores: [...]
  }
  ```
