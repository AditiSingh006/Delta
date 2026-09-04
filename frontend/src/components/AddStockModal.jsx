import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { t } from "../i18n.js";

export default function AddStockModal({ lang, onAdded }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    const handle = setTimeout(async () => {
      if (!open) return;
      const { data } = await api.get("/watchlist/search", { params: { q: query } });
      setResults(data.results);
    }, 200);
    return () => clearTimeout(handle);
  }, [query, open]);

  async function add(symbol) {
    try {
      await api.post("/watchlist", { symbol });
      setQuery("");
      setOpen(false);
      onAdded();
    } catch (err) {
      alert(err.response?.data?.error || "Could not add stock");
    }
  }

  return (
    <div className="add-panel" ref={boxRef}>
      <input
        type="text"
        placeholder={t(lang, "searchPlaceholder")}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: 280 }}
      />
      {open && results.length > 0 && (
        <div className="search-results">
          {results.map((r) => (
            <button key={r.symbol} onClick={() => add(r.symbol)}>
              <span>
                <span className="sym">{r.symbol}</span> <span className="nm">{r.name}</span>
              </span>
              <span>{t(lang, "add")}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
