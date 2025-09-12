// src/liveSync.js
import { useEffect, useRef, useCallback } from "react";

export function useLiveShowSync({ showId, getState, applyRemote }) {
  const versionRef = useRef(0);
  const pollingRef = useRef(null);
  const saveTimerRef = useRef(null);

  // load once (and whenever showId changes)
  const loadNow = useCallback(async () => {
    if (!showId) return;
    try {
      const res = await fetch(
        `/.netlify/functions/live-load?showId=${encodeURIComponent(showId)}`,
        {
          headers: { "If-None-Match": `W/"${versionRef.current}"` },
        }
      );
      if (res.status === 304) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      versionRef.current = Number(json.version || 0);
      if (json.state) applyRemote(json); // {version, updatedAt, state, by}
    } catch (e) {
      console.warn("live-load error", e);
    }
  }, [showId, applyRemote]);

  // start polling
  useEffect(() => {
    if (!showId) return;
    loadNow(); // initial
    clearInterval(pollingRef.current);
    pollingRef.current = setInterval(loadNow, 3000); // 3s poll
    return () => clearInterval(pollingRef.current);
  }, [showId, loadNow]);

  // debounce save
  const queueSave = useCallback(
    (by = null) => {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        if (!showId) return;
        try {
          const body = {
            showId,
            version: versionRef.current,
            state: getState(), // your per-show cached state
            by,
          };
          const res = await fetch("/.netlify/functions/live-save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (res.status === 409) {
            // we’re stale: pull latest and let applyRemote replace local
            const { latest } = await res.json().catch(() => ({}));
            if (latest?.version != null) {
              versionRef.current = Number(latest.version);
              applyRemote(latest);
            }
            return;
          }
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json();
          versionRef.current = Number(json.version || versionRef.current);
        } catch (e) {
          console.warn("live-save error", e);
        }
      }, 400); // debounce
    },
    [showId, getState, applyRemote]
  );

  return { queueSave };
}
