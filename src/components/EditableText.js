// src/components/EditableText.js
import React, { useState, useRef, useEffect } from "react";
import { tokens, colors } from "../styles/index.js";

/**
 * EditableText - A hover-reveal editable text component
 *
 * @param {string} value - The current text value
 * @param {function} onSave - Callback when text is saved (value) => void
 * @param {string} placeholder - Placeholder text
 * @param {boolean} multiline - If true, uses textarea instead of input
 * @param {boolean} isEdited - If true, shows edited indicator
 * @param {object} style - Additional styles for the container
 */
export default function EditableText({
  value,
  onSave,
  placeholder = "Click to edit",
  multiline = false,
  isEdited = false,
  style = {},
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value || "");
  const inputRef = useRef(null);

  // Update editValue when value prop changes
  useEffect(() => {
    if (!isEditing) {
      setEditValue(value || "");
    }
  }, [value, isEditing]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleEdit = () => {
    setIsEditing(true);
    setEditValue(value || "");
  };

  const handleSave = () => {
    const trimmed = editValue.trim();
    if (trimmed !== value) {
      onSave(trimmed);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(value || "");
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (!multiline && e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    } else if (multiline && e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    }
  };

  if (isEditing) {
    const InputComponent = multiline ? "textarea" : "input";
    return (
      <div style={{ position: "relative", ...style }}>
        <InputComponent
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          placeholder={placeholder}
          style={{
            width: "100%",
            padding: ".4rem .5rem",
            border: `${tokens.borders.medium} ${colors.accent}`,
            borderRadius: ".35rem",
            fontFamily: tokens.font.body,
            fontSize: "inherit",
            lineHeight: "inherit",
            outline: "none",
            ...(multiline && {
              minHeight: "80px",
              resize: "vertical",
            }),
          }}
        />
        <div
          style={{
            fontSize: ".75rem",
            marginTop: ".25rem",
            opacity: 0.7,
            fontFamily: tokens.font.body,
          }}
        >
          {multiline ? "Ctrl+Enter to save, Esc to cancel" : "Enter to save, Esc to cancel"}
        </div>
      </div>
    );
  }

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: "relative",
        display: "inline-block",
        width: "100%",
        ...style,
      }}
    >
      <span style={{ display: "inline" }}>
        {value || <span style={{ opacity: 0.5, fontStyle: "italic" }}>{placeholder}</span>}
      </span>
      {isEdited && (
        <span
          style={{
            marginLeft: ".4rem",
            fontSize: ".75rem",
            fontWeight: 600,
            color: colors.accent,
            opacity: 0.8,
          }}
          title="This text has been edited by the host"
        >
          ✏️ edited
        </span>
      )}
      {isHovered && (
        <button
          type="button"
          onClick={handleEdit}
          style={{
            marginLeft: ".5rem",
            padding: ".25rem .4rem",
            border: `${tokens.borders.thin} ${colors.accent}`,
            background: colors.white,
            color: colors.accent,
            borderRadius: ".25rem",
            cursor: "pointer",
            fontSize: ".8rem",
            fontFamily: tokens.font.body,
            fontWeight: 600,
            verticalAlign: "middle",
          }}
          title="Click to edit"
        >
          ✏️ Edit
        </button>
      )}
    </div>
  );
}
