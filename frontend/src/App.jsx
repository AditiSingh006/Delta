import { useCallback, useEffect, useState } from "react";
import { api, setAuthToken, getStoredToken } from "./api.js";
import { connectSocket, disconnectSocket } from "./socket.js";
import { t } from "./i18n.js";
import Login from "./components/Login.jsx";
import WatchlistTable from "./components/WatchlistTable.jsx";
import AddStockModal from "./components/AddStockModal.jsx";
import ChangesDigest from "./components/ChangesDigest.jsx";

export default function App() {
  const [auth, setAuth] = useState(null); // { token, username, lang }
  const [lang, setLang] = useState("en");
  const [items, setItems] = useState([]);
  const [indices, setIndices] = useState([]);
  const [digestOpen, setDigestOpen] = useState(false);
  const [digestEvents, setDigestEvents] = useState([]);
  const [flashMap, setFlashMap] = useState({});
  const [attentionSymbols, setAttentionSymbols] = useState(new Set());

  // ---- boot: restore session from localStorage token ----
  useEffect(() => {
    const token = getStoredToken();
    if (token) {
      setAuthToken(token);
      setAuth({ token, username: null, lang: "en" });
    }
  }, []);

  const loadWatchlist = useCallback(async () => {
    const { data } = await api.get("/watchlist");
    setItems(data.items);
  }, []);

    const loadIndices = useCallback(async () => {
    try {
      const { data } = await api.get("/market/indices");
      setIndices(data.indices);
    } catch {
      // Yahoo's endpoint is unofficial and can occasionally fail/rate-limit -
      // don't crash the app, just leave the indices empty for now.
      }
    }, []);

  const loadDigest = useCallback(async () => {
    const { data } = await api.get("/watchlist/digest");
    setDigestEvents(data.events);
    setAttentionSymbols(new Set(data.events.map((e) => e.symbol)));
    return data.events;
  }, []);

  // ---- once authed: load data, open digest if there's anything, connect socket ----
  useEffect(() => {
    if (!auth) return;
    let socket;
    (async () => {
      await loadWatchlist();
      await loadIndices();
      const events = await loadDigest();
      if (events.length > 0) setDigestOpen(true);

      socket = connectSocket(auth.token);
      socket.on("priceUpdate", (tick) => {
        setItems((prev) => {
          const idx = prev.findIndex((i) => i.symbol === tick.symbol);
          if (idx === -1) return prev;
          const old = prev[idx];
          const changed = old.price != null && tick.price !== old.price;
          if (changed) {
            setFlashMap((m) => ({ ...m, [tick.symbol]: tick.price > old.price ? "up" : "down" }));
            setTimeout(() => {
              setFlashMap((m) => {
                const copy = { ...m };
                delete copy[tick.symbol];
                return copy;
              });
            }, 1200);
          }
          const next = [...prev];
          const changePct = old.prevClose ? Number((((tick.price - old.prevClose) / old.prevClose) * 100).toFixed(2)) : old.changePct;
          next[idx] = {
            ...old,
            price: tick.price,
            volume: tick.volume,
            isStale: tick.isStale,
            change: old.prevClose ? Number((tick.price - old.prevClose).toFixed(2)) : old.change,
            changePct,
            sparkline: [...old.sparkline.slice(-23), tick.price],
          };
          return next;
        });
      });
      socket.on("changeEvent", (evt) => {
        setAttentionSymbols((prev) => new Set(prev).add(evt.symbol));
      });
    })();

    const indexInterval = setInterval(loadIndices, 15000);
    return () => {
      clearInterval(indexInterval);
      disconnectSocket();
    };
  }, [auth, loadWatchlist, loadIndices, loadDigest]);

  function handleAuthed(payload) {
    setAuth(payload);
    setLang(payload.lang || "en");
  }

  function logout() {
    setAuthToken(null);
    disconnectSocket();
    setAuth(null);
    setItems([]);
  }

  async function closeDigest() {
    setDigestOpen(false);
    await api.post("/watchlist/mark-seen");
  }

  function speakText(text) {
    if (!("speechSynthesis" in window)) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang === "hi" ? "hi-IN" : "en-IN";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  }

  if (!auth) return <Login lang={lang} onAuthed={handleAuthed} />;

  return (
    <div>
      <div className="topbar">
        <div className="brand"><span className="logo-mark" /> {t(lang, "appName")}</div>
        <div className="indices">
          {indices.map((idx) => (
            <div className="index-chip mono" key={idx.name}>
              <span className="name">{idx.name}</span>
              <span className={idx.changePct >= 0 ? "gain" : "loss"}>
                {idx.value.toLocaleString("en-IN")} ({idx.changePct >= 0 ? "+" : ""}
                {idx.changePct}%)
              </span>
            </div>
          ))}
        </div>
        <div className="topbar-actions">
          <div className="lang-toggle">
            <button className={lang === "en" ? "active" : ""} onClick={() => setLang("en")}>EN</button>
            <button className={lang === "hi" ? "active" : ""} onClick={() => setLang("hi")}>हिं</button>
          </div>
          <button className="bell-btn" onClick={() => setDigestOpen(true)}>
            🔔
            {digestEvents.length > 0 && <span className="bell-badge">{digestEvents.length}</span>}
          </button>
          <button onClick={logout}>{t(lang, "logout")}</button>
        </div>
      </div>

      <div className="main">
        <div className="section-head">
          <h2>{t(lang, "watchlist")}</h2>
          <AddStockModal lang={lang} onAdded={loadWatchlist} />
        </div>
        <WatchlistTable
          lang={lang}
          items={items}
          flashMap={flashMap}
          attentionSymbols={attentionSymbols}
          onChanged={loadWatchlist}
        />
      </div>

      {digestOpen && (
        <ChangesDigest lang={lang} events={digestEvents} onClose={closeDigest} onSpeak={speakText} />
      )}

    </div>
  );
}
