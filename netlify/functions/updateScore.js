// netlify/functions/updateScore.js
const Airtable = require("airtable");
const base = new Airtable({ apiKey: process.env.AIRTABLE_TOKEN }).base(
  "appnwzfwa2Bl6V2jX"
);

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const { scoreId, isCorrect, questionBonus } = body;

    if (!scoreId) {
      return { statusCode: 400, body: "Missing scoreId" };
    }

    const fields = {};
    if (typeof isCorrect === "boolean") fields["Is correct"] = isCorrect; // <-- exact Airtable name
    if (typeof questionBonus === "number")
      fields["Question bonus"] = questionBonus; // optional

    if (!Object.keys(fields).length) {
      return { statusCode: 400, body: "No updatable fields provided" };
    }

    const updated = await base("Scores").update([{ id: scoreId, fields }]);
    return { statusCode: 200, body: JSON.stringify({ id: updated[0].id }) };
  } catch (e) {
    console.error("updateScore error:", e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
