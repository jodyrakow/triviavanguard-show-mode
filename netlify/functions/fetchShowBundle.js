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
    console.log(`[fetchShowBundle] Called with showId: ${showId}`);
    if (!showId)
      return { statusCode: 400, body: "Missing required query param: showId" };
    if (!AIRTABLE_TOKEN)
      return {
        statusCode: 500,
        body: "Server not configured: AIRTABLE_TOKEN is missing.",
      };

    // Fetch the Show record itself for configuration fields
    let showConfig = {};
    console.log(`[fetchShowBundle] Fetching Show record from Shows/${showId}`);
    try {
      // Don't use buildUrl for single record fetch - it adds query params that cause 422 errors
      const showUrl = `${AIRTABLE_API_URL}/Shows/${showId}`;
      const showRes = await fetch(showUrl, {
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
      });
      if (showRes.ok) {
        const showData = await showRes.json();
        const f = showData.fields || {};
        showConfig = {
          announcements: f["Announcements"] || "",
          prizeDonor: f["Prize donor"] || "",
          scoringMode: f["Scoring mode"] || null,
          pubPoints: typeof f["Pub points"] === "number" ? f["Pub points"] : null,
          poolPerQuestion: typeof f["Pool per question"] === "number" ? f["Pool per question"] : null,
          poolContribution: typeof f["Pool contribution"] === "number" ? f["Pool contribution"] : null,
        };
        console.log(`[fetchShowBundle] Successfully fetched Show config:`, showConfig);
      } else {
        // Log when Show record fetch fails
        const errorText = await showRes.text();
        console.error(`[fetchShowBundle] Failed to fetch Show record: ${showRes.status} ${showRes.statusText}`, errorText);
      }
    } catch (err) {
      // Non-fatal: if we can't fetch Show config, continue without it
      console.error("Could not fetch Show config:", err);
    }

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

    for (const rec of records) {
      const f = rec.fields || {};

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
      };

      const r = q.round ?? 0;
      if (!byRound.has(r)) byRound.set(r, []);
      byRound.get(r).push(q);
    }

    const rounds = Array.from(byRound.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([round, questions]) => ({ round, questions }));

    // ---- Attach the show's tiebreaker (if any) to the final round ----
    let tbRecord = null;
    try {
      const tbRows = await fetchAll("Tiebreakers", {
        filterByFormula: `{Show ID} = '${showId}'`,
        pageSize: 1,
      });
      tbRecord = tbRows?.[0] || null;
    } catch (_) {
      // Non-fatal: if Airtable Tiebreakers table isn't ready, we still return the bundle.
    }

    if (tbRecord?.fields && Array.isArray(rounds) && rounds.length > 0) {
      const finalRound = rounds[rounds.length - 1];

      finalRound.questions.push({
        id: `tb-${tbRecord.id}`,
        showId,
        questionId: null,

        round: finalRound.round,
        categoryOrder: 9999,
        questionOrder: "TB",
        sortOrder: 999999,

        questionType: "Tiebreaker",
        categoryName: "Tiebreaker",
        categoryDescription: "",
        questionText: tbRecord.fields["Tiebreaker question"] || "",
        flavorText: "",
        answer: tbRecord.fields["Tiebreaker answer"] || "",

        tiebreakerNumber:
          typeof tbRecord.fields["Tiebreaker number"] === "number"
            ? tbRecord.fields["Tiebreaker number"]
            : null,

        categoryImages: [],
        categoryAudio: [],
        questionImages: [],
        questionAudio: [],
      });
    }

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
        teamName: f["Team name"] ?? "(Unnamed team)",
        showBonus: Number(f["Show bonus"] || 0),
        isLeague: !!f["League"], // Include the League checkbox value
      };
    });

    const bundle = {
      showId,
      totalQuestions: records.length,
      rounds,
      teams,
      config: showConfig,
      meta: {
        generatedAt: new Date().toISOString(),
        sortedBy: ["Round asc", "Sort order asc"],
        fieldsMode: ["all (no fields[] to avoid 422)"],
      },
    };

    console.log(`[fetchShowBundle] Returning bundle with config:`, JSON.stringify(bundle.config));

    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "x-function-version": "v1-clean",
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
