// netlify/functions/debugShowBundle.js
const Airtable = require("airtable");
const base = new Airtable({ apiKey: process.env.AIRTABLE_TOKEN }).base(
  "appnwzfwa2Bl6V2jX"
);

async function all(table, opts) {
  const out = [];
  await base(table)
    .select(opts || {})
    .eachPage((recs, next) => {
      out.push(...recs);
      next();
    });
  return out;
}
const firstId = (link) =>
  Array.isArray(link) && link.length
    ? typeof link[0] === "string"
      ? link[0]
      : link[0]?.id || null
    : null;

exports.handler = async (event) => {
  try {
    const { showId } = event.queryStringParameters || {};
    if (!showId) return { statusCode: 400, body: "Missing showId" };

    // Show record (so we know the show exists)
    let show = null;
    try {
      const s = await base("Shows").find(showId);
      show = { id: s.id, fields: s._rawJson.fields };
    } catch (e) {
      show = { id: showId, error: "Shows.find() failed — wrong id?" };
    }

    // Rounds — return raw fields + derived show link ids we detect
    const rounds = (await all("Rounds", { fields: [] /* all fields */ })).map(
      (r) => {
        const f = r._rawJson.fields || {};
        const showLinkCandidates = [
          f["Show"],
          f["Shows"],
          f["Show link"],
          f["Linked Show"],
        ].filter(Boolean);
        return {
          id: r.id,
          fields: f,
          derived: {
            showLinkFirstId:
              firstId(f["Show"]) ||
              firstId(f["Shows"]) ||
              firstId(f["Show link"]) ||
              firstId(f["Linked Show"]) ||
              null,
            roundOrder: f["Round order"] ?? null,
            name: f["Round"] || f["Name"] || null,
          },
        };
      }
    );

    // ShowQuestions — return raw fields + derived show/round link ids and any text ids
    const showQuestions = (await all("ShowQuestions", { fields: [] })).map(
      (sq) => {
        const f = sq._rawJson.fields || {};
        return {
          id: sq.id,
          fields: f,
          derived: {
            showId_link:
              firstId(f["Show"]) ||
              firstId(f["Show link"]) ||
              firstId(f["Shows"]) ||
              null,
            showId_text: f["Show ID"] || null,
            roundId_link: firstId(f["Round"]) || null,
            roundId_text: f["Round ID"] || null,
            questionId_text: f["Question ID"] || null,
            questionOrder: f["Question order"] ?? null,
          },
        };
      }
    );

    // ShowTeams — return raw fields + derived show/team link ids and bonus
    const showTeams = (await all("ShowTeams", { fields: [] })).map((st) => {
      const f = st._rawJson.fields || {};
      return {
        id: st.id,
        fields: f,
        derived: {
          showId_link:
            firstId(f["Show"]) ||
            firstId(f["Shows"]) ||
            firstId(f["Show link"]) ||
            null,
          teamId_link: firstId(f["Team"]) || null,
          showBonus: f["Show bonus"] ?? null,
        },
      };
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ show, rounds, showQuestions, showTeams }, null, 2),
    };
  } catch (e) {
    console.error("debugShowBundle error:", e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
