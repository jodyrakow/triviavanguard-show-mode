// App.js
import React, { useEffect, useState, useRef, useMemo } from "react";
import axios from "axios";
import "./App.css";
import "react-h5-audio-player/lib/styles.css";
import ShowMode from "./ShowMode";
import ScoringMode from "./ScoringMode";
import ResultsMode from "./ResultsMode";
import AnswersMode from "./AnswersMode";
import {
  ButtonTab,
  ButtonPrimary,
  colors,
  tokens,
  ui,
  Button,
} from "./styles/index.js";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// 🔐 PASSWORD PROTECTION
const allowedPassword = "tv2025";
const passwordKey = "showPasswordAuthorized";
const isAuthorized = sessionStorage.getItem(passwordKey);
if (!isAuthorized) {
  const enteredPassword = prompt("Enter show password:");
  if (enteredPassword?.toLowerCase() === allowedPassword.toLowerCase()) {
    sessionStorage.setItem(passwordKey, "true");
  } else {
    document.body.innerHTML =
      "<h2 style='font-family:sans-serif;'>Access denied.</h2>";
    throw new Error("Unauthorized access");
  }
}

export default function App() {
  // Core app state
  const [shows, setShows] = useState([]);
  const [selectedShowId, setSelectedShowId] = useState("");
  const [olderShowsOpen, setOlderShowsOpen] = useState(false);
  const [olderShows, setOlderShows] = useState([]);
  const [selectedRoundId, setSelectedRoundId] = useState(""); // string (e.g. "1")
  const [showDetails, setshowDetails] = useState(true);
  const [visibleImages, setVisibleImages] = useState({});
  const questionRefs = useRef({});
  const [visibleCategoryImages, setVisibleCategoryImages] = useState({});
  const [activeMode, setActiveMode] = useState("show");
  const [currentImageIndex, setCurrentImageIndex] = useState({});
  const timerRef = useRef(null);
  const [rtStatus, setRtStatus] = useState("INIT"); // ✅ moved inside

  // Bundle (rounds+questions+teams)
  const [showBundle, setShowBundle] = useState(null);
  const [bundleLoading, setBundleLoading] = React.useState(false);
  const [bundleError, setBundleError] = React.useState(null);

  const currentShowIdRef = useRef(selectedShowId);
  useEffect(() => {
    currentShowIdRef.current = selectedShowId;
  }, [selectedShowId]);

  // Scoring cache across mode switches
  const [scoringCache, setScoringCache] = useState({});
  // Restore scoring backup (if any) on app load
  useEffect(() => {
    try {
      const raw = localStorage.getItem("trivia.scoring.backup");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setScoringCache(parsed);
        }
      }
    } catch (err) {
      console.warn("Failed to load scoring backup:", err);
    }
  }, []);

  // Question edits cache: { [showId]: { [showQuestionId]: { question?, flavorText?, answer? } } }
  const [questionEdits, setQuestionEdits] = useState({});
  // Restore question edits backup (if any) on app load
  useEffect(() => {
    try {
      const raw = localStorage.getItem("trivia.questionEdits.backup");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setQuestionEdits(parsed);
        }
      }
    } catch (err) {
      console.warn("Failed to load question edits backup:", err);
    }
  }, []);

  // Timer state
  const [timerPosition, setTimerPosition] = useState({ x: 0, y: 0 });
  const [timerDuration, setTimerDuration] = useState(60);
  const [timeLeft, setTimeLeft] = useState(60);
  const [timerRunning, setTimerRunning] = useState(false);

  // App.js (top of component state)
  const [showTimer, setShowTimer] = useState(
    () => localStorage.getItem("tv_showTimer") !== "false"
  );

  useEffect(() => {
    localStorage.setItem("tv_showTimer", String(showTimer));
  }, [showTimer]);

  // Global scoring settings
  const [scoringMode, setScoringMode] = useState(
    () => localStorage.getItem("tv_scoringMode") || "pub"
  );
  const [pubPoints, setPubPoints] = useState(
    () => Number(localStorage.getItem("tv_pubPoints")) || 10
  );
  const [poolPerQuestion, setPoolPerQuestion] = useState(
    () => Number(localStorage.getItem("tv_poolPerQuestion")) || 500
  );

  // Persist scoring settings to localStorage, scoringCache, and Supabase
  useEffect(() => {
    localStorage.setItem("tv_scoringMode", scoringMode);
    localStorage.setItem("tv_pubPoints", String(pubPoints));
    localStorage.setItem("tv_poolPerQuestion", String(poolPerQuestion));

    if (!selectedShowId) return;

    setScoringCache((prev) => {
      const show = prev[selectedShowId] || {};
      const shared = show._shared || {
        teams: [],
        entryOrder: [],
        prizes: "",
        scoringMode: "pub",
        pubPoints: 10,
        poolPerQuestion: 500,
      };

      const nextShared = { ...shared, scoringMode, pubPoints, poolPerQuestion };

      const next = {
        ...prev,
        [selectedShowId]: {
          ...show,
          _shared: nextShared,
        },
      };

      // Save to Supabase
      saveDebounced("shared", () => {
        fetch("/.netlify/functions/supaSaveScoring", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            showId: selectedShowId,
            roundId: "shared",
            payload: {
              teams: nextShared.teams ?? [],
              entryOrder: nextShared.entryOrder ?? [],
              prizes: nextShared.prizes ?? "",
              scoringMode: nextShared.scoringMode ?? "pub",
              pubPoints: nextShared.pubPoints ?? 10,
              poolPerQuestion: nextShared.poolPerQuestion ?? 500,
            },
          }),
        }).catch(() => {});
      });

      // Broadcast to other hosts
      try {
        window.tvSend?.("scoringSettingsUpdate", {
          showId: selectedShowId,
          scoringMode,
          pubPoints,
          poolPerQuestion,
          ts: Date.now(),
        });
      } catch {}

      try {
        localStorage.setItem("trivia.scoring.backup", JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [scoringMode, selectedShowId, poolPerQuestion, pubPoints]);

  useEffect(() => {
    const savedPosition = localStorage.getItem("timerPosition");
    if (savedPosition) {
      try {
        setTimerPosition(JSON.parse(savedPosition));
      } catch {}
    }

    if (!timerRunning) return;

    if (timeLeft <= 0) {
      setTimeLeft(timerDuration); // reset the clock
      setTimerRunning(false); // stop after reset
      return;
    }

    const t = setTimeout(
      () => setTimeLeft((prev) => Math.max(prev - 1, 0)),
      1000
    );
    return () => clearTimeout(t);
  }, [timerRunning, timeLeft, timerDuration]);

  const handleStartPause = () => setTimerRunning((p) => !p);
  const handleReset = () => {
    setTimerRunning(false);
    setTimeLeft(timerDuration);
  };
  const handleDurationChange = (e) => {
    const newDuration = parseInt(e.target.value);
    setTimerDuration(newDuration);
    setTimeLeft(newDuration);
  };

  useEffect(() => {
    if (!supabase) return;

    const ch = supabase.channel("tv-sanity", {
      config: { broadcast: { ack: true } },
    });

    // queue + ready flag + unified sender
    window._tvReady = false;
    window._tvQueue = [];
    window.tvSend = (event, payload) => {
      if (!window._tvReady) {
        window._tvQueue.push({ event, payload });
        return;
      }
      return ch.send({ type: "broadcast", event, payload });
    };

    // event handlers -> DOM CustomEvents
    ch.on("broadcast", { event: "ping" }, (payload) => {
      console.log("[realtime] ping received:", payload);
    });
    ch.on("broadcast", { event: "mark" }, (msg) => {
      const data = msg?.payload ?? msg;
      window.dispatchEvent(new CustomEvent("tv:mark", { detail: data }));

      // Also update scoringCache so isCorrect persists
      const { showId, roundId, teamId, showQuestionId, nowCorrect } =
        data || {};
      if (!showId || !roundId || !teamId || !showQuestionId) return;

      setScoringCache((prev) => {
        const show = prev[showId] || {};
        const round = show[roundId] || { grid: {} };
        const byTeam = round.grid?.[teamId] ? { ...round.grid[teamId] } : {};
        const cell = byTeam[showQuestionId] || {
          isCorrect: false,
          questionBonus: 0,
          overridePoints: null,
        };

        byTeam[showQuestionId] = {
          ...cell,
          isCorrect: !!nowCorrect,
        };

        const next = {
          ...prev,
          [showId]: {
            ...show,
            [roundId]: {
              ...round,
              grid: { ...(round.grid || {}), [teamId]: byTeam },
            },
          },
        };

        try {
          localStorage.setItem("trivia.scoring.backup", JSON.stringify(next));
        } catch {}
        return next;
      });
    });
    ch.on("broadcast", { event: "cellEdit" }, (msg) => {
      const data = msg?.payload ?? msg;
      window.dispatchEvent(new CustomEvent("tv:cellEdit", { detail: data }));

      // Also update scoringCache so bonus/override persists
      const {
        showId,
        roundId,
        teamId,
        showQuestionId,
        questionBonus,
        overridePoints,
      } = data || {};
      if (!showId || !roundId || !teamId || !showQuestionId) return;

      setScoringCache((prev) => {
        const show = prev[showId] || {};
        const round = show[roundId] || { grid: {} };
        const byTeam = round.grid?.[teamId] ? { ...round.grid[teamId] } : {};
        const cell = byTeam[showQuestionId] || {
          isCorrect: false,
          questionBonus: 0,
          overridePoints: null,
        };

        byTeam[showQuestionId] = {
          ...cell,
          questionBonus: Number(questionBonus || 0),
          overridePoints:
            overridePoints === null || overridePoints === undefined
              ? null
              : Number(overridePoints),
        };

        const next = {
          ...prev,
          [showId]: {
            ...show,
            [roundId]: {
              ...round,
              grid: { ...(round.grid || {}), [teamId]: byTeam },
            },
          },
        };

        try {
          localStorage.setItem("trivia.scoring.backup", JSON.stringify(next));
        } catch {}
        return next;
      });
    });
    ch.on("broadcast", { event: "teamBonus" }, (msg) => {
      const data = msg?.payload ?? msg;
      window.dispatchEvent(new CustomEvent("tv:teamBonus", { detail: data }));

      const { showId, teamId, showBonus } = data || {};
      if (!showId || !teamId) return;
      if (showId !== currentShowIdRef.current) return;

      setScoringCache((prev) => {
        const show = prev[showId] || {};
        const shared = show._shared || {
          teams: [],
          entryOrder: [],
          prizes: "",
          scoringMode: "pub",
          pubPoints: 10,
          poolPerQuestion: 500,
        };

        const nextTeams = (shared.teams || []).map((t) =>
          t.showTeamId === teamId
            ? { ...t, showBonus: Number(showBonus || 0) }
            : t
        );

        const next = {
          ...prev,
          [showId]: {
            ...show,
            _shared: { ...shared, teams: nextTeams },
          },
        };

        try {
          localStorage.setItem("trivia.scoring.backup", JSON.stringify(next));
        } catch {}
        return next;
      });
    });
    // TEAM ADDED
    ch.on("broadcast", { event: "teamAdd" }, (msg) => {
      const data = msg?.payload ?? msg;
      window.dispatchEvent(new CustomEvent("tv:teamAdd", { detail: data }));

      const { showId, teamId, teamName } = data || {};
      if (!showId || !teamId || !teamName) return;
      if (showId !== currentShowIdRef.current) return;

      setScoringCache((prev) => {
        const show = prev[showId] || {};
        const shared = show._shared || {
          teams: [],
          entryOrder: [],
          prizes: "",
          scoringMode: "pub",
          pubPoints: 10,
          poolPerQuestion: 500,
        };

        // skip if already present
        if (shared.teams?.some((t) => t.showTeamId === teamId)) return prev;

        const nextTeams = [
          ...(shared.teams || []),
          {
            showTeamId: teamId,
            teamName,
            showBonus: 0,
          },
        ];
        const nextEntry = shared.entryOrder?.includes(teamId)
          ? shared.entryOrder
          : [...(shared.entryOrder || []), teamId];

        const next = {
          ...prev,
          [showId]: {
            ...show,
            _shared: { ...shared, teams: nextTeams, entryOrder: nextEntry },
          },
        };

        try {
          localStorage.setItem("trivia.scoring.backup", JSON.stringify(next));
        } catch {}
        return next;
      });
    });

    ch.on("broadcast", { event: "teamRename" }, (msg) => {
      const data = msg?.payload ?? msg;
      window.dispatchEvent(new CustomEvent("tv:teamRename", { detail: data }));

      const { showId, teamId, teamName } = data || {};
      if (!showId || !teamId || !teamName) return;
      if (showId !== currentShowIdRef.current) return;

      setScoringCache((prev) => {
        const show = prev[showId] || {};
        const shared = show._shared || {
          teams: [],
          entryOrder: [],
          prizes: "",
          scoringMode: "pub",
          pubPoints: 10,
          poolPerQuestion: 500,
        };

        const nextTeams = (shared.teams || []).map((t) =>
          t.showTeamId === teamId ? { ...t, teamName } : t
        );

        const next = {
          ...prev,
          [showId]: {
            ...show,
            _shared: { ...shared, teams: nextTeams },
          },
        };

        try {
          localStorage.setItem("trivia.scoring.backup", JSON.stringify(next));
        } catch {}
        return next;
      });
    });

    ch.on("broadcast", { event: "teamRemove" }, (msg) => {
      const data = msg?.payload ?? msg;
      window.dispatchEvent(new CustomEvent("tv:teamRemove", { detail: data }));

      const { showId, teamId } = data || {};
      if (!showId || !teamId) return;
      if (showId !== currentShowIdRef.current) return;

      setScoringCache((prev) => {
        const show = prev[showId] || {};
        const shared = show._shared || {
          teams: [],
          entryOrder: [],
          prizes: "",
          scoringMode: "pub",
          pubPoints: 10,
          poolPerQuestion: 500,
        };

        const nextTeams = (shared.teams || []).filter(
          (t) => t.showTeamId !== teamId
        );
        const nextEntry = (shared.entryOrder || []).filter(
          (id) => id !== teamId
        );

        const next = {
          ...prev,
          [showId]: {
            ...show,
            _shared: { ...shared, teams: nextTeams, entryOrder: nextEntry },
          },
        };

        try {
          localStorage.setItem("trivia.scoring.backup", JSON.stringify(next));
        } catch {}
        return next;
      });
    });
    // TIEBREAKER EDIT
    ch.on("broadcast", { event: "tbEdit" }, (msg) => {
      const data = msg?.payload ?? msg;

      // 1) Keep the DOM event for ScoringMode if it's mounted
      window.dispatchEvent(new CustomEvent("tv:tbEdit", { detail: data }));

      // 2) ALSO patch scoringCache so late-joining hosts see the latest guess
      const {
        showId, // string
        roundId, // string
        teamId, // showTeamId
        showQuestionId, // tb question id
        tiebreakerGuessRaw,
        tiebreakerGuess,
      } = data || {};

      if (!showId || !roundId || !teamId || !showQuestionId) return;
      if (showId !== currentShowIdRef.current) return;

      setScoringCache((prev) => {
        const show = prev[showId] || {};
        const round = show[roundId] || { grid: {} };

        const byTeam = round.grid?.[teamId] ? { ...round.grid[teamId] } : {};
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

        const next = {
          ...prev,
          [showId]: {
            ...show,
            [roundId]: {
              ...round,
              grid: { ...(round.grid || {}), [teamId]: byTeam },
            },
          },
        };

        try {
          localStorage.setItem("trivia.scoring.backup", JSON.stringify(next));
        } catch {}
        return next;
      });
    });

    ch.on("broadcast", { event: "prizesUpdate" }, (msg) => {
      const data = msg?.payload ?? msg;
      const showId = data?.showId;
      const val = typeof data?.prizes === "string" ? data.prizes : "";
      if (!showId) return;
      if (showId !== currentShowIdRef.current) return;

      setScoringCache((prev) => {
        const show = prev[showId] || {};
        const shared = show._shared || {
          teams: [],
          entryOrder: [],
          prizes: "",
          scoringMode: "pub",
          pubPoints: 10,
          poolPerQuestion: 500,
        };
        const nextShared = { ...shared, prizes: val };
        return {
          ...prev,
          [showId]: { ...show, _shared: nextShared },
        };
      });
    });

    ch.on("broadcast", { event: "scoringSettingsUpdate" }, (msg) => {
      const data = msg?.payload ?? msg;
      const {
        showId,
        scoringMode: mode,
        pubPoints: pub,
        poolPerQuestion: pool,
      } = data || {};
      if (!showId) return;
      if (showId !== currentShowIdRef.current) return;

      // Update local state
      if (mode !== undefined) setScoringMode(mode);
      if (pub !== undefined) setPubPoints(Number(pub));
      if (pool !== undefined) setPoolPerQuestion(Number(pool));

      // Update cache
      setScoringCache((prev) => {
        const show = prev[showId] || {};
        const shared = show._shared || {
          teams: [],
          entryOrder: [],
          prizes: "",
          scoringMode: "pub",
          pubPoints: 10,
          poolPerQuestion: 500,
        };
        const nextShared = {
          ...shared,
          ...(mode !== undefined && { scoringMode: mode }),
          ...(pub !== undefined && { pubPoints: Number(pub) }),
          ...(pool !== undefined && { poolPerQuestion: Number(pool) }),
        };
        return {
          ...prev,
          [showId]: { ...show, _shared: nextShared },
        };
      });
    });

    // QUESTION EDIT
    ch.on("broadcast", { event: "questionEdit" }, (msg) => {
      const data = msg?.payload ?? msg;
      const { showId, showQuestionId, question, flavorText, answer } = data || {};
      if (!showId || !showQuestionId) return;
      if (showId !== currentShowIdRef.current) return;

      setQuestionEdits((prev) => {
        const showEdits = prev[showId] || {};
        const questionEdit = showEdits[showQuestionId] || {};

        const updatedEdit = {
          ...questionEdit,
          ...(question !== undefined && { question }),
          ...(flavorText !== undefined && { flavorText }),
          ...(answer !== undefined && { answer }),
        };

        const next = {
          ...prev,
          [showId]: {
            ...showEdits,
            [showQuestionId]: updatedEdit,
          },
        };

        try {
          localStorage.setItem("trivia.questionEdits.backup", JSON.stringify(next));
        } catch {}
        return next;
      });
    });

    // expose helpers (safe via tvSend queue)
    window.sendMark = (payload) => window.tvSend("mark", payload);
    // App.js (right after window.tvSend is defined)
    window.sendTBEdit = (payload) => window.tvSend("tbEdit", payload);
    window.sendCellEdit = (payload) => window.tvSend("cellEdit", payload);
    window.sendTeamBonus = (payload) => window.tvSend("teamBonus", payload);
    window.sendTeamAdd = (payload) => window.tvSend("teamAdd", payload);
    window.sendTeamRename = (payload) => window.tvSend("teamRename", payload);
    window.sendTeamRemove = (payload) => window.tvSend("teamRemove", payload);
    window.sendQuestionEdit = (payload) => window.tvSend("questionEdit", payload);

    setRtStatus("SUBSCRIBING");
    ch.subscribe((status) => {
      setRtStatus(status); // "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR"
      if (status === "SUBSCRIBED") {
        console.log("[realtime] joined tv-sanity");
        window._tvReady = true;
        if (window._tvQueue?.length) {
          const q = window._tvQueue.splice(0);
          q.forEach(({ event, payload }) =>
            ch.send({ type: "broadcast", event, payload })
          );
        }
      }
    });

    // single cleanup
    return () => {
      try {
        delete window.sendMark;
        delete window.sendCellEdit;
        delete window.sendTeamBonus;
        delete window.sendTeamAdd;
        delete window.sendTeamRename;
        delete window.sendTeamRemove;
        delete window.tvSend;
        delete window.sendTBEdit;
        delete window.sendQuestionEdit;
      } catch {}
      window._tvReady = false;
      window._tvQueue = [];
      try {
        supabase.removeChannel(ch);
      } catch {}
      setRtStatus("CLOSED");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once; supabase is module-constant

  // Utils
  function numberToLetter(n) {
    return String.fromCharCode(64 + n);
  }

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        try {
          window.tvSend?.("ping", { at: Date.now() });
        } catch {}
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    if (!selectedShowId || !selectedRoundId) return;

    (async () => {
      try {
        const res = await fetch(
          `/.netlify/functions/supaLoadScoring?showId=${encodeURIComponent(selectedShowId)}&roundId=${encodeURIComponent(selectedRoundId)}`
        );
        const json = await res.json();

        setScoringCache((prev) => {
          const prevShow = prev[selectedShowId] || {};
          const loadedShared = json.shared ??
            prevShow._shared ?? {
              teams: [],
              entryOrder: [],
              prizes: "",
              scoringMode: "pub",
              pubPoints: 10,
              poolPerQuestion: 500,
            };

          // Update local scoring state from loaded data
          if (loadedShared.scoringMode)
            setScoringMode(loadedShared.scoringMode);
          if (loadedShared.pubPoints !== undefined)
            setPubPoints(Number(loadedShared.pubPoints));
          if (loadedShared.poolPerQuestion !== undefined)
            setPoolPerQuestion(Number(loadedShared.poolPerQuestion));

          // 🔧 FIX: Merge the new round data instead of replacing the entire show cache
          const updatedRound = json.round ?? prevShow[selectedRoundId] ?? { grid: {} };

          return {
            ...prev,
            [selectedShowId]: {
              ...prevShow, // preserve all existing rounds
              _shared: loadedShared,
              [selectedRoundId]: updatedRound, // update only the current round
            },
          };
        });
      } catch (e) {
        console.warn("supaLoadScoring failed", e);
        // falls back to whatever is in local scoringCache/localStorage
      }
    })();
  }, [selectedShowId, selectedRoundId]);

  const getClosestQuestionKey = () => {
    const viewportCenter = window.innerHeight / 2;
    let closestKey = null;
    let closestDistance = Infinity;
    for (const [key, ref] of Object.entries(questionRefs.current)) {
      if (ref?.current) {
        const rect = ref.current.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height / 2 - viewportCenter);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestKey = key;
        }
      }
    }
    return closestKey;
  };

  const saveTimers = useRef({}); // {shared, round}

  const saveDebounced = (key, fn, delay = 350) => {
    clearTimeout(saveTimers.current[key]);
    saveTimers.current[key] = setTimeout(fn, delay);
  };

  // Fetch shows
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get("/.netlify/functions/fetchShows");
        setShows(res.data?.Shows || []);
      } catch (err) {
        console.error("Error fetching shows:", err);
      }
    })();
  }, []);

  // Fetch bundle for selected show
  useEffect(() => {
    if (!selectedShowId) {
      setShowBundle(null);
      setSelectedRoundId("");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setBundleLoading(true);
        setBundleError("");
        const res = await axios.get("/.netlify/functions/fetchShowBundle", {
          params: { showId: selectedShowId },
        });
        if (cancelled) return;

        const bundle = res.data || null;
        setShowBundle(bundle);

        // set default round if needed
        const roundNums = (bundle?.rounds || [])
          .map((r) => Number(r.round))
          .filter((n) => Number.isFinite(n));
        const uniqueSorted = Array.from(new Set(roundNums)).sort(
          (a, b) => a - b
        );

        if (!uniqueSorted.length) {
          setSelectedRoundId("");
        } else if (!uniqueSorted.includes(Number(selectedRoundId))) {
          setSelectedRoundId(String(uniqueSorted[0]));
        }
      } catch (e) {
        if (!cancelled) {
          setBundleError("Failed to load show data.");
          console.error(e);
        }
      } finally {
        if (!cancelled) setBundleLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // only depend on selectedShowId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedShowId]);

  // Round numbers for dropdown (from bundle)
  const roundNumbers = useMemo(() => {
    const arr = (showBundle?.rounds || [])
      .map((r) => Number(r.round))
      .filter((n) => Number.isFinite(n));
    return Array.from(new Set(arr)).sort((a, b) => a - b);
  }, [showBundle]);

  const patchShared = (patch) => {
    setScoringCache((prev) => {
      const show = prev[selectedShowId] || {};
      const shared = show._shared || { teams: [], entryOrder: [], prizes: "" };

      // merge the change (patch) into shared
      const nextShared = { ...shared, ...patch };

      const next = {
        ...prev,
        [selectedShowId]: {
          ...show,
          _shared: nextShared,
          [selectedRoundId]: show[selectedRoundId] || { grid: {} },
        },
      };

      // Persist to Supabase using values from nextShared
      saveDebounced("shared", () => {
        fetch("/.netlify/functions/supaSaveScoring", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            showId: selectedShowId,
            roundId: "shared",
            payload: {
              teams: nextShared.teams ?? [],
              entryOrder: nextShared.entryOrder ?? [],
              prizes: nextShared.prizes ?? "",
              scoringMode: nextShared.scoringMode ?? "pub",
              pubPoints: nextShared.pubPoints ?? 10,
              poolPerQuestion: nextShared.poolPerQuestion ?? 500,
            },
          }),
        }).catch(() => {});
      });

      // Realtime broadcast so other hosts update instantly
      try {
        window.tvSend?.("prizesUpdate", {
          showId: selectedShowId,
          prizes: nextShared.prizes ?? "",
          ts: Date.now(),
        });
      } catch {}

      // optional local backup
      try {
        localStorage.setItem("trivia.scoring.backup", JSON.stringify(next));
      } catch {}

      return next;
    });
  };

  // 🔸 Compose a single cachedState shape shared by all modes
  const composedCachedState = (() => {
    const showCache = scoringCache[selectedShowId] ?? {};
    const shared = showCache._shared ?? null; // { teams, entryOrder }
    const roundCache = showCache[selectedRoundId] ?? null; // { grid }
    if (!shared && !roundCache) return null;
    return {
      teams: shared?.teams ?? [],
      entryOrder: shared?.entryOrder ?? [],
      grid: roundCache?.grid ?? {},
      prizes: shared?.prizes ?? "",
    };
  })();

  // 🔸 Merge question edits into showBundle for display
  const showBundleWithEdits = useMemo(() => {
    if (!showBundle) return null;
    const edits = questionEdits[selectedShowId];
    if (!edits || Object.keys(edits).length === 0) return showBundle;

    // Deep clone and apply edits
    const updatedBundle = {
      ...showBundle,
      rounds: (showBundle.rounds || []).map((round) => ({
        ...round,
        questions: (round.questions || []).map((q) => {
          const edit = edits[q.id];
          if (!edit) return q;

          return {
            ...q,
            ...(edit.question !== undefined && { questionText: edit.question }),
            ...(edit.flavorText !== undefined && { flavorText: edit.flavorText }),
            ...(edit.answer !== undefined && { answer: edit.answer }),
            _edited: true, // flag for UI to show indicator
          };
        }),
      })),
    };

    return updatedBundle;
  }, [showBundle, questionEdits, selectedShowId]);

  // Helper function to edit a question field
  const editQuestionField = (showQuestionId, field, value) => {
    setQuestionEdits((prev) => {
      const showEdits = prev[selectedShowId] || {};
      const questionEdit = showEdits[showQuestionId] || {};

      const updatedEdit = {
        ...questionEdit,
        [field]: value,
      };

      const next = {
        ...prev,
        [selectedShowId]: {
          ...showEdits,
          [showQuestionId]: updatedEdit,
        },
      };

      try {
        localStorage.setItem("trivia.questionEdits.backup", JSON.stringify(next));
      } catch {}

      // Broadcast to other hosts
      try {
        window.sendQuestionEdit?.({
          showId: selectedShowId,
          showQuestionId,
          [field]: value,
        });
      } catch {}

      return next;
    });
  };

  // Helper function to add a tiebreaker question
  const addTiebreaker = (questionText, answer) => {
    if (!showBundle || !selectedRoundId) return;

    const tiebreakerQuestion = {
      id: `tb-${Date.now()}`,
      questionId: [`tb-${Date.now()}`],
      questionOrder: "TB",
      questionText,
      flavorText: "",
      answer,
      questionType: "Tiebreaker",
      sortOrder: 9999, // Put it at the end
      categoryName: "Tiebreaker",
      categoryDescription: "",
      categoryOrder: 9999,
      categoryImages: [],
      categoryAudio: [],
      questionImages: [],
      questionAudio: [],
      pointsPerQuestion: null,
      _edited: false,
      _addedByHost: true, // Flag to indicate it was added during the show
    };

    setShowBundle((prev) => {
      if (!prev) return prev;

      const updatedRounds = prev.rounds.map((r) => {
        if (Number(r.round) === Number(selectedRoundId)) {
          // Check if tiebreaker already exists
          const hasTB = r.questions.some(
            (q) =>
              (q.questionType || "").toLowerCase() === "tiebreaker" ||
              String(q.questionOrder).toUpperCase() === "TB"
          );
          if (hasTB) {
            alert("This round already has a tiebreaker.");
            return r;
          }
          return {
            ...r,
            questions: [...r.questions, tiebreakerQuestion],
          };
        }
        return r;
      });

      return { ...prev, rounds: updatedRounds };
    });

    // Store in localStorage for persistence
    try {
      const key = `trivia.addedTiebreaker.${selectedShowId}.${selectedRoundId}`;
      localStorage.setItem(key, JSON.stringify(tiebreakerQuestion));
    } catch {}

    // Broadcast to other hosts
    try {
      window.sendTiebreakerAdded?.({
        showId: selectedShowId,
        roundId: selectedRoundId,
        tiebreaker: tiebreakerQuestion,
      });
    } catch {}
  };

  // UI
  return (
    <div
      style={{
        fontFamily: tokens.font.display,
        padding: tokens.spacing.xl,
        backgroundColor: colors.bg,
      }}
    >
      <h1
        style={{
          fontSize: "3rem",
          color: colors.dark,
          marginTop: tokens.spacing.xl,
          marginBottom: "0",
        }}
      >
        TriviaVanguard
      </h1>
      <h2
        style={{
          fontSize: "1.75rem",
          color: colors.dark,
          textIndent: "0.75rem",
          marginTop: "-.25rem",
        }}
      >
        {activeMode === "score"
          ? "Scoring mode"
          : activeMode === "results"
            ? "Results mode"
            : "Show mode"}
      </h2>

      <div
        style={{
          display: "flex",
          justifyContent: "left",
          gap: tokens.spacing.sm,
          marginTop: tokens.spacing.md,
          marginBottom: tokens.spacing.md,
        }}
      >
        <ButtonTab
          active={activeMode === "show"}
          onClick={() => setActiveMode("show")}
        >
          Show mode
        </ButtonTab>

        <ButtonTab
          active={activeMode === "score"}
          onClick={() => setActiveMode("score")}
        >
          Scoring mode
        </ButtonTab>

        <ButtonTab
          active={activeMode === "answers"}
          onClick={() => setActiveMode("answers")}
        >
          Answers mode
        </ButtonTab>

        <ButtonTab
          active={activeMode === "results"}
          onClick={() => setActiveMode("results")}
        >
          Results mode
        </ButtonTab>
      </div>
      <div style={{ fontSize: ".9rem", opacity: 0.85 }}>
        Realtime: <strong>{rtStatus}</strong>
      </div>

      <div>
        <label
          style={{
            fontSize: "1.25rem",
            color: colors.dark,
            marginRight: tokens.spacing.md,
          }}
        >
          Select Show:
          <select
            value={selectedShowId}
            onChange={(e) => {
              const newId = e.target.value;

              // Special case: "View older shows" option
              if (newId === "__OLDER__") {
                setOlderShowsOpen(true);
                return;
              }

              if (!selectedShowId || selectedShowId === newId) {
                setSelectedShowId(newId);
                setSelectedRoundId("");
                return;
              }

              const ok = window.confirm(
                "Switch shows? This will delete all scores and data you've entered for the current show."
              );
              if (!ok) return;

              // Clear in-memory, per-show UI bits
              setSelectedRoundId("");
              setVisibleImages({});
              setVisibleCategoryImages({});
              setCurrentImageIndex({});

              setSelectedShowId(newId);
            }}
            style={{
              fontSize: "1.25rem",
              fontFamily: tokens.font.body,
              marginLeft: tokens.spacing.sm,
              verticalAlign: "middle",
            }}
          >
            <option value="">-- Select a Show --</option>
            {shows.map((s) => (
              <option
                key={s.id}
                value={s.id}
                style={{ fontFamily: tokens.font.body }}
              >
                {s.Show?.Show}
              </option>
            ))}
            <option
              value="__OLDER__"
              style={{ fontFamily: tokens.font.body, fontStyle: "italic" }}
            >
              📚 View older shows...
            </option>
          </select>
        </label>
      </div>

      {roundNumbers.length > 1 && (
        <div>
          <label
            style={{
              fontSize: "1.25rem",
              color: colors.dark,
              marginRight: tokens.spacing.md,
            }}
          >
            Select Round:
            <select
              value={selectedRoundId}
              onChange={(e) => setSelectedRoundId(e.target.value)}
              style={{
                fontSize: "1.25rem",
                fontFamily: tokens.font.body,
                marginLeft: tokens.spacing.sm,
                verticalAlign: "middle",
              }}
            >
              {roundNumbers.map((n) => (
                <option key={n} value={String(n)}>
                  {`Round ${n}`}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {bundleLoading && (
        <div style={{ padding: tokens.spacing.md }}>Loading show…</div>
      )}
      {bundleError && (
        <div style={{ padding: tokens.spacing.md, color: colors.error }}>
          Error loading show: {String(bundleError)}
        </div>
      )}

      {activeMode === "show" && (
        <ShowMode
          showBundle={showBundleWithEdits || { rounds: [], teams: [] }}
          selectedRoundId={selectedRoundId}
          showDetails={showDetails}
          setshowDetails={setshowDetails}
          questionRefs={questionRefs}
          visibleImages={visibleImages}
          setVisibleImages={setVisibleImages}
          currentImageIndex={currentImageIndex}
          setCurrentImageIndex={setCurrentImageIndex}
          visibleCategoryImages={visibleCategoryImages}
          setVisibleCategoryImages={setVisibleCategoryImages}
          timeLeft={timeLeft}
          timerRunning={timerRunning}
          handleStartPause={handleStartPause}
          handleReset={handleReset}
          timerDuration={timerDuration}
          handleDurationChange={handleDurationChange}
          timerRef={timerRef}
          timerPosition={timerPosition}
          setTimerPosition={setTimerPosition}
          getClosestQuestionKey={getClosestQuestionKey}
          numberToLetter={numberToLetter}
          showTimer={showTimer}
          prizes={composedCachedState?.prizes ?? ""}
          setShowTimer={setShowTimer}
          setPrizes={(val) => patchShared({ prizes: String(val || "") })}
          editQuestionField={editQuestionField}
          addTiebreaker={addTiebreaker}
        />
      )}

      {activeMode === "score" && (
        <ScoringMode
          showBundle={
            showBundle
              ? {
                  ...showBundle,
                  rounds: (showBundle.rounds || []).filter(
                    (r) => Number(r.round) === Number(selectedRoundId)
                  ),
                }
              : { rounds: [], teams: [] }
          }
          selectedShowId={selectedShowId}
          selectedRoundId={selectedRoundId}
          preloadedTeams={showBundle?.teams ?? []}
          cachedState={composedCachedState}
          onChangeState={(payload) => {
            setScoringCache((prev) => {
              const { teams = [], entryOrder = [], grid = {} } = payload;
              const prevShow = prev[selectedShowId] || {};
              const prevShared = prevShow._shared || {};

              const next = {
                ...prev,
                [selectedShowId]: {
                  ...prevShow, // preserve all rounds
                  _shared: {
                    ...prevShared, // preserve scoring settings, prizes, etc.
                    teams,
                    entryOrder
                  },
                  [selectedRoundId]: { grid },
                },
              };

              // Persist to Supabase (NOT Airtable)
              // shared
              saveDebounced("shared", () => {
                fetch("/.netlify/functions/supaSaveScoring", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    showId: selectedShowId,
                    roundId: "shared",
                    payload: { teams, entryOrder },
                  }),
                }).catch(() => {});
              });

              // per-round grid
              saveDebounced("round", () => {
                fetch("/.netlify/functions/supaSaveScoring", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    showId: selectedShowId,
                    roundId: selectedRoundId,
                    payload: { grid },
                  }),
                }).catch(() => {});
              });

              // keep your localStorage backup if you want
              try {
                localStorage.setItem(
                  "trivia.scoring.backup",
                  JSON.stringify(next)
                );
              } catch {}

              return next;
            });
          }}
          scoringMode={scoringMode}
          setScoringMode={setScoringMode}
          pubPoints={pubPoints}
          setPubPoints={setPubPoints}
          poolPerQuestion={poolPerQuestion}
          setPoolPerQuestion={setPoolPerQuestion}
        />
      )}

      {activeMode === "answers" && (
        <AnswersMode
          showBundle={showBundleWithEdits}
          selectedShowId={selectedShowId}
          selectedRoundId={selectedRoundId}
          cachedState={composedCachedState}
          cachedByRound={scoringCache[selectedShowId]}
          scoringMode={scoringMode}
          pubPoints={pubPoints}
          poolPerQuestion={poolPerQuestion}
          editQuestionField={editQuestionField}
        />
      )}

      {activeMode === "results" && (
        <ResultsMode
          showBundle={showBundleWithEdits || { rounds: [], teams: [] }}
          selectedRoundId={selectedRoundId}
          selectedShowId={selectedShowId}
          cachedState={composedCachedState}
          cachedByRound={scoringCache[selectedShowId] ?? {}}
          scoringMode={scoringMode}
          setScoringMode={setScoringMode}
          pubPoints={pubPoints}
          setPubPoints={setPubPoints}
          poolPerQuestion={poolPerQuestion}
          setPoolPerQuestion={setPoolPerQuestion}
          prizes={composedCachedState?.prizes ?? ""}
          setPrizes={(val) => patchShared({ prizes: String(val || "") })}
          questionEdits={questionEdits[selectedShowId] ?? {}}
        />
      )}

      <ButtonPrimary
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        style={{ margin: `${tokens.spacing.xl} auto`, display: "block" }}
      >
        ↑ Back to Top
      </ButtonPrimary>

      {/* Older Shows Modal */}
      <ui.Modal
        isOpen={olderShowsOpen}
        onClose={() => setOlderShowsOpen(false)}
        title="Browse Older Shows"
        subtitle="Select a show from the past 50 shows"
        style={{ width: "min(92vw, 600px)", maxHeight: "80vh" }}
      >
        {olderShows.length === 0 ? (
          <div style={{ textAlign: "center", padding: tokens.spacing.md }}>
            <Button
              onClick={async () => {
                try {
                  const res = await axios.get(
                    "/.netlify/functions/fetchOlderShows"
                  );
                  setOlderShows(res.data?.Shows || []);
                } catch (err) {
                  console.error("Error fetching older shows:", err);
                  alert("Failed to load older shows");
                }
              }}
            >
              Load Older Shows
            </Button>
          </div>
        ) : (
          <div style={{ maxHeight: "50vh", overflowY: "auto" }}>
            {olderShows.map((s) => (
              <div
                key={s.id}
                onClick={() => {
                  const ok = selectedShowId
                    ? window.confirm(
                        "Switch to this show? This will delete all scores and data you've entered for the current show."
                      )
                    : true;
                  if (!ok) return;

                  setSelectedShowId(s.id);
                  setSelectedRoundId("");
                  setVisibleImages({});
                  setVisibleCategoryImages({});
                  setCurrentImageIndex({});
                  setOlderShowsOpen(false);
                }}
                style={{
                  padding: tokens.spacing.sm,
                  borderBottom: `${tokens.borders.thin} ${colors.gray.borderLight}`,
                  cursor: "pointer",
                  fontFamily: tokens.font.body,
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor =
                    colors.gray.bgLightest)
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = colors.white)
                }
              >
                <strong>{s.Show?.Show}</strong>
                {s.Show?.Date && (
                  <div style={{ fontSize: ".9rem", opacity: 0.7 }}>
                    {new Date(s.Show.Date).toLocaleDateString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <div
          style={{
            display: "flex",
            gap: tokens.spacing.sm,
            justifyContent: "flex-end",
            padding: `${tokens.spacing.sm} 0`,
            borderTop: `${tokens.borders.thin} ${colors.gray.borderLighter}`,
            marginTop: tokens.spacing.sm,
          }}
        >
          <Button onClick={() => setOlderShowsOpen(false)}>Close</Button>
        </div>
      </ui.Modal>
    </div>
  );
}
