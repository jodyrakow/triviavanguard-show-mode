// /.netlify/functions/supaSaveScoring.js
import { createClient } from "@supabase/supabase-js";

const url = process.env.REACT_APP_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // service role key, stored in Netlify env vars

// Admin client (server-side only)
const supaAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: JSON.stringify({ error: "POST required" }),
    };
  }

  try {
    const { showId, roundId, payload } = JSON.parse(event.body || "{}");

    if (!showId || !roundId || payload == null) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Missing showId, roundId, or payload" }),
      };
    }

    const { error } = await supaAdmin.from("live_scoring").upsert(
      {
        show_id: showId,
        round_id: roundId,
        payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "show_id,round_id" }
    );

    if (error) throw error;

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    console.error("supaSaveScoring failed:", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: String(err) }),
    };
  }
};
