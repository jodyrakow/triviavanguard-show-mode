// App.js

import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import "./App.css";
import { marked } from "marked";
import AudioPlayer from "react-h5-audio-player";
import "react-h5-audio-player/lib/styles.css";

// ✅ Password protection using sessionStorage
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
  const [shows, setShows] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [selectedShowId, setSelectedShowId] = useState("");
  const [selectedRoundId, setSelectedRoundId] = useState("");
  const [questions, setQuestions] = useState([]);
  const [showDetails, setshowDetails] = useState(true);
  const [visibleImages, setVisibleImages] = useState({});
  const questionRefs = useRef({});
  const [visibleCategoryImages, setVisibleCategoryImages] = useState({});

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
          onClick={() => {
            const key = getClosestQuestionKey();
            setshowDetails((prev) => !prev);

            setTimeout(() => {
              const ref = questionRefs.current[key];
              if (ref?.current) {
                ref.current.scrollIntoView({
                  behavior: "instant",
                  block: "center",
                });
              }
            }, 100);
          }}
          className="fixed-answer-toggle"
        >
          {showDetails ? "Hide all answers" : "Show all answers"}
        </button>
      )}

      {Object.entries(groupedQuestions)
        .sort(([aName, aData], [bName, bData]) => {
          if (aData.isVisual && !bData.isVisual) return -1;
          if (!aData.isVisual && bData.isVisual) return 1;
          return 0;
        })
        .map(([groupKey, catData], index) => {
          const [categoryName, categoryDescription] = groupKey.split("|||");
          const isVisualCategory = catData.isVisualCategory;
          const groupItems = catData.questions;

          return (
            <div
              key={groupKey}
              style={{ marginTop: index === 0 ? "1rem" : "4rem" }}
            >
              {catData.isSuperSecret ? (
                <div
                  style={{
                    borderStyle: "dashed",
                    borderWidth: "3px",
                    borderColor: "#DC6A24",
                    backgroundColor: "#FFF2E6",
                    borderRadius: ".75rem",
                    padding: "0.5rem",
                  }}
                >
                  {/* Your original dark blue header block untouched */}
                  <div
                    style={{
                      backgroundColor: "#2B394A",
                      padding: "0",
                    }}
                  >
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
                        __html: marked.parseInline(categoryName || ""),
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
                        __html: marked.parseInline(categoryDescription || ""),
                      }}
                    />
                    <div
                      style={{
                        margin: "0.5rem 1rem",
                        padding: "0.5rem 0.75rem",
                        backgroundColor: "#FFF2E6",
                        border: "1px solid  #DC6A24",
                        borderRadius: "0.5rem",
                        fontFamily: "Questrial, sans-serif",
                        color: "#2B394A",
                        fontSize: "1rem",
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
                        If you follow us on Facebook, you'll see a post at the
                        start of each week letting you know where around central
                        Minnesota you can find us that week. That post also
                        tells you the super secret category for the week, so
                        that you can study up before the contest to have a leg
                        up on the competition!
                      </div>
                    </div>
                    {catData.image?.URL && (
                      <div style={{ marginTop: "0.25rem", marginLeft: "1rem" }}>
                        <button
                          onClick={() =>
                            setVisibleCategoryImages((prev) => ({
                              ...prev,
                              [groupKey]: true,
                            }))
                          }
                          style={{
                            fontSize: "1rem",
                            fontFamily: "Questrial, sans-serif",
                            marginBottom: "0.25rem",
                          }}
                        >
                          Show category image
                        </button>

                        {visibleCategoryImages[groupKey] && (
                          <div
                            onClick={() =>
                              setVisibleCategoryImages((prev) => ({
                                ...prev,
                                [groupKey]: false,
                              }))
                            }
                            style={{
                              position: "fixed",
                              top: 0,
                              left: 0,
                              width: "100vw",
                              height: "100vh",
                              backgroundColor: "rgba(43, 57, 74, 0.7)",
                              backdropFilter: "blur(10px)",
                              WebkitBackdropFilter: "blur(8px)",
                              display: "flex",
                              justifyContent: "center",
                              alignItems: "center",
                              zIndex: 9999,
                              cursor: "pointer",
                            }}
                          >
                            <img
                              src={catData.image.URL}
                              alt={catData.image.Name || "Category image"}
                              style={{
                                maxWidth: "90vw",
                                maxHeight: "90vh",
                                objectFit: "contain",
                                border: "4px solid white",
                                boxShadow: "0 0 20px rgba(0,0,0,0.5)",
                              }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                    <hr
                      style={{
                        border: "none",
                        borderTop: "2px solid #DC6A24",
                        margin: "0.3rem 0 0 0",
                      }}
                    />
                  </div>
                </div>
              ) : (
                // Standard block for non-secret categories
                <div
                  style={{
                    backgroundColor: "#2B394A",
                    padding: "0",
                  }}
                >
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
                      __html: marked.parseInline(categoryName || ""),
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
                      __html: marked.parseInline(categoryDescription || ""),
                    }}
                  />
                  {catData.image?.URL && (
                    <div style={{ marginTop: "0.25rem", marginLeft: "1rem" }}>
                      <button
                        onClick={() =>
                          setVisibleCategoryImages((prev) => ({
                            ...prev,
                            [groupKey]: true,
                          }))
                        }
                        style={{
                          fontSize: "1rem",
                          fontFamily: "Questrial, sans-serif",
                          marginBottom: "0.25rem",
                        }}
                      >
                        Show category image
                      </button>

                      {visibleCategoryImages[groupKey] && (
                        <div
                          onClick={() =>
                            setVisibleCategoryImages((prev) => ({
                              ...prev,
                              [groupKey]: false,
                            }))
                          }
                          style={{
                            position: "fixed",
                            top: 0,
                            left: 0,
                            width: "100vw",
                            height: "100vh",
                            backgroundColor: "rgba(43, 57, 74, 0.7)",
                            backdropFilter: "blur(10px)",
                            WebkitBackdropFilter: "blur(8px)",
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            zIndex: 9999,
                            cursor: "pointer",
                          }}
                        >
                          <img
                            src={catData.image.URL}
                            alt={catData.image.Name || "Category image"}
                            style={{
                              maxWidth: "90vw",
                              maxHeight: "90vh",
                              objectFit: "contain",
                              border: "4px solid white",
                              boxShadow: "0 0 20px rgba(0,0,0,0.5)",
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                  <hr
                    style={{
                      border: "none",
                      borderTop: "2px solid #DC6A24",
                      margin: "0.3rem 0 0 0",
                    }}
                  />
                </div>
              )}

              {groupItems.map((q, qIndex) => {
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
                          fontFamily: "Questrial, sans-serif",
                          fontSize: "1.125rem",
                          marginTop: "1.75rem",
                          marginBottom: "0rem",
                        }}
                      >
                        <strong>
                          Question{" "}
                          {isVisualCategory
                            ? numberToLetter(q["Question order"])
                            : q["Question order"]}
                          :
                        </strong>{" "}
                        <br />
                        <span
                          style={{
                            display: "block",
                            paddingLeft: "1.5rem",
                            paddingTop: "0.25rem",
                          }}
                          dangerouslySetInnerHTML={{
                            __html: marked.parseInline(
                              q["Question text"] || ""
                            ),
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
                            display: "block",
                            paddingLeft: "1.5rem",
                            paddingTop: "0.25rem",
                            marginTop: "0rem",
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
                      {q.Image?.URL && (
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
                                backdropFilter: "blur(10px)",
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
                                  display: "inline-block",
                                  maxWidth: "90vw", // or 90% — depends on your layout
                                  maxHeight: "90vh", // limits how tall it can be
                                  objectFit: "contain",
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
                          <div className="audio-player-wrapper">
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
                            marginTop: "0.5rem",
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
