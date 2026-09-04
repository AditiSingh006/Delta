import { Router } from "express";
import { requireAuth } from "../middleware/authMiddleware.js";
import { searchSymbols } from "../symbols.js";
import axios from "axios";

const router = Router();
router.use(requireAuth);

// Simple simulated index strip (NIFTY / SENSEX / BANKNIFTY) purely for the
// header ticker - not tied to any user's watchlist.
const YAHOO_SYMBOLS = {
  NIFTY: "^NSEI",
  SENSEX: "^BSESN",
  BANKNIFTY: "^NSEBANK",
};

router.get("/indices", async (req, res) => {
  try {
    const entries = await Promise.all(
      Object.entries(YAHOO_SYMBOLS).map(async ([name, ySymbol]) => {
        const { data } = await axios.get(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySymbol)}`,
          { timeout: 8000, headers: { "User-Agent": "Mozilla/5.0" } }
        );
        const meta = data.chart.result[0].meta;
        const value = meta.regularMarketPrice;
        const prevClose = meta.chartPreviousClose ?? meta.previousClose;
        const change = Number((value - prevClose).toFixed(2));
        const changePct = Number(((change / prevClose) * 100).toFixed(2));
        return { name, value: Number(value.toFixed(2)), change, changePct };
      })
    );
    res.json({ indices: entries });
  } catch (err) {
    console.error("[market] index fetch failed:", err.message);
    res.status(502).json({ error: "Live index data is unavailable right now" });
  }
});

router.get("/universe", (req, res) => {
  res.json({ results: searchSymbols("") });
});

export default router;
