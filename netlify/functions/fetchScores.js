// netlify/functions/fetchScores.js
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

// helper: sort letters (A..Z) first, then numbers (1..n), then missing
function orderKey(v) {
  if (v == null) return { kind: 2, num: Infinity, str: "" }; // missing -> last
  const n = Number(v);
  if (!isNaN(n)) return { kind: 1, num: n, str: "" }; // numeric -> after letters
  return { kind: 0, num: Infinity, str: String(v).toUpperCase() }; // letters -> first
}

exports.handler = async (event) => {
  try {
    const { showId, roundId } = event.queryStringParameters || {};
    if (!showId || !roundId)
      return { statusCode: 400, body: "Missing showId or roundId" };

    // 1) Questions for this round (record id is showQuestionId)
    const sq = await all("ShowQuestions", {
      filterByFormula: `AND({Show ID}='${showId}', {Round ID}='${roundId}')`,
      fields: ["Question ID", "Question", "Question order"],
    });

    const questions = sq.map((r) => ({
      showQuestionId: r.id,
      questionId: r.get("Question ID") || null,
      order: r.get("Question order"),
      text: r.get("Question")?.[0]?.name || "",
    }));

    questions.sort((a, b) => {
      const A = orderKey(a.order);
      const B = orderKey(b.order);
      if (A.kind !== B.kind) return A.kind - B.kind;
      if (A.kind === 0) return A.str.localeCompare(B.str);
      if (A.kind === 1) return A.num - B.num;
      return 0;
    });

    const showQuestionIdSet = new Set(questions.map((q) => q.showQuestionId));

    // 2) Teams for this show
    // We fetch all ShowTeams, then filter in JS to handle both string and object link shapes.
    const stAll = await all("ShowTeams", {
      fields: ["Show", "Show bonus", "Team"],
    });

    const st = stAll.filter((r) => {
      const linked = r.get("Show");
      if (!Array.isArray(linked) || !linked.length) return false;
      return linked.some((s) =>
        typeof s === "string" ? s === showId : s?.id === showId
      );
    });

    // Collect unique Team record IDs
    const teamIds = [
      ...new Set(
        st
          .map((r) => {
            const link = r.get("Team");
            if (!Array.isArray(link) || !link.length) return null;
            const v = link[0];
            return typeof v === "string" ? v : v?.id || null;
          })
          .filter(Boolean)
      ),
    ];

    // Build a lookup of teamId -> primary name (canonical)
    const teamNameById = {};
    if (teamIds.length) {
      const tf = `OR(${teamIds.map((id) => `RECORD_ID()='${id}'`).join(",")})`;
      // don't restrict fields so the first field (primary) is always available
      const teamRecs = await all("Teams", { filterByFormula: tf });
      for (const tr of teamRecs) {
        const fields = tr._rawJson?.fields || {};
        const name =
          tr.get("Team") ||
          tr.get("Name") ||
          tr.get("Team Name") ||
          Object.values(fields)[0] ||
          "(Unnamed team)";
        teamNameById[tr.id] = name;
      }
    }

    const teams = st.map((r) => {
      const link = r.get("Team");
      let teamId = null;
      let inlineName = null;

      if (Array.isArray(link) && link.length) {
        const v = link[0];
        if (typeof v === "string") {
          teamId = v;
        } else if (v && typeof v === "object") {
          teamId = v.id || null;
          inlineName = v.name || null;
        }
      }

      return {
        showTeamId: r.id,
        teamId,
        teamName: teamNameById[teamId] || inlineName || "(Unnamed team)",
        showBonus: Number(r.get("Show bonus") ?? 0),
      };
    });

    // 3) Scores for this show (filter to current round via ShowQuestion membership)
    const sc = await all("Scores", {
      filterByFormula: `({Show}='${showId}')`,
      fields: [
        "Is correct",
        "Effective points",
        "Question bonus",
        "ShowTeam",
        "ShowQuestion",
      ],
    });

    const scores = sc
      .filter((s) => showQuestionIdSet.has(s.get("ShowQuestion")?.[0]?.id))
      .map((s) => ({
        id: s.id,
        showTeamId: s.get("ShowTeam")?.[0]?.id || null,
        showQuestionId: s.get("ShowQuestion")?.[0]?.id || null,
        isCorrect: !!s.get("Is correct"),
        effectivePoints: Number(s.get("Effective points") ?? 0),
        questionBonus: Number(s.get("Question bonus") ?? 0),
      }));

    return {
      statusCode: 200,
      body: JSON.stringify({ teams, questions, scores }),
    };
  } catch (e) {
    console.error("fetchScores error:", e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
