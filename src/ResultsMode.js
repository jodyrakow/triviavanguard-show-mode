// src/ResultsMode.js
import React, { useMemo, useRef, useState } from "react";
import {
  ButtonPrimary,
  Button,
  tokens,
  overlayStyle,
  overlayImg,
  colors as theme,
} from "./styles/index.js";

// Normalize team shapes coming from cache (same as ScoringMode)
const normalizeTeam = (t) => ({
  showTeamId: t.showTeamId,
  teamId: t.teamId ?? null,
  teamName: Array.isArray(t.teamName)
    ? t.teamName[0]
    : t.teamName || "(Unnamed team)",
  showBonus: Number(t.showBonus || 0),
});

const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"],
    v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

export default function ResultsMode({
  showBundle, // { rounds:[{round, questions:[...] }], teams:[...] }
  selectedRoundId, // round number or string (e.g. "1")
  cachedState, // { teams, grid, entryOrder }
  scoringMode, // "pub" | "pooled"
  setScoringMode,
  pubPoints,
  setPubPoints,
  poolPerQuestion,
  setPoolPerQuestion,
}) {
  // --------- derive round + questions (needed for scoring math) ---------
  const roundNumber = Number(selectedRoundId);
  const roundObj = useMemo(() => {
    if (!Array.isArray(showBundle?.rounds)) return null;
    return (
      showBundle.rounds.find((r) => Number(r.round) === roundNumber) || null
    );
  }, [showBundle, roundNumber]);

  const questions = useMemo(() => {
    const raw = roundObj?.questions || [];
    // Same sort as ScoringMode (Sort order, then Question order alpha/num)
    const bySort = [...raw].sort((a, b) => {
      const sa = Number(a.sortOrder ?? 9999);
      const sb = Number(b.sortOrder ?? 9999);
      if (sa !== sb) return sa - sb;
      const cvt = (val) => {
        if (typeof val === "string" && /^[A-Z]$/i.test(val)) {
          return val.toUpperCase().charCodeAt(0) - 64; // A=1
        }
        const n = parseInt(val, 10);
        return isNaN(n) ? 9999 : 100 + n;
      };
      return cvt(a.questionOrder) - cvt(b.questionOrder);
    });

    return bySort.map((q) => ({
      showQuestionId: q.id,
      // scoring parity (per-question pub points)
      pubPerQuestion:
        typeof q.pointsPerQuestion === "number" ? q.pointsPerQuestion : null,
    }));
  }, [roundObj]);

  // --------- teams + grid (from cache) ---------
  const teams = useMemo(() => {
    const incoming = cachedState?.teams || [];
    return incoming.map(normalizeTeam);
  }, [cachedState]);

  const grid = cachedState?.grid || {}; // {[showTeamId]: {[showQuestionId]: {isCorrect, questionBonus, overridePoints}}}

  const finalStandingsRef = useRef(null);

  // --------- Standings (match ScoringMode math exactly) ---------
  const standings = useMemo(() => {
    if (!teams.length || !questions.length) return [];

    // precompute nCorrect per question (for pooled)
    const nCorrectByQ = {};
    for (const q of questions) {
      let n = 0;
      for (const t of teams) {
        if (grid[t.showTeamId]?.[q.showQuestionId]?.isCorrect) n++;
      }
      nCorrectByQ[q.showQuestionId] = n;
    }

    // start totals with show bonus
    const totalByTeam = new Map(
      teams.map((t) => [t.showTeamId, Number(t.showBonus || 0)])
    );

    for (const t of teams) {
      for (const q of questions) {
        const cell = grid[t.showTeamId]?.[q.showQuestionId];
        if (!cell) continue;

        const isCorrect = !!cell.isCorrect;
        const qb = Number(cell.questionBonus || 0);
        const override =
          cell.overridePoints === null || cell.overridePoints === undefined
            ? null
            : Number(cell.overridePoints);

        let base = 0;
        if (isCorrect) {
          if (scoringMode === "pub") {
            const perQ =
              q.pubPerQuestion !== null && q.pubPerQuestion !== undefined
                ? Number(q.pubPerQuestion)
                : Number(pubPoints);
            base = perQ;
          } else {
            const n = Math.max(1, nCorrectByQ[q.showQuestionId] || 0);
            base = Math.round(Number(poolPerQuestion) / n);
          }
        }

        const earned = override !== null ? override : base;
        totalByTeam.set(
          t.showTeamId,
          (totalByTeam.get(t.showTeamId) || 0) + earned + (isCorrect ? qb : 0)
        );
      }
    }

    const rows = teams.map((t) => ({
      showTeamId: t.showTeamId,
      teamName: t.teamName || "(Unnamed team)",
      total: +(totalByTeam.get(t.showTeamId) ?? 0),
    }));

    rows.sort(
      (a, b) =>
        b.total - a.total ||
        a.teamName.localeCompare(b.teamName, "en", { sensitivity: "base" })
    );

    // Assign places with ties
    let place = 0;
    let prevTotal = null;
    let count = 0;
    for (const r of rows) {
      count++;
      if (prevTotal === null || r.total !== prevTotal) {
        place = count;
        prevTotal = r.total;
      }
      r.place = place;
    }

    return rows;
  }, [teams, questions, grid, scoringMode, pubPoints, poolPerQuestion]);

  // --------- Prize editor ---------
  const [prizeEditorOpen, setPrizeEditorOpen] = useState(false);
  const [prizeCount, setPrizeCount] = useState(0);
  const [prizes, setPrizes] = useState([]);
  const showPrizeCol = prizeCount > 0 && prizes.some((p) => p && p.length);

  const [draftCount, setDraftCount] = useState(prizeCount);
  const [draftPrizes, setDraftPrizes] = useState(prizes);

  const openPrizeEditor = () => {
    setDraftCount(prizeCount || 0);
    setDraftPrizes(prizes.length ? [...prizes] : []);
    setPrizeEditorOpen(true);
  };
  const closePrizeEditor = () => setPrizeEditorOpen(false);
  const applyPrizeEdits = () => {
    setPrizeCount(draftCount);
    setPrizes(draftPrizes.slice(0, draftCount));
    setPrizeEditorOpen(false);
  };
  const clearPrizes = () => {
    setDraftCount(0);
    setDraftPrizes([]);
  };
  const ensureDraftLen = (n) => {
    const arr = draftPrizes.slice();
    while (arr.length < n) arr.push("");
    return arr.slice(0, n);
  };

  // --------- Guard rails ---------
  const noRound = !roundObj;
  const noData = !teams.length && !questions.length;

  return (
    <div style={{ fontFamily: "Questrial, sans-serif", color: theme.dark }}>
      {/* Header */}
      <div
        style={{
          backgroundColor: theme.dark,
          padding: "0.5rem 0",
          borderTop: `2px solid ${theme.accent}`,
          borderBottom: `2px solid ${theme.accent}`,
          marginBottom: "0.75rem",
        }}
      >
        <h2
          style={{
            color: theme.accent,
            fontFamily: "Antonio",
            fontSize: "1.6rem",
            margin: 0,
            textIndent: "0.5rem",
            letterSpacing: "0.015em",
          }}
        >
          Results
        </h2>
      </div>

      {noRound ? (
        <div
          style={{ opacity: 0.8, fontStyle: "italic", margin: "0 12px 1rem" }}
        >
          Select a round to see results.
        </div>
      ) : null}

      {noData ? (
        <div
          style={{ opacity: 0.8, fontStyle: "italic", margin: "0 12px 1rem" }}
        >
          No teams or questions yet for this round.
        </div>
      ) : null}

      {/* Controls */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          gap: ".75rem",
          padding: "0 12px",
          marginBottom: "1rem",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: ".5rem" }}>
          <div
            style={{
              display: "inline-flex",
              border: "1px solid #ccc",
              borderRadius: 999,
              overflow: "hidden",
              background: "#fff",
            }}
          >
            <button
              onClick={() => setScoringMode("pub")}
              style={{
                padding: ".35rem .6rem",
                border: "none",
                background:
                  scoringMode === "pub" ? theme.accent : "transparent",
                color: scoringMode === "pub" ? "#fff" : theme.dark,
                cursor: "pointer",
              }}
            >
              Pub scoring
            </button>
            <button
              onClick={() => setScoringMode("pooled")}
              style={{
                padding: ".35rem .6rem",
                border: "none",
                background:
                  scoringMode === "pooled" ? theme.accent : "transparent",
                color: scoringMode === "pooled" ? "#fff" : theme.dark,
                cursor: "pointer",
              }}
            >
              Pooled scoring
            </button>
          </div>

          {scoringMode === "pub" ? (
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: ".4rem",
              }}
            >
              <span>Points per question:</span>
              <input
                type="number"
                value={pubPoints}
                min={0}
                step={1}
                onChange={(e) => setPubPoints(Number(e.target.value || 0))}
                style={{
                  width: 80,
                  padding: ".35rem .5rem",
                  border: "1px solid #ccc",
                  borderRadius: ".35rem",
                }}
              />
            </label>
          ) : (
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: ".4rem",
              }}
            >
              <span>Pooled points per question:</span>
              <input
                type="number"
                value={poolPerQuestion}
                min={0}
                step={10}
                onChange={(e) =>
                  setPoolPerQuestion(Number(e.target.value || 0))
                }
                style={{
                  width: 120,
                  padding: ".35rem .5rem",
                  border: "1px solid #ccc",
                  borderRadius: ".35rem",
                }}
              />
            </label>
          )}
        </div>
      </div>

      {/* Prizes control */}
      <div
        style={{
          margin: "0 12px .5rem",
          display: "flex",
          alignItems: "center",
          gap: ".5rem",
        }}
      >
        <button
          onClick={openPrizeEditor}
          style={{
            padding: ".45rem .7rem",
            border: `1px solid ${theme.accent}`,
            background: "#fff",
            color: theme.accent,
            borderRadius: ".35rem",
            cursor: "pointer",
            fontFamily: "Questrial, sans-serif",
          }}
          title="Configure prize text shown in the standings table"
        >
          {showPrizeCol ? "Edit prizes" : "Set prizes"}
        </button>

        {showPrizeCol && (
          <span
            style={{
              fontSize: ".9rem",
              opacity: 0.9,
              padding: ".2rem .55rem",
              borderRadius: "999px",
              border: `1px solid ${theme.accent}`,
              background: "rgba(220,106,36,0.06)",
              color: theme.accent,
              fontFamily: "Questrial, sans-serif",
            }}
          >
            Showing prizes for {prizeCount} place{prizeCount > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Prize Editor Modal */}
      {prizeEditorOpen && (
        <div
          onClick={closePrizeEditor}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(43,57,74,.65)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(92vw, 560px)",
              background: "#fff",
              borderRadius: ".6rem",
              border: `1px solid ${theme.accent}`,
              overflow: "hidden",
              boxShadow: "0 10px 30px rgba(0,0,0,.25)",
              fontFamily: "Questrial, sans-serif",
            }}
          >
            {/* Header */}
            <div
              style={{
                background: theme.dark,
                color: "#fff",
                padding: ".6rem .8rem",
                borderBottom: `2px solid ${theme.accent}`,
              }}
            >
              <div
                style={{
                  fontFamily: "Antonio, sans-serif",
                  fontSize: "1.25rem",
                  letterSpacing: ".01em",
                }}
              >
                Configure Prizes
              </div>
              <div
                style={{ fontSize: ".9rem", opacity: 0.9, marginTop: ".15rem" }}
              >
                Add prize labels for top finishers (optional)
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: ".9rem .9rem 0" }}>
              {/* How many prizes */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: ".5rem",
                  marginBottom: ".75rem",
                }}
              >
                <span style={{ minWidth: 160 }}>Number of prize places:</span>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={draftCount}
                  onChange={(e) => {
                    const next = Math.max(
                      0,
                      Math.min(20, parseInt(e.target.value || "0", 10))
                    );
                    setDraftCount(next);
                    setDraftPrizes(ensureDraftLen(next));
                  }}
                  style={{
                    width: 90,
                    padding: ".45rem .55rem",
                    border: "1px solid #ccc",
                    borderRadius: ".35rem",
                  }}
                />
                {draftCount > 0 && (
                  <button
                    onClick={clearPrizes}
                    style={{
                      marginLeft: "auto",
                      padding: ".35rem .6rem",
                      border: "1px solid #ccc",
                      background: "#f7f7f7",
                      borderRadius: ".35rem",
                      cursor: "pointer",
                    }}
                    title="Clear all prizes"
                  >
                    Clear
                  </button>
                )}
              </label>

              {/* Prize rows */}
              {Array.from({ length: draftCount }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: ".5rem",
                    marginBottom: ".55rem",
                  }}
                >
                  <div
                    style={{
                      width: 92,
                      textAlign: "right",
                      paddingRight: ".25rem",
                      color: theme.accent,
                      fontWeight: 700,
                    }}
                  >
                    {ordinal(i + 1)}:
                  </div>
                  <input
                    type="text"
                    value={draftPrizes[i] || ""}
                    placeholder={`Prize for ${ordinal(i + 1)} place (e.g., $25 gift card)`}
                    onChange={(e) => {
                      const arr = ensureDraftLen(draftCount);
                      arr[i] = e.target.value;
                      setDraftPrizes(arr);
                    }}
                    style={{
                      flex: 1,
                      padding: ".45rem .55rem",
                      border: "1px solid #ccc",
                      borderRadius: ".35rem",
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Footer */}
            <div
              style={{
                display: "flex",
                gap: ".5rem",
                justifyContent: "flex-end",
                padding: ".8rem .9rem .9rem",
                borderTop: "1px solid #eee",
              }}
            >
              <button
                onClick={closePrizeEditor}
                style={{
                  padding: ".5rem .75rem",
                  border: "1px solid #ccc",
                  background: "#f7f7f7",
                  borderRadius: ".35rem",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={applyPrizeEdits}
                style={{
                  padding: ".5rem .8rem",
                  border: `1px solid ${theme.accent}`,
                  background: theme.accent,
                  color: "#fff",
                  borderRadius: ".35rem",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Save prizes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Final standings (big + tokens) ===== */}
      <div
        ref={finalStandingsRef}
        style={{
          margin: `${tokens.spacing.md} 12px 2rem`,
          background: "#fff",
          border: "1px solid #ddd",
          borderRadius: tokens.radius.md,
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        }}
      >
        <div
          style={{
            background: theme.bg,
            borderBottom: "1px solid #ddd",
            padding: `${tokens.spacing.sm} ${tokens.spacing.md}`,
            fontWeight: 700,
            letterSpacing: ".01em",
            fontSize: "1.6rem",
            fontFamily: tokens.font.display,
          }}
        >
          Final standings
        </div>

        <div style={{ padding: tokens.spacing.md }}>
          {standings.length === 0 ? (
            <div
              style={{ opacity: 0.7, fontStyle: "italic", fontSize: "1.1rem" }}
            >
              No teams yet.
            </div>
          ) : (
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontFamily: tokens.font.body,
                fontSize: "1.05rem",
              }}
            >
              <thead>
                <tr style={{ background: theme.dark, color: "#fff" }}>
                  {showPrizeCol && (
                    <th
                      style={{
                        padding: tokens.spacing.sm,
                        fontSize: "1.1rem",
                        textAlign: "center",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Prize
                    </th>
                  )}
                  <th
                    style={{
                      padding: tokens.spacing.sm,
                      fontSize: "1.1rem",
                      textAlign: "center",
                    }}
                  >
                    Place
                  </th>
                  <th
                    style={{
                      padding: tokens.spacing.sm,
                      fontSize: "1.1rem",
                      textAlign: "center",
                    }}
                  >
                    Points
                  </th>
                  <th
                    style={{
                      padding: tokens.spacing.sm,
                      fontSize: "1.1rem",
                      textAlign: "left",
                    }}
                  >
                    Team
                  </th>
                </tr>
              </thead>

              <tbody>
                {(() => {
                  let tieGroupIndex = 0;
                  return standings.map((r, i, arr) => {
                    const prev = arr[i - 1];
                    const sameAsPrev = !!prev && prev.total === r.total;
                    if (!sameAsPrev) tieGroupIndex++;

                    const next = arr[i + 1];
                    const sameAsNext = !!next && next.total === r.total;
                    const isEndOfTieGroup = !sameAsNext;
                    const gapToNext =
                      isEndOfTieGroup && next ? r.total - next.total : 0;

                    const bgColor =
                      tieGroupIndex % 2 === 0 ? "#fff" : "rgba(255,165,0,0.07)";
                    const prizeText =
                      showPrizeCol && r.place <= prizeCount
                        ? prizes[r.place - 1] || ""
                        : "";

                    return (
                      <tr
                        key={r.showTeamId}
                        style={{ backgroundColor: bgColor }}
                      >
                        {showPrizeCol && (
                          <td
                            style={{
                              padding: tokens.spacing.sm,
                              fontSize: "1.1rem",
                              textAlign: "center",
                            }}
                          >
                            {prizeText}
                          </td>
                        )}

                        <td
                          style={{
                            padding: tokens.spacing.sm,
                            textAlign: "center",
                            fontSize: "1.5rem",
                            fontWeight: 800,
                            color: theme.accent,
                            fontFamily: tokens.font.display,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {ordinal(r.place)}
                        </td>

                        <td
                          style={{
                            padding: tokens.spacing.sm,
                            textAlign: "center",
                            fontSize: "1.35rem",
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {Number.isInteger(r.total)
                            ? r.total
                            : r.total.toFixed(2)}
                          {gapToNext > 0 && (
                            <span
                              style={{
                                marginLeft: tokens.spacing.sm,
                                fontSize: "0.95rem",
                                color: theme.accent,
                                fontWeight: 700,
                              }}
                            >
                              +{gapToNext}
                            </span>
                          )}
                        </td>

                        <td
                          style={{
                            padding: tokens.spacing.sm,
                            textAlign: "left",
                            fontSize: "1.35rem",
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {r.teamName}
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
