// netlify/functions/getNextTiebreaker.js
export async function handler() {
  try {
    const baseId = process.env.AIRTABLE_BASE_ID;
    const table = process.env.AIRTABLE_TB_TABLE || "Tiebreakers";
    const token = process.env.AIRTABLE_TOKEN;

    if (!baseId || !token) {
      return {
        statusCode: 500,
        body: "Missing AIRTABLE_BASE_ID or AIRTABLE_TOKEN",
      };
    }

    const url = new URL(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`
    );
    // First record where {Used} is unchecked, oldest first
    url.searchParams.set("filterByFormula", "NOT({Used})");
    url.searchParams.set("pageSize", "1");
    url.searchParams.set("sort[0][field]", "createdTime"); // special pseudo field
    url.searchParams.set("sort[0][direction]", "asc");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
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
