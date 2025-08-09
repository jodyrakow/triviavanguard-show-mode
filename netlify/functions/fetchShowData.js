console.log("🔥🔥🔥 fetchShowData is loaded");

const Airtable = require("airtable");

const AIRTABLE_BASE_ID = "appnwzfwa2Bl6V2jX";
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

const base = new Airtable({ apiKey: AIRTABLE_TOKEN }).base(AIRTABLE_BASE_ID);

async function getRecords(table, filterByFormula, fields) {
  const records = [];
  await base(table)
    .select({ filterByFormula, fields })
    .eachPage((pageRecords, fetchNextPage) => {
      records.push(...pageRecords);
      fetchNextPage();
    });
  return records;
}

exports.handler = async (event) => {
  try {
    const { showId, roundId } = JSON.parse(event.body);

    const showQuestions = await getRecords(
      "ShowQuestions",
      `AND({Show ID} = '${showId}', {Round ID} = '${roundId}')`,
      [
        "Question order",
        "Category ID",
        "Question",
        "Question ID",
        "Question type",
      ]
    );

    const questionIds = showQuestions
      .map((rec) => rec.get("Question ID"))
      .filter(Boolean);

    const showCategories = await getRecords(
      "ShowCategories",
      `AND({Show ID} = '${showId}', {Round ID} = '${roundId}')`,
      ["Super secret", "Category ID", "Category order"]
    );

    const catIds = showCategories
      .map((rec) => rec.get("Category ID"))
      .filter(Boolean);

    const showImages = await getRecords(
      "ShowImages",
      `AND({Show ID} = '${showId}', {Round ID} = '${roundId}')`,
      ["Image attachment", "Image order", "Category ID", "Question ID"]
    );

    const showAudio = await getRecords(
      "ShowAudio",
      `AND({Show ID} = '${showId}', {Round ID} = '${roundId}')`,
      ["Audio file attachment", "Audio order", "Category ID", "Question ID"]
    );

    const categoryImages = await getRecords(
      "ShowImages",
      `AND({Show ID for category} = '${showId}', {Round ID for category} = '${roundId}')`,
      ["Image attachment", "ShowCategory ID"]
    );

    const allQuestions = await getRecords(
      "Questions",
      `OR(${questionIds.map((id) => `{Question ID} = '${id}'`).join(", ")})`,
      ["Question text", "Answer", "Flavor text", "Question ID"]
    );

    const allCategories = await getRecords(
      "Categories",
      `OR(${catIds.map((id) => `{Category ID} = '${id}'`).join(", ")})`,
      ["Category ID", "Category name", "Category description"]
    );

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

    console.log("✅ Fetched and organized show data.");
    return {
      statusCode: 200,
      body: JSON.stringify(dataByCategory),
    };
  } catch (error) {
    console.error("❌ Error in fetchShowData:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || "Unknown error" }),
    };
  }
};
