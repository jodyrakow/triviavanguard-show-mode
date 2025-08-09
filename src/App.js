// 🧩 IMPORTS — External libraries, styles, and app modules
import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import "./App.css";
import "react-h5-audio-player/lib/styles.css";
import ShowMode from "./ShowMode";
import ScoringMode from "./ScoringMode";
import ResultsMode from "./ResultsMode";

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

  // ⏲️ TIMER STATE
  const [timerPosition, setTimerPosition] = useState({ x: 0, y: 0 });
  const [timerDuration, setTimerDuration] = useState(60); // in seconds
  const [timeLeft, setTimeLeft] = useState(60);
  const [timerRunning, setTimerRunning] = useState(false);

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

  // 📡 FETCH SHOWS & ROUNDS
  useEffect(() => {
    const fetchShows = async () => {
      try {
        console.log("Fetching shows...");
        const res = await axios.get("/.netlify/functions/fetchShowsRounds");
        console.log("Fetched shows/rounds:", res.data);
        setShows(res.data.Shows || []);
        setRounds(res.data.Rounds || []);
      } catch (error) {
        console.error("Error fetching shows/rounds:", error);
      }
    };
    fetchShows();
  }, []);

  // 🔄 AUTO-SELECT ROUND IF ONLY ONE
  useEffect(() => {
    if (!selectedShowId) return;
    // match the filter you use elsewhere: r.Round?.Show?.[0] === selectedShowId
    const showRounds = rounds.filter(
      (r) => r.Round?.Show?.[0] === selectedShowId
    );
    if (showRounds.length === 1) {
      // value in the <option> is r.id, so set that
      setSelectedRoundId(showRounds[0].id);
    }
  }, [selectedShowId, rounds]);

  // 🧠 FETCH QUESTIONS BASED ON SELECTION
  useEffect(() => {
    const fetchShowData = async () => {
      if (!selectedShowId || !selectedRoundId) return;
      try {
        const res = await axios.post("/.netlify/functions/fetchShowData", {
          showId: selectedShowId,
          roundId: selectedRoundId,
        });
        console.log("Fetched grouped questions:", res.data);
        setGroupedQuestions(res.data);
      } catch (error) {
        console.error("Error fetching questions:", error);
      }
    };
    fetchShowData();
  }, [selectedShowId, selectedRoundId]);

  const selectedShowRounds = rounds.filter(
    (r) => r.Round?.Show?.[0] === selectedShowId // ✅ correct
  );

  // 🖥️ RENDER THE APP INTERFACE
  return (
    <div
      style={{
        fontFamily: "Antonio, sans-serif",
        padding: "2rem",
        backgroundColor: "#eef1f4",
      }}
    >
      <h1
        style={{
          fontSize: "3rem",
          color: "#2B394A",
          marginTop: "2rem",
          marginBottom: "0",
        }}
      >
        TriviaVanguard
      </h1>
      <h2
        style={{
          fontSize: "1.75rem",
          color: "#2B394A",
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
          gap: "1rem",
          marginTop: "1rem",
          marginBottom: "1rem",
        }}
      >
        <button
          onClick={() => setActiveMode("show")}
          style={{
            padding: "0.5rem 1rem",
            fontSize: "1rem",
            fontFamily: "Questrial, sans-serif",
            backgroundColor: activeMode === "show" ? "#DC6A24" : "#f0f0f0",
            color: activeMode === "show" ? "#ffffff" : "#2B394A",
            border: "1px solid #DC6A24",
            borderRadius: "0.25rem",
            cursor: "pointer",

            textAlign: "center",
          }}
        >
          Show mode
        </button>

        <button
          onClick={() => setActiveMode("score")}
          style={{
            padding: "0.5rem 1rem",
            fontSize: "1rem",
            fontFamily: "Questrial, sans-serif",
            backgroundColor: activeMode === "score" ? "#DC6A24" : "#f0f0f0",
            color: activeMode === "score" ? "#ffffff" : "#2B394A",
            border: "1px solid #DC6A24",
            borderRadius: "0.25rem",
            cursor: "pointer",

            textAlign: "center",
          }}
        >
          Scoring mode
        </button>

        <button
          onClick={() => setActiveMode("results")}
          style={{
            padding: "0.5rem 1rem",
            fontSize: "1rem",
            fontFamily: "Questrial, sans-serif",
            backgroundColor: activeMode === "results" ? "#DC6A24" : "#f0f0f0",
            color: activeMode === "results" ? "#ffffff" : "#2B394A",
            border: "1px solid #DC6A24",
            borderRadius: "0.25rem",
            cursor: "pointer",

            textAlign: "center",
          }}
        >
          Results mode
        </button>
      </div>

      <div>
        <label
          style={{
            fontSize: "1.25rem",
            color: "#2B394A",
            marginRight: "1rem",
          }}
        >
          Select Show:
          <select
            value={selectedShowId}
            onChange={(e) => {
              setSelectedShowId(e.target.value);
              setSelectedRoundId("");
            }}
            style={{
              fontSize: "1.25rem",
              fontFamily: "Questrial, sans-serif",
              marginLeft: "0.5rem",
              verticalAlign: "middle",
            }}
          >
            <option value="">-- Select a Show --</option>
            {shows.map((s) => (
              <option
                key={s.id}
                value={s.id}
                style={{ fontFamily: "Questrial, sans-serif" }}
              >
                {s.Show?.Show}
              </option>
            ))}
          </select>
        </label>
      </div>
      {selectedShowRounds.length > 1 && (
        <div>
          <label
            style={{
              fontSize: "1.25rem",
              color: "#2B394A",
              marginRight: "1rem",
            }}
          >
            Select Round:
            <select
              value={selectedRoundId}
              onChange={(e) => setSelectedRoundId(e.target.value)}
              style={{
                fontSize: "1.25rem",
                fontFamily: "Questrial, sans-serif",
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
          groupedQuestions={groupedQuestions}
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
        />
      )}
    </div>
  );
}
