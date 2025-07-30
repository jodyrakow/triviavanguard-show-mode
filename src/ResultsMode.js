import React from "react";

export default function ResultsMode({
  questions,
  selectedShowId,
  selectedRoundId,
}) {
  return (
    <div>
      <h3>Results Mode</h3>
      <p>Show ID: {selectedShowId}</p>
      <p>Round ID: {selectedRoundId}</p>
      <p>Total questions: {questions.length}</p>
      {/* More results display coming later */}
    </div>
  );
}
