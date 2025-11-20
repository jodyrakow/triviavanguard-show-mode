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
  selectedShowId,
  selectedRoundId, // round number or string (e.g. "1")
  cachedState, // { teams, grid, entryOrder }
  cachedByRound, // for cumulative tiebreaker detection
  scoringMode, // "pub" | "pooled"
  pubPoints, // (not displayed here, only pooled uses poolPerQuestion)
  poolPerQuestion,
  prizes = "", // NEW: prizes from shared state (newline-separated string)
  editQuestionField,
  refreshBundle,
  sendToDisplay,
}) {
  // Unified question editor modal state
  const [editingQuestion, setEditingQuestion] = React.useState(null);
  // { showQuestionId, questionText, flavorText, answer }
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
      _edited: q._edited || false, // flag if question has been edited
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

  // --------- Prize count (derived from prizes prop) ---------
  const prizeCount = useMemo(() => {
    if (!prizes) return 0;
    return prizes.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).length;
  }, [prizes]);

  // --------- Tiebreaker detection (similar to ResultsMode) ---------
  const tbQ = useMemo(() => {
    const allRounds = Array.isArray(showBundle?.rounds) ? showBundle.rounds : [];
    for (const r of allRounds) {
      for (const q of r?.questions || []) {
        const type = (q.questionType || "").toLowerCase();
        if (
          type === "tiebreaker" ||
          String(q.questionOrder).toUpperCase() === "TB" ||
          String(q.id || "").startsWith("tb-")
        ) {
          return q;
        }
      }
    }
    return null;
  }, [showBundle]);

  // Check if tiebreaker was used (need full show logic from ResultsMode)
  const tiebreakerWasUsed = useMemo(() => {
    if (!prizeCount || prizeCount <= 0 || !tbQ || !cachedByRound) return false;

    // Build standings similar to ResultsMode to check if TB was used
    const allRounds = Array.isArray(showBundle?.rounds) ? showBundle.rounds : [];
    const allQuestions = [];
    for (const r of allRounds) {
      for (const q of r?.questions || []) {
        allQuestions.push({
          showQuestionId: q.id,
          questionType: q.questionType || null,
        });
      }
    }

    // Get cell from any round
    const getCell = (showTeamId, showQuestionId) => {
      for (const rid of Object.keys(cachedByRound)) {
        const cell = cachedByRound[rid]?.grid?.[showTeamId]?.[showQuestionId];
        if (cell) return cell;
      }
      return null;
    };

    // Merge teams across rounds
    const byId = new Map();
    for (const rid of Object.keys(cachedByRound)) {
      const arr = cachedByRound[rid]?.teams || [];
      for (const t of arr) {
        const norm = normalizeTeam(t);
        if (!byId.has(norm.showTeamId)) {
          byId.set(norm.showTeamId, norm);
        }
      }
    }
    const teams = [...byId.values()];

    // Calculate totals
    const totalByTeam = new Map(
      teams.map((t) => [t.showTeamId, Number(t.showBonus || 0)])
    );

    for (const t of teams) {
      for (const q of allQuestions) {
        if (q.showQuestionId === tbQ.id) continue; // Skip TB for scoring

        const cell = getCell(t.showTeamId, q.showQuestionId);
        if (!cell?.isCorrect) continue;

        // Simplified scoring - just add points
        const base = scoringMode === "pub" ? Number(pubPoints) : 10; // simplified
        totalByTeam.set(
          t.showTeamId,
          (totalByTeam.get(t.showTeamId) || 0) + base
        );
      }
    }

    // Build rows
    const rows = teams.map((t) => ({
      showTeamId: t.showTeamId,
      total: totalByTeam.get(t.showTeamId) || 0,
    }));

    // Sort by total
    rows.sort((a, b) => b.total - a.total);

    // Assign provisional places
    let place = 0,
      prevTotal = null,
      cnt = 0;
    for (const r of rows) {
      cnt++;
      if (prevTotal === null || r.total !== prevTotal) {
        place = cnt;
        prevTotal = r.total;
      }
      r.place = place;
    }

    // Check if there's a tie in the prize band
    const tieInPrizeBand = rows.some((r, i) => {
      if (r.place > prizeCount) return false;
      const next = rows[i + 1];
      return next && next.total === r.total && r.place <= prizeCount;
    });

    return tieInPrizeBand;
  }, [prizeCount, tbQ, cachedByRound, showBundle, scoringMode, pubPoints]);

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

      {/* Answer Key toggle and Refresh Questions */}
      <div style={{ marginTop: "0.75rem", display: "flex", gap: tokens.spacing.sm }}>
        <ButtonPrimary
          onClick={() => setShowAnswerKey((prev) => !prev)}
          title="Toggle answer key panel"
        >
          {showAnswerKey ? "Hide Answer Key" : "Show answer key"}
        </ButtonPrimary>

        {refreshBundle && (
          <Button
            onClick={refreshBundle}
            title="Re-fetch questions from Airtable to get fresh audio/image URLs (does not affect scoring)"
          >
            Refresh Questions
          </Button>
        )}
      </div>

      {showAnswerKey && (
        <div
          style={{
            marginTop: "0.75rem",
            marginBottom: "0.75rem",
            padding: "0.75rem",
            background: theme.white,
            border: `${tokens.borders.thin} ${theme.gray.borderLight}`,
            borderRadius: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: tokens.spacing.sm,
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

            <div style={{ marginLeft: "auto", display: "flex", gap: tokens.spacing.sm }}>
              <button onClick={copyAnswerKey}>Copy</button>
              <button onClick={downloadAnswerKey}>Download .txt</button>
            </div>
          </div>

          {/* Preview */}
          <pre
            style={{
              marginTop: 8,
              marginBottom: 0,
              background: theme.gray.bgLightest,
              border: `${tokens.borders.thin} ${theme.gray.borderLighter}`,
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
            style={{ marginTop: idx === 0 ? tokens.spacing.md : "3rem" }}
          >
            {/* Category header */}
            <div style={{ background: theme.dark, padding: 0 }}>
              <hr
                style={{
                  border: "none",
                  borderTop: `${tokens.borders.medium} ${theme.accent}`,
                  margin: "0 0 .3rem 0",
                }}
              />
              <h2
                style={{
                  color: theme.accent,
                  fontFamily: tokens.font.display,
                  fontSize: "1.85rem",
                  margin: 0,
                  textIndent: tokens.spacing.sm,
                  letterSpacing: "0.015em",
                }}
                dangerouslySetInnerHTML={{
                  __html: marked.parseInline(categoryName || "Uncategorized"),
                }}
              />
              {categoryDescription?.trim() && (
                <p
                  style={{
                    color: theme.white,
                    fontStyle: "italic",
                    fontFamily: tokens.font.flavor,
                    margin: "0 0 .5rem 0",
                    textIndent: tokens.spacing.md,
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
                            border: `${tokens.borders.thin} ${theme.gray.border}`,
                            borderRadius: tokens.spacing.lg,
                            overflow: "hidden",
                            background: theme.gray.bgLight,
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
                              background: theme.gray.bgLight,
                              borderTop: `${tokens.borders.thin} ${theme.gray.border}`,
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
                  borderTop: `${tokens.borders.medium} ${theme.accent}`,
                  margin: ".3rem 0 0 0",
                }}
              />
            </div>

            {/* Questions */}
            {cat.items.map((q) => {
              const stats = statsByShowQuestionId[q.showQuestionId] || null;
              const isTiebreaker = String(q.order).toUpperCase() === "TB";

              return (
                <div key={q.showQuestionId} style={{ marginTop: tokens.spacing.md }}>
                  {/* Question text */}
                  <p
                    style={{
                      fontSize: "1.05rem",
                      margin: "0 0 .25rem 0",
                      fontFamily: tokens.font.body,
                      cursor: editQuestionField ? "pointer" : "default",
                    }}
                    title={editQuestionField ? "Right-click or Ctrl+Click to edit" : ""}
                    onContextMenu={(e) => {
                      if (editQuestionField) {
                        e.preventDefault();
                        setEditingQuestion({
                          showQuestionId: q.showQuestionId,
                          questionText: q.text || "",
                          flavorText: q.flavor || "",
                          answer: q.answer || "",
                        });
                      }
                    }}
                    onClick={(e) => {
                      if (editQuestionField && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        setEditingQuestion({
                          showQuestionId: q.showQuestionId,
                          questionText: q.text || "",
                          flavorText: q.flavor || "",
                          answer: q.answer || "",
                        });
                      }
                    }}
                  >
                    <strong>Question {q.order}:</strong>
                    {sendToDisplay && (
                      <Button
                        onClick={() => {
                          sendToDisplay("question", {
                            questionNumber: q.order,
                            questionText: q.text || "",
                            categoryName: "",
                            images: [],
                          });
                        }}
                        style={{
                          marginLeft: "1rem",
                          fontSize: "0.9rem",
                          padding: "0.25rem 0.5rem",
                        }}
                        title="Push question to display"
                      >
                        Push to display
                      </Button>
                    )}
                    {q._edited && (
                      <span
                        style={{
                          marginLeft: ".4rem",
                          fontSize: ".75rem",
                          fontWeight: 600,
                          color: theme.accent,
                          opacity: 0.8,
                        }}
                        title="This question has been edited by the host"
                      >
                        ✏️ edited
                      </span>
                    )}
                    {isTiebreaker && (
                      <>
                        {tiebreakerWasUsed && (
                          <span
                            style={{
                              fontSize: ".75rem",
                              fontWeight: 600,
                              padding: ".15rem .5rem",
                              borderRadius: "999px",
                              background: theme.accent,
                              color: theme.white,
                              marginLeft: ".5rem",
                            }}
                          >
                            USED
                          </span>
                        )}
                        {!tiebreakerWasUsed && prizeCount > 0 && (
                          <span
                            style={{
                              fontSize: ".75rem",
                              fontWeight: 600,
                              padding: ".15rem .5rem",
                              borderRadius: "999px",
                              background: theme.gray.border,
                              color: theme.dark,
                              opacity: 0.7,
                              marginLeft: ".5rem",
                            }}
                          >
                            NOT USED
                          </span>
                        )}
                        {!tiebreakerWasUsed && prizeCount === 0 && (
                          <span
                            style={{
                              fontSize: ".75rem",
                              fontWeight: 600,
                              padding: ".15rem .5rem",
                              borderRadius: "999px",
                              background: "#ffc107",
                              color: theme.dark,
                              marginLeft: ".5rem",
                            }}
                          >
                            ⚠️ SET PRIZES IN RESULTS
                          </span>
                        )}
                      </>
                    )}
                    <br />
                    <span
                      style={{
                        display: "block",
                        paddingLeft: tokens.spacing.lg,
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
                        paddingLeft: tokens.spacing.lg,
                        cursor: editQuestionField ? "pointer" : "default",
                      }}
                      title={editQuestionField ? "Right-click or Ctrl+Click to edit" : ""}
                      onContextMenu={(e) => {
                        if (editQuestionField) {
                          e.preventDefault();
                          setEditingQuestion({
                            showQuestionId: q.showQuestionId,
                            questionText: q.text || "",
                            flavorText: q.flavor || "",
                            answer: q.answer || "",
                          });
                        }
                      }}
                      onClick={(e) => {
                        if (editQuestionField && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          setEditingQuestion({
                            showQuestionId: q.showQuestionId,
                            questionText: q.text || "",
                            flavorText: q.flavor || "",
                            answer: q.answer || "",
                          });
                        }
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
                            marginLeft: tokens.spacing.lg,
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
                              <div style={{ display: "flex", gap: tokens.spacing.md }}>
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
                          marginLeft: tokens.spacing.lg,
                          marginRight: tokens.spacing.lg,
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
                                  border: `${tokens.borders.thin} ${theme.gray.border}`,
                                  borderRadius: tokens.spacing.lg,
                                  overflow: "hidden",
                                  background: theme.gray.bgLight,
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
                                    background: theme.gray.bgLight,
                                    borderTop: `${tokens.borders.thin} ${theme.gray.border}`,
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
                  <div
                    style={{
                      fontSize: "1.05rem",
                      marginTop: ".4rem",
                      marginBottom: ".25rem",
                      marginLeft: tokens.spacing.lg,
                      marginRight: tokens.spacing.lg,
                      fontFamily: tokens.font.body,
                      cursor: editQuestionField ? "pointer" : "default",
                    }}
                    title={editQuestionField ? "Right-click or Ctrl+Click to edit" : ""}
                    onContextMenu={(e) => {
                      if (editQuestionField) {
                        e.preventDefault();
                        setEditingQuestion({
                          showQuestionId: q.showQuestionId,
                          questionText: q.text || "",
                          flavorText: q.flavor || "",
                          answer: q.answer || "",
                        });
                      }
                    }}
                    onClick={(e) => {
                      if (editQuestionField && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        setEditingQuestion({
                          showQuestionId: q.showQuestionId,
                          questionText: q.text || "",
                          flavorText: q.flavor || "",
                          answer: q.answer || "",
                        });
                      }
                    }}
                  >
                    <span
                      style={{
                        fontSize: ".7em",
                        position: "relative",
                        top: "-1px",
                        marginRight: ".3rem",
                      }}
                    >
                      🟢
                    </span>
                    <strong>Answer: </strong>
                    <span
                      dangerouslySetInnerHTML={{
                        __html: marked.parseInline(q.answer || ""),
                      }}
                    />
                    {sendToDisplay && (
                      <Button
                        onClick={() => {
                          sendToDisplay("questionWithAnswer", {
                            questionNumber: q.order,
                            questionText: q.text || "",
                            answer: q.answer || "",
                          });
                        }}
                        style={{
                          marginLeft: "1rem",
                          fontSize: "0.9rem",
                          padding: "0.25rem 0.5rem",
                        }}
                        title="Push question with answer to display"
                      >
                        Push answer to display
                      </Button>
                    )}
                  </div>

                  {/* Stats pill (X/Y correct, pooled share, SOLO) - skip for tiebreaker */}
                  {stats && !isTiebreaker && (
                    <div
                      style={{ marginLeft: tokens.spacing.lg, marginBottom: ".75rem" }}
                    >
                      <span
                        style={{
                          display: "inline-block",
                          padding: "0.2rem 0.75rem",
                          borderRadius: tokens.radius.pill,
                          background: theme.white,
                          fontSize: "1.05rem",
                          border: `${tokens.borders.medium} ${theme.accent}`,
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

      {/* Unified Question Editor Modal */}
      {editingQuestion && (
        <div
          onClick={() => setEditingQuestion(null)}
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
              width: "min(92vw, 720px)",
              background: "#fff",
              borderRadius: ".6rem",
              border: `1px solid ${theme.accent}`,
              overflow: "hidden",
              boxShadow: "0 10px 30px rgba(0,0,0,.25)",
              fontFamily: tokens.font.body,
            }}
          >
            {/* Header */}
            <div
              style={{
                background: theme.dark,
                color: "#fff",
                padding: ".6rem .8rem",
                borderBottom: `2px solid ${theme.accent}`,
                fontFamily: tokens.font.display,
                fontSize: "1.25rem",
                letterSpacing: ".01em",
              }}
            >
              Edit Question
            </div>

            {/* Body */}
            <div style={{ padding: ".9rem .9rem .2rem" }}>
              <label style={{ display: "block", marginBottom: ".6rem" }}>
                <div style={{ marginBottom: 4, fontWeight: 600 }}>
                  Question text
                </div>
                <textarea
                  value={editingQuestion.questionText}
                  onChange={(e) =>
                    setEditingQuestion((prev) => ({
                      ...prev,
                      questionText: e.target.value,
                    }))
                  }
                  rows={3}
                  style={{
                    width: "100%",
                    padding: ".55rem .65rem",
                    border: "1px solid #ccc",
                    borderRadius: ".35rem",
                    resize: "vertical",
                    fontFamily: tokens.font.body,
                    fontSize: "1rem",
                  }}
                />
              </label>

              <label style={{ display: "block", marginBottom: ".6rem" }}>
                <div style={{ marginBottom: 4, fontWeight: 600 }}>
                  Flavor text (optional)
                </div>
                <textarea
                  value={editingQuestion.flavorText}
                  onChange={(e) =>
                    setEditingQuestion((prev) => ({
                      ...prev,
                      flavorText: e.target.value,
                    }))
                  }
                  rows={2}
                  placeholder="Optional context or additional info..."
                  style={{
                    width: "100%",
                    padding: ".55rem .65rem",
                    border: "1px solid #ccc",
                    borderRadius: ".35rem",
                    resize: "vertical",
                    fontFamily: tokens.font.body,
                    fontSize: "1rem",
                    fontStyle: "italic",
                  }}
                />
              </label>

              <label style={{ display: "block", marginBottom: ".6rem" }}>
                <div style={{ marginBottom: 4, fontWeight: 600 }}>
                  Answer
                </div>
                <textarea
                  value={editingQuestion.answer}
                  onChange={(e) =>
                    setEditingQuestion((prev) => ({
                      ...prev,
                      answer: e.target.value,
                    }))
                  }
                  rows={2}
                  style={{
                    width: "100%",
                    padding: ".55rem .65rem",
                    border: "1px solid #ccc",
                    borderRadius: ".35rem",
                    resize: "vertical",
                    fontFamily: tokens.font.body,
                    fontSize: "1rem",
                  }}
                />
              </label>
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
                type="button"
                onClick={() => setEditingQuestion(null)}
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
                type="button"
                onClick={() => {
                  if (editQuestionField) {
                    // Save all three fields
                    editQuestionField(
                      editingQuestion.showQuestionId,
                      "question",
                      editingQuestion.questionText.trim()
                    );
                    editQuestionField(
                      editingQuestion.showQuestionId,
                      "flavorText",
                      editingQuestion.flavorText.trim()
                    );
                    editQuestionField(
                      editingQuestion.showQuestionId,
                      "answer",
                      editingQuestion.answer.trim()
                    );
                  }
                  setEditingQuestion(null);
                }}
                style={{
                  padding: ".5rem .75rem",
                  border: `1px solid ${theme.accent}`,
                  background: theme.accent,
                  color: "#fff",
                  borderRadius: ".35rem",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
