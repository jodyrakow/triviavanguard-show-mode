// netlify/functions/addTeamToShow.js
const Airtable = require("airtable");
const base = new Airtable({ apiKey: process.env.AIRTABLE_TOKEN }).base(
  "appnwzfwa2Bl6V2jX"
);

// ==== Configure these to match your base exactly ====
const TEAMS_NAME_FIELD = "Team"; // Teams primary text field
const TEAMS_LINK_TO_SHOWTEAMS = "ShowTeams"; // Teams → ShowTeams link field
const SHOWTEAMS_LINK_TO_TEAM = "Team"; // ShowTeams → Teams link field
const SHOWTEAMS_LINK_TO_SHOW = "Show"; // ShowTeams → Shows link field
const SHOWS_NAME_FIELD = "Show"; // Shows name (primary)
const SHOWS_DATE_FIELD = "Date"; // Shows date
// ====================================================

async function fetchRecords(table, options) {
  const out = [];
  await base(table)
    .select(options || {})
    .eachPage((recs, next) => {
      out.push(...recs);
      next();
    });
  return out;
}

// ---------- helpers ----------
function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
const escapeRegex = (s) =>
  String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function levenshtein(a, b) {
  const m = a.length,
    n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // delete
        dp[i][j - 1] + 1, // insert
        dp[i - 1][j - 1] + cost // replace
      );
    }
  }
  return dp[m][n];
}

