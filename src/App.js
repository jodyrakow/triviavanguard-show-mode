// App.js
import React, { useEffect, useState, useRef, useMemo } from "react";
import axios from "axios";
import "./App.css";
import "react-h5-audio-player/lib/styles.css";
import ShowMode from "./ShowMode";
import ScoringMode from "./ScoringMode";
import ResultsMode from "./ResultsMode";
import AnswersMode from "./AnswersMode";
import { ButtonTab, colors, tokens } from "./styles/index.js";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// 🔐 PASSWORD PROTECTION
const allowedPassword = "tv2025";
const passwordKey = "showPasswordAuthorized";
const isAuthorized = sessionStorage.getItem(passwordKey);
if (!isAuthorized) {
  const enteredPassword = prompt("Enter show password:");
  if (enteredPassword?.toLowerCase() === allowedPassword.toLowerCase()) {
    sessionStorage.setItem(passwordKey, "true");
  } else {
    document.body.innerHTML =
      "<h2 style='font-family:sans-serif;'>Access denied.</h2>";
    throw new Error("Unauthorized access");
  }
}

export default function App() {
  // Core app state
  const [shows, setShows] = useState([]);
  const [selectedShowId, setSelectedShowId] = useState("");
  const [selectedRoundId, setSelectedRoundId] = useState(""); // string (e.g. "1")
  const [showDetails, setshowDetails] = useState(true);
  const [visibleImages, setVisibleImages] = useState({});
  const questionRefs = useRef({});
  const [visibleCategoryImages, setVisibleCategoryImages] = useState({});
  const [activeMode, setActiveMode] = useState("show");
  const [currentImageIndex, setCurrentImageIndex] = useState({});
  const timerRef = useRef(null);
  const [rtStatus, setRtStatus] = useState("INIT"); // ✅ moved inside

  // Bundle (rounds+questions+teams)
  const [showBundle, setShowBundle] = useState(null);
  const [bundleLoading, setBundleLoading] = React.useState(false);
  const [bundleError, setBundleError] = React.useState(null);

  // Scoring cache across mode switches
  const [scoringCache, setScoringCache] = useState({});
  // Restore scoring backup (if any) on app load
  useEffect(() => {
    try {
      const raw = localStorage.getItem("trivia.scoring.backup");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setScoringCache(parsed);
        }
      }
    } catch (err) {
      console.warn("Failed to load scoring backup:", err);
    }
  }, []);

  // Timer state
  const [timerPosition, setTimerPosition] = useState({ x: 0, y: 0 });
  const [timerDuration, setTimerDuration] = useState(60);
  const [timeLeft, setTimeLeft] = useState(60);
  const [timerRunning, setTimerRunning] = useState(false);

  // App.js (top of component state)
  const [showTimer, setShowTimer] = useState(
    () => localStorage.getItem("tv_showTimer") !== "false"
  );

  useEffect(() => {
    localStorage.setItem("tv_showTimer", String(showTimer));
  }, [showTimer]);

  // Global scoring settings
  const [scoringMode, setScoringMode] = useState(
    () => localStorage.getItem("tv_scoringMode") || "pub"
  );
  const [pubPoints, setPubPoints] = useState(
    () => Number(localStorage.getItem("tv_pubPoints")) || 10
  );
  const [poolPerQuestion, setPoolPerQuestion] = useState(
    () => Number(localStorage.getItem("tv_poolPerQuestion")) || 500
  );

  // Persist scoring settings
  useEffect(() => {
    localStorage.setItem("tv_scoringMode", scoringMode);
  }, [scoringMode]);

  useEffect(() => {
    localStorage.setItem("tv_pubPoints", String(pubPoints));
  }, [pubPoints]);

  useEffect(() => {
    localStorage.setItem("tv_poolPerQuestion", String(poolPerQuestion));
  }, [poolPerQuestion]);

  useEffect(() => {
    const savedPosition = localStorage.getItem("timerPosition");
    if (savedPosition) {
      try {
        setTimerPosition(JSON.parse(savedPosition));
      } catch {}
    }

    if (!timerRunning) return;

    if (timeLeft <= 0) {
      setTimeLeft(timerDuration); // reset the clock
      setTimerRunning(false); // stop after reset
      return;
    }

    const t = setTimeout(
      () => setTimeLeft((prev) => Math.max(prev - 1, 0)),
      1000
    );
    return () => clearTimeout(t);
  }, [timerRunning, timeLeft, timerDuration]);

  const handleStartPause = () => setTimerRunning((p) => !p);
  const handleReset = () => {
    setTimerRunning(false);
    setTimeLeft(timerDuration);
  };
  const handleDurationChange = (e) => {
    const newDuration = parseInt(e.target.value);
    setTimerDuration(newDuration);
    setTimeLeft(newDuration);
  };

  useEffect(() => {
    if (!supabase) return;

    const ch = supabase.channel("tv-sanity", {
      config: { broadcast: { ack: true } },
    });

    // queue + ready flag + unified sender
    window._tvReady = false;
    window._tvQueue = [];
    window.tvSend = (event, payload) => {
      if (!window._tvReady) {
        window._tvQueue.push({ event, payload });
        return;
      }
      return ch.send({ type: "broadcast", event, payload });
    };

    // event handlers -> DOM CustomEvents
    ch.on("broadcast", { event: "ping" }, (payload) => {
      console.log("[realtime] ping received:", payload);
    });
    ch.on("broadcast", { event: "mark" }, (msg) => {
      const data = msg?.payload ?? msg;
      window.dispatchEvent(new CustomEvent("tv:mark", { detail: data }));
    });
    ch.on("broadcast", { event: "cellEdit" }, (msg) => {
      const data = msg?.payload ?? msg;
      window.dispatchEvent(new CustomEvent("tv:cellEdit", { detail: data }));
    });
    ch.on("broadcast", { event: "teamBonus" }, (msg) => {
      const data = msg?.payload ?? msg;
      window.dispatchEvent(new CustomEvent("tv:teamBonus", { detail: data }));
    });
    ch.on("broadcast", { event: "teamAdd" }, (msg) => {
      const data = msg?.payload ?? msg;
      window.dispatchEvent(new CustomEvent("tv:teamAdd", { detail: data }));
    });

    ch.on("broadcast", { event: "teamRename" }, (msg) => {
      const data = msg?.payload ?? msg;
      window.dispatchEvent(new CustomEvent("tv:teamRename", { detail: data }));
    });
    ch.on("broadcast", { event: "teamRemove" }, (msg) => {
      const data = msg?.payload ?? msg;
      window.dispatchEvent(new CustomEvent("tv:teamRemove", { detail: data }));
    });

    ch.on("broadcast", { event: "prizesUpdate" }, (msg) => {
      const data = msg?.payload ?? msg;
      const showId = data?.showId;
      const val = typeof data?.prizes === "string" ? data.prizes : "";
      if (!showId) return;

      setScoringCache((prev) => {
        const show = prev[showId] || {};
        const shared = show._shared || {
          teams: [],
          entryOrder: [],
          prizes: "",
        };
        const nextShared = { ...shared, prizes: val };
        return {
          ...prev,
          [showId]: { ...show, _shared: nextShared },
        };
      });
    });

    // expose helpers (safe via tvSend queue)
    window.sendMark = (payload) => window.tvSend("mark", payload);
    window.sendCellEdit = (payload) => window.tvSend("cellEdit", payload);
    window.sendTeamBonus = (payload) => window.tvSend("teamBonus", payload);
    window.sendTeamAdd = (payload) => window.tvSend("teamAdd", payload);
    window.sendTeamRename = (payload) => window.tvSend("teamRename", payload);
    window.sendTeamRemove = (payload) => window.tvSend("teamRemove", payload);

    setRtStatus("SUBSCRIBING");
    ch.subscribe((status) => {
      setRtStatus(status); // "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR"
      if (status === "SUBSCRIBED") {
        console.log("[realtime] joined tv-sanity");
        window._tvReady = true;
        if (window._tvQueue?.length) {
          const q = window._tvQueue.splice(0);
          q.forEach(({ event, payload }) =>
            ch.send({ type: "broadcast", event, payload })
          );
        }
      }
    });

    // single cleanup
    return () => {
      try {
        delete window.sendMark;
        delete window.sendCellEdit;
        delete window.sendTeamBonus;
        delete window.sendTeamAdd;
        delete window.sendTeamRename;
        delete window.sendTeamRemove;
        delete window.tvSend;
      } catch {}
      window._tvReady = false;
      window._tvQueue = [];
      try {
        supabase.removeChannel(ch);
      } catch {}
      setRtStatus("CLOSED");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once; supabase is module-constant

  // Utils
  function numberToLetter(n) {
    return String.fromCharCode(64 + n);
  }

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        try {
          window.tvSend?.("ping", { at: Date.now() });
        } catch {}
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    if (!selectedShowId || !selectedRoundId) return;

    (async () => {
      try {
        const res = await fetch(
          `/.netlify/functions/supaLoadScoring?showId=${encodeURIComponent(selectedShowId)}&roundId=${encodeURIComponent(selectedRoundId)}`
        );
        const json = await res.json();

        setScoringCache((prev) => {
          const prevShow = prev[selectedShowId] || {};
          return {
            ...prev,
            [selectedShowId]: {
              ...prevShow,
              _shared: json.shared ??
                prevShow._shared ?? { teams: [], entryOrder: [], prizes: "" },
              [selectedRoundId]: json.round ??
                prevShow[selectedRoundId] ?? { grid: {} },
            },
          };
        });
      } catch (e) {
        console.warn("supaLoadScoring failed", e);
        // falls back to whatever is in local scoringCache/localStorage
      }
    })();
  }, [selectedShowId, selectedRoundId]);

  const getClosestQuestionKey = () => {
    const viewportCenter = window.innerHeight / 2;
    let closestKey = null;
    let closestDistance = Infinity;
    for (const [key, ref] of Object.entries(questionRefs.current)) {
      if (ref?.current) {
        const rect = ref.current.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height / 2 - viewportCenter);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestKey = key;
        }
      }
    }
    return closestKey;
  };

  const saveTimers = useRef({}); // {shared, round}

  const saveDebounced = (key, fn, delay = 350) => {
    clearTimeout(saveTimers.current[key]);
    saveTimers.current[key] = setTimeout(fn, delay);
  };

  // Fetch shows
  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get("/.netlify/functions/fetchShows");
        setShows(res.data?.Shows || []);
      } catch (err) {
        console.error("Error fetching shows:", err);
      }
    })();
  }, []);

  // Fetch bundle for selected show
  useEffect(() => {
    if (!selectedShowId) {
      setShowBundle(null);
      setSelectedRoundId("");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setBundleLoading(true);
        setBundleError("");
        const res = await axios.get("/.netlify/functions/fetchShowBundle", {
          params: { showId: selectedShowId },
        });
        if (cancelled) return;

        const bundle = res.data || null;
        setShowBundle(bundle);

        // set default round if needed
        const roundNums = (bundle?.rounds || [])
          .map((r) => Number(r.round))
          .filter((n) => Number.isFinite(n));
        const uniqueSorted = Array.from(new Set(roundNums)).sort(
          (a, b) => a - b
        );

        if (!uniqueSorted.length) {
          setSelectedRoundId("");
        } else if (!uniqueSorted.includes(Number(selectedRoundId))) {
          setSelectedRoundId(String(uniqueSorted[0]));
        }
      } catch (e) {
        if (!cancelled) {
          setBundleError("Failed to load show data.");
          console.error(e);
        }
      } finally {
        if (!cancelled) setBundleLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // only depend on selectedShowId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedShowId]);

  // Round numbers for dropdown (from bundle)
  const roundNumbers = useMemo(() => {
    const arr = (showBundle?.rounds || [])
      .map((r) => Number(r.round))
      .filter((n) => Number.isFinite(n));
    return Array.from(new Set(arr)).sort((a, b) => a - b);
  }, [showBundle]);

  const patchShared = (patch) => {
    setScoringCache((prev) => {
      const show = prev[selectedShowId] || {};
      const shared = show._shared || { teams: [], entryOrder: [], prizes: "" };

      // merge the change (patch) into shared
      const nextShared = { ...shared, ...patch };

      const next = {
        ...prev,
        [selectedShowId]: {
          ...show,
          _shared: nextShared,
          [selectedRoundId]: show[selectedRoundId] || { grid: {} },
        },
      };

      // Persist to Supabase using values from nextShared
      saveDebounced("shared", () => {
        fetch("/.netlify/functions/supaSaveScoring", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            showId: selectedShowId,
            roundId: "shared",
            payload: {
              teams: nextShared.teams ?? [],
              entryOrder: nextShared.entryOrder ?? [],
              prizes: nextShared.prizes ?? "",
            },
          }),
        }).catch(() => {});
      });

      // Realtime broadcast so other hosts update instantly
      try {
        window.tvSend?.("prizesUpdate", {
          showId: selectedShowId,
          prizes: nextShared.prizes ?? "",
          ts: Date.now(),
        });
      } catch {}

      // optional local backup
      try {
        localStorage.setItem("trivia.scoring.backup", JSON.stringify(next));
      } catch {}

      return next;
    });
  };

  // 🔸 Compose a single cachedState shape shared by all modes
  const composedCachedState = (() => {
    const showCache = scoringCache[selectedShowId] ?? {};
    const shared = showCache._shared ?? null; // { teams, entryOrder }
    const roundCache = showCache[selectedRoundId] ?? null; // { grid }
    if (!shared && !roundCache) return null;
    return {
      teams: shared?.teams ?? [],
      entryOrder: shared?.entryOrder ?? [],
      grid: roundCache?.grid ?? {},
      prizes: shared?.prizes ?? "",
    };
  })();

  // UI
  return (
    <div
      style={{
        fontFamily: tokens.font.display,
        padding: "2rem",
        backgroundColor: colors.bg,
      }}
    >
      <h1
        style={{
          fontSize: "3rem",
          color: colors.dark,
          marginTop: "2rem",
          marginBottom: "0",
        }}
      >
        TriviaVanguard
      </h1>
      <h2
        style={{
          fontSize: "1.75rem",
          color: colors.dark,
          textIndent: "0.75rem",
          marginTop: "-.25rem",
        }}
      >
        {activeMode === "score"
          ? "Scoring mode"
          : activeMode === "results"
            ? "Results mode"
            : "Show mode"}
      </h2>

      <div
        style={{
          display: "flex",
          justifyContent: "left",
          gap: "0.5rem",
          marginTop: "1rem",
          marginBottom: "1rem",
        }}
      >
        <ButtonTab
          active={activeMode === "show"}
          onClick={() => setActiveMode("show")}
        >
          Show mode
        </ButtonTab>

        <ButtonTab
          active={activeMode === "score"}
          onClick={() => setActiveMode("score")}
        >
          Scoring mode
        </ButtonTab>

        <ButtonTab
          active={activeMode === "answers"}
          onClick={() => setActiveMode("answers")}
        >
          Answers mode
        </ButtonTab>

        <ButtonTab
          active={activeMode === "results"}
          onClick={() => setActiveMode("results")}
        >
          Results mode
        </ButtonTab>
      </div>
      <div style={{ fontSize: ".9rem", opacity: 0.85 }}>
        Realtime: <strong>{rtStatus}</strong>
      </div>

      <div>
        <label
          style={{
            fontSize: "1.25rem",
            color: colors.dark,
            marginRight: "1rem",
          }}
        >
          Select Show:
          <select
            value={selectedShowId}
            onChange={(e) => {
              const newId = e.target.value;

              if (!selectedShowId || selectedShowId === newId) {
                setSelectedShowId(newId);
                setSelectedRoundId("");
                return;
              }

              const ok = window.confirm(
                "Switch shows? This will delete all scores and data you've entered for the current show."
              );
              if (!ok) return;

              // Clear in-memory, per-show UI bits
              setSelectedRoundId("");
              setVisibleImages({});
              setVisibleCategoryImages({});
              setCurrentImageIndex({});

              setSelectedShowId(newId);
            }}
            style={{
              fontSize: "1.25rem",
              fontFamily: tokens.font.body,
              marginLeft: "0.5rem",
              verticalAlign: "middle",
            }}
          >
            <option value="">-- Select a Show --</option>
            {shows.map((s) => (
              <option
                key={s.id}
                value={s.id}
                style={{ fontFamily: tokens.font.body }}
              >
                {s.Show?.Show}
              </option>
            ))}
          </select>
        </label>
      </div>

      {roundNumbers.length > 1 && (
        <div>
          <label
            style={{
              fontSize: "1.25rem",
              color: colors.dark,
              marginRight: "1rem",
            }}
          >
            Select Round:
            <select
              value={selectedRoundId}
              onChange={(e) => setSelectedRoundId(e.target.value)}
              style={{
                fontSize: "1.25rem",
                fontFamily: tokens.font.body,
                marginLeft: "0.5rem",
                verticalAlign: "middle",
              }}
            >
              {roundNumbers.map((n) => (
                <option key={n} value={String(n)}>
                  {`Round ${n}`}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {bundleLoading && <div style={{ padding: "1rem" }}>Loading show…</div>}
      {bundleError && (
        <div style={{ padding: "1rem", color: "red" }}>
          Error loading show: {String(bundleError)}
        </div>
      )}

      {activeMode === "show" && (
        <ShowMode
          rounds={(showBundle?.rounds || []).filter(
            (r) => Number(r.round) === Number(selectedRoundId)
          )}
          showDetails={showDetails}
          setshowDetails={setshowDetails}
          questionRefs={questionRefs}
          visibleImages={visibleImages}
          setVisibleImages={setVisibleImages}
          currentImageIndex={currentImageIndex}
          setCurrentImageIndex={setCurrentImageIndex}
          visibleCategoryImages={visibleCategoryImages}
          setVisibleCategoryImages={setVisibleCategoryImages}
          timeLeft={timeLeft}
          timerRunning={timerRunning}
          handleStartPause={handleStartPause}
          handleReset={handleReset}
          timerDuration={timerDuration}
          handleDurationChange={handleDurationChange}
          timerRef={timerRef}
          timerPosition={timerPosition}
          setTimerPosition={setTimerPosition}
          getClosestQuestionKey={getClosestQuestionKey}
          numberToLetter={numberToLetter}
          showTimer={showTimer}
          setShowTimer={setShowTimer}
        />
      )}

      {activeMode === "score" && (
        <ScoringMode
          showBundle={
            showBundle
              ? {
                  ...showBundle,
                  rounds: (showBundle.rounds || []).filter(
                    (r) => Number(r.round) === Number(selectedRoundId)
                  ),
                }
              : { rounds: [], teams: [] }
          }
          selectedShowId={selectedShowId}
          selectedRoundId={selectedRoundId}
          preloadedTeams={showBundle?.teams ?? []}
          cachedState={composedCachedState}
          onChangeState={(payload) => {
            setScoringCache((prev) => {
              const { teams = [], entryOrder = [], grid = {} } = payload;
              const next = {
                ...prev,
                [selectedShowId]: {
                  ...(prev[selectedShowId] || {}),
                  _shared: { teams, entryOrder },
                  [selectedRoundId]: { grid },
                },
              };

              // Persist to Supabase (NOT Airtable)
              // shared
              saveDebounced("shared", () => {
                fetch("/.netlify/functions/supaSaveScoring", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    showId: selectedShowId,
                    roundId: "shared",
                    payload: { teams, entryOrder },
                  }),
                }).catch(() => {});
              });

              // per-round grid
              saveDebounced("round", () => {
                fetch("/.netlify/functions/supaSaveScoring", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    showId: selectedShowId,
                    roundId: selectedRoundId,
                    payload: { grid },
                  }),
                }).catch(() => {});
              });

              // keep your localStorage backup if you want
              try {
                localStorage.setItem(
                  "trivia.scoring.backup",
                  JSON.stringify(next)
                );
              } catch {}

              return next;
            });
          }}
          scoringMode={scoringMode}
          setScoringMode={setScoringMode}
          pubPoints={pubPoints}
          setPubPoints={setPubPoints}
          poolPerQuestion={poolPerQuestion}
          setPoolPerQuestion={setPoolPerQuestion}
        />
      )}

      {activeMode === "answers" && (
        <AnswersMode
          showBundle={
            showBundle
              ? {
                  ...showBundle,
                  rounds: (showBundle.rounds || []).filter(
                    (r) => Number(r.round) === Number(selectedRoundId)
                  ),
                }
              : { rounds: [], teams: [] }
          }
          selectedShowId={selectedShowId}
          selectedRoundId={selectedRoundId}
          cachedState={composedCachedState}
          scoringMode={scoringMode}
          pubPoints={pubPoints}
          poolPerQuestion={poolPerQuestion}
        />
      )}

      {activeMode === "results" && (
        <ResultsMode
          showBundle={showBundle || { rounds: [], teams: [] }}
          selectedShowId={selectedShowId}
          selectedRoundId={selectedRoundId}
          cachedState={composedCachedState}
          cachedByRound={scoringCache[selectedShowId] ?? {}}
          scoringMode={scoringMode}
          setScoringMode={setScoringMode}
          pubPoints={pubPoints}
          setPubPoints={setPubPoints}
          poolPerQuestion={poolPerQuestion}
          setPoolPerQuestion={setPoolPerQuestion}
          prizes={composedCachedState?.prizes ?? ""}
          setPrizes={(val) => patchShared({ prizes: String(val || "") })}
        />
      )}
    </div>
  );
}
