import React, { useEffect, useState } from "react";
import axios from "axios";
import "./App.css";
import {marked} from "marked";

export default function App() {
  const [shows, setShows] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [selectedShowId, setSelectedShowId] = useState("");
  const [selectedRoundId, setSelectedRoundId] = useState("");
  const [questions, setQuestions] = useState([]);
  const [showDetails, setshowDetails] = useState(true);

  useEffect(() => {
    const fetchShows = async () => {
      try {
        const res = await axios.get("/.netlify/functions/fetchShows");
        setShows(res.data.Shows || []);
        setRounds(res.data.Rounds || []);
        console.log("Fetched shows/rounds:", res.data);
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

  const groupedQuestions = questions.reduce((acc, q) => {
    const categoryName = q["Category name"] || "Uncategorized";
    const categoryDescription = q["Category description"] || "";
    const groupKey = `${categoryName}|||${categoryDescription}`;

    if (!acc[groupKey]) acc[groupKey] = [];
    acc[groupKey].push(q);
    return acc;
  }, {});

  const selectedShowRounds = rounds.filter(
    (r) => r.Round?.["Show ID"] === selectedShowId
  );
    console.log("Grouped questions", groupedQuestions);



  return (
    <div style={{ fontFamily: "Antonio, sans-serif", padding: "2rem", backgroundColor: "#eef1f4" }}>
      <h1 style={{ fontSize: "3rem", color: "#2B394A", marginTop: "2rem", marginBottom: "0" }}>TriviaVanguard</h1>
      <h2 style={{ fontSize: "1.75rem", color: "#2B394A", textIndent: "0.75rem", marginTop: "-.25rem"}}>Show mode</h2>
      <div style={{ display: "flex", flexDirection: "column", marginBottom: "2rem" }}>
  <div>
    <label style={{ fontSize: "1.25rem", color: "#2B394A", marginRight: "1rem" }}>
      Select Show:
  <select
    value={selectedShowId}
    onChange={(e) => {
      setSelectedShowId(e.target.value);
      setSelectedRoundId("");
      setQuestions([]);
    }}
    style={{ fontSize: "1.25rem", fontFamily: "Questrial, sans-serif", marginLeft: "0.5rem", verticalAlign: "middle" }}
  >
    <option style={{ fontFamily: "Questrial, sans-serif"}}
    value="">-- Select a Show --</option>
    {shows.map((s) => (
      <option key={s.Show["Show ID"]} value={s.Show["Show ID"]}
      style={{fontFamiliy:"Questrial, sans-serif"}}>
        {s.Show["Name"]}
      </option>
    ))}
  </select>
</label>
  </div>

  {selectedShowRounds.length > 1 && (
    <div>
      <label style= {{fontSize: "1.25rem", color: "#2B394A", marginRight: "1rem"}}>
        Select Round:
      <select
        value={selectedRoundId}
        onChange={(e) => setSelectedRoundId(e.target.value)}
        style={{fontSize: "1.25rem", fontFamily: "Questrial, sans-serif", marginLeft: "0.5rem", verticalAlign: "middle"}}
        >
        <option style={{fontFamily: "Questrial, sans-serif"}}
        value="">-- Select a Round --</option>
        {selectedShowRounds.map((r) => (
          <option key={r.Round["Round ID"]} value={r.Round["Round ID"]}
            style={{fontFamily: "Questrial, sans-serif"}}
        >
            {r.Round["Name"]}
          </option>
        ))}
      </select>
      </label>
    </div>
  )}
</div>
    {questions.length > 0 && (
  <button
    onClick={() => setshowDetails(!showDetails)}
    className="fixed-answer-toggle"
  >
    {showDetails ? "Hide all answers" : "Show all answers"}
  </button>
)}
      {Object.entries(groupedQuestions).map(([groupKey, questions], index) => {
  const [categoryName, categoryDescription] = groupKey.split("|||");

  return (
    <div key={groupKey} style={{ marginTop: index === 0 ? "1rem" : "4rem" }}>
      <div style={{ backgroundColor: "#2B394A", padding: "0" }}>
        <hr style={{ border: "none", borderTop: "2px solid #DC6A24", margin: "0 0 0.3rem 0" }} />
        
        {/* CATEGORY NAME (Markdown-enabled) */}
        <h2
          style={{
            color: "#DC6A24",
            fontFamily: "Antonio",
            fontSize: "1.85rem",
            margin: 0,
            textAlign: "left",
            letterSpacing: "0.015em",
            textIndent: "0.5rem",
          }}
          dangerouslySetInnerHTML={{
            __html: marked.parseInline(categoryName || "Uncategorized"),
          }}
        />

        {/* CATEGORY DESCRIPTION (Markdown-enabled) */}
        <p
          style={{
            color: "#ffffff",
            fontStyle: "italic",
            fontFamily: "Sanchez",
            margin: "0 0 0.5rem 0",
            textAlign: "left",
            textIndent: "1rem",
          }}
          dangerouslySetInnerHTML={{
            __html: marked.parseInline(categoryDescription || ""),
          }}
        />

        <hr style={{ border: "none", borderTop: "2px solid #DC6A24", margin: "0.3rem 0 0 0" }} />
      </div>

      {/* QUESTIONS */}
      {questions.map((item) => {
        const q = item.Question;

        return (
          <div key={q["Question ID"] || q["Question order"]}>

            {/* QUESTION TEXT (Markdown-enabled) */}
            <p
              style={{
                fontFamily: "Questrial, sans-serif",
                fontSize: "1.125rem",
                marginTop: "1.75rem",
                marginBottom: "0.25rem",
              }}
            >
              <strong>Question {q["Question order"]}:</strong>{" "}
              <span
                dangerouslySetInnerHTML={{
                  __html: marked.parseInline(q["Question text"] || ""),
                }}
              />
            </p>

            {/* FLAVOR TEXT (Markdown-enabled) */}
            {q["Flavor text"]?.trim() && showDetails && (
  <p
    style={{
      fontFamily: "Lora, serif",
      fontSize: "1rem",
      fontStyle: "italic",
      marginTop: "0",
      marginBottom: "0.25rem",
    }}
  >
    <span role="img" aria-label="flavor">💭</span>{" "}
    <span
      dangerouslySetInnerHTML={{
        __html: marked.parseInline(q["Flavor text"]),
      }}
    />
  </p>
)}

            {/* ANSWER (Markdown-enabled) */}
            {showDetails && (
              <p
                style={{
                  fontFamily: "Questrial, sans-serif",
                  fontSize: "1.125rem",
                  marginTop: "0",
                  marginBottom: "1rem",
                  marginLeft: "1.5rem",
                }}
              >
                <span
                  dangerouslySetInnerHTML={{
                    __html: marked.parseInline(`🟢 **Answer:** ${q["Answer"]}`),
                  }}
                />
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
})}
    </div>
  );
}