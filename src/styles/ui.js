// src/styles/ui.js
import React from "react";

export const colors = {
  dark: "#2B394A",
  accent: "#DC6A24",
  bg: "#eef1f4",
};

// --- Buttons ----------------------------------------------------
const baseBtn = {
  padding: "0.5rem 1rem",
  fontSize: "1rem",
  fontFamily: "Questrial, sans-serif",
  borderRadius: "0.25rem",
  cursor: "pointer",
  border: "1px solid #ccc",
  background: "#fff", // default white
  color: colors.dark,
};

export const Button = ({ style, children, type = "button", ...props }) => (
  <button
    type={type}
    style={{
      ...baseBtn,
      border: `1px solid ${colors.accent}`, // match primary border
      background: "#fff",
      color: colors.dark,
      ...style,
    }}
    {...props}
  >
    {children}
  </button>
);

export const ButtonPrimary = ({ style, children, ...props }) => (
  <button
    style={{
      ...baseBtn,
      border: `1px solid ${colors.accent}`,
      background: colors.accent,
      color: "#fff",
      ...style,
    }}
    {...props}
  >
    {children}
  </button>
);

// Overlay styles for images/audio
export const overlayStyle = {
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
};

export const overlayImg = {
  maxWidth: "90vw",
  maxHeight: "80vh",
  objectFit: "contain",
  border: "4px solid white",
  boxShadow: "0 0 20px rgba(0,0,0,0.5)",
  marginBottom: "1rem",
};

// Tab-style toggle button (use prop `active`)
export const ButtonTab = ({ active, style, children, ...props }) => (
  <button
    style={{
      ...baseBtn,
      borderRadius: 999,
      border: `1px solid ${active ? colors.accent : "#ccc"}`,
      background: active ? colors.accent : "#fff",
      color: active ? "#fff" : colors.dark,
      padding: ".35rem .6rem",
      ...style,
    }}
    {...props}
  >
    {children}
  </button>
);

// --- Small layout primitives & segmented control helpers --------
const rowBase = {
  display: "flex",
  gap: "0.5rem",
  alignItems: "center",
};

export const ui = {
  // Segmented control container + button style fn
  seg: {
    display: "inline-flex",
    border: "1px solid #ccc",
    borderRadius: 999,
    overflow: "hidden",
    background: "#fff",
  },
  segBtn: (active) => ({
    padding: ".35rem .6rem",
    border: "none",
    background: active ? colors.accent : "transparent",
    color: active ? "#fff" : colors.dark,
    cursor: "pointer",
  }),

  // ===== Layout primitives =====
  Row: ({ style, children }) => (
    <div
      style={{
        display: "flex",
        gap: "0.5rem",
        alignItems: "center",
        ...style,
      }}
    >
      {children}
    </div>
  ),

  // in src/styles/ui.js
  Bar: ({ style, children }) => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto", // left shrinks, right hugs content
        alignItems: "center",
        columnGap: "0.5rem",
        rowGap: "0.5rem",
        width: "100%",
        boxSizing: "border-box",
        padding: "0 12px",
        marginBottom: "0.5rem",
        overflow: "hidden", // guard against tiny overflow
        ...style,
      }}
    >
      {children}
    </div>
  ),

  Group: ({ style, children }) => (
    <div
      style={{
        display: "inline-flex",
        border: "1px solid #ccc",
        borderRadius: 999,
        overflow: "hidden",
        background: "#fff",
        ...style,
      }}
    >
      {children}
    </div>
  ),

  Segmented: ({ style, children }) => (
    <div
      style={{
        display: "inline-flex",
        border: "1px solid #ccc",
        borderRadius: 999,
        overflow: "hidden",
        background: "#fff",
        flex: "0 1 auto", // 👈 allow shrinking
        minWidth: 0, // 👈 allow content to shrink
        ...style,
      }}
    >
      {children}
    </div>
  ),

  Pill: ({ style, children }) => (
    <span
      style={{
        padding: "0.125rem 0.5rem",
        borderRadius: 999,
        background: "#f3f3f3",
        fontSize: ".85rem",
        ...style,
      }}
    >
      {children}
    </span>
  ),

  Filler: () => <div style={{ flex: 1 }} />,

  // ===== Aliases/helpers so ScoringMode works without edits =====
  // Same style as Bar (your “top controls” row)
  row: {
    display: "flex",
    gap: "0.5rem",
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: "0.5rem",
  },

  // Same as the segmented container
  segWrap: {
    display: "inline-flex",
    border: "1px solid #ccc",
    borderRadius: 999,
    overflow: "hidden",
    background: "#fff",
  },

  // Style helper for the “Team Scoring Mode” toggle button
  btnToggle: (active) => ({
    padding: "0.4rem 0.75rem",
    borderRadius: "4px",
    border: `1px solid ${active ? colors.accent : "#ccc"}`,
    background: active ? colors.accent : "#fff",
    color: active ? "#fff" : colors.dark,
    fontSize: "0.95rem",
    fontWeight: 600,
    cursor: "pointer",
  }),

  // Stats text on the right
  statText: {
    fontSize: ".95rem",
    opacity: 0.9,
  },
};
