// /.netlify/functions/supaSaveScoring.js
import { createClient } from "@supabase/supabase-js";

const url = process.env.REACT_APP_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supaAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "POST required" };
  }
  try {
    const { showId, roundId, payload } = JSON.parse(event.body || "{}");
    if (!showId || !roundId || payload == null) {
      return { statusCode: 400, body: "Missing showId/roundId/payload" };
    }

    const { error } = await supaAdmin.from("scoring_state").upsert(
      {
        show_id: showId,
        round_id: roundId,
        payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "show_id,round_id" }
    );

    if (error) throw error;

    return { statusCode: 200, body: "ok" };
  } catch (err) {
    return { statusCode: 500, body: String(err) };
  }
};
