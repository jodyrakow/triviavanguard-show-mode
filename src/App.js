import React, { useEffect, useState } from "react";
import axios from "axios";

const webhookUrl = "/.netlify/functions/fetchShows"; // Fetches from Netlify function

function App() {
  const [data, setData] = useState({ Shows: [], Rounds: [] });
  const [loading, setLoading] = useState(true);
  const [selectedShowId, setSelectedShowId] = useState("");
  const [selectedRoundId, setSelectedRoundId] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get(webhookUrl);
        console.log("Fetched data:", res.data);
        setData(res.data);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleShowChange = (e) => {
    const showId = e.target.value;
    setSelectedShowId(showId);
    setSelectedRoundId("");
  };

  const handleRoundChange = (e) => {
    setSelectedRoundId(e.target.value);
  };

  const filteredRounds = data.Rounds.filter(
    (round) => round["Show ID"] === selectedShowId
  );

  return (
    <div>
      <h1>Select a Show</h1>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          <select value={selectedShowId} onChange={handleShowChange}>
            <option value="">-- Select a Show --</option>
            {data.Shows.map((show) => (
              <option key={show["Show ID"]} value={show["Show ID"]}>
                {show.Name}
              </option>
            ))}
          </select>

          {filteredRounds.length > 1 && (
            <>
              <h2>Select a Round</h2>
              <select value={selectedRoundId} onChange={handleRoundChange}>
                <option value="">-- Select a Round --</option>
                {filteredRounds.map((round) => (
                  <option key={round["Round ID"]} value={round["Round ID"]}>
                    {round.Name}
                  </option>
                ))}
              </select>
            </>
          )}

          {selectedShowId && filteredRounds.length === 1 && (
            <p>
              Only one round available: <strong>{filteredRounds[0].Name}</strong>
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default App;