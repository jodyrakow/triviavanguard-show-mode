import React, { useEffect, useState } from "react";
import axios from "axios";

const App = () => {
  const [data, setData] = useState({ Shows: [], Rounds: [] });
  const [questions, setQuestions] = useState([]);
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
        console.log("Fetched shows/rounds:", res.data);
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

  useEffect(() => {
    if (selectedShowRounds.length === 1) {
      setSelectedRoundId(selectedShowRounds[0]["Round ID"]);
    }
  }, [selectedShowId, data]);

  useEffect(() => {
    const fetchQuestions = async () => {
      if (!selectedShowId || !selectedRoundId) return;

      try {
        const res = await axios.post(`/.netlify/functions/fetchQuestions`, {
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
              setQuestions([]);
              setAnswersVisible(false);
              setQuestionToggles({});
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
                onChange={(e) => {
                  setSelectedRoundId(e.target.value);
                  setQuestions([]);
                  setAnswersVisible(false);
                  setQuestionToggles({});
                }}
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

          {selectedRoundId && questions.length > 0 && (
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
                      .sort(
                        (a, b) =>
                          parseInt(a["Question order"]) -
                          parseInt(b["Question order"])
                      )
                      .map((q) => (
                        <div
                          key={q["Question order"]}
                          style={{ marginTop: "1rem" }}
                        >
                          <strong>
                            {q["Question order"]}. {q["Question text"]}
                          </strong>
                          <div style={{ marginLeft: "1rem" }}>
                            <div style={{ color: "green" }}>
                              🟢 Answer:{" "}
                              {answersVisible ||
                              questionToggles[q["Question order"]]
                                ? q["Answer"]
                                : "•••"}
                            </div>
                            {q["Flavor text"] && (
                              <div
                                style={{ fontStyle: "italic", color: "#555" }}
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