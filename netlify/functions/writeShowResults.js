// netlify/functions/writeShowResults.js
// CommonJS so Netlify local runner can require() it.
const Airtable = require("airtable");

// ==== Env / Config ====
const AIRTABLE_BASE_ID = "appnwzfwa2Bl6V2jX";
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

const TBL_TEAMS = "Teams";
const TBL_SHOWTEAMS = "ShowTeams";
const TBL_SCORES = "Scores";

// Field names
const F_SHOW = "Show";
const F_TEAM = "Team";
const F_FINAL_SCORE = "Final score";
const F_FINAL_PLACE = "Final place";

// Scores fields
const F_SCORES_SHOW = "Show";
const F_SCORES_TEAM = "Team";
const F_SCORES_SHOWTEAM = "ShowTeam";
const F_SCORES_QUESTION = "Question";
const F_SCORES_SHOWQUESTION = "ShowQuestion";
const F_SCORES_IS_CORRECT = "Is correct";
const F_SCORES_POINTS = "Points earned";

// Teams primary field
const F_TEAMS_NAME = "Team";

// Airtable base
const base = new Airtable({ apiKey: AIRTABLE_TOKEN }).base(AIRTABLE_BASE_ID);

// ---- helpers ----
const chunk = (arr, size = 10) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

async function ensureTeamRecord(team) {
  // team: { teamId|null, teamName }
  if (team.teamId) return team.teamId;
  const created = await base(TBL_TEAMS).create([
    { fields: { [F_TEAMS_NAME]: team.teamName || "(Unnamed team)" } },
  ]);
  return created[0].id;
}

// Find existing ShowTeams by (Show, Team) via FIND/ARRAYJOIN on links
async function findShowTeamRecordId(showId, teamId) {
  const filter = `AND( FIND("${showId}", ARRAYJOIN({${F_SHOW}})), FIND("${teamId}", ARRAYJOIN({${F_TEAM}})) )`;
  const rows = await base(TBL_SHOWTEAMS)
    .select({ filterByFormula: filter, maxRecords: 1 })
    .firstPage();
  return rows && rows.length ? rows[0].id : null;
}

async function upsertShowTeam({ showId, teamId, finalTotal, finalPlace }) {
  let existingId = await findShowTeamRecordId(showId, teamId);

  if (existingId) {
    await base(TBL_SHOWTEAMS).update([
      {
        id: existingId,
        fields: { [F_FINAL_SCORE]: finalTotal, [F_FINAL_PLACE]: finalPlace },
      },
    ]);
    return existingId;
  }

  const created = await base(TBL_SHOWTEAMS).create([
    {
      fields: {
        [F_SHOW]: [showId],
        [F_TEAM]: [teamId],
        [F_FINAL_SCORE]: finalTotal,
        [F_FINAL_PLACE]: finalPlace,
      },
    },
  ]);
  return created[0].id;
}

async function deleteExistingScoresForShow(showId) {
  // wipe any pre-existing Scores for this show (idempotent republish)
  const filter = `FIND("${showId}", ARRAYJOIN({${F_SCORES_SHOW}}))`;
  const page = await base(TBL_SCORES)
    .select({ filterByFormula: filter, pageSize: 100 })
    .firstPage();

  if (!page.length) return;
  const ids = page.map((r) => r.id);
  const batches = chunk(ids, 10);
  for (const b of batches) {
    await base(TBL_SCORES).destroy(b);
  }
}

async function createScores(records) {
  // records: { showId, teamId, showTeamId, questionId, showQuestionId, isCorrect, pointsEarned }[]
  const batches = chunk(records, 10);
  for (const b of batches) {
    await base(TBL_SCORES).create(
      b.map((r) => ({
        fields: {
          [F_SCORES_SHOW]: [r.showId],
          [F_SCORES_TEAM]: [r.teamId],
          [F_SCORES_SHOWTEAM]: [r.showTeamId],
          [F_SCORES_QUESTION]: [r.questionId],
          [F_SCORES_SHOWQUESTION]: [r.showQuestionId],
          [F_SCORES_IS_CORRECT]: !!r.isCorrect,
          [F_SCORES_POINTS]: Number(r.pointsEarned || 0),
        },
      }))
    );
  }
}

exports.handler = async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method not allowed" };
    }

    if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
      return { statusCode: 500, body: "Missing Airtable env vars" };
    }

    const data = JSON.parse(event.body || "{}");
    const { showId, teams = [], scores = [] } = data;

    if (!showId) {
      return { statusCode: 400, body: "Missing showId" };
    }

    // 1) Ensure Teams exist (create new ones as needed)
    const teamIdMap = new Map(); // key: showTeamId (client local), value: Teams recId
    for (const t of teams) {
      const recId = await ensureTeamRecord({
        teamId: t.teamId, // may be null (new team)
        teamName: t.teamName,
      });
      teamIdMap.set(t.showTeamId, recId);
    }

    // Validate that every team got an id
    const missingTeams = [...teams].filter((t) => !teamIdMap.get(t.showTeamId));
    if (missingTeams.length) {
      return {
        statusCode: 400,
        body: `Could not resolve Teams for: ${missingTeams
          .map((t) => t.teamName || t.showTeamId)
          .join(", ")}`,
      };
    }

    // 2) Upsert ShowTeams, update final totals/places
    const showTeamIdMap = new Map(); // key: showTeamId (client local), value: ShowTeams recId
    for (const t of teams) {
      const teamRecId = teamIdMap.get(t.showTeamId);
      const showTeamRecId = await upsertShowTeam({
        showId,
        teamId: teamRecId,
        finalTotal: Number(t.finalTotal || 0),
        finalPlace: Number(t.finalPlace || 0),
      });
      showTeamIdMap.set(t.showTeamId, showTeamRecId);
    }

    // 3) Delete any existing Scores for this show
    await deleteExistingScoresForShow(showId);

    // 4) Build fresh Scores — skip any incomplete rows (and any tiebreakers if they slipped through)
    const badRows = [];
    const scoreRows = [];
    for (const s of scores) {
      // Skip obvious tiebreakers if present
      const isTB =
        s.isTiebreaker === true ||
        (typeof s.showQuestionId === "string" &&
          s.showQuestionId.toLowerCase().startsWith("tb-"));
      if (isTB) continue;

      const teamId = teamIdMap.get(s.showTeamId);
      const showTeamId = showTeamIdMap.get(s.showTeamId);
      const { questionId, showQuestionId } = s;

      if (!teamId || !showTeamId || !questionId || !showQuestionId) {
        badRows.push({
          showTeamId: s.showTeamId,
          teamId,
          showTeamId,
          questionId,
          showQuestionId,
        });
        continue;
      }

      scoreRows.push({
        showId,
        teamId,
        showTeamId,
        questionId,
        showQuestionId,
        isCorrect: !!s.isCorrect,
        pointsEarned: Number(s.pointsEarned || 0),
      });
    }

    if (badRows.length) {
      // Fail fast with a clear message so we never try to write [null]
      return {
        statusCode: 400,
        body:
          "Some score rows were missing required record IDs (cannot link null):\n" +
          badRows
            .slice(0, 10)
            .map(
              (r) => JSON.stringify(r) // first 10 rows for debugging
            )
            .join("\n"),
      };
    }

    if (scoreRows.length) {
      await createScores(scoreRows);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        teamsUpserted: teams.length,
        scoresCreated: scoreRows.length,
      }),
    };
  } catch (err) {
    console.error("writeShowResults error:", err);
    return { statusCode: 500, body: `Server error: ${err.message}` };
  }
};
