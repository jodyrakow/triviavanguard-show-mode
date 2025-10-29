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

    // Try fetching from live_scoring first
    const { data: sharedRow, error: e1 } = await supaAdmin
      .from("live_scoring")
      .select("payload,updated_at")
      .eq("show_id", showId)
      .eq("round_id", "shared")
      .maybeSingle();
    if (e1) throw e1;

    const { data: roundRow, error: e2 } = await supaAdmin
      .from("live_scoring")
      .select("payload,updated_at")
      .eq("show_id", showId)
      .eq("round_id", roundId)
      .maybeSingle();
    if (e2) throw e2;

    // If not found in live_scoring, try archived_shows
    if (!sharedRow && !roundRow) {
      const { data: archivedShow, error: e3 } = await supaAdmin
        .from("archived_shows")
        .select("snapshot")
        .eq("show_id", showId)
        .maybeSingle();
      if (e3) throw e3;

      if (archivedShow?.snapshot) {
        // Extract the shared and round data from the archived snapshot
        const snapshot = archivedShow.snapshot;
        const sharedPayload = snapshot._shared || null;
        const roundPayload = snapshot[roundId] || null;

        return {
          statusCode: 200,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            shared: sharedPayload,
            round: roundPayload,
            updatedAt: {
              shared: null,
              round: null,
            },
            isArchived: true,
          }),
        };
      }
    }

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
        isArchived: false,
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
