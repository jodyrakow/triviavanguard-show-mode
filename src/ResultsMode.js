// src/ResultsMode.js
import React, { useMemo, useRef, useState, useCallback } from "react";
import { tokens, colors as theme, Button, ButtonPrimary } from "./styles/index.js";
import { colors } from "./styles/ui.js";

// Normalize team shapes coming from cache (same as ScoringMode)
const normalizeTeam = (t) => ({
  showTeamId: t.showTeamId,
  teamId: t.teamId ?? null,
  teamName: Array.isArray(t.teamName)
    ? t.teamName[0]
    : t.teamName || "(Unnamed team)",
  showBonus: Number(t.showBonus || 0),
  isLeague: !!t.isLeague,
});

const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"],
    v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

export default function ResultsMode({
  showBundle, // { rounds:[{round, questions:[...] }], showId? }
  selectedRoundId, // e.g. "1" (still used for UI text & fallback mode)
  cachedState, // { teams, grid, entryOrder } for current round (fallback)
  cachedByRound = null, // NEW: { [roundId]: {teams, grid, entryOrder} } for all rounds (enables cumulative)
  scoringMode, // "pub" | "pooled"
  setScoringMode,
  pubPoints,
  setPubPoints,
  poolPerQuestion,
  setPoolPerQuestion,
  selectedShowId,
  prizes: prizesString = "", // NEW: prizes from shared state (newline-separated string)
  setPrizes: setPrizesString, // NEW: setter for shared prizes
  questionEdits = {}, // { [showQuestionId]: { question?, flavorText?, answer? } }
  sendToDisplay, // Function to send content to display mode
}) {
  const roundNumber = Number(selectedRoundId);
  const usingCumulative =
    !!cachedByRound && Object.keys(cachedByRound).length > 0;

  // ---- Build ALL questions across the whole show (used in cumulative mode) ----
  const allQuestions = useMemo(() => {
    const rounds = Array.isArray(showBundle?.rounds) ? showBundle.rounds : [];
    const flat = [];
    for (const r of rounds) {
      for (const q of r?.questions || []) {
        flat.push({
          round: r.round,
          showQuestionId: q.id,
          questionId: Array.isArray(q.questionId)
            ? q.questionId[0]
            : (q.questionId ?? null),
          pubPerQuestion:
            typeof q.pointsPerQuestion === "number"
              ? q.pointsPerQuestion
              : null,
          questionType: q.questionType || null,
          sortOrder: Number(q.sortOrder ?? 9999),
          questionOrder: q.questionOrder,
        });
      }
    }
    // same sort you use elsewhere: Sort Order, then alpha/num Question Order
    const cvt = (val) => {
      if (typeof val === "string" && /^[A-Z]$/i.test(val)) {
        return val.toUpperCase().charCodeAt(0) - 64; // A=1
      }
      const n = parseInt(val, 10);
      return Number.isNaN(n) ? 9999 : 100 + n;
    };
    flat.sort(
      (a, b) =>
        a.sortOrder - b.sortOrder || cvt(a.questionOrder) - cvt(b.questionOrder)
    );
    return flat;
  }, [showBundle]);

  // ---- Fallback: current round only (when not cumulative) ----
  const roundObj = useMemo(() => {
    if (usingCumulative) return null;
    const rounds = Array.isArray(showBundle?.rounds) ? showBundle.rounds : [];
    return rounds.find((r) => Number(r.round) === roundNumber) || null;
  }, [usingCumulative, showBundle, roundNumber]);

  const questions = useMemo(() => {
    if (usingCumulative) return allQuestions; // we’ll skip TBs in scoring below
    const raw = roundObj?.questions || [];
    const bySort = [...raw].sort((a, b) => {
      const sa = Number(a.sortOrder ?? 9999);
      const sb = Number(b.sortOrder ?? 9999);
      if (sa !== sb) return sa - sb;
      const cvt = (val) => {
        if (typeof val === "string" && /^[A-Z]$/i.test(val)) {
          return val.toUpperCase().charCodeAt(0) - 64;
        }
        const n = parseInt(val, 10);
        return isNaN(n) ? 9999 : 100 + n;
      };
      return cvt(a.questionOrder) - cvt(b.questionOrder);
    });
    return bySort.map((q) => ({
      showQuestionId: q.id,
      questionId: Array.isArray(q.questionId)
        ? q.questionId[0]
        : (q.questionId ?? null),
      pubPerQuestion:
        typeof q.pointsPerQuestion === "number" ? q.pointsPerQuestion : null,
      questionType: q.questionType || null,
    }));
  }, [usingCumulative, allQuestions, roundObj]);

  // ---- Teams (merge across rounds in cumulative mode; otherwise just current) ----
  const teams = useMemo(() => {
    if (!usingCumulative) {
      const incoming = cachedState?.teams || [];
      return incoming.map(normalizeTeam);
    }
    const byId = new Map();
    for (const rid of Object.keys(cachedByRound)) {
      const arr = cachedByRound[rid]?.teams || [];
      for (const t of arr) {
        const norm = normalizeTeam(t);
        const prev = byId.get(norm.showTeamId);
        if (!prev) {
          byId.set(norm.showTeamId, norm);
        } else {
          // keep latest non-null bonus, name, teamId, and isLeague
          byId.set(norm.showTeamId, {
            ...prev,
            teamName: norm.teamName || prev.teamName,
            teamId: norm.teamId ?? prev.teamId,
            showBonus:
              typeof norm.showBonus === "number"
                ? norm.showBonus
                : prev.showBonus,
            isLeague: norm.isLeague ?? prev.isLeague,
          });
        }
      }
    }
    return [...byId.values()];
  }, [usingCumulative, cachedState, cachedByRound]);

  // ---- Cell accessor: reads from one grid (fallback) or all grids (cumulative) ----
  const getCell = useCallback(
    (showTeamId, showQuestionId) => {
      if (!usingCumulative) {
        return cachedState?.grid?.[showTeamId]?.[showQuestionId] || null;
      }
      for (const rid of Object.keys(cachedByRound)) {
        const cell = cachedByRound[rid]?.grid?.[showTeamId]?.[showQuestionId];
        if (cell) return cell;
      }
      return null;
    },
    [usingCumulative, cachedState, cachedByRound]
  );

  // ---- Show-wide TB detection (one per show) ----
  const tbQ = useMemo(() => {
    const allRounds = Array.isArray(showBundle?.rounds)
      ? showBundle.rounds
      : [];
    for (const r of allRounds) {
      for (const q of r?.questions || []) {
        const type = (q.questionType || "").toLowerCase();
        if (
          type === "tiebreaker" ||
          String(q.questionOrder).toUpperCase() === "TB" ||
          String(q.id || "").startsWith("tb-")
        ) {
          return q;
        }
      }
    }
    return null;
  }, [showBundle]);

  const tbNumber = React.useMemo(() => {
    if (!tbQ) return null;

    // 1) explicit numeric wins
    if (
      typeof tbQ.tiebreakerNumber === "number" &&
      Number.isFinite(tbQ.tiebreakerNumber)
    ) {
      return tbQ.tiebreakerNumber;
    }

    // 2) try common string-ish fields (handle arrays too)
    const pick = (v) => (Array.isArray(v) ? v[0] : v);
    const raw =
      pick(tbQ.tiebreakerNumber) ??
      pick(tbQ.answer) ??
      tbQ.answerText ??
      tbQ.correctAnswer ??
      null;

    if (raw == null) return null;

    // 💡 key fix: remove thousands separators/spaces before matching the number
    const cleaned = String(raw).replace(/[\s,]/g, "");
    const m = cleaned.match(/-?\d+(?:\.\d+)?/);
    if (!m) return null;

    const n = Number(m[0]);
    return Number.isFinite(n) ? n : null;
  }, [tbQ]);

  const tbGuessFor = useCallback(
    (showTeamId) => {
      if (!tbQ) return null;
      const cell = getCell(showTeamId, tbQ.id);
      const v = cell?.tiebreakerGuess;
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    },
    [getCell, tbQ]
  );

  // ----------------------- Prize editor state -----------------------
  // Convert shared prizes string to array
  const prizes = useMemo(() => {
    if (!prizesString) return [];
    return prizesString.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }, [prizesString]);

  const prizeCount = prizes.length;
  const showPrizeCol = prizeCount > 0 && prizes.some((p) => p && p.length);

  const [prizeEditorOpen, setPrizeEditorOpen] = useState(false);
  const [draftCount, setDraftCount] = useState(prizeCount);
  const [draftPrizes, setDraftPrizes] = useState(prizes);

  const openPrizeEditor = useCallback(() => {
    setDraftCount(prizes.length || 0);
    setDraftPrizes(prizes.length ? [...prizes] : []);
    setPrizeEditorOpen(true);
  }, [prizes]);

  const closePrizeEditor = useCallback(() => setPrizeEditorOpen(false), []);

  const applyPrizeEdits = useCallback(() => {
    // Convert array back to newline-separated string for shared state
    const prizesStr = draftPrizes
      .slice(0, draftCount)
      .filter(Boolean)
      .join("\n");
    setPrizesString?.(prizesStr);
    setPrizeEditorOpen(false);
  }, [draftCount, draftPrizes, setPrizesString]);

  const clearPrizes = useCallback(() => {
    setDraftCount(0);
    setDraftPrizes([]);
  }, []);

  const ensureDraftLen = useCallback(
    (n, base) => {
      const src = Array.isArray(base) ? base.slice() : draftPrizes.slice();
      while (src.length < n) src.push("");
      return src.slice(0, n);
    },
    [draftPrizes]
  );

  // --- On-the-fly TB (OTF) state ---
  const [otfOpen, setOtfOpen] = useState(false);
  const [otfSelectedTeams, setOtfSelectedTeams] = useState([]); // [showTeamId]
  const [otfStage, setOtfStage] = useState("pick"); // "pick" | "source" | "guesses" | "review"
  const [otfSource, setOtfSource] = useState({
    // chosen source of the OTF TB
    mode: null, // "airtable" | "custom"
    recordId: null, // Airtable record id (if any)
    question: "", // short text (if any)
    answerText: "", // short text (if any)
    number: null, // numeric answer we’ll compare against
  });
  const [otfGuesses, setOtfGuesses] = useState({}); // { [showTeamId]: "" }
  const [otfApplied, setOtfApplied] = useState(null);
  // when applied: { number, question, answerText, teamDelta: {teamId: number}, selected: [ids] }

  // ----------------------- Standings (cumulative-aware) -----------------------
  const standings = useMemo(() => {
    if (!teams.length || !questions.length) return [];

    // Precompute nCorrect per Q for pooled
    const nCorrectByQ = {};
    for (const q of questions) {
      let n = 0;
      for (const t of teams) {
        const cell = getCell(t.showTeamId, q.showQuestionId);
        if (cell?.isCorrect) n++;
      }
      nCorrectByQ[q.showQuestionId] = n;
    }

    // Start totals with show bonus
    const totalByTeam = new Map(
      teams.map((t) => [t.showTeamId, Number(t.showBonus || 0)])
    );

    // Earn points per cell (skip TB for scoring)
    for (const t of teams) {
      for (const q of questions) {
        if (tbQ && q.showQuestionId === tbQ.id) continue; // TB never gives points

        const cell = getCell(t.showTeamId, q.showQuestionId);
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
          : Infinity;
      return {
        showTeamId: t.showTeamId,
        teamName: t.teamName || "(Unnamed team)",
        total,
        tbGuess: guess,
        tbDelta: delta,
        tieBroken: false,
        unbreakableTie: false,
      };
    });

    // Sort by total desc, then name
    rows.sort(
      (a, b) =>
        b.total - a.total ||
        a.teamName.localeCompare(b.teamName, "en", { sensitivity: "base" })
    );

    // Provisional places with ties
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

    // TB only affects ordering inside prize band (optional)
    if (!prizeCount || prizeCount <= 0 || tbNumber === null || !tbQ) {
      return rows;
    }

    // Identify tie groups (same total)
    const groups = [];
    let idx = 0;
    while (idx < rows.length) {
      const gStart = idx;
      const tot = rows[idx].total;
      idx++;
      while (idx < rows.length && rows[idx].total === tot) idx++;
      groups.push([gStart, idx]); // [start, end)
    }

    // Reorder tie groups intersecting the prize band by tbDelta
    for (const [gStart, gEnd] of groups) {
      const groupInsidePrizeBand = gStart < prizeCount && gStart >= 0;
      if (!groupInsidePrizeBand) continue;

      const slice = rows.slice(gStart, gEnd);
      const usedTBInSlice = slice.some((r) => Number.isFinite(r.tbDelta));
      if (!usedTBInSlice) continue;

      slice.sort((a, b) => {
        if (a.total !== b.total) return 0;
        if (a.tbDelta !== b.tbDelta) return a.tbDelta - b.tbDelta;
        return a.teamName.localeCompare(b.teamName, "en", {
          sensitivity: "base",
        });
      });

      const best = slice[0]?.tbDelta;
      const second = slice[1]?.tbDelta;
      const groupBroken =
        slice.length > 1 &&
        Number.isFinite(best) &&
        Number.isFinite(second) &&
        best !== second;

      slice.forEach((r, k) => {
        r.tieBroken = true;
        r._tbGroupBroken = !!groupBroken;
        r._tbRank = k;
      });

      if (slice.length > 1 && Number.isFinite(best)) {
        const topTied = slice.filter((r) => r.tbDelta === best);
        if (topTied.length > 1)
          topTied.forEach((r) => (r.unbreakableTie = true));
      }

      for (let k = 0; k < slice.length; k++) rows[gStart + k] = slice[k];
    }

    // Re-assign places (unique inside TB-broken groups)
    let prevKey = null;
    place = 0;
    cnt = 0;
    for (const r of rows) {
      cnt++;
      const tieKey =
        r && r._tbGroupBroken ? `${r.total}|${r._tbRank}` : `${r.total}|`;
      if (prevKey === null || tieKey !== prevKey) {
        place = cnt;
        prevKey = tieKey;
      }
      r.place = place;
    }
    // ---- OTF TB (on-the-fly) reordering (non-destructive to authored TB logic) ----
    if (otfApplied && prizeCount > 0) {
      const { selected, teamDelta, number } = otfApplied;
      if (selected?.length && Number.isFinite(number)) {
        // group rows by total to ensure we only reorder within equal-total tie groups
        const byTotal = new Map();
        rows.forEach((r, idx) => {
          const arr = byTotal.get(r.total) || [];
          arr.push({ r, idx });
          byTotal.set(r.total, arr);
        });

        for (const arr of byTotal.values()) {
          // consider only the subset that is both selected and inside prize band
          const inThisGroup = arr
            .map((x) => x.r)
            .filter(
              (x) => selected.includes(x.showTeamId) && x.place <= prizeCount
            );

          if (inThisGroup.length >= 2) {
            // sort that subset by OTF distance asc; stable fallback by team name
            const sorted = [...inThisGroup].sort((a, b) => {
              const da = teamDelta[a.showTeamId] ?? Infinity;
              const db = teamDelta[b.showTeamId] ?? Infinity;
              if (da !== db) return da - db;
              return a.teamName.localeCompare(b.teamName, "en", {
                sensitivity: "base",
              });
            });

            // write back in place: we only permute within the same indexes for the selected ones
            const positions = arr
              .map((x, i) => ({ i, r: x.r }))
              .filter(
                (x) =>
                  selected.includes(x.r.showTeamId) && x.r.place <= prizeCount
              )
              .map((x) => x.i);

            positions.forEach((pos, k) => {
              arr[pos].r = sorted[k];
            });
          }
        }

        // flatten back
        const flattened = [];
        byTotal.forEach((group) => group.forEach((x) => flattened.push(x.r)));
        // reassign ascending by the original sort order of groups (they still in order)
        // then recompute places
        flattened.sort(
          (a, b) =>
            b.total - a.total ||
            a.teamName.localeCompare(b.teamName, "en", { sensitivity: "base" })
        );
        let place = 0,
          prevKey = null,
          cnt = 0;
        for (const r of flattened) {
          cnt++;
          // if we re-ordered inside a tie group, make that tie “broken” for the selected ones
          if (selected.includes(r.showTeamId) && r.place <= prizeCount) {
            r.tieBroken = true;
            r._tbGroupBroken = true;
            r._tbRank = teamDelta[r.showTeamId] ?? Infinity; // not shown, but keeps uniqueness
          }
          const tieKey =
            r && r._tbGroupBroken ? `${r.total}|${r._tbRank}` : `${r.total}|`;
          if (prevKey === null || tieKey !== prevKey) {
            place = cnt;
            prevKey = tieKey;
          }
          r.place = place;
        }
        rows.splice(0, rows.length, ...flattened);
      }
    }

    return rows;
  }, [
    teams,
    questions,
    getCell,
    scoringMode,
    pubPoints,
    poolPerQuestion,
    prizeCount,
    tbQ,
    tbNumber,
    tbGuessFor,
    otfApplied,
  ]);

  // Candidates inside prize band that remain tied (or were unbreakably tied by authored TB)
  const otfDefaultCandidates = useMemo(() => {
    if (!standings.length || prizeCount <= 0) return [];
    // teams whose place is within prizeCount and (not tieBroken OR unbreakableTie)
    // i.e., either no authored TB applied to them, or authored TB still left a tie.
    const ids = standings
      .filter(
        (r) => r.place <= prizeCount && (!r.tieBroken || r.unbreakableTie)
      )
      .map((r) => r.showTeamId);
    // keep only groups where at least 2 share the same total
    const byTotal = new Map();
    standings.forEach((r) => {
      if (r.place <= prizeCount) {
        const arr = byTotal.get(r.total) || [];
        arr.push(r);
        byTotal.set(r.total, arr);
      }
    });
    const realTies = new Set();
    for (const arr of byTotal.values()) {
      if (arr.length >= 2) arr.forEach((r) => realTies.add(r.showTeamId));
    }
    return ids.filter((id) => realTies.has(id));
  }, [standings, prizeCount]);

  const [isPublishing, setIsPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState(null); // 'ok' | 'error' | null
  const [publishDetail, setPublishDetail] = useState(""); // human text

  // Archive status
  const [archiveStatus, setArchiveStatus] = useState({
    archived: false,
    isFinalized: false,
    archivedAt: null,
    publishedToAirtable: false,
    reopenedAt: null,
  });
  const [isArchiving, setIsArchiving] = useState(false);

  // Display Mode state
  const [displayPreviewOpen, setDisplayPreviewOpen] = useState(false);
  const [displayFontSize, setDisplayFontSize] = useState(100); // percentage
  const [customMessages, setCustomMessages] = useState(["", "", ""]);

  const hideTimerRef = React.useRef(null);
  React.useEffect(() => () => clearTimeout(hideTimerRef.current), []);

  // Fetch archive status when show loads
  React.useEffect(() => {
    if (!selectedShowId) return;

    const fetchArchiveStatus = async () => {
      try {
        const res = await fetch(
          `/.netlify/functions/supaGetArchiveStatus?showId=${encodeURIComponent(selectedShowId)}`
        );
        const data = await res.json();
        setArchiveStatus(data);
      } catch (err) {
        console.error("Failed to fetch archive status:", err);
      }
    };

    fetchArchiveStatus();
  }, [selectedShowId]);

  const clearBannerSoon = () => {
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setPublishStatus(null);
      setPublishDetail("");
    }, 4000);
  };

  // ---------- Export JSON Backup ----------
  const exportJSON = () => {
    const showName =
      showBundle?.showName ||
      showBundle?.rounds?.[0]?.questions?.[0]?.showName ||
      "show";
    const showDate =
      showBundle?.showDate || new Date().toISOString().split("T")[0];

    const exportData = {
      showId: selectedShowId,
      showName,
      showDate,
      exportedAt: new Date().toISOString(),
      scoringMode,
      pubPoints,
      poolPerQuestion,
      showBundle,
      cachedByRound,
      standings: standings.map((s) => ({
        teamName: s.teamName,
        total: s.total,
        place: s.place,
        tbRank: s._tbRank,
        showBonus: s.showBonus,
      })),
      prizes: prizes,
      archiveStatus,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trivia-backup-${showName.replace(/[^a-z0-9]/gi, "-")}-${showDate}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setPublishStatus("ok");
    setPublishDetail("✅ Backup file downloaded!");
    clearBannerSoon();
  };

  const fmtFloat = (v) => {
    if (!Number.isFinite(v)) return "—";
    return Number.isInteger(v) ? String(v) : String(v);
  };

  // Formats
  const fmtNum = (n) =>
    Number.isFinite(n)
      ? Number.isInteger(n)
        ? Math.round(n).toLocaleString("en-US")
        : Number(n).toLocaleString("en-US")
      : "—";

  // Teams whose TB guess should be shown:
  // - authored TB: any tie group (same total) with >=2 teams where at least one finished inside prize band
  // - OTF TB: any selected subset within a tie group where at least one finished inside prize band
  const tbDisplaySet = useMemo(() => {
    const s = new Set();
    if (!standings.length || prizeCount <= 0) return s;

    // group by total
    const groups = new Map(); // total -> rows[]
    for (const r of standings) {
      const arr = groups.get(r.total) || [];
      arr.push(r);
      groups.set(r.total, arr);
    }

    // 1) Authored TB path
    for (const arr of groups.values()) {
      if (arr.length < 2) continue; // not a tie group
      const intersectsPrizeBand = arr.some((r) => r.place <= prizeCount);
      if (!intersectsPrizeBand) continue;
      // show authored guesses for anyone in this tie group who has a finite tbGuess
      for (const r of arr) {
        if (Number.isFinite(r.tbGuess)) s.add(r.showTeamId);
      }
    }

    // 2) OTF path
    if (
      otfApplied &&
      Array.isArray(otfApplied.selected) &&
      otfApplied.selected.length
    ) {
      for (const arr of groups.values()) {
        if (arr.length < 2) continue;
        const selectedInGroup = arr.filter((r) =>
          otfApplied.selected.includes(r.showTeamId)
        );
        if (selectedInGroup.length < 2) continue;
        const intersectsPrizeBand = selectedInGroup.some(
          (r) => r.place <= prizeCount
        );
        if (!intersectsPrizeBand) continue;
        // show OTF guesses for all selected teams in this tie group
        for (const r of selectedInGroup) s.add(r.showTeamId);
      }
    }

    return s;
  }, [standings, prizeCount, otfApplied]);

  const showTbColumn = tbDisplaySet.size > 0;

  // Check if tiebreaker was actually used to break a tie in the prize band
  const tiebreakerWasUsed = useMemo(() => {
    if (!prizeCount || prizeCount <= 0) return false;
    return standings.some((r) => r.place <= prizeCount && r._tbGroupBroken);
  }, [standings, prizeCount]);

  function computePlacesForPublish(rows) {
    let place = 0,
      prevKey = null,
      cnt = 0;
    const out = rows.map((r) => ({ ...r }));
    for (const r of out) {
      cnt++;
      const tieKey =
        r && r._tbGroupBroken ? `${r.total}|${r._tbRank}` : `${r.total}|`;
      if (prevKey === null || tieKey !== prevKey) {
        place = cnt;
        prevKey = tieKey;
      }
      r.place = place;
    }
    return out;
  }

  // ---------- Archive Show ----------
  const archiveShow = async (autoPublishAfter = false) => {
    if (!selectedShowId) {
      alert("No show selected");
      return false;
    }

    const showName =
      showBundle?.showName ||
      showBundle?.rounds?.[0]?.questions?.[0]?.showName ||
      "Unknown Show";
    const showDate =
      showBundle?.showDate || new Date().toISOString().split("T")[0];

    setIsArchiving(true);
    setPublishDetail("Archiving show...");

    try {
      const res = await fetch("/.netlify/functions/supaArchiveShow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showId: selectedShowId, showName, showDate }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to archive show");
      }

      // Update archive status
      setArchiveStatus({
        archived: true,
        isFinalized: true,
        archivedAt: data.archivedAt,
        publishedToAirtable: false,
        reopenedAt: null,
      });

      setPublishDetail("✅ Show archived successfully!");
      clearBannerSoon();
      return true;
    } catch (err) {
      console.error("Archive failed:", err);
      setPublishStatus("error");
      setPublishDetail(`❌ Archive failed: ${err.message}`);
      clearBannerSoon();
      return false;
    } finally {
      setIsArchiving(false);
    }
  };

  // ---------- Re-open Archived Show ----------
  const reopenShow = async () => {
    if (!selectedShowId) return;

    const ok = window.confirm(
      "⚠️ Re-open this show for editing?\n\n" +
        "This will allow you to make changes to the scores.\n" +
        "Remember to re-archive when you're done!"
    );
    if (!ok) return;

    try {
      const res = await fetch("/.netlify/functions/supaUnarchiveShow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showId: selectedShowId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to re-open show");
      }

      setArchiveStatus({
        ...archiveStatus,
        isFinalized: false,
        reopenedAt: new Date().toISOString(),
      });

      setPublishStatus("ok");
      setPublishDetail("✅ Show re-opened for editing");
      clearBannerSoon();
    } catch (err) {
      console.error("Re-open failed:", err);
      alert(`Failed to re-open show: ${err.message}`);
    }
  };

  // ---------- Publish to Airtable (cumulative-aware) ----------
  const publishResults = async () => {
    // Step 1: Archive first if not already archived
    if (!archiveStatus.archived || !archiveStatus.isFinalized) {
      const archived = await archiveShow(true);
      if (!archived) {
        alert("Must archive show before publishing. Archive failed.");
        return;
      }
    }

    const ok = window.confirm(
      "Publish final results to Airtable?\n\nThis will (1) create ShowTeams as needed and (2) replace any existing Scores for this show."
    );
    if (!ok) return;

    setIsPublishing(true);
    setPublishStatus(null);
    setPublishDetail("Starting publish...");

    try {
      // exclude TB from scores
      const nonTBQuestions = questions.filter(
        (q) => !(tbQ && q.showQuestionId === tbQ.id)
      );

      // Validate every non-TB question has a Questions record id
      const missingQids = nonTBQuestions
        .filter((q) => !q.questionId)
        .map((q) => q.showQuestionId);
      if (missingQids.length) {
        throw new Error(
          `Some ShowQuestions are missing a linked Questions record (questionId).\n` +
            `Please open Airtable and link these ShowQuestions to a Question:\n` +
            missingQids.join(", ")
        );
      }

      // Precompute nCorrect per Q for pooled
      const nCorrectByQ = {};
      for (const q of nonTBQuestions) {
        let n = 0;
        for (const t of teams) {
          if (getCell(t.showTeamId, q.showQuestionId)?.isCorrect) n++;
        }
        nCorrectByQ[q.showQuestionId] = n;
      }

      setPublishDetail("Preparing payload…");

      const publishRows = computePlacesForPublish(standings);
      const teamsById = new Map(teams.map((t) => [t.showTeamId, t]));
      const teamsPayload = publishRows.map((r) => {
        const t = teamsById.get(r.showTeamId);
        return {
          showTeamId: r.showTeamId,
          teamId: t?.teamId || null,
          teamName: r.teamName,
          finalTotal: r.total,
          finalPlace: r.place,
          isLeague: !!t?.isLeague, // Include league status
        };
      });

      const scoresPayload = [];
      for (const t of teams) {
        for (const q of nonTBQuestions) {
          const cell = getCell(t.showTeamId, q.showQuestionId);
          const isCorrect = !!cell?.isCorrect;
          const qb = Number(cell?.questionBonus || 0);
          const override =
            cell?.overridePoints === null || cell?.overridePoints === undefined
              ? null
              : Number(cell?.overridePoints);

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
          const pointsEarned = isCorrect ? earned + qb : earned;

          scoresPayload.push({
            showTeamId: t.showTeamId,
            questionId: q.questionId,
            showQuestionId: q.showQuestionId,
            isCorrect,
            pointsEarned: Number(pointsEarned || 0),
          });
        }
      }

      const body = {
        showId: String(selectedShowId || showBundle?.showId || "").trim(),
        teams: teamsPayload,
        scores: scoresPayload,
      };

      if (!body.showId) {
        throw new Error("Missing showId (Shows recordId).");
      }

      setPublishDetail("Sending to Airtable…");

      const res = await fetch("/.netlify/functions/writeShowResults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }

      const json = await res.json();
      console.log("Publish OK:", json);

      // Update question edits if any exist
      let editsUpdated = 0;
      if (questionEdits && Object.keys(questionEdits).length > 0) {
        try {
          setPublishDetail("Updating edited questions…");

          const editsPayload = Object.entries(questionEdits).map(
            ([showQuestionId, edit]) => ({
              showQuestionId,
              question: edit.question,
              flavorText: edit.flavorText,
              answer: edit.answer,
            })
          );

          const editsRes = await fetch(
            "/.netlify/functions/updateShowQuestionEdits",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ edits: editsPayload }),
            }
          );

          if (editsRes.ok) {
            const editsJson = await editsRes.json();
            editsUpdated = editsJson.updatedCount || 0;
            console.log("Question edits updated:", editsJson);
          } else {
            console.error("Failed to update question edits:", await editsRes.text());
          }
        } catch (e) {
          console.error("Error updating question edits:", e);
        }
      }

      // Mark as published in archive
      try {
        await fetch("/.netlify/functions/supaMarkPublished", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ showId: selectedShowId, published: true }),
        });
        setArchiveStatus({
          ...archiveStatus,
          publishedToAirtable: true,
        });
      } catch (e) {
        console.error("Failed to mark as published:", e);
      }

      setPublishStatus("ok");
      const detailParts = [
        `Upserted ${json.teamsUpserted} ShowTeams`,
        `created ${json.scoresCreated} Scores`,
      ];
      if (editsUpdated > 0) {
        detailParts.push(`updated ${editsUpdated} question edit(s)`);
      }
      setPublishDetail(`✅ Published! ${detailParts.join(", ")}.`);
      clearBannerSoon();
    } catch (err) {
      console.error("Publish error:", err);
      setPublishStatus("error");
      setPublishDetail(err.message || "Publish failed.");
      // leave the error banner up (no auto-hide), or uncomment the next line:
      // clearBannerSoon();
    } finally {
      setIsPublishing(false);
    }
  };

  // --------- Guard rails (per-round only shows guidance; cumulative ignores it) ---------
  const noRound = !usingCumulative && !roundObj;
  const noData = !teams.length && !questions.length;

  const finalStandingsRef = useRef(null);

  return (
    <div style={{ fontFamily: tokens.font.body, color: theme.dark }}>
      {/* Header */}
      <div
        style={{
          backgroundColor: theme.dark,
          padding: `${tokens.spacing.sm} 0`,
          borderTop: `${tokens.borders.medium} ${theme.accent}`,
          borderBottom: `${tokens.borders.medium} ${theme.accent}`,
          marginBottom: "0.75rem",
        }}
      >
        <h2
          style={{
            color: theme.accent,
            fontFamily: tokens.font.display,
            fontSize: "1.6rem",
            margin: 0,
            textIndent: tokens.spacing.sm,
            letterSpacing: "0.015em",
          }}
        >
          Results {usingCumulative ? "— Show Total" : ""}
        </h2>
      </div>

      {/* Display Mode Controls */}
      {sendToDisplay && (
        <div
          style={{
            position: "fixed",
            right: "1rem",
            top: "1rem",
            zIndex: 1000,
            pointerEvents: "auto",
            display: "flex",
            flexDirection: "column",
            gap: ".5rem",
            maxWidth: "200px",
          }}
        >
          <ButtonPrimary
            onClick={() => {
              const newWindow = window.open(
                window.location.origin + "?display",
                "displayMode",
                "width=1920,height=1080,location=no,toolbar=no,menubar=no,status=no"
              );
              if (newWindow) {
                newWindow.focus();
              }
            }}
            title="Open Display Mode in new window"
            style={{ fontSize: "0.9rem", padding: "0.5rem 0.75rem" }}
          >
            Open Display
          </ButtonPrimary>

          <ButtonPrimary
            onClick={() => setDisplayPreviewOpen((v) => !v)}
            title="Toggle preview of what's showing on display"
            style={{ fontSize: "0.9rem", padding: "0.5rem 0.75rem" }}
          >
            {displayPreviewOpen ? "Hide Preview" : "Show Preview"}
          </ButtonPrimary>

          <Button
            onClick={() => {
              sendToDisplay("standby", null);
            }}
            title="Clear the display (standby screen)"
            style={{ fontSize: "0.9rem", padding: "0.5rem 0.75rem" }}
          >
            Clear Display
          </Button>

          <Button
            onClick={() => {
              sendToDisplay("closeImageOverlay", null);
            }}
            title="Close any image overlay on the display"
            style={{ fontSize: "0.9rem", padding: "0.5rem 0.75rem" }}
          >
            Close Image
          </Button>

          {/* Font size controls */}
          <div
            style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}
          >
            <Button
              onClick={() => {
                const newSize = Math.max(50, displayFontSize - 10);
                setDisplayFontSize(newSize);
                sendToDisplay("fontSize", { size: newSize });
              }}
              title="Decrease display text size"
              style={{ fontSize: "0.9rem", padding: "0.5rem 0.5rem", flex: 1 }}
            >
              A-
            </Button>
            <span
              style={{
                fontSize: "0.9rem",
                fontFamily: tokens.font.body,
                color: theme.dark,
                padding: "0 0.5rem",
                minWidth: "4rem",
                textAlign: "center",
              }}
            >
              {displayFontSize}%
            </span>
            <Button
              onClick={() => {
                const newSize = Math.min(400, displayFontSize + 10);
                setDisplayFontSize(newSize);
                sendToDisplay("fontSize", { size: newSize });
              }}
              title="Increase display text size"
              style={{ fontSize: "0.9rem", padding: "0.5rem 0.5rem", flex: 1 }}
            >
              A+
            </Button>
          </div>

          {/* Custom messages */}
          <div style={{ marginTop: "0.5rem" }}>
            <div
              style={{
                fontSize: "0.8rem",
                fontWeight: 600,
                marginBottom: "0.25rem",
                color: theme.dark,
              }}
            >
              Custom Messages:
            </div>
            {customMessages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  marginBottom: "0.25rem",
                  display: "flex",
                  gap: "0.25rem",
                }}
              >
                <input
                  type="text"
                  value={msg}
                  onChange={(e) => {
                    const newMessages = [...customMessages];
                    newMessages[idx] = e.target.value;
                    setCustomMessages(newMessages);
                  }}
                  placeholder={`Message ${idx + 1}`}
                  style={{
                    flex: 1,
                    fontSize: "0.8rem",
                    padding: "0.3rem",
                    border: `1px solid ${theme.gray.border}`,
                    borderRadius: "4px",
                  }}
                />
                <Button
                  onClick={() => {
                    if (msg.trim()) {
                      sendToDisplay("message", { text: msg });
                    }
                  }}
                  disabled={!msg.trim()}
                  title="Push this message to display"
                  style={{
                    fontSize: "0.7rem",
                    padding: "0.3rem 0.5rem",
                    opacity: msg.trim() ? 1 : 0.5,
                  }}
                >
                  📺
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Display Preview Panel */}
      {displayPreviewOpen && (
        <div
          style={{
            position: "fixed",
            bottom: "1rem",
            right: "1rem",
            width: "400px",
            height: "225px",
            backgroundColor: "#000",
            border: `3px solid ${theme.accent}`,
            borderRadius: "8px",
            zIndex: 2000,
            overflow: "hidden",
            boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
          }}
        >
          <div
            style={{
              backgroundColor: theme.accent,
              color: "#fff",
              padding: "0.5rem",
              fontSize: "0.85rem",
              fontWeight: 600,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span>Display Preview (16:9)</span>
            <button
              onClick={() => setDisplayPreviewOpen(false)}
              style={{
                background: "transparent",
                border: "none",
                color: "#fff",
                fontSize: "1.2rem",
                cursor: "pointer",
                padding: "0 0.5rem",
              }}
            >
              ×
            </button>
          </div>
          <iframe
            src={window.location.origin + "?display"}
            title="Display Preview"
            style={{
              width: "100%",
              height: "calc(100% - 35px)",
              border: "none",
              backgroundColor: "#000",
            }}
          />
        </div>
      )}

      {(isPublishing || publishStatus) && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 100,
            background:
              publishStatus === "ok"
                ? "rgba(28, 164, 109, 0.10)"
                : publishStatus === "error"
                  ? "rgba(220, 53, 69, 0.10)"
                  : "rgba(220,106,36,0.10)",
            color:
              publishStatus === "ok"
                ? colors.success
                : publishStatus === "error"
                  ? colors.error
                  : theme.accent,
            border: `${tokens.borders.thin} ${
              publishStatus === "ok"
                ? colors.success
                : publishStatus === "error"
                  ? colors.error
                  : theme.accent
            }`,
            borderLeft: "none",
            borderRight: "none",
            padding: ".6rem .9rem",
            marginBottom: tokens.spacing.sm,
            textAlign: "center",
            fontFamily: tokens.font.body,
          }}
        >
          {isPublishing ? "⏳ Publishing results to Airtable…" : null}
          {!isPublishing && publishStatus === "ok"
            ? `✅ ${publishDetail}`
            : null}
          {!isPublishing && publishStatus === "error"
            ? `❌ ${publishDetail}`
            : null}
        </div>
      )}

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
          No teams or questions yet for this{" "}
          {usingCumulative ? "show" : "round"}.
        </div>
      ) : null}

      {/* Archive/Publish Status Indicators */}
      {(archiveStatus.isFinalized || archiveStatus.publishedToAirtable) && (
        <div
          style={{
            margin: "0 12px",
            marginBottom: tokens.spacing.sm,
            padding: tokens.spacing.sm,
            background: archiveStatus.publishedToAirtable
              ? "rgba(28, 164, 109, 0.1)"
              : "rgba(220, 106, 36, 0.1)",
            border: `${tokens.borders.thin} ${archiveStatus.publishedToAirtable ? colors.success : theme.accent}`,
            borderRadius: ".35rem",
            display: "flex",
            alignItems: "center",
            gap: tokens.spacing.sm,
            fontSize: ".95rem",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: tokens.spacing.sm,
              flexWrap: "wrap",
            }}
          >
            {archiveStatus.isFinalized && (
              <span style={{ fontFamily: tokens.font.body }}>
                🗄️ <strong>Archived</strong>
                {archiveStatus.archivedAt &&
                  ` on ${new Date(archiveStatus.archivedAt).toLocaleString()}`}
              </span>
            )}
            {archiveStatus.publishedToAirtable && (
              <span
                style={{ fontFamily: tokens.font.body, color: colors.success }}
              >
                ✅ <strong>Published to Airtable</strong>
              </span>
            )}
            {archiveStatus.reopenedAt && (
              <span
                style={{
                  fontFamily: tokens.font.body,
                  fontStyle: "italic",
                  opacity: 0.8,
                }}
              >
                (Re-opened for editing)
              </span>
            )}
          </div>
        </div>
      )}

      {/* Controls */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          gap: ".75rem",
          padding: "0 12px",
          marginBottom: tokens.spacing.md,
        }}
      >
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: tokens.spacing.sm }}
        >
          <div
            style={{
              display: "inline-flex",
              border: `${tokens.borders.thin} ${colors.gray.border}`,
              borderRadius: 999,
              overflow: "hidden",
              background: colors.white,
            }}
            title="Choose scoring type"
          >
            <button
              type="button"
              onClick={() => setScoringMode("pub")}
              style={{
                padding: ".35rem .6rem",
                border: "none",
                background:
                  scoringMode === "pub" ? theme.accent : "transparent",
                color: scoringMode === "pub" ? colors.white : theme.dark,
                cursor: "pointer",
              }}
            >
              Pub scoring
            </button>
            <button
              type="button"
              onClick={() => setScoringMode("pooled")}
              style={{
                padding: ".35rem .6rem",
                border: "none",
                background:
                  scoringMode === "pooled" ? theme.accent : "transparent",
                color: scoringMode === "pooled" ? colors.white : theme.dark,
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
                  border: `${tokens.borders.thin} ${colors.gray.border}`,
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
                  border: `${tokens.borders.thin} ${colors.gray.border}`,
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
          margin: `0 12px ${tokens.spacing.sm}`,
          display: "flex",
          alignItems: "center",
          gap: tokens.spacing.sm,
        }}
      >
        <button
          type="button"
          onClick={openPrizeEditor}
          style={{
            padding: ".45rem .7rem",
            border: `${tokens.borders.thin} ${theme.accent}`,
            background: colors.white,
            color: theme.accent,
            borderRadius: ".35rem",
            cursor: "pointer",
            fontFamily: tokens.font.body,
          }}
          title="Configure prize text shown in the standings table"
        >
          {showPrizeCol ? "Edit prizes" : "Set prizes"}
        </button>

        {/* Archive/Re-open buttons */}
        {!archiveStatus.isFinalized ? (
          <button
            type="button"
            onClick={() => archiveShow(false)}
            disabled={isArchiving || isPublishing}
            style={{
              padding: `${tokens.spacing.sm} .8rem`,
              border: `${tokens.borders.thin} ${colors.success}`,
              background: isArchiving ? "#e8f4ef" : colors.success,
              color: isArchiving ? colors.success : colors.white,
              borderRadius: ".35rem",
              cursor: isArchiving ? "not-allowed" : "pointer",
              fontFamily: tokens.font.body,
              opacity: isArchiving ? 0.9 : 1,
            }}
            title="Archive this show permanently (creates backup, enables publish)"
          >
            {isArchiving ? "⏳ Archiving…" : "🗄️ Archive Show"}
          </button>
        ) : (
          <button
            type="button"
            onClick={reopenShow}
            style={{
              padding: `${tokens.spacing.sm} .8rem`,
              border: `${tokens.borders.thin} ${theme.accent}`,
              background: colors.white,
              color: theme.accent,
              borderRadius: ".35rem",
              cursor: "pointer",
              fontFamily: tokens.font.body,
            }}
            title="Re-open this archived show for editing"
          >
            🔓 Re-open for Editing
          </button>
        )}

        {/* Export JSON backup */}
        <button
          type="button"
          onClick={exportJSON}
          style={{
            padding: `${tokens.spacing.sm} .8rem`,
            border: `${tokens.borders.thin} ${colors.gray.border}`,
            background: colors.white,
            color: theme.dark,
            borderRadius: ".35rem",
            cursor: "pointer",
            fontFamily: tokens.font.body,
          }}
          title="Download a complete JSON backup of this show"
        >
          💾 Export Backup
        </button>

        <button
          type="button"
          onClick={publishResults}
          disabled={
            isPublishing || (!archiveStatus.isFinalized && !isArchiving)
          }
          style={{
            padding: `${tokens.spacing.sm} .8rem`,
            border: `${tokens.borders.thin} ${theme.accent}`,
            background:
              !archiveStatus.isFinalized && !isArchiving
                ? colors.gray.border
                : isPublishing
                ? "#ffe8d8"
                : theme.accent,
            color:
              !archiveStatus.isFinalized && !isArchiving
                ? colors.gray.text
                : isPublishing
                ? theme.accent
                : colors.white,
            borderRadius: ".35rem",
            cursor:
              !archiveStatus.isFinalized && !isArchiving
                ? "not-allowed"
                : isPublishing
                ? "not-allowed"
                : "pointer",
            fontFamily: tokens.font.body,
            opacity:
              !archiveStatus.isFinalized && !isArchiving
                ? 0.6
                : isPublishing
                ? 0.9
                : 1,
          }}
          title={
            !archiveStatus.isFinalized && !isArchiving
              ? "⚠️ You must archive the show first (click 'Archive Show' button above)"
              : isPublishing
              ? "Publishing in progress… please wait"
              : "Create ShowTeams as needed and write all Scores for this show"
          }
        >
          {isPublishing ? "⏳ Publishing…" : "Publish results to Airtable"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOtfSelectedTeams(
              otfDefaultCandidates.length >= 2 ? otfDefaultCandidates : []
            );
            setOtfGuesses({});
            setOtfSource({
              mode: null,
              recordId: null,
              question: "",
              answerText: "",
              number: null,
            });
            setOtfStage("pick");
            setOtfOpen(true);
          }}
          style={{
            padding: ".45rem .7rem",
            border: `${tokens.borders.thin} ${theme.accent}`,
            background: colors.white,
            color: theme.accent,
            borderRadius: ".35rem",
            cursor: "pointer",
            fontFamily: tokens.font.body,
          }}
          title="Break ties on the fly (closest to the pin)"
        >
          On-the-fly tiebreaker
        </button>

        {showPrizeCol && (
          <span
            style={{
              fontSize: ".9rem",
              opacity: 0.9,
              padding: ".2rem .55rem",
              borderRadius: "999px",
              border: `${tokens.borders.thin} ${theme.accent}`,
              background: "rgba(220,106,36,0.06)",
              color: theme.accent,
              fontFamily: tokens.font.body,
              marginLeft: 8,
            }}
          >
            Showing prizes for {prizeCount} place{prizeCount > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* ----- Prize Editor Modal (inline; stable) ----- */}
      {prizeEditorOpen && (
        <div
          onMouseDown={closePrizeEditor}
          style={{
            position: "fixed",
            inset: 0,
            background: colors.overlay,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: tokens.spacing.md,
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: "min(92vw, 560px)",
              background: colors.white,
              borderRadius: ".6rem",
              border: `${tokens.borders.thin} ${theme.accent}`,
              overflow: "hidden",
              boxShadow: "0 10px 30px rgba(0,0,0,.25)",
              fontFamily: tokens.font.body,
            }}
          >
            {/* Header */}
            <div
              style={{
                background: theme.dark,
                color: colors.white,
                padding: ".6rem .8rem",
                borderBottom: `${tokens.borders.medium} ${theme.accent}`,
              }}
            >
              <div
                style={{
                  fontFamily: tokens.font.display,
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
                    setDraftPrizes((prev) => ensureDraftLen(next, prev));
                  }}
                  style={{
                    width: 90,
                    padding: ".45rem .55rem",
                    border: `${tokens.borders.thin} ${colors.gray.border}`,
                    borderRadius: ".35rem",
                  }}
                />
                {draftCount > 0 && (
                  <button
                    type="button"
                    onClick={clearPrizes}
                    style={{
                      marginLeft: "auto",
                      padding: ".35rem .6rem",
                      border: `${tokens.borders.thin} ${colors.gray.border}`,
                      background: colors.gray.bg,
                      borderRadius: ".35rem",
                      cursor: "pointer",
                    }}
                    title="Clear all prizes"
                  >
                    Clear
                  </button>
                )}
              </label>

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
                      const val = e.target.value;
                      setDraftPrizes((prev) => {
                        const arr = ensureDraftLen(draftCount, prev);
                        arr[i] = val;
                        return arr;
                      });
                    }}
                    style={{
                      flex: 1,
                      padding: ".45rem .55rem",
                      border: `${tokens.borders.thin} ${colors.gray.border}`,
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
                gap: tokens.spacing.sm,
                justifyContent: "flex-end",
                padding: ".8rem .9rem .9rem",
                borderTop: `${tokens.borders.thin} ${colors.gray.borderLighter}`,
              }}
            >
              <button
                type="button"
                onClick={closePrizeEditor}
                style={{
                  padding: `${tokens.spacing.sm} .75rem`,
                  border: `${tokens.borders.thin} ${colors.gray.border}`,
                  background: colors.gray.bg,
                  borderRadius: ".35rem",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyPrizeEdits}
                style={{
                  padding: `${tokens.spacing.sm} .8rem`,
                  border: `${tokens.borders.thin} ${theme.accent}`,
                  background: theme.accent,
                  color: colors.white,
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

      {/* ===== Final standings ===== */}
      <div
        ref={finalStandingsRef}
        style={{
          margin: `${tokens.spacing.md} 12px ${tokens.spacing.xl}`,
          background: colors.white,
          border: `${tokens.borders.thin} ${colors.gray.borderLight}`,
          borderRadius: tokens.radius.md,
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        }}
      >
        <div
          style={{
            background: theme.bg,
            borderBottom: `${tokens.borders.thin} ${colors.gray.borderLight}`,
            padding: `${tokens.spacing.sm} ${tokens.spacing.md}`,
            fontWeight: 700,
            letterSpacing: ".01em",
            fontSize: "1.6rem",
            fontFamily: tokens.font.display,
          }}
        >
          Final standings
        </div>

        {showTbColumn ? (
          <div
            style={{
              padding: `${tokens.spacing.xs} ${tokens.spacing.md}`,
              borderBottom: `${tokens.borders.thin} ${colors.gray.borderLighter}`,
              background: tiebreakerWasUsed
                ? "rgba(220,106,36,0.15)"
                : "rgba(220,106,36,0.07)",
              fontFamily: tokens.font.body,
              fontSize: ".95rem",
            }}
          >
            <div
              style={{
                fontWeight: 700,
                marginBottom: 4,
                display: "flex",
                alignItems: "center",
                gap: ".5rem",
              }}
            >
              🎯 {otfApplied ? "On-the-fly tiebreaker" : "Tiebreaker"}
              {tiebreakerWasUsed && (
                <span
                  style={{
                    fontSize: ".75rem",
                    fontWeight: 600,
                    padding: ".15rem .5rem",
                    borderRadius: "999px",
                    background: theme.accent,
                    color: colors.white,
                  }}
                >
                  USED
                </span>
              )}
              {!tiebreakerWasUsed && prizeCount > 0 && (
                <span
                  style={{
                    fontSize: ".75rem",
                    fontWeight: 600,
                    padding: ".15rem .5rem",
                    borderRadius: "999px",
                    background: colors.gray.border,
                    color: theme.dark,
                    opacity: 0.7,
                  }}
                >
                  NOT USED
                </span>
              )}
              {!tiebreakerWasUsed && prizeCount === 0 && (
                <span
                  style={{
                    fontSize: ".75rem",
                    fontWeight: 600,
                    padding: ".15rem .5rem",
                    borderRadius: "999px",
                    background: "#ffc107",
                    color: theme.dark,
                  }}
                >
                  ⚠️ SET PRIZES BELOW
                </span>
              )}
            </div>
            {otfApplied ? (
              <>
                {otfApplied.question ? (
                  <div style={{ marginBottom: 2 }}>{otfApplied.question}</div>
                ) : null}
                <div>
                  <strong>Correct answer:</strong> {fmtNum(otfApplied.number)}
                </div>
              </>
            ) : (
              <>
                {tbQ?.questionText ? (
                  <div style={{ marginBottom: 2 }}>{tbQ.questionText}</div>
                ) : null}
                <div>
                  <strong>Correct answer:</strong> {fmtNum(tbNumber)}
                </div>
              </>
            )}
          </div>
        ) : null}

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
                <tr style={{ background: theme.dark, color: colors.white }}>
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
                  {showTbColumn && (
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
                  {sendToDisplay && (
                    <th
                      style={{
                        padding: tokens.spacing.sm,
                        fontSize: "1.1rem",
                        textAlign: "center",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Display
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
                      tieGroupIndex % 2 === 0
                        ? colors.white
                        : "rgba(255,165,0,0.07)";
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

                        {showTbColumn && (
                          <td
                            style={{
                              padding: tokens.spacing.sm,
                              textAlign: "center",
                              whiteSpace: "nowrap",
                              fontSize: "1.0rem",
                            }}
                          >
                            {(() => {
                              // authored TB path
                              if (
                                !otfApplied &&
                                tbDisplaySet.has(r.showTeamId) &&
                                Number.isFinite(r.tbGuess)
                              ) {
                                return (
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
                                );
                              }
                              // OTF path
                              if (
                                otfApplied &&
                                tbDisplaySet.has(r.showTeamId)
                              ) {
                                const guess = otfGuesses[r.showTeamId];
                                const delta =
                                  otfApplied.teamDelta[r.showTeamId];
                                if (
                                  guess !== undefined &&
                                  Number.isFinite(delta)
                                ) {
                                  return (
                                    <div
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "baseline",
                                        gap: 6,
                                      }}
                                      title={`Guess: ${fmtNum(+guess)} … (${fmtNum(delta)} away!)`}
                                    >
                                      <span aria-hidden>🎯</span>
                                      <span>{fmtNum(+guess)}</span>
                                      <span style={{ opacity: 0.8 }}>
                                        ({fmtNum(delta)} away!)
                                      </span>
                                    </div>
                                  );
                                }
                              }
                              return (
                                <span
                                  style={{
                                    display: "inline-block",
                                    minHeight: 18,
                                  }}
                                />
                              );
                            })()}
                          </td>
                        )}

                        {/* Display push buttons column */}
                        {sendToDisplay && (
                          <td
                            style={{
                              padding: tokens.spacing.sm,
                              textAlign: "center",
                              verticalAlign: "middle",
                            }}
                          >
                            {!sameAsPrev && (() => {
                              // First row of this tie group (by score) - show ALL buttons for entire group
                              const allTiedByScore = arr.filter(
                                (row) => row.total === r.total
                              );
                              const isTiedByScore = allTiedByScore.length > 1;

                              // Get unique places within this tie group
                              const uniquePlaces = [...new Set(allTiedByScore.map(t => t.place))].sort((a, b) => a - b);

                              // For randomize button: get the highest place in the tie group
                              const highestPlaceInTie = Math.min(...uniquePlaces);
                              const highestPlaceStr = ordinal(highestPlaceInTie);

                              // Check if there are "unlucky" teams (tied but outside prize band)
                              const unluckyTeams = isTiedByScore
                                ? allTiedByScore.filter((t) => t.place > prizeCount)
                                : [];

                              return (
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "0.25rem",
                                    alignItems: "center",
                                  }}
                                >
                                  {/* Randomize ALL tied teams (if tied by score) */}
                                  {isTiedByScore && (
                                    <Button
                                      onClick={() => {
                                        const allTiedTeamNames = allTiedByScore.map(
                                          (t) => t.teamName
                                        );
                                        const shuffled = [...allTiedTeamNames].sort(
                                          () => Math.random() - 0.5
                                        );
                                        sendToDisplay("results", {
                                          place: highestPlaceStr,
                                          teams: shuffled,
                                          prize: null,
                                          isTied: true,
                                        });
                                      }}
                                      style={{
                                        fontSize: "0.7rem",
                                        padding: "0.25rem 0.5rem",
                                        whiteSpace: "nowrap",
                                        background: theme.accent,
                                        color: "#fff",
                                      }}
                                      title={`Randomize ALL tied teams`}
                                    >
                                      🔀 Rand All
                                    </Button>
                                  )}

                                  {/* Push button for "unlucky" teams (tied but no prize) */}
                                  {unluckyTeams.length > 0 && (
                                    <Button
                                      onClick={() => {
                                        const unluckyTeamNames = unluckyTeams.map(
                                          (t) => t.teamName
                                        );
                                        sendToDisplay("results", {
                                          place: highestPlaceStr,
                                          teams: unluckyTeamNames,
                                          prize: null,
                                          isTied: true,
                                        });
                                      }}
                                      style={{
                                        fontSize: "0.7rem",
                                        padding: "0.25rem 0.5rem",
                                        whiteSpace: "nowrap",
                                      }}
                                      title={`Push unlucky tied teams (no prizes)`}
                                    >
                                      😢 Unlucky
                                    </Button>
                                  )}

                                  {/* Individual push buttons for EACH place in the tie group */}
                                  {uniquePlaces.map((place) => {
                                    const teamsAtThisPlace = allTiedByScore.filter(
                                      (t) => t.place === place
                                    );
                                    const placeStr = ordinal(place);
                                    const teamNames = teamsAtThisPlace.map((t) => t.teamName);
                                    const prizeText =
                                      prizeCount > 0 && place <= prizeCount
                                        ? prizes[place - 1] || ""
                                        : "";

                                    return (
                                      <Button
                                        key={place}
                                        onClick={() => {
                                          sendToDisplay("results", {
                                            place: placeStr,
                                            teams: teamNames,
                                            prize: prizeText,
                                            isTied: false,
                                          });
                                        }}
                                        style={{
                                          fontSize: "0.7rem",
                                          padding: "0.25rem 0.5rem",
                                          whiteSpace: "nowrap",
                                        }}
                                        title={`Push ${placeStr} place: ${teamNames.join(", ")}`}
                                      >
                                        📺 {placeStr}
                                      </Button>
                                    );
                                  })}
                                </div>
                              );
                            })()}
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
                          {fmtNum(r.total)}
                          {gapToNext > 0 && (
                            <span
                              style={{
                                marginLeft: tokens.spacing.sm,
                                fontSize: "0.95rem",
                                color: theme.accent,
                                fontWeight: 700,
                              }}
                            >
                              +{fmtNum(gapToNext)}
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
      {otfOpen && (
        <div
          onMouseDown={() => setOtfOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: colors.overlay,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: tokens.spacing.md,
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: "min(92vw, 660px)",
              background: colors.white,
              borderRadius: ".6rem",
              border: `${tokens.borders.thin} ${theme.accent}`,
              overflow: "hidden",
              boxShadow: "0 10px 30px rgba(0,0,0,.25)",
              fontFamily: tokens.font.body,
            }}
          >
            {/* Header */}
            <div
              style={{
                background: theme.dark,
                color: colors.white,
                padding: ".6rem .8rem",
                borderBottom: `${tokens.borders.medium} ${theme.accent}`,
              }}
            >
              <div
                style={{
                  fontFamily: tokens.font.display,
                  fontSize: "1.25rem",
                  letterSpacing: ".01em",
                }}
              >
                On-the-fly tiebreaker
              </div>
              <div
                style={{ fontSize: ".9rem", opacity: 0.9, marginTop: ".15rem" }}
              >
                Closest-to-the-pin; affects only the teams you choose.
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: ".9rem .9rem 0" }}>
              {otfStage === "pick" && (
                <>
                  <div style={{ marginBottom: ".6rem", fontWeight: 700 }}>
                    Select teams to include
                  </div>
                  <div
                    style={{
                      maxHeight: 260,
                      overflow: "auto",
                      border: `${tokens.borders.thin} ${colors.gray.borderLighter}`,
                      borderRadius: ".35rem",
                    }}
                  >
                    {standings.map((r) => (
                      <label
                        key={r.showTeamId}
                        style={{
                          display: "flex",
                          gap: tokens.spacing.sm,
                          alignItems: "center",
                          padding: ".4rem .6rem",
                          borderBottom: `${tokens.borders.thin} #f2f2f2`,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={otfSelectedTeams.includes(r.showTeamId)}
                          onChange={(e) => {
                            setOtfSelectedTeams((prev) => {
                              if (e.target.checked)
                                return Array.from(
                                  new Set([...prev, r.showTeamId])
                                );
                              return prev.filter((id) => id !== r.showTeamId);
                            });
                          }}
                        />
                        <div
                          style={{
                            width: 64,
                            textAlign: "right",
                            color: theme.accent,
                            fontWeight: 700,
                          }}
                        >
                          {ordinal(r.place)}
                        </div>
                        <div
                          style={{
                            width: 88,
                            textAlign: "right",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {fmtNum(r.total)}
                        </div>
                        <div style={{ flex: 1 }}>{r.teamName}</div>
                      </label>
                    ))}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: tokens.spacing.sm,
                      padding: ".8rem 0",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (otfSelectedTeams.length < 2) return;
                        setOtfStage("source");
                      }}
                      style={{
                        padding: ".45rem .8rem",
                        border: `${tokens.borders.thin} ${theme.accent}`,
                        background: theme.accent,
                        color: colors.white,
                        borderRadius: ".35rem",
                        cursor:
                          otfSelectedTeams.length < 2
                            ? "not-allowed"
                            : "pointer",
                        opacity: otfSelectedTeams.length < 2 ? 0.6 : 1,
                      }}
                    >
                      Continue
                    </button>
                  </div>
                </>
              )}

              {otfStage === "source" && (
                <>
                  <div style={{ marginBottom: ".6rem", fontWeight: 700 }}>
                    Pick the tiebreaker source
                  </div>

                  <div style={{ display: "grid", gap: tokens.spacing.sm }}>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await fetch(
                            "/.netlify/functions/getNextTiebreaker"
                          );
                          const json = await res.json();
                          if (!json || !json.id) {
                            // fallback to custom
                            setOtfSource({
                              mode: "custom",
                              recordId: null,
                              question: "",
                              answerText: "",
                              number: null,
                            });
                            setOtfStage("guesses");
                            return;
                          }
                          const q = json.fields?.["Tiebreaker question"] || "";
                          const aText =
                            json.fields?.["Tiebreaker answer"] || "";
                          const nRaw = json.fields?.["Tiebreaker number"];
                          const n =
                            nRaw === undefined || nRaw === null
                              ? null
                              : Number(nRaw);
                          setOtfSource({
                            mode: "airtable",
                            recordId: json.id,
                            question: String(q || ""),
                            answerText: String(aText || ""),
                            number: Number.isFinite(n) ? n : null,
                          });
                          // mark used now
                          await fetch(
                            "/.netlify/functions/markTiebreakerUsed",
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ recordId: json.id }),
                            }
                          );
                          setOtfStage("guesses");
                        } catch {
                          // fallback to custom
                          setOtfSource({
                            mode: "custom",
                            recordId: null,
                            question: "",
                            answerText: "",
                            number: null,
                          });
                          setOtfStage("guesses");
                        }
                      }}
                      style={{
                        padding: ".45rem .7rem",
                        border: `${tokens.borders.thin} ${colors.gray.border}`,
                        background: colors.gray.bg,
                        borderRadius: ".35rem",
                        cursor: "pointer",
                      }}
                    >
                      Use next unused from Airtable
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setOtfSource({
                          mode: "custom",
                          recordId: null,
                          question: "",
                          answerText: "",
                          number: null,
                        });
                        setOtfStage("guesses");
                      }}
                      style={{
                        padding: ".45rem .7rem",
                        border: `${tokens.borders.thin} ${colors.gray.border}`,
                        background: colors.gray.bg,
                        borderRadius: ".35rem",
                        cursor: "pointer",
                      }}
                    >
                      Enter a custom numeric answer
                    </button>
                  </div>
                </>
              )}

              {otfStage === "guesses" && (
                <>
                  <div style={{ marginBottom: ".6rem", fontWeight: 700 }}>
                    Enter guesses
                  </div>

                  {otfSource.mode === "airtable" &&
                    (otfSource.question || otfSource.answerText) && (
                      <div
                        style={{
                          marginBottom: tokens.spacing.sm,
                          padding: tokens.spacing.sm,
                          border: `${tokens.borders.thin} ${colors.gray.borderLighter}`,
                          borderRadius: ".35rem",
                          background: colors.gray.bgLightest,
                        }}
                      >
                        {otfSource.question ? (
                          <div style={{ marginBottom: 4 }}>
                            <strong>Question:</strong> {otfSource.question}
                          </div>
                        ) : null}
                        {otfSource.answerText ? (
                          <div style={{ marginBottom: 4 }}>
                            <strong>Answer:</strong> {otfSource.answerText}
                          </div>
                        ) : null}
                        <div>
                          <strong>Number:</strong>{" "}
                          {otfSource.number !== null
                            ? fmtFloat(otfSource.number)
                            : "(host will enter custom number)"}
                        </div>
                      </div>
                    )}

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: tokens.spacing.sm,
                      marginBottom: ".75rem",
                    }}
                  >
                    <span style={{ minWidth: 160 }}>Correct number:</span>
                    <input
                      type="number"
                      step="any"
                      value={otfSource.number ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setOtfSource((src) => ({
                          ...src,
                          number: v === "" ? null : Number(v),
                        }));
                      }}
                      placeholder="e.g., 123.45"
                      style={{
                        width: 160,
                        padding: ".45rem .55rem",
                        border: `${tokens.borders.thin} ${colors.gray.border}`,
                        borderRadius: ".35rem",
                      }}
                    />
                  </label>

                  <div
                    style={{
                      maxHeight: 260,
                      overflow: "auto",
                      border: `${tokens.borders.thin} ${colors.gray.borderLighter}`,
                      borderRadius: ".35rem",
                    }}
                  >
                    {otfSelectedTeams.map((id) => {
                      const team = standings.find((r) => r.showTeamId === id);
                      if (!team) return null;
                      return (
                        <label
                          key={id}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 180px",
                            alignItems: "center",
                            gap: tokens.spacing.sm,
                            padding: ".4rem .6rem",
                            borderBottom: `${tokens.borders.thin} #f2f2f2`,
                          }}
                        >
                          <div>{team.teamName}</div>
                          <input
                            type="number"
                            step="any"
                            value={otfGuesses[id] ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setOtfGuesses((prev) => ({ ...prev, [id]: v }));
                            }}
                            placeholder="Guess"
                            style={{
                              padding: ".35rem .5rem",
                              border: `${tokens.borders.thin} ${colors.gray.border}`,
                              borderRadius: ".35rem",
                            }}
                          />
                        </label>
                      );
                    })}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: tokens.spacing.sm,
                      padding: ".8rem 0",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (!Number.isFinite(otfSource.number)) return;
                        // compute deltas
                        const teamDelta = {};
                        for (const id of otfSelectedTeams) {
                          const g = otfGuesses[id];
                          const num = g === "" || g == null ? NaN : Number(g);
                          teamDelta[id] = Number.isFinite(num)
                            ? Math.abs(num - otfSource.number)
                            : Infinity;
                        }
                        setOtfApplied({
                          question: otfSource.question || "",
                          answerText: otfSource.answerText || "",
                          number: otfSource.number,
                          selected: otfSelectedTeams.slice(),
                          teamDelta,
                        });
                        setOtfStage("review");
                      }}
                      style={{
                        padding: ".45rem .8rem",
                        border: `${tokens.borders.thin} ${theme.accent}`,
                        background: theme.accent,
                        color: colors.white,
                        borderRadius: ".35rem",
                        cursor: Number.isFinite(otfSource.number)
                          ? "pointer"
                          : "not-allowed",
                        opacity: Number.isFinite(otfSource.number) ? 1 : 0.6,
                      }}
                    >
                      Preview results
                    </button>
                  </div>
                </>
              )}

              {otfStage === "review" && otfApplied && (
                <>
                  <div style={{ marginBottom: ".6rem", fontWeight: 700 }}>
                    Preview: closest to the pin
                  </div>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      marginBottom: ".75rem",
                    }}
                  >
                    <thead>
                      <tr style={{ background: theme.bg }}>
                        <th
                          style={{ textAlign: "left", padding: ".35rem .5rem" }}
                        >
                          Team
                        </th>
                        <th
                          style={{
                            textAlign: "right",
                            padding: ".35rem .5rem",
                          }}
                        >
                          Guess
                        </th>
                        <th
                          style={{
                            textAlign: "right",
                            padding: ".35rem .5rem",
                          }}
                        >
                          Distance
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...otfApplied.selected]
                        .sort((a, b) => {
                          const da = otfApplied.teamDelta[a] ?? Infinity;
                          const db = otfApplied.teamDelta[b] ?? Infinity;
                          if (da !== db) return da - db;
                          const A =
                            standings.find((r) => r.showTeamId === a)
                              ?.teamName || "";
                          const B =
                            standings.find((r) => r.showTeamId === b)
                              ?.teamName || "";
                          return A.localeCompare(B, "en", {
                            sensitivity: "base",
                          });
                        })
                        .map((id) => {
                          const name =
                            standings.find((r) => r.showTeamId === id)
                              ?.teamName || id;
                          const g = otfGuesses[id];
                          const d = otfApplied.teamDelta[id];
                          return (
                            <tr key={id}>
                              <td style={{ padding: ".35rem .5rem" }}>
                                {name}
                              </td>
                              <td
                                style={{
                                  padding: ".35rem .5rem",
                                  textAlign: "right",
                                }}
                              >
                                {g === "" || g == null ? "—" : fmtFloat(+g)}
                              </td>
                              <td
                                style={{
                                  padding: ".35rem .5rem",
                                  textAlign: "right",
                                }}
                              >
                                {Number.isFinite(d) ? fmtFloat(d) : "—"}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: tokens.spacing.sm,
                      paddingBottom: ".9rem",
                    }}
                  >
                    <div style={{ opacity: 0.85 }}>
                      Correct number:&nbsp;
                      <strong>{fmtFloat(otfApplied.number)}</strong>
                    </div>
                    <div style={{ display: "flex", gap: tokens.spacing.sm }}>
                      <button
                        type="button"
                        onClick={() => setOtfStage("guesses")}
                        style={{
                          padding: ".45rem .7rem",
                          border: `${tokens.borders.thin} ${colors.gray.border}`,
                          background: colors.gray.bg,
                          borderRadius: ".35rem",
                          cursor: "pointer",
                        }}
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={() => setOtfOpen(false)}
                        style={{
                          padding: ".45rem .8rem",
                          border: `${tokens.borders.thin} ${theme.accent}`,
                          background: theme.accent,
                          color: colors.white,
                          borderRadius: ".35rem",
                          cursor: "pointer",
                        }}
                      >
                        Apply to standings
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
