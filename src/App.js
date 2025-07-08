import React, { useEffect, useState } from 'react';
import axios from 'axios';

const webhookUrl = "/.netlify/functions/fetchShows";

function App() {
  const [data, setData] = useState({ Shows: [], Rounds: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await axios.get(webhookUrl);
        console.log("Fetched raw response:", res);
        console.log("Fetched data:", res.data); // 👀 Log parsed JSON
        console.log("res.data.Shows:", res.data?.Shows);
        setData(res.data);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Trivia Show Mode</h1>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          <h2>Shows</h2>
          <ul>
            {data.Shows.map((show, index) => (
              <li key={index}>
                {show.Name} ({show["Show ID"]})
              </li>
            ))}
          </ul>

          <h2>Rounds</h2>
          <ul>
            {data.Rounds.map((round, index) => (
              <li key={index}>
                {round.Round} ({round["Round ID"]})
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default App;
