import React, { useEffect, useState } from "react";
import axios from "axios";

const App = () => {
  const [data, setData] = useState({ Shows: [], Rounds: [], Questions: [] });
  const [loading, setLoading] = useState(true);
  const [selectedShowId, setSelectedShowId] = useState("");
  const [selectedRoundId, setSelectedRoundId] = useState("");
  const [answersVisible, setAnswersVisible] = useState(false);
  const [questionToggles, setQuestionToggles] = useState({});

  const webhookUrl = "/.netlify/functions/fetchShows";

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get(webhookUrl);
        console.log("Fetched data:", res.data);
        setData(res.data);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const selectedShowRounds = data.Rounds
    .map((r) => r.Round)
    .filter((round) => round["Show ID"] === selectedShowId);

  const selectedRound = selectedShowRounds.find(
    (r) => r["Round ID"] === selectedRoundId
  );

  useEffect(() => {
    if (selectedShowRounds.length === 1) {
      setSelectedRoundId(selectedShowRounds[0]["Round ID"]);
    }
  }, [selectedShowId, data]);

  const groupedQuestions =
    Array.isArray(data?.Questions) && data.Questions.length > 0
      ? data.Questions.reduce((acc, item) => {
          const q = item.Question;
          const categoryName = q["Category name"] || "Uncategorized";
          const categoryDescription = q["Category description"] || "";
          const groupKey = `${categoryName}|||${categoryDescription}`;

          if (!acc[groupKey]) acc[groupKey] = [];
          acc[groupKey].push(q);
          return acc;
        }, {})
      : {};

  const toggleQuestionAnswer = (order) => {
    setQuestionToggles((prev) => ({ ...prev, [order]: !prev[order] }));
  };

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Trivia Show Mode</h1>

      {loading ? (
        <p>Loading data...</p>
      ) : (
        <>
          <h2>Select a Show</h2>
          <select
            value={selectedShowId}
            onChange={(e) => {
              setSelectedShowId(e.target.value);
              setSelectedRoundId("");
            }}
          >
            <option value="">-- Select a Show --</option>
            {data.Shows.map((s) => (
              <option key={s.Show["Show ID"]} value={s.Show["Show ID"]}>
                {s.Show["Name"]}
              </option>
            ))}
          </select>

          {selectedShowRounds.length > 1 && (
            <>
              <h2>Select a Round</h2>
              <select
                value={selectedRoundId}
                onChange={(e) => setSelectedRoundId(e.target.value)}
              >
                <option value="">-- Select a Round --</option>
                {selectedShowRounds.map((r) => (
                  <option key={r["Round ID"]} value={r["Round ID"]}>
                    {r["Name"]}
                  </option>
                ))}
              </select>
            </>
          )}

          {selectedRoundId && (
            <>
              <button
                onClick={() => setAnswersVisible((prev) => !prev)}
                style={{
                  margin: "1rem 0",
                  padding: "0.5rem",
                  background: "#DC6A24",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer"
                }}
              >
                {answersVisible ? "Hide All Answers" : "Show All Answers"}
              </button>

              {Object.entries(groupedQuestions).map(([key, questions]) => {
                const [catName, catDesc] = key.split("|||");
                return (
                  <div key={key} style={{ marginBottom: "2rem" }}>
                    <h3 style={{ color: "#2B394A" }}>{catName}</h3>
                    <p style={{ fontStyle: "italic", marginTop: "-0.5rem" }}>
                      {catDesc}
                    </p>
                    {questions
                      .filter((q) => q["Round ID"] === selectedRoundId)
                      .sort(
                        (a, b) =>
                          parseInt(a["Question order"]) -
                          parseInt(b["Question order"])
                      )
                      .map((q) => (
                        <div key={q["Question order"]} style={{ marginTop: "1rem" }}>
                          <div style={{ fontWeight: 500 }}>
                            {q["Question order"]}. {q["Question text"]}
                          </div>
                          <div style={{ marginLeft: "1rem", marginTop: "0.25rem" }}>
                            <div style={{ color: "green", fontWeight: 400 }}>
                              🟢 Answer:{" "}
                              {answersVisible || questionToggles[q["Question order"]]
                                ? q["Answer"]
                                : "•••"}
                            </div>
                            {q["Flavor text"] && (
                              <div
                                style={{
                                  color: "#555",
                                  fontStyle: "italic",
                                  marginTop: "0.1rem",
                                }}
                              >
                                💬 {q["Flavor text"]}
                              </div>
                            )}
                            <button
                              onClick={() =>
                                toggleQuestionAnswer(q["Question order"])
                              }
                              style={{
                                marginTop: "0.5rem",
                                fontSize: "0.8rem",
                                background: "transparent",
                                border: "1px solid #ccc",
                                padding: "0.25rem 0.5rem",
                                borderRadius: "4px",
                                cursor: "pointer",
                              }}
                            >
                              {questionToggles[q["Question order"]]
                                ? "Hide"
                                : "Show"}{" "}
                              answer
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                );
              })}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default App;