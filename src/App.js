// App.js
import React, { useEffect, useState, useRef, useMemo } from "react";
import axios from "axios";
import "./App.css";
import "react-h5-audio-player/lib/styles.css";
import ShowMode from "./ShowMode";
import ScoringMode from "./ScoringMode";
import ResultsMode from "./ResultsMode";
import AnswersMode from "./AnswersMode";
import { ButtonTab, colors, tokens } from "./styles/index.js";

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
  const [selectedRoundId, setSelectedRoundId] = useState(""); // store as string of round number (e.g. "1")
  const [showDetails, setshowDetails] = useState(true);
  const [visibleImages, setVisibleImages] = useState({});
  const questionRefs = useRef({});
  const [visibleCategoryImages, setVisibleCategoryImages] = useState({});
  const [activeMode, setActiveMode] = useState("show");
  const [currentImageIndex, setCurrentImageIndex] = useState({});
  const timerRef = useRef(null);

  // Bundle (rounds+questions+teams)
  const [showBundle, setShowBundle] = useState(null);
  const [bundleLoading, setBundleLoading] = React.useState(false);
  const [bundleError, setBundleError] = React.useState(null);

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

  // Timer state
  const [timerPosition, setTimerPosition] = useState({ x: 0, y: 0 });
  const [timerDuration, setTimerDuration] = useState(60);
  const [timeLeft, setTimeLeft] = useState(60);
  const [timerRunning, setTimerRunning] = useState(false);

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

  // Persist scoring settings
  useEffect(() => {
    localStorage.setItem("tv_scoringMode", scoringMode);
  }, [scoringMode]);

  useEffect(() => {
    localStorage.setItem("tv_pubPoints", String(pubPoints));
  }, [pubPoints]);

  useEffect(() => {
    localStorage.setItem("tv_poolPerQuestion", String(poolPerQuestion));
  }, [poolPerQuestion]);

  // Load timer position
  useEffect(() => {
    const saved = localStorage.getItem("timerPosition");
    if (saved) {
      setTimerPosition(JSON.parse(saved));
    } else {
      setTimerPosition({
        x: window.innerWidth - 200,
        y: window.innerHeight - 150,
      });
    }
  }, []);

  useEffect(() => {
    const savedPosition = localStorage.getItem("timerPosition");
    if (savedPosition) {
      try {
        setTimerPosition(JSON.parse(savedPosition));
      } catch {}
    }
    if (!timerRunning) return;
    if (timeLeft <= 0) return;
    const t = setTimeout(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearTimeout(t);
  }, [timerRunning, timeLeft]);

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

  // Utils
  function numberToLetter(n) {
    return String.fromCharCode(64 + n);
  }

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

  // Fetch shows
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get("/.netlify/functions/fetchShows");
        console.log("fetchShows response (prod):", res.data);
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
    // 👇 only depend on selectedShowId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedShowId]);

  // Round numbers for dropdown (from bundle)
  const roundNumbers = useMemo(() => {
    const arr = (showBundle?.rounds || [])
      .map((r) => Number(r.round))
      .filter((n) => Number.isFinite(n));
    return Array.from(new Set(arr)).sort((a, b) => a - b);
  }, [showBundle]);

  // Somewhere in App.js (or ShowMode) — add this helper:
  function downloadAnswerKey(showBundle) {
    if (!Array.isArray(showBundle?.rounds) || !showBundle.rounds.length) return;

    const isTB = (q) =>
      (q.questionType || "").toLowerCase() === "tiebreaker" ||
      String(q.questionOrder).toUpperCase() === "TB" ||
      String(q.id || "").startsWith("tb-");

    const cvt = (val) => {
      if (typeof val === "string" && /^[A-Z]$/i.test(val)) {
        return val.toUpperCase().charCodeAt(0) - 64; // A=1
      }
      const n = parseInt(val, 10);
      return Number.isNaN(n) ? 9999 : 100 + n;
    };

    const lines = [];
    const rounds = [...(showBundle.rounds || [])].sort(
      (a, b) => Number(a.round) - Number(b.round)
    );

    for (const r of rounds) {
      const qs = [...(r.questions || [])]
        .filter((q) => !isTB(q))
        .sort(
          (a, b) =>
            Number(a.sortOrder ?? 9999) - Number(b.sortOrder ?? 9999) ||
            cvt(a.questionOrder) - cvt(b.questionOrder)
        );

      if (!qs.length) continue;

      lines.push(`Round ${r.round}`);
      for (const q of qs) {
        const num = q.questionOrder ?? "";
        const ans =
          (Array.isArray(q.answer) ? q.answer[0] : q.answer) ??
          q.answerText ??
          q.correctAnswer ??
          "";
        lines.push(`${num}) ${ans}`);
      }
      lines.push(""); // blank line between rounds
    }

    const blob = new Blob([lines.join("\n")], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "answer-key.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // UI
  return (
    <div
      style={{
        fontFamily: tokens.font.display,
        padding: "2rem",
        backgroundColor: colors.bg,
      }}
    >
      <h1
        style={{
          fontSize: "3rem",
          color: colors.dark,
          marginTop: "2rem",
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
          gap: "0.5rem",
          marginTop: "1rem",
          marginBottom: "1rem",
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

        <ButtonTab onClick={() => downloadAnswerKey(showBundle)}>
          Create printable answer key
        </ButtonTab>
      </div>

      <div>
        <label
          style={{
            fontSize: "1.25rem",
            color: colors.dark,
            marginRight: "1rem",
          }}
        >
          Select Show:
          <select
            value={selectedShowId}
            onChange={(e) => {
              const newId = e.target.value;

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
              marginLeft: "0.5rem",
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
          </select>
        </label>
      </div>

      {roundNumbers.length > 1 && (
        <div>
          <label
            style={{
              fontSize: "1.25rem",
              color: colors.dark,
              marginRight: "1rem",
            }}
          >
            Select Round:
            <select
              value={selectedRoundId}
              onChange={(e) => setSelectedRoundId(e.target.value)}
              style={{
                fontSize: "1.25rem",
                fontFamily: tokens.font.body,
                marginLeft: "0.5rem",
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

      {bundleLoading && <div style={{ padding: "1rem" }}>Loading show…</div>}
      {bundleError && (
        <div style={{ padding: "1rem", color: "red" }}>
          Error loading show: {String(bundleError)}
        </div>
      )}

      {activeMode === "show" && (
        <ShowMode
          rounds={(showBundle?.rounds || []).filter(
            (r) => Number(r.round) === Number(selectedRoundId)
          )}
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
          cachedState={scoringCache[selectedShowId]?.[selectedRoundId] ?? null}
          onChangeState={(payload) => {
            setScoringCache((prev) => {
              const next = {
                ...prev,
                [selectedShowId]: {
                  ...(prev[selectedShowId] || {}),
                  [selectedRoundId]: payload,
                },
              };
              try {
                localStorage.setItem(
                  "trivia.scoring.backup",
                  JSON.stringify(next)
                );
              } catch (err) {
                console.warn("Failed to save scoring backup:", err);
              }
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
          cachedState={scoringCache[selectedShowId]?.[selectedRoundId] ?? null}
          scoringMode={scoringMode}
          pubPoints={pubPoints}
          poolPerQuestion={poolPerQuestion}
        />
      )}

      {activeMode === "results" && (
        <ResultsMode
          showBundle={showBundle || { rounds: [], teams: [] }}
          selectedShowId={selectedShowId}
          selectedRoundId={selectedRoundId}
          cachedState={scoringCache[selectedShowId]?.[selectedRoundId] ?? null}
          cachedByRound={scoringCache[selectedShowId] ?? {}}
          scoringMode={scoringMode}
          setScoringMode={setScoringMode}
          pubPoints={pubPoints}
          setPubPoints={setPubPoints}
          poolPerQuestion={poolPerQuestion}
          setPoolPerQuestion={setPoolPerQuestion}
        />
      )}
    </div>
  );
}
