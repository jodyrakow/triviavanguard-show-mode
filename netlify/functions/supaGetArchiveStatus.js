// /.netlify/functions/supaGetArchiveStatus.js
import { createClient } from "@supabase/supabase-js";

const url = process.env.REACT_APP_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supaAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

export const handler = async (event) => {
  try {
    const { showId } = event.queryStringParameters || {};

    if (!showId) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ error: "Missing showId" }),
      };
    }

    const { data, error } = await supaAdmin
      .from("archived_shows")
      .select("is_finalized, archived_at, published_to_airtable, reopened_at")
      .eq("show_id", showId)
      .maybeSingle();

    if (error) throw error;

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        archived: !!data,
        isFinalized: data?.is_finalized || false,
        archivedAt: data?.archived_at || null,
        publishedToAirtable: data?.published_to_airtable || false,
        reopenedAt: data?.reopened_at || null,
      }),
    };
  } catch (err) {
    console.error("supaGetArchiveStatus failed:", err);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: String(err) }),
    };
  }
};
