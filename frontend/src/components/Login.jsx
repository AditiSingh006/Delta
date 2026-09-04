import { useState } from "react";
import { api, setAuthToken } from "../api.js";
import { t } from "../i18n.js";

export default function Login({ lang, onAuthed }) {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/register";
      const { data } = await api.post(path, { username, password });
      setAuthToken(data.token);
      onAuthed({ token: data.token, username: data.username, lang: data.lang || "en" });
    } catch (err) {
      setError(err.response?.data?.error || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>{t(lang, "appName")}</h1>
        <div className="sub">
          {mode === "login" ? t(lang, "loginTitle") : t(lang, "registerTitle")}
        </div>
        <form onSubmit={submit}>
          <div className="field">
            <label>{t(lang, "username")}</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="field">
            <label>{t(lang, "password")}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <div className="error">{error}</div>}
          <button className="primary" type="submit" disabled={loading} style={{ width: "100%" }}>
            {loading ? "…" : mode === "login" ? t(lang, "login") : t(lang, "register")}
          </button>
        </form>
        <div className="switch">
          <button onClick={() => setMode(mode === "login" ? "register" : "login")}>
            {mode === "login" ? t(lang, "switchToRegister") : t(lang, "switchToLogin")}
          </button>
        </div>
      </div>
    </div>
  );
}
