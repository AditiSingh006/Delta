import { t } from "../i18n.js";

export default function ChangesDigest({ lang, events, onClose, onSpeak }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <h2>{t(lang, "whatChanged")}</h2>
        <div className="sub">{t(lang, "sinceLastVisit")}</div>

        {events.length === 0 && <div className="empty-state" style={{ padding: "30px 0" }}>{t(lang, "noChanges")}</div>}

        {events.map((e) => (
          <div className="event-card" key={e.id}>
            <div className="event-top">
              <span className="event-symbol">{e.symbol}</span>
              <div className="score-bar"><div style={{ width: `${e.score}%` }} /></div>
            </div>
            <div className="event-msg">{lang === "hi" ? e.message_hi : e.message_en}</div>
            <div className="event-actions">
              <button onClick={() => onSpeak(lang === "hi" ? e.message_hi : e.message_en)}>🔊</button>
            </div>
          </div>
        ))}

        <button className="primary" style={{ width: "100%", marginTop: 8 }} onClick={onClose}>
          {t(lang, "markSeen")}
        </button>
      </div>
    </div>
  );
}
