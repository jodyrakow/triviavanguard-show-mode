// src/ShowMode.js
import React, { useMemo } from "react";
import AudioPlayer from "react-h5-audio-player";
import Draggable from "react-draggable";
import { marked } from "marked";
import {
  Button,
  ButtonPrimary,
  overlayStyle,
  overlayImg,
  colors as theme,
  tokens,
} from "./styles";

export default function ShowMode({
  showBundle = { rounds: [], teams: [] },
  selectedRoundId,
  groupedQuestions: groupedQuestionsProp,
  showDetails,
  setshowDetails,
  questionRefs,
  visibleImages,
  setVisibleImages,
  currentImageIndex,
  setCurrentImageIndex,
  visibleCategoryImages,
  setVisibleCategoryImages,
  timeLeft,
  timerRunning,
  handleStartPause,
  handleReset,
  timerDuration,
  handleDurationChange,
  timerRef,
  timerPosition,
  setTimerPosition,
  getClosestQuestionKey,
  showTimer,
  setShowTimer,
  scoringMode = "pub",
  pubPoints = 10,
  poolPerQuestion = 100,
  poolContribution = 10,
  prizes = "",
  setPrizes,
  cachedState = null, // { teams, grid, entryOrder } from unified cache
  hostInfo: hostInfoProp = {
    host: "",
    cohost: "",
    location: "",
    totalGames: "",
    startTimesText: "",
    announcements: "",
  },
  setHostInfo: setHostInfoProp,
  editQuestionField,
  addTiebreaker,
  sendToDisplay,
  refreshBundle,
}) {
  const [scriptOpen, setScriptOpen] = React.useState(false);

  // Unified question editor modal state
  const [editingQuestion, setEditingQuestion] = React.useState(null);
  // { showQuestionId, questionText, flavorText, answer }

  // Add Tiebreaker modal state
  const [addingTiebreaker, setAddingTiebreaker] = React.useState(false);
  const [tbQuestion, setTbQuestion] = React.useState("");
  const [tbAnswer, setTbAnswer] = React.useState("");

  // under other React.useState(...) lines near the top:
  const [hostModalOpen, setHostModalOpen] = React.useState(false);
  // Use hostInfo from props (synced to Supabase), with local state for immediate UI updates
  const [hostInfo, setHostInfo] = React.useState(hostInfoProp);

  // Sync prop changes to local state (when other hosts update)
  React.useEffect(() => {
    setHostInfo(hostInfoProp);
  }, [hostInfoProp]);

  // Display Mode state
  const [displayPreviewOpen, setDisplayPreviewOpen] = React.useState(false);
  const [displayFontSize, setDisplayFontSize] = React.useState(100); // percentage
  const [customMessages, setCustomMessages] = React.useState(["", "", ""]);

  // show name (best-effort)
  const showName =
    (showBundle?.Show && showBundle?.Show?.Show) || showBundle?.showName || "";

  // Detects "YYYY-MM-DD Game N @ Venue" vs "YYYY-MM-DD @ Venue"
  const multiGameMeta = useMemo(() => {
    const s = (showName || "").trim();

    // 2025-09-23 Game 1 @ Venue
    const multiRe = /^\s*\d{4}-\d{2}-\d{2}\s+Game\s+(\d+)\s*@\s*(.+)\s*$/i;

    // 2025-09-23 @ Venue
    const singleRe = /^\s*\d{4}-\d{2}-\d{2}\s*@\s*(.+)\s*$/;

    let gameIndex = null;
    let venue = "";

    const m1 = s.match(multiRe);
    if (m1) {
      gameIndex = parseInt(m1[1], 10);
      venue = m1[2].trim();
      return { isMultiNight: true, gameIndex, venue };
    }

    const m2 = s.match(singleRe);
    if (m2) {
      venue = m2[1].trim();
    }
    return { isMultiNight: false, gameIndex, venue };
  }, [showName]);

  const inferredLocation = useMemo(
    () => multiGameMeta.venue || "",
    [multiGameMeta.venue]
  );

  // Auto-fill location from show name if empty
  React.useEffect(() => {
    if (inferredLocation && !hostInfo.location) {
      const next = { ...hostInfo, location: inferredLocation };
      setHostInfo(next);
      setHostInfoProp?.(next); // Save to Supabase
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inferredLocation]);

  // keep local textarea in sync with shared prizes
  const [prizesText, setPrizesText] = React.useState(
    Array.isArray(prizes) ? prizes.join("\n") : String(prizes || "")
  );
  React.useEffect(() => {
    setPrizesText(
      Array.isArray(prizes) ? prizes.join("\n") : String(prizes || "")
    );
  }, [prizes]);

  const prizeLines = React.useMemo(
    () =>
      (prizesText || "")
        .toString()
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean),
    [prizesText]
  );
  const [prizeCountInput, setPrizeCountInput] = React.useState(
    prizeLines.length
  );
  React.useEffect(() => {
    setPrizeCountInput(prizeLines.length);
  }, [prizeLines.length]);

  // Pre-populate announcements from Airtable config (if available and not already set)
  React.useEffect(() => {
    if (showBundle?.config?.announcements && !hostInfo.announcements) {
      const next = {
        ...hostInfo,
        announcements: showBundle.config.announcements,
      };
      setHostInfo(next);
      setHostInfoProp?.(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBundle?.config?.announcements]);

  const saveHostInfo = (next) => {
    setHostInfo(next); // Update local state immediately for UI responsiveness
    setHostInfoProp?.(next); // Save to Supabase (synced across hosts)
  };

  // ✅ make allRounds stable
  const allRounds = React.useMemo(
    () => showBundle?.rounds ?? [],
    [showBundle?.rounds]
  );

  // ✅ make displayRounds stable too
  const displayRounds = React.useMemo(() => {
    if (!selectedRoundId) return allRounds;
    const sel = Number(selectedRoundId);
    return allRounds.filter((r) => Number(r.round) === sel);
  }, [allRounds, selectedRoundId]);

  // --- Adapter: build groupedQuestions shape from bundle rounds ---
  const groupedQuestionsFromRounds = React.useMemo(() => {
    const grouped = {};
    for (const r of displayRounds || []) {
      const rNum = r?.round ?? 0;
      for (const q of r?.questions || []) {
        const catName = (q?.categoryName || "").trim();
        const catDesc = (q?.categoryDescription || "").trim();
        const catOrder = q?.categoryOrder ?? 999;
        const key = `${rNum}::${catOrder}::${catName || "Uncategorized"}`;

        if (!grouped[key]) {
          grouped[key] = {
            categoryInfo: {
              "Category name": catName,
              "Category description": catDesc,
              "Category order": catOrder,
              "Super secret": !!q?.superSecret,
              "Category image": Array.isArray(q?.categoryImages)
                ? q.categoryImages
                : [],
              // hold category-level audio
              "Category audio": Array.isArray(q?.categoryAudio)
                ? q.categoryAudio
                : [],
            },
            questions: {},
          };
        }

        grouped[key].questions[q.id] = {
          "Show Question ID": q.id, // needed for editing
          "Question ID": q?.questionId?.[0] || q?.id,
          "Question order": q?.questionOrder,
          "Question text": q?.questionText || "",
          "Flavor text": q?.flavorText || "",
          Answer: q?.answer || "",
          "Question type": q?.questionType || "",
          Images: Array.isArray(q?.questionImages) ? q.questionImages : [],
          Audio: Array.isArray(q?.questionAudio) ? q.questionAudio : [],
          _edited: q._edited || false, // flag if question has been edited
        };

        // Keep first non-empty category media we see
        if (
          Array.isArray(q?.categoryImages) &&
          q.categoryImages.length > 0 &&
          Array.isArray(grouped[key].categoryInfo["Category image"]) &&
          grouped[key].categoryInfo["Category image"].length === 0
        ) {
          grouped[key].categoryInfo["Category image"] = q.categoryImages;
        }
        if (
          Array.isArray(q?.categoryAudio) &&
          q.categoryAudio.length > 0 &&
          Array.isArray(grouped[key].categoryInfo["Category audio"]) &&
          grouped[key].categoryInfo["Category audio"].length === 0
        ) {
          grouped[key].categoryInfo["Category audio"] = q.categoryAudio;
        }
      }
    }
    return grouped;
  }, [displayRounds]);

  const isTB = (q) =>
    String(q?.questionType || q?.["Question type"] || "").toLowerCase() ===
    "tiebreaker";

  // Prefer upstream if provided
  const groupedQuestions =
    groupedQuestionsProp && Object.keys(groupedQuestionsProp).length
      ? groupedQuestionsProp
      : groupedQuestionsFromRounds;

  // Check if current round has a tiebreaker
  const hasTiebreaker = React.useMemo(() => {
    const entries = Object.entries(groupedQuestions);
    for (const [, catData] of entries) {
      const hasT = Object.values(catData?.questions || {}).some((q) => isTB(q));
      if (hasT) return true;
    }
    return false;
  }, [groupedQuestions]);

  // Check if current round is the final round
  const isFinalRound = React.useMemo(() => {
    const rounds = showBundle?.rounds || [];
    if (rounds.length === 0) return false;
    const maxRound = Math.max(...rounds.map((r) => Number(r.round)));
    return Number(selectedRoundId) === maxRound;
  }, [showBundle, selectedRoundId]);

  // Calculate stats per question per round (for showing answer/points data)
  const statsByRoundAndQuestion = React.useMemo(() => {
    if (!cachedState?.teams || !cachedState?.grid) return {};

    const teams = cachedState.teams;
    const grid = cachedState.grid; // Nested grid: { [teamId]: { [questionId]: {...} } }

    const teamNames = new Map(
      teams.map((t) => [t.showTeamId, t.teamName || "(Unnamed team)"])
    );

    const result = {}; // { [roundId]: { [showQuestionId]: stats } }

    // Process each round
    const rounds = showBundle?.rounds || [];
    for (const round of rounds) {
      const roundId = String(round.round);
      const roundQuestions = round.questions || [];

      // For adaptive pooled mode: count only teams active in THIS round
      let activeTeamCount = teams.length;
      if (scoringMode === "pooled-adaptive") {
        const activeTeams = new Set();
        for (const t of teams) {
          for (const q of roundQuestions) {
            if (grid[t.showTeamId]?.[q.id]) {
              activeTeams.add(t.showTeamId);
              break; // Found at least one answer for this team
            }
          }
        }
        activeTeamCount = activeTeams.size;
      }

      const totalTeams = teams.length;
      const roundStats = {};

      for (const q of roundQuestions) {
        const showQuestionId = q.id;
        let correctCount = 0;
        const correctTeams = [];

        for (const t of teams) {
          const cell = grid[t.showTeamId]?.[showQuestionId];
          if (cell?.isCorrect) {
            correctCount++;
            const nm = teamNames.get(t.showTeamId);
            if (nm) correctTeams.push(nm);
          }
        }

        roundStats[showQuestionId] = {
          totalTeams,
          activeTeamCount, // For adaptive mode pool calculation
          correctCount,
          correctTeams,
        };
      }

      result[roundId] = roundStats;
    }

    return result;
  }, [cachedState, showBundle, scoringMode]);

  const sortedGroupedEntries = React.useMemo(() => {
    const entries = Object.entries(groupedQuestions);
    const hasVisual = (cat) =>
      Object.values(cat?.questions || {}).some((q) =>
        (q?.["Question type"] || "").includes("Visual")
      );

    return entries.sort(([, a], [, b]) => {
      const av = hasVisual(a) ? 1 : 0;
      const bv = hasVisual(b) ? 1 : 0;
      if (av !== bv) return bv - av; // visuals first
      const ao = a?.categoryInfo?.["Category order"] ?? 999;
      const bo = b?.categoryInfo?.["Category order"] ?? 999;
      return ao - bo;
    });
  }, [groupedQuestions]);

  const categoryNumberByKey = React.useMemo(() => {
    const perRound = new Map(); // round -> running count
    const out = {};
    for (const [key, cat] of sortedGroupedEntries) {
      const m = /^(\d+)/.exec(String(key));
      const roundNum = m ? Number(m[1]) : 0;

      // check if this category has visual questions
      const isVisualCat = Object.values(cat?.questions || {}).some((q) =>
        String(q?.["Question type"] || "")
          .toLowerCase()
          .includes("visual")
      );

      if (isVisualCat) {
        out[key] = null; // no number assigned
        continue; // don't increment counter
      }

      // check if this category has visual questions
      const isTbCat = Object.values(cat?.questions || {}).some((q) =>
        String(q?.["Question type"] || "")
          .toLowerCase()
          .includes("tiebreaker")
      );

      if (isTbCat) {
        out[key] = null; // no number assigned
        continue; // don't increment counter
      }

      const next = (perRound.get(roundNum) || 0) + 1;
      perRound.set(roundNum, next);
      out[key] = next;
    }
    return out;
  }, [sortedGroupedEntries]);

  // Parse prizes passed as a string (supports newline- or comma-separated)
  // Parse prizes from the resolved string (prop or localStorage)
  const prizeList = useMemo(() => {
    const raw = (prizesText || "").toString();
    const parts = raw.includes("\n") ? raw.split(/\r?\n/) : raw.split(/,\s*/);
    return parts.map((s) => s.trim()).filter(Boolean);
  }, [prizesText]);

  const ordinal = (n) => {
    const j = n % 10,
      k = n % 100;
    if (j === 1 && k !== 11) return `${n}st`;
    if (j === 2 && k !== 12) return `${n}nd`;
    if (j === 3 && k !== 13) return `${n}rd`;
    return `${n}th`;
  };

  // --- Host Script (safe, minimal data) ---
  const fmtNum = (n) => (Number.isFinite(n) ? n.toLocaleString("en-US") : "—");

  // count non-tiebreaker questions from groupedQuestions
  const totalQuestions = useMemo(() => {
    let count = 0;
    for (const r of allRounds) {
      for (const q of r?.questions || []) {
        const typ = String(
          q?.questionType || q?.["Question type"] || ""
        ).toLowerCase();
        if (typ === "tiebreaker") continue;
        count += 1;
      }
    }
    return count;
  }, [allRounds]);

  const totalPointsPossible = useMemo(() => {
    let sum = 0;
    for (const r of allRounds) {
      for (const q of r?.questions || []) {
        if (isTB(q)) continue; // exclude tiebreakers from totals
        const perQ =
          typeof q?.pointsPerQuestion === "number" ? q.pointsPerQuestion : null;
        // Per-question override wins (for either mode). Otherwise use the mode default.
        const base =
          perQ ??
          (scoringMode === "pooled"
            ? Number.isFinite(poolPerQuestion)
              ? poolPerQuestion
              : 0
            : Number.isFinite(pubPoints)
              ? pubPoints
              : 0);
        sum += Number.isFinite(base) ? base : 0;
      }
    }
    return sum;
  }, [allRounds, scoringMode, pubPoints, poolPerQuestion]);
  // Default-per-question and count of special questions (non-TB with overrides)
  const { defaultPer, specialCount } = useMemo(() => {
    const allRounds = Array.isArray(showBundle?.rounds)
      ? showBundle.rounds
      : [];
    const def =
      scoringMode === "pooled"
        ? Number.isFinite(poolPerQuestion)
          ? poolPerQuestion
          : 0
        : Number.isFinite(pubPoints)
          ? pubPoints
          : 0;

    let specials = 0;
    for (const r of allRounds) {
      for (const q of r?.questions || []) {
        const type = String(
          q?.questionType || q?.["Question type"] || ""
        ).toLowerCase();
        if (type.includes("tiebreaker")) continue;
        const perQ =
          typeof q?.pointsPerQuestion === "number" ? q.pointsPerQuestion : null;
        if (perQ !== null && perQ !== def) specials += 1;
      }
    }
    return { defaultPer: def, specialCount: specials };
  }, [showBundle?.rounds, scoringMode, pubPoints, poolPerQuestion]);

  const hostScript = useMemo(() => {
    const s = (n, a, b) => (n === 1 ? a : b);

    const X = totalQuestions;
    const Y = defaultPer;
    const Z = totalPointsPossible;
    const N = specialCount;

    const hName = (hostInfo.host || "your host").trim();
    const cName = (hostInfo.cohost || "your co-host").trim();

    // Prefer explicit location, else show config location, else parsed venue, else fallback
    const loc = (
      hostInfo.location ||
      showBundle?.config?.locationName ||
      multiGameMeta.venue ||
      "your venue"
    ).trim();

    // Parse start times, allow commas, semicolons, or line breaks
    const startTimes = (hostInfo.startTimesText || "")
      .split(/[,;\n]/)
      .map((t) => t.trim())
      .filter(Boolean);

    // Total games: host entry wins; else infer from number of start times; else 1
    const totalGamesInput = Number(hostInfo.totalGames);
    const totalGames =
      Number.isFinite(totalGamesInput) && totalGamesInput > 0
        ? totalGamesInput
        : startTimes.length > 1
          ? startTimes.length
          : 1;

    const timesBlurb = (() => {
      if (totalGames <= 1) return "";

      const pluralAll = totalGames === 2 ? "both" : "all";
      const timesNice = (arr) =>
        arr.length <= 1
          ? arr[0] || ""
          : arr.slice(0, -1).join(", ") + " and " + arr[arr.length - 1];

      let scheduleLine = "";
      if (startTimes.length > 0) {
        // “one starting right now at 7:00, then at 8:30 and 10:00”
        const first = startTimes[0];
        const rest = startTimes.slice(1);
        if (rest.length) {
          scheduleLine = `— one starting right now at ${first}, then at ${timesNice(rest)}`;
        } else {
          scheduleLine = `— one starting right now at ${first}`;
        }
      }

      return (
        `\nWe’ll be playing ${totalGames} game${s(totalGames, "", "s")} of trivia tonight ${scheduleLine} — and ${loc} is awarding prizes for ${pluralAll} game${s(totalGames, "", "s")}!\n` +
        `The slate will be wiped clean between games; that means you can play ${totalGames === 2 ? "one or both" : `one, two, or up to ${totalGames}`} game${s(totalGames, "", "s")} tonight — how long you hang out with us is up to you!\n`
      );
    })();

    // --- Intro ---
    let text =
      `Hey, everybody! It's time for team trivia at ${loc}!\n\n` +
      `I'm ${hName} and this is ${cName}, and we're your hosts tonight as you play for trivia glory and some pretty awesome prizes.\n`;

    // --- Announcements (if provided) ---
    if (hostInfo.announcements && hostInfo.announcements.trim()) {
      text += `\n${hostInfo.announcements.trim()}\n`;
    }

    // Insert multi-game blurb only when we truly have multiple games
    if (multiGameMeta.isMultiNight || totalGames > 1) {
      text += `\n${timesBlurb}`;
    }

    // --- Prizes ---
    if (prizeList.length > 0) {
      text += `\n${loc} is awarding prizes for the top ${fmtNum(prizeList.length)} team${s(prizeList.length, "", "s")}:\n`;
      prizeList.forEach((p, i) => {
        text += `  • ${ordinal(i + 1)}: ${p}\n`;
      });
    }

    // --- Stats (per-show) ---
    // Keep your four paths, but phrase as "in each show" when multi-game
    const perShowSuffix =
      multiGameMeta.isMultiNight || totalGames > 1 ? " in each show" : "";

    if (scoringMode === "pooled-adaptive") {
      // Adaptive pooled scoring
      if (N > 0) {
        text +=
          `\n• Tonight's show has ${fmtNum(X)} question${X === 1 ? "" : "s"}${perShowSuffix}.\n` +
          `• Each question has a point pool that contains ${fmtNum(poolContribution)} point${poolContribution === 1 ? "" : "s"} for each team playing. The pool will be divided evenly among teams that answer correctly — in other words, you'll be rewarded if you know stuff that nobody else knows.\n` +
          `• We do have ${fmtNum(N)} special ${s(N, "question", "questions")} with ${s(N, "a different point value", "different point values")} — we'll explain in more detail when we get to ${s(N, "that question", "those questions")}.\n` +
          `• That gives us a total of ${fmtNum(Z)} points in the pool${perShowSuffix}.\n`;
      } else {
        text +=
          `\n• Tonight's show has ${fmtNum(X)} question${X === 1 ? "" : "s"}${perShowSuffix}.\n` +
          `• Each question has a point pool that contains ${fmtNum(poolContribution)} point${poolContribution === 1 ? "" : "s"} for each team playing. The pool will be divided evenly among teams that answer correctly — in other words, you'll be rewarded if you know stuff that nobody else knows.\n`;
      }
    } else if (scoringMode === "pooled") {
      // Static pooled scoring
      if (N > 0) {
        text +=
          `\n• Tonight's show has ${fmtNum(X)} question${X === 1 ? "" : "s"}${perShowSuffix}.\n` +
          `• Each question has a pool of ${fmtNum(Y)} point${Y === 1 ? "" : "s"} that will be split evenly among the teams that answer correctly${perShowSuffix}.\n` +
          `• We do have ${fmtNum(N)} special ${s(N, "question", "questions")} with ${s(N, "a different point value", "different point values")} — we'll explain in more detail when we get to ${s(N, "that question", "those questions")}.\n` +
          `• That gives us a total of ${fmtNum(Z)} points in the pool${perShowSuffix}.\n`;
      } else {
        text +=
          `\n• Tonight's show has ${fmtNum(X)} question${X === 1 ? "" : "s"}${perShowSuffix}.\n` +
          `• Each question has a pool of ${fmtNum(Y)} point${Y === 1 ? "" : "s"} that will be split evenly among teams that answer correctly, for a total of ${fmtNum(Z)} points in the pool${perShowSuffix}.\n`;
      }
    } else {
      // Pub scoring
      if (N > 0) {
        text +=
          `\n• Tonight's show has ${fmtNum(X)} question${X === 1 ? "" : "s"}${perShowSuffix}.\n` +
          `• Most questions are worth ${fmtNum(Y)} point${Y === 1 ? "" : "s"}, except for ${fmtNum(N)} special ${s(N, "question", "questions")} with ${s(N, "a different point value", "different point values")} — we'll explain in more detail when we get to ${s(N, "that question", "those questions")}.\n` +
          `• That gives us a total of ${fmtNum(Z)} possible points${perShowSuffix}.\n`;
      } else {
        text +=
          `\n• Tonight's show has ${fmtNum(X)} question${X === 1 ? "" : "s"}${perShowSuffix}.\n` +
          `• Each question is worth ${fmtNum(Y)} point${Y === 1 ? "" : "s"}, for a total of ${fmtNum(Z)} possible points${perShowSuffix}.\n`;
      }
    }

    // --- Rules (always on) ---
    text +=
      `\n` +
      `Before we get going, here are the rules.\n` +
      `• To keep things fair, no electronic devices may be out during the round. If you step away from your table, please return with only your charming personality, not with answers you looked up while you were gone. If it looks like cheating, we have to treat it like cheating.\n` +
      `• Don't shout out the answers. You might accidentally give answers away to other teams. Use your handy dandy note pads to share ideas with your team instead.\n` +
      `• Spelling doesn't count unless we say it does.\n` +
      `• Unless we say otherwise, when we ask for someone’s name, we want their last name. Give us their first name too, if you'd like, but just remember that if any part of your answer is wrong, the whole thing is wrong. For fictional characters, either their first or last name is okay unless we say otherwise.\n` +
      `• Our answer is the correct answer. Dispute if you like and we’ll consider it, but our decisions are final.\n` +
      `• Finally, be generous to the staff—they're working hard to ensure you have a great night.\n` +
      `• ${cName} will be coming around with tonight's visual round. That’s your signal to put those phones away because the contest starts now. Good luck!`;

    return text;
  }, [
    scoringMode,
    totalQuestions,
    defaultPer,
    specialCount,
    totalPointsPossible,
    prizeList,
    poolContribution,
    hostInfo.host,
    hostInfo.cohost,
    hostInfo.location,
    hostInfo.totalGames,
    hostInfo.startTimesText,
    hostInfo.announcements,
    multiGameMeta.isMultiNight,
    multiGameMeta.venue,
    showBundle?.config?.locationName,
  ]);

  return (
    <>
      {Object.keys(groupedQuestions).length > 0 && (
        <div
          style={{
            position: "fixed",
            left: "1rem",
            top: "1rem",
            zIndex: 1000,
            pointerEvents: "auto",
            display: "flex",
            gap: ".5rem",
          }}
        >
          <ButtonPrimary
            onClick={() => {
              const key = getClosestQuestionKey();
              setshowDetails((prev) => !prev);
              setTimeout(() => {
                const ref = questionRefs.current[key];
                if (ref?.current) {
                  ref.current.scrollIntoView({
                    behavior: "auto",
                    block: "center",
                  });
                }
              }, 100);
            }}
          >
            {showDetails ? "Hide all answers" : "Show all answers"}
          </ButtonPrimary>

          <ButtonPrimary
            onClick={() => setShowTimer((v) => !v)}
            title={showTimer ? "Hide timer" : "Show timer"}
          >
            {showTimer ? "Hide timer" : "Show timer"}
          </ButtonPrimary>

          <ButtonPrimary
            onClick={() => setScriptOpen(true)}
            title="Show a host-ready script with tonight's details"
          >
            Show script
          </ButtonPrimary>

          <ButtonPrimary
            onClick={() => setHostModalOpen(true)}
            title="Set your names & location"
          >
            Set show details
          </ButtonPrimary>

          {!hasTiebreaker && isFinalRound && addTiebreaker && (
            <ButtonPrimary
              onClick={() => setAddingTiebreaker(true)}
              title="Add a tiebreaker question to the final round"
            >
              + Add Tiebreaker
            </ButtonPrimary>
          )}
        </div>
      )}

      {/* Display Mode Controls */}
      {sendToDisplay && Object.keys(groupedQuestions).length > 0 && (
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

          {refreshBundle && (
            <Button
              onClick={refreshBundle}
              title="Re-fetch questions from Airtable to get fresh audio/image URLs (does not affect scoring)"
              style={{ fontSize: "0.9rem", padding: "0.5rem 0.75rem" }}
            >
              Refresh Questions
            </Button>
          )}

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

      {sortedGroupedEntries.map(([categoryId, catData], index) => {
        const { categoryInfo, questions } = catData;
        const categoryName =
          categoryInfo?.["Category name"]?.trim() || "Uncategorized";
        const categoryDescription =
          categoryInfo?.["Category description"]?.trim() || "";
        const isSuperSecret = !!categoryInfo?.["Super secret"];

        // Category images
        const groupKey = `${categoryName}|||${categoryDescription}`;
        const catImages = categoryInfo?.["Category image"];
        const catImagesArr = Array.isArray(catImages)
          ? catImages
          : catImages
            ? [catImages]
            : [];

        // Category audio
        const catAudio = categoryInfo?.["Category audio"];
        const catAudioArr = Array.isArray(catAudio)
          ? catAudio
          : catAudio
            ? [catAudio]
            : [];

        const CategoryHeader = ({ secret, number }) => (
          <div style={{ backgroundColor: theme.dark, padding: 0 }}>
            <hr
              style={{
                border: "none",
                borderTop: `2px solid ${theme.accent}`,
                margin: "0 0 0.3rem 0",
              }}
            />
            <h2
              style={{
                color: theme.accent,
                fontFamily: tokens.font.display,
                fontSize: "1.85rem",
                margin: 0,
                textAlign: "left",
                letterSpacing: "0.015em",
                textIndent: "0.5rem",
              }}
              dangerouslySetInnerHTML={{
                __html: marked.parseInline(
                  `${Number.isFinite(number) ? `${number}. ` : ""}${categoryName || ""}`
                ),
              }}
            />
            <p
              style={{
                color: "#fff",
                fontStyle: "italic",
                fontFamily: tokens.font.flavor,
                margin: "0 0 0.5rem 0",
                textAlign: "left",
                paddingLeft: "1rem",
              }}
              dangerouslySetInnerHTML={{
                __html: marked.parseInline(categoryDescription || ""),
              }}
            />

            {/* Push category to display button */}
            {sendToDisplay && (
              <div style={{ marginLeft: "1rem", marginBottom: "0.5rem" }}>
                <Button
                  onClick={() => {
                    sendToDisplay("category", {
                      categoryName: categoryName,
                      categoryDescription: categoryDescription,
                    });
                  }}
                  style={{
                    fontSize: tokens.font.size,
                    fontFamily: tokens.font.body,
                  }}
                  title="Push category name and description to display"
                >
                  Push category to display
                </Button>
              </div>
            )}

            {/* Category images (optional) */}
            {catImagesArr.length > 0 && (
              <div style={{ marginTop: "0.25rem", marginLeft: "1rem" }}>
                <Button
                  onClick={() =>
                    setVisibleCategoryImages((prev) => ({
                      ...prev,
                      [groupKey]: true,
                    }))
                  }
                  style={{
                    fontSize: tokens.font.size,
                    fontFamily: tokens.font.body,
                    marginBottom: "0.25rem",
                  }}
                >
                  Show category image{catImagesArr.length > 1 ? "s" : ""}
                </Button>
                {sendToDisplay && (
                  <Button
                    onClick={() => {
                      sendToDisplay("imageOverlay", {
                        images: catImagesArr.map((img) => ({ url: img.url })),
                        currentIndex: 0,
                      });
                    }}
                    style={{
                      fontSize: tokens.font.size,
                      fontFamily: tokens.font.body,
                      marginBottom: "0.25rem",
                      marginLeft: "0.5rem",
                    }}
                    title="Push category image to display"
                  >
                    Push image to display
                  </Button>
                )}

                {visibleCategoryImages[groupKey] && (
                  <div
                    onClick={() =>
                      setVisibleCategoryImages((prev) => ({
                        ...prev,
                        [groupKey]: false,
                      }))
                    }
                    style={overlayStyle}
                  >
                    {catImagesArr.map((img, idx) => (
                      <img
                        key={idx}
                        src={img.url}
                        alt={img.filename || "Category image"}
                        style={overlayImg}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Category audio (optional) */}
            {catAudioArr.length > 0 && (
              <div
                style={{
                  marginTop: "0.5rem",
                  marginLeft: "1rem",
                  marginRight: "1rem",
                }}
              >
                {catAudioArr.map(
                  (audioObj, i) =>
                    audioObj?.url && (
                      <div
                        key={i}
                        className="audio-player-wrapper"
                        style={{
                          marginTop: "0.5rem",
                          maxWidth: "600px",
                          border: "1px solid #ccc",
                          borderRadius: "1.5rem",
                          overflow: "hidden",
                          backgroundColor: theme.bg,
                          boxShadow: "0 0 10px rgba(0, 0, 0, 0.15)",
                        }}
                      >
                        <AudioPlayer
                          src={audioObj.url}
                          showJumpControls={false}
                          layout="horizontal"
                          style={{
                            borderRadius: "1.5rem 1.5rem 0 0",
                            width: "100%",
                          }}
                        />
                        <div
                          style={{
                            textAlign: "center",
                            fontSize: ".9rem",
                            fontFamily: tokens.font.body,
                            padding: "0.4rem 0.6rem",
                            backgroundColor: theme.bg,
                            borderTop: "1px solid #ccc",
                          }}
                        >
                          🎵{" "}
                          {showDetails && (audioObj.filename || "").replace(/\.[^/.]+$/, "")}
                        </div>
                      </div>
                    )
                )}
              </div>
            )}

            <hr
              style={{
                border: "none",
                borderTop: `2px solid ${theme.accent}`,
                margin: "0.3rem 0 0 0",
              }}
            />
          </div>
        );

        return (
          <div
            key={categoryId}
            style={{ marginTop: index === 0 ? "1rem" : "4rem" }}
          >
            {isSuperSecret ? (
              <div
                style={{
                  borderStyle: "dashed",
                  borderWidth: "3px",
                  borderColor: theme.accent,
                  backgroundColor: "rgba(220,106,36,0.15)",
                  borderRadius: ".75rem",
                  padding: "0.5rem",
                }}
              >
                <CategoryHeader
                  secret
                  number={categoryNumberByKey[categoryId]}
                />
                {/* Secret category explainer box */}
                <div
                  style={{
                    margin: "0.5rem 1rem",
                    padding: "0.5rem 0.75rem",
                    backgroundColor: "#fff",
                    border: `1px solid ${theme.accent}`,
                    borderRadius: "0.5rem",
                    fontFamily: tokens.font.body,
                    color: theme.dark,
                    fontSize: tokens.font.size,
                    textAlign: "center",
                  }}
                >
                  🔎{" "}
                  <em>
                    <strong>
                      This is the Super secret category of the week!
                    </strong>
                  </em>
                  <br />
                  <div style={{ marginTop: "0.25rem" }}>
                    If you follow us on Facebook, you'll see a post at the start
                    of each week letting you know where around central Minnesota
                    you can find us that week. That post also tells you the
                    super secret category for the week, so that you can study up
                    before the contest to have a leg up on the competition!
                  </div>
                </div>
              </div>
            ) : (
              <CategoryHeader number={categoryNumberByKey[categoryId]} />
            )}

            {Object.values(questions)
              .sort((a, b) => {
                // Always put the tiebreaker last
                if (isTB(a) && !isTB(b)) return 1;
                if (!isTB(a) && isTB(b)) return -1;

                const convert = (val) => {
                  if (typeof val === "string" && /^[A-Z]$/i.test(val)) {
                    return val.toUpperCase().charCodeAt(0) - 64; // A=1, B=2...
                  }
                  const num = parseInt(val, 10);
                  return isNaN(num) ? 999 : num;
                };
                return (
                  convert(a["Question order"]) - convert(b["Question order"])
                );
              })
              .map((q, qIndex) => {
                const questionKey =
                  q["Question ID"] || `${categoryName}-${q["Question order"]}`;
                if (!questionRefs.current[questionKey]) {
                  questionRefs.current[questionKey] = React.createRef();
                }

                return (
                  <React.Fragment key={q["Question ID"] || q["Question order"]}>
                    <div ref={questionRefs.current[questionKey]}>
                      {/* QUESTION TEXT */}
                      <p
                        style={{
                          fontFamily: tokens.font.body,
                          fontSize: "1.125rem",
                          marginTop: "1.75rem",
                          marginBottom: 0,
                        }}
                        onContextMenu={(e) => {
                          if (editQuestionField) {
                            e.preventDefault();
                            setEditingQuestion({
                              showQuestionId: q["Show Question ID"],
                              questionText: q["Question text"] || "",
                              flavorText: q["Flavor text"] || "",
                              answer: q["Answer"] || "",
                            });
                          }
                        }}
                        onClick={(e) => {
                          if (editQuestionField && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            setEditingQuestion({
                              showQuestionId: q["Show Question ID"],
                              questionText: q["Question text"] || "",
                              flavorText: q["Flavor text"] || "",
                              answer: q["Answer"] || "",
                            });
                          }
                        }}
                      >
                        <strong>
                          {(q["Question type"] || "") === "Tiebreaker" ? (
                            <>
                              <span
                                aria-hidden="true"
                                style={{
                                  display: "inline-block",
                                  transform: "translateY(-2px)",
                                }}
                              >
                                🎯
                              </span>{" "}
                              Tiebreaker question:
                            </>
                          ) : (
                            <>Question {q["Question order"]}:</>
                          )}
                        </strong>
                        {sendToDisplay && (
                          <Button
                            onClick={() => {
                              // Never automatically push images - user must explicitly use "Push image to display"
                              sendToDisplay("question", {
                                questionNumber: q["Question order"],
                                questionText: q["Question text"] || "",
                                categoryName: categoryName,
                                images: [],
                              });
                            }}
                            style={{
                              marginLeft: ".5rem",
                              fontSize: ".75rem",
                              padding: ".25rem .5rem",
                              verticalAlign: "middle",
                            }}
                            title="Push this question to the display"
                          >
                            Push to display
                          </Button>
                        )}
                        {q._edited && (
                          <span
                            style={{
                              marginLeft: ".4rem",
                              fontSize: ".75rem",
                              fontWeight: 600,
                              color: theme.accent,
                              opacity: 0.8,
                            }}
                            title="This question has been edited by the host"
                          >
                            ✏️ edited
                          </span>
                        )}
                        <br />
                        <div
                          style={{
                            display: "block",
                            paddingLeft: "1.5rem",
                            paddingTop: "0.25rem",
                            cursor: editQuestionField ? "pointer" : "default",
                          }}
                          title={
                            editQuestionField
                              ? "Right-click or Ctrl+Click to edit"
                              : ""
                          }
                        >
                          <span
                            dangerouslySetInnerHTML={{
                              __html: marked.parseInline(
                                q["Question text"] || ""
                              ),
                            }}
                          />
                        </div>
                      </p>

                      {/* FLAVOR TEXT */}
                      {q["Flavor text"]?.trim() && showDetails && (
                        <p
                          style={{
                            fontFamily: tokens.font.flavor,
                            fontSize: "1rem",
                            fontStyle: "italic",
                            display: "block",
                            paddingLeft: "1.5rem",
                            paddingTop: "0.25rem",
                            marginTop: 0,
                            marginBottom: "0.01rem",
                            cursor: editQuestionField ? "pointer" : "default",
                          }}
                          title={
                            editQuestionField
                              ? "Right-click or Ctrl+Click to edit"
                              : ""
                          }
                          onContextMenu={(e) => {
                            if (editQuestionField) {
                              e.preventDefault();
                              setEditingQuestion({
                                showQuestionId: q["Show Question ID"],
                                questionText: q["Question text"] || "",
                                flavorText: q["Flavor text"] || "",
                                answer: q["Answer"] || "",
                              });
                            }
                          }}
                          onClick={(e) => {
                            if (editQuestionField && (e.ctrlKey || e.metaKey)) {
                              e.preventDefault();
                              setEditingQuestion({
                                showQuestionId: q["Show Question ID"],
                                questionText: q["Question text"] || "",
                                flavorText: q["Flavor text"] || "",
                                answer: q["Answer"] || "",
                              });
                            }
                          }}
                        >
                          <span
                            dangerouslySetInnerHTML={{
                              __html: marked.parseInline(
                                `<span style="font-size:1em; position: relative; top: 1px; margin-right:-1px;">💭</span> ${q["Flavor text"]}`
                              ),
                            }}
                          />
                        </p>
                      )}

                      {/* IMAGE POPUP TOGGLE */}
                      {Array.isArray(q.Images) && q.Images.length > 0 && (
                        <div style={{ marginTop: "0.25rem" }}>
                          <Button
                            onClick={() => {
                              setVisibleImages((prev) => ({
                                ...prev,
                                [q["Question ID"]]: true,
                              }));
                              setCurrentImageIndex((prev) => ({
                                ...prev,
                                [q["Question ID"]]: 0,
                              }));
                            }}
                            style={{
                              marginBottom: "0.25rem",
                              marginLeft: "1.5rem",
                            }}
                          >
                            Show image
                          </Button>
                          {sendToDisplay && (
                            <Button
                              onClick={() => {
                                const idx =
                                  currentImageIndex[q["Question ID"]] || 0;
                                sendToDisplay("imageOverlay", {
                                  images: q.Images.map((img) => ({
                                    url: img.url,
                                  })),
                                  currentIndex: idx,
                                });
                              }}
                              style={{
                                marginBottom: "0.25rem",
                                marginLeft: "0.5rem",
                              }}
                              title="Push image to display"
                            >
                              Push image to display
                            </Button>
                          )}

                          {visibleImages[q["Question ID"]] && (
                            <div
                              onClick={() =>
                                setVisibleImages((prev) => ({
                                  ...prev,
                                  [q["Question ID"]]: false,
                                }))
                              }
                              style={overlayStyle}
                            >
                              <img
                                src={
                                  q.Images[
                                    currentImageIndex[q["Question ID"]] || 0
                                  ]?.url
                                }
                                alt={
                                  q.Images[
                                    currentImageIndex[q["Question ID"]] || 0
                                  ]?.Name || "Attached image"
                                }
                                style={overlayImg}
                              />

                              {q.Images.length > 1 && (
                                <div
                                  style={{
                                    display: "flex",
                                    gap: "1rem",
                                    justifyContent: "center",
                                    alignItems: "center",
                                    fontFamily: tokens.font.body,
                                  }}
                                >
                                  <Button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setCurrentImageIndex((prev) => {
                                        const curr =
                                          prev[q["Question ID"]] || 0;
                                        return {
                                          ...prev,
                                          [q["Question ID"]]:
                                            (curr - 1 + q.Images.length) %
                                            q.Images.length,
                                        };
                                      });
                                    }}
                                  >
                                    Previous
                                  </Button>

                                  <Button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setCurrentImageIndex((prev) => {
                                        const curr =
                                          prev[q["Question ID"]] || 0;
                                        return {
                                          ...prev,
                                          [q["Question ID"]]:
                                            (curr + 1) % q.Images.length,
                                        };
                                      });
                                    }}
                                  >
                                    Next
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* QUESTION-LEVEL AUDIO */}
                      {Array.isArray(q.Audio) && q.Audio.length > 0 && (
                        <div
                          style={{
                            marginTop: "0.5rem",
                            marginLeft: "1.5rem",
                            marginRight: "1.5rem",
                          }}
                        >
                          {q.Audio.map(
                            (audioObj, index) =>
                              audioObj.url && (
                                <div
                                  key={index}
                                  className="audio-player-wrapper"
                                  style={{
                                    marginTop: "0.5rem",
                                    maxWidth: "600px",
                                    border: "1px solid #ccc",
                                    borderRadius: "1.5rem",
                                    overflow: "hidden",
                                    backgroundColor: theme.bg,
                                    boxShadow: "0 0 10px rgba(0, 0, 0, 0.15)",
                                  }}
                                >
                                  <AudioPlayer
                                    src={audioObj.url}
                                    showJumpControls={false}
                                    layout="horizontal"
                                    style={{
                                      borderRadius: "1.5rem 1.5rem 0 0",
                                      width: "100%",
                                    }}
                                  />
                                  <div
                                    style={{
                                      textAlign: "center",
                                      fontSize: ".9rem",
                                      fontFamily: tokens.font.body,
                                      padding: "0.4rem 0.6rem",
                                      backgroundColor: theme.bg,
                                      borderTop: "1px solid #ccc",
                                    }}
                                  >
                                    🎵{" "}
                                    {showDetails && (audioObj.filename || "").replace(
                                      /\.[^/.]+$/,
                                      ""
                                    )}
                                  </div>
                                </div>
                              )
                          )}
                        </div>
                      )}

                      {/* Calculate stats once for use in answer button and stats pill */}
                      {(() => {
                        const m = /^(\d+)/.exec(String(categoryId));
                        const roundNum = m ? Number(m[1]) : 0;
                        const qStats =
                          statsByRoundAndQuestion[roundNum]?.[
                            q["Show Question ID"]
                          ];

                        // Calculate points for pooled scoring modes (not pub)
                        const qPointsPerTeam =
                          qStats &&
                          (scoringMode === "pooled" || scoringMode === "pooled-adaptive") &&
                          qStats.correctCount > 0
                            ? scoringMode === "pooled-adaptive"
                              ? Math.round(
                                  (Number(poolContribution) * qStats.activeTeamCount) /
                                    qStats.correctCount
                                )
                              : Math.round(Number(poolPerQuestion) / qStats.correctCount)
                            : null;

                        // Store these in a way the button can access them
                        // Stats are available for pub, pooled, and pooled-adaptive
                        q._calculatedStats = qStats;
                        q._calculatedPoints = qPointsPerTeam; // Only set for pooled modes
                        return null;
                      })()}

                      {/* ANSWER */}
                      {showDetails && (
                        <p
                          style={{
                            fontFamily: tokens.font.body,
                            fontSize: "1.125rem",
                            marginTop: "0.5rem",
                            marginBottom: "1rem",
                            marginLeft: "1.5rem",
                            marginRight: "1.5rem",
                            cursor: editQuestionField ? "pointer" : "default",
                          }}
                          title={
                            editQuestionField
                              ? "Right-click or Ctrl+Click to edit"
                              : ""
                          }
                          onContextMenu={(e) => {
                            if (editQuestionField) {
                              e.preventDefault();
                              setEditingQuestion({
                                showQuestionId: q["Show Question ID"],
                                questionText: q["Question text"] || "",
                                flavorText: q["Flavor text"] || "",
                                answer: q["Answer"] || "",
                              });
                            }
                          }}
                          onClick={(e) => {
                            if (editQuestionField && (e.ctrlKey || e.metaKey)) {
                              e.preventDefault();
                              setEditingQuestion({
                                showQuestionId: q["Show Question ID"],
                                questionText: q["Question text"] || "",
                                flavorText: q["Flavor text"] || "",
                                answer: q["Answer"] || "",
                              });
                            }
                          }}
                        >
                          <span
                            dangerouslySetInnerHTML={{
                              __html: marked.parseInline(
                                `<span style="font-size:0.7em; position: relative; top: -1px;">🟢</span> **Answer:** ${q["Answer"]}`
                              ),
                            }}
                          />
                          {sendToDisplay && (
                            <Button
                              onClick={() => {
                                // Push question with answer and stats
                                sendToDisplay("questionWithAnswer", {
                                  questionNumber: q["Question order"],
                                  questionText: q["Question text"] || "",
                                  categoryName: categoryName,
                                  images: [],
                                  answer: q["Answer"] || "",
                                  pointsPerTeam: q._calculatedPoints,
                                  correctCount: q._calculatedStats?.correctCount || null,
                                  totalTeams: q._calculatedStats?.totalTeams || null,
                                });
                              }}
                              style={{
                                marginLeft: ".5rem",
                                fontSize: ".75rem",
                                padding: ".25rem .5rem",
                                verticalAlign: "middle",
                              }}
                              title="Push this question with answer to the display"
                            >
                              Push answer to display
                            </Button>
                          )}
                        </p>
                      )}

                      {/* STATS PILL (teams correct, points, SOLO) */}
                      {(() => {
                        // Use pre-calculated stats from above
                        const isTiebreaker =
                          (q["Question type"] || "") === "Tiebreaker";
                        const stats = q._calculatedStats;
                        const pointsPerTeam = q._calculatedPoints;

                        if (!stats || isTiebreaker) return null;

                        return (
                          <div
                            style={{
                              marginLeft: tokens.spacing.lg,
                              marginBottom: ".75rem",
                            }}
                          >
                            <span
                              style={{
                                display: "inline-block",
                                padding: "0.2rem 0.75rem",
                                borderRadius: tokens.radius.pill,
                                background: theme.white,
                                fontSize: "1.05rem",
                                border: `${tokens.borders.medium} ${theme.accent}`,
                                fontFamily: tokens.font.body,
                              }}
                            >
                              {stats.correctCount} / {stats.totalTeams} teams correct
                            </span>

                            {pointsPerTeam !== null && (
                                <span
                                  style={{
                                    marginLeft: ".6rem",
                                    fontSize: "1rem",
                                  }}
                                >
                                  <span
                                    style={{
                                      color: theme.accent,
                                      fontWeight: 700,
                                    }}
                                  >
                                    {pointsPerTeam}
                                  </span>{" "}
                                  points per team
                                </span>
                              )}

                            {stats.correctCount === 1 &&
                              stats.correctTeams[0] && (
                                <span style={{ marginLeft: ".6rem" }}>
                                  <span
                                    style={{
                                      color: theme.accent,
                                      fontWeight: 700,
                                    }}
                                  >
                                    SOLO:
                                  </span>{" "}
                                  <strong>{stats.correctTeams[0]}</strong>
                                </span>
                              )}
                          </div>
                        );
                      })()}
                    </div>

                    {qIndex < Object.values(questions).length - 1 && (
                      <hr className="question-divider" />
                    )}
                  </React.Fragment>
                );
              })}
          </div>
        );
      })}

      {scriptOpen && (
        <div
          onMouseDown={() => setScriptOpen(false)}
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
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: "min(92vw, 720px)",
              background: "#fff",
              borderRadius: ".6rem",
              border: `1px solid ${theme.accent}`,
              overflow: "hidden",
              boxShadow: "0 10px 30px rgba(0,0,0,.25)",
              fontFamily: tokens.font.body,
              display: "flex",
              flexDirection: "column",
              maxHeight: "85vh",
            }}
          >
            <div
              style={{
                background: theme.dark,
                color: "#fff",
                padding: ".6rem .8rem",
                borderBottom: `2px solid ${theme.accent}`,
                fontFamily: tokens.font.display,
                fontSize: "1.5rem",
                letterSpacing: ".01em",
              }}
            >
              Host Script
            </div>

            <textarea
              readOnly
              value={hostScript}
              style={{
                width: "100%",
                minHeight: "40vh",
                resize: "vertical",
                padding: "1rem",
                border: "1px solid #ddd",
                borderRadius: ".35rem",
                fontFamily: tokens.font.body,
                lineHeight: 1.35,
                fontSize: "1.25rem",
                whiteSpace: "pre-wrap",
                wordWrap: "break-word",
                boxSizing: "border-box",
              }}
            />

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
                type="button"
                onClick={() => setScriptOpen(false)}
                style={{
                  padding: ".5rem .75rem",
                  border: "1px solid #ccc",
                  background: "#f7f7f7",
                  borderRadius: ".35rem",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {hostModalOpen && (
        <div
          onMouseDown={() => setHostModalOpen(false)}
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
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: "min(92vw, 560px)",
              background: "#fff",
              borderRadius: ".6rem",
              border: `1px solid ${theme.accent}`,
              overflow: "hidden",
              boxShadow: "0 10px 30px rgba(0,0,0,.25)",
              fontFamily: tokens.font.body,
            }}
          >
            <div
              style={{
                background: theme.dark,
                color: "#fff",
                padding: ".6rem .8rem",
                borderBottom: `2px solid ${theme.accent}`,
                fontFamily: tokens.font.display,
                fontSize: "1.25rem",
                letterSpacing: ".01em",
              }}
            >
              Show details
            </div>

            <div style={{ padding: ".9rem .9rem 0" }}>
              <label style={{ display: "block", marginBottom: ".6rem" }}>
                <div style={{ marginBottom: 4 }}>Host name</div>
                <input
                  type="text"
                  value={hostInfo.host}
                  onChange={(e) =>
                    saveHostInfo({ ...hostInfo, host: e.target.value })
                  }
                  style={{
                    width: "100%",
                    padding: ".45rem .55rem",
                    border: "1px solid #ccc",
                    borderRadius: ".35rem",
                  }}
                />
              </label>

              <label style={{ display: "block", marginBottom: ".6rem" }}>
                <div style={{ marginBottom: 4 }}>Co-host name</div>
                <input
                  type="text"
                  value={hostInfo.cohost}
                  onChange={(e) =>
                    saveHostInfo({ ...hostInfo, cohost: e.target.value })
                  }
                  style={{
                    width: "100%",
                    padding: ".45rem .55rem",
                    border: "1px solid #ccc",
                    borderRadius: ".35rem",
                  }}
                />
              </label>

              <label style={{ display: "block", marginBottom: ".6rem" }}>
                <div style={{ marginBottom: 4 }}>Location</div>
                <input
                  type="text"
                  value={hostInfo.location}
                  onChange={(e) =>
                    saveHostInfo({ ...hostInfo, location: e.target.value })
                  }
                  style={{
                    width: "100%",
                    padding: ".45rem .55rem",
                    border: "1px solid #ccc",
                    borderRadius: ".35rem",
                  }}
                />
              </label>
              <label style={{ display: "block", marginBottom: ".6rem" }}>
                <div style={{ marginBottom: 4 }}>Total games tonight</div>
                <input
                  type="number"
                  min={1}
                  value={hostInfo.totalGames}
                  onChange={(e) =>
                    saveHostInfo({ ...hostInfo, totalGames: e.target.value })
                  }
                  style={{
                    width: "120px",
                    padding: ".45rem .55rem",
                    border: "1px solid #ccc",
                    borderRadius: ".35rem",
                  }}
                />
                <div
                  style={{
                    fontSize: ".85rem",
                    opacity: 0.8,
                    marginTop: ".25rem",
                  }}
                >
                  (Leave blank if single show)
                </div>
              </label>

              <label style={{ display: "block", marginBottom: ".6rem" }}>
                <div style={{ marginBottom: 4 }}>
                  Start times (comma- or line-separated)
                </div>
                <textarea
                  value={hostInfo.startTimesText}
                  onChange={(e) =>
                    saveHostInfo({
                      ...hostInfo,
                      startTimesText: e.target.value,
                    })
                  }
                  placeholder={`7:00, 8:30`}
                  rows={2}
                  style={{
                    width: "100%",
                    padding: ".55rem .65rem",
                    border: "1px solid #ccc",
                    borderRadius: ".35rem",
                    resize: "vertical",
                    fontFamily: tokens.font.body,
                  }}
                />
              </label>

              <label style={{ display: "block", marginBottom: ".6rem" }}>
                <div style={{ marginBottom: 4 }}>
                  Beginning-of-show announcements (optional)
                </div>
                <textarea
                  value={hostInfo.announcements}
                  onChange={(e) =>
                    saveHostInfo({
                      ...hostInfo,
                      announcements: e.target.value,
                    })
                  }
                  placeholder="Tonight's specials, birthdays, upcoming events, etc."
                  rows={3}
                  style={{
                    width: "100%",
                    padding: ".55rem .65rem",
                    border: "1px solid #ccc",
                    borderRadius: ".35rem",
                    resize: "vertical",
                    fontFamily: tokens.font.body,
                  }}
                />
              </label>

              <label style={{ display: "block", marginBottom: ".6rem" }}>
                <div style={{ marginBottom: 4 }}>Number of prizes</div>
                <input
                  type="number"
                  min={0}
                  value={prizeCountInput}
                  onChange={(e) =>
                    setPrizeCountInput(Number(e.target.value || 0))
                  }
                  style={{
                    width: "120px",
                    padding: ".45rem .55rem",
                    border: "1px solid #ccc",
                    borderRadius: ".35rem",
                  }}
                />
                <div
                  style={{
                    fontSize: ".85rem",
                    opacity: 0.8,
                    marginTop: ".25rem",
                  }}
                >
                  (Optional – for your reference; prize lines below control
                  what’s shown)
                </div>
              </label>

              <label style={{ display: "block", marginBottom: ".6rem" }}>
                <div style={{ marginBottom: 4 }}>
                  Prize details (one per line)
                </div>
                <textarea
                  value={prizesText}
                  onChange={(e) => setPrizesText(e.target.value)}
                  placeholder={`$100 bar tab\nSwag basket\nFree pizza`}
                  rows={4}
                  style={{
                    width: "100%",
                    padding: ".55rem .65rem",
                    border: "1px solid #ccc",
                    borderRadius: ".35rem",
                    resize: "vertical",
                    fontFamily: tokens.font.body,
                  }}
                />
              </label>
            </div>

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
                type="button"
                onClick={() => {
                  // Normalize: newline-separated string → array or string, your shared state stores string
                  // We’ll store as string (joined by newlines).
                  const normalized = (prizesText || "")
                    .split(/\r?\n/)
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .join("\n");
                  setPrizes?.(normalized);
                  setHostModalOpen(false);
                }}
                style={{
                  padding: ".5rem .75rem",
                  border: `1px solid ${theme.accent}`,
                  background: theme.accent,
                  color: "#fff",
                  borderRadius: ".35rem",
                  cursor: "pointer",
                }}
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setHostModalOpen(false)}
                style={{
                  padding: ".5rem .75rem",
                  border: "1px solid #ccc",
                  background: "#f7f7f7",
                  borderRadius: ".35rem",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Countdown Timer Floating Box */}
      {showTimer && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            zIndex: 999,
          }}
        >
          <Draggable
            nodeRef={timerRef}
            defaultPosition={timerPosition}
            onStop={(e, data) => {
              const newPos = { x: data.x, y: data.y };
              setTimerPosition(newPos);
              localStorage.setItem("timerPosition", JSON.stringify(newPos));
            }}
          >
            <div
              ref={timerRef}
              style={{
                position: "absolute",
                backgroundColor: theme.dark,
                color: "#fff",
                padding: "1rem",
                borderRadius: "0.5rem",
                border: `1px solid ${theme.accent}`,
                boxShadow: "0 0 10px rgba(0,0,0,0.3)",
                fontFamily: tokens.font.body,
                width: "180px",
                textAlign: "center",
                pointerEvents: "auto",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  fontSize: "2rem",
                  fontWeight: "bold",
                  marginBottom: "0.5rem",
                }}
              >
                {timeLeft}s
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: "0.5rem",
                  marginBottom: "0.5rem",
                }}
              >
                <ButtonPrimary
                  onClick={handleStartPause}
                  style={{ width: "70px" }}
                >
                  {timerRunning ? "Pause" : "Start"}
                </ButtonPrimary>
                <Button onClick={handleReset} style={{ width: "70px" }}>
                  Reset
                </Button>
              </div>

              <input
                type="number"
                value={timerDuration}
                onChange={handleDurationChange}
                style={{
                  width: "80px",
                  padding: "0.25rem",
                  borderRadius: "0.25rem",
                  border: "1px solid #ccc",
                  fontSize: "0.9rem",
                  textAlign: "center",
                }}
                min={5}
                max={300}
              />
            </div>
          </Draggable>
        </div>
      )}

      {/* Unified Question Editor Modal */}
      {editingQuestion && (
        <div
          onClick={() => setEditingQuestion(null)}
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
              width: "min(92vw, 720px)",
              background: "#fff",
              borderRadius: ".6rem",
              border: `1px solid ${theme.accent}`,
              overflow: "hidden",
              boxShadow: "0 10px 30px rgba(0,0,0,.25)",
              fontFamily: tokens.font.body,
            }}
          >
            {/* Header */}
            <div
              style={{
                background: theme.dark,
                color: "#fff",
                padding: ".6rem .8rem",
                borderBottom: `2px solid ${theme.accent}`,
                fontFamily: tokens.font.display,
                fontSize: "1.25rem",
                letterSpacing: ".01em",
              }}
            >
              Edit Question
            </div>

            {/* Body */}
            <div style={{ padding: ".9rem .9rem .2rem" }}>
              <label style={{ display: "block", marginBottom: ".6rem" }}>
                <div style={{ marginBottom: 4, fontWeight: 600 }}>
                  Question text
                </div>
                <textarea
                  value={editingQuestion.questionText}
                  onChange={(e) =>
                    setEditingQuestion((prev) => ({
                      ...prev,
                      questionText: e.target.value,
                    }))
                  }
                  rows={3}
                  style={{
                    width: "100%",
                    padding: ".55rem .65rem",
                    border: "1px solid #ccc",
                    borderRadius: ".35rem",
                    resize: "vertical",
                    fontFamily: tokens.font.body,
                    fontSize: "1rem",
                  }}
                />
              </label>

              <label style={{ display: "block", marginBottom: ".6rem" }}>
                <div style={{ marginBottom: 4, fontWeight: 600 }}>
                  Flavor text (optional)
                </div>
                <textarea
                  value={editingQuestion.flavorText}
                  onChange={(e) =>
                    setEditingQuestion((prev) => ({
                      ...prev,
                      flavorText: e.target.value,
                    }))
                  }
                  rows={2}
                  placeholder="Optional context or additional info..."
                  style={{
                    width: "100%",
                    padding: ".55rem .65rem",
                    border: "1px solid #ccc",
                    borderRadius: ".35rem",
                    resize: "vertical",
                    fontFamily: tokens.font.body,
                    fontSize: "1rem",
                    fontStyle: "italic",
                  }}
                />
              </label>

              <label style={{ display: "block", marginBottom: ".6rem" }}>
                <div style={{ marginBottom: 4, fontWeight: 600 }}>Answer</div>
                <textarea
                  value={editingQuestion.answer}
                  onChange={(e) =>
                    setEditingQuestion((prev) => ({
                      ...prev,
                      answer: e.target.value,
                    }))
                  }
                  rows={2}
                  style={{
                    width: "100%",
                    padding: ".55rem .65rem",
                    border: "1px solid #ccc",
                    borderRadius: ".35rem",
                    resize: "vertical",
                    fontFamily: tokens.font.body,
                    fontSize: "1rem",
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
                type="button"
                onClick={() => setEditingQuestion(null)}
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
                type="button"
                onClick={() => {
                  if (editQuestionField) {
                    // Save all three fields
                    editQuestionField(
                      editingQuestion.showQuestionId,
                      "question",
                      editingQuestion.questionText.trim()
                    );
                    editQuestionField(
                      editingQuestion.showQuestionId,
                      "flavorText",
                      editingQuestion.flavorText.trim()
                    );
                    editQuestionField(
                      editingQuestion.showQuestionId,
                      "answer",
                      editingQuestion.answer.trim()
                    );
                  }
                  setEditingQuestion(null);
                }}
                style={{
                  padding: ".5rem .75rem",
                  border: `1px solid ${theme.accent}`,
                  background: theme.accent,
                  color: "#fff",
                  borderRadius: ".35rem",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Tiebreaker Modal */}
      {addingTiebreaker && (
        <div
          onClick={() => setAddingTiebreaker(false)}
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
              width: "min(92vw, 620px)",
              background: "#fff",
              borderRadius: ".6rem",
              border: `1px solid ${theme.accent}`,
              overflow: "hidden",
              boxShadow: "0 10px 30px rgba(0,0,0,.25)",
              fontFamily: tokens.font.body,
            }}
          >
            {/* Header */}
            <div
              style={{
                background: theme.dark,
                color: "#fff",
                padding: ".6rem .8rem",
                borderBottom: `2px solid ${theme.accent}`,
                fontFamily: tokens.font.display,
                fontSize: "1.25rem",
                letterSpacing: ".01em",
              }}
            >
              Add Tiebreaker Question
            </div>

            {/* Body */}
            <div style={{ padding: ".9rem .9rem .2rem" }}>
              <div
                style={{
                  marginBottom: ".75rem",
                  fontSize: ".95rem",
                  opacity: 0.9,
                }}
              >
                Add a tiebreaker question for this round. Teams will guess a
                number, and the closest answer wins if there's a tie.
              </div>

              <label style={{ display: "block", marginBottom: ".6rem" }}>
                <div style={{ marginBottom: 4, fontWeight: 600 }}>
                  Tiebreaker Question
                </div>
                <textarea
                  autoFocus
                  value={tbQuestion}
                  onChange={(e) => setTbQuestion(e.target.value)}
                  placeholder="e.g., How many feet tall is the Statue of Liberty?"
                  rows={3}
                  style={{
                    width: "100%",
                    padding: ".55rem .65rem",
                    border: "1px solid #ccc",
                    borderRadius: ".35rem",
                    resize: "vertical",
                    fontFamily: tokens.font.body,
                    fontSize: "1rem",
                  }}
                />
              </label>

              <label style={{ display: "block", marginBottom: ".6rem" }}>
                <div style={{ marginBottom: 4, fontWeight: 600 }}>
                  Answer (number)
                </div>
                <input
                  type="text"
                  value={tbAnswer}
                  onChange={(e) => setTbAnswer(e.target.value)}
                  placeholder="e.g., 305"
                  style={{
                    width: "200px",
                    padding: ".45rem .55rem",
                    border: "1px solid #ccc",
                    borderRadius: ".35rem",
                    fontFamily: tokens.font.body,
                    fontSize: "1rem",
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
                type="button"
                onClick={() => {
                  setAddingTiebreaker(false);
                  setTbQuestion("");
                  setTbAnswer("");
                }}
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
                type="button"
                onClick={() => {
                  if (!tbQuestion.trim()) {
                    alert("Please enter a tiebreaker question.");
                    return;
                  }
                  if (!tbAnswer.trim()) {
                    alert("Please enter the answer.");
                    return;
                  }
                  addTiebreaker(tbQuestion.trim(), tbAnswer.trim());
                  setAddingTiebreaker(false);
                  setTbQuestion("");
                  setTbAnswer("");
                }}
                style={{
                  padding: ".5rem .75rem",
                  border: `1px solid ${theme.accent}`,
                  background: theme.accent,
                  color: "#fff",
                  borderRadius: ".35rem",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Add Tiebreaker
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
