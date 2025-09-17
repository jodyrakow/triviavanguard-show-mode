// netlify/functions/markTiebreakerUsed.js
export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const { recordId } = JSON.parse(event.body || "{}");
    if (!recordId) return { statusCode: 400, body: "Missing recordId" };

    const baseId = process.env.AIRTABLE_BASE_ID;
    const table = process.env.AIRTABLE_TB_TABLE || "Tiebreakers";
    const token = process.env.AIRTABLE_TOKEN;

    if (!baseId || !token) {
      return {
        statusCode: 500,
        body: "Missing AIRTABLE_BASE_ID or AIRTABLE_TOKEN",
      };
    }

    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`;
    const body = {
      records: [
        {
          id: recordId,
          fields: { Used: true },
        },
      ],
      typecast: false,
    };

    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const txt = await res.text();
      return { statusCode: res.status, body: txt };
    }

    const json = await res.json();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, updated: json.records?.length || 0 }),
    };
  } catch (err) {
    return { statusCode: 500, body: String(err?.message || err) };
  }
}
