// netlify/functions/live-load.js
exports.handler = async (event) => {
  try {
    const { getStore } = await import("@netlify/blobs");

    const showId = (event.queryStringParameters?.showId || "").trim();
    if (!showId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing showId" }),
      };
    }

    const store = getStore({ name: "live-state", consistency: "strong" });
    const key = `live/${showId}.json`;

    // Get parsed JSON (null if missing)
    const doc = (await store.get(key, { type: "json" })) || {
      version: 0,
      updatedAt: Date.now(),
      state: { teams: [], grid: {}, entryOrder: [] },
      by: null,
    };

    const etag = `W/"${doc.version}"`;
    const ifNoneMatch =
      event.headers?.["if-none-match"] || event.headers?.["If-None-Match"];

    if (ifNoneMatch === etag) {
      return {
        statusCode: 304,
        headers: { ETag: etag, "Cache-Control": "no-store" },
        body: "",
      };
    }

    return {
      statusCode: 200,
      headers: { ETag: etag, "Cache-Control": "no-store" },
      body: JSON.stringify(doc),
    };
  } catch (e) {
    console.error(e);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "live-load failed" }),
    };
  }
};
