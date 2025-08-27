// netlify/functions/fetchShowBundle.js
import fetch from "node-fetch";

const AIRTABLE_BASE_ID = "appnwzfwa2Bl6V2jX";
const AIRTABLE_API_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

// Build Airtable URL (no fields[] to avoid 422 serialization issues)
function buildUrl(
  endpoint,
  { filterByFormula, sort = [], pageSize = 100, offset } = {}
) {
  const url = new URL(`${AIRTABLE_API_URL}/${endpoint}`);
  if (filterByFormula) url.searchParams.set("filterByFormula", filterByFormula);
  if (pageSize) url.searchParams.set("pageSize", String(pageSize));
  if (offset) url.searchParams.set("offset", offset);
  sort.forEach((s, i) => {
    if (s.field) url.searchParams.set(`sort[${i}][field]`, s.field);
    if (s.direction) url.searchParams.set(`sort[${i}][direction]`, s.direction);
  });
  return url;
}

async function fetchAll(endpoint, opts) {
  let all = [];
  let offset;
  do {
    const url = buildUrl(endpoint, { ...opts, offset });
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(
        `Airtable error ${res.status}: ${text}\nURL: ${url.toString()}`
      );
    }
    const json = JSON.parse(text);
    all = all.concat(json.records || []);
    offset = json.offset;
  } while (offset);
  return all;
}

const toAttachmentArray = (val) =>
  Array.isArray(val)
    ? val
        .filter((a) => a && a.url)
        .map((a) => ({
          url: a.url,
          filename: a.filename || undefined,
          type: a.type || undefined,
          size: a.size || undefined,
          id: a.id || undefined,
        }))
    : [];

export async function handler(event) {
  // Basic CORS support
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "Content-Type, Authorization",
      },
    };
  }

  try {
    const showId = event.queryStringParameters?.showId;
    if (!showId)
      return { statusCode: 400, body: "Missing required query param: showId" };
    if (!AIRTABLE_TOKEN)
      return {
        statusCode: 500,
        body: "Server not configured: AIRTABLE_TOKEN is missing.",
      };

    // Pull questions for this show
    const filterByFormula = `{Show ID} = '${showId}'`;
    const sort = [
      { field: "Round", direction: "asc" },
      { field: "Sort order", direction: "asc" },
    ];

    const records = await fetchAll("ShowQuestions", {
      filterByFormula,
      sort,
      pageSize: 100,
    });

    // Normalize + group by numeric round
    const byRound = new Map();
    const scoreIdsSet = new Set();

    for (const rec of records) {
      const f = rec.fields || {};
      const scoresLR = Array.isArray(f["Scores"]) ? f["Scores"] : [];
      scoresLR.forEach((lr) => lr?.id && scoreIdsSet.add(lr.id));

      const q = {
        id: rec.id,

        // Lookups
        showId: f["Show ID"] || null,
        questionId: f["Question ID"] || null,

        // Ordering
        round: typeof f["Round"] === "number" ? f["Round"] : null,
        categoryOrder:
          typeof f["Category order"] === "number" ? f["Category order"] : null,
        questionOrder: f["Question order"] || "",
        sortOrder: typeof f["Sort order"] === "number" ? f["Sort order"] : null,

        // Flags / selects
        superSecret: !!f["Super secret"],
        questionType: f["Question type"]?.name || f["Question type"] || null,

        // Text
        categoryName: f["Category name"] || "",
        categoryDescription: f["Category description"] || "",
        questionText: f["Question text"] || "",
        flavorText: f["Flavor text"] || "",
        answer: f["Answer"] || "",

        // Attachments
        categoryImages: toAttachmentArray(f["Category image attachments"]),
        categoryAudio: toAttachmentArray(f["Category audio attachments"]),
        questionImages: toAttachmentArray(f["Question image attachments"]),
        questionAudio: toAttachmentArray(f["Question audio attachments"]),

        // Add this property (keep the rest of your object as-is)
        pointsPerQuestion:
          typeof f["Points per question"] === "number"
            ? f["Points per question"]
            : null,

        // Linked score ids
        scores: scoresLR.map((lr) => lr.id).filter(Boolean),
      };

      const r = q.round ?? 0;
      if (!byRound.has(r)) byRound.set(r, []);
      byRound.get(r).push(q);
    }

    const rounds = Array.from(byRound.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([round, questions]) => ({ round, questions }));

    // Pull preloaded ShowTeams
    const filterByFormulaTeams = `{Show ID} = '${showId}'`;
    const teamRows = await fetchAll("ShowTeams", {
      filterByFormula: filterByFormulaTeams,
      pageSize: 100,
    });

    const teams = teamRows.map((r) => {
      const f = r.fields || {};
      const teamLinked = Array.isArray(f["Team"]) ? f["Team"][0] : null;
      return {
        showTeamId: r.id,
        teamId: teamLinked || null,
        // Team name might be a lookup (array) or a text field (string)
        teamName: f["Team name"] ?? "(Unnamed team)",
        showBonus: Number(f["Show bonus"] || 0),
      };
    });

    const bundle = {
      showId,
      totalQuestions: records.length,
      rounds,
      scoreIds: Array.from(scoreIdsSet),
      teams,
      meta: {
        generatedAt: new Date().toISOString(),
        sortedBy: ["Round asc", "Sort order asc"],
        fieldsMode: ["all (no fields[] to avoid 422)"],
      },
    };

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "x-function-version": "v1-consistent",
      },
      body: JSON.stringify(bundle),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: {
        "content-type": "text/plain",
        "access-control-allow-origin": "*",
      },
      body: String(err?.message || err),
    };
  }
}
