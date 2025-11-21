// src/DisplayMode.js
import React, { useState, useEffect } from "react";
import { colors as theme, tokens } from "./styles";
import triviaVanguardLogo from "./trivia-vanguard-logo-white.png";
import { marked } from "marked";

export default function DisplayMode() {
  const [displayState, setDisplayState] = useState({
    type: "standby", // "standby" | "question" | "standings" | "message" | "break"
    content: null,
  });
  const [fontSize, setFontSize] = useState(100); // percentage
  const [imageOverlay, setImageOverlay] = useState(null); // { images: [], currentIndex: 0 }

  // Listen for display updates via BroadcastChannel
  useEffect(() => {
    const channel = new BroadcastChannel("tv:display");

    channel.onmessage = (event) => {
      const { type, content } = event.data || {};
      console.log("[DisplayMode] Received update:", type, content);

      if (type === "fontSize") {
        setFontSize(content.size);
      } else if (type === "imageOverlay") {
        setImageOverlay(content);
      } else if (type === "closeImageOverlay") {
        setImageOverlay(null);
      } else {
        setDisplayState({ type, content });
      }
    };

    return () => channel.close();
  }, []);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        backgroundColor: theme.bg,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: tokens.font.body,
        color: theme.dark,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Logo - top right, centered in 100px gray bar */}
      <img
        src={triviaVanguardLogo}
        alt="Trivia Vanguard"
        style={{
          position: "absolute",
          top: "10px",
          right: "20px",
          height: "80px",
          zIndex: 100,
        }}
      />

      {/* Main content area */}
      <div
        style={{
          width: "90%",
          maxWidth: "1400px",
          textAlign: "center",
        }}
      >
        {displayState.type === "standby" && <StandbyScreen />}
        {displayState.type === "question" && (
          <QuestionDisplay content={displayState.content} fontSize={fontSize} />
        )}
        {displayState.type === "questionWithAnswer" && (
          <QuestionDisplay content={displayState.content} fontSize={fontSize} />
        )}
        {displayState.type === "category" && (
          <CategoryDisplay content={displayState.content} fontSize={fontSize} />
        )}
        {displayState.type === "message" && (
          <MessageDisplay content={displayState.content} fontSize={fontSize} />
        )}
        {displayState.type === "standings" && (
          <StandingsDisplay content={displayState.content} />
        )}
        {displayState.type === "results" && (
          <ResultsDisplay content={displayState.content} fontSize={fontSize} />
        )}
      </div>

      {/* Image overlay */}
      {imageOverlay &&
        imageOverlay.images &&
        imageOverlay.images.length > 0 && (
          <ImageOverlay
            images={imageOverlay.images}
            currentIndex={imageOverlay.currentIndex || 0}
            onClose={() => setImageOverlay(null)}
          />
        )}
    </div>
  );
}

function StandbyScreen() {
  return (
    <img
      src={triviaVanguardLogo}
      alt="Trivia Vanguard"
      style={{
        maxWidth: "60%",
        maxHeight: "60vh",
        objectFit: "contain",
      }}
    />
  );
}

function CategoryDisplay({ content, fontSize = 100 }) {
  const { categoryName, categoryDescription } = content || {};
  const scale = fontSize / 100;

  return (
    <div>
      {/* Category name - large, uppercase, same style as question display but bigger */}
      {categoryName && (
        <div
          style={{
            fontSize: `${5 * scale}rem`,
            fontWeight: 700,
            color: theme.accent,

            textTransform: "uppercase",
            letterSpacing: "0.025rem",
          }}
        >
          {categoryName}
        </div>
      )}

      {/* Category description - italic serif font for contrast */}
      {categoryDescription && (
        <div
          style={{
            fontSize: `${2.5 * scale}rem`,
            fontFamily: tokens.font.flavor,
            fontStyle: "italic",
            lineHeight: 1.5,
            color: theme.dark,
            maxWidth: "900px",
            margin: "0 auto",
          }}
          dangerouslySetInnerHTML={{
            __html: marked.parseInline(categoryDescription || ""),
          }}
        />
      )}
    </div>
  );
}

