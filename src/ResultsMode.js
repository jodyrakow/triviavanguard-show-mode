// src/ResultsMode.js
import React, { useMemo, useRef, useState, useCallback } from "react";
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

  // --- TieBreaker detection from the round (same rules as ScoringMode) ---
  const tbQ = useMemo(() => {
    const all = roundObj?.questions || [];
    return (
      all.find((q) => (q.questionType || "").toLowerCase() === "tiebreaker") ||
      all.find((q) => String(q.questionOrder).toUpperCase() === "TB") ||
      all.find((q) => String(q.id || "").startsWith("tb-")) ||
      null
    );
  }, [roundObj]);

  const tbNumber =
    tbQ && typeof tbQ.tiebreakerNumber === "number"
      ? tbQ.tiebreakerNumber
      : null;

  const tbGuessFor = useCallback(
    (showTeamId) => {
      if (!tbQ) return null;
      const v = grid?.[showTeamId]?.[tbQ.id]?.tiebreakerGuess;
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    },
    [grid, tbQ]
  );

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

  // --------- Standings (match ScoringMode math exactly) ---------
  const standings = useMemo(() => {
    if (!teams.length || !questions.length) return [];

    // Precompute nCorrect per Q for pooled
    const nCorrectByQ = {};
    for (const q of questions) {
      let n = 0;
      for (const t of teams) {
        if (grid[t.showTeamId]?.[q.showQuestionId]?.isCorrect) n++;
      }
      nCorrectByQ[q.showQuestionId] = n;
    }

    // Start totals with show bonus
    const totalByTeam = new Map(
      teams.map((t) => [t.showTeamId, Number(t.showBonus || 0)])
    );

    // Earned per cell (pub/pooled math identical to your current code)
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
              typeof q.pubPerQuestion === "number"
                ? q.pubPerQuestion
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

    // Base rows
    const rows = teams.map((t) => {
      const total = +(totalByTeam.get(t.showTeamId) ?? 0);
      const guess = tbGuessFor(t.showTeamId);
      const delta =
        tbNumber !== null && guess !== null
          ? Math.abs(guess - tbNumber)
          : Infinity; // Infinity = no guess / no TB
      return {
        showTeamId: t.showTeamId,
        teamName: t.teamName || "(Unnamed team)",
        total,
        tbGuess: guess,
        tbDelta: delta,
        tieBroken: false, // will set later if used to break a tie
        unbreakableTie: false, // will set later if same delta
      };
    });

    // Primary sort by total desc (no TB yet)
    rows.sort(
      (a, b) =>
        b.total - a.total ||
        a.teamName.localeCompare(b.teamName, "en", { sensitivity: "base" })
    );

    // Assign provisional places (with ties)
    let place = 0,
      prevTotal = null,
      cnt = 0;
    for (const r of rows) {
      cnt++;
      if (prevTotal === null || r.total !== prevTotal) {
        place = cnt;
        prevTotal = r.total;
      }
      r.place = place;
    }

    // If no prizes or no TB number, we’re done
    if (!prizeCount || prizeCount <= 0 || tbNumber === null || !tbQ) {
      return rows;
    }

    // Identify contiguous tie groups by total
    const groups = [];
    let idx = 0;
    while (idx < rows.length) {
      const gStart = idx;
      const tot = rows[idx].total;
      idx++;
      while (idx < rows.length && rows[idx].total === tot) idx++;
      const gEnd = idx; // exclusive
      groups.push([gStart, gEnd]);
    }

    // Reorder only tie-groups that intersect the prize band using TB
    for (let gi = 0; gi < groups.length; gi++) {
      const [gStart, gEnd] = groups[gi];

      // Intersects prize band if the group's first index is within top N rows
      const groupInsidePrizeBand = gStart < prizeCount && gStart >= 0;
      if (!groupInsidePrizeBand) continue;

      const slice = rows.slice(gStart, gEnd);
      const usedTBInSlice = slice.some((r) => Number.isFinite(r.tbDelta));

      if (!usedTBInSlice) {
        // No numeric TB guesses in this tie-group; do nothing
        continue;
      }

      // Sort by closeness (smaller tbDelta is better), stable by teamName
      slice.sort((a, b) => {
        if (a.total !== b.total) return 0; // safety; same-total group
        if (a.tbDelta !== b.tbDelta) return a.tbDelta - b.tbDelta;
        return a.teamName.localeCompare(b.teamName, "en", {
          sensitivity: "base",
        });
      });

      // Flags + rank within this tie group
      const best = slice[0]?.tbDelta;
      const second = slice[1]?.tbDelta;
      const groupBroken =
        slice.length > 1 &&
        Number.isFinite(best) &&
        Number.isFinite(second) &&
        best !== second;

      slice.forEach((r, k) => {
        r.tieBroken = true; // TB was consulted
        r._tbGroupBroken = !!groupBroken; // TB actually separated places?
        r._tbRank = k; // order within this TB group
      });

      // If the top tbDelta ties, mark unbreakable on those rows
      if (slice.length > 1 && Number.isFinite(best)) {
        const topTied = slice.filter((r) => r.tbDelta === best);
        if (topTied.length > 1)
          topTied.forEach((r) => (r.unbreakableTie = true));
      }

      // Write back the reordered group
      for (let k = 0; k < slice.length; k++) rows[gStart + k] = slice[k];
    }

    // Re-assign places after potential TB reorders.
    // Same-total rows normally share a place, but if a prize-band tie-group was
    // TB-broken, we give unique places inside that group using _tbRank.
    let prevKey = null;
    place = 0;
    cnt = 0;

    for (const r of rows) {
      cnt++;
      const tieKey =
        r && r._tbGroupBroken
          ? `${r.total}|${r._tbRank}` // unique per TB order inside the group
          : `${r.total}|`; // same key => shared place

      if (prevKey === null || tieKey !== prevKey) {
        place = cnt;
        prevKey = tieKey;
      }
      r.place = place;
    }

    return rows;
  }, [
    teams,
    questions,
    grid,
    scoringMode,
    pubPoints,
    poolPerQuestion,
    prizeCount,
    tbQ,
    tbNumber,
    tbGuessFor,
  ]);

  // Helper number formatter (top-level, not a hook)
  const fmtNum = (n) =>
    Number.isFinite(n) ? (Number.isInteger(n) ? String(n) : n.toFixed(2)) : "—";

  // Whether the tiebreaker affected any prize places
  const tbUsedInPrizeBand = useMemo(
    () => standings.some((r) => r.tieBroken && r.place <= prizeCount),
    [standings, prizeCount]
  );

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

      {/* ===== Final standings ===== */}
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

        {/* TB banner (only if TB used for prize places) */}
        {tbUsedInPrizeBand && tbQ && tbNumber !== null && (
          <div
            style={{
              padding: `${tokens.spacing.xs} ${tokens.spacing.md}`,
              borderBottom: "1px solid #eee",
              background: "rgba(220,106,36,0.07)",
              fontFamily: tokens.font.body,
              fontSize: ".95rem",
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              🎯 Tiebreaker
            </div>
            {tbQ?.questionText ? (
              <div style={{ marginBottom: 2 }}>{tbQ.questionText}</div>
            ) : null}
            <div>
              <strong>Correct answer:</strong> {fmtNum(tbNumber)}
            </div>
          </div>
        )}

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

                  {/* NEW: Tiebreaker column between Prize and Place */}
                  {tbUsedInPrizeBand && (
                    <th
                      style={{
                        padding: tokens.spacing.sm,
                        fontSize: "1.1rem",
                        textAlign: "center",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Tiebreaker
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

                        {/* NEW: TB column cell (only if TB used) */}
                        {tbUsedInPrizeBand && (
                          <td
                            style={{
                              padding: tokens.spacing.sm,
                              textAlign: "center",
                              whiteSpace: "nowrap",

                              fontSize: "1.0rem",
                            }}
                          >
                            {r.tieBroken &&
                            r.place <= prizeCount &&
                            Number.isFinite(r.tbGuess) ? (
                              <div
                                style={{
                                  display: "inline-flex",
                                  alignItems: "baseline",
                                  gap: 6,
                                }}
                                title={`Guess: ${fmtNum(r.tbGuess)} … (${fmtNum(r.tbDelta)} away!)`}
                              >
                                <span aria-hidden>🎯</span>
                                <span>{fmtNum(r.tbGuess)}</span>
                                <span style={{ opacity: 0.8 }}>
                                  ({fmtNum(r.tbDelta)} away!)
                                </span>
                              </div>
                            ) : (
                              // blank cell for non-tied teams (no dash)
                              <span
                                style={{
                                  display: "inline-block",
                                  minHeight: 18,
                                }}
                              />
                            )}
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
