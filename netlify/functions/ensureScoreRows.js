// netlify/functions/ensureScoreRows.js
const Airtable = require("airtable");
const base = new Airtable({ apiKey: process.env.AIRTABLE_TOKEN }).base(
  "appnwzfwa2Bl6V2jX"
);

// helper to fetch all rows for a select()
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

// normalize a value to an Airtable record ID string
const toId = (v) => {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && typeof v.id === "string") return v.id;
  return null;
};

exports.handler = async (event) => {
  try {
    const { showId, roundId, showTeamId } = JSON.parse(event.body || "{}");
    if (!showId || !roundId || !showTeamId) {
      return { statusCode: 400, body: "Missing params" };
    }

    const showIdStr = toId(showId);
    const showTeamIdStr = toId(showTeamId);
    if (!showIdStr) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: `Invalid showId: ${JSON.stringify(showId)}`,
        }),
      };
    }
    if (!showTeamIdStr) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: `Invalid showTeamId: ${JSON.stringify(showTeamId)}`,
        }),
      };
    }

    // 1) ShowQuestions for this show+round (need linked Question to also fill Scores.Question)
    const sq = await all("ShowQuestions", {
      filterByFormula: `AND({Show ID}='${showIdStr}', {Round ID}='${roundId}')`,
      fields: ["Question"], // capture the linked Question ID
    });

    // Map ShowQuestionId -> QuestionId
    const questionIdByShowQuestionId = {};
    const sqIds = sq.map((r) => {
      const showQuestionId = r.id;
      const qLink = r.get("Question");
      const qId =
        Array.isArray(qLink) && qLink[0]
          ? typeof qLink[0] === "string"
            ? qLink[0]
            : qLink[0].id
          : null;
      questionIdByShowQuestionId[showQuestionId] = qId;
      return showQuestionId;
    });

    // 2) Existing Scores for this (Show + ShowTeam) so we don't duplicate
    const existingRows = await all("Scores", {
      filterByFormula: `AND({Show}='${showIdStr}', {ShowTeam}='${showTeamIdStr}')`,
      fields: ["ShowQuestion"],
    });
    const existing = new Set(
      existingRows.map((r) => r.get("ShowQuestion")?.[0]?.id).filter(Boolean)
    );

    // 3) Get the Team id from this ShowTeam (to populate Scores.Team as well)
    const stRec = await base("ShowTeams").find(showTeamIdStr);
    const teamLink = stRec.get("Team");
    const teamId =
      Array.isArray(teamLink) && teamLink[0]
        ? typeof teamLink[0] === "string"
          ? teamLink[0]
          : teamLink[0].id
        : null;

    // 4) Build the missing Score rows
    const toCreate = [];
    for (const sqId of sqIds) {
      if (existing.has(sqId)) continue;
      const qId = questionIdByShowQuestionId[sqId] || null;

      toCreate.push({
        fields: {
          // required links
          Show: [showIdStr],
          ShowTeam: [showTeamIdStr],
          ShowQuestion: [sqId],

          // optional convenience links (rename if your Scores fields differ)
          ...(teamId ? { Team: [teamId] } : {}),
          ...(qId ? { Question: [qId] } : {}),
        },
      });
    }

    // Debug preview of first few rows
    console.log("ensureScoreRows create preview:", toCreate.slice(0, 3));

    // 5) Create in batches of 10 (Airtable API limit)
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const BATCH_SIZE = 10;
    let created = 0;

    while (toCreate.length) {
      const batch = toCreate.splice(0, BATCH_SIZE);
      await base("Scores").create(batch);
      created += batch.length;
      if (toCreate.length) await sleep(150); // tiny pause to avoid rate limits
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ created }),
    };
  } catch (e) {
    console.error("ensureScoreRows error:", e);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message }),
    };
  }
};
