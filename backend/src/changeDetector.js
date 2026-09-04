import db from "./db.js";

/**
 * "Meaningful change" is deliberately NOT just "price moved". A stock that
 * always jitters +-2% moving 2% again is noise; a normally-sleepy stock
 * moving 2% is a signal. So every rule below is adaptive to the symbol's
 * own recent behaviour rather than using one fixed global threshold.
 */

function stddev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function recentHistory(symbol, limit = 30) {
  return db
    .prepare(
      `SELECT price, volume, fetched_at FROM price_snapshots
       WHERE symbol = ? ORDER BY fetched_at DESC LIMIT ?`
    )
    .all(symbol, limit)
    .reverse(); // oldest -> newest
}

/**
 * Compares the just-fetched tick against history and returns an array of
 * change events (possibly empty). Called ONCE per symbol per poll cycle -
 * shared across every user who watches that symbol.
 */
export function detectChanges(symbol, tick) {
  const history = recentHistory(symbol, 30);
  const prev = history[history.length - 1]; // last stored snapshot, if any
  const events = [];

  if (!prev) return events; // first time we've ever seen this symbol - nothing to diff yet

  const pctChange = ((tick.price - prev.price) / prev.price) * 100;
  const pctMoves = history.slice(1).map((h, i) => {
    const p = history[i].price;
    return ((h.price - p) / p) * 100;
  });
  const typicalMove = Math.max(stddev(pctMoves), 0.15); // floor so ultra-quiet stocks don't get a hair-trigger

  // --- Rule 1: outsized move relative to the stock's own normal jitter ---
  const moveRatio = Math.abs(pctChange) / typicalMove;
  if (moveRatio >= 2.2 && Math.abs(pctChange) >= 0.5) {
    const score = Math.min(100, Math.round(40 + moveRatio * 8));
    const dir = pctChange > 0 ? "up" : "down";
    events.push({
      type: "big_move",
      score,
      pctChange,
      message_en: `${symbol} moved ${dir} ${Math.abs(pctChange).toFixed(
        2
      )}% - about ${moveRatio.toFixed(1)}x its usual swing.`,
      message_hi: `${symbol} ${Math.abs(pctChange).toFixed(2)}% ${
        dir === "up" ? "ऊपर" : "नीचे"
      } गया - यह इसके सामान्य उतार-चढ़ाव से करीब ${moveRatio.toFixed(1)} गुना ज़्यादा है।`,
    });
  }

  // --- Rule 2: volume spike vs recent average ---
  const volumes = history.map((h) => h.volume).filter(Boolean);
  const avgVolume = volumes.length
    ? volumes.reduce((a, b) => a + b, 0) / volumes.length
    : 0;
  if (avgVolume > 0 && tick.volume >= avgVolume * 2.2) {
    const times = tick.volume / avgVolume;
    events.push({
      type: "volume_spike",
      score: Math.min(90, Math.round(35 + times * 6)),
      pctChange,
      message_en: `Unusual activity in ${symbol}: volume is ${times.toFixed(
        1
      )}x its recent average.`,
      message_hi: `${symbol} में असामान्य गतिविधि: वॉल्यूम हाल के औसत से ${times.toFixed(
        1
      )} गुना है।`,
    });
  }

  // --- Rule 3: crossed 52-week high or low ---
  if (tick.week52High && prev.price < tick.week52High && tick.price >= tick.week52High) {
    events.push({
      type: "week52_high",
      score: 85,
      pctChange,
      message_en: `${symbol} just hit a new 52-week high of ₹${tick.price.toFixed(2)}.`,
      message_hi: `${symbol} ने ₹${tick.price.toFixed(2)} का नया 52-हफ्तों का उच्चतम स्तर छुआ है।`,
    });
  }
  if (tick.week52Low && prev.price > tick.week52Low && tick.price <= tick.week52Low) {
    events.push({
      type: "week52_low",
      score: 85,
      pctChange,
      message_en: `${symbol} just hit a new 52-week low of ₹${tick.price.toFixed(2)}.`,
      message_hi: `${symbol} ₹${tick.price.toFixed(2)} के नए 52-हफ्तों के निम्नतम स्तर पर पहुंच गया है।`,
    });
  }

  // --- Rule 4: trend reversal (direction flips after a run) ---
  if (pctMoves.length >= 3) {
    const lastThree = pctMoves.slice(-3);
    const wasConsistentlyUp = lastThree.every((m) => m > 0.05);
    const wasConsistentlyDown = lastThree.every((m) => m < -0.05);
    if (wasConsistentlyUp && pctChange < -0.3) {
      events.push({
        type: "trend_reversal",
        score: 60,
        pctChange,
        message_en: `${symbol} was climbing steadily and just turned down.`,
        message_hi: `${symbol} लगातार बढ़ रहा था और अभी नीचे मुड़ गया है।`,
      });
    } else if (wasConsistentlyDown && pctChange > 0.3) {
      events.push({
        type: "trend_reversal",
        score: 60,
        pctChange,
        message_en: `${symbol} was falling steadily and just turned up.`,
        message_hi: `${symbol} लगातार गिर रहा था और अभी ऊपर मुड़ गया है।`,
      });
    }
  }

  // --- Rule 5: crossed a psychologically round level ---
  const step = tick.price >= 1000 ? 500 : tick.price >= 200 ? 100 : 50;
  const prevBand = Math.floor(prev.price / step);
  const currBand = Math.floor(tick.price / step);
  if (prevBand !== currBand) {
    const level = currBand * step;
    events.push({
      type: "round_level",
      score: 30,
      pctChange,
      message_en: `${symbol} crossed the ₹${level} level.`,
      message_hi: `${symbol} ने ₹${level} के स्तर को पार किया।`,
    });
  }

  return events;
}

export function saveSnapshot(tick) {
  db.prepare(
    `INSERT INTO price_snapshots
      (symbol, price, volume, day_high, day_low, week52_high, week52_low, prev_close, source, is_stale)
     VALUES (@symbol, @price, @volume, @dayHigh, @dayLow, @week52High, @week52Low, @prevClose, @source, @isStale)`
  ).run({ ...tick, isStale: tick.isStale ? 1 : 0 });
}

export function saveEvents(symbol, tick, events) {
  const stmt = db.prepare(
    `INSERT INTO change_events (symbol, type, message_en, message_hi, score, price, pct_change)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const insertMany = db.transaction((rows) => {
    for (const e of rows) {
      stmt.run(symbol, e.type, e.message_en, e.message_hi, e.score, tick.price, e.pctChange);
    }
  });
  if (events.length) insertMany(events);
}
