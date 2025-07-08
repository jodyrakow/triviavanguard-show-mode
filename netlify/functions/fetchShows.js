// fetchShows.js

const axios = require("axios");

exports.handler = async function (event, context) {
  const makeWebhookUrl = "https://hook.us2.make.com/ijqo3vhlwtlrsr8sfci1osw8s1j8wtfd";

  try {
    const response = await axios.get(makeWebhookUrl);

    return {
      statusCode: 200,
      body: JSON.stringify(response.data),
    };
  } catch (error) {
    console.error("Serverless error:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Failed to fetch from Make", error: error.message }),
    };
  }
};