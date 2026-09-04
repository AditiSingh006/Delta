import db from "./db.js";
import { fetchQuotes } from "./dataProvider.js";
import { detectChanges, saveSnapshot, saveEvents } from "./changeDetector.js";

const POLL_SECONDS = Number(process.env.POLL_INTERVAL_SECONDS || 60);

function getWatchedSymbols() {
  const rows = db.prepare(`SELECT DISTINCT symbol FROM watchlist_items`).all();
  return rows.map((r) => r.symbol);
}

/**
 * Runs one poll cycle: fetch prices for every symbol that's on ANY user's
 * watchlist, store a snapshot, detect meaningful changes ONCE per symbol,
 * and push live updates over the socket. This is the core scaling trick:
 * cost grows with (distinct symbols watched), not with (number of users).
 * A symbol watched by 1 user or 100,000 users is fetched exactly once.
 */
export async function pollOnce(io) {
  const symbols = getWatchedSymbols();
  if (symbols.length === 0) return;

  const quotes = await fetchQuotes(symbols);

  for (const tick of quotes) {
    const events = detectChanges(tick.symbol, tick);
    saveSnapshot(tick);
    if (events.length) saveEvents(tick.symbol, tick, events);

    if (io) {
      io.emit("priceUpdate", tick);
      for (const e of events) {
        io.emit("changeEvent", { symbol: tick.symbol, ...e, price: tick.price });
      }
    }
  }
}

export function startScheduler(io) {
  // Run once immediately on boot so the UI isn't empty for a full interval,
  // then on the configured cadence.
  pollOnce(io).catch((err) => console.error("[scheduler] initial poll failed:", err));

  const intervalMs = Math.max(10, POLL_SECONDS) * 1000;
  setInterval(() => {
    pollOnce(io).catch((err) => console.error("[scheduler] poll failed:", err));
  }, intervalMs);

  console.log(`[scheduler] polling every ${POLL_SECONDS}s`);
}
