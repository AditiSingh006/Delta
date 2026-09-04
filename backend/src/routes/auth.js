import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db from "../db.js";

const router = Router();

function issueToken(user) {
  return jwt.sign({ userId: user.id, username: user.username }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });
}

// Register a new account. Password is hashed - never stored in plain text.
router.post("/register", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password || password.length < 4) {
    return res.status(400).json({ error: "Username and a password (4+ chars) are required" });
  }

  const existing = db.prepare(`SELECT id FROM users WHERE username = ?`).get(username);
  if (existing) return res.status(409).json({ error: "That username is already taken" });

  const hash = await bcrypt.hash(password, 10);
  const info = db
    .prepare(`INSERT INTO users (username, password_hash) VALUES (?, ?)`)
    .run(username, hash);

  const user = { id: info.lastInsertRowid, username };
  db.prepare(`INSERT INTO user_seen (user_id, last_seen_at) VALUES (?, datetime('now'))`).run(user.id);

  res.json({ token: issueToken(user), username: user.username, lang: "en" });
});

// Log in on any device - state (watchlist + history) lives server-side in
// SQLite keyed by user id, so the same account looks identical everywhere.
router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare(`SELECT * FROM users WHERE username = ?`).get(username);
  if (!user) return res.status(401).json({ error: "Invalid username or password" });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid username or password" });

  res.json({ token: issueToken(user), username: user.username, lang: user.lang });
});

export default router;
