// App.js — Import block: loads all the tools and libraries this file needs

import React, {
  useEffect, // Hook to run side effects (like data fetching) on mount or when variables change
  useState, // Hook to manage local component state (e.g., questions, activeMode)
  useRef, // Hook for persisting mutable references across renders (used for questionRefs)
} from "react"; // React is the core UI-building library
import axios from "axios"; // HTTP library used to fetch shows, rounds, and questions
import "./App.css"; // Global styling for the app
import "react-h5-audio-player/lib/styles.css"; // Default styles for the audio player
import ShowMode from "./ShowMode";
import ScoringMode from "./ScoringMode";
import ResultsMode from "./ResultsMode";

// ✅ Password protection using sessionStorage
const allowedPassword = "tv2025"; // This is the correct password we're checking for
const passwordKey = "showPasswordAuthorized"; // The key name we'll use to store auth status in sessionStorage

const isAuthorized = sessionStorage.getItem(passwordKey); // Checks the browser's sessionStorage to see if this person is already authorized
if (!isAuthorized) {
  // An exclamation point is JavaScript's logical NOT operator
  const enteredPassword = prompt("Enter show password:");
  if (enteredPassword?.toLowerCase() === allowedPassword.toLowerCase()) {
    // Converts to lowercase to prevent case being an issue
    sessionStorage.setItem(passwordKey, "true"); // Marks this browser tab as authorized
  } else {
    // If the password was not correct, do this:
    document.body.innerHTML = // 1. Replace the entire visible page with "Access denied."
      "<h2 style='font-family:sans-serif;'>Access denied.</h2>";
    throw new Error("Unauthorized access"); // 2. Throw this error to stop the app from loading any further
  }
}

