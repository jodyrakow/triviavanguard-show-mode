// netlify/functions/searchTeams.js
import fetch from "node-fetch";

const AIRTABLE_BASE_ID = "appnwzfwa2Bl6V2jX";
const AIRTABLE_API_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

// ---- Helpers
const esc = (s = "") => String(s).replace(/'/g, "\\'");
const buildUrl = (endpoint, params = {}) => {
  const url = new URL(`${AIRTABLE_API_URL}/${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  return url;
};

async function fetchAll(endpoint, params = {}) {
  let out = [];
  let offset;
  do {
    const url = buildUrl(endpoint, { ...params, offset });
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Airtable ${res.status}: ${text}`);
    const page = JSON.parse(text);
    out = out.concat(page.records || []);
    offset = page.offset;
  } while (offset);
  return out;
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
        body: "AIRTABLE_TOKEN missing",
      };
    }

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

    // ==== SINGLE TABLE ONLY: ShowTeams ====
    // Your fields in ShowTeams:
    // - Primary: "ShowTeam" (formula like "2025-08-22 Game 1 @ Tavern | Trivia Busters")
    // - "Team name" (lookup from Teams)  <-- fuzzy search here
    // - "Team ID" (formula you added)    <-- grouping key
    // - "Date" (lookup from Shows)
    // - "Team" (linked to Teams)         <-- NOT used for search

    // Fuzzy-ish match against LOOKUP: wrap in ARRAYJOIN, LOWER, SEARCH
    const stFilter = `SEARCH(LOWER('${esc(q)}'), LOWER(ARRAYJOIN({Team name})))`;

    // Pull *all* matching ShowTeams; then we group by Team ID here.
    const stRecords = await fetchAll("ShowTeams", {
      filterByFormula: stFilter,
      "sort[0][field]": "Date",
      "sort[0][direction]": "desc",
    });

    // Group by Team ID
    const groups = new Map();
    for (const r of stRecords) {
      const f = r.fields || {};
      const teamId = f["Team ID"] || ""; // REQUIRED for grouping
      const teamName = f["Team name"] || ""; // display name
      const showTeamLabel = f["ShowTeam"] || ""; // primary formula
      const dateVal = Array.isArray(f["Date"]) ? f["Date"][0] : f["Date"] || "";

      if (!teamId) continue; // skip rows without Team ID

      if (!groups.has(teamId)) {
        groups.set(teamId, {
          teamId,
          teamName,
          recent: [],
          _seen: new Set(), // to dedupe showTeamId if needed
        });
      }
      const g = groups.get(teamId);

      if (!g._seen.has(r.id)) {
        g._seen.add(r.id);
        g.recent.push({
          showTeamId: r.id,
          showTeamLabel,
          date: dateVal,
        });
      }
    }

    // Prepare final shape: limit to 3 most recent per team (already sorted by Date desc)
    const matches = Array.from(groups.values()).map((g) => ({
      teamId: g.teamId,
      teamName: g.teamName,
      recent: g.recent.slice(0, 3),
    }));

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
