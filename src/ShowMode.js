import React from "react";
import AudioPlayer from "react-h5-audio-player";
import Draggable from "react-draggable";
import { marked } from "marked";

export default function ShowMode({
  questions,
  groupedQuestions,
  showDetails,
  setshowDetails,
  questionRefs,
  visibleImages,
  setVisibleImages,
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
  return (
    <>
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