export default function App() {
  // Declares the main component - this is the *main thing* exported from this file; so other files can import it using import App from "./App"
  const [shows, setShows] = useState([]); //Creates a state variable called shows, initally an empty array
  const [rounds, setRounds] = useState([]); //Creates a state variable called rounds, initially an empty array
  const [selectedShowId, setSelectedShowId] = useState(""); // Holds the ID of the selected show from the dropdown; initially an empty string
  const [selectedRoundId, setSelectedRoundId] = useState(""); // Holds the ID of the selected round; initially an empty string
  const [questions, setQuestions] = useState([]); // Holds the questions fetched from Airtable based on the selected show and round; initially an empty array
  const [showDetails, setshowDetails] = useState(true); // A boolean toggle that defaults to true
  const [visibleImages, setVisibleImages] = useState({}); // Holds an object like { questionId1: true, questionId2: false }; controls whether an image popup is open per question
  const questionRefs = useRef({}); // Creates a persistent object that holds references to each question block in the DOM; used for smooth scrolling; unlike useState, changes to useRef don't trigger re-renders
  const [visibleCategoryImages, setVisibleCategoryImages] = useState({}); // Similar to visibleImages
  const [activeMode, setActiveMode] = useState("show"); // "show" or "score"
  const timerRef = useRef(null);
  const [timerPosition, setTimerPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const saved = localStorage.getItem("timerPosition");
    if (saved) {
      setTimerPosition(JSON.parse(saved));
    } else {
      // Default to bottom-right corner once we know the screen size
      setTimerPosition({
        x: window.innerWidth - 200,
        y: window.innerHeight - 150,
      });
    }
  }, []);

  // Countdown Timer Component
  const [timerDuration, setTimerDuration] = useState(60); // in seconds
  const [timeLeft, setTimeLeft] = useState(60);
  const [timerRunning, setTimerRunning] = useState(false);

  // Update timer every second
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

  useEffect(() => {
    const fetchShows = async () => {
      try {
        console.log("Fetching shows..."); // ← ADD THIS
        const res = await axios.get("/.netlify/functions/fetchShows");
        console.log("Fetched shows/rounds:", res.data);
        setShows(res.data.Shows || []);
        setRounds(res.data.Rounds || []);
      } catch (error) {
        console.error("Error fetching shows/rounds:", error);
      }
    };
    fetchShows();
  }, []);

  useEffect(() => {
    if (!selectedShowId) return;
    const showRounds = rounds.filter(
      (r) => r.Round?.["Show ID"] === selectedShowId
    );
    if (showRounds.length === 1) {
      setSelectedRoundId(showRounds[0].Round["Round ID"]);
    }
  }, [selectedShowId, rounds]);

  useEffect(() => {
    const fetchQuestions = async () => {
      if (!selectedShowId || !selectedRoundId) return;
      try {
        const res = await axios.post("/.netlify/functions/fetchQuestions", {
          showId: selectedShowId,
          roundId: selectedRoundId,
        });
        console.log("Fetched questions:", res.data);
        setQuestions(res.data.Questions || []);
      } catch (error) {
        console.error("Error fetching questions:", error);
      }
    };
    fetchQuestions();
  }, [selectedShowId, selectedRoundId]);

  const sortedQuestions = [...questions].sort((a, b) => {
    const aCatOrder = a["Category order"] ?? 999;
    const bCatOrder = b["Category order"] ?? 999;

    if (aCatOrder !== bCatOrder) return aCatOrder - bCatOrder;

    const aQOrderRaw = a["Question order"];
    const bQOrderRaw = b["Question order"];

    const convert = (val) => {
      if (typeof val === "string" && /^[A-Z]$/i.test(val)) {
        //&& is the logical AND operator - it means "If the thing on the left is true, do (or return) the thing on the right"
        return val.toUpperCase().charCodeAt(0) - 64; // A = 1
      }
      const num = parseInt(val);
      return isNaN(num) ? 999 : num;
    };

    return convert(aQOrderRaw) - convert(bQOrderRaw);
  });

  const groupedQuestions = sortedQuestions.reduce((acc, item) => {
    const q = item.Question;
    const categoryName = (item["Category name"] || "Uncategorized")
      .replace(/\s+/g, " ")
      .trim();
    const categoryDescription = (item["Category description"] || "")
      .replace(/\s+/g, " ")
      .trim();
    const groupKey = `${categoryName}|||${categoryDescription}`;

    // Parse string of question type(s) into array
    const typeNames = (item["Question type"] || "")
      .split(",")
      .map((s) => s.trim());
    const isVisual = typeNames.includes("Visual");

    // Initialize the group if it's not in the accumulator yet
    if (!acc[groupKey]) {
      acc[groupKey] = {
        description: categoryDescription,
        image: q["Category image"] || null,
        questions: [],
        isVisual,
        isSuperSecret: false, // will be set below if true
      };
    }

    // Add this question to the group
    acc[groupKey].questions.push({
      ...q,
      QuestionOrder: q["Question order"],
    });

    // ✅ Check for "Super secret" directly on item, not in question
    if (item["Super secret"] === "true") {
      acc[groupKey].isSuperSecret ||= true; // ensure we don't unset it later
    }

    return acc;
  }, {});

  const selectedShowRounds = rounds.filter(
    (r) => r.Round?.["Show ID"] === selectedShowId
  );

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
          gap: "1rem", // evenly spaces buttons
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
              {selectedShowRounds.map((r) => (
                <option
                  key={r.Round["Round ID"]}
                  value={r.Round["Round ID"]}
                  style={{ fontFamily: "Questrial, sans-serif" }}
                >
                  {r.Round["Name"]}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {activeMode === "show" && (
        <ShowMode
          questions={questions}
          groupedQuestions={groupedQuestions}
          showDetails={showDetails}
          setshowDetails={setshowDetails}
          questionRefs={questionRefs}
          visibleImages={visibleImages}
          setVisibleImages={setVisibleImages}
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
          questions={questions}
          groupedQuestions={groupedQuestions}
          showDetails={showDetails}
          setshowDetails={setshowDetails}
          questionRefs={questionRefs}
          visibleImages={visibleImages}
          setVisibleImages={setVisibleImages}
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

      {activeMode === "results" && (
        <ResultsMode
          questions={questions}
          groupedQuestions={groupedQuestions}
          showDetails={showDetails}
          setshowDetails={setshowDetails}
          questionRefs={questionRefs}
          visibleImages={visibleImages}
          setVisibleImages={setVisibleImages}
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
    </div>
  );
}
