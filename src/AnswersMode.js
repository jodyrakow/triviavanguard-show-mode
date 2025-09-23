// src/AnswersMode.js
import React, { useMemo, useRef, useState } from "react";
import AudioPlayer from "react-h5-audio-player";
import { marked } from "marked";
import {
  Button,
  ButtonPrimary,
  colors as theme,
  tokens,
  overlayStyle,
  overlayImg,
} from "./styles/index.js";
import "react-h5-audio-player/lib/styles.css";

// Normalize team shapes coming from cache (same as ScoringMode)
const normalizeTeam = (t) => ({
  showTeamId: t.showTeamId,
  teamId: t.teamId ?? null,
  teamName: Array.isArray(t.teamName)
    ? t.teamName[0]
    : t.teamName || "(Unnamed team)",
  showBonus: Number(t.showBonus || 0),
});

// --- Answer Key helpers (drop this near the top of AnswersMode.js) ---

// match ScoringMode's sorting (letters A..Z first, then numbers)
function sortQuestionsForKey(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return [...list].sort((a, b) => {
    const sa = Number(a.sortOrder ?? 9999);
    const sb = Number(b.sortOrder ?? 9999);
    if (sa !== sb) return sa - sb;

    const cvt = (val) => {
      if (typeof val === "string" && /^[A-Z]$/i.test(val)) {
        return val.toUpperCase().charCodeAt(0) - 64; // A=1
      }
      const n = parseInt(val, 10);
      return Number.isNaN(n) ? 9999 : 100 + n;
    };
    return cvt(a.questionOrder) - cvt(b.questionOrder);
  });
}

// detect tiebreaker (skip it for the key)
function detectTB(list) {
  return (
    list.find((q) => (q.questionType || "").toLowerCase() === "tiebreaker") ||
    list.find((q) => String(q.questionOrder).toUpperCase() === "TB") ||
    list.find((q) => String(q.id || "").startsWith("tb-")) ||
    null
  );
}

// Build the answer key text for ONE round
function buildRoundAnswerKeyText(round, { withLabels = true } = {}) {
  if (!round) return "";
  const all = Array.isArray(round.questions) ? round.questions : [];
  const tb = detectTB(all);
  const nonTB = tb ? all.filter((q) => q !== tb) : all;

  const qs = sortQuestionsForKey(nonTB);

  const lines = [];
  for (const q of qs) {
    const label = String(q.questionOrder ?? "").trim();
    const ans = (q.answer ?? "").toString().trim();
    const line = withLabels && label ? `${label}. ${ans}` : ans;
    lines.push(line);
  }

  const head = `Round ${round.round}`;
  return [head, ...lines].join("\n");
}

// Build a full-show text (separated by rounds) — if AnswersMode
// only receives a single round, it will just output that one.
function buildShowAnswerKeyText(showBundle, { withLabels = true } = {}) {
  const rounds = Array.isArray(showBundle?.rounds) ? showBundle.rounds : [];
  const parts = [];
  for (const r of rounds) {
    const txt = buildRoundAnswerKeyText(r, { withLabels });
    if (txt.trim()) parts.push(txt);
  }
  return parts.join("\n\n"); // blank line between rounds
}

