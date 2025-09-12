// netlify/functions/live-save.js
import { getStore } from "@netlify/blobs";

export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") return json(405, { error: "POST only" });

    const {
      showId,
      version,
      state,
      by = null,
    } = JSON.parse(event.body || "{}");
    if (!showId) return json(400, { error: "Missing showId" });

    const store = getStore({ name: "live-state", consistency: "strong" });
    const key = `live/${showId}.json`;
    const currentText = await store.get(key);
    const current = currentText ? JSON.parse(currentText) : null;

    if (current && Number(version) !== Number(current.version)) {
      return json(409, { error: "Version conflict", latest: current });
    }

    const next = {
      version: (current ? current.version : 0) + 1,
      updatedAt: Date.now(),
      state: state || { teams: [], grid: {}, entryOrder: [] },
      by,
    };

    await store.set(key, JSON.stringify(next));
    return json(
      200,
      { ok: true, version: next.version },
      {
        ETag: `W/"${next.version}"`,
        "Cache-Control": "no-store",
      }
    );
  } catch (e) {
    console.error(e);
    return json(500, { error: "live-save failed" });
  }
}

function json(statusCode, obj, extraHeaders = {}) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(obj),
  };
}
