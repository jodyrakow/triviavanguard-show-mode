// ScoringMode.js — local/offline scoring with parent-provided cache
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ui,
  ButtonPrimary,
  ButtonTab,
  colors as theme,
  tokens,
} from "./styles/index.js";

// Small helper to make local IDs for teams added during the show
const makeLocalId = (prefix = "local") =>
  `${prefix}:${Date.now().toString(36)}:${Math.random()
    .toString(36)
    .slice(2, 7)}`;

export default function ScoringMode({
  showBundle, // { rounds: [{ round, questions: [...] }], teams?: [...] }
  selectedShowId,
  selectedRoundId, // string, e.g. "1"
  preloadedTeams = [], // [{showTeamId, teamId?, teamName, showBonus}]
  cachedState, // { teams, grid, entryOrder } from App-level cache
  onChangeState = () => {},
  scoringMode,
  setScoringMode,
  pubPoints,
  setPubPoints,
  poolPerQuestion,
  setPoolPerQuestion,
}) {
  const roundNumber = Number(selectedRoundId);

  // ---- Build question list for the round (compact shape for grid) ----
  const roundObj = useMemo(() => {
    if (!Array.isArray(showBundle?.rounds)) return null;
    return (
      showBundle.rounds.find((r) => Number(r.round) === roundNumber) || null
    );
  }, [showBundle, roundNumber]);

  // how much space to keep above/below the focused cell
  const TOP_GUARD = 76; // sticky header height + a little padding
  const BOTTOM_GUARD = 56; // bottom breathing room
  const teamBarRef = useRef(null);

  const questions = useMemo(() => {
    const raw = roundObj?.questions || [];

    // Find the single tiebreaker question (if present)
    const tbQ =
      raw.find((q) => (q.questionType || "").toLowerCase() === "tiebreaker") ||
      raw.find((q) => String(q.questionOrder).toUpperCase() === "TB") ||
      raw.find((q) => String(q.id || "").startsWith("tb-")) ||
      null;

    // Exclude tiebreaker from the regular grid
    const rawNonTB = tbQ ? raw.filter((q) => q !== tbQ) : raw;

    // Same sort as before (letters first, then numbers)
    const bySort = [...rawNonTB].sort((a, b) => {
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
      questionId: (Array.isArray(q.questionId) && q.questionId[0]) || null,
      order: q.questionOrder,
      text: q.questionText || "",
      flavor: q.flavorText || "",
      answer: q.answer || "",
      pubPerQuestion:
        typeof q.pointsPerQuestion === "number" ? q.pointsPerQuestion : null,
    }));
  }, [roundObj]);

  // --- Tiebreaker detection (one per show) ---
  const tiebreaker = React.useMemo(() => {
    const list = roundObj?.questions || [];
    // prefer explicit type, else "TB" order, else id that starts with tb-
    return (
      list.find((q) => (q.questionType || "").toLowerCase() === "tiebreaker") ||
      list.find((q) => String(q.questionOrder).toUpperCase() === "TB") ||
      list.find((q) => String(q.id || "").startsWith("tb-")) ||
      null
    );
  }, [roundObj]);

  // ---------------- Local state (seeded from cachedState OR preloadedTeams) ----------------
  const [teams, setTeams] = useState([]); // [{showTeamId, teamId?, teamName, showBonus}]
  const [grid, setGrid] = useState({}); // {[showTeamId]: {[showQuestionId]: {isCorrect, questionBonus}}}
  const [entryOrder, setEntryOrder] = useState([]); // [showTeamId]
  // --- Per-cell points editor (modal) ---
  const [editingCell, setEditingCell] = useState(null);
  // { showTeamId, showQuestionId, draftBonus, draftOverride }
  // Search results state (used by Add Team modal)
  const [searchResults, setSearchResults] = useState([]);
  // 🔁 MOVED UP: Add Team modal state so it's defined before useEffect below
  const [addingTeam, setAddingTeam] = useState(false);
  const [teamInput, setTeamInput] = useState("");
  // Keep refs to each cell <div> for scrolling into view
  const cellRefs = useRef({});

  // Remove a team and all their cells
  const removeTeam = (showTeamId) => {
    const hasAnyScores =
      Object.values(grid[showTeamId] || {}).some(
        (c) =>
          c?.isCorrect ||
          (c?.questionBonus ?? 0) !== 0 ||
          c?.overridePoints != null
      ) ||
      (teams.find((t) => t.showTeamId === showTeamId)?.showBonus ?? 0) !== 0;

    const name =
      teams.find((t) => t.showTeamId === showTeamId)?.teamName || "this team";
    const ok = window.confirm(
      hasAnyScores
        ? `Delete “${name}” and all their scores/bonuses for this round? This cannot be undone.`
        : `Delete “${name}”?`
    );
    if (!ok) return;

    setTeams((prev) => prev.filter((t) => t.showTeamId !== showTeamId));
    setGrid((prev) => {
      const next = { ...prev };
      delete next[showTeamId];
      return next;
    });
    setEntryOrder((prev) => prev.filter((id) => id !== showTeamId));

    // If focused column was this team, bump focus left if possible
    setFocus((f) => {
      const idx = renderTeams.findIndex((t) => t.showTeamId === showTeamId);
      if (idx === -1) return f;
      const newTeamIdx = Math.max(0, f.teamIdx - (f.teamIdx >= idx ? 1 : 0));
      return { teamIdx: newTeamIdx, qIdx: f.qIdx };
    });
  };

  useEffect(() => {
    if (!addingTeam) setSearchResults([]);
  }, [addingTeam]);

  const pubPerQuestionByShowQ = useMemo(() => {
    const m = {};
    for (const q of questions) {
      if (q.pubPerQuestion !== null && q.pubPerQuestion !== undefined) {
        m[q.showQuestionId] = q.pubPerQuestion; // allow 0 as a valid value
      }
    }
    return m;
  }, [questions]);

  const openCellEditor = (showTeamId, showQuestionId) => {
    const cell = grid[showTeamId]?.[showQuestionId] || {};
    setEditingCell({
      showTeamId,
      showQuestionId,
      draftBonus: Number(cell.questionBonus ?? 0),
      draftOverride:
        cell.overridePoints === null || cell.overridePoints === undefined
          ? ""
          : String(cell.overridePoints),
    });
  };

  const closeCellEditor = () => setEditingCell(null);

  const applyCellEditor = () => {
    if (!editingCell) return;
    const { showTeamId, showQuestionId, draftBonus, draftOverride } =
      editingCell;
    setGrid((prev) => {
      const byTeam = prev[showTeamId] ? { ...prev[showTeamId] } : {};
      const cell = byTeam[showQuestionId] || {
        isCorrect: false,
        questionBonus: 0,
        overridePoints: null,
      };
      byTeam[showQuestionId] = {
        ...cell,
        questionBonus: Number(draftBonus || 0),
        overridePoints:
          draftOverride === "" || draftOverride === null
            ? null
            : Number(draftOverride),
      };
      return { ...prev, [showTeamId]: byTeam };
    });
    setEditingCell(null);
  };

  // helper: coerce Airtable-ish shapes into what the grid expects
  const normalizeTeam = (t) => ({
    showTeamId: t.showTeamId || makeLocalId("team"),
    teamId: t.teamId ?? null,
    teamName: Array.isArray(t.teamName)
      ? t.teamName[0]
      : t.teamName || "(Unnamed team)",
    showBonus: Number(t.showBonus || 0),
  });

  // Clear local state when the SHOW changes (not the round)
  useEffect(() => {
    setTeams([]);
    setGrid({});
    setEntryOrder([]);
    setFocus({ teamIdx: 0, qIdx: 0 });
  }, [selectedShowId]);

  // Seed once we have a source (cache or preloadedTeams). Avoid seeding empty.
  useEffect(() => {
    if (teams.length > 0) return;

    const source =
      (cachedState?.teams?.length && cachedState.teams) ||
      (preloadedTeams?.length && preloadedTeams) ||
      null;

    if (!source) return; // wait until data arrives

    const seededTeams = source.map(normalizeTeam);
    const seededGrid = cachedState?.grid || {};
    const seededEntryOrder =
      cachedState?.entryOrder || seededTeams.map((t) => t.showTeamId);

    setTeams(seededTeams);
    setGrid(seededGrid);
    setEntryOrder(seededEntryOrder);
    setFocus({ teamIdx: 0, qIdx: 0 });
  }, [teams.length, cachedState, preloadedTeams]);

  // ---------- Persist local changes up to App ----------
  const lastSentRef = useRef("");
  useEffect(() => {
    const payload = { teams, grid, entryOrder };
    const key = JSON.stringify(payload);
    if (key !== lastSentRef.current) {
      lastSentRef.current = key;
      onChangeState(payload);
    }
  }, [teams, grid, entryOrder, onChangeState]);

  // ---------------- View wiring (sorting, team mode, nav) ----------------
  const [sortMode, setSortMode] = useState("entry"); // "entry" | "alpha"

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

  const [teamMode, setTeamMode] = useState(false);
  const [teamIdxSolo, setTeamIdxSolo] = useState(0);
  const renderTeams = useMemo(() => {
    if (!teamMode) return visibleTeams;
    const one = visibleTeams[teamIdxSolo];
    return one ? [one] : [];
  }, [teamMode, visibleTeams, teamIdxSolo]);

  // after renderTeams/useState etc., put these at top level:
  const nextTeam = useCallback(() => {
    if (!visibleTeams.length) return;
    setTeamIdxSolo((i) => (i + 1) % visibleTeams.length);
  }, [visibleTeams.length]);

  const prevTeam = useCallback(() => {
    if (!visibleTeams.length) return;
    setTeamIdxSolo((i) => (i - 1 + visibleTeams.length) % visibleTeams.length);
  }, [visibleTeams.length]);

  // ---------------- Focus + keyboard nav ----------------
  const [focus, setFocus] = useState({ teamIdx: 0, qIdx: 0 });
  useEffect(() => {
    setFocus((f) => ({
      teamIdx: Math.min(f.teamIdx, Math.max(renderTeams.length - 1, 0)),
      qIdx: Math.min(f.qIdx, Math.max(questions.length - 1, 0)),
    }));
  }, [renderTeams, questions.length]);

  useEffect(() => {
    const onKey = (e) => {
      const el = e.target;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      )
        return;
      if (!renderTeams.length || !questions.length) return;

      const { teamIdx, qIdx } = focus;

      if (e.key === "1" || e.key === " ") {
        e.preventDefault();
        toggleCell(teamMode ? 0 : teamIdx, qIdx);
      } else if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        setFocus(({ teamIdx: t, qIdx }) => ({
          teamIdx: teamMode ? teamIdxSolo : t,
          qIdx: (qIdx + 1) % questions.length,
        }));
      } else if (e.key === "Tab" && e.shiftKey) {
        e.preventDefault();
        setFocus(({ teamIdx: t, qIdx }) => ({
          teamIdx: teamMode ? teamIdxSolo : t,
          qIdx: (qIdx - 1 + questions.length) % questions.length,
        }));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (teamMode) {
          nextTeam(); // 👈 cycle to next team
          setFocus((f) => ({ teamIdx: 0, qIdx: f.qIdx })); // single column
        } else {
          setFocus(({ teamIdx, qIdx }) => ({
            teamIdx: Math.min(teamIdx + 1, renderTeams.length - 1),
            qIdx,
          }));
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (teamMode) {
          prevTeam(); // 👈 cycle to previous team
          setFocus((f) => ({ teamIdx: 0, qIdx: f.qIdx }));
        } else {
          setFocus(({ teamIdx, qIdx }) => ({
            teamIdx: Math.max(teamIdx - 1, 0),
            qIdx,
          }));
        }
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocus(({ teamIdx: t, qIdx }) => ({
          teamIdx: teamMode ? teamIdxSolo : t,
          qIdx: Math.min(qIdx + 1, questions.length - 1),
        }));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocus(({ teamIdx: t, qIdx }) => ({
          teamIdx: teamMode ? teamIdxSolo : t,
          qIdx: Math.max(qIdx - 1, 0),
        }));
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    renderTeams,
    questions,
    focus,
    teamMode,
    teamIdxSolo,
    toggleCell,
    nextTeam,
    prevTeam,
  ]); // 👈 include next/prev

  // 👉 Auto-scroll focused cell into view
  useEffect(() => {
    if (!renderTeams.length || !questions.length) return;

    const logicalTeamIdx = teamMode ? 0 : focus.teamIdx;
    const t = renderTeams[logicalTeamIdx];
    const q = questions[focus.qIdx];
    if (!t || !q) return;

    const key = `${t.showTeamId}:${q.showQuestionId}`;
    const el = cellRefs.current[key];
    if (!el || typeof el.getBoundingClientRect !== "function") return;

    // 1) center it (good for large jumps)
    el.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "smooth",
    });

    // 2) then correct for sticky chrome (table header + optional team bar)
    requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();

      const baseTopGuard = TOP_GUARD;
      const extraTeamBar =
        teamMode && teamBarRef.current
          ? teamBarRef.current.getBoundingClientRect().height || 0
          : 0;

      const topLimit = baseTopGuard + extraTeamBar;
      const bottomLimit = window.innerHeight - BOTTOM_GUARD;

      let dy = 0;
      if (r.top < topLimit) dy = r.top - topLimit;
      else if (r.bottom > bottomLimit) dy = r.bottom - bottomLimit;

      if (dy !== 0) window.scrollBy({ top: dy, behavior: "smooth" });
    });
  }, [focus, renderTeams, questions, teamMode, teamIdxSolo]);

  // ---------------- Derived scoring helpers ----------------
  const correctCountByShowQuestionId = useMemo(() => {
    const out = {};
    for (const q of questions) {
      let count = 0;
      for (const t of teams) {
        const cell = grid[t.showTeamId]?.[q.showQuestionId];
        if (cell?.isCorrect) count++;
      }
      out[q.showQuestionId] = count;
    }
    return out;
  }, [questions, teams, grid]);

  const earnedFor = useCallback(
    (cell, showQuestionId) => {
      if (!cell?.isCorrect) return 0;

      const nCorrect = Math.max(
        1,
        correctCountByShowQuestionId[showQuestionId] || 0
      );

      // Use per-question pub value if provided, else global pubPoints
      const perQPub = pubPerQuestionByShowQ[showQuestionId];
      const base =
        scoringMode === "pub"
          ? Number(
              perQPub !== null && perQPub !== undefined ? perQPub : pubPoints
            )
          : Math.round(Number(poolPerQuestion) / nCorrect);

      const override =
        cell.overridePoints === null || cell.overridePoints === undefined
          ? null
          : Number(cell.overridePoints);

      const earned = override !== null ? override : base;
      const bonus = Number(cell.questionBonus || 0); // add only if correct
      return earned + bonus;
    },
    [
      correctCountByShowQuestionId,
      scoringMode,
      pubPoints,
      poolPerQuestion,
      pubPerQuestionByShowQ,
    ]
  );

  const displayTotals = useMemo(() => {
    if (!teams.length || !questions.length) return {};
    const totals = {};
    for (const t of teams) {
      let sum = Number(t.showBonus || 0);
      for (const q of questions) {
        const cell = grid[t.showTeamId]?.[q.showQuestionId];
        if (!cell) continue;
        sum += earnedFor(cell, q.showQuestionId);
      }
      totals[t.showTeamId] = sum;
    }
    return totals;
  }, [teams, questions, grid, earnedFor]);

  // ---------------- Local mutations (pure state) ----------------
  const updateShowBonus = (showTeamId, val) => {
    const v = Number(val) || 0;
    setTeams((prev) =>
      prev.map((t) =>
        t.showTeamId === showTeamId ? { ...t, showBonus: v } : t
      )
    );
  };

  const toggleCell = useCallback(
    (renderTeamIdx, qIdx) => {
      const t = renderTeams[renderTeamIdx];
      const q = questions[qIdx];
      if (!t || !q) return;
      setGrid((prev) => {
        const byTeam = prev[t.showTeamId] ? { ...prev[t.showTeamId] } : {};
        const cell = byTeam[q.showQuestionId] || {
          isCorrect: false,
          questionBonus: 0,
          overridePoints: null,
        };
        byTeam[q.showQuestionId] = { ...cell, isCorrect: !cell.isCorrect };
        return { ...prev, [t.showTeamId]: byTeam };
      });
      setFocus({ teamIdx: teamMode ? teamIdxSolo : renderTeamIdx, qIdx });
    },
    [renderTeams, questions, teamMode, teamIdxSolo]
  );

  const addTeamLocal = (teamName, airtableId = null) => {
    const trimmed = (teamName || "").trim();
    if (!trimmed) return;
    const newTeam = {
      showTeamId: makeLocalId("team"),
      teamId: airtableId, // ✅ keep Airtable Team recordId if available
      teamName: trimmed,
      showBonus: 0,
    };
    setTeams((prev) => [...prev, newTeam]);
    setEntryOrder((prev) => [...prev, newTeam.showTeamId]);
  };

  // --- TB ADD: helpers to read/write tiebreaker guesses in local grid -------
  // --- TB ADD: helpers to read/write tiebreaker guesses in local grid -------
  const getTBGuess = (showTeamId) => {
    if (!tiebreaker) return "";
    const cell = grid[showTeamId]?.[tiebreaker.id] || {};
    if (typeof cell.tiebreakerGuessRaw === "string")
      return cell.tiebreakerGuessRaw;
    if (
      typeof cell.tiebreakerGuess === "number" &&
      Number.isFinite(cell.tiebreakerGuess)
    ) {
      return String(cell.tiebreakerGuess);
    }
    return "";
  };

  // Allow partial numerics while typing (e.g., "-", ".", "12.", "0.").
  const setTBGuess = (showTeamId, nextStr) => {
    if (!tiebreaker) return;
    const raw = String(nextStr ?? "");

    // Accept empty or partial numeric inputs
    const partialOk = /^-?\d*\.?\d*$/.test(raw);
    if (!partialOk) return; // ignore disallowed characters

    setGrid((prev) => {
      const byTeam = prev[showTeamId] ? { ...prev[showTeamId] } : {};
      const cell = byTeam[tiebreaker.id] || {
        isCorrect: false,
        questionBonus: 0,
        overridePoints: null,
      };
      byTeam[tiebreaker.id] = { ...cell, tiebreakerGuessRaw: raw };
      return { ...prev, [showTeamId]: byTeam };
    });
  };

  // Commit on blur: coerce to number if valid, else clear
  const commitTBGuess = (showTeamId) => {
    if (!tiebreaker) return;
    const raw = getTBGuess(showTeamId).trim();
    const num = raw === "" ? null : Number(raw);

    setGrid((prev) => {
      const byTeam = prev[showTeamId] ? { ...prev[showTeamId] } : {};
      const cell = byTeam[tiebreaker.id] || {
        isCorrect: false,
        questionBonus: 0,
        overridePoints: null,
      };

      if (raw === "" || Number.isNaN(num)) {
        byTeam[tiebreaker.id] = {
          ...cell,
          tiebreakerGuess: null,
          tiebreakerGuessRaw: "",
        };
      } else {
        // normalize stored raw to canonical string
        const normalized = String(num);
        byTeam[tiebreaker.id] = {
          ...cell,
          tiebreakerGuess: num,
          tiebreakerGuessRaw: normalized,
        };
      }

      return { ...prev, [showTeamId]: byTeam };
    });
  };
  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------

  // ---------------- Sticky & tile styles ----------------
  const COL_Q_WIDTH = 60;
  const TEAM_COL_WIDTH = 120;
  const bonusBorder = "1px solid rgba(220,106,36,0.65)";
  const thinRowBorder = "1px solid rgba(220,106,36,0.35)";
  const focusColor = theme.dark;

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
    correct: { background: "#DC6A24", color: "#fff", cursor: "pointer" },
    wrong: { background: "#f8f8f8", color: "#2B394A", cursor: "pointer" },
  };
  const tileFocus = {
    boxShadow: `0 0 0 2px #fff, 0 0 0 4px ${focusColor}`,
    transform: "scale(1.04)",
    outline: "none",
    transition: "box-shadow 120ms ease, transform 120ms ease",
  };

  // ---------------- Render ----------------

  return (
    <div
      style={{
        marginTop: "1rem",
        fontFamily: "Questrial, sans-serif",
        color: theme.dark,
      }}
    >
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
          Scores
        </h2>
      </div>

      {/* Top controls */}
      <ui.Bar>
        {/* LEFT controls */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: ".35rem",
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              flexWrap: "nowrap",
              minWidth: 0,
            }}
          >
            <ButtonPrimary onClick={() => setAddingTeam(true)}>
              + Add team
            </ButtonPrimary>

            <ui.Segmented style={{ flexShrink: 0 }}>
              <button
                style={ui.segBtn(sortMode === "entry")}
                onClick={() => setSortMode("entry")}
                title="Entry order"
              >
                Entry
              </button>
              <button
                style={ui.segBtn(sortMode === "alpha")}
                onClick={() => setSortMode("alpha")}
                title="Alphabetical"
              >
                A→Z
              </button>
            </ui.Segmented>

            <ButtonTab
              active={teamMode}
              onClick={() => setTeamMode((prev) => !prev)}
              title="Toggle team scoring mode"
              style={{ flexShrink: 0 }}
            >
              {teamMode ? "Exit Team Scoring Mode" : "Team Scoring Mode"}
            </ButtonTab>
          </div>

          {/* Scoring controls */}
          <div style={{ display: "flex", gap: ".5rem", alignItems: "center" }}>
            <div
              style={{
                display: "inline-flex",
                border: "1px solid #ccc",
                borderRadius: 999,
                overflow: "hidden",
                background: "#fff",
              }}
              title="Choose scoring type"
            >
              <button
                style={ui.segBtn(scoringMode === "pub")}
                onClick={() => setScoringMode("pub")}
              >
                Pub
              </button>
              <button
                style={ui.segBtn(scoringMode === "pooled")}
                onClick={() => setScoringMode("pooled")}
              >
                Pooled
              </button>
            </div>

            {scoringMode === "pub" ? (
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: ".35rem",
                }}
              >
                <span style={{ whiteSpace: "nowrap" }}>Pts/Q:</span>
                <input
                  type="number"
                  value={pubPoints}
                  min={0}
                  step={1}
                  onChange={(e) => setPubPoints(Number(e.target.value || 0))}
                  style={{
                    width: 70,
                    padding: ".3rem .4rem",
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
                  gap: ".35rem",
                }}
              >
                <span style={{ whiteSpace: "nowrap" }}>Pool/Q:</span>
                <input
                  type="number"
                  value={poolPerQuestion}
                  min={0}
                  step={10}
                  onChange={(e) =>
                    setPoolPerQuestion(Number(e.target.value || 0))
                  }
                  style={{
                    width: 110,
                    padding: ".3rem .4rem",
                    border: "1px solid #ccc",
                    borderRadius: ".35rem",
                  }}
                />
              </label>
            )}
          </div>
        </div>

        {/* RIGHT stats */}
        <div
          style={{
            justifySelf: "end",
            minWidth: 0,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            textAlign: "right",
          }}
        >
          <strong>Teams:</strong> {teams.length} &nbsp;|&nbsp;
          <strong>Questions:</strong> {questions.length}
        </div>
      </ui.Bar>

      {/* Grid */}
      <div
        style={{
          overflowX: "auto",
          background: "#fff",
          border: "1px solid #ddd",
          borderRadius: "0.5rem",
          display: "block",
          maxWidth: "100%",
          width: "100%",
          boxSizing: "border-box",
        }}
      >
        {teamMode && (
          <div
            ref={teamBarRef}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.4rem 0.5rem",
              borderBottom: "1px solid #eee",
              position: "sticky",
              top: 0,
              background: "#fff",
              zIndex: 5,
            }}
          >
            <div
              style={{
                fontWeight: 600,
                color: theme.dark,
                whiteSpace: "nowrap",
              }}
            >
              Scoring team:
            </div>

            <ui.Segmented style={{ flexShrink: 0 }}>
              <button
                style={ui.segBtn(false)}
                onClick={prevTeam}
                title="Previous team"
              >
                ◀
              </button>
              <button
                style={{
                  ...ui.segBtn(false),
                  borderLeft: "1px solid rgba(220,106,36,0.35)", // thin light orange divider
                }}
                onClick={nextTeam}
                title="Next team"
              >
                ▶
              </button>
            </ui.Segmented>

            <select
              value={teamIdxSolo}
              onChange={(e) => setTeamIdxSolo(Number(e.target.value))}
              style={{
                padding: "0.35rem 0.5rem",
                border: "1px solid #ccc",
                borderRadius: "0.35rem",
                minWidth: 180,
                maxWidth: 360,
              }}
              title="Choose team to score"
            >
              {visibleTeams.map((t, idx) => (
                <option key={t.showTeamId} value={idx}>
                  {t.teamName}
                </option>
              ))}
            </select>
          </div>
        )}

        <table
          style={{
            width: "auto",
            borderCollapse: "separate",
            tableLayout: "fixed",
            borderSpacing: 0,
          }}
        >
          <thead>
            <tr style={{ background: theme.bg, borderBottom: thinRowBorder }}>
              <th
                style={{
                  padding: "0.35rem 0.4rem",
                  ...sticky.qNumTh,
                  ...sticky.thTop,
                }}
              >
                Q#
              </th>
              {renderTeams.map((t) => (
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
                  <button
                    aria-label={`Remove ${t.teamName}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeTeam(t.showTeamId);
                    }}
                    style={{
                      margin: "0 auto",
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      border: `1px solid ${theme.accent}`,
                      background: theme.bg,
                      color: theme.accent,
                      cursor: "pointer",
                      padding: 0,
                      display: "grid",
                      placeItems: "center",
                    }}
                    title="Delete team"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        d="M6 6l12 12M18 6L6 18"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                  <div
                    style={{ fontSize: ".8rem", opacity: 0.85, marginTop: 2 }}
                  >
                    Total: <strong>{displayTotals[t.showTeamId] ?? 0}</strong>
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
                  color: theme.accent,
                  borderTop: bonusBorder,
                  borderBottom: bonusBorder,
                  whiteSpace: "normal",
                  wordBreak: "word-break",
                  overflowWrap: "anywhere",
                  lineHeight: 1.1,
                  fontSize: ".9rem",
                }}
              >
                Team bonus
              </td>

              {renderTeams.map((t) => (
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
                      border: `1px solid ${theme.accent}`,
                      borderRadius: "0.25rem",
                      fontSize: ".85rem",
                      color: theme.accent,
                      outlineColor: theme.accent,
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

                {renderTeams.map((t, ti) => {
                  const logicalTi = teamMode ? teamIdxSolo : ti;
                  const cell = grid[t.showTeamId]?.[q.showQuestionId];
                  const on = !!cell?.isCorrect;
                  const isFocused =
                    focus.teamIdx === logicalTi && focus.qIdx === qi;

                  const pts = earnedFor(cell, q.showQuestionId);

                  const style = {
                    ...tileBase,
                    ...(on ? tileStates.correct : tileStates.wrong),
                    ...(isFocused ? tileFocus : null),
                    scrollMarginTop: +8,
                    scrollMarginBottom: +8,
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
                        ref={(el) => {
                          cellRefs.current[
                            `${t.showTeamId}:${q.showQuestionId}`
                          ] = el;
                        }}
                        role="button"
                        aria-pressed={!!cell?.isCorrect}
                        onClick={() => toggleCell(ti, qi)}
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          openCellEditor(t.showTeamId, q.showQuestionId);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          openCellEditor(t.showTeamId, q.showQuestionId);
                        }}
                        style={style}
                        title={
                          on
                            ? `Correct — ${pts} pts\n(⇧ Double-click or Right-click for bonus/override)`
                            : `Incorrect\n(⇧ Double-click or Right-click for bonus/override)`
                        }
                      >
                        {on ? `✓ ${pts}` : "○"}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}

            {/* --- TB ADD: Tiebreaker capture row (final in grid) ---------------- */}
            {tiebreaker && (
              <tr>
                <td
                  style={{
                    padding: "0.35rem",
                    ...sticky.qNumTd,
                    borderTop: thinRowBorder,
                    borderBottom: thinRowBorder,
                    fontWeight: 700,
                    color: theme.accent,
                    verticalAlign: "middle",
                  }}
                  title="Tiebreaker — closest to the number wins"
                >
                  <span
                    aria-hidden
                    style={{
                      display: "inline-block",
                      transform: "translateY(2px)",
                      marginRight: "0.25rem",
                    }}
                  >
                    🎯
                  </span>
                  TB
                </td>

                {renderTeams.map((t) => (
                  <td
                    key={t.showTeamId}
                    style={{
                      textAlign: "center",
                      padding: "0.25rem",
                      borderTop: thinRowBorder,
                      borderBottom: thinRowBorder,
                    }}
                  >
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="—"
                      value={getTBGuess(t.showTeamId)}
                      onChange={(e) => setTBGuess(t.showTeamId, e.target.value)}
                      onBlur={() => commitTBGuess(t.showTeamId)}
                      style={{
                        width: 60,
                        textAlign: "center",
                        padding: ".2rem .3rem",
                        border: `1px solid ${theme.accent}`,
                        borderRadius: tokens.radius.sm,
                        fontFamily: tokens.font.body,
                        fontSize: tokens.font.size,
                        color: theme.accent,
                        outlineColor: theme.accent,
                      }}
                      aria-label={`Tiebreaker guess for ${t.teamName}`}
                    />
                  </td>
                ))}
              </tr>
            )}
            {/* ------------------------------------------------------------------- */}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: ".5rem", fontSize: ".9rem" }}>
        Keyboard: <code>1</code> / <code>Space</code> toggle • <code>Tab</code>/
        <code>Shift+Tab</code> next/prev question • <code>←/→</code> team •{" "}
        <code>↑/↓</code> question
      </div>

      {/* Per-cell Bonus/Override Editor */}
      {editingCell && (
        <div
          onClick={closeCellEditor}
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
              width: "min(92vw, 460px)",
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
                Edit Points (this team • this question)
              </div>
              <div
                style={{ fontSize: ".9rem", opacity: 0.9, marginTop: ".15rem" }}
              >
                Bonus is added (only if correct). Override replaces the earned
                points.
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: ".9rem .9rem .2rem" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: ".5rem",
                  marginBottom: ".6rem",
                }}
              >
                <div
                  style={{
                    minWidth: 140,
                    fontWeight: 600,
                    color: theme.accent,
                  }}
                >
                  Bonus points
                </div>
                <input
                  type="number"
                  value={editingCell.draftBonus}
                  onChange={(e) =>
                    setEditingCell((p) => ({
                      ...p,
                      draftBonus: Number(e.target.value || 0),
                    }))
                  }
                  style={{
                    width: 120,
                    padding: ".45rem .55rem",
                    border: "1px solid #ccc",
                    borderRadius: ".35rem",
                  }}
                />
              </label>

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: ".5rem",
                  marginBottom: ".6rem",
                }}
              >
                <div
                  style={{
                    minWidth: 140,
                    fontWeight: 600,
                    color: theme.accent,
                  }}
                >
                  Override points
                </div>
                <input
                  type="number"
                  placeholder="(leave blank for none)"
                  value={editingCell.draftOverride}
                  onChange={(e) =>
                    setEditingCell((p) => ({
                      ...p,
                      draftOverride: e.target.value, // keep "" if blank
                    }))
                  }
                  style={{
                    width: 160,
                    padding: ".45rem .55rem",
                    border: "1px solid #ccc",
                    borderRadius: ".35rem",
                  }}
                />
              </label>
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
                onClick={closeCellEditor}
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
                onClick={applyCellEditor}
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
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Team Modal (local or Airtable search) */}
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
              border: `1px solid ${theme.accent}`,
            }}
          >
            <h3 style={{ marginTop: 0, color: theme.dark }}>
              Add team to this show
            </h3>

            {/* Search field */}
            <input
              value={teamInput}
              onChange={async (e) => {
                const val = e.target.value;
                setTeamInput(val);

                if (val.length >= 2) {
                  try {
                    const res = await fetch(
                      `/.netlify/functions/searchTeams?q=${encodeURIComponent(val)}`
                    );
                    const json = await res.json();
                    console.log("searchTeams matches (raw):", json.matches);

                    // Normalize to { id, name, recentShowTeams: [{id,label}] }
                    const normalized = (json.matches || []).map((m) => {
                      const id = m.teamId ?? m.id ?? "";
                      const name = m.teamName ?? m.name ?? "";
                      // If backend returns strings in m.showTeams, convert to [{id,label}]
                      const recentShowTeams = Array.isArray(m.showTeams)
                        ? m.showTeams.map((label, idx) => ({
                            id: `${id}::${idx}`, // unique key for React
                            label: String(label || ""),
                          }))
                        : Array.isArray(m.recentShowTeams)
                          ? m.recentShowTeams.map((r, idx) => ({
                              id: r.id ?? `${id}::${idx}`,
                              label: r.label ?? String(r || ""),
                            }))
                          : [];

                      return { id, name, recentShowTeams };
                    });

                    setSearchResults(normalized);
                  } catch (err) {
                    console.error("searchTeams error:", err);
                    setSearchResults([]);
                  }
                } else {
                  setSearchResults([]);
                }
              }}
              placeholder="Enter team name"
              style={{
                width: "100%",
                marginBottom: ".5rem",
                padding: "0.5rem",
                border: "1px solid #ccc",
                borderRadius: "0.25rem",
              }}
            />

            {searchResults.map((t) => (
              <div
                key={t.id} // ✅ unique team key
                onClick={() => {
                  addTeamLocal(t.name, t.id);
                  setTeamInput("");
                  setAddingTeam(false);
                  setSearchResults([]);
                }}
                style={{
                  padding: ".45rem .6rem",
                  cursor: "pointer",
                  borderBottom: "1px solid #eee",
                }}
                title={
                  Array.isArray(t.recentShowTeams) && t.recentShowTeams.length
                    ? `Recent: ${t.recentShowTeams.map((r) => r.label).join(" • ")}`
                    : ""
                }
              >
                <div style={{ fontWeight: 600 }}>{t.name}</div>

                {Array.isArray(t.recentShowTeams) &&
                  t.recentShowTeams.length > 0 && (
                    <div
                      style={{ fontSize: ".85rem", opacity: 0.8, marginTop: 4 }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>
                        Recent:
                      </div>
                      <div>
                        {t.recentShowTeams.slice(0, 3).map((r) => (
                          <div key={r.id} style={{ lineHeight: 1.2 }}>
                            {r.label}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            ))}

            {/* Manual add fallback */}
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                onClick={() => {
                  addTeamLocal(teamInput); // no Airtable ID
                  setTeamInput("");
                  setAddingTeam(false);
                  setSearchResults([]);
                }}
                style={{
                  padding: "0.5rem 0.75rem",
                  border: `1px solid ${theme.accent}`,
                  background: theme.accent,
                  color: "#fff",
                  borderRadius: "0.25rem",
                  cursor: "pointer",
                  flex: 1,
                }}
              >
                Add “{teamInput || "Unnamed"}”
              </button>
              <button
                onClick={() => setAddingTeam(false)}
                style={{
                  padding: "0.5rem 0.75rem",
                  border: "1px solid #ccc",
                  background: "#f7f7f7",
                  borderRadius: "0.25rem",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
