const axios = require("axios");

exports.handler = async function (event, context) {
  try {
    const { showId, roundId } = JSON.parse(event.body || "{}");

    if (!showId || !roundId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing showId or roundId" }),
      };
    }

    const res = await axios.post(
      "https://hook.us2.make.com/vugq68ac3vjg3xpbxbab12e97gozeia1",
      { showId, roundId }
    );

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(res.data),
    };
  } catch (err) {
    console.error("FULL ERROR in fetchQuestions:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to fetch questions" }),
    };
  }
};