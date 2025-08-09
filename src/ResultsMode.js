// ResultsMode.js
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

export default function ResultsMode({ selectedShowId, selectedRoundId }) {
  const colors = { dark: "#2B394A", accent: "#DC6A24", bg: "#eef1f4" };

  const [teams, setTeams] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [scores, setScores] = useState([]); // [{ id, showTeamId, showQuestionId, isCorrect, effectivePoints, questionBonus }]

  const fetchAll = async () => {
    if (!selectedShowId || !selectedRoundId) return;
    const res = await axios.get("/.netlify/functions/fetchScores", {
      params: { showId: selectedShowId, roundId: selectedRoundId },
    });
    setTeams(res.data.teams || []);
    setQuestions(res.data.questions || []);
    setScores(res.data.scores || []);
  };

  useEffect(() => {
    fetchAll().catch(console.error);
  }, [selectedShowId, selectedRoundId]);

  const grid = useMemo(() => {
    const m = {};
    for (const s of scores) {
      if (!m[s.showQuestionId]) m[s.showQuestionId] = {};
      m[s.showQuestionId][s.showTeamId] = s;
    }
    return m;
  }, [scores]);

  const teamTotals = useMemo(() => {
    const totals = {};
    for (const t of teams) totals[t.showTeamId] = Number(t.showBonus || 0);
    for (const s of scores)
      totals[s.showTeamId] += Number(s.effectivePoints || 0);
    return totals;
  }, [teams, scores]);

  const leaderboard = useMemo(() => {
    return [...teams]
      .map((t) => ({ ...t, total: teamTotals[t.showTeamId] || 0 }))
      .sort(
        (a, b) => b.total - a.total || a.teamName.localeCompare(b.teamName)
      );
  }, [teams, teamTotals]);

  const questionStats = useMemo(() => {
    return questions.map((q) => {
      const row = grid[q.showQuestionId] || {};
      const correct = Object.values(row).filter(
        (cell) => cell.isCorrect
      ).length;
      return { order: q.order, text: q.text, correct };
    });
  }, [questions, grid]);

  const exportCSV = () => {
    const lbRows = [["Place", "Team", "Score"]];
    leaderboard.forEach((t, i) =>
      lbRows.push([String(i + 1), t.teamName, String(t.total)])
    );

    const qsRows = [["Q#", "Question", "# Correct"]];
    questionStats.forEach((q) =>
      qsRows.push([
        String(q.order ?? ""),
        (q.text || "").replace(/\n/g, " "),
        String(q.correct),
      ])
    );

    const out =
      "Leaderboard\n" +
      lbRows.map((r) => r.map(csv).join(",")).join("\n") +
      "\n\nQuestion Stats\n" +
      qsRows.map((r) => r.map(csv).join(",")).join("\n");

    const blob = new Blob([out], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "trivia_results.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    function csv(s) {
      const str = String(s ?? "");
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    }
  };

  if (!questions.length) {
    return (
      <div
        style={{
          background: "#fff",
          border: `1px solid ${colors.accent}`,
          borderRadius: "0.5rem",
          padding: "1rem",
          marginTop: "1rem",
          fontFamily: "Questrial, sans-serif",
          color: colors.dark,
        }}
      >
        Select a show/round to view results.
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: "1rem",
        fontFamily: "Questrial, sans-serif",
        color: colors.dark,
      }}
    >
      <div
        style={{
          backgroundColor: colors.dark,
          padding: "0.5rem 0",
          borderTop: `2px solid ${colors.accent}`,
          borderBottom: `2px solid ${colors.accent}`,
          marginBottom: "0.75rem",
        }}
      >
        <h2
          style={{
            color: colors.accent,
            fontFamily: "Antonio",
            fontSize: "1.6rem",
            margin: 0,
            textIndent: "0.5rem",
            letterSpacing: "0.015em",
          }}
        >
          Results & Leaderboard
        </h2>
      </div>

      {/* Leaderboard */}
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: "0.5rem",
          background: "#fff",
          overflow: "hidden",
          marginBottom: "1rem",
        }}
      >
        <div
          style={{
            background: colors.bg,
            padding: "0.5rem 0.75rem",
            borderBottom: "1px solid #ddd",
          }}
        >
          <strong>Leaderboard</strong>{" "}
          <span style={{ opacity: 0.75 }}>
            — totals from Airtable (Effective points + Show bonus)
          </span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr
              style={{ background: "#fafafa", borderBottom: "1px solid #eee" }}
            >
              <th style={{ textAlign: "left", padding: "0.5rem" }}>Place</th>
              <th style={{ textAlign: "left", padding: "0.5rem" }}>Team</th>
              <th style={{ textAlign: "right", padding: "0.5rem" }}>Score</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((t, i) => (
              <tr key={t.showTeamId} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "0.5rem" }}>{i + 1}</td>
                <td style={{ padding: "0.5rem" }}>{t.teamName}</td>
                <td
                  style={{
                    padding: "0.5rem",
                    textAlign: "right",
                    fontWeight: 700,
                  }}
                >
                  {t.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Question stats */}
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: "0.5rem",
          background: "#fff",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: colors.bg,
            padding: "0.5rem 0.75rem",
            borderBottom: "1px solid #ddd",
          }}
        >
          <strong>Question Stats</strong>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr
              style={{ background: "#fafafa", borderBottom: "1px solid #eee" }}
            >
              <th
                style={{ textAlign: "left", padding: "0.5rem", minWidth: 70 }}
              >
                Q#
              </th>
              <th style={{ textAlign: "left", padding: "0.5rem" }}>Question</th>
              <th
                style={{ textAlign: "right", padding: "0.5rem", minWidth: 120 }}
              >
                # Correct
              </th>
            </tr>
          </thead>
          <tbody>
            {questionStats.map((q, idx) => (
              <tr key={idx} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "0.5rem" }}>
                  <strong>{q.order}</strong>
                </td>
                <td
                  style={{
                    padding: "0.5rem",
                    maxWidth: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {q.text}
                </td>
                <td
                  style={{
                    padding: "0.5rem",
                    textAlign: "right",
                    fontWeight: 700,
                  }}
                >
                  {q.correct}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Controls */}
      <div style={{ marginTop: ".75rem", display: "flex", gap: ".5rem" }}>
        <button
          onClick={exportCSV}
          style={{
            padding: "0.5rem 1rem",
            border: `1px solid ${colors.accent}`,
            background: "#f0f0f0",
            color: colors.dark,
            borderRadius: "0.25rem",
            cursor: "pointer",
          }}
        >
          Export CSV
        </button>
        <button
          onClick={fetchAll}
          style={{
            padding: "0.5rem 1rem",
            border: `1px solid ${colors.accent}`,
            background: colors.accent,
            color: "#fff",
            borderRadius: "0.25rem",
            cursor: "pointer",
          }}
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
