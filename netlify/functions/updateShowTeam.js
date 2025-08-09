const Airtable = require("airtable");
const base = new Airtable({ apiKey: process.env.AIRTABLE_TOKEN }).base(
  "appnwzfwa2Bl6V2jX"
);

exports.handler = async (event) => {
  try {
    const { showTeamId, showBonus } = JSON.parse(event.body || "{}");
    if (!showTeamId) return { statusCode: 400, body: "Missing showTeamId" };
    await base("ShowTeams").update([
      { id: showTeamId, fields: { "Show bonus": Number(showBonus) || 0 } },
    ]);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
