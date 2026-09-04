import { Router } from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { findSymbol, searchSymbols } from "../symbols.js";
import { fetchQuotes } from "../dataProvider.js";
import { detectChanges, saveSnapshot, saveEvents } from "../changeDetector.js";

const router = Router();
router.use(requireAuth);

function latestSnapshot(symbol) {
  return db
    .prepare(
      `SELECT * FROM price_snapshots WHERE symbol = ? ORDER BY fetched_at DESC LIMIT 1`
    )
    .get(symbol);
}

function sparklinePrices(symbol, limit = 24) {
  return db
    .prepare(
      `SELECT price, fetched_at FROM price_snapshots
       WHERE symbol = ? ORDER BY fetched_at DESC LIMIT ?`
    )
    .all(symbol, limit)
    .reverse()
    .map((r) => r.price);
}

// GET /api/watchlist - the user's list with latest known price for each symbol.
// If we've genuinely never polled a brand-new symbol yet, fetch it inline
// once so the row isn't empty on first add.
router.get("/", async (req, res) => {
  const items = db
    .prepare(`SELECT symbol, added_at FROM watchlist_items WHERE user_id = ? ORDER BY added_at`)
    .all(req.userId);

  const result = [];
  for (const item of items) {
    let snap = latestSnapshot(item.symbol);
    if (!snap) {
      const [tick] = await fetchQuotes([item.symbol]);
      if (tick) {
        saveSnapshot(tick);
        snap = latestSnapshot(item.symbol);
      }
    }
    const meta = findSymbol(item.symbol);
    const staleSeconds = snap
      ? (Date.now() - new Date(snap.fetched_at.replace(" ", "T") + "Z").getTime()) / 1000
      : null;

    result.push({
      symbol: item.symbol,
      name: meta?.name || item.symbol,
      sector: meta?.sector || null,
      price: snap?.price ?? null,
      prevClose: snap?.prev_close ?? null,
      change: snap ? Number((snap.price - snap.prev_close).toFixed(2)) : null,
      changePct: snap && snap.prev_close ? Number((((snap.price - snap.prev_close) / snap.prev_close) * 100).toFixed(2)) : null,
      volume: snap?.volume ?? null,
      week52High: snap?.week52_high ?? null,
      week52Low: snap?.week52_low ?? null,
      isStale: snap ? Boolean(snap.is_stale) || staleSeconds > 180 : true,
      lastUpdated: snap?.fetched_at ?? null,
      sparkline: sparklinePrices(item.symbol),
    });
  }

  res.json({ items: result });
});

// GET /api/watchlist/search?q=  - autocomplete when adding a stock
router.get("/search", (req, res) => {
  res.json({ results: searchSymbols(req.query.q) });
});

// POST /api/watchlist  { symbol }
router.post("/", async (req, res) => {
  const symbol = (req.body?.symbol || "").toUpperCase().trim();
  const meta = findSymbol(symbol);
  if (!meta) return res.status(404).json({ error: `Unknown symbol "${symbol}"` });

  try {
    db.prepare(`INSERT INTO watchlist_items (user_id, symbol) VALUES (?, ?)`).run(
      req.userId,
      symbol
    );
  } catch {
    return res.status(409).json({ error: `${symbol} is already on your watchlist` });
  }

  // Prime it with a first snapshot immediately so a newly-added stock
  // shows a real price straight away instead of waiting for the next poll.
  if (!latestSnapshot(symbol)) {
    const [tick] = await fetchQuotes([symbol]);
    if (tick) saveSnapshot(tick);
  }

  res.status(201).json({ ok: true });
});

// DELETE /api/watchlist/:symbol
router.delete("/:symbol", (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  db.prepare(`DELETE FROM watchlist_items WHERE user_id = ? AND symbol = ?`).run(
    req.userId,
    symbol
  );
  res.json({ ok: true });
});

// GET /api/watchlist/digest - "what changed since I last checked", ranked
// by significance, for exactly the symbols this user watches. Does NOT
// advance last_seen - the frontend calls /mark-seen once it has shown this.
router.get("/digest", (req, res) => {
  const seenRow = db.prepare(`SELECT last_seen_at FROM user_seen WHERE user_id = ?`).get(req.userId);
  const since = seenRow?.last_seen_at || "1970-01-01 00:00:00";

  const symbols = db
    .prepare(`SELECT symbol FROM watchlist_items WHERE user_id = ?`)
    .all(req.userId)
    .map((r) => r.symbol);

  if (symbols.length === 0) {
    return res.json({ sinceLastVisit: since, events: [] });
  }

  const placeholders = symbols.map(() => "?").join(",");
  const events = db
    .prepare(
      `SELECT * FROM change_events
       WHERE symbol IN (${placeholders}) AND created_at > ?
       ORDER BY score DESC, created_at DESC
       LIMIT 25`
    )
    .all(...symbols, since);

  res.json({ sinceLastVisit: since, events });
});

// POST /api/watchlist/mark-seen - call after showing the digest, so the
// next visit's digest starts from "now" instead of repeating old events.
router.post("/mark-seen", (req, res) => {
  db.prepare(
    `INSERT INTO user_seen (user_id, last_seen_at) VALUES (?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET last_seen_at = datetime('now')`
  ).run(req.userId);
  res.json({ ok: true });
});

export default router;
