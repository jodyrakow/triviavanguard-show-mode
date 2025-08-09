import React from "react";
import AudioPlayer from "react-h5-audio-player";
import Draggable from "react-draggable";
import { marked } from "marked";

export default function ShowMode({
  groupedQuestions,
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
  numberToLetter,
}) {
  const sortedGroupedEntries = Object.entries(groupedQuestions)
    .sort(([aId, aData], [bId, bData]) => {
      const aOrder = aData.categoryInfo?.["Category order"] ?? 999;
      const bOrder = bData.categoryInfo?.["Category order"] ?? 999;
      return aOrder - bOrder;
    })
    .sort(([aId, aData], [bId, bData]) => {
      const aVisual = Object.values(aData.questions || {}).some((q) =>
        (q["Question type"] || "").includes("Visual")
      );
      const bVisual = Object.values(bData.questions || {}).some((q) =>
        (q["Question type"] || "").includes("Visual")
      );
      return aVisual === bVisual ? 0 : aVisual ? -1 : 1;
    });

  return (
    <>
      {Object.keys(groupedQuestions).length > 0 && (
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
      {sortedGroupedEntries.map(([categoryId, catData], index) => {
        const { categoryInfo, questions } = catData;
        const categoryName =
          categoryInfo["Category name"]?.trim() || "Uncategorized";
        const categoryDescription =
          categoryInfo["Category description"]?.trim() || "";
        const isSuperSecret = categoryInfo["Super secret"];
        const groupKey = `${categoryName}|||${categoryDescription}`;

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
                      Minnesota you can find us that week. That post also tells
                      you the super secret category for the week, so that you
                      can study up before the contest to have a leg up on the
                      competition!
                    </div>
                  </div>
                  {Array.isArray(categoryInfo["Category image"]) &&
                    categoryInfo["Category image"].length > 0 && (
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
                          {categoryInfo["Category image"].length > 1 ? "s" : ""}
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
                              flexDirection: "column",
                              justifyContent: "center",
                              alignItems: "center",
                              zIndex: 9999,
                              cursor: "pointer",
                            }}
                          >
                            {categoryInfo["Category image"].map((img, idx) => (
                              <img
                                key={idx}
                                src={img.url}
                                alt={img.filename || "Category image"}
                                style={{
                                  maxWidth: "90vw",
                                  maxHeight: "80vh",
                                  objectFit: "contain",
                                  border: "4px solid white",
                                  boxShadow: "0 0 20px rgba(0,0,0,0.5)",
                                  marginBottom: "1rem",
                                }}
                              />
                            ))}
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
                {categoryInfo["Category image"]?.url && (
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
                          src={categoryInfo["Category image"].url}
                          alt={
                            categoryInfo["Category image"].Name ||
                            "Category image"
                          }
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

            {Object.values(questions)
              .sort((a, b) => {
                const convert = (val) => {
                  if (typeof val === "string" && /^[A-Z]$/i.test(val)) {
                    return val.toUpperCase().charCodeAt(0) - 64;
                  }
                  const num = parseInt(val);
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
                          fontFamily: "Questrial, sans-serif",
                          fontSize: "1.125rem",
                          marginTop: "1.75rem",
                          marginBottom: "0rem",
                        }}
                      >
                        <strong>Question {q["Question order"]}:</strong> <br />
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
                      {Array.isArray(q.Images) && q.Images.length > 0 && (
                        <div style={{ marginTop: "0.25rem" }}>
                          <button
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
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "center",
                                alignItems: "center",
                                zIndex: 9999,
                                cursor: "pointer",
                              }}
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
                                style={{
                                  maxWidth: "90vw",
                                  maxHeight: "80vh",
                                  objectFit: "contain",
                                  border: "4px solid white",
                                  boxShadow: "0 0 20px rgba(0,0,0,0.5)",
                                  marginBottom: "1rem",
                                }}
                              />

                              {q.Images.length > 1 && (
                                <div
                                  style={{
                                    display: "flex",
                                    gap: "1rem",
                                    justifyContent: "center",
                                    alignItems: "center",
                                    fontFamily: "Questrial, sans-serif",
                                  }}
                                >
                                  <button
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
                                    style={{
                                      padding: "0.5rem 1rem",
                                      fontSize: "1rem",
                                      backgroundColor: "#ffffff",
                                      color: "#2B394A",
                                      border: "1px solid #DC6A24",
                                      borderRadius: "0.25rem",
                                      cursor: "pointer",
                                    }}
                                  >
                                    Previous
                                  </button>

                                  <button
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
                                    style={{
                                      padding: "0.5rem 1rem",
                                      fontSize: "1rem",
                                      backgroundColor: "#ffffff",
                                      color: "#2B394A",
                                      border: "1px solid #DC6A24",
                                      borderRadius: "0.25rem",
                                      cursor: "pointer",
                                    }}
                                  >
                                    Next
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      {/* AUDIO FILE – Always visible if present */}
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
                                    marginLeft: "1.5rem",
                                    marginRight: "1.5rem",
                                    maxWidth: "600px",
                                    border: "1px solid #ccc",
                                    borderRadius: "1.5rem",
                                    overflow: "hidden",
                                    backgroundColor: "#f9f9f9",
                                    boxShadow: "0 0 10px rgba(0, 0, 0, 0.15)", // restore shadow
                                  }}
                                >
                                  <AudioPlayer
                                    src={audioObj.url}
                                    showJumpControls={false}
                                    layout="horizontal"
                                    style={{
                                      borderRadius: "1.5rem 1.5rem 0rem 0rem",
                                      width: "100%",
                                    }}
                                  />
                                  <div
                                    style={{
                                      textAlign: "center",
                                      fontSize: "0.9rem",
                                      fontFamily: "Questrial, sans-serif",
                                      padding: "0.4rem 0.6rem",
                                      backgroundColor: "#f9f9f9",
                                      borderTop: "1px solid #ccc",
                                    }}
                                  >
                                    🎵{" "}
                                    {(audioObj.filename || "").replace(
                                      /\.[^/.]+$/,
                                      ""
                                    )}
                                  </div>
                                </div>
                              )
                          )}
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
                    {qIndex < Object.values(questions).length - 1 && (
                      <hr className="question-divider" />
                    )}
                  </React.Fragment>
                );
              })}
          </div>
        );
      })}
      {/* Countdown Timer Floating Box */}
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none", // allow dragging only on the timer itself
          zIndex: 999,
        }}
      >
        <Draggable
          nodeRef={timerRef}
          position={timerPosition}
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
              backgroundColor: "#2B394A",
              color: "white",
              padding: "1rem",
              borderRadius: "0.5rem",
              border: "1px solid #DC6A24",
              boxShadow: "0 0 10px rgba(0,0,0,0.3)",
              fontFamily: "Questrial, sans-serif",
              width: "180px",
              textAlign: "center",
              pointerEvents: "auto",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            {/* Countdown display */}
            <div
              style={{
                fontSize: "2rem",
                fontWeight: "bold",
                marginBottom: "0.5rem",
              }}
            >
              {timeLeft}s
            </div>

            {/* Start / Reset buttons */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "0.5rem",
                marginBottom: "0.5rem",
              }}
            >
              <button
                onClick={handleStartPause}
                style={{
                  width: "70px",
                  backgroundColor: "#DC6A24",
                  color: "white",
                  border: "none",
                  padding: "0.4rem",
                  fontSize: "0.9rem",
                  borderRadius: "0.25rem",
                  cursor: "pointer",
                }}
              >
                {timerRunning ? "Pause" : "Start"}
              </button>
              <button
                onClick={handleReset}
                style={{
                  width: "70px",
                  backgroundColor: "#f0f0f0",
                  color: "#2B394A",
                  border: "none",
                  padding: "0.4rem",
                  fontSize: "0.9rem",
                  borderRadius: "0.25rem",
                  cursor: "pointer",
                }}
              >
                Reset
              </button>
            </div>

            {/* Duration input */}
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
      </div>{" "}
    </>
  );
}
