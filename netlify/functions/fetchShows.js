// netlify/functions/fetchShows.js
const fetch = require("node-fetch");

const AIRTABLE_BASE_ID = "appnwzfwa2Bl6V2jX";
const AIRTABLE_API_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

exports.handler = async function () {
  try {
    console.log('[fetchShows] Function called');
    // Tomorrow (local) as YYYY-MM-DD
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const tomorrowStr = [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");

    const filterFormula = `OR(IS_BEFORE({Date}, "${tomorrowStr}"), IS_SAME({Date}, "${tomorrowStr}"))`;
    console.log('[fetchShows] Filter formula:', filterFormula);

    const showsRes = await fetch(
      `${AIRTABLE_API_URL}/Shows?maxRecords=10&sort[0][field]=Date&sort[0][direction]=desc&filterByFormula=${encodeURIComponent(
        filterFormula
      )}`,
      { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }
    );

    if (!showsRes.ok) {
      const errorText = await showsRes.text();
      console.error(`[fetchShows] Failed to fetch shows: ${showsRes.status} ${showsRes.statusText}`, errorText);
      throw new Error(`Airtable returned ${showsRes.status}: ${errorText}`);
    }

    const showsData = await showsRes.json();
    console.log('[fetchShows] Successfully fetched', showsData.records?.length || 0, 'shows');

    const Shows = (showsData.records || []).map((r) => ({
      Show: r.fields, // ← keep identical shape
      id: r.id,
    }));

    return { statusCode: 200, body: JSON.stringify({ Shows }) };
  } catch (err) {
    console.error("Error fetching shows:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to fetch shows" }),
    };
  }
};
