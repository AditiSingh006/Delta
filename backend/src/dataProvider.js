import axios from "axios";
import { findSymbol, SYMBOL_UNIVERSE } from "./symbols.js";

const DATA_MODE = (process.env.DATA_MODE || "mock").toLowerCase();
const TWELVEDATA_API_KEY = process.env.TWELVEDATA_API_KEY || "";

// In-memory "live" state for mock mode, seeded from symbols.js.
// Keyed by symbol -> { price, prevClose, dayHigh, dayLow, week52High, week52Low, volume, trendBias }
const mockState = new Map();

function seedMock(symbol) {
  const def = findSymbol(symbol);
  const base = def ? def.basePrice : 500;
  mockState.set(symbol, {
    price: base,
    prevClose: base,
    dayHigh: base,
    dayLow: base,
    week52High: base * (1 + Math.random() * 0.35),
    week52Low: base * (1 - Math.random() * 0.3),
    volume: Math.floor(500000 + Math.random() * 5000000),
    trendBias: Math.random() > 0.5 ? 1 : -1, // gentle drift direction, occasionally flips
    ticksSinceFlip: 0,
  });
}

function nextMockTick(symbol) {
  if (!mockState.has(symbol)) seedMock(symbol);
  const s = mockState.get(symbol);

  // Occasionally flip the drift direction so trend reversals actually happen
  s.ticksSinceFlip += 1;
  if (s.ticksSinceFlip > 4 && Math.random() < 0.18) {
    s.trendBias *= -1;
    s.ticksSinceFlip = 0;
  }

  const noise = (Math.random() - 0.5) * 0.012; // +-0.6% random noise
  const drift = s.trendBias * 0.002; // gentle directional push
  // rare volatility spike to make "meaningful change" detection interesting
  const spike = Math.random() < 0.05 ? (Math.random() - 0.5) * 0.05 : 0;

  const pctMove = noise + drift + spike;
  s.price = Math.max(1, s.price * (1 + pctMove));
  s.dayHigh = Math.max(s.dayHigh, s.price);
  s.dayLow = Math.min(s.dayLow, s.price);
  s.week52High = Math.max(s.week52High, s.price);
  s.week52Low = Math.min(s.week52Low, s.price);

  const volumeJump = Math.random() < 0.08 ? 3 + Math.random() * 2 : 1;
  s.volume = Math.floor(s.volume * (0.9 + Math.random() * 0.2) * volumeJump);

  return {
    symbol,
    price: Number(s.price.toFixed(2)),
    prevClose: Number(s.prevClose.toFixed(2)),
    dayHigh: Number(s.dayHigh.toFixed(2)),
    dayLow: Number(s.dayLow.toFixed(2)),
    week52High: Number(s.week52High.toFixed(2)),
    week52Low: Number(s.week52Low.toFixed(2)),
    volume: s.volume,
    source: "mock",
    isStale: false,
  };
}

async function fetchTwelveData(symbols) {
  // Twelve Data supports comma-separated symbols in one call, and NSE
  // tickers via the ":NSE" suffix - this keeps us well inside the free
  // tier's rate limit even with a fairly large watchlist universe.
  const joined = symbols.map((s) => `${s}:NSE`).join(",");
  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(
    joined
  )}&apikey=${TWELVEDATA_API_KEY}`;

  const { data } = await axios.get(url, { timeout: 10000 });
  const rows = symbols.length === 1 ? { [symbols[0]]: data } : data;

  return symbols.map((symbol) => {
    const row = rows[symbol];
    if (!row || row.status === "error" || !row.close) {
      // Provider hiccup or unsupported symbol - fall back to the last
      // mock-simulated tick so the UI never shows a hard failure, but
      // flag it as stale so the frontend can be honest about it.
      const fallback = nextMockTick(symbol);
      return { ...fallback, source: "mock-fallback", isStale: true };
    }
    return {
      symbol,
      price: Number(row.close),
      prevClose: Number(row.previous_close ?? row.close),
      dayHigh: Number(row.high ?? row.close),
      dayLow: Number(row.low ?? row.close),
      week52High: Number(row.fifty_two_week?.high ?? row.close),
      week52Low: Number(row.fifty_two_week?.low ?? row.close),
      volume: Number(row.volume ?? 0),
      source: "twelvedata",
      isStale: false,
    };
  });
}

/**
 * Fetch current quotes for a list of symbols. Always resolves - a failed
 * live call degrades to a stale/mock tick rather than throwing, because a
 * watchlist that goes blank on one bad API response is worse than one
 * that shows slightly stale data with a clear "stale" indicator.
 */
export async function fetchQuotes(symbols) {
  if (symbols.length === 0) return [];

  if (DATA_MODE === "twelvedata" && TWELVEDATA_API_KEY) {
    try {
      return await fetchTwelveData(symbols);
    } catch (err) {
      console.error("[dataProvider] twelvedata fetch failed, falling back to mock:", err.message);
      return symbols.map((s) => ({ ...nextMockTick(s), source: "mock-fallback", isStale: true }));
    }
  }

  return symbols.map((s) => nextMockTick(s));
}

export function listUniverse() {
  return SYMBOL_UNIVERSE;
}
