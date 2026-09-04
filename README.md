# Smart Watchlist

A market watchlist that focuses on **what changed and deserves attention**,
not just a live price ticker. Full stack: Node/Express + SQLite backend,
React/Vite frontend, live updates over WebSockets, and a Hindi/English
voice assistant built on the browser's own speech APIs.

Full setup instructions are in the chat message this project came with.
Quick version:

```
# backend
cd backend
cp .env.example .env
npm install
npm run dev

# frontend (new terminal)
cd frontend
cp .env.example .env
npm install
npm run dev
```

Then open http://localhost:5173

## What "meaningful change" means here

A fixed "±2% = alert" rule is wrong for every stock at once: 2% is nothing
for a volatile small-cap and huge for a sleepy PSU bank. So every rule is
adaptive to that stock's own recent behaviour, computed server-side once
per poll (`backend/src/changeDetector.js`):

1. **Outsized move** - price move is 2.2x+ that symbol's own recent
   typical swing (not a flat percentage).
2. **Volume spike** - today's tick volume vs its own recent average.
3. **52-week high/low breach**.
4. **Trend reversal** - direction flips after 3+ consistent ticks.
5. **Round-level crossing** - a psychologically notable price band (₹50 /
   ₹100 / ₹500 steps depending on price).

Each event gets a 0-100 significance score. The "What changed" digest is
this list, ranked, filtered to only the symbols *this* user watches, since
their personal `last_seen_at` timestamp - so two users watching the same
stock get the same underlying event, but a personalized digest.

## How state persists across sessions/devices

Everything - account, watchlist, price history, change history, and
"last seen" - lives server-side in SQLite, keyed by user id. The frontend
only holds a JWT in `localStorage`. Log in from any device with the same
username/password and you see the identical watchlist and an accurate
"what changed since you left" digest, because "since you left" is measured
server-side against that account's `last_seen_at`, not client-side state
that a new device wouldn't have.

## Stale / delayed / conflicting data

- The data provider (`dataProvider.js`) never throws upward - a failed
  live API call falls back to the last simulated tick and is flagged
  `isStale`, so the UI shows a small "delayed" tag instead of a blank row
  or a crash.
- Each snapshot stores its own `is_stale` flag and timestamp; the API also
  computes staleness from wall-clock age (>180s since last poll) in case a
  symbol silently stops updating.
- All price history is append-only (`price_snapshots`), so "what changed"
  is always computed by diffing real stored ticks, not overwriting a
  single mutable "current price" row - which also means change history
  can never be silently corrupted by a late/out-of-order update; every
  tick is truth for the moment it was taken.

## How this scales

The expensive part of a watchlist product is polling a data provider, not
serving users. So the design deliberately decouples the two:

- **One poll cycle covers every user.** The scheduler fetches quotes for
  the *distinct* set of symbols across *all* watchlists, once, and change
  detection runs once per symbol per poll - not once per user. 10,000
  users all watching RELIANCE costs the same one API call as 1 user
  watching it.
- **Live updates fan out over one Socket.IO broadcast per tick**, not a
  per-user query loop.
- **SQLite is fine at this scale** (single-writer, embedded, zero ops) up
  to a large number of users on one instance; the natural next step is
  swapping in Postgres and moving the scheduler into its own worker
  process that publishes to Redis pub/sub for horizontal scaling - the
  route/service boundaries here are already split so that swap doesn't
  touch the frontend or route logic, only `db.js` and `scheduler.js`.
- **Backpressure-friendly polling**: batchable providers (like Twelve
  Data's comma-separated quote endpoint) are used so growing the number of
  *distinct* symbols doesn't grow API calls 1:1.

## Where complexity was deliberately avoided

- No Redis/queues/microservices - unnecessary at the scale a real
  interview/demo project needs to prove out; the code is structured so
  they're a natural addition, not a rewrite.
- No OAuth - username/password + JWT is enough to prove "state persists
  per account across devices" without pulling in a third-party auth
  provider.
- Voice assistant uses the browser's built-in `SpeechRecognition` /
  `speechSynthesis` (Hindi `hi-IN` + English `en-IN`) instead of a paid
  cloud speech API - free, needs no API key, and keeps the whole project
  runnable with zero paid signups if you use `DATA_MODE=mock`.
