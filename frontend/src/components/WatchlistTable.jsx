import Sparkline from "./Sparkline.jsx";
import { t } from "../i18n.js";
import { api } from "../api.js";

function formatVolume(v) {
  if (v == null) return "-";
  if (v >= 10000000) return (v / 10000000).toFixed(2) + "Cr";
  if (v >= 100000) return (v / 100000).toFixed(2) + "L";
  return v.toLocaleString("en-IN");
}

export default function WatchlistTable({ lang, items, flashMap, attentionSymbols, onChanged }) {
  async function remove(symbol) {
    await api.delete(`/watchlist/${symbol}`);
    onChanged();
  }

  if (items.length === 0) {
    return <div className="table-wrap empty-state">{t(lang, "empty")}</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{t(lang, "watchlist")}</th>
            <th>{t(lang, "trend")}</th>
            <th>{t(lang, "price")}</th>
            <th>{t(lang, "change1d")}</th>
            <th>{t(lang, "volume")}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => {
            const flash = flashMap[row.symbol];
            const isAttention = attentionSymbols.has(row.symbol);
            const rowClass = [
              flash === "up" ? "flash-up" : "",
              flash === "down" ? "flash-down" : "",
              isAttention ? "attention" : "",
            ]
              .filter(Boolean)
              .join(" ");
            const positive = (row.changePct ?? 0) >= 0;

            return (
              <tr key={row.symbol} className={rowClass}>
                <td>
                  <div className="symbol-cell">
                    <div>
                      <div className="symbol-name">
                        {row.name}
                        {row.isStale && <span className="stale-tag">{t(lang, "stale")}</span>}
                      </div>
                      <div className="symbol-sub">{row.symbol}</div>
                    </div>
                  </div>
                </td>
                <td><Sparkline prices={row.sparkline} /></td>
                <td className="mono">{row.price != null ? `₹${row.price.toFixed(2)}` : "-"}</td>
                <td className="mono">
                  <span className={`change-pill ${positive ? "gain" : "loss"}`}>
                    {row.change != null
                      ? `${positive ? "+" : ""}₹${row.change.toFixed(2)} (${positive ? "+" : ""}${row.changePct.toFixed(2)}%)`
                      : "-"}
                  </span>
                </td>
                <td className="mono neutral">{formatVolume(row.volume)}</td>
                <td>
                  <button className="remove-btn" onClick={() => remove(row.symbol)}>
                    {t(lang, "remove")}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
