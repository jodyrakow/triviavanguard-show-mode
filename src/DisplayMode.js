// src/DisplayMode.js
import React, { useState, useEffect, useRef } from "react";
import { colors as theme, tokens } from "./styles";
import triviaVanguardLogo from "./trivia-vanguard-logo.png";

export default function DisplayMode() {
  const [displayState, setDisplayState] = useState({
    type: "standby", // "standby" | "question" | "standings" | "break"
    content: null,
  });

  // Listen for Pusher events
  useEffect(() => {
    const handleDisplayUpdate = (e) => {
      const { type, content } = e.detail || {};
      console.log("[DisplayMode] Received update:", type, content);
      setDisplayState({ type, content });
    };

    window.addEventListener("tv:displayUpdate", handleDisplayUpdate);
    return () => window.removeEventListener("tv:displayUpdate", handleDisplayUpdate);
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
      {/* Logo - top right */}
      <img
        src={triviaVanguardLogo}
        alt="Trivia Vanguard"
        style={{
          position: "absolute",
          top: "20px",
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
          <QuestionDisplay content={displayState.content} />
        )}
        {displayState.type === "standings" && (
          <StandingsDisplay content={displayState.content} />
        )}
      </div>
    </div>
  );
}

function StandbyScreen() {
  return (
    <div
      style={{
        fontSize: "3rem",
        fontWeight: 300,
        color: theme.gray.text,
        opacity: 0.6,
      }}
    >
      Ready for next question...
    </div>
  );
}

function QuestionDisplay({ content }) {
  const {
    questionNumber,
    questionText,
    categoryName,
    images = [],
  } = content || {};

  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Auto-cycle images every 15 seconds
  useEffect(() => {
    if (!images || images.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % images.length);
    }, 15000);

    return () => clearInterval(interval);
  }, [images]);

  return (
    <div>
      {/* Question number */}
      {questionNumber && (
        <div
          style={{
            fontSize: "4rem",
            fontWeight: 700,
            color: theme.accent,
            marginBottom: "1rem",
          }}
        >
          {questionNumber}
        </div>
      )}

      {/* Category name */}
      {categoryName && (
        <div
          style={{
            fontSize: "1.8rem",
            fontWeight: 600,
            color: theme.gray.text,
            marginBottom: "2rem",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          {categoryName}
        </div>
      )}

      {/* Images */}
      {images && images.length > 0 && (
        <div style={{ marginBottom: "2rem" }}>
          <img
            src={images[currentImageIndex].url}
            alt={`Question image ${currentImageIndex + 1}`}
            style={{
              maxWidth: "90%",
              maxHeight: "500px",
              borderRadius: "12px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
            }}
          />
          {/* Image indicators */}
          {images.length > 1 && (
            <div style={{ marginTop: "1rem", display: "flex", gap: "8px", justifyContent: "center" }}>
              {images.map((_, idx) => (
                <div
                  key={idx}
                  style={{
                    width: "12px",
                    height: "12px",
                    borderRadius: "50%",
                    backgroundColor: idx === currentImageIndex ? theme.accent : theme.gray.border,
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
            fontSize: "2.5rem",
            fontWeight: 500,
            lineHeight: 1.4,
            color: theme.dark,
          }}
        >
          {questionText}
        </div>
      )}
    </div>
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
              <div style={{ fontWeight: 700, fontSize: "2.5rem", color: theme.accent, minWidth: "60px" }}>
                {team.place}
              </div>
              <div style={{ fontWeight: 600 }}>{team.teamName}</div>
            </div>
            <div style={{ fontWeight: 700, fontSize: "2.5rem" }}>{team.total}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
