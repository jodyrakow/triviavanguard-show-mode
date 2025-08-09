const fetch = require("node-fetch");

const AIRTABLE_BASE_ID = "appnwzfwa2Bl6V2jX";
const AIRTABLE_API_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}`;
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

exports.handler = async function (event, context) {
  try {
    // Get tomorrow's date (in local time) and format as YYYY-MM-DD
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const dd = String(tomorrow.getDate()).padStart(2, "0");
    const tomorrowStr = `${yyyy}-${mm}-${dd}`;

    // Airtable filter formula: Date is before OR equal to tomorrow
    const filterFormula = `OR(IS_BEFORE({Date}, "${tomorrowStr}"), IS_SAME({Date}, "${tomorrowStr}"))`;

    const [showsRes, roundsRes] = await Promise.all([
      fetch(
        `${AIRTABLE_API_URL}/Shows?maxRecords=10&sort[0][field]=Date&sort[0][direction]=desc&filterByFormula=${encodeURIComponent(
          filterFormula
        )}`,
        {
          headers: {
            Authorization: `Bearer ${AIRTABLE_TOKEN}`,
          },
        }
      ),
      fetch(`${AIRTABLE_API_URL}/Rounds?maxRecords=100`, {
        headers: {
          Authorization: `Bearer ${AIRTABLE_TOKEN}`,
        },
      }),
    ]);

    const showsData = await showsRes.json();
    const roundsData = await roundsRes.json();

    const shows = showsData.records.map((r) => ({
      Show: r.fields,
      id: r.id,
    }));

    const rounds = roundsData.records.map((r) => ({
      Round: r.fields,
      id: r.id,
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({ Shows: shows, Rounds: rounds }),
    };
  } catch (err) {
    console.error("Error fetching data:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to fetch data" }),
    };
  }
};
