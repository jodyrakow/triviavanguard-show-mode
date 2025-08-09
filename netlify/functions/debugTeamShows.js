const Airtable = require("airtable");
const base = new Airtable({ apiKey: process.env.AIRTABLE_TOKEN }).base(
  "appnwzfwa2Bl6V2jX"
);

// Adjust if needed:
const TEAMS_NAME_FIELD = "Team";
const TEAMS_LINK_TO_SHOWTEAMS = "ShowTeams";
const SHOWS_TABLE = "Shows";
const SHOWS_NAME_FIELD = "Show";
const SHOWS_DATE_FIELD = "Date";

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
async function findShowsByIds(ids) {
  if (!ids.length) return [];
  const formula = `OR(${ids.map((id) => `RECORD_ID()='${id}'`).join(",")})`;
  return all(SHOWS_TABLE, { filterByFormula: formula });
}

exports.handler = async (event) => {
  try {
    const q = (event.queryStringParameters?.name || "").trim();
    if (!q) return { statusCode: 400, body: "Pass ?name=TeamName" };

    const teamFormula = `REGEX_MATCH(LOWER({${TEAMS_NAME_FIELD}}), ".*${q.toLowerCase().replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}.*")`;
    const teams = await all("Teams", { filterByFormula: teamFormula });

    if (!teams.length) {
      return {
        statusCode: 200,
        body: JSON.stringify({ note: "No team matched." }, null, 2),
      };
    }

    const t = teams[0];
    const stLinks = t.get(TEAMS_LINK_TO_SHOWTEAMS) || [];
    const stIds = stLinks.map((l) => l.id || l);

    const debug = {
      teamPicked: {
        id: t.id,
        name: t.get(TEAMS_NAME_FIELD),
        fieldsPresent: Object.keys(t.fields),
      },
      rawShowTeamsCell: stLinks,
      parsedShowTeamIds: stIds,
      showTeamsFetched: [],
      autoDetectedShowLinkField: null,
      showsResolved: [],
    };

    if (!stIds.length) {
      return { statusCode: 200, body: JSON.stringify(debug, null, 2) };
    }

    const stFormula = `OR(${stIds.map((id) => `RECORD_ID()='${id}'`).join(",")})`;
    const showTeams = await all("ShowTeams", { filterByFormula: stFormula }); // ← fetch ALL fields

    debug.showTeamsFetched = showTeams.map((r) => ({
      id: r.id,
      fieldsPresent: Object.keys(r.fields),
      // show a small preview of array-ish fields
      arrayFieldsPreview: Object.fromEntries(
        Object.entries(r.fields)
          .filter(([, v]) => Array.isArray(v))
          .map(([k, v]) => [k, v.slice(0, 2)])
      ),
    }));

    // Try to detect which field links to Shows:
    // heuristic: any field whose value is an array of ids that actually exist in Shows
    const candidateFieldCounts = {};
    for (const st of showTeams) {
      for (const [fieldName, value] of Object.entries(st.fields)) {
        if (!Array.isArray(value) || value.length === 0) continue;
        const ids = value
          .map((x) => x.id || x)
          .filter((x) => typeof x === "string" && x.startsWith("rec"));
        if (!ids.length) continue;
        candidateFieldCounts[fieldName] =
          (candidateFieldCounts[fieldName] || 0) + 1;
      }
    }

    // test candidates against Shows
    const candidates = Object.keys(candidateFieldCounts).sort(
      (a, b) => candidateFieldCounts[b] - candidateFieldCounts[a]
    );
    for (const cand of candidates) {
      const ids = [];
      for (const st of showTeams) {
        const val = st.get(cand);
        if (Array.isArray(val)) {
          for (const x of val) {
            const id = x?.id || x;
            if (id && typeof id === "string" && id.startsWith("rec"))
              ids.push(id);
          }
        }
      }
      const shows = await findShowsByIds(Array.from(new Set(ids)).slice(0, 10));
      if (shows.length) {
        debug.autoDetectedShowLinkField = cand;
        debug.showsResolved = shows.map((s) => ({
          id: s.id,
          name: s.get(SHOWS_NAME_FIELD),
          date: s.get(SHOWS_DATE_FIELD),
        }));
        break;
      }
    }

    return { statusCode: 200, body: JSON.stringify(debug, null, 2) };
  } catch (e) {
    return { statusCode: 500, body: e.message || "Unknown error" };
  }
};
