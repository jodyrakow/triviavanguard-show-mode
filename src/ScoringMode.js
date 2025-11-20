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
  poolContribution,
  setPoolContribution,
}) {
  const roundNumber = Number(selectedRoundId);

  // ---- Build question list for the round (compact shape for grid) ----
  const roundObj = useMemo(() => {
    if (!Array.isArray(showBundle?.rounds)) return null;
    return (
      showBundle.rounds.find((r) => Number(r.round) === roundNumber) || null
    );
  }, [showBundle, roundNumber]);

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
  const seededOnceRef = useRef(false);
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
  const tbRefs = useRef({});
  const onEnter = (fn) => (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      fn();
    }
  };
  const onEnterBlur = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };
  const lastScrollYRef = useRef(0);
  const lastFocusKeyRef = useRef(null);

  useEffect(() => {
    const onMark = (e) => {
      const { showId, roundId, teamId, showQuestionId, nowCorrect } =
        e.detail || {};

      // Scope to active show/round
      if (showId !== selectedShowId) return;
      if (roundId && roundId !== selectedRoundId) return;

      // Basic shape
      if (!teamId || !showQuestionId) return;

      // Ignore unknowns (avoid creating stray cells)
      if (!teams.some((t) => t.showTeamId === teamId)) return;
      if (!questions.some((q) => q.showQuestionId === showQuestionId)) return;

      setGrid((prev) => {
        const byTeam = prev[teamId] ? { ...prev[teamId] } : {};
        const cell = byTeam[showQuestionId] || {
          isCorrect: false,
          questionBonus: 0,
          overridePoints: null,
        };
        byTeam[showQuestionId] = { ...cell, isCorrect: !!nowCorrect };
        return { ...prev, [teamId]: byTeam };
      });
    };

    window.addEventListener("tv:mark", onMark);
    return () => window.removeEventListener("tv:mark", onMark);
  }, [selectedShowId, selectedRoundId, teams, questions]); // ✅ keep closure fresh

  useEffect(() => {
    const onTeamBonus = (e) => {
      const { teamId, showBonus, showId } = e.detail || {};
      if (!teamId) return;
      if (showId !== selectedShowId) return;
      setTeams((prev) =>
        prev.map((t) =>
          t.showTeamId === teamId
            ? { ...t, showBonus: Number(showBonus || 0) }
            : t
        )
      );
    };
    window.addEventListener("tv:teamBonus", onTeamBonus);
    return () => window.removeEventListener("tv:teamBonus", onTeamBonus);
    // We intentionally attach once; the handler itself handles latest state.
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, []);

  useEffect(() => {
    const onCellEdit = (e) => {
      const {
        showId,
        roundId,
        teamId,
        showQuestionId,
        questionBonus,
        overridePoints,
      } = e.detail || {};
      if (showId !== selectedShowId || roundId !== selectedRoundId) return;
      if (!teamId || !showQuestionId) return;

      setGrid((prev) => {
        const byTeam = prev[teamId] ? { ...prev[teamId] } : {};
        const cell = byTeam[showQuestionId] || {
          isCorrect: false,
          questionBonus: 0,
          overridePoints: null,
        };
        byTeam[showQuestionId] = {
          ...cell,
          questionBonus: Number(questionBonus || 0),
          overridePoints:
            overridePoints == null ? null : Number(overridePoints),
        };
        return { ...prev, [teamId]: byTeam };
      });
    };

    window.addEventListener("tv:cellEdit", onCellEdit);
    return () => window.removeEventListener("tv:cellEdit", onCellEdit);
  }, [selectedShowId, selectedRoundId]);

  useEffect(() => {
    const onTBEdit = (e) => {
      const {
        showId,
        roundId,
        teamId,
        showQuestionId,
        tiebreakerGuessRaw,
        tiebreakerGuess,
      } = e.detail || {};
      if (!teamId || !showQuestionId) return;

      // ✅ Guard against cross-show/round chatter
      if (showId !== selectedShowId || roundId !== selectedRoundId) return;

      setGrid((prev) => {
        const byTeam = prev[teamId] ? { ...prev[teamId] } : {};
        const cell = byTeam[showQuestionId] || {
          isCorrect: false,
          questionBonus: 0,
          overridePoints: null,
        };
        byTeam[showQuestionId] = {
          ...cell,
          tiebreakerGuessRaw: tiebreakerGuessRaw ?? "",
          tiebreakerGuess:
            tiebreakerGuess === null || tiebreakerGuess === undefined
              ? null
              : Number(tiebreakerGuess),
        };
        return { ...prev, [teamId]: byTeam };
      });
    };

    window.addEventListener("tv:tbEdit", onTBEdit);
    return () => window.removeEventListener("tv:tbEdit", onTBEdit);
  }, [selectedShowId, selectedRoundId]);

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
      const totalAfter = Math.max(0, teams.length - 1);
      const newTeamIdx = Math.min(f.teamIdx, Math.max(0, totalAfter - 1));
      return { teamIdx: newTeamIdx, qIdx: f.qIdx };
    });

    // inside removeTeam(showTeamId) AFTER updating teams/grid/entryOrder/focus
    try {
      window.sendTeamRemove?.({
        showId: selectedShowId,
        teamId: showTeamId,
        ts: Date.now(),
      });
    } catch {}
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

  const moveTeam = (teamId, delta) => {
    setEntryOrder((prev) => {
      const idx = prev.indexOf(teamId);
      if (idx === -1) return prev;
      const newIdx = Math.min(Math.max(0, idx + delta), prev.length - 1);
      const copy = [...prev];
      copy.splice(idx, 1);
      copy.splice(newIdx, 0, teamId);
      return copy;
    });
  };

  const openCellEditor = (showTeamId, showQuestionId) => {
    // remember where we were
    lastScrollYRef.current = window.scrollY;
    lastFocusKeyRef.current = `${showTeamId}:${showQuestionId}`;

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

  const restoreAfterModal = () => {
    requestAnimationFrame(() => {
      window.scrollTo({ top: lastScrollYRef.current });
      const el = cellRefs.current[lastFocusKeyRef.current];
      el?.focus?.();
      el?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    });
  };

  const closeCellEditor = () => {
    setEditingCell(null);
    restoreAfterModal();
  };

  const applyCellEditor = () => {
    if (!editingCell) return;
    const { showTeamId, showQuestionId, draftBonus, draftOverride } =
      editingCell;

    // ✅ Decide values BEFORE setGrid
    const nextBonus = Number(draftBonus || 0);
    const nextOverride =
      draftOverride === "" || draftOverride === null
        ? null
        : Number(draftOverride);

    setGrid((prev) => {
      const byTeam = prev[showTeamId] ? { ...prev[showTeamId] } : {};
      const cell = byTeam[showQuestionId] || {
        isCorrect: false,
        questionBonus: 0,
        overridePoints: null,
      };
      byTeam[showQuestionId] = {
        ...cell,
        questionBonus: nextBonus,
        overridePoints: nextOverride,
      };
      return { ...prev, [showTeamId]: byTeam };
    });

    // ✅ Broadcast with the precomputed values
    try {
      window.sendCellEdit?.({
        teamId: showTeamId,
        showQuestionId,
        questionBonus: nextBonus,
        overridePoints: nextOverride, // null = clear override
        ts: Date.now(),
      });
    } catch {}

    setEditingCell(null);
    restoreAfterModal();
  };

  // helper: coerce Airtable-ish shapes into what the grid expects
  const normalizeTeam = (t) => ({
    showTeamId: t.showTeamId || makeLocalId("team"),
    teamId: t.teamId ?? null,
    teamName: Array.isArray(t.teamName)
      ? t.teamName[0]
      : t.teamName || "(Unnamed team)",
    showBonus: Number(t.showBonus || 0),
    isLeague: !!t.isLeague, // Include league status
  });

  // Clear local state when the SHOW changes (not the round)
  useEffect(() => {
    setTeams([]);
    setGrid({});
    setEntryOrder([]);
    setFocus({ teamIdx: 0, qIdx: 0 });
    seededOnceRef.current = false; // allow a fresh seed for the new show
  }, [selectedShowId]);

  // Seed once we have a source (cache or preloadedTeams). Avoid seeding empty.
  useEffect(() => {
    if (seededOnceRef.current) return; // we've already seeded for this show
    if (teams.length > 0) return; // local already has teams (user-added)

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
    seededOnceRef.current = true; // ✅ don’t auto-import again
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

  useEffect(() => {
    const onTeamAdd = (e) => {
      const { showId, teamId, teamName } = e.detail || {};
      if (!teamId || !teamName) return;
      if (showId !== selectedShowId) return; // ✅ ignore other shows

      setTeams((prev) => {
        // skip if already present
        if (prev.some((t) => t.showTeamId === teamId)) return prev;
        return [...prev, { showTeamId: teamId, teamName, showBonus: 0 }];
      });

      setEntryOrder((prev) =>
        prev.includes(teamId) ? prev : [...prev, teamId]
      );
    };
    window.addEventListener("tv:teamAdd", onTeamAdd);
    return () => window.removeEventListener("tv:teamAdd", onTeamAdd);
  }, [selectedShowId]);

  useEffect(() => {
    const onTeamRemove = (e) => {
      const { showId, teamId } = e.detail || {};
      if (!teamId) return;
      if (showId !== selectedShowId) return; // ✅ ignore other shows

      // remove from local state
      setTeams((prev) => prev.filter((t) => t.showTeamId !== teamId));
      setGrid((prev) => {
        const next = { ...prev };
        delete next[teamId];
        return next;
      });
      setEntryOrder((prev) => prev.filter((id) => id !== teamId));

      // fix focus if we deleted the focused column
      setFocus((f) => {
        const newTeamCount = Math.max(0, renderTeams.length - 1);
        const clampedIdx = Math.max(0, Math.min(f.teamIdx, newTeamCount - 1));
        return { teamIdx: clampedIdx, qIdx: f.qIdx };
      });
    };

    window.addEventListener("tv:teamRemove", onTeamRemove);
    return () => window.removeEventListener("tv:teamRemove", onTeamRemove);
    // it's fine to leave deps empty; we only use setters
  }, [renderTeams.length, selectedShowId]);

  useEffect(() => {
    const onTeamRename = (e) => {
      const { showId, teamId, teamName } = e.detail || {};
      if (!teamId || !teamName) return;
      if (showId !== selectedShowId) return; // ✅ ignore other shows
      setTeams((prev) =>
        prev.map((t) => (t.showTeamId === teamId ? { ...t, teamName } : t))
      );
    };
    window.addEventListener("tv:teamRename", onTeamRename);
    return () => window.removeEventListener("tv:teamRename", onTeamRename);
  }, [selectedShowId]);

  const renameTeam = (showTeamId, nextName) => {
    const name = String(nextName ?? "").trim();
    if (!name) return;
    setTeams((prev) =>
      prev.map((t) =>
        t.showTeamId === showTeamId ? { ...t, teamName: name } : t
      )
    );
    try {
      window.sendTeamRename?.({
        showId: selectedShowId,
        teamId: showTeamId,
        teamName: name,
        ts: Date.now(),
      });
    } catch {}
  };

  const toggleLeague = (showTeamId, isLeague) => {
    setTeams((prev) =>
      prev.map((t) =>
        t.showTeamId === showTeamId ? { ...t, isLeague } : t
      )
    );
    try {
      window.sendLeagueToggle?.({
        showId: selectedShowId,
        teamId: showTeamId,
        isLeague,
        ts: Date.now(),
      });
    } catch {}
  };

  // ---------------- Focus + keyboard nav ----------------
  const [focus, setFocus] = useState({ teamIdx: 0, qIdx: 0 });
  useEffect(() => {
    setFocus((f) => ({
      teamIdx: Math.min(f.teamIdx, Math.max(renderTeams.length - 1, 0)),
      qIdx: Math.min(f.qIdx, Math.max(questions.length - 1, 0)),
    }));
  }, [renderTeams, questions.length]);

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
        const nextOn = !cell.isCorrect; // ✅ computed from *prev*, no stale closure
        byTeam[q.showQuestionId] = { ...cell, isCorrect: nextOn };

        // Broadcast inside the same scope so it sees the correct nextOn value:
        try {
          window.sendMark?.({
            showId: selectedShowId,
            roundId: selectedRoundId,
            teamId: t.showTeamId,
            teamName: t.teamName,
            showQuestionId: q.showQuestionId,
            questionOrder: q.order,
            nowCorrect: nextOn,
            ts: Date.now(),
          });
        } catch {}

        return { ...prev, [t.showTeamId]: byTeam };
      });
    },
    [renderTeams, questions, selectedShowId, selectedRoundId]
  );

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
        // If we're on the last grid row and there's a TB row, focus its input
        if (focus.qIdx === questions.length - 1 && tiebreaker) {
          const colTeam = teamMode
            ? visibleTeams[teamIdxSolo]
            : renderTeams[teamIdx];
          const input = colTeam ? tbRefs.current?.[colTeam.showTeamId] : null;
          if (input && typeof input.focus === "function") {
            input.focus();
            // make it obvious + bring it onscreen
            input.select?.();
            input.scrollIntoView?.({ block: "center", behavior: "smooth" });
            // brief highlight so you can SEE it moved
            input.style.outline = "2px solid #DC6A24";
            setTimeout(() => (input.style.outline = ""), 600);
            return; // stop here so we don't advance to next column
          }
        }
        // otherwise: advance to next question in this column
        setFocus(({ teamIdx: t, qIdx }) => ({
          teamIdx: teamMode ? teamIdxSolo : t,
          qIdx: (qIdx + 1) % questions.length, // ✅ wraps to top when at last row
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
        // If we're on the last grid row and there's a TB row, focus its input
        if (focus.qIdx === questions.length - 1 && tiebreaker) {
          const colTeam = teamMode
            ? visibleTeams[teamIdxSolo]
            : renderTeams[teamIdx];
          const input = colTeam ? tbRefs.current?.[colTeam.showTeamId] : null;
          if (input && typeof input.focus === "function") {
            input.focus();
            return; // stop here so we don't advance to next question
          }
        }

        // otherwise: advance down in the grid as usual
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
    nextTeam,
    prevTeam,
    toggleCell,
    tiebreaker,
    visibleTeams,
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

      // Increased to show full header + controls bar (including Team Scoring Mode button)
      const baseTopGuard = 180; // header (~55px) + controls bar (~100px) + margin/padding (~25px)
      const extraTeamBar =
        teamMode && teamBarRef.current
          ? teamBarRef.current.getBoundingClientRect().height || 0
          : 0;

      const topLimit = baseTopGuard + extraTeamBar;
      const bottomLimit = window.innerHeight - 56; // your BOTTOM_GUARD

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

      // Calculate base points based on scoring mode
      let base = 0;
      if (scoringMode === "pub") {
        // Use per-question pub value if provided, else global pubPoints
        const perQPub = pubPerQuestionByShowQ[showQuestionId];
        base = Number(
          perQPub !== null && perQPub !== undefined ? perQPub : pubPoints
        );
      } else if (scoringMode === "pooled-adaptive") {
        // Adaptive pool: teamCount × poolContribution, split among correct teams
        const pool = teams.length * Number(poolContribution);
        base = Math.round(pool / nCorrect);
      } else {
        // Static pooled: fixed pool split among correct teams
        base = Math.round(Number(poolPerQuestion) / nCorrect);
      }

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
      poolContribution,
      teams.length,
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

    // local update
    setTeams((prev) =>
      prev.map((t) =>
        t.showTeamId === showTeamId ? { ...t, showBonus: v } : t
      )
    );

    // broadcast to other browsers
    try {
      window.sendTeamBonus?.({
        showId: selectedShowId,
        teamId: showTeamId,
        showBonus: v,
        ts: Date.now(),
      });
    } catch {}
  };

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
    try {
      window.sendTeamAdd?.({
        showId: selectedShowId,
        teamId: newTeam.showTeamId,
        teamName: newTeam.teamName,
        ts: Date.now(),
      });
    } catch {}
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

    // ✅ NEW: realtime broadcast so other hosts update instantly
    try {
      window.sendTBEdit?.({
        showId: selectedShowId,
        roundId: selectedRoundId,
        teamId: showTeamId,
        showQuestionId: tiebreaker.id,
        tiebreakerGuessRaw: raw === "" || Number.isNaN(num) ? "" : String(num),
        tiebreakerGuess: raw === "" || Number.isNaN(num) ? null : num,
        ts: Date.now(),
      });
    } catch {}
  };

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

  // --------- Solos calculation ---------
  const solosData = useMemo(() => {
    const soloTeams = new Set();
    let soloCount = 0;

    // Build a map of team names
    const teamNames = new Map(
      teams.map((t) => [t.showTeamId, t.teamName || "(Unnamed team)"])
    );

    // Check each question
    for (const q of questions) {
      let correctCount = 0;
      let correctTeamId = null;

      for (const t of teams) {
        const cell = grid[t.showTeamId]?.[q.showQuestionId];
        if (cell?.isCorrect) {
          correctCount++;
          correctTeamId = t.showTeamId;
        }
      }

      // If exactly one team got it correct, it's a solo
      if (correctCount === 1 && correctTeamId) {
        soloCount++;
        const teamName = teamNames.get(correctTeamId);
        if (teamName) {
          soloTeams.add(teamName);
        }
      }
    }

    return {
      count: soloCount,
      teams: Array.from(soloTeams).sort(),
    };
  }, [questions, teams, grid]);

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
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
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
        {solosData.count > 0 && (
          <div
            style={{
              color: "#fff",
              fontFamily: tokens.font.body,
              fontSize: "1rem",
              marginRight: "1rem",
            }}
          >
            {solosData.count} solo{solosData.count !== 1 ? "s" : ""} this round:{" "}
            {solosData.teams.join(", ")}
          </div>
        )}
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
                title="Static pool size"
              >
                Pooled
              </button>
              <button
                style={ui.segBtn(scoringMode === "pooled-adaptive")}
                onClick={() => setScoringMode("pooled-adaptive")}
                title="Pool adapts based on team count"
              >
                Adaptive
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
                  onKeyDown={onEnterBlur}
                />
              </label>
            ) : scoringMode === "pooled-adaptive" ? (
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: ".35rem",
                }}
                title={`Current pool: ${teams.length} teams × ${poolContribution} = ${teams.length * poolContribution} pts/question`}
              >
                <span style={{ whiteSpace: "nowrap" }}>Pts/Team:</span>
                <input
                  type="number"
                  value={poolContribution}
                  min={0}
                  step={1}
                  onChange={(e) =>
                    setPoolContribution(Number(e.target.value || 0))
                  }
                  onKeyDown={onEnterBlur}
                  style={{
                    width: 70,
                    padding: ".3rem .4rem",
                    border: "1px solid #ccc",
                    borderRadius: ".35rem",
                  }}
                />
                <span style={{ fontSize: ".85rem", opacity: 0.7 }}>
                  (Pool: {teams.length * poolContribution})
                </span>
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
                  onKeyDown={onEnterBlur}
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
                  {/* Team name (renamable) */}
                  <div
                    style={{
                      fontSize: "0.95rem",
                      whiteSpace: "normal",
                      wordBreak: "break-word",
                      overflowWrap: "anywhere",
                      lineHeight: 1.1,
                      cursor: "pointer",
                    }}
                    title="Right-click or double-click to rename"
                    onDoubleClick={() => {
                      const v = window.prompt("Rename team:", t.teamName);
                      if (v !== null) renameTeam(t.showTeamId, v);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      const v = window.prompt("Rename team:", t.teamName);
                      if (v !== null) renameTeam(t.showTeamId, v);
                    }}
                  >
                    {t.teamName}
                  </div>

                  {/* League checkbox */}
                  <div
                    style={{
                      marginTop: "0.25rem",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.25rem",
                    }}
                  >
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        fontSize: "0.75rem",
                        cursor: "pointer",
                        userSelect: "none",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!!t.isLeague}
                        onChange={(e) => {
                          toggleLeague(t.showTeamId, e.target.checked);
                        }}
                        style={{ cursor: "pointer" }}
                      />
                      <span style={{ opacity: 0.85 }}>League</span>
                    </label>
                  </div>

                  {/* Move buttons */}
                  <div
                    style={{
                      marginTop: "0.25rem",
                      display: "flex",
                      gap: "0.25rem",
                      justifyContent: "center",
                    }}
                  >
                    <div
                      style={{
                        marginTop: "0.25rem",
                        display: "flex",
                        justifyContent: "center",
                      }}
                    >
                      <ui.Segmented
                        style={{
                          border: "1px solid rgba(220,106,36,0.65)", // thin orange border all around
                          borderRadius: "999px", // keep pill shape
                          overflow: "hidden",
                        }}
                      >
                        <button
                          style={ui.segBtn(false)}
                          onClick={() => moveTeam(t.showTeamId, -1)}
                          title="Move left"
                        >
                          ◀
                        </button>
                        <button
                          style={{
                            ...ui.segBtn(false),
                            borderLeft: "1px solid rgba(220,106,36,0.65)", // thin orange divider
                          }}
                          onClick={() => moveTeam(t.showTeamId, +1)}
                          title="Move right"
                        >
                          ▶
                        </button>
                      </ui.Segmented>
                    </div>
                  </div>

                  {/* Delete button */}
                  <button
                    aria-label={`Remove ${t.teamName}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeTeam(t.showTeamId);
                    }}
                    style={{
                      margin: "0.25rem auto 0",
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

                  {/* Totals */}
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
                  wordBreak: "break-word",
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
                    onKeyDown={onEnterBlur}
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
                  // 👇 use 0 when teamMode renders a single column
                  const renderIndex = teamMode ? 0 : ti;

                  const cell = grid[t.showTeamId]?.[q.showQuestionId];
                  const on = !!cell?.isCorrect;
                  // normalize focus to the single rendered column in team mode
                  const focusTeamIdx = teamMode ? 0 : focus.teamIdx;

                  // highlight should compare against the rendered index (0 in team mode)
                  const isFocused =
                    focusTeamIdx === renderIndex && focus.qIdx === qi;

                  const pts = earnedFor(cell, q.showQuestionId);

                  const style = {
                    ...tileBase,
                    ...(on ? tileStates.correct : tileStates.wrong),
                    ...(isFocused ? tileFocus : null),
                    scrollMarginTop: 8,
                    scrollMarginBottom: 8,
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
                        tabIndex={-1}
                        ref={(el) => {
                          cellRefs.current[
                            `${t.showTeamId}:${q.showQuestionId}`
                          ] = el;
                        }}
                        role="button"
                        aria-pressed={!!cell?.isCorrect}
                        // 👇 clicking outer area selects the cell without toggling
                        onClick={() => {
                          setFocus({
                            teamIdx: renderIndex,
                            qIdx: qi,
                          });
                        }}
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
                            ? `Correct — ${pts} pts\n(Click center to toggle • 1/Space to toggle • Double-click or Right-click for bonus/override)`
                            : `Incorrect\n(Click center to toggle • 1/Space to toggle • Double-click or Right-click for bonus/override)`
                        }
                      >
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleCell(renderIndex, qi);
                          }}
                          style={{ cursor: "pointer", display: "block" }}
                        >
                          {on ? `✓ ${pts}` : "○"}
                        </span>
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
                      ref={(el) => {
                        tbRefs.current[t.showTeamId] = el;
                      }}
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
                      onKeyDown={(e) => {
                        const goTopOfSameTeam = () => {
                          e.preventDefault();
                          setFocus({ teamIdx: 0, qIdx: 0 });
                          e.currentTarget.blur(); // leave the TB field so focus returns to grid
                        };

                        const goNextColumnToRow0 = () => {
                          e.preventDefault();
                          setFocus(({ teamIdx }) => ({
                            teamIdx: Math.min(
                              teamIdx + 1,
                              renderTeams.length - 1
                            ),
                            qIdx: 0,
                          }));
                          e.currentTarget.blur();
                        };
                        if (e.key === "Enter") {
                          commitTBGuess(t.showTeamId);
                          if (teamMode) goTopOfSameTeam();
                          else goNextColumnToRow0();
                          return;
                        }
                        if (e.key === "Tab" && !e.shiftKey) {
                          if (teamMode) goTopOfSameTeam();
                          else goNextColumnToRow0();
                        } else if (e.key === "ArrowDown") {
                          if (teamMode) goTopOfSameTeam();
                          else goNextColumnToRow0();
                        }
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
                  autoFocus
                  type="number"
                  value={editingCell.draftBonus}
                  onChange={(e) =>
                    setEditingCell((p) => ({
                      ...p,
                      draftBonus: Number(e.target.value || 0),
                    }))
                  }
                  onKeyDown={onEnter(applyCellEditor)}
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
                  onKeyDown={onEnter(applyCellEditor)}
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
              autoFocus
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
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (searchResults.length > 0) {
                    const t = searchResults[0];
                    addTeamLocal(t.name, t.id);
                  } else if (teamInput.trim()) {
                    addTeamLocal(teamInput.trim());
                  }
                  setTeamInput("");
                  setAddingTeam(false);
                  setSearchResults([]);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setAddingTeam(false);
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
