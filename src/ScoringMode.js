// ScoringMode.js
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import axios from "axios";

export default function ScoringMode({ selectedShowId, selectedRoundId }) {
  const colors = { dark: "#2B394A", accent: "#DC6A24", bg: "#eef1f4" };

  const [teams, setTeams] = useState([]); // [{showTeamId, teamId, teamName, showBonus}]
  const [questions, setQuestions] = useState([]); // [{showQuestionId, questionId, order, text}]
  const [grid, setGrid] = useState({}); // {[showTeamId]: {[showQuestionId]: {id,isCorrect,effectivePoints,questionBonus}}}
  const [focus, setFocus] = useState({ teamIdx: 0, qIdx: 0 });

  const [addingTeam, setAddingTeam] = useState(false);
  const [teamSearch, setTeamSearch] = useState("");
  const [teamMatches, setTeamMatches] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searching, setSearching] = useState(false);

  // Fetch (memoized to satisfy deps)
  const fetchAll = useCallback(async () => {
    if (!selectedShowId || !selectedRoundId) return;
    const res = await axios.get("/.netlify/functions/fetchScores", {
      params: { showId: selectedShowId, roundId: selectedRoundId },
    });

    const { teams, questions, scores } = res.data;

    const map = {};
    for (const s of scores) {
      if (!map[s.showTeamId]) map[s.showTeamId] = {};
      map[s.showTeamId][s.showQuestionId] = s;
    }
    setTeams(teams);
    setQuestions(questions);
    setGrid(map);
    setFocus({ teamIdx: 0, qIdx: 0 });
  }, [selectedShowId, selectedRoundId]);

  useEffect(() => {
    fetchAll().catch(console.error);
  }, [fetchAll]);

  // Derived totals from Effective points (+ Show bonus)
  const teamTotals = useMemo(() => {
    const totals = {};
    for (const t of teams) {
      let sum = Number(t.showBonus || 0);
      for (const q of questions) {
        const cell = grid[t.showTeamId]?.[q.showQuestionId];
        sum += Number(cell?.effectivePoints || 0);
      }
      totals[t.showTeamId] = sum;
    }

    return totals;
  }, [teams, questions, grid]);

  // Debounced patch queue
  const updateQueue = useRef({});
  const debounceTimer = useRef(null);
  const enqueue = (scoreId, patch) => {
    updateQueue.current[scoreId] = {
      ...(updateQueue.current[scoreId] || {}),
      ...patch,
    };
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(async () => {
      const batch = { ...updateQueue.current };
      updateQueue.current = {};
      for (const [scoreId, fields] of Object.entries(batch)) {
        try {
          await axios.post("/.netlify/functions/updateScore", {
            scoreId,
            ...fields,
          });
        } catch (e) {
          console.error("updateScore failed", scoreId, e);
        }
      }
      fetchAll().catch(console.error); // refresh after formulas run
    }, 180);
  };

  const updateShowBonus = async (showTeamId, value) => {
    const val = Number(value) || 0;
    setTeams((prev) =>
      prev.map((t) =>
        t.showTeamId === showTeamId ? { ...t, showBonus: val } : t
      )
    );
    try {
      await axios.post("/.netlify/functions/updateShowTeam", {
        showTeamId,
        showBonus: val,
      });
    } catch (e) {
      console.error("updateShowTeam failed", e);
    }
  };

  // Cell actions (memoized to satisfy deps)
  const toggleCell = useCallback(
    (ti, qi) => {
      const t = teams[ti],
        q = questions[qi];
      if (!t || !q) return;
      const cell = grid[t.showTeamId]?.[q.showQuestionId];

      if (!cell) return;

      const next = !cell.isCorrect; // optimistic
      setGrid((prev) => ({
        ...prev,
        [t.showTeamId]: {
          ...prev[t.showTeamId],
          [q.showQuestionId]: { ...cell, isCorrect: next },
        },
      }));
      enqueue(cell.id, { isCorrect: next });
    },
    [teams, questions, grid]
  );

  const setQuestionBonus = useCallback(
    (ti, qi, value) => {
      const t = teams[ti],
        q = questions[qi];
      const cell = grid[t.showTeamId]?.[q.showQuestionId];
      if (!cell) return;
      const val = Number(value) || 0;
      setGrid((prev) => ({
        ...prev,
        [t.showTeamId]: {
          ...prev[t.showTeamId],
          [q.showQuestionId]: { ...cell, questionBonus: val },
        },
      }));
      enqueue(cell.id, { questionBonus: val });
    },
    [teams, questions, grid]
  );

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e) => {
      // ignore shortcuts while modal open or user is typing
      if (addingTeam) return;
      const el = e.target;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      ) {
        return;
      }

      if (!teams.length || !questions.length) return;
      const { teamIdx, qIdx } = focus;

      if (e.key === "1" || e.key === " ") {
        e.preventDefault();
        toggleCell(teamIdx, qIdx);
      } else if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        setFocus(({ teamIdx, qIdx }) => ({
          teamIdx,
          qIdx: (qIdx + 1) % questions.length,
        }));
      } else if (e.key === "Tab" && e.shiftKey) {
        e.preventDefault();
        setFocus(({ teamIdx, qIdx }) => ({
          teamIdx,
          qIdx: (qIdx - 1 + questions.length) % questions.length,
        }));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setFocus(({ teamIdx, qIdx }) => ({
          teamIdx: Math.min(teamIdx + 1, teams.length - 1),
          qIdx,
        }));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setFocus(({ teamIdx, qIdx }) => ({
          teamIdx: Math.max(teamIdx - 1, 0),
          qIdx,
        }));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocus(({ teamIdx, qIdx }) => ({
          teamIdx,
          qIdx: Math.min(qIdx + 1, questions.length - 1),
        }));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocus(({ teamIdx, qIdx }) => ({
          teamIdx,
          qIdx: Math.max(qIdx - 1, 0),
        }));
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [teams, questions, focus, addingTeam, toggleCell]);

  // Add team flow
  const searchExactTeam = async () => {
    setHasSearched(true);
    setTeamMatches([]);
    if (!teamSearch.trim()) return;

    setSearching(true);
    try {
      const res = await axios.post("/.netlify/functions/addTeamToShow", {
        showId: selectedShowId,
        teamName: teamSearch.trim(),
      });
      setTeamMatches(res.data.matches || []);
    } catch (err) {
      console.error(
        "addTeamToShow search error:",
        err.response?.data || err.message
      );
      alert(`AddTeamToShow error: ${err.response?.data?.error || err.message}`);
    } finally {
      setSearching(false);
    }
  };

  const confirmTeam = async (chosenTeamId, createIfMissing = false) => {
    if (!selectedShowId) {
      alert("Pick a show first, then confirm a team.");
      return;
    }

    try {
      const res = await axios.post("/.netlify/functions/addTeamToShow", {
        showId: selectedShowId,
        teamName: teamSearch.trim(), // server uses canonical if chosenTeamId present
        chosenTeamId, // Airtable ID or null
        createIfMissing, // true only for “create new team”
      });

      const { showTeamId } = res.data;

      await axios.post("/.netlify/functions/ensureScoreRows", {
        showId: selectedShowId,
        roundId: selectedRoundId,
        showTeamId,
      });

      // Refresh UI from Airtable
      setAddingTeam(false);
      setTeamSearch("");
      setTeamMatches([]);
      setHasSearched(false);
      fetchAll().catch(console.error);
    } catch (e) {
      console.error(e);
      alert(e.response?.data?.error || "Failed to add team.");
    }
  };

  // Render
  return (
    <div
      style={{
        marginTop: "1rem",
        fontFamily: "Questrial, sans-serif",
        color: colors.dark,
      }}
    >
      {/* Header */}
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
          Live Scoring
        </h2>
      </div>

      {/* Top controls */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          alignItems: "center",
          marginBottom: "0.5rem",
        }}
      >
        <button
          onClick={() => setAddingTeam(true)}
          style={{
            padding: "0.4rem 0.75rem",
            border: `1px solid ${colors.accent}`,
            background: colors.accent,
            color: "#fff",
            borderRadius: "0.25rem",
            cursor: "pointer",
          }}
        >
          + Add team to this show
        </button>
        <div style={{ marginLeft: "auto" }}>
          <strong>Teams:</strong> {teams.length} &nbsp;|&nbsp;{" "}
          <strong>Questions:</strong> {questions.length} &nbsp;|&nbsp;
          <strong>Focus:</strong> {teams[focus.teamIdx]?.teamName || "-"} / Q
          {questions[focus.qIdx]?.order ?? "-"}
        </div>
      </div>

      {/* Grid */}
      <div
        style={{
          overflowX: "auto",
          background: "#fff",
          border: "1px solid #ddd",
          borderRadius: "0.5rem",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr
              style={{ background: colors.bg, borderBottom: "1px solid #ddd" }}
            >
              <th
                style={{ textAlign: "left", padding: "0.5rem", minWidth: 70 }}
              >
                Q#
              </th>
              <th style={{ textAlign: "left", padding: "0.5rem" }}>Question</th>
              {teams.map((t, ti) => (
                <th
                  key={t.showTeamId}
                  style={{
                    textAlign: "center",
                    padding: "0.5rem",
                    minWidth: 160,
                  }}
                >
                  <div>{t.teamName}</div>
                  <div style={{ fontSize: ".85rem", opacity: 0.8 }}>
                    Total: <strong>{teamTotals[t.showTeamId]}</strong>
                  </div>
                  <div style={{ marginTop: "0.25rem" }}>
                    <label style={{ fontSize: ".85rem" }}>
                      Show bonus:&nbsp;
                    </label>
                    <input
                      type="number"
                      value={t.showBonus ?? 0}
                      onChange={(e) =>
                        updateShowBonus(t.showTeamId, e.target.value)
                      }
                      style={{
                        width: 80,
                        textAlign: "center",
                        padding: "0.2rem",
                        border: "1px solid #ccc",
                        borderRadius: "0.25rem",
                      }}
                      title="Show-level bonus points"
                    />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {questions.map((q, qi) => (
              <tr
                key={q.showQuestionId}
                style={{ borderTop: "1px solid #eee" }}
              >
                <td style={{ padding: "0.5rem" }}>
                  <strong>{q.order}</strong>
                </td>
                <td
                  style={{
                    padding: "0.5rem",
                    maxWidth: 560,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {q.text}
                </td>
                {teams.map((t, ti) => {
                  const cell = grid[t.showTeamId]?.[q.showQuestionId];
                  const on = !!cell?.isCorrect;
                  const isFocus = ti === focus.teamIdx && qi === focus.qIdx;
                  return (
                    <td
                      key={t.showTeamId}
                      style={{ textAlign: "center", padding: "0.35rem" }}
                    >
                      <div>
                        <button
                          onClick={() => {
                            setFocus({ teamIdx: ti, qIdx: qi });
                            toggleCell(ti, qi);
                          }}
                          style={{
                            padding: ".35rem .65rem",
                            border: "1px solid #DC6A24",
                            borderRadius: "4px",
                            background: on ? "#DC6A24" : "#f0f0f0",
                            color: on ? "#fff" : "#2B394A",
                            outline: isFocus ? "2px solid #2B394A" : "none",
                            cursor: "pointer",
                            minWidth: 110,
                          }}
                          title="1/Space: toggle • Tab: next question"
                        >
                          {on ? "✓ Correct" : "○ Incorrect"}
                        </button>
                      </div>
                      <div style={{ marginTop: "0.3rem", fontSize: ".9rem" }}>
                        <label style={{ marginRight: 6 }}>Q bonus:</label>
                        <input
                          type="number"
                          value={cell?.questionBonus ?? 0}
                          onChange={(e) =>
                            setQuestionBonus(ti, qi, e.target.value)
                          }
                          style={{
                            width: 80,
                            textAlign: "center",
                            padding: "0.2rem",
                            border: "1px solid #ccc",
                            borderRadius: "0.25rem",
                          }}
                          title="Question-level bonus (adds in Airtable)"
                        />
                      </div>
                      <div
                        style={{
                          marginTop: "0.2rem",
                          fontSize: ".85rem",
                          opacity: 0.75,
                        }}
                      >
                        Eff. pts: <strong>{cell?.effectivePoints ?? 0}</strong>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: ".5rem", fontSize: ".9rem" }}>
        Keyboard: <code>1</code> / <code>Space</code> toggle • <code>Tab</code>/
        <code>Shift+Tab</code> next/prev question • <code>←/→</code> team •{" "}
        <code>↑/↓</code> question
      </div>

      {/* Add Team Modal */}
      {addingTeam && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(43,57,74,.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={() => setAddingTeam(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              padding: "1rem",
              borderRadius: "0.5rem",
              minWidth: 420,
              border: `1px solid ${colors.accent}`,
            }}
          >
            <h3 style={{ marginTop: 0, color: colors.dark }}>
              Add team to this show
            </h3>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                value={teamSearch}
                onChange={(e) => setTeamSearch(e.target.value)}
                placeholder="Team name"
                onKeyDown={(e) => e.key === "Enter" && searchExactTeam()}
                style={{
                  flex: 1,
                  padding: "0.5rem",
                  border: "1px solid #ccc",
                  borderRadius: "0.25rem",
                }}
              />
              <button
                onClick={searchExactTeam}
                style={{
                  padding: "0.5rem 0.75rem",
                  border: `1px solid ${colors.accent}`,
                  background: colors.accent,
                  color: "#fff",
                  borderRadius: "0.25rem",
                  cursor: "pointer",
                }}
              >
                Search
              </button>
            </div>

            {hasSearched && teamMatches.length > 0 ? (
              teamMatches.map((m) => (
                <div
                  key={m.teamId}
                  style={{ padding: ".6rem 0", borderTop: "1px solid #eee" }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div>
                        <strong>{m.teamName}</strong>
                      </div>
                      <div style={{ fontSize: ".9rem", opacity: 0.8 }}>
                        Previous shows: {m.previousShowsCount ?? 0}
                        {Array.isArray(m.recentShows) &&
                          m.recentShows.length > 0 && (
                            <div style={{ marginTop: ".25rem" }}>
                              <em>Most recent:</em>
                              <ul
                                style={{
                                  margin: ".3rem 0 0 .9rem",
                                  padding: 0,
                                }}
                              >
                                {m.recentShows.map((rs, idx) => (
                                  <li
                                    key={rs.showId || idx}
                                    style={{ listStyle: "disc" }}
                                  >
                                    {rs.showName}
                                    {rs.date
                                      ? ` — ${new Date(rs.date).toLocaleDateString()}`
                                      : ""}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                      </div>
                    </div>
                    <button
                      onClick={() => confirmTeam(m.teamId)}
                      style={{
                        padding: ".35rem .7rem",
                        border: "1px solid #DC6A24",
                        background: "#f0f0f0",
                        color: "#2B394A",
                        borderRadius: "0.25rem",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Use this team
                    </button>
                  </div>
                </div>
              ))
            ) : !searching &&
              hasSearched &&
              teamSearch.trim() &&
              teamMatches.length === 0 ? (
              <div style={{ marginTop: ".75rem", fontStyle: "italic" }}>
                No matches.
              </div>
            ) : searching ? (
              <div style={{ marginTop: ".75rem", fontStyle: "italic" }}>
                Searching…
              </div>
            ) : null}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: "0.75rem",
              }}
            >
              <button
                onClick={() => setAddingTeam(false)}
                style={{
                  padding: ".5rem .75rem",
                  border: "1px solid #ccc",
                  background: "#f7f7f7",
                  borderRadius: "0.25rem",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => confirmTeam(null, true)}
                style={{
                  padding: ".5rem .75rem",
                  border: `1px solid ${colors.accent}`,
                  background: "#fff",
                  color: colors.accent,
                  borderRadius: "0.25rem",
                  cursor: "pointer",
                }}
              >
                Create new team with this name
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
