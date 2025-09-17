// src/ShowMode.js
import React from "react";
import AudioPlayer from "react-h5-audio-player";
import Draggable from "react-draggable";
import { marked } from "marked";
import {
  Button,
  ButtonPrimary,
  overlayStyle,
  overlayImg,
  colors as theme,
  tokens,
} from "./styles";

export default function ShowMode({
  rounds = [],
  groupedQuestions: groupedQuestionsProp,
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
  showTimer,
  setShowTimer,
  numberToLetter,
}) {
  // --- Adapter: build groupedQuestions shape from bundle rounds ---
  const groupedQuestionsFromRounds = React.useMemo(() => {
    const grouped = {};
    for (const r of rounds || []) {
      const rNum = r?.round ?? 0;
      for (const q of r?.questions || []) {
        const catName = (q?.categoryName || "").trim();
        const catDesc = (q?.categoryDescription || "").trim();
        const catOrder = q?.categoryOrder ?? 999;
        const key = `${rNum}::${catOrder}::${catName || "Uncategorized"}`;

        if (!grouped[key]) {
          grouped[key] = {
            categoryInfo: {
              "Category name": catName,
              "Category description": catDesc,
              "Category order": catOrder,
              "Super secret": !!q?.superSecret,
              "Category image": Array.isArray(q?.categoryImages)
                ? q.categoryImages
                : [],
              // hold category-level audio
              "Category audio": Array.isArray(q?.categoryAudio)
                ? q.categoryAudio
                : [],
            },
            questions: {},
          };
        }

        grouped[key].questions[q.id] = {
          "Question ID": q?.questionId?.[0] || q?.id,
          "Question order": q?.questionOrder,
          "Question text": q?.questionText || "",
          "Flavor text": q?.flavorText || "",
          Answer: q?.answer || "",
          "Question type": q?.questionType || "",
          Images: Array.isArray(q?.questionImages) ? q.questionImages : [],
          Audio: Array.isArray(q?.questionAudio) ? q.questionAudio : [],
        };

        // Keep first non-empty category media we see
        if (
          Array.isArray(q?.categoryImages) &&
          q.categoryImages.length > 0 &&
          Array.isArray(grouped[key].categoryInfo["Category image"]) &&
          grouped[key].categoryInfo["Category image"].length === 0
        ) {
          grouped[key].categoryInfo["Category image"] = q.categoryImages;
        }
        if (
          Array.isArray(q?.categoryAudio) &&
          q.categoryAudio.length > 0 &&
          Array.isArray(grouped[key].categoryInfo["Category audio"]) &&
          grouped[key].categoryInfo["Category audio"].length === 0
        ) {
          grouped[key].categoryInfo["Category audio"] = q.categoryAudio;
        }
      }
    }
    return grouped;
  }, [rounds]);

  // Prefer upstream if provided
  const groupedQuestions =
    groupedQuestionsProp && Object.keys(groupedQuestionsProp).length
      ? groupedQuestionsProp
      : groupedQuestionsFromRounds;

  const sortedGroupedEntries = React.useMemo(() => {
    const entries = Object.entries(groupedQuestions);
    const hasVisual = (cat) =>
      Object.values(cat?.questions || {}).some((q) =>
        (q?.["Question type"] || "").includes("Visual")
      );

    return entries.sort(([, a], [, b]) => {
      const av = hasVisual(a) ? 1 : 0;
      const bv = hasVisual(b) ? 1 : 0;
      if (av !== bv) return bv - av; // visuals first
      const ao = a?.categoryInfo?.["Category order"] ?? 999;
      const bo = b?.categoryInfo?.["Category order"] ?? 999;
      return ao - bo;
    });
  }, [groupedQuestions]);

  return (
    <>
      {Object.keys(groupedQuestions).length > 0 && (
        <div
          style={{
            position: "fixed",
            left: "1rem",
            top: "1rem",
            zIndex: 1000,
            pointerEvents: "auto",
            display: "flex",
            gap: ".5rem",
          }}
        >
          <ButtonPrimary
            onClick={() => {
              const key = getClosestQuestionKey();
              setshowDetails((prev) => !prev);
              setTimeout(() => {
                const ref = questionRefs.current[key];
                if (ref?.current) {
                  ref.current.scrollIntoView({
                    behavior: "auto",
                    block: "center",
                  });
                }
              }, 100);
            }}
          >
            {showDetails ? "Hide all answers" : "Show all answers"}
          </ButtonPrimary>

          <ButtonPrimary
            onClick={() => setShowTimer((v) => !v)}
            title={showTimer ? "Hide timer" : "Show timer"}
          >
            {showTimer ? "Hide timer" : "Show timer"}
          </ButtonPrimary>
        </div>
      )}

      {sortedGroupedEntries.map(([categoryId, catData], index) => {
        const { categoryInfo, questions } = catData;
        const categoryName =
          categoryInfo?.["Category name"]?.trim() || "Uncategorized";
        const categoryDescription =
          categoryInfo?.["Category description"]?.trim() || "";
        const isSuperSecret = !!categoryInfo?.["Super secret"];

        // Category images
        const groupKey = `${categoryName}|||${categoryDescription}`;
        const catImages = categoryInfo?.["Category image"];
        const catImagesArr = Array.isArray(catImages)
          ? catImages
          : catImages
            ? [catImages]
            : [];

        // Category audio
        const catAudio = categoryInfo?.["Category audio"];
        const catAudioArr = Array.isArray(catAudio)
          ? catAudio
          : catAudio
            ? [catAudio]
            : [];

        const CategoryHeader = ({ secret }) => (
          <div style={{ backgroundColor: theme.dark, padding: 0 }}>
            <hr
              style={{
                border: "none",
                borderTop: `2px solid ${theme.accent}`,
                margin: "0 0 0.3rem 0",
              }}
            />
            <h2
              style={{
                color: theme.accent,
                fontFamily: tokens.font.display,
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
                color: "#fff",
                fontStyle: "italic",
                fontFamily: tokens.font.flavor,
                margin: "0 0 0.5rem 0",
                textAlign: "left",
                textIndent: "1rem",
              }}
              dangerouslySetInnerHTML={{
                __html: marked.parseInline(categoryDescription || ""),
              }}
            />

            {/* Category images (optional) */}
            {catImagesArr.length > 0 && (
              <div style={{ marginTop: "0.25rem", marginLeft: "1rem" }}>
                <Button
                  onClick={() =>
                    setVisibleCategoryImages((prev) => ({
                      ...prev,
                      [groupKey]: true,
                    }))
                  }
                  style={{
                    fontSize: tokens.font.size,
                    fontFamily: tokens.font.body,
                    marginBottom: "0.25rem",
                  }}
                >
                  Show category image{catImagesArr.length > 1 ? "s" : ""}
                </Button>

                {visibleCategoryImages[groupKey] && (
                  <div
                    onClick={() =>
                      setVisibleCategoryImages((prev) => ({
                        ...prev,
                        [groupKey]: false,
                      }))
                    }
                    style={overlayStyle}
                  >
                    {catImagesArr.map((img, idx) => (
                      <img
                        key={idx}
                        src={img.url}
                        alt={img.filename || "Category image"}
                        style={overlayImg}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Category audio (optional) */}
            {catAudioArr.length > 0 && (
              <div
                style={{
                  marginTop: "0.5rem",
                  marginLeft: "1rem",
                  marginRight: "1rem",
                }}
              >
                {catAudioArr.map(
                  (audioObj, i) =>
                    audioObj?.url && (
                      <div
                        key={i}
                        className="audio-player-wrapper"
                        style={{
                          marginTop: "0.5rem",
                          maxWidth: "600px",
                          border: "1px solid #ccc",
                          borderRadius: "1.5rem",
                          overflow: "hidden",
                          backgroundColor: theme.bg,
                          boxShadow: "0 0 10px rgba(0, 0, 0, 0.15)",
                        }}
                      >
                        <AudioPlayer
                          src={audioObj.url}
                          showJumpControls={false}
                          layout="horizontal"
                          style={{
                            borderRadius: "1.5rem 1.5rem 0 0",
                            width: "100%",
                          }}
                        />
                        <div
                          style={{
                            textAlign: "center",
                            fontSize: ".9rem",
                            fontFamily: tokens.font.body,
                            padding: "0.4rem 0.6rem",
                            backgroundColor: theme.bg,
                            borderTop: "1px solid #ccc",
                          }}
                        >
                          🎵{" "}
                          {(audioObj.filename || "").replace(/\.[^/.]+$/, "")}
                        </div>
                      </div>
                    )
                )}
              </div>
            )}

            <hr
              style={{
                border: "none",
                borderTop: `2px solid ${theme.accent}`,
                margin: "0.3rem 0 0 0",
              }}
            />
          </div>
        );

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
                  borderColor: theme.accent,
                  backgroundColor: theme.bg,
                  borderRadius: ".75rem",
                  padding: "0.5rem",
                }}
              >
                <CategoryHeader secret />
                {/* Secret category explainer box */}
                <div
                  style={{
                    margin: "0.5rem 1rem",
                    padding: "0.5rem 0.75rem",
                    backgroundColor: theme.bg,
                    border: `1px solid ${theme.accent}`,
                    borderRadius: "0.5rem",
                    fontFamily: tokens.font.body,
                    color: theme.dark,
                    fontSize: tokens.font.size,
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
                    If you follow us on Facebook, you'll see a post at the start
                    of each week letting you know where around central Minnesota
                    you can find us that week. That post also tells you the
                    super secret category for the week, so that you can study up
                    before the contest to have a leg up on the competition!
                  </div>
                </div>
              </div>
            ) : (
              <CategoryHeader />
            )}

            {Object.values(questions)
              .sort((a, b) => {
                const isTB = (q) => (q["Question type"] || "") === "Tiebreaker";
                // Always put the tiebreaker last
                if (isTB(a) && !isTB(b)) return 1;
                if (!isTB(a) && isTB(b)) return -1;

                const convert = (val) => {
                  if (typeof val === "string" && /^[A-Z]$/i.test(val)) {
                    return val.toUpperCase().charCodeAt(0) - 64; // A=1, B=2...
                  }
                  const num = parseInt(val, 10);
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
                          fontFamily: tokens.font.body,
                          fontSize: "1.125rem",
                          marginTop: "1.75rem",
                          marginBottom: 0,
                        }}
                      >
                        <strong>
                          {(q["Question type"] || "") === "Tiebreaker" ? (
                            <>
                              <span
                                aria-hidden="true"
                                style={{
                                  display: "inline-block",
                                  transform: "translateY(-2px)",
                                }}
                              >
                                🎯
                              </span>{" "}
                              Tiebreaker question:
                            </>
                          ) : (
                            <>Question {q["Question order"]}:</>
                          )}
                        </strong>
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
                            fontFamily: tokens.font.flavor,
                            fontSize: "1rem",
                            fontStyle: "italic",
                            display: "block",
                            paddingLeft: "1.5rem",
                            paddingTop: "0.25rem",
                            marginTop: 0,
                            marginBottom: "0.01rem",
                          }}
                        >
                          <span
                            dangerouslySetInnerHTML={{
                              __html: marked.parseInline(
                                `<span style="font-size:1em; position: relative; top: 1px; margin-right:-1px;">💭</span> ${q["Flavor text"]}`
                              ),
                            }}
                          />
                        </p>
                      )}

                      {/* IMAGE POPUP TOGGLE */}
                      {Array.isArray(q.Images) && q.Images.length > 0 && (
                        <div style={{ marginTop: "0.25rem" }}>
                          <Button
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
                              marginBottom: "0.25rem",
                              marginLeft: "1.5rem",
                            }}
                          >
                            Show image
                          </Button>

                          {visibleImages[q["Question ID"]] && (
                            <div
                              onClick={() =>
                                setVisibleImages((prev) => ({
                                  ...prev,
                                  [q["Question ID"]]: false,
                                }))
                              }
                              style={overlayStyle}
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
                                style={overlayImg}
                              />

                              {q.Images.length > 1 && (
                                <div
                                  style={{
                                    display: "flex",
                                    gap: "1rem",
                                    justifyContent: "center",
                                    alignItems: "center",
                                    fontFamily: tokens.font.body,
                                  }}
                                >
                                  <Button
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
                                  >
                                    Previous
                                  </Button>

                                  <Button
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
                                  >
                                    Next
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* QUESTION-LEVEL AUDIO */}
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
                                    maxWidth: "600px",
                                    border: "1px solid #ccc",
                                    borderRadius: "1.5rem",
                                    overflow: "hidden",
                                    backgroundColor: theme.bg,
                                    boxShadow: "0 0 10px rgba(0, 0, 0, 0.15)",
                                  }}
                                >
                                  <AudioPlayer
                                    src={audioObj.url}
                                    showJumpControls={false}
                                    layout="horizontal"
                                    style={{
                                      borderRadius: "1.5rem 1.5rem 0 0",
                                      width: "100%",
                                    }}
                                  />
                                  <div
                                    style={{
                                      textAlign: "center",
                                      fontSize: ".9rem",
                                      fontFamily: tokens.font.body,
                                      padding: "0.4rem 0.6rem",
                                      backgroundColor: theme.bg,
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
                            fontFamily: tokens.font.body,
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
      {showTimer && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            zIndex: 999,
          }}
        >
          <Draggable
            nodeRef={timerRef}
            defaultPosition={timerPosition}
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
                backgroundColor: theme.dark,
                color: "#fff",
                padding: "1rem",
                borderRadius: "0.5rem",
                border: `1px solid ${theme.accent}`,
                boxShadow: "0 0 10px rgba(0,0,0,0.3)",
                fontFamily: tokens.font.body,
                width: "180px",
                textAlign: "center",
                pointerEvents: "auto",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  fontSize: "2rem",
                  fontWeight: "bold",
                  marginBottom: "0.5rem",
                }}
              >
                {timeLeft}s
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: "0.5rem",
                  marginBottom: "0.5rem",
                }}
              >
                <ButtonPrimary
                  onClick={handleStartPause}
                  style={{ width: "70px" }}
                >
                  {timerRunning ? "Pause" : "Start"}
                </ButtonPrimary>
                <Button onClick={handleReset} style={{ width: "70px" }}>
                  Reset
                </Button>
              </div>

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
        </div>
      )}
    </>
  );
}
