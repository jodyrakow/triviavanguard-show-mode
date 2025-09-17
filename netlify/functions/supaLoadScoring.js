// /.netlify/functions/supaLoadScoring.js
import { createClient } from "@supabase/supabase-js";

const url = process.env.REACT_APP_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Netlify env var
const supaAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

export const handler = async (event) => {
  try {
    const { showId, roundId } = event.queryStringParameters || {};
    if (!showId || !roundId) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Missing showId or roundId" }),
      };
    }

    // fetch shared (teams/entryOrder)
    const { data: sharedRow, error: e1 } = await supaAdmin
      .from("live_scoring")
      .select("payload,updated_at")
      .eq("show_id", showId)
      .eq("round_id", "shared")
      .maybeSingle();
    if (e1) throw e1;

    // fetch this round (grid)
    const { data: roundRow, error: e2 } = await supaAdmin
      .from("live_scoring")
      .select("payload,updated_at")
      .eq("show_id", showId)
      .eq("round_id", roundId)
      .maybeSingle();
    if (e2) throw e2;

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        shared: sharedRow?.payload ?? null,
        round: roundRow?.payload ?? null,
        updatedAt: {
          shared: sharedRow?.updated_at ?? null,
          round: roundRow?.updated_at ?? null,
        },
      }),
    };
  } catch (err) {
    console.error("supaLoadScoring failed:", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: String(err) }),
    };
  }
};
