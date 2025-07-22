import React, { useEffect, useState } from "react";
import axios from "axios";
import "./App.css";
import { marked } from "marked";
import AudioPlayer from "react-h5-audio-player";
import "react-h5-audio-player/lib/styles.css";

export default function App() {
  const [shows, setShows] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [selectedShowId, setSelectedShowId] = useState("");
  const [selectedRoundId, setSelectedRoundId] = useState("");
  const [questions, setQuestions] = useState([]);
  const [showDetails, setshowDetails] = useState(true);
  const [visibleImages, setVisibleImages] = useState({});

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
        Show mode
      </h2>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginBottom: "2rem",
        }}
      >
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
                setQuestions([]);
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
                  key={s.Show["Show ID"]}
                  value={s.Show["Show ID"]}
                  style={{ fontFamily: "Questrial, sans-serif" }}
                >
                  {s.Show["Name"]}
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
      </div>

      {questions.length > 0 && (
        <button
          onClick={() => setshowDetails(!showDetails)}
          className="fixed-answer-toggle"
        >
          {showDetails ? "Hide all answers" : "Show all answers"}
        </button>
      )}

      {Object.entries(groupedQuestions).map(([groupKey, groupItems], index) => {
        const [categoryName, categoryDescription] = groupKey.split("|||");

        return (
          <div
            key={groupKey}
            style={{ marginTop: index === 0 ? "1rem" : "4rem" }}
          >
            <div style={{ backgroundColor: "#2B394A", padding: "0" }}>
              <hr
                style={{
                  border: "none",
                  borderTop: "2px solid #DC6A24",
                  margin: "0 0 0.3rem 0",
                }}
              />

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
                  __html: marked.parseInline(categoryName),
                }}
              />

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
                  __html: marked.parseInline(categoryDescription),
                }}
              />

              <hr
                style={{
                  border: "none",
                  borderTop: "2px solid #DC6A24",
                  margin: "0.3rem 0 0 0",
                }}
              />
            </div>

            {groupItems.map((item, qIndex) => {
              const q = item.Question;

              return (
                <React.Fragment key={q["Question ID"] || q["Question order"]}>
                  <div>
                    {/* QUESTION TEXT */}
                    <p
                      style={{
                        fontFamily: "Questrial, sans-serif",
                        fontSize: "1.125rem",
                        marginTop: "1.75rem",
                        marginBottom: "0.1rem",
                      }}
                    >
                      <strong>Question {q["Question order"]}:</strong>{" "}
                      <span
                        dangerouslySetInnerHTML={{
                          __html: marked.parseInline(q["Question text"] || ""),
                        }}
                      />
                    </p>

                    {/* FLAVOR TEXT */}
                    {q["Flavor text"]?.trim() && showDetails && (
                      <p
                        style={{
                          fontFamily: "Lora, serif",
                          fontSize: "1rem",
                          fontStyle: "italic",
                          marginTop: "0.01rem",
                          marginBottom: "0.01rem",
                        }}
                      >
                        <span
                          dangerouslySetInnerHTML={{
                            __html: marked.parseInline(
                              `<span style="font-size:1em; position: relative; top: 1px; margin-right: -1px;">💭</span> ${q["Flavor text"]}`
                            ),
                          }}
                        />
                      </p>
                    )}

                    {/* IMAGE POPUP TOGGLE */}
                    {q.Image?.URL && showDetails && (
                      <div style={{ marginTop: "0.25rem" }}>
                        <button
                          onClick={() =>
                            setVisibleImages((prev) => ({
                              ...prev,
                              [q["Question ID"]]: true,
                            }))
                          }
                          style={{
                            fontSize: "1rem",
                            fontFamily: "Questrial, sans-serif",
                            marginBottom: "0.25rem",
                            marginLeft: "1.5rem",
                          }}
                        >
                          Show image
                        </button>

                        {/* FULLSCREEN MODAL IMAGE OVERLAY */}
                        {visibleImages[q["Question ID"]] && (
                          <div
                            onClick={() =>
                              setVisibleImages((prev) => ({
                                ...prev,
                                [q["Question ID"]]: false,
                              }))
                            }
                            style={{
                              position: "fixed",
                              top: 0,
                              left: 0,
                              width: "100vw",
                              height: "100vh",
                              backgroundColor: "rgba(43, 57, 74, 0.7)",
                              backdropFiler: "blur(10px)",
                              WebkitBackdropFilter: "blur(8px)",
                              display: "flex",
                              justifyContent: "center",
                              alignItems: "center",
                              zIndex: 9999,
                              cursor: "pointer",
                            }}
                          >
                            <img
                              src={q.Image.URL}
                              alt={q.Image.Name || "Attached image"}
                              style={{
                                minWidth: "600px",
                                minHeight: "600px",
                                maxWidth: "90%",
                                maxHeight: "90%",
                                border: "4px solid white",
                                boxShadow: "0 0 20px rgba(0,0,0,0.5)",
                              }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                    {/* AUDIO FILE – Always visible if present */}
                    {q["Audio file"]?.URL && (
                      <div
                        style={{
                          marginTop: "0.5rem",
                          marginLeft: "1.5rem",
                          marginRight: "1.5rem",
                        }}
                      >
                        <div class="audio-player-wrapper">
                          <AudioPlayer
                            src={q["Audio file"].URL}
                            showJumpControls={false}
                            layout="horizontal"
                          />
                        </div>
                      </div>
                    )}
                    {/* ANSWER */}
                    {showDetails && (
                      <p
                        style={{
                          fontFamily: "Questrial, sans-serif",
                          fontSize: "1.125rem",
                          marginTop: "0.1rem",
                          marginBottom: "1rem",
                          marginLeft: "1.5rem",
                          marginRight: "1.5rem",
                        }}
                      >
                        <span
                          dangerouslySetInnerHTML={{
                            __html: marked.parseInline(
                              `<span style="font-size:0.7em; position: relative; top: -1px;">🟢</span> **Answer:** ${q["Answer"]}`
                            ),
                          }}
                        />
                      </p>
                    )}
                  </div>
                  {qIndex < groupItems.length - 1 && (
                    <hr className="question-divider" />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
