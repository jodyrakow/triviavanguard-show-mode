// /.netlify/functions/supaUnarchiveShow.js
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
    const { showId } = JSON.parse(event.body || "{}");

    if (!showId) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Missing showId" }),
      };
    }

    // Update archive record to mark as not finalized (re-opened)
    const { error } = await supaAdmin
      .from("archived_shows")
      .update({
        is_finalized: false,
        reopened_at: new Date().toISOString()
      })
      .eq("show_id", showId);

    if (error) throw error;

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        ok: true,
        message: "Show re-opened for editing"
      }),
    };
  } catch (err) {
    console.error("supaUnarchiveShow failed:", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: String(err) }),
    };
  }
};
