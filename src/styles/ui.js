// src/styles/ui.js
import React from "react";

export const colors = {
  dark: "#2B394A",
  accent: "#DC6A24",
  bg: "#eef1f4",
  white: "#fff",
  gray: {
    border: "#ccc",
    borderLight: "#ddd",
    borderLighter: "#eee",
    bg: "#f7f7f7",
    bgLight: "#f9f9f9",
    bgLightest: "#fafafa",
    pill: "#f3f3f3",
  },
  overlay: "rgba(43, 57, 74, 0.65)",
  overlayDark: "rgba(43, 57, 74, 0.7)",
  success: "#1ca46d",
  error: "#dc3545",
  accentLight: "rgba(220, 106, 36, 0.1)", // Light orange tint
};

export const tokens = {
  radius: { sm: 4, md: 8, pill: 999 },
  spacing: { xs: "0.25rem", sm: "0.5rem", md: "1rem", lg: "1.5rem", xl: "2rem" },
  font: {
    body: "Questrial, sans-serif",
    display: "Antonio, sans-serif",
    flavor: "Sanchez, serif",
    size: "1rem",
  },
  borders: {
    thin: "1px solid",
    medium: "2px solid",
    thick: "4px solid",
  },
};

// --- Buttons ----------------------------------------------------
const baseBtn = {
  padding: "0.5rem 1rem",
  fontSize: "1rem",
  fontFamily: tokens.font.body,
  borderRadius: "0.25rem",
  cursor: "pointer",
  border: `${tokens.borders.thin} ${colors.gray.border}`,
  background: colors.white,
  color: colors.dark,
};

export const Button = ({ style, children, type = "button", ...props }) => (
  <button
    type={type}
    style={{
      ...baseBtn,
      border: `${tokens.borders.thin} ${colors.accent}`,
      background: colors.white,
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
      border: `${tokens.borders.thin} ${colors.accent}`,
      background: colors.accent,
      color: colors.white,
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
      border: `${tokens.borders.thin} ${active ? colors.accent : colors.gray.border}`,
      background: active ? colors.accent : colors.white,
      color: active ? colors.white : colors.dark,
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
  backgroundColor: colors.overlayDark,
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
  border: `${tokens.borders.thick} ${colors.white}`,
  boxShadow: "0 0 20px rgba(0,0,0,0.5)",
  marginBottom: tokens.spacing.md,
};

// --- Layout primitives ------------------------------------------
export const ui = {
  // Unified segmented container
  Segmented: ({ style, children }) => (
    <div
      style={{
        display: "inline-flex",
        border: `${tokens.borders.thin} ${colors.gray.border}`,
        borderRadius: tokens.radius.pill,
        overflow: "hidden",
        background: colors.white,
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
    border: `${tokens.borders.thin} ${colors.gray.border}`,
    borderRadius: tokens.radius.pill,
    overflow: "hidden",
    background: colors.white,
  },
  segBtn: (active) => ({
    padding: ".35rem .6rem",
    border: "none",
    background: active ? colors.accent : "transparent",
    color: active ? colors.white : colors.dark,
    cursor: "pointer",
  }),
  segWrap: {
    display: "inline-flex",
    border: `${tokens.borders.thin} ${colors.gray.border}`,
    borderRadius: tokens.radius.pill,
    overflow: "hidden",
    background: colors.white,
  },
  Group: ({ style, children }) => (
    <div
      style={{
        display: "inline-flex",
        border: `${tokens.borders.thin} ${colors.gray.border}`,
        borderRadius: tokens.radius.pill,
        overflow: "hidden",
        background: colors.white,
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
        background: colors.gray.pill,
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
        background: colors.white,
        border: `${tokens.borders.thin} ${colors.gray.borderLight}`,
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
    border: `${tokens.borders.thin} ${active ? colors.accent : colors.gray.border}`,
    background: active ? colors.accent : colors.white,
    color: active ? colors.white : colors.dark,
    fontSize: "0.95rem",
    fontWeight: 600,
    cursor: "pointer",
  }),
  statText: { fontSize: ".95rem", opacity: 0.9 },

  // Modal component - unified modal pattern
  Modal: ({ isOpen, onClose, title, subtitle, children, style, contentStyle }) =>
    isOpen ? (
      <div
        onMouseDown={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: colors.overlay,
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: tokens.spacing.md,
        }}
      >
        <div
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            background: colors.white,
            borderRadius: tokens.radius.md,
            border: `${tokens.borders.thin} ${colors.accent}`,
            maxWidth: "90vw",
            maxHeight: "90vh",
            overflow: "auto",
            ...style,
          }}
        >
          {title && (
            <div
              style={{
                background: colors.dark,
                color: colors.white,
                padding: ".6rem .8rem",
                borderBottom: `${tokens.borders.medium} ${colors.accent}`,
              }}
            >
              <div
                style={{
                  fontFamily: tokens.font.display,
                  fontSize: "1.25rem",
                }}
              >
                {title}
              </div>
              {subtitle && (
                <div style={{ fontSize: ".9rem", opacity: 0.9 }}>
                  {subtitle}
                </div>
              )}
            </div>
          )}
          <div style={{ padding: tokens.spacing.md, ...contentStyle }}>
            {children}
          </div>
        </div>
      </div>
    ) : null,

  // Image overlay component
  ImageOverlay: ({ isOpen, onClose, src, alt }) =>
    isOpen ? (
      <div onMouseDown={onClose} style={overlayStyle}>
        <img src={src} alt={alt || ""} style={overlayImg} />
        <ButtonPrimary
          onMouseDown={(e) => {
            e.stopPropagation();
            onClose();
          }}
          style={{ fontSize: "1.1rem" }}
        >
          Close
        </ButtonPrimary>
      </div>
    ) : null,
};
