// netlify/functions/live-load.js
import { getStore } from "@netlify/blobs";

export async function handler(event) {
  try {
    const url = new URL(event.rawUrl);
    const showId = url.searchParams.get("showId")?.trim();
    if (!showId) return json(400, { error: "Missing showId" });

    const store = getStore({ name: "live-state", consistency: "strong" });
    const key = `live/${showId}.json`;
    const text = await store.get(key);

    const doc = text
      ? JSON.parse(text)
      : {
          version: 0,
          updatedAt: Date.now(),
          state: { teams: [], grid: {}, entryOrder: [] },
          by: null,
        };

    const etag = `W/"${doc.version}"`;
    if (event.headers["if-none-match"] === etag) {
      return {
        statusCode: 304,
        headers: { ETag: etag, "Cache-Control": "no-store" },
      };
    }

    return json(200, doc, { ETag: etag, "Cache-Control": "no-store" });
  } catch (e) {
    console.error(e);
    return json(500, { error: "live-load failed" });
  }
}

function json(statusCode, obj, extraHeaders = {}) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(obj),
  };
}
