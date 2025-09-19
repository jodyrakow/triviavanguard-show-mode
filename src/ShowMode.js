// src/ShowMode.js
import React, { useMemo } from "react";
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
  showBundle = { rounds: [], teams: [] },
  selectedRoundId,
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
  scoringMode = "pub",
  pubPoints = 10,
  poolPerQuestion = 100,
  prizes = "",
}) {
  const [scriptOpen, setScriptOpen] = React.useState(false);

  const allRounds = showBundle?.rounds || [];
  const displayRounds = selectedRoundId
    ? allRounds.filter((r) => Number(r.round) === Number(selectedRoundId))
    : allRounds;

  // Fallback: if prizes prop is empty, pull from localStorage (same keys ResultsMode uses)
  const [prizesText, setPrizesText] = React.useState(
    typeof prizes === "string"
      ? prizes
      : Array.isArray(prizes)
        ? prizes.join("\n")
        : ""
  );

  React.useEffect(() => {
    // keep in sync if parent starts sending a non-empty prop
    if (typeof prizes === "string" && prizes.trim()) {
      setPrizesText(prizes);
      return;
    }
    if (Array.isArray(prizes) && prizes.length) {
      setPrizesText(prizes.join("\n"));
      return;
    }

    // otherwise, try localStorage
    const showKey = String(
      selectedRoundId ? showBundle?.showId || "" : showBundle?.showId || ""
    ).trim();
    if (!showKey) return;

    const rawPrizes = localStorage.getItem(`tv_prizes_${showKey}`);
    if (rawPrizes) {
      try {
        const arr = JSON.parse(rawPrizes);
        if (Array.isArray(arr)) setPrizesText(arr.join("\n"));
      } catch {}
    }
  }, [prizes, selectedRoundId, showBundle?.showId]);

  // --- Adapter: build groupedQuestions shape from bundle rounds ---
  const groupedQuestionsFromRounds = React.useMemo(() => {
    const grouped = {};
    for (const r of displayRounds || []) {
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
  }, [displayRounds]);

  const isTB = (q) =>
    String(q?.questionType || q?.["Question type"] || "").toLowerCase() ===
    "tiebreaker";

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

  // Parse prizes passed as a string (supports newline- or comma-separated)
  // Parse prizes from the resolved string (prop or localStorage)
  const prizeList = useMemo(() => {
    const raw = (prizesText || "").toString();
    const parts = raw.includes("\n") ? raw.split(/\r?\n/) : raw.split(/,\s*/);
    return parts.map((s) => s.trim()).filter(Boolean);
  }, [prizesText]);

  // TEMP: debug prizes coming in
  console.log("[ShowMode] prizes prop →", prizesText);
  console.log("[ShowMode] prizeList →", prizeList);

  const prizeCount = prizeList.length;

  const ordinal = (n) => {
    const j = n % 10,
      k = n % 100;
    if (j === 1 && k !== 11) return `${n}st`;
    if (j === 2 && k !== 12) return `${n}nd`;
    if (j === 3 && k !== 13) return `${n}rd`;
    return `${n}th`;
  };

  // --- Host Script (safe, minimal data) ---
  const fmtNum = (n) => (Number.isFinite(n) ? n.toLocaleString("en-US") : "—");

  // count non-tiebreaker questions from groupedQuestions
  const totalQuestions = useMemo(() => {
    let count = 0;
    for (const r of allRounds) {
      for (const q of r?.questions || []) {
        const typ = String(
          q?.questionType || q?.["Question type"] || ""
        ).toLowerCase();
        if (typ === "tiebreaker") continue;
        count += 1;
      }
    }
    return count;
  }, [allRounds]);

  const hasTB = useMemo(() => {
    for (const r of allRounds) {
      for (const q of r?.questions || []) {
        const typ = String(
          q?.questionType || q?.["Question type"] || ""
        ).toLowerCase();
        if (typ === "tiebreaker") return true;
      }
    }
    return false;
  }, [allRounds]);

  const totalPointsPossible = useMemo(() => {
    let sum = 0;
    for (const r of allRounds) {
      for (const q of r?.questions || []) {
        if (isTB(q)) continue; // exclude tiebreakers from totals
        const perQ =
          typeof q?.pointsPerQuestion === "number" ? q.pointsPerQuestion : null;
        // Per-question override wins (for either mode). Otherwise use the mode default.
        const base =
          perQ ??
          (scoringMode === "pooled"
            ? Number.isFinite(poolPerQuestion)
              ? poolPerQuestion
              : 0
            : Number.isFinite(pubPoints)
              ? pubPoints
              : 0);
        sum += Number.isFinite(base) ? base : 0;
      }
    }
    return sum;
  }, [allRounds, scoringMode, pubPoints, poolPerQuestion]);
  // Default-per-question and count of special questions (non-TB with overrides)
  const { defaultPer, specialCount } = useMemo(() => {
    const allRounds = Array.isArray(showBundle?.rounds)
      ? showBundle.rounds
      : [];
    const def =
      scoringMode === "pooled"
        ? Number.isFinite(poolPerQuestion)
          ? poolPerQuestion
          : 0
        : Number.isFinite(pubPoints)
          ? pubPoints
          : 0;

    let specials = 0;
    for (const r of allRounds) {
      for (const q of r?.questions || []) {
        const type = String(
          q?.questionType || q?.["Question type"] || ""
        ).toLowerCase();
        if (type.includes("tiebreaker")) continue;
        const perQ =
          typeof q?.pointsPerQuestion === "number" ? q.pointsPerQuestion : null;
        if (perQ !== null && perQ !== def) specials += 1;
      }
    }
    return { defaultPer: def, specialCount: specials };
  }, [showBundle?.rounds, scoringMode, pubPoints, poolPerQuestion]);

  const hostScript = useMemo(() => {
    const s = (n, a, b) => (n === 1 ? a : b);

    const X = totalQuestions;
    const Y = defaultPer;
    const Z = totalPointsPossible;
    const N = specialCount;

    let text = "";

    if (scoringMode === "pooled") {
      if (N > 0) {
        text =
          `Tonight's show has ${fmtNum(X)} question${X === 1 ? "" : "s"}.\n\n` +
          `Each question has a pool of ${fmtNum(Y)} point${Y === 1 ? "" : "s"} ` +
          `that will be split evenly among the teams that answer that question correctly. ` +
          `We do have ${fmtNum(N)} special ${s(N, "question", "questions")} with ${s(N, "a different point value", "different point values")} ` +
          `— we'll explain in more detail when we get to ${s(N, "that question", "those questions")} — ` +
          `giving us a total of ${fmtNum(Z)} points in the pool for the evening.`;
      } else {
        text =
          `Tonight's show has ${fmtNum(X)} question${X === 1 ? "" : "s"}.\n\n` +
          `Each question has a pool of ${fmtNum(Y)} point${Y === 1 ? "" : "s"} ` +
          `that will be split evenly among the teams that answer that question correctly, ` +
          `for a total of ${fmtNum(Z)} points in the pool for the evening.`;
      }
    } else {
      if (N > 0) {
        text =
          `Tonight's show has ${fmtNum(X)} question${X === 1 ? "" : "s"}.\n\n` +
          `Most questions are worth ${fmtNum(Y)} point${Y === 1 ? "" : "s"}, except for ${fmtNum(N)} special ${s(N, "question", "questions")} ` +
          `with ${s(N, "a different point value", "different point values")} — we'll explain in more detail when we get to ${s(N, "that question", "those questions")} — ` +
          `for a total of ${fmtNum(Z)} possible points.`;
      } else {
        text =
          `Tonight's show has ${fmtNum(X)} question${X === 1 ? "" : "s"}.\n\n` +
          `Each question is worth ${fmtNum(Y)} point${Y === 1 ? "" : "s"}, for a total of ${fmtNum(Z)} possible points.`;
      }
    }

    // Prizes (use the pre-parsed prizeList which supports commas or newlines)
    if (prizeList.length > 0) {
      text += `\n\nPrizes for top ${fmtNum(prizeList.length)}:\n`;
      prizeList.forEach((p, i) => {
        text += `\n  • ${ordinal(i + 1)}: ${p}`;
      });
    }

    return text;
  }, [
    scoringMode,
    totalQuestions,
    defaultPer,
    specialCount,
    totalPointsPossible,
    prizeList,
  ]);

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

          <ButtonPrimary
            onClick={() => setScriptOpen(true)}
            title="Show a host-ready script with tonight's details"
          >
            Show script
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

      {scriptOpen && (
        <div
          onMouseDown={() => setScriptOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(43,57,74,.65)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: "min(92vw, 720px)",
              background: "#fff",
              borderRadius: ".6rem",
              border: `1px solid ${theme.accent}`,
              overflow: "hidden",
              boxShadow: "0 10px 30px rgba(0,0,0,.25)",
              fontFamily: tokens.font.body,
              display: "flex",
              flexDirection: "column",
              maxHeight: "85vh",
            }}
          >
            <div
              style={{
                background: theme.dark,
                color: "#fff",
                padding: ".6rem .8rem",
                borderBottom: `2px solid ${theme.accent}`,
                fontFamily: tokens.font.display,
                fontSize: "1.5rem",
                letterSpacing: ".01em",
              }}
            >
              Host Script
            </div>

            <textarea
              readOnly
              value={hostScript}
              style={{
                width: "100%",
                minHeight: "40vh",
                resize: "vertical",
                padding: "1rem",
                border: "1px solid #ddd",
                borderRadius: ".35rem",
                fontFamily: tokens.font.body,
                lineHeight: 1.35,
                fontSize: "1.25rem",
                whiteSpace: "pre-wrap",
                wordWrap: "break-word",
                boxSizing: "border-box",
              }}
            />

            <div
              style={{
                display: "flex",
                gap: ".5rem",
                justifyContent: "flex-end",
                padding: ".8rem .9rem .9rem",
                borderTop: "1px solid #eee",
              }}
            >
              <button
                type="button"
                onClick={() => setScriptOpen(false)}
                style={{
                  padding: ".5rem .75rem",
                  border: "1px solid #ccc",
                  background: "#f7f7f7",
                  borderRadius: ".35rem",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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
