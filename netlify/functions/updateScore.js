// netlify/functions/updateScore.js
const Airtable = require("airtable");
const base = new Airtable({ apiKey: process.env.AIRTABLE_TOKEN }).base(
  "appnwzfwa2Bl6V2jX"
);

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const { scoreId } = body;
    if (!scoreId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing scoreId" }),
      };
    }

    // Map camelCase from the client to Airtable field names
    const fields = {};

    if (typeof body.isCorrect === "boolean") {
      fields["Is correct"] = body.isCorrect;
    }

    if (body.questionBonus !== undefined) {
      const n = Number(body.questionBonus);
      fields["Question bonus"] = Number.isFinite(n) ? n : 0;
    }

    // If you ever want to support other fields later, map them here the same way:
    // if (body.showBonus !== undefined) fields["Show bonus"] = Number(body.showBonus) || 0;

    if (Object.keys(fields).length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No updatable fields in payload" }),
      };
    }

    const updated = await base("Scores").update([{ id: scoreId, fields }]);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, updated: updated[0]?.id, fields }),
    };
  } catch (e) {
    console.error("updateScore error:", e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
