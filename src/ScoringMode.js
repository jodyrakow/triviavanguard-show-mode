import React from "react";

export default function ScoringMode({
  questions,
  selectedShowId,
  selectedRoundId,
}) {
  return (
    <div>
      <h3>Scoring Mode</h3>
      <p>Show ID: {selectedShowId}</p>
      <p>Round ID: {selectedRoundId}</p>
      <p>Total questions: {questions.length}</p>
      {/* More logic here later */}
    </div>
  );
}
