// /.netlify/functions/supaLoadScoring.js
import { createClient } from "@supabase/supabase-js";

const url = process.env.REACT_APP_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supaAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

export const handler = async (event) => {
  try {
    const { showId, roundId } = event.queryStringParameters || {};
    if (!showId || !roundId) {
      return { statusCode: 400, body: "Missing showId/roundId" };
    }

    // get shared
    const { data: sharedRow, error: e1 } = await supaAdmin
      .from("scoring_state")
      .select("payload,updated_at")
      .eq("show_id", showId)
      .eq("round_id", "shared")
      .maybeSingle();
    if (e1) throw e1;

    // get this round
    const { data: roundRow, error: e2 } = await supaAdmin
      .from("scoring_state")
      .select("payload,updated_at")
      .eq("show_id", showId)
      .eq("round_id", roundId)
      .maybeSingle();
    if (e2) throw e2;

    return {
      statusCode: 200,
      body: JSON.stringify({
        shared: sharedRow?.payload ?? null,
        round: roundRow?.payload ?? null,
        updatedAt: {
          shared: sharedRow?.updated_at ?? null,
          round: roundRow?.updated_at ?? null,
        },
      }),
      headers: { "Content-Type": "application/json" },
    };
  } catch (err) {
    return { statusCode: 500, body: String(err) };
  }
};
