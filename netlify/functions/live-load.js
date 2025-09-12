// CommonJS + Netlify Lambda style
const { getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  try {
    const showId = (event.queryStringParameters?.showId || "").trim();
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
    if (event.headers && event.headers["if-none-match"] === etag) {
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
    console.error("live-load failed", e);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "live-load failed" }),
    };
  }
};
