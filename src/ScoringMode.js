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

  const COL_Q_WIDTH = 60;
  const TEAM_COL_WIDTH = 120;
  const bonusBorder = "1px solid rgba(220,106,36,0.65)";
  const thinRowBorder = "1px solid rgba(220,106,36,0.35)";

  const [teams, setTeams] = useState([]); // [{showTeamId, teamId, teamName, showBonus}]
  const [questions, setQuestions] = useState([]); // [{showQuestionId, questionId, order, text}]
  const [grid, setGrid] = useState({}); // {[showTeamId]: {[showQuestionId]: scoreRow}}
  const [focus, setFocus] = useState({ teamIdx: 0, qIdx: 0 });

  const [addingTeam, setAddingTeam] = useState(false);
  const [teamSearch, setTeamSearch] = useState("");
  const [teamMatches, setTeamMatches] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searching, setSearching] = useState(false);

  const [sortMode, setSortMode] = useState("entry"); // "entry" | "alpha"
  const [entryOrder, setEntryOrder] = useState([]); // array of showTeamId in entry order

  // Sticky + tile styles
  const sticky = {
    thTop: { position: "sticky", top: 0, zIndex: 3, background: "#fff" },
    qNumTh: {
      position: "sticky",
      left: 0,
      zIndex: 4,
      background: "#fff",
      textAlign: "center",
      minWidth: COL_Q_WIDTH,
      width: COL_Q_WIDTH,
      maxWidth: COL_Q_WIDTH,
    },
    qNumTd: {
      position: "sticky",
      left: 0,
      zIndex: 2,
      background: "#fff",
      textAlign: "center",
      minWidth: COL_Q_WIDTH,
      width: COL_Q_WIDTH,
      maxWidth: COL_Q_WIDTH,
    },
  };

  const tileBase = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 36,
    height: 30,
    borderRadius: 5,
    border: "1px solid #DC6A24",
    padding: "0 .25rem",
    userSelect: "none",
    fontSize: ".95rem",
  };

  const tileStates = {
    missing: { background: "#eee", color: "#999", cursor: "not-allowed" },
    correct: { background: "#DC6A24", color: "#fff", cursor: "pointer" },
    wrong: { background: "#f8f8f8", color: "#2B394A", cursor: "pointer" },
  };

  // Sort view of teams
  const visibleTeams = useMemo(() => {
    if (!teams.length) return [];
    if (sortMode === "alpha") {
      return [...teams].sort((a, b) =>
        (a.teamName || "").localeCompare(b.teamName || "", "en", {
          sensitivity: "base",
        })
      );
    }
    const pos = new Map(entryOrder.map((id, i) => [id, i]));
    return [...teams].sort(
      (a, b) => (pos.get(a.showTeamId) ?? 1e9) - (pos.get(b.showTeamId) ?? 1e9)
    );
  }, [teams, sortMode, entryOrder]);

  // Clamp focus when team list/questions change (e.g., sort switch)
  useEffect(() => {
    setFocus((f) => {
      const ti = Math.min(f.teamIdx, Math.max(visibleTeams.length - 1, 0));
      const qi = Math.min(f.qIdx, Math.max(questions.length - 1, 0));
      return { teamIdx: ti, qIdx: qi };
    });
  }, [visibleTeams, questions.length]);

  // Totals from Effective points (+ Show bonus)
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

  // Fetch all
  const fetchAll = useCallback(async () => {
    if (!selectedShowId || !selectedRoundId) return;
    const res = await axios.get("/.netlify/functions/fetchScores", {
      params: { showId: selectedShowId, roundId: selectedRoundId },
    });

    const { teams: t, questions: q, scores: s } = res.data;

    // Keep/refresh entry order (by arrival)
    setEntryOrder(t.map((x) => x.showTeamId));

    // Build grid
    const map = {};
    for (const row of s) {
      if (!map[row.showTeamId]) map[row.showTeamId] = {};
      map[row.showTeamId][row.showQuestionId] = row;
    }

    setTeams(t);
    setQuestions(q);
    setGrid(map);
    setFocus({ teamIdx: 0, qIdx: 0 });
  }, [selectedShowId, selectedRoundId]);

  useEffect(() => {
    fetchAll().catch(console.error);
  }, [fetchAll]);

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

  // Mutations
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

  const toggleCell = useCallback(
    (ti, qi) => {
      const t = visibleTeams[ti];
      const q = questions[qi];
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
    [visibleTeams, questions, grid]
  );

  // Keyboard navigation honors visibleTeams order
  useEffect(() => {
    const onKey = (e) => {
      if (addingTeam) return;
      const el = e.target;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      )
        return;

      if (!visibleTeams.length || !questions.length) return;
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
          teamIdx: Math.min(teamIdx + 1, visibleTeams.length - 1),
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
  }, [visibleTeams, questions, focus, addingTeam, toggleCell]);

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
        teamName: teamSearch.trim(),
        chosenTeamId,
        createIfMissing,
      });

      const { showTeamId } = res.data;

      await axios.post("/.netlify/functions/ensureScoreRows", {
        showId: selectedShowId,
        roundId: selectedRoundId,
        showTeamId,
      });

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

        <div style={{ marginLeft: "auto", display: "flex", gap: ".5rem" }}>
          <div
            style={{
              border: "1px solid #ccc",
              borderRadius: "999px",
              overflow: "hidden",
              background: "#fff",
            }}
          >
            <button
              onClick={() => setSortMode("entry")}
              style={{
                padding: ".35rem .6rem",
                border: "none",
                background:
                  sortMode === "entry" ? colors.accent : "transparent",
                color: sortMode === "entry" ? "#fff" : colors.dark,
                cursor: "pointer",
              }}
              title="Entry order"
            >
              Entry
            </button>
            <button
              onClick={() => setSortMode("alpha")}
              style={{
                padding: ".35rem .6rem",
                border: "none",
                background:
                  sortMode === "alpha" ? colors.accent : "transparent",
                color: sortMode === "alpha" ? "#fff" : colors.dark,
                cursor: "pointer",
              }}
              title="Alphabetical"
            >
              A→Z
            </button>
          </div>

          <div>
            <strong>Teams:</strong> {teams.length} &nbsp;|&nbsp;{" "}
            <strong>Questions:</strong> {questions.length} &nbsp;|&nbsp;
          </div>
        </div>
      </div>

      {/* Grid */}
      <div
        style={{
          overflowX: "auto",
          background: "#fff",
          border: "1px solid #ddd",
          borderRadius: "0.5rem",
          display: "inline-block",
          maxWidth: "100%",
        }}
      >
        <table
          style={{
            width: "auto",
            borderCollapse: "separate",
            tableLayout: "fixed",
            borderSpacing: 0,
          }}
        >
          <thead>
            <tr
              style={{
                background: colors.bg,
                borderBottom: thinRowBorder, // 👈 ultra-thin orange line here
              }}
            >
              <th
                style={{
                  padding: "0.35rem 0.4rem",
                  ...sticky.qNumTh,
                  ...sticky.thTop,
                }}
              >
                Q#
              </th>
              {visibleTeams.map((t) => (
                <th
                  key={t.showTeamId}
                  style={{
                    textAlign: "center",
                    padding: "0.3rem",
                    width: TEAM_COL_WIDTH,
                    maxWidth: TEAM_COL_WIDTH,
                    minWidth: TEAM_COL_WIDTH,
                    ...sticky.thTop,
                    borderBottom: "none",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.95rem",
                      whiteSpace: "normal",
                      wordBreak: "break-word",
                      overflowWrap: "anywhere",
                      lineHeight: 1.1,
                    }}
                  >
                    {t.teamName}
                  </div>
                  <div
                    style={{ fontSize: ".8rem", opacity: 0.85, marginTop: 2 }}
                  >
                    Total: <strong>{teamTotals[t.showTeamId]}</strong>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Team bonus row */}
            <tr>
              <td
                style={{
                  padding: "0.3rem",
                  ...sticky.qNumTd,
                  fontWeight: "bold",
                  color: colors.accent,
                  borderTop: bonusBorder,
                  borderBottom: bonusBorder,
                  whiteSpace: "normal",
                  wordBreak: "break-word",
                  overflowWrap: "anywhere",
                  lineHeight: 1.1,
                  fontSize: ".9rem",
                }}
              >
                Team bonus
              </td>

              {visibleTeams.map((t) => (
                <td
                  key={t.showTeamId}
                  style={{
                    textAlign: "center",
                    padding: "0.2rem",
                    borderTop: bonusBorder,
                    borderBottom: bonusBorder,
                  }}
                >
                  <input
                    type="number"
                    value={t.showBonus ?? 0}
                    onChange={(e) =>
                      updateShowBonus(t.showTeamId, e.target.value)
                    }
                    style={{
                      width: 40,
                      textAlign: "center",
                      padding: "0.2rem",
                      border: `1px solid ${colors.accent}`,
                      borderRadius: "0.25rem",
                      fontSize: ".85rem",
                      color: colors.accent,
                      outlineColor: colors.accent,
                    }}
                    title="Show-level bonus points"
                  />
                </td>
              ))}
            </tr>

            {questions.map((q, qi) => (
              <tr key={q.showQuestionId}>
                <td
                  style={{
                    padding: "0.35rem",
                    ...sticky.qNumTd,
                    borderBottom: thinRowBorder,
                  }}
                >
                  <strong>{q.order}</strong>
                </td>

                {visibleTeams.map((t, ti) => {
                  const cell = grid[t.showTeamId]?.[q.showQuestionId];
                  const isMissing = !cell;
                  const on = !!cell?.isCorrect;
                  const pts = Number(cell?.effectivePoints || 0);

                  const style = {
                    ...tileBase,
                    ...(isMissing
                      ? tileStates.missing
                      : on
                        ? tileStates.correct
                        : tileStates.wrong),
                  };

                  return (
                    <td
                      key={t.showTeamId}
                      style={{
                        textAlign: "center",
                        padding: "0.25rem",
                        borderBottom: thinRowBorder,
                      }}
                    >
                      <div
                        role="button"
                        aria-disabled={isMissing}
                        onClick={() => {
                          if (isMissing) return;
                          setFocus({ teamIdx: ti, qIdx: qi });
                          toggleCell(ti, qi);
                        }}
                        style={style}
                        title={
                          isMissing
                            ? "No score row yet for this team & question"
                            : on
                              ? `Correct — ${pts} pts`
                              : "Incorrect"
                        }
                      >
                        {isMissing ? "—" : on ? `✓ ${pts || ""}` : "○"}
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
