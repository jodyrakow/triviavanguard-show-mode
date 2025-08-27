// netlify/functions/searchTeams.js
import fetch from "node-fetch";

const AIRTABLE_BASE_ID = "appnwzfwa2Bl6V2jX";
const AIRTABLE_API_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

// escape single quotes for Airtable formulas
const esc = (s = "") => String(s).replace(/'/g, "\\'");

function buildUrl(endpoint, params = {}) {
  const url = new URL(`${AIRTABLE_API_URL}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  return url;
}

async function fetchPage(endpoint, params = {}) {
  const url = buildUrl(endpoint, params);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Airtable error ${res.status}: ${text}\nURL: ${url.toString()}`
    );
  }
  return JSON.parse(text);
}

export async function handler(event) {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-allow-headers": "Content-Type, Authorization",
      },
      body: "",
    };
  }

  try {
    if (!AIRTABLE_TOKEN) {
      return {
        statusCode: 500,
        headers: { "access-control-allow-origin": "*" },
        body: "Server not configured: AIRTABLE_TOKEN is missing.",
      };
    }

    // ---- INPUT ----
    const q = (event.queryStringParameters?.q || "").trim();
    if (q.length < 2) {
      return {
        statusCode: 200,
        headers: {
          "content-type": "application/json",
          "access-control-allow-origin": "*",
        },
        body: JSON.stringify({ matches: [] }),
      };
    }

    // 1) "fuzzy-ish" search within ShowTeams on the lookup field {Team name}
    //    (case-insensitive substring match)
    const fuzzyFilter = `SEARCH(LOWER('${esc(q)}'), LOWER(ARRAYJOIN({Team name})))`;
    const initial = await fetchPage("ShowTeams", {
      filterByFormula: fuzzyFilter,
      pageSize: 50,
    });

    const initialRecords = initial.records || [];

    // 2) Group by {Team ID} found in those matches
    const uniqueTeamIds = new Map(); // teamId -> teamName (from any matched row)
    for (const r of initialRecords) {
      const f = r.fields || {};
      const teamIdRaw = f["Team ID"];
      const teamId = Array.isArray(teamIdRaw)
        ? teamIdRaw[0] || ""
        : teamIdRaw || "";
      if (!teamId) continue;

      const tn = f["Team name"];
      const teamName = Array.isArray(tn) ? tn[0] || "" : tn || "";

      uniqueTeamIds.set(teamId, teamName); // keyed by scalar string -> dedup works
    }

    // 3–4–5) For each Team ID:
    //   - fetch rows where {Team ID} equals that ID (still in ShowTeams)
    //   - sort by {Date} descending (server-side)
    //   - take the three most recent
    //   - return bundle: Team ID, Team name, and up to three {ShowTeam} values
    const matches = [];
    for (const [teamId, teamName] of uniqueTeamIds.entries()) {
      const exactFilter = `ARRAYJOIN({Team ID}) = '${esc(teamId)}'`;
      const page = await fetchPage("ShowTeams", {
        filterByFormula: exactFilter,
        "sort[0][field]": "Date",
        "sort[0][direction]": "desc",
        pageSize: 3, // only need the top 3
      });

      const rows = page.records || [];
      const showTeams = rows
        .map((r) => (r.fields?.["ShowTeam"] || "").toString())
        .filter(Boolean);

      matches.push({
        teamId,
        teamName,
        showTeams, // up to 3 most recent ShowTeam strings
      });
    }

    // 6) Respond
    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
      },
      body: JSON.stringify({ matches }),
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
