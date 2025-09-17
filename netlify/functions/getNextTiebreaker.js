// netlify/functions/getNextTiebreaker.js
const AIRTABLE_BASE_ID = "appnwzfwa2Bl6V2jX";
const AIRTABLE_API_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

export async function handler() {
  try {
    const table = process.env.AIRTABLE_TB_TABLE || "Tiebreakers";
    if (!AIRTABLE_TOKEN) {
      return { statusCode: 500, body: "Missing AIRTABLE_TOKEN" };
    }

    const url = new URL(`${AIRTABLE_API_URL}/${encodeURIComponent(table)}`);
    url.searchParams.set("filterByFormula", "NOT({Used})");
    url.searchParams.set("pageSize", "1");
    url.searchParams.set("sort[0][field]", "createdTime");
    url.searchParams.set("sort[0][direction]", "asc");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
    });
    if (!res.ok) {
      const txt = await res.text();
      return { statusCode: res.status, body: txt };
    }
    const json = await res.json();
    const record = (json.records || [])[0] || null;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record || {}),
    };
  } catch (err) {
    return { statusCode: 500, body: String(err?.message || err) };
  }
}
