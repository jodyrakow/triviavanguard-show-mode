// netlify/functions/fetchOlderShows.js
const fetch = require("node-fetch");

const AIRTABLE_BASE_ID = "appnwzfwa2Bl6V2jX";
const AIRTABLE_API_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

exports.handler = async function () {
  try {
    // Get shows older than tomorrow (past shows)
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const tomorrowStr = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");

    // Filter for shows BEFORE tomorrow, sorted newest first
    const filterFormula = `IS_BEFORE({Date}, "${tomorrowStr}")`;

    const showsRes = await fetch(
      `${AIRTABLE_API_URL}/Shows?maxRecords=50&sort[0][field]=Date&sort[0][direction]=desc&filterByFormula=${encodeURIComponent(
        filterFormula
      )}`,
      { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
    );

    const showsData = await showsRes.json();

    const Shows = (showsData.records || []).map((r) => ({
      Show: r.fields,
      id: r.id,
    }));

    return { statusCode: 200, body: JSON.stringify({ Shows }) };
  } catch (err) {
    console.error("Error fetching older shows:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to fetch older shows" }),
    };
  }
};
