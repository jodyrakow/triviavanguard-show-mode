// src/styles/ui.js
import React from "react";

export const colors = {
  dark: "#2B394A",
  accent: "#DC6A24",
  bg: "#eef1f4",
};

export const tokens = {
  radius: { sm: 4, md: 8, pill: 999 },
  spacing: { xs: "0.25rem", sm: "0.5rem", md: "1rem" },
  font: {
    body: "Questrial, sans-serif",
    display: "Antonio, sans-serif",
    flavor: "Sanchez, serif",
    size: "1rem",
  },
};

// --- Buttons ----------------------------------------------------
const baseBtn = {
  padding: "0.5rem 1rem",
  fontSize: "1rem",
  fontFamily: tokens.font.body,
  borderRadius: "0.25rem",
  cursor: "pointer",
  border: "1px solid #ccc",
  background: "#fff",
  color: colors.dark,
};

export const Button = ({ style, children, type = "button", ...props }) => (
  <button
    type={type}
    style={{
      ...baseBtn,
      border: `1px solid ${colors.accent}`,
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

// Tab-style toggle button (use prop `active`)
export const ButtonTab = ({ active, style, children, ...props }) => (
  <button
    style={{
      ...baseBtn,
      borderRadius: tokens.radius.pill,
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

// --- Layout primitives ------------------------------------------
export const ui = {
  // Unified segmented container
  Segmented: ({ style, children }) => (
    <div
      style={{
        display: "inline-flex",
        border: "1px solid #ccc",
        borderRadius: tokens.radius.pill,
        overflow: "hidden",
        background: "#fff",
        flex: "0 1 auto",
        minWidth: 0,
        ...style,
      }}
    >
      {children}
    </div>
  ),

  // Back-compat aliases (use Segmented going forward)
  seg: {
    display: "inline-flex",
    border: "1px solid #ccc",
    borderRadius: tokens.radius.pill,
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
  segWrap: {
    display: "inline-flex",
    border: "1px solid #ccc",
    borderRadius: tokens.radius.pill,
    overflow: "hidden",
    background: "#fff",
  },
  Group: ({ style, children }) => (
    <div
      style={{
        display: "inline-flex",
        border: "1px solid #ccc",
        borderRadius: tokens.radius.pill,
        overflow: "hidden",
        background: "#fff",
        ...style,
      }}
    >
      {children}
    </div>
  ),

  Row: ({ style, children }) => (
    <div
      style={{
        display: "flex",
        gap: tokens.spacing.sm,
        alignItems: "center",
        ...style,
      }}
    >
      {children}
    </div>
  ),

  Bar: ({ style, children }) => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        alignItems: "center",
        columnGap: tokens.spacing.sm,
        rowGap: tokens.spacing.sm,
        width: "100%",
        boxSizing: "border-box",
        padding: "0 12px",
        marginBottom: tokens.spacing.sm,
        overflow: "hidden",
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
        borderRadius: tokens.radius.pill,
        background: "#f3f3f3",
        fontSize: ".85rem",
        ...style,
      }}
    >
      {children}
    </span>
  ),

  Filler: () => <div style={{ flex: 1 }} />,

  // Optional tiny helpers you’ll likely reuse
  Divider: ({ style }) => (
    <hr
      style={{
        border: "none",
        borderTop: `2px solid ${colors.accent}`,
        margin: "0.3rem 0",
        ...style,
      }}
    />
  ),
  Card: ({ style, children }) => (
    <div
      style={{
        background: "#fff",
        border: "1px solid #ddd",
        borderRadius: tokens.radius.md,
        padding: tokens.spacing.sm,
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        ...style,
      }}
    >
      {children}
    </div>
  ),

  // Back-compat: used in ScoringMode for a toggle & stats text
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
  statText: { fontSize: ".95rem", opacity: 0.9 },
};
