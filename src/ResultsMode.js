// src/ResultsMode.js
import React, { useEffect, useMemo, useState, useRef } from "react";
import axios from "axios";
import AudioPlayer from "react-h5-audio-player";
import { marked } from "marked";
import {
  Button,
  ButtonPrimary,
  colors as theme,
  overlayStyle,
  overlayImg,
} from "./styles/index.js";
import "react-h5-audio-player/lib/styles.css";

export default function ResultsMode({
  selectedShowId,
  selectedRoundId,
  scoringMode,
  setScoringMode,
  pubPoints,
  setPubPoints,
  poolPerQuestion,
  setPoolPerQuestion,
}) {
  const [grouped, setGrouped] = useState({});
  const [teams, setTeams] = useState([]); // [{showTeamId, teamId, teamName, showBonus}]
  const [scores, setScores] = useState([]); // [{id, showTeamId, showQuestionId, isCorrect, questionBonus}]
  const [questions, setQuestions] = useState([]); // [{showQuestionId, questionId, order, text}]
  const [visibleImages, setVisibleImages] = useState({});
  const [currentImageIndex, setCurrentImageIndex] = useState({});
  const [visibleCategoryImages, setVisibleCategoryImages] = useState({});

  // Prize editor (brand-styled modal)
  const [prizeEditorOpen, setPrizeEditorOpen] = useState(false);
  const [prizeCount, setPrizeCount] = useState(0); // how many places get prizes
  const [prizes, setPrizes] = useState([]); // array of strings (index 0 = 1st place)
  const showPrizeCol = prizeCount > 0 && prizes.some((p) => p && p.length);

  // temp editing buffers
  const [draftCount, setDraftCount] = useState(prizeCount);
  const [draftPrizes, setDraftPrizes] = useState(prizes);

  const finalStandingsRef = useRef(null);

  const openPrizeEditor = () => {
    setDraftCount(prizeCount || 0);
    setDraftPrizes(prizes.length ? [...prizes] : []);
    setPrizeEditorOpen(true);
  };

  const closePrizeEditor = () => setPrizeEditorOpen(false);

  const applyPrizeEdits = () => {
    setPrizeCount(draftCount);
    setPrizes(draftPrizes.slice(0, draftCount));
    setPrizeEditorOpen(false);
  };

  const clearPrizes = () => {
    setDraftCount(0);
    setDraftPrizes([]);
  };

  const ensureDraftLen = (n) => {
    const arr = draftPrizes.slice();
    while (arr.length < n) arr.push("");
    return arr.slice(0, n);
  };

  // ------- fetch data -------
  useEffect(() => {
    if (!selectedShowId || !selectedRoundId) return;

    // grouped questions (question text/media)
    axios
      .post("/.netlify/functions/fetchShowData", {
        showId: selectedShowId,
        roundId: selectedRoundId,
      })
      .then((res) => setGrouped(res.data || {}))
      .catch((e) => console.error("ResultsMode fetchShowData error:", e));

    // teams + show-questions + scores for this show/round
    axios
      .get("/.netlify/functions/fetchScores", {
        params: { showId: selectedShowId, roundId: selectedRoundId },
      })
      .then((res) => {
        setTeams(res.data.teams || []);
        setQuestions(res.data.questions || []);
        setScores(res.data.scores || []);
      })
      .catch((e) => console.error("ResultsMode fetchScores error:", e));
  }, [selectedShowId, selectedRoundId]);

  // Map: showTeamId -> teamName (for SOLO labels etc.)
  const teamNameByShowTeamId = useMemo(() => {
    const m = new Map();
    for (const t of teams) m.set(t.showTeamId, t.teamName || "(Unnamed team)");
    return m;
  }, [teams]);

  // Map: showQuestionId -> Question ID (align scores with grouped)
  const showQIdToQuestionId = useMemo(() => {
    const m = new Map();
    for (const q of questions) {
      if (q.showQuestionId && q.questionId) {
        m.set(q.showQuestionId, q.questionId);
      }
    }
    return m;
  }, [questions]);

  // ordinal labels
  const ordinal = (n) => {
    const s = ["th", "st", "nd", "rd"],
      v = n % 100;
    return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
  };

  // Per-question stats keyed by **Question ID**
  const statsByQuestionId = useMemo(() => {
    const teamsThatScored = new Set(scores.map((s) => s.showTeamId));
    const totalTeamsForThisRound = teamsThatScored.size;

    const acc = {}; // questionId -> { totalTeams, correctCount, correctTeams[] }
    for (const s of scores) {
      const qId = showQIdToQuestionId.get(s.showQuestionId);
      if (!qId) continue;
      if (!acc[qId]) {
        acc[qId] = {
          totalTeams: totalTeamsForThisRound,
          correctCount: 0,
          correctTeams: [],
        };
      }
      if (s.isCorrect) {
        const name = teamNameByShowTeamId.get(s.showTeamId);
        if (name) acc[qId].correctTeams.push(name);
        acc[qId].correctCount += 1;
      }
    }
    return acc;
  }, [scores, showQIdToQuestionId, teamNameByShowTeamId]);

  // Standings (Pub / Pooled)
  const standings = useMemo(() => {
    if (!teams.length) return [];

    const correctByShowQuestion = new Map(); // showQuestionId -> Set(showTeamId)
    if (scoringMode === "pooled") {
      for (const s of scores) {
        if (!s.isCorrect) continue;
        const set = correctByShowQuestion.get(s.showQuestionId) || new Set();
        set.add(s.showTeamId);
        correctByShowQuestion.set(s.showQuestionId, set);
      }
    }

    const totalByTeam = new Map();
    for (const t of teams)
      totalByTeam.set(t.showTeamId, Number(t.showBonus || 0));

    for (const s of scores) {
      const base = totalByTeam.get(s.showTeamId) ?? 0;
      const qb = Number(s.questionBonus || 0);

      if (scoringMode === "pub") {
        const earned = s.isCorrect ? Number(pubPoints) : 0;
        totalByTeam.set(s.showTeamId, base + earned + qb);
      } else {
        const correctSet =
          correctByShowQuestion.get(s.showQuestionId) || new Set();
        const n = correctSet.size;
        const shareRaw = s.isCorrect && n > 0 ? Number(poolPerQuestion) / n : 0;
        const share = Math.round(shareRaw);
        totalByTeam.set(s.showTeamId, base + share + qb);
      }
    }

    const rows = teams.map((t) => ({
      showTeamId: t.showTeamId,
      teamName: t.teamName || "(Unnamed team)",
      total: +(totalByTeam.get(t.showTeamId) ?? 0),
    }));

    rows.sort(
      (a, b) =>
        b.total - a.total ||
        a.teamName.localeCompare(b.teamName, "en", { sensitivity: "base" })
    );

    let place = 0;
    let prevTotal = null;
    let count = 0;
    for (const r of rows) {
      count++;
      if (prevTotal === null || r.total !== prevTotal) {
        place = count;
        prevTotal = r.total;
      }
      r.place = place;
    }

    return rows;
  }, [teams, scores, scoringMode, pubPoints, poolPerQuestion]);

  // Sort categories (visuals first, then by Category order) — matches ShowMode
  const sortedGrouped = useMemo(() => {
    const entries = Object.entries(grouped);
    const hasVisual = (cat) =>
      Object.values(cat.questions || {}).some((q) =>
        (q["Question type"] || "").includes("Visual")
      );

    return entries.sort(([, a], [, b]) => {
      const av = hasVisual(a) ? 1 : 0;
      const bv = hasVisual(b) ? 1 : 0;
      if (av !== bv) return bv - av; // visuals first
      const ao = a.categoryInfo?.["Category order"] ?? 999;
      const bo = b.categoryInfo?.["Category order"] ?? 999;
      return ao - bo;
    });
  }, [grouped]);

  return (
    <div style={{ fontFamily: "Questrial, sans-serif", color: theme.dark }}>
      {/* Header */}
      <div
        style={{
          backgroundColor: theme.dark,
          padding: "0.5rem 0",
          borderTop: `2px solid ${theme.accent}`,
          borderBottom: `2px solid ${theme.accent}`,
          marginBottom: "0.75rem",
        }}
      >
        <h2
          style={{
            color: theme.accent,
            fontFamily: "Antonio",
            fontSize: "1.6rem",
            margin: 0,
            textIndent: "0.5rem",
            letterSpacing: "0.015em",
          }}
        >
          Results
        </h2>
      </div>

      <ButtonPrimary
        onClick={() => {
          finalStandingsRef.current?.scrollIntoView({ behavior: "smooth" });
        }}
        style={{ marginBottom: ".75rem" }}
        aria-label="Jump to Final Standings"
      >
        Jump to Final Standings
      </ButtonPrimary>

      {/* Categories / Questions with answer + stats */}
      {sortedGrouped.map(([categoryId, cat], idx) => {
        const categoryName =
          cat.categoryInfo?.["Category name"]?.trim() || "Uncategorized";
        const categoryDescription =
          cat.categoryInfo?.["Category description"]?.trim() || "";

        // Unified key + image handling (single or array), matches ShowMode
        const groupKey = `${categoryName}|||${categoryDescription}`;
        const catImages = cat.categoryInfo?.["Category image"];
        const catImagesArr = Array.isArray(catImages)
          ? catImages
          : catImages
            ? [catImages]
            : [];

        return (
          <div
            key={categoryId}
            style={{ marginTop: idx === 0 ? "1rem" : "3rem" }}
          >
            <div style={{ background: "#2B394A", padding: 0 }}>
              <hr
                style={{
                  border: "none",
                  borderTop: `2px solid ${theme.accent}`,
                  margin: "0 0 .3rem 0",
                }}
              />
              <h3
                style={{
                  color: theme.accent,
                  fontFamily: "Antonio",
                  fontSize: "1.4rem",
                  margin: 0,
                  textIndent: "0.5rem",
                  letterSpacing: "0.015em",
                }}
                dangerouslySetInnerHTML={{
                  __html: marked.parseInline(categoryName),
                }}
              />
              {categoryDescription && (
                <p
                  style={{
                    color: "#fff",
                    fontStyle: "italic",
                    fontFamily: "Sanchez",
                    margin: "0 0 .5rem 0",
                    textIndent: "1rem",
                  }}
                  dangerouslySetInnerHTML={{
                    __html: marked.parseInline(categoryDescription),
                  }}
                />
              )}

              {/* Category images (optional) */}
              {catImagesArr.length > 0 && (
                <div style={{ margin: ".25rem 0 0 1rem" }}>
                  <Button
                    onClick={() =>
                      setVisibleCategoryImages((p) => ({
                        ...p,
                        [groupKey]: true,
                      }))
                    }
                  >
                    Show category image{catImagesArr.length > 1 ? "s" : ""}
                  </Button>
                  {visibleCategoryImages[groupKey] && (
                    <div
                      onClick={() =>
                        setVisibleCategoryImages((p) => ({
                          ...p,
                          [groupKey]: false,
                        }))
                      }
                      style={overlayStyle}
                    >
                      {catImagesArr.map((img, i) => (
                        <img
                          key={i}
                          src={img.url}
                          alt={img.filename || "Category image"}
                          style={overlayImg}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              <hr
                style={{
                  border: "none",
                  borderTop: `2px solid ${theme.accent}`,
                  margin: ".3rem 0 0 0",
                }}
              />
            </div>

            {/* Questions in this category */}
            {Object.values(cat.questions || {})
              .sort((a, b) => {
                const conv = (v) =>
                  typeof v === "string" && /^[A-Za-z]$/.test(v)
                    ? v.toUpperCase().charCodeAt(0) - 64
                    : isNaN(parseInt(v, 10))
                      ? 999
                      : parseInt(v, 10);
                return conv(a["Question order"]) - conv(b["Question order"]);
              })
              .map((q) => {
                const stats = statsByQuestionId[q["Question ID"]] || null;

                return (
                  <div key={q["Question ID"]} style={{ marginTop: "1rem" }}>
                    {/* Question text */}
                    <p style={{ fontSize: "1.05rem", margin: "0 0 .25rem 0" }}>
                      <strong>Question {q["Question order"]}:</strong>
                      <br />
                      <span
                        style={{
                          display: "block",
                          paddingLeft: "1.5rem",
                          paddingTop: ".25rem",
                        }}
                        dangerouslySetInnerHTML={{
                          __html: marked.parseInline(q["Question text"] || ""),
                        }}
                      />
                    </p>

                    {/* Flavor (always shown in results) */}
                    {q["Flavor text"]?.trim() && (
                      <p
                        style={{
                          fontFamily: "Lora, serif",
                          fontSize: "1rem",
                          fontStyle: "italic",
                          margin: ".15rem 0 .25rem 0",
                          paddingLeft: "1.5rem",
                        }}
                        dangerouslySetInnerHTML={{
                          __html: marked.parseInline(
                            `<span style="font-size:1em; position: relative; top: 1px; margin-right:-1px;">💭</span> ${q["Flavor text"]}`
                          ),
                        }}
                      />
                    )}

                    {/* Media (image/audio) — same behavior as ShowMode */}
                    {Array.isArray(q.Images) && q.Images.length > 0 && (
                      <div style={{ marginTop: ".25rem" }}>
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
                            marginLeft: "1.5rem",
                            marginBottom: ".25rem",
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
                              <div style={{ display: "flex", gap: "1rem" }}>
                                <Button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCurrentImageIndex((prev) => {
                                      const curr = prev[q["Question ID"]] || 0;
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
                                      const curr = prev[q["Question ID"]] || 0;
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

                    {Array.isArray(q.Audio) && q.Audio.length > 0 && (
                      <div
                        style={{
                          marginTop: ".5rem",
                          marginLeft: "1.5rem",
                          marginRight: "1.5rem",
                          maxWidth: 600,
                        }}
                      >
                        {q.Audio.map(
                          (audioObj, i) =>
                            audioObj.url && (
                              <div
                                key={i}
                                style={{
                                  marginTop: ".5rem",
                                  border: "1px solid #ccc",
                                  borderRadius: "1.5rem",
                                  overflow: "hidden",
                                  background: "#f9f9f9",
                                  boxShadow: "0 0 10px rgba(0,0,0,0.15)",
                                }}
                              >
                                <AudioPlayer
                                  src={audioObj.url}
                                  showJumpControls={false}
                                />
                                <div
                                  style={{
                                    textAlign: "center",
                                    fontSize: ".9rem",
                                    padding: ".4rem .6rem",
                                    background: "#f9f9f9",
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

                    {/* Answer */}
                    <p
                      style={{
                        fontSize: "1.05rem",
                        marginTop: ".4rem",
                        marginBottom: ".25rem",
                        marginLeft: "1.5rem",
                        marginRight: "1.5rem",
                      }}
                    >
                      <span
                        dangerouslySetInnerHTML={{
                          __html: marked.parseInline(
                            `<span style="font-size:.7em; position: relative; top:-1px;">🟢</span> **Answer:** ${q["Answer"] || ""}`
                          ),
                        }}
                      />
                    </p>

                    {/* Stats pill + pooled share + SOLO */}
                    <div
                      style={{ marginLeft: "1.5rem", marginBottom: ".75rem" }}
                    >
                      {stats ? (
                        <>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "0.2rem 0.75rem",
                              borderRadius: 999,
                              background: "#fff",
                              fontSize: "1.05rem",
                              border: `2px solid ${theme.accent}`,
                            }}
                          >
                            {stats.correctCount} / {stats.totalTeams} teams
                            correct
                          </span>

                          {scoringMode === "pooled" &&
                            stats.correctCount > 0 && (
                              <span
                                style={{
                                  marginLeft: ".6rem",
                                  fontSize: "1rem",
                                }}
                              >
                                <span
                                  style={{
                                    color: theme.accent,
                                    fontWeight: 700,
                                  }}
                                >
                                  {Math.round(
                                    Number(poolPerQuestion) / stats.correctCount
                                  )}
                                </span>{" "}
                                points per team
                              </span>
                            )}

                          {stats.correctCount === 1 &&
                            stats.correctTeams[0] && (
                              <span style={{ marginLeft: ".6rem" }}>
                                <span
                                  style={{
                                    color: theme.accent,
                                    fontWeight: 700,
                                  }}
                                >
                                  SOLO:
                                </span>{" "}
                                <strong>{stats.correctTeams[0]}</strong>
                              </span>
                            )}
                        </>
                      ) : (
                        <span style={{ opacity: 0.6, fontStyle: "italic" }}>
                          (no stats found for this question)
                        </span>
                      )}
                    </div>

                    <hr className="question-divider" />
                  </div>
                );
              })}
          </div>
        );
      })}

      {/* Controls + live standings */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          gap: ".75rem",
          padding: "0 12px",
          marginBottom: "1rem",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: ".5rem" }}>
          <div
            style={{
              display: "inline-flex",
              border: "1px solid #ccc",
              borderRadius: 999,
              overflow: "hidden",
              background: "#fff",
            }}
          >
            <button
              onClick={() => setScoringMode("pub")}
              style={{
                padding: ".35rem .6rem",
                border: "none",
                background:
                  scoringMode === "pub" ? theme.accent : "transparent",
                color: scoringMode === "pub" ? "#fff" : theme.dark,
                cursor: "pointer",
              }}
            >
              Pub scoring
            </button>
            <button
              onClick={() => setScoringMode("pooled")}
              style={{
                padding: ".35rem .6rem",
                border: "none",
                background:
                  scoringMode === "pooled" ? theme.accent : "transparent",
                color: scoringMode === "pooled" ? "#fff" : theme.dark,
                cursor: "pointer",
              }}
            >
              Pooled scoring
            </button>
          </div>

          {scoringMode === "pub" ? (
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: ".4rem",
              }}
            >
              <span>Points per question:</span>
              <input
                type="number"
                value={pubPoints}
                min={0}
                step={1}
                onChange={(e) => setPubPoints(Number(e.target.value || 0))}
                style={{
                  width: 80,
                  padding: ".35rem .5rem",
                  border: "1px solid #ccc",
                  borderRadius: ".35rem",
                }}
              />
            </label>
          ) : (
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: ".4rem",
              }}
            >
              <span>Pooled points per question:</span>
              <input
                type="number"
                value={poolPerQuestion}
                min={0}
                step={10}
                onChange={(e) =>
                  setPoolPerQuestion(Number(e.target.value || 0))
                }
                style={{
                  width: 120,
                  padding: ".35rem .5rem",
                  border: "1px solid #ccc",
                  borderRadius: ".35rem",
                }}
              />
            </label>
          )}
        </div>
      </div>

      {/* Prizes control (brand-styled) */}
      <div
        style={{
          margin: "0 12px .5rem",
          display: "flex",
          alignItems: "center",
          gap: ".5rem",
        }}
      >
        <button
          onClick={openPrizeEditor}
          style={{
            padding: ".45rem .7rem",
            border: `1px solid ${theme.accent}`,
            background: "#fff",
            color: theme.accent,
            borderRadius: ".35rem",
            cursor: "pointer",
            fontFamily: "Questrial, sans-serif",
          }}
          title="Configure prize text shown in the standings table"
        >
          {showPrizeCol ? "Edit prizes" : "Set prizes"}
        </button>

        {showPrizeCol && (
          <span
            style={{
              fontSize: ".9rem",
              opacity: 0.9,
              padding: ".2rem .55rem",
              borderRadius: "999px",
              border: `1px solid ${theme.accent}`,
              background: "rgba(220,106,36,0.06)",
              color: theme.accent,
              fontFamily: "Questrial, sans-serif",
            }}
          >
            Showing prizes for {prizeCount} place{prizeCount > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Prize Editor Modal */}
      {prizeEditorOpen && (
        <div
          onClick={closePrizeEditor}
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
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(92vw, 560px)",
              background: "#fff",
              borderRadius: ".6rem",
              border: `1px solid ${theme.accent}`,
              overflow: "hidden",
              boxShadow: "0 10px 30px rgba(0,0,0,.25)",
              fontFamily: "Questrial, sans-serif",
            }}
          >
            {/* Header */}
            <div
              style={{
                background: theme.dark,
                color: "#fff",
                padding: ".6rem .8rem",
                borderBottom: `2px solid ${theme.accent}`,
              }}
            >
              <div
                style={{
                  fontFamily: "Antonio, sans-serif",
                  fontSize: "1.25rem",
                  letterSpacing: ".01em",
                }}
              >
                Configure Prizes
              </div>
              <div
                style={{ fontSize: ".9rem", opacity: 0.9, marginTop: ".15rem" }}
              >
                Add prize labels for top finishers (optional)
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: ".9rem .9rem 0" }}>
              {/* How many prizes */}
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: ".5rem",
                  marginBottom: ".75rem",
                }}
              >
                <span style={{ minWidth: 160 }}>Number of prize places:</span>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={draftCount}
                  onChange={(e) => {
                    const next = Math.max(
                      0,
                      Math.min(20, parseInt(e.target.value || "0", 10))
                    );
                    setDraftCount(next);
                    setDraftPrizes(ensureDraftLen(next));
                  }}
                  style={{
                    width: 90,
                    padding: ".45rem .55rem",
                    border: "1px solid #ccc",
                    borderRadius: ".35rem",
                  }}
                />
                {draftCount > 0 && (
                  <button
                    onClick={clearPrizes}
                    style={{
                      marginLeft: "auto",
                      padding: ".35rem .6rem",
                      border: "1px solid #ccc",
                      background: "#f7f7f7",
                      borderRadius: ".35rem",
                      cursor: "pointer",
                    }}
                    title="Clear all prizes"
                  >
                    Clear
                  </button>
                )}
              </label>

              {/* Prize rows */}
              {Array.from({ length: draftCount }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: ".5rem",
                    marginBottom: ".55rem",
                  }}
                >
                  <div
                    style={{
                      width: 92,
                      textAlign: "right",
                      paddingRight: ".25rem",
                      color: theme.accent,
                      fontWeight: 700,
                    }}
                  >
                    {ordinal(i + 1)}:
                  </div>
                  <input
                    type="text"
                    value={draftPrizes[i] || ""}
                    placeholder={`Prize for ${ordinal(i + 1)} place (e.g., $25 gift card)`}
                    onChange={(e) => {
                      const arr = ensureDraftLen(draftCount);
                      arr[i] = e.target.value;
                      setDraftPrizes(arr);
                    }}
                    style={{
                      flex: 1,
                      padding: ".45rem .55rem",
                      border: "1px solid #ccc",
                      borderRadius: ".35rem",
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Footer */}
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
                onClick={closePrizeEditor}
                style={{
                  padding: ".5rem .75rem",
                  border: "1px solid #ccc",
                  background: "#f7f7f7",
                  borderRadius: ".35rem",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={applyPrizeEdits}
                style={{
                  padding: ".5rem .8rem",
                  border: `1px solid ${theme.accent}`,
                  background: theme.accent,
                  color: "#fff",
                  borderRadius: ".35rem",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Save prizes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Final standings (after Q&A) — compact, left-hugging ===== */}
      <div
        ref={finalStandingsRef}
        style={{
          margin: "1.5rem 12px 2rem",
          display: "inline-block",
          background: "#fff",
          border: "1px solid #ddd",
          borderRadius: ".5rem",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: theme.bg,
            borderBottom: "1px solid #ddd",
            padding: ".6rem .75rem",
            fontWeight: 700,
            letterSpacing: ".01em",
          }}
        >
          Final standings
        </div>

        <div style={{ padding: ".4rem .6rem" }}>
          {standings.length === 0 ? (
            <div style={{ opacity: 0.7, fontStyle: "italic" }}>
              No teams yet.
            </div>
          ) : (
            <table
              style={{
                display: "inline-table",
                width: "auto",
                borderCollapse: "separate",
                borderSpacing: 0,
              }}
            >
              <thead>
                <tr>
                  {showPrizeCol && (
                    <th
                      style={{
                        textAlign: "center",
                        padding: ".15rem .1rem",
                        whiteSpace: "nowrap",
                        fontSize: ".9rem",
                      }}
                    >
                      Prize
                    </th>
                  )}
                  <th
                    style={{
                      textAlign: "center",
                      padding: ".15rem .1rem",
                      whiteSpace: "nowrap",
                      fontSize: ".9rem",
                    }}
                  >
                    Place
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      padding: ".15rem .1rem",
                      whiteSpace: "nowrap",
                      fontSize: ".9rem",
                      width: 1,
                    }}
                  />
                  <th
                    style={{
                      textAlign: "center",
                      padding: ".15rem .1rem",
                      paddingRight: ".5rem",
                      whiteSpace: "nowrap",
                      fontSize: ".9rem",
                    }}
                  >
                    Points
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: ".15rem .1rem",
                      whiteSpace: "nowrap",
                      fontSize: ".9rem",
                    }}
                  >
                    Team
                  </th>
                </tr>
              </thead>

              <tbody>
                {(() => {
                  let tieGroupIndex = 0;
                  return standings.map((r, i, arr) => {
                    const prev = arr[i - 1];
                    const sameAsPrev = !!prev && prev.total === r.total;
                    if (!sameAsPrev) tieGroupIndex++;

                    const next = arr[i + 1];
                    const sameAsNext = !!next && next.total === r.total;
                    const isEndOfTieGroup = !sameAsNext;
                    const gapToNext =
                      isEndOfTieGroup && next ? r.total - next.total : 0;

                    const bgColor =
                      tieGroupIndex % 2 === 0
                        ? "#fff"
                        : "rgba(255, 165, 0, 0.07)";

                    const prizeText =
                      showPrizeCol && r.place <= prizeCount
                        ? prizes[r.place - 1] || ""
                        : "";

                    return (
                      <tr
                        key={r.showTeamId}
                        style={{
                          borderTop: "1px solid #eee",
                          backgroundColor: bgColor,
                        }}
                      >
                        {showPrizeCol && (
                          <td
                            style={{
                              textAlign: "center",
                              whiteSpace: "nowrap",
                              paddingRight: ".1rem",
                              fontSize: "1.05rem",
                              maxWidth: "18ch",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                            title={prizeText}
                          >
                            {prizeText}
                          </td>
                        )}

                        <td
                          style={{
                            textAlign: "center",
                            whiteSpace: "nowrap",
                            fontWeight: 700,
                            fontSize: "1.25rem",
                            padding: ".15rem .1rem",
                          }}
                        >
                          {ordinal(r.place)}
                        </td>

                        <td
                          style={{
                            textAlign: "right",
                            whiteSpace: "nowrap",
                            width: "2.5rem",
                            paddingLeft: ".75rem",
                          }}
                        >
                          {gapToNext > 0 ? (
                            <span
                              style={{
                                fontSize: ".85rem",
                                color: theme.accent,
                                fontWeight: 700,
                              }}
                            >
                              +{gapToNext}
                            </span>
                          ) : (
                            ""
                          )}
                        </td>

                        <td
                          style={{
                            textAlign: "center",
                            whiteSpace: "nowrap",
                            fontSize: "1.25rem",
                            padding: ".15rem .1rem",
                            paddingRight: ".5rem",
                          }}
                        >
                          <strong>
                            {Number.isInteger(r.total)
                              ? r.total
                              : r.total.toFixed(2)}
                          </strong>
                        </td>

                        <td
                          style={{
                            fontSize: "1.25rem",
                            textAlign: "left",
                            padding: ".15rem .1rem",
                          }}
                        >
                          {r.teamName}
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
