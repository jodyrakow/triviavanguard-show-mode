// Minimal sanity check: confirms the function can see your env vars.
// No Supabase call yet; we're just proving the key is available *server-side*.

exports.handler = async () => {
  const url =
    process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  const ok = Boolean(url && serviceKey);

  return {
    statusCode: ok ? 200 : 500,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ok,
      haveUrl: !!url,
      haveServiceKey: !!serviceKey,
      serviceKeyLen: serviceKey.length, // length only; never echo the key
    }),
  };
};
