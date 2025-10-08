// netlify/functions/updateShowQuestionEdits.js
// Updates ShowQuestions table with host edits to question text, flavor text, and answers
const Airtable = require("airtable");

// ==== Env / Config ====
const AIRTABLE_BASE_ID = "appnwzfwa2Bl6V2jX";
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

const TBL_SHOWQUESTIONS = "ShowQuestions";

// Field names in ShowQuestions
const F_EDITED_BY_HOST = "Edited by host";
const F_EDITED_QUESTION = "Edited question";
const F_EDITED_FLAVOR = "Edited flavor text";
const F_EDITED_ANSWER = "Edited answer";

// Airtable base
const base = new Airtable({ apiKey: AIRTABLE_TOKEN }).base(AIRTABLE_BASE_ID);

// ---- helpers ----
const chunk = (arr, size = 10) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/**
 * Update ShowQuestions with edits
 * @param {Array} edits - Array of { showQuestionId, question?, flavorText?, answer? }
 */
async function updateShowQuestionEdits(edits) {
  if (!edits || !edits.length) return;

  const batches = chunk(edits, 10);
  let updatedCount = 0;

  for (const batch of batches) {
    const updates = batch.map((edit) => {
      const fields = {
        [F_EDITED_BY_HOST]: true,
      };

      // Only include fields that were actually edited
      if (edit.question !== undefined && edit.question !== null) {
        fields[F_EDITED_QUESTION] = String(edit.question);
      }
      if (edit.flavorText !== undefined && edit.flavorText !== null) {
        fields[F_EDITED_FLAVOR] = String(edit.flavorText);
      }
      if (edit.answer !== undefined && edit.answer !== null) {
        fields[F_EDITED_ANSWER] = String(edit.answer);
      }

      return {
        id: edit.showQuestionId,
        fields,
      };
    });

    await base(TBL_SHOWQUESTIONS).update(updates);
    updatedCount += updates.length;
  }

  return updatedCount;
}

exports.handler = async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method not allowed" };
    }

    if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
      return { statusCode: 500, body: "Missing Airtable env vars" };
    }

    const data = JSON.parse(event.body || "{}");
    const { edits = [] } = data;

    if (!Array.isArray(edits) || edits.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          message: "No edits to apply",
          updatedCount: 0,
        }),
      };
    }

    // Validate edits structure
    const invalidEdits = edits.filter(
      (e) =>
        !e.showQuestionId ||
        (e.question === undefined &&
          e.flavorText === undefined &&
          e.answer === undefined)
    );

    if (invalidEdits.length) {
      return {
        statusCode: 400,
        body: `Invalid edit entries: ${invalidEdits.length} edits missing showQuestionId or all edit fields`,
      };
    }

    const updatedCount = await updateShowQuestionEdits(edits);

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        updatedCount,
        message: `Updated ${updatedCount} ShowQuestion record(s) with host edits`,
      }),
    };
  } catch (err) {
    console.error("updateShowQuestionEdits error:", err);
    return { statusCode: 500, body: `Server error: ${err.message}` };
  }
};