function QuestionDisplay({ content, fontSize = 100 }) {
  const {
    questionNumber,
    questionText,
    categoryName,
    images = [],
    answer,
    pointsPerTeam,
    correctCount,
    totalTeams,
  } = content || {};

  const scale = fontSize / 100;

  const [currentImageIndex] = useState(0);

  return (
    <div>
      {/* Category bar at top - gray bar behind logo */}
      {categoryName && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            height: "100px",
            backgroundColor: theme.gray.border,
            display: "flex",
            justifyContent: "flex-start",
            alignItems: "center",
            paddingLeft: "2rem",
            zIndex: 50,
          }}
        >
          <div
            style={{
              fontSize: `${2 * scale}rem`,
              fontWeight: 600,
              color: theme.dark,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              maxWidth: "calc(100% - 200px)",
              lineHeight: 1.2,
            }}
          >
            {categoryName}
          </div>
        </div>
      )}

      {/* Question number */}
      {questionNumber && (
        <div
          style={{
            fontSize: `${4 * scale}rem`,
            fontWeight: 700,
            color: theme.accent,
            marginBottom: "1rem",
            marginTop: categoryName ? "80px" : "0",
          }}
        >
          {questionNumber === "TB" ? "TIEBREAKER" : questionNumber}
        </div>
      )}

      {/* Images */}
      {images && images.length > 0 && (
        <div style={{ marginBottom: "2rem" }}>
          <img
            src={images[currentImageIndex].url}
            alt={`Question ${currentImageIndex + 1}`}
            style={{
              maxWidth: "90%",
              maxHeight: "500px",
              borderRadius: "12px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
            }}
          />
          {/* Image indicators */}
          {images.length > 1 && (
            <div
              style={{
                marginTop: "1rem",
                display: "flex",
                gap: "8px",
                justifyContent: "center",
              }}
            >
              {images.map((_, idx) => (
                <div
                  key={idx}
                  style={{
                    width: "12px",
                    height: "12px",
                    borderRadius: "50%",
                    backgroundColor:
                      idx === currentImageIndex
                        ? theme.accent
                        : theme.gray.border,
                    transition: "background-color 0.3s",
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Question text */}
      {questionText && (
        <div
          style={{
            fontSize: `${2.5 * scale}rem`,
            fontWeight: 500,
            lineHeight: 1.4,
            color: theme.dark,
          }}
          dangerouslySetInnerHTML={{
            __html: marked.parseInline(questionText || ""),
          }}
        />
      )}

      {/* Answer (if provided) */}
      {answer && (
        <>
          <div
            style={{
              fontSize: `${2.5 * scale}rem`,
              fontWeight: 600,
              lineHeight: 1.4,
              color: theme.accent,
              marginTop: "2rem",
            }}
            dangerouslySetInnerHTML={{
              __html: marked.parseInline(answer || ""),
            }}
          />

          {/* Stats for all scoring modes */}
          {((correctCount !== null && totalTeams !== null) ||
            pointsPerTeam !== null) && (
            <div
              style={{
                marginTop: "2rem",
                fontSize: `${2.5 * scale}rem`,
                color: theme.dark,
                fontFamily: tokens.font.body,
              }}
            >
              {correctCount !== null && totalTeams !== null && (
                <div
                  style={{
                    marginBottom: pointsPerTeam !== null ? "0.5rem" : "0",
                  }}
                >
                  {correctCount} / {totalTeams} teams correct
                </div>
              )}
              {pointsPerTeam !== null && pointsPerTeam !== undefined && (
                <div>
                  <span
                    style={{
                      color: theme.accent,
                      fontWeight: 700,
                      fontSize: `${2.5 * scale}rem`,
                    }}
                  >
                    {pointsPerTeam}
                  </span>{" "}
                  points per team
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MessageDisplay({ content, fontSize = 100 }) {
  const { text } = content || {};
  const scale = fontSize / 100;

  return (
    <div
      style={{
        fontSize: `${3 * scale}rem`,
        fontWeight: 600,
        lineHeight: 1.5,
        color: theme.dark,
        padding: "2rem",
      }}
      dangerouslySetInnerHTML={{
        __html: marked.parseInline(text || ""),
      }}
    />
  );
}

function StandingsDisplay({ content }) {
  const { standings = [] } = content || {};

  return (
    <div>
      <h1
        style={{
          fontSize: "3.5rem",
          fontWeight: 700,
          color: theme.accent,
          marginBottom: "2rem",
        }}
      >
        Current Standings
      </h1>
      <div style={{ fontSize: "2rem" }}>
        {standings.map((team, idx) => (
          <div
            key={team.showTeamId || idx}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "1rem 2rem",
              marginBottom: "0.5rem",
              backgroundColor: theme.white,
              borderRadius: "8px",
              border: `2px solid ${theme.gray.border}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: "2.5rem",
                  color: theme.accent,
                  minWidth: "60px",
                }}
              >
                {team.place}
              </div>
              <div style={{ fontWeight: 600 }}>{team.teamName}</div>
            </div>
            <div style={{ fontWeight: 700, fontSize: "2.5rem" }}>
              {team.total}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ImageOverlay({ images, currentIndex, onClose }) {
  const [idx, setIdx] = useState(currentIndex);

  // Update index when new images are pushed
  useEffect(() => {
    setIdx(currentIndex);
  }, [currentIndex, images]);

  const handlePrev = (e) => {
    e.stopPropagation();
    setIdx((prev) => (prev - 1 + images.length) % images.length);
  };

  const handleNext = (e) => {
    e.stopPropagation();
    setIdx((prev) => (prev + 1) % images.length);
  };

  return (
    <div
      onClick={onClose}
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
      <img
        src={images[idx]?.url}
        alt={`${idx + 1} of ${images.length}`}
        style={{
          maxWidth: "90vw",
          maxHeight: "80vh",
          objectFit: "contain",
          border: `4px solid ${theme.white}`,
          boxShadow: "0 0 20px rgba(0,0,0,0.5)",
          marginBottom: "1rem",
        }}
      />

      {/* Navigation buttons for multiple images */}
      {images.length > 1 && (
        <div
          style={{
            display: "flex",
            gap: "1rem",
            alignItems: "center",
            fontFamily: tokens.font.body,
          }}
        >
          <button
            onClick={handlePrev}
            style={{
              padding: "0.5rem 1rem",
              fontSize: "1rem",
              borderRadius: "0.25rem",
              border: `1px solid ${theme.accent}`,
              background: theme.white,
              color: theme.dark,
              cursor: "pointer",
            }}
          >
            Previous
          </button>
          <span style={{ color: theme.white, fontSize: "1.2rem" }}>
            {idx + 1} / {images.length}
          </span>
          <button
            onClick={handleNext}
            style={{
              padding: "0.5rem 1rem",
              fontSize: "1rem",
              borderRadius: "0.25rem",
              border: `1px solid ${theme.accent}`,
              background: theme.white,
              color: theme.dark,
              cursor: "pointer",
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

// Results display for showing final placements
function ResultsDisplay({ content, fontSize = 100 }) {
  if (!content) return null;

  const { place, teams, prize, isTied } = content;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "2rem",
        padding: "2rem",
      }}
    >
      {/* Place heading */}
      <div
        style={{
          fontSize: `${5 * (fontSize / 100)}rem`,
          fontFamily: tokens.font.display,
          color: theme.accent,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          fontWeight: 700,
        }}
      >
        {isTied ? `TIED for ${place}` : place}
      </div>

      {/* Team names */}
      <div
        style={{
          fontSize: `${5 * (fontSize / 100)}rem`,
          fontFamily: tokens.font.body,
          color: theme.dark,
          lineHeight: 1.5,
        }}
      >
        {teams.map((team, idx) => (
          <div key={idx} style={{ marginBottom: "0.5rem" }}>
            {team}
          </div>
        ))}
      </div>

      {/* Prize (if provided) */}
      {prize && (
        <div
          style={{
            fontSize: `${4 * (fontSize / 100)}rem`,
            fontFamily: tokens.font.body,
            color: theme.accent,
            fontWeight: 600,
            marginTop: "1rem",
          }}
        >
          {prize}
        </div>
      )}
    </div>
  );
}
