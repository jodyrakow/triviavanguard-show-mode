// netlify/functions/live-save.js
exports.handler = async (event) => {
  try {
    const { getStore } = await import("@netlify/blobs");

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

    const store = getStore({ name: "live-state" }); // consistency not required here
    const key = `live/${showId}.json`;

    const current = await store.get(key, { type: "json" }); // parse JSON for us
    if (current && Number(version) !== Number(current.version)) {
      return {
        statusCode: 409,
        body: JSON.stringify({ error: "Version conflict", latest: current }),
      };
    }

    const next = {
      version: (current?.version || 0) + 1,
      updatedAt: Date.now(),
      state: state || { teams: [], grid: {}, entryOrder: [] },
      by,
    };

    await store.set(key, JSON.stringify(next));

    return {
      statusCode: 200,
      headers: {
        ETag: `W/"${next.version}"`,
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({ ok: true, version: next.version }),
    };
  } catch (e) {
    console.error(e);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "live-save failed" }),
    };
  }
};
