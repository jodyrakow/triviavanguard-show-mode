// CommonJS + Netlify Lambda style
const { getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ error: "POST only" }) };
    }

    const {
      showId,
      version,
      state,
      by = null,
    } = JSON.parse(event.body || "{}");
    if (!showId)
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing showId" }),
      };

    const store = getStore({ name: "live-state", consistency: "strong" });
    const key = `live/${showId}.json`;

    const currentText = await store.get(key);
    const current = currentText ? JSON.parse(currentText) : null;

    if (current && Number(version) !== Number(current.version)) {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: "Version conflict", latest: current }),
      };
    }

    const next = {
      version: (current ? current.version : 0) + 1,
      updatedAt: Date.now(),
      state: state || { teams: [], grid: {}, entryOrder: [] },
      by,
    };

    await store.set(key, JSON.stringify(next));

    return {
      statusCode: 200,
      headers: { ETag: `W/"${next.version}"`, "Cache-Control": "no-store" },
      body: JSON.stringify({ ok: true, version: next.version }),
    };
  } catch (e) {
    console.error("live-save failed", e);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "live-save failed" }),
    };
  }
};
