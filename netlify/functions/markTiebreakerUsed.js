// netlify/functions/markTiebreakerUsed.js
const AIRTABLE_BASE_ID = "appnwzfwa2Bl6V2jX";
const AIRTABLE_API_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

export async function handler(event) {
  try {
    if (!AIRTABLE_TOKEN) {
      return { statusCode: 500, body: "Missing AIRTABLE_TOKEN" };
    }
    const { recordId } = JSON.parse(event.body || "{}");
    if (!recordId) {
      return { statusCode: 400, body: "Missing recordId" };
    }
    const table = process.env.AIRTABLE_TB_TABLE || "Tiebreakers";

    const res = await fetch(
      `${AIRTABLE_API_URL}/${encodeURIComponent(table)}/${encodeURIComponent(recordId)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${AIRTABLE_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields: { Used: true } }),
      }
    );

    if (!res.ok) {
      const txt = await res.text();
      return { statusCode: res.status, body: txt };
    }
    const json = await res.json();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(json),
    };
  } catch (err) {
    return { statusCode: 500, body: String(err?.message || err) };
  }
}
