// /.netlify/functions/supaArchiveShow.js
import { createClient } from "@supabase/supabase-js";

const url = process.env.REACT_APP_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supaAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "POST required" }),
    };
  }

  try {
    const { showId, showName, showDate } = JSON.parse(event.body || "{}");

    if (!showId) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Missing showId" }),
      };
    }

    // 1. Get all data from live_scoring for this show
    const { data: liveData, error: e1 } = await supaAdmin
      .from("live_scoring")
      .select("*")
      .eq("show_id", showId);

    if (e1) throw e1;

    if (!liveData || liveData.length === 0) {
      return {
        statusCode: 404,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "No data found for this show" }),
      };
    }

    // 2. Create archive record
    const archiveData = {
      show_id: showId,
      show_name: showName || "Unknown Show",
      show_date: showDate || new Date().toISOString().split('T')[0],
      scoring_data: liveData, // Store all live_scoring rows as JSON
      archived_at: new Date().toISOString(),
      is_finalized: true,
      published_to_airtable: false, // Track if published
    };

    const { error: e2 } = await supaAdmin
      .from("archived_shows")
      .upsert(archiveData, { onConflict: "show_id" });

    if (e2) throw e2;

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        ok: true,
        message: "Show archived successfully",
        archivedAt: archiveData.archived_at
      }),
    };
  } catch (err) {
    console.error("supaArchiveShow failed:", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: String(err) }),
    };
  }
};
