// netlify/functions/live-load.js
import { getStore } from "@netlify/blobs";

export const handler = async (event) => {
  try {
    const url = new URL(
      event.rawUrl ||
        `https://x${event.path}${event.rawQuery ? "?" + event.rawQuery : ""}`
    );
    const showId = url.searchParams.get("showId")?.trim();
    if (!showId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing showId" }),
      };
    }

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
    const inm =
      event.headers?.["if-none-match"] || event.headers?.["If-None-Match"];
    if (inm === etag) {
      return {
        statusCode: 304,
        headers: { ETag: etag, "Cache-Control": "no-store" },
        body: "",
      };
    }

    return {
      statusCode: 200,
      headers: {
        ETag: etag,
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(doc),
    };
  } catch (e) {
    console.error("live-load failed", e);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "live-load failed" }),
    };
  }
};
