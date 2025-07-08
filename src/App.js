import React, { useEffect, useState } from "react";
import axios from "axios";

const App = () => {
  const [data, setData] = useState({ Shows: [], Rounds: [] });
  const [loading, setLoading] = useState(true);
  const [selectedShowId, setSelectedShowId] = useState("");
  const [selectedRoundId, setSelectedRoundId] = useState("");

  const webhookUrl = "/.netlify/functions/fetchShows";

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get(webhookUrl);
        setData(res.data);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const selectedShowRounds = data.Rounds.filter(
    (round) => round["Show ID"] === selectedShowId
  );

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Trivia Show Mode</h1>

      {loading ? (
        <p>Loading data...</p>
      ) : (
        <>
          <h2>Select a Show</h2>
          <select
            value={selectedShowId}
            onChange={(e) => {
              setSelectedShowId(e.target.value);
              setSelectedRoundId(""); // Reset round on show change
            }}
          >
            <option value="">-- Select a Show --</option>
            {data.Shows.map((show) => (
              <option key={show["Show ID"]} value={show["Show ID"]}>
                {show["Name"]}
              </option>
            ))}
          </select>

          {selectedShowRounds.length > 1 && (
            <>
              <h2>Select a Round</h2>
              <select
                value={selectedRoundId}
                onChange={(e) => setSelectedRoundId(e.target.value)}
              >
                <option value="">-- Select a Round --</option>
                {selectedShowRounds.map((round) => (
                  <option key={round["Round ID"]} value={round["Round ID"]}>
                    {round["Name"]}
                  </option>
                ))}
              </select>
            </>
          )}

          {/* Debug (optional): */}
          <div style={{ marginTop: "2rem", color: "#555" }}>
            <strong>Selected Show ID:</strong> {selectedShowId || "None"}
            <br />
            <strong>Selected Round ID:</strong> {selectedRoundId || "None"}
          </div>
        </>
      )}
    </div>
  );
};

export default App;