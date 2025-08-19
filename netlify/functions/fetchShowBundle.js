// netlify/functions/fetchShowBundle.js
const Airtable = require("airtable");
const base = new Airtable({ apiKey: process.env.AIRTABLE_TOKEN }).base(
  "appnwzfwa2Bl6V2jX"
);

// -------- helpers (unchanged patterns) ----------
async function getAll(table, opts) {
  const out = [];
  await base(table)
    .select(opts || {})
    .eachPage((recs, next) => {
      out.push(...recs);
      next();
    });
  return out;
}

const firstId = (link) =>
  Array.isArray(link) && link.length
    ? typeof link[0] === "string"
      ? link[0]
      : link[0]?.id || null
    : null;

// helper: sort letters (A..Z) first, then numbers (1..n), then missing
function orderKey(v) {
  if (v == null) return { kind: 2, num: Infinity, str: "" };
  const n = Number(v);
  if (!isNaN(n)) return { kind: 1, num: n, str: "" };
  return { kind: 0, num: Infinity, str: String(v).toUpperCase() };
}

// ------------------------------------------------

exports.handler = async (event) => {
  try {
    const { showId, roundId } = event.queryStringParameters || {};
    if (!showId) return { statusCode: 400, body: "Missing showId" };

    // 0) Show (minimal header info; not strictly required by your current UI)
    let show = null;
    try {
      const s = await base("Shows").find(showId);
      show = {
        id: s.id,
        Show: s._rawJson.fields, // raw fields if you ever need them
      };
    } catch (e) {
      return { statusCode: 404, body: "Show not found" };
    }

    // 1) Rounds list (same shape as before so existing UI filters work)
    const roundsAll = await getAll("Rounds", {
      fields: ["Round", "Show", "Round order"],
      pageSize: 100,
    });
    const Rounds = roundsAll.map((r) => ({
      Round: r._rawJson.fields, // keep same nested fields shape
      id: r.id,
    }));

    // Always include Rounds in the response
    // The client can filter by r.Round?.Show?.[0] === selectedShowId like before.

    // If no roundId yet, return rounds now (so UI can populate the dropdown)
    if (!roundId) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          show,
          Rounds,
          // placeholders so caller code won’t explode if it expects them
          groupedQuestions: {},
          teams: [],
          questions: [],
          scores: [],
        }),
      };
    }

    // 2) ---------- fetchShowData.js portion (exact same field references) ----------
    // ShowQuestions for the selected show + round (using your Show ID / Round ID fields)
    const showQuestions = await getAll("ShowQuestions", {
      filterByFormula: `AND({Show ID}='${showId}', {Round ID}='${roundId}')`,
      fields: [
        "Question order",
        "Category ID",
        "Question",
        "Question ID",
        "Question type",
      ],
      pageSize: 100,
    });

    const questionIds = showQuestions
      .map((rec) => rec.get("Question ID"))
      .filter(Boolean);

    const showCategories = await getAll("ShowCategories", {
      filterByFormula: `AND({Show ID}='${showId}', {Round ID}='${roundId}')`,
      fields: ["Super secret", "Category ID", "Category order"],
      pageSize: 100,
    });

    const catIds = showCategories
      .map((rec) => rec.get("Category ID"))
      .filter(Boolean);

    const showImages = await getAll("ShowImages", {
      filterByFormula: `AND({Show ID}='${showId}', {Round ID}='${roundId}')`,
      fields: ["Image attachment", "Image order", "Category ID", "Question ID"],
      pageSize: 100,
    });

    const showAudio = await getAll("ShowAudio", {
      filterByFormula: `AND({Show ID}='${showId}', {Round ID}='${roundId}')`,
      fields: [
        "Audio file attachment",
        "Audio order",
        "Category ID",
        "Question ID",
      ],
      pageSize: 100,
    });

    const categoryImages = await getAll("ShowImages", {
      filterByFormula: `AND({Show ID for category}='${showId}', {Round ID for category}='${roundId}')`,
      fields: ["Image attachment", "ShowCategory ID"],
      pageSize: 100,
    });

    // Questions table lookups (by "Question ID", not record id)
    let allQuestions = [];
    if (questionIds.length) {
      const chunks = [];
      for (let i = 0; i < questionIds.length; i += 50)
        chunks.push(questionIds.slice(i, i + 50));
      for (const chunk of chunks) {
        const filterByFormula = `OR(${chunk
          .map((id) => `{Question ID}='${id}'`)
          .join(", ")})`;
        allQuestions.push(
          ...(await getAll("Questions", {
            filterByFormula,
            fields: ["Question text", "Answer", "Flavor text", "Question ID"],
            pageSize: 100,
          }))
        );
      }
    }

    const allCategories = catIds.length
      ? await getAll("Categories", {
          filterByFormula: `OR(${catIds
            .map((id) => `{Category ID}='${id}'`)
            .join(", ")})`,
          fields: ["Category ID", "Category name", "Category description"],
          pageSize: 100,
        })
      : [];

    const questionContentMap = {};
    for (const q of allQuestions) {
      questionContentMap[q.get("Question ID")] = {
        "Question text": q.get("Question text") || "",
        Answer: q.get("Answer") || "",
        "Flavor text": q.get("Flavor text") || "",
      };
    }

    const categoryDetailsMap = {};
    for (const cat of allCategories) {
      const id = cat.get("Category ID");
      categoryDetailsMap[id] = {
        "Category name": cat.get("Category name") || "",
        "Category description": cat.get("Category description") || "",
      };
    }

    const dataByCategory = {};

    for (const cat of showCategories) {
      const catId = cat.get("Category ID");
      dataByCategory[catId] = {
        categoryInfo: {
          "Category ID": catId,
          "Category order": cat.get("Category order"),
          "Super secret": cat.get("Super secret") || false,
          ...(categoryDetailsMap[catId] || {}),
          "Category image": null,
        },
        questions: {},
      };
    }

    // Attach category-level images
    for (const img of categoryImages) {
      const catId = img.get("ShowCategory ID");
      const attachment = img.get("Image attachment")?.[0];
      if (catId && attachment && dataByCategory[catId]) {
        dataByCategory[catId].categoryInfo["Category image"] = {
          id: attachment.id,
          url: attachment.url,
          filename: attachment.filename,
          size: attachment.size,
          type: attachment.type,
        };
      }
    }

    // Seed questions
    for (const sq of showQuestions) {
      const catId = sq.get("Category ID");
      const qId = sq.get("Question ID");

      if (!dataByCategory[catId]) {
        dataByCategory[catId] = { categoryInfo: {}, questions: {} };
      }

      dataByCategory[catId].questions[qId] = {
        "Question ID": qId,
        "Question order": sq.get("Question order"),
        "Question type": sq.get("Question type") || "",
        "Category ID": catId,
        ...questionContentMap[qId],
        Images: [],
        Audio: [],
      };
    }

    // Attach media
    for (const img of showImages) {
      const catId = img.get("Category ID");
      const qId = img.get("Question ID");

      const attachment = img.get("Image attachment")?.[0];
      if (!attachment) continue;

      const imageData = {
        id: attachment.id,
        url: attachment.url,
        filename: attachment.filename,
        size: attachment.size,
        type: attachment.type,
        imageOrder: img.get("Image order") ?? null,
      };

      if (qId && dataByCategory[catId]?.questions[qId]) {
        dataByCategory[catId].questions[qId].Images.push(imageData);
      }
    }

    for (const audio of showAudio) {
      const catId = audio.get("Category ID");
      const qId = audio.get("Question ID");

      const attachment = audio.get("Audio file attachment")?.[0];
      if (!attachment) continue;

      const audioData = {
        id: attachment.id,
        url: attachment.url,
        filename: attachment.filename,
        size: attachment.size,
        type: attachment.type,
        audioOrder: audio.get("Audio order") ?? null,
      };

      if (qId && dataByCategory[catId]?.questions[qId]) {
        dataByCategory[catId].questions[qId].Audio.push(audioData);
      }
    }

    // Sort media attachments
    for (const cat of Object.values(dataByCategory)) {
      for (const q of Object.values(cat.questions)) {
        if (q.Images?.length) {
          q.Images.sort(
            (a, b) => (a.imageOrder ?? Infinity) - (b.imageOrder ?? Infinity)
          );
        }
        if (q.Audio?.length) {
          q.Audio.sort(
            (a, b) => (a.audioOrder ?? Infinity) - (b.audioOrder ?? Infinity)
          );
        }
      }
    }

    // 3) ---------- fetchScores.js portion (same shapes) ----------
    // Questions for this round (for sorting + id set)
    const sqForRound = await getAll("ShowQuestions", {
      filterByFormula: `AND({Show ID}='${showId}', {Round ID}='${roundId}')`,
      fields: ["Question ID", "Question", "Question order"],
      pageSize: 100,
    });

    const questions = sqForRound
      .map((r) => ({
        showQuestionId: r.id,
        questionId: r.get("Question ID") || null,
        order: r.get("Question order"),
        text: r.get("Question")?.[0]?.name || "",
      }))
      .sort((a, b) => {
        const A = orderKey(a.order);
        const B = orderKey(b.order);
        if (A.kind !== B.kind) return A.kind - B.kind;
        if (A.kind === 0) return A.str.localeCompare(B.str);
        if (A.kind === 1) return A.num - B.num;
        return 0;
      });

    const showQuestionIdSet = new Set(questions.map((q) => q.showQuestionId));

    // Teams for this show
    const stAll = await getAll("ShowTeams", {
      fields: ["Show", "Show bonus", "Team"],
    });
    const st = stAll.filter((r) => {
      const linked = r.get("Show");
      if (!Array.isArray(linked) || !linked.length) return false;
      return linked.some((s) =>
        typeof s === "string" ? s === showId : s?.id === showId
      );
    });

    // Team names
    const teamIds = [
      ...new Set(
        st
          .map((r) => {
            const link = r.get("Team");
            if (!Array.isArray(link) || !link.length) return null;
            const v = link[0];
            return typeof v === "string" ? v : v?.id || null;
          })
          .filter(Boolean)
      ),
    ];

    const teamNameById = {};
    if (teamIds.length) {
      const tf = `OR(${teamIds.map((id) => `RECORD_ID()='${id}'`).join(",")})`;
      const teamRecs = await getAll("Teams", { filterByFormula: tf });
      for (const tr of teamRecs) {
        const fields = tr._rawJson?.fields || {};
        const name =
          tr.get("Team") ||
          tr.get("Name") ||
          tr.get("Team Name") ||
          Object.values(fields)[0] ||
          "(Unnamed team)";
        teamNameById[tr.id] = name;
      }
    }

    const teams = st.map((r) => {
      const link = r.get("Team");
      let teamId = null;
      let inlineName = null;

      if (Array.isArray(link) && link.length) {
        const v = link[0];
        if (typeof v === "string") {
          teamId = v;
        } else if (v && typeof v === "object") {
          teamId = v.id || null;
          inlineName = v.name || null;
        }
      }

      return {
        showTeamId: r.id,
        teamId,
        teamName: teamNameById[teamId] || inlineName || "(Unnamed team)",
        showBonus: Number(r.get("Show bonus") ?? 0),
      };
    });

    // Scores (just the links; same as your working fetchScores.js)
    const sc = await getAll("Scores", {
      fields: ["ShowTeam", "ShowQuestion", "Show"],
    });

    const scForShow = sc.filter((s) => firstId(s.get("Show")) === showId);

    const scores = scForShow
      .filter((s) => showQuestionIdSet.has(firstId(s.get("ShowQuestion"))))
      .map((s) => ({
        id: s.id,
        showTeamId: firstId(s.get("ShowTeam")),
        showQuestionId: firstId(s.get("ShowQuestion")),
      }));

    return {
      statusCode: 200,
      body: JSON.stringify({
        show,
        Rounds, // same shape: [{ Round: fields, id }]
        groupedQuestions: dataByCategory, // EXACT shape from your working fetchShowData.js
        teams, // EXACT shape from your working fetchScores.js
        questions, // EXACT shape from your working fetchScores.js
        scores, // EXACT shape from your working fetchScores.js
      }),
    };
  } catch (e) {
    console.error("fetchShowBundle error:", e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