export default function AnswersMode({
  showBundle, // { rounds:[{round, questions:[...] }], teams:[...] }
  selectedRoundId, // round number or string (e.g. "1")
  cachedState, // { teams, grid, entryOrder }
  scoringMode, // "pub" | "pooled"
  pubPoints, // (not displayed here, only pooled uses poolPerQuestion)
  poolPerQuestion,
}) {
  // --------- derive round + questions (same fields ScoringMode uses) ---------
  const roundNumber = Number(selectedRoundId);
  const roundObj = useMemo(() => {
    if (!Array.isArray(showBundle?.rounds)) return null;
    return (
      showBundle.rounds.find((r) => Number(r.round) === roundNumber) || null
    );
  }, [showBundle, roundNumber]);

  const questions = useMemo(() => {
    const raw = roundObj?.questions || [];
    // Sort by Sort Order, then Question Order (A/B/C before numbers, then numeric)
    const bySort = [...raw].sort((a, b) => {
      const sa = Number(a.sortOrder ?? 9999);
      const sb = Number(b.sortOrder ?? 9999);
      if (sa !== sb) return sa - sb;
      const cvt = (val) => {
        if (typeof val === "string" && /^[A-Z]$/i.test(val)) {
          return val.toUpperCase().charCodeAt(0) - 64; // A=1
        }
        const n = parseInt(val, 10);
        return isNaN(n) ? 9999 : 100 + n;
      };
      return cvt(a.questionOrder) - cvt(b.questionOrder);
    });

    return bySort.map((q) => ({
      showQuestionId: q.id,
      questionId: (Array.isArray(q.questionId) && q.questionId[0]) || null,
      order: q.questionOrder,
      text: q.questionText || "",
      flavor: q.flavorText || "",
      answer: q.answer || "",
      // category
      categoryName: q.categoryName || "Uncategorized",
      categoryDescription: q.categoryDescription || "",
      categoryOrder:
        typeof q.categoryOrder === "number" ? q.categoryOrder : 9999,
      // attachments
      categoryImages: Array.isArray(q.categoryImages) ? q.categoryImages : [],
      categoryAudio: Array.isArray(q.categoryAudio) ? q.categoryAudio : [], // ← category-level audio
      questionImages: Array.isArray(q.questionImages) ? q.questionImages : [],
      questionAudio: Array.isArray(q.questionAudio) ? q.questionAudio : [],
    }));
  }, [roundObj]);

  // --------- teams + grid (from cache) ---------
  const teams = useMemo(() => {
    const incoming = cachedState?.teams || [];
    return incoming.map(normalizeTeam);
  }, [cachedState]);

  const grid = useMemo(() => cachedState?.grid ?? {}, [cachedState]); // {[showTeamId]: {[showQuestionId]: {isCorrect, questionBonus, overridePoints}}}

  // --------- UI state for images (overlay) ---------
  const [visibleImages, setVisibleImages] = useState({}); // keyed by showQuestionId
  const [currentImageIndex, setCurrentImageIndex] = useState({}); // keyed by showQuestionId
  const [visibleCategoryImages, setVisibleCategoryImages] = useState({}); // keyed by group key
  const topRef = useRef(null);

  // Answer key UI state
  const [akIncludeLabels, setAkIncludeLabels] = React.useState(true);

  const [showAnswerKey, setShowAnswerKey] = React.useState(false);

  const answerKeyText = React.useMemo(() => {
    return buildShowAnswerKeyText(showBundle, { withLabels: akIncludeLabels });
  }, [showBundle, akIncludeLabels]);

  const copyAnswerKey = async () => {
    const text = answerKeyText;
    try {
      await navigator.clipboard.writeText(text);
      alert("Answer key copied to clipboard.");
    } catch {
      window.prompt("Copy the answer key:", text);
    }
  };

  const downloadAnswerKey = () => {
    const text = answerKeyText;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    // If there’s one round, use its number; otherwise “all-rounds”
    const rounds = Array.isArray(showBundle?.rounds) ? showBundle.rounds : [];
    const filename =
      rounds.length === 1
        ? `answer-key-round-${rounds[0]?.round ?? "x"}.txt`
        : "answer-key-all-rounds.txt";
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 0);
  };

  // --------- Group questions by category (carry images & audio once) ---------
  const groupedByCategory = useMemo(() => {
    const m = new Map();
    for (const q of questions) {
      const key = `${q.categoryName}|||${q.categoryDescription}`;
      const prev = m.get(key) || {
        categoryName: q.categoryName,
        categoryDescription: q.categoryDescription,
        categoryOrder: q.categoryOrder,
        categoryImages: q.categoryImages,
        categoryAudio: q.categoryAudio,
        items: [],
      };
      prev.items.push(q);
      prev.categoryOrder = Math.min(
        prev.categoryOrder ?? 9999,
        q.categoryOrder ?? 9999
      );
      if (!prev.categoryImages?.length && q.categoryImages?.length) {
        prev.categoryImages = q.categoryImages;
      }
      if (!prev.categoryAudio?.length && q.categoryAudio?.length) {
        prev.categoryAudio = q.categoryAudio;
      }
      m.set(key, prev);
    }
    return [...m.entries()].sort(
      ([, a], [, b]) => (a.categoryOrder ?? 9999) - (b.categoryOrder ?? 9999)
    );
  }, [questions]);

  // --------- Per-question stats (simple pill needs this) ---------
  const statsByShowQuestionId = useMemo(() => {
    const teamNames = new Map(
      teams.map((t) => [t.showTeamId, t.teamName || "(Unnamed team)"])
    );
    const totalTeams = teams.length;

    const acc = {};
    for (const q of questions) {
      let correct = 0;
      const correctTeams = [];
      for (const t of teams) {
        const cell = grid[t.showTeamId]?.[q.showQuestionId];
        if (cell?.isCorrect) {
          correct++;
          const nm = teamNames.get(t.showTeamId);
          if (nm) correctTeams.push(nm);
        }
      }
      acc[q.showQuestionId] = {
        totalTeams,
        correctCount: correct,
        correctTeams,
      };
    }
    return acc;
  }, [questions, teams, grid]);

  // --------- Guard rails ---------
  const noRound = !roundObj;
  const noData = !teams.length && !questions.length;

  return (
    <div
      ref={topRef}
      style={{ fontFamily: tokens.font.body, color: theme.dark }}
    >
      {noRound ? (
        <div
          style={{ opacity: 0.8, fontStyle: "italic", margin: "0 12px 1rem" }}
        >
          Select a round to see answers.
        </div>
      ) : null}

      {noData ? (
        <div
          style={{ opacity: 0.8, fontStyle: "italic", margin: "0 12px 1rem" }}
        >
          No teams or questions yet for this round.
        </div>
      ) : null}

      {/* Answer Key toggle */}
      <div style={{ marginTop: "0.75rem" }}>
        <ButtonPrimary
          onClick={() => setShowAnswerKey((prev) => !prev)}
          title="Toggle answer key panel"
        >
          {showAnswerKey ? "Hide Answer Key" : "Show answer key"}
        </ButtonPrimary>
      </div>

      {showAnswerKey && (
        <div
          style={{
            marginTop: "0.75rem",
            marginBottom: "0.75rem",
            padding: "0.75rem",
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              flexWrap: "wrap",
            }}
          >
            <strong style={{ marginRight: 8 }}>Answer Key</strong>

            <label
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <input
                type="checkbox"
                checked={akIncludeLabels}
                onChange={(e) => setAkIncludeLabels(e.target.checked)}
              />
              Include labels (A., 1., etc.)
            </label>

            <div style={{ marginLeft: "auto", display: "flex", gap: "0.4rem" }}>
              <button onClick={copyAnswerKey}>Copy</button>
              <button onClick={downloadAnswerKey}>Download .txt</button>
            </div>
          </div>

          {/* Preview */}
          <pre
            style={{
              marginTop: 8,
              marginBottom: 0,
              background: "#fafafa",
              border: "1px solid #eee",
              borderRadius: 6,
              padding: "0.6rem 0.75rem",
              whiteSpace: "pre-wrap",
              lineHeight: 1.5,
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
              fontSize: 13,
              maxHeight: 300,
              overflow: "auto",
            }}
          >
            {answerKeyText}
          </pre>
        </div>
      )}

      {/* Categories + questions */}
      {groupedByCategory.map(([groupKey, cat], idx) => {
        const {
          categoryName,
          categoryDescription,
          categoryImages,
          categoryAudio,
        } = cat;

        return (
          <div
            key={groupKey}
            style={{ marginTop: idx === 0 ? "1rem" : "3rem" }}
          >
            {/* Category header */}
            <div style={{ background: theme.dark, padding: 0 }}>
              <hr
                style={{
                  border: "none",
                  borderTop: `2px solid ${theme.accent}`,
                  margin: "0 0 .3rem 0",
                }}
              />
              <h2
                style={{
                  color: theme.accent,
                  fontFamily: tokens.font.display,
                  fontSize: "1.85rem",
                  margin: 0,
                  textIndent: "0.5rem",
                  letterSpacing: "0.015em",
                }}
                dangerouslySetInnerHTML={{
                  __html: marked.parseInline(categoryName || "Uncategorized"),
                }}
              />
              {categoryDescription?.trim() && (
                <p
                  style={{
                    color: "#fff",
                    fontStyle: "italic",
                    fontFamily: tokens.font.flavor,
                    margin: "0 0 .5rem 0",
                    textIndent: "1rem",
                  }}
                  dangerouslySetInnerHTML={{
                    __html: marked.parseInline(categoryDescription),
                  }}
                />
              )}

              {/* Category images (optional) */}
              {Array.isArray(categoryImages) && categoryImages.length > 0 && (
                <div style={{ margin: ".25rem 0 0 1rem" }}>
                  <Button
                    onClick={() =>
                      setVisibleCategoryImages((p) => ({
                        ...p,
                        [groupKey]: true,
                      }))
                    }
                    style={{ fontFamily: tokens.font.body }}
                  >
                    Show category image{categoryImages.length > 1 ? "s" : ""}
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
                      {categoryImages.map((img, i) => (
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

              {/* Category audio (optional) */}
              {Array.isArray(categoryAudio) && categoryAudio.length > 0 && (
                <div style={{ margin: ".5rem 1rem 0" }}>
                  {categoryAudio.map(
                    (a, i) =>
                      a?.url && (
                        <div
                          key={i}
                          style={{
                            marginTop: ".5rem",
                            maxWidth: 600,
                            border: "1px solid #ccc",
                            borderRadius: "1.5rem",
                            overflow: "hidden",
                            background: "#f9f9f9",
                            boxShadow: "0 0 10px rgba(0,0,0,0.15)",
                          }}
                        >
                          <AudioPlayer src={a.url} showJumpControls={false} />
                          <div
                            style={{
                              textAlign: "center",
                              fontSize: ".9rem",
                              fontFamily: tokens.font.body,
                              padding: ".4rem .6rem",
                              background: "#f9f9f9",
                              borderTop: "1px solid #ccc",
                            }}
                          >
                            🎵 {(a.filename || "").replace(/\.[^/.]+$/, "")}
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
                  margin: ".3rem 0 0 0",
                }}
              />
            </div>

            {/* Questions */}
            {cat.items.map((q) => {
              const stats = statsByShowQuestionId[q.showQuestionId] || null;

              return (
                <div key={q.showQuestionId} style={{ marginTop: "1rem" }}>
                  {/* Question text */}
                  <p
                    style={{
                      fontSize: "1.05rem",
                      margin: "0 0 .25rem 0",
                      fontFamily: tokens.font.body,
                    }}
                  >
                    <strong>Question {q.order}:</strong>
                    <br />
                    <span
                      style={{
                        display: "block",
                        paddingLeft: "1.5rem",
                        paddingTop: ".25rem",
                      }}
                      dangerouslySetInnerHTML={{
                        __html: marked.parseInline(q.text || ""),
                      }}
                    />
                  </p>

                  {/* Flavor (optional) */}
                  {q.flavor?.trim() && (
                    <p
                      style={{
                        fontFamily: tokens.font.flavor,
                        fontSize: "1rem",
                        fontStyle: "italic",
                        margin: ".15rem 0 .25rem 0",
                        paddingLeft: "1.5rem",
                      }}
                      dangerouslySetInnerHTML={{
                        __html: marked.parseInline(
                          `<span style="font-size:1em; position: relative; top: 1px; margin-right:-1px;">💭</span> ${q.flavor}`
                        ),
                      }}
                    />
                  )}

                  {/* Images (question-level) */}
                  {Array.isArray(q.questionImages) &&
                    q.questionImages.length > 0 && (
                      <div style={{ marginTop: ".25rem" }}>
                        <Button
                          onClick={() => {
                            setVisibleImages((prev) => ({
                              ...prev,
                              [q.showQuestionId]: true,
                            }));
                            setCurrentImageIndex((prev) => ({
                              ...prev,
                              [q.showQuestionId]: 0,
                            }));
                          }}
                          style={{
                            marginLeft: "1.5rem",
                            marginBottom: ".25rem",
                            fontFamily: tokens.font.body,
                          }}
                        >
                          Show image
                        </Button>
                        {visibleImages[q.showQuestionId] && (
                          <div
                            onClick={() =>
                              setVisibleImages((prev) => ({
                                ...prev,
                                [q.showQuestionId]: false,
                              }))
                            }
                            style={overlayStyle}
                          >
                            <img
                              src={
                                q.questionImages[
                                  currentImageIndex[q.showQuestionId] || 0
                                ]?.url
                              }
                              alt={
                                q.questionImages[
                                  currentImageIndex[q.showQuestionId] || 0
                                ]?.filename || "Attached image"
                              }
                              style={overlayImg}
                            />
                            {q.questionImages.length > 1 && (
                              <div style={{ display: "flex", gap: "1rem" }}>
                                <Button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCurrentImageIndex((prev) => {
                                      const curr = prev[q.showQuestionId] || 0;
                                      return {
                                        ...prev,
                                        [q.showQuestionId]:
                                          (curr - 1 + q.questionImages.length) %
                                          q.questionImages.length,
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
                                      const curr = prev[q.showQuestionId] || 0;
                                      return {
                                        ...prev,
                                        [q.showQuestionId]:
                                          (curr + 1) % q.questionImages.length,
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

                  {/* Audio (question-level) */}
                  {Array.isArray(q.questionAudio) &&
                    q.questionAudio.length > 0 && (
                      <div
                        style={{
                          marginTop: ".5rem",
                          marginLeft: "1.5rem",
                          marginRight: "1.5rem",
                          maxWidth: 600,
                        }}
                      >
                        {q.questionAudio.map(
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
                                    fontFamily: tokens.font.body,
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
                      fontFamily: tokens.font.body,
                    }}
                  >
                    <span
                      dangerouslySetInnerHTML={{
                        __html: marked.parseInline(
                          `<span style="font-size:.7em; position: relative; top:-1px;">🟢</span> **Answer:** ${q.answer || ""}`
                        ),
                      }}
                    />
                  </p>

                  {/* Stats pill (X/Y correct, pooled share, SOLO) */}
                  {stats && (
                    <div
                      style={{ marginLeft: "1.5rem", marginBottom: ".75rem" }}
                    >
                      <span
                        style={{
                          display: "inline-block",
                          padding: "0.2rem 0.75rem",
                          borderRadius: tokens.radius.pill,
                          background: "#fff",
                          fontSize: "1.05rem",
                          border: `2px solid ${theme.accent}`,
                        }}
                      >
                        {stats.correctCount} / {stats.totalTeams} teams correct
                      </span>

                      {scoringMode === "pooled" && stats.correctCount > 0 && (
                        <span style={{ marginLeft: ".6rem", fontSize: "1rem" }}>
                          <span
                            style={{ color: theme.accent, fontWeight: 700 }}
                          >
                            {Math.round(
                              Number(poolPerQuestion) / stats.correctCount
                            )}
                          </span>{" "}
                          points per team
                        </span>
                      )}

                      {stats.correctCount === 1 && stats.correctTeams[0] && (
                        <span style={{ marginLeft: ".6rem" }}>
                          <span
                            style={{ color: theme.accent, fontWeight: 700 }}
                          >
                            SOLO:
                          </span>{" "}
                          <strong>{stats.correctTeams[0]}</strong>
                        </span>
                      )}
                    </div>
                  )}

                  <hr className="question-divider" />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
