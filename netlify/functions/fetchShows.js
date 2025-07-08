// fetchShows.js

const axios = require("axios");

exports.handler = async function (event, context) {
  const makeWebhookUrl = "https://hook.us2.make.com/ijqo3vhlwtlrsr8sfci1osw8s1j8wtfd";

const res = await axios.get(makeWebhookUrl);
let data = res.data;

let formattedData;

if (Array.isArray(data)) {
  // Format: [ { Shows: [...] }, { Rounds: [...] } ]
  formattedData = {
    Shows: data.find(obj => obj.Shows)?.Shows || [],
    Rounds: data.find(obj => obj.Rounds)?.Rounds || []
  };
} else {
  // Format: { Shows: [...], Rounds: [...] }
  formattedData = data;
}

return {
  statusCode: 200,
  headers: {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  },
  body: JSON.stringify(formattedData),
};
};