function fuzzyScore(query, candidate) {
  const q = normalize(query),
    c = normalize(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1.0;
  if (c.startsWith(q)) return 0.92;
  if (c.includes(q)) return 0.85;
  const dist = levenshtein(q, c);
  const sim = 1 - dist / Math.max(q.length, c.length);
  return Math.max(0, Math.min(0.84, sim));
}

exports.handler = async (event) => {
  console.log("addTeamToShow START", event.body);

  try {
    const body = JSON.parse(event.body || "{}");
    const { showId, teamName, chosenTeamId, createIfMissing } = body;

    const cleanName = (teamName || "").trim();

    console.log("🧭 Flags:", {
      haveShowId: !!showId,
      haveChosenTeamId: !!chosenTeamId,
      createIfMissing: !!createIfMissing,
      teamName: cleanName,
    });

    // Always need a non-empty teamName (for search or create)
    if (!cleanName) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing teamName" }),
      };
    }

    // ---------------- SEARCH (only when NOT creating immediately) ----------------
    if (!chosenTeamId && !createIfMissing) {
      console.log("→ SEARCH requested");
      const q = cleanName;
      const rx = escapeRegex(normalize(q));
      const formula = `REGEX_MATCH(LOWER({${TEAMS_NAME_FIELD}}), ".*${rx}.*")`;

      const teamRecords = await fetchRecords("Teams", {
        filterByFormula: formula,
        fields: [TEAMS_NAME_FIELD, TEAMS_LINK_TO_SHOWTEAMS],
      });

      let candidates = teamRecords.map((r) => ({
        teamId: r.id,
        teamName: r.get(TEAMS_NAME_FIELD) || "",
        showTeamLinks: r.get(TEAMS_LINK_TO_SHOWTEAMS) || [],
        _score: fuzzyScore(q, r.get(TEAMS_NAME_FIELD) || ""),
      }));

      // Fallback scan if no contains-match
      if (candidates.length === 0) {
        const fallback = await fetchRecords("Teams", {
          fields: [TEAMS_NAME_FIELD, TEAMS_LINK_TO_SHOWTEAMS],
        });
        candidates = fallback
          .map((r) => ({
            teamId: r.id,
            teamName: r.get(TEAMS_NAME_FIELD) || "",
            showTeamLinks: r.get(TEAMS_LINK_TO_SHOWTEAMS) || [],
            _score: fuzzyScore(q, r.get(TEAMS_NAME_FIELD) || ""),
          }))
          .filter((x) => x._score > 0.55);
      }

      candidates.sort(
        (a, b) => b._score - a._score || a.teamName.localeCompare(b.teamName)
      );
      candidates = candidates.slice(0, 10);

      // Enrich with previousShowsCount + up to 3 most recent shows
      const matches = [];
      for (const item of candidates) {
        const showTeamIds = item.showTeamLinks.map((l) => l.id || l);
        const previousShowsCount = showTeamIds.length;

        let recentShows = [];
        if (showTeamIds.length) {
          const stFormula = `OR(${showTeamIds.map((id) => `RECORD_ID()='${id}'`).join(",")})`;
          const showTeams = await fetchRecords("ShowTeams", {
            filterByFormula: stFormula,
            fields: [SHOWTEAMS_LINK_TO_SHOW],
          });

          const showIds = [];
          for (const st of showTeams) {
            const showField = st.get(SHOWTEAMS_LINK_TO_SHOW);
            if (Array.isArray(showField) && showField.length) {
              if (typeof showField[0] === "object" && showField[0].id) {
                showIds.push(showField[0].id);
              } else if (typeof showField[0] === "string") {
                showIds.push(showField[0]);
              }
            }
          }

          if (showIds.length) {
            const showsFormula = `OR(${showIds.map((id) => `RECORD_ID()='${id}'`).join(",")})`;
            const showRecords = await fetchRecords("Shows", {
              filterByFormula: showsFormula,
              fields: [SHOWS_NAME_FIELD, SHOWS_DATE_FIELD],
            });

            recentShows = showRecords.map((sr) => {
              const showName = sr.get(SHOWS_NAME_FIELD) || "(Show)";
              const date = sr.get(SHOWS_DATE_FIELD) || null;
              const sortKey = date ? new Date(date).toISOString() : "";
              return { showId: sr.id, showName, date, sortKey };
            });

            recentShows.sort((a, b) =>
              a.sortKey > b.sortKey ? -1 : a.sortKey < b.sortKey ? 1 : 0
            );
            recentShows = recentShows.slice(0, 3);
          }
        }

        matches.push({
          teamId: item.teamId,
          teamName: item.teamName,
          previousShowsCount,
          recentShows,
        });
      }

      console.log("→ SEARCH returning matches", { count: matches.length });
      return { statusCode: 200, body: JSON.stringify({ matches }) };
    }

    // ---------------- CONFIRM / CREATE & LINK ----------------
    if (!showId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing showId for confirm/create" }),
      };
    }

    // Determine final team id (existing or create new)
    let finalTeamId = chosenTeamId;
    if (!finalTeamId && createIfMissing) {
      const created = await base("Teams").create([
        { fields: { [TEAMS_NAME_FIELD]: cleanName } },
      ]);
      finalTeamId = created[0].id;
    }

    // Normalize IDs in case objects were passed
    const safeShowId =
      showId && typeof showId === "object" && showId.id
        ? showId.id
        : String(showId || "");
    const safeTeamId =
      finalTeamId && typeof finalTeamId === "object" && finalTeamId.id
        ? finalTeamId.id
        : String(finalTeamId || "");

    console.log("🔎 Confirm payload (raw):", { showId, finalTeamId });
    console.log("🔎 Confirm payload (safe):", { safeShowId, safeTeamId });

    // Basic ID validation
    const idRx = /^rec[0-9A-Za-z]{14}$/;
    if (!idRx.test(safeShowId)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: `Invalid showId: ${safeShowId}` }),
      };
    }
    if (!idRx.test(safeTeamId)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: `Invalid teamId: ${safeTeamId}` }),
      };
    }

    // Verify both records exist
    try {
      await base("Shows").find(safeShowId);
    } catch {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: `Show not found: ${safeShowId}` }),
      };
    }

    try {
      await base("Teams").find(safeTeamId);
    } catch {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: `Team not found: ${safeTeamId}` }),
      };
    }

    // Create ShowTeams in two steps for clearer errors
    // Step A: create with Show link only
    let createdShowTeam;
    try {
      const created = await base("ShowTeams").create([
        { fields: { [SHOWTEAMS_LINK_TO_SHOW]: [safeShowId] } }, // array of strings OK
      ]);
      createdShowTeam = created[0];
      console.log("✅ Created ShowTeams (with Show only):", createdShowTeam.id);
    } catch (e) {
      console.error("❌ Create with Show failed:", e);
      return {
        statusCode: e.statusCode || 500,
        body: JSON.stringify({
          error: `Create with Show failed: ${e.message}`,
        }),
      };
    }

    // Step B: update with Team link
    try {
      const updated = await base("ShowTeams").update([
        {
          id: createdShowTeam.id,
          fields: { [SHOWTEAMS_LINK_TO_TEAM]: [safeTeamId] },
        },
      ]);
      console.log("✅ Updated ShowTeams with Team:", updated[0].id);

      // Canonical team name back to client
      const teamRec = await base("Teams").find(safeTeamId);
      const canonicalTeamName = teamRec.get(TEAMS_NAME_FIELD) || cleanName;

      return {
        statusCode: 200,
        body: JSON.stringify({
          showTeamId: updated[0].id,
          teamId: safeTeamId,
          teamName: canonicalTeamName,
        }),
      };
    } catch (e) {
      console.error("❌ Update with Team failed:", e);
      return {
        statusCode: e.statusCode || 500,
        body: JSON.stringify({
          error: `Update with Team failed: ${e.message}`,
        }),
      };
    }
  } catch (e) {
    console.error("addTeamToShow error:", e);
    return {
      statusCode: e.statusCode || 500,
      body: JSON.stringify({ error: e.message || "Unknown error" }),
    };
  }
};
