// 🧩 IMPORTS — External libraries, styles, and app modules
import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import "./App.css";
import "react-h5-audio-player/lib/styles.css";
import ShowMode from "./ShowMode";
import ScoringMode from "./ScoringMode";
import ResultsMode from "./ResultsMode";
import {
  ui,
  Button,
  ButtonTab,
  ButtonPrimary,
  colors,
  tokens,
} from "./styles/index.js";

// 🔐 PASSWORD PROTECTION — Locks the app behind a simple prompt
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

// 🚀 MAIN COMPONENT — This is your app!
export default function App() {
  // 📦 STATE VARIABLES — Track what's selected, shown, and loaded
  const [shows, setShows] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [selectedShowId, setSelectedShowId] = useState("");
  const [selectedRoundId, setSelectedRoundId] = useState("");
  const [showDetails, setshowDetails] = useState(true);
  const [visibleImages, setVisibleImages] = useState({});
  const questionRefs = useRef({});
  const [visibleCategoryImages, setVisibleCategoryImages] = useState({});
  const [activeMode, setActiveMode] = useState("show");
  const [currentImageIndex, setCurrentImageIndex] = useState({});
  const timerRef = useRef(null);
  const [groupedQuestions, setGroupedQuestions] = useState({});
  const [showBundle, setShowBundle] = useState(null);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [bundleError, setBundleError] = useState("");
  // Rounds come from the bundle now
  const bundledRounds = showBundle?.rounds ?? [];

  // ⏲️ TIMER STATE
  const [timerPosition, setTimerPosition] = useState({ x: 0, y: 0 });
  const [timerDuration, setTimerDuration] = useState(60); // in seconds
  const [timeLeft, setTimeLeft] = useState(60);
  const [timerRunning, setTimerRunning] = useState(false);
  // 🔢 Global scoring settings (persisted)
  const [scoringMode, setScoringMode] = useState(
    () => localStorage.getItem("tv_scoringMode") || "pub" // "pub" | "pooled"
  );
  const [pubPoints, setPubPoints] = useState(
    () => Number(localStorage.getItem("tv_pubPoints")) || 10
  );
  const [poolPerQuestion, setPoolPerQuestion] = useState(
    () => Number(localStorage.getItem("tv_poolPerQuestion")) || 500
  );

  // persist on change
  useEffect(() => {
    localStorage.setItem("tv_scoringMode", scoringMode);
  }, [scoringMode]);

  useEffect(() => {
    localStorage.setItem("tv_pubPoints", String(pubPoints));
  }, [pubPoints]);

  useEffect(() => {
    localStorage.setItem("tv_poolPerQuestion", String(poolPerQuestion));
  }, [poolPerQuestion]);

  // 💾 LOAD TIMER POSITION
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

  // ⏱️ TIMER BEHAVIOR
  useEffect(() => {
    const savedPosition = localStorage.getItem("timerPosition");
    if (savedPosition) {
      try {
        setTimerPosition(JSON.parse(savedPosition));
      } catch (e) {
        console.error("Invalid timer position in localStorage");
      }
    }
    if (!timerRunning) return;
    if (timeLeft <= 0) return;
    const timer = setTimeout(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [timerRunning, timeLeft]);

  // 🧮 TIMER CONTROLS
  const handleStartPause = () => {
    setTimerRunning((prev) => !prev);
  };
  const handleReset = () => {
    setTimerRunning(false);
    setTimeLeft(timerDuration);
  };
  const handleDurationChange = (e) => {
    const newDuration = parseInt(e.target.value);
    setTimerDuration(newDuration);
    setTimeLeft(newDuration);
  };

  // 🔠 UTILITIES
  function numberToLetter(n) {
    return String.fromCharCode(64 + n); // 1 → A, 2 → B, etc.
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

  const [selectedShow, setSelectedShow] = useState(null);
  const [pendingShow, setPendingShow] = useState(null); // for when a different show is clicked

  // 📡 FETCH SHOWS (list only)
  useEffect(() => {
    async function loadShows() {
      try {
        const res = await axios.get("/.netlify/functions/fetchShows");
        setShows(res.data?.Shows || []);
      } catch (err) {
        console.error("Error fetching shows:", err);
      }
    }
    loadShows();
  }, []);

  // 🧠 Fetch the selected show's bundle (rounds, questions, teams)
  useEffect(() => {
    if (!selectedShowId) {
      setShowBundle(null);
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
        setShowBundle(res.data || null);

        // Auto-pick first round if none chosen yet
        const firstRoundId = res.data?.rounds?.[0]?.id;
        if (!selectedRoundId && firstRoundId) {
          setSelectedRoundId(firstRoundId);
        }
      } catch (e) {
        if (!cancelled) setBundleError("Failed to load show data.");
        console.error(e);
      } finally {
        if (!cancelled) setBundleLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedShowId]); // only when show changes

  {
    bundledRounds.length > 1 && (
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
            <option value="">-- Select a Round --</option>
            {bundledRounds.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name || "Untitled round"}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  }

  // 🖥️ RENDER THE APP INTERFACE
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
          active={activeMode === "results"}
          onClick={() => setActiveMode("results")}
        >
          Results mode
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

              // If nothing was selected yet or user picked the same show, just proceed.
              if (!selectedShowId || selectedShowId === newId) {
                setSelectedShowId(newId);
                setSelectedRoundId("");
                return;
              }

              // Warn before switching shows (this will discard in-app progress)
              const ok = window.confirm(
                "Switch shows? This will delete all scores and data you've entered for the current show."
              );
              if (!ok) {
                // Do nothing — select stays on the current show because it's controlled by state
                return;
              }

              // Clear any in-memory, per-show state here
              // (add/remove lines to match what you keep locally)
              setSelectedRoundId("");
              setGroupedQuestions({});
              setVisibleImages({});
              setVisibleCategoryImages({});
              setCurrentImageIndex({});
              // If you cache a bundle or scores locally, also clear them here:
              // setShowBundle(null);
              // setScoresState(initialScores);

              // Finally switch shows
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
      {bundledRounds.length > 1 && (
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
              <option value="">-- Select a Round --</option>
              {rounds
                .filter((r) => r.Round?.Show?.[0] === selectedShowId)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.Round?.Round}
                  </option>
                ))}
            </select>
          </label>
        </div>
      )}

      {activeMode === "show" && (
        <ShowMode
          groupedQuestions={showBundle?.questions || {}}
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
          selectedShowId={selectedShowId}
          selectedRoundId={selectedRoundId}
          scoringMode={scoringMode}
          setScoringMode={setScoringMode}
          pubPoints={pubPoints}
          setPubPoints={setPubPoints}
          poolPerQuestion={poolPerQuestion}
          setPoolPerQuestion={setPoolPerQuestion}
        />
      )}

      {activeMode === "results" && (
        <ResultsMode
          selectedShowId={selectedShowId}
          selectedRoundId={selectedRoundId}
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
