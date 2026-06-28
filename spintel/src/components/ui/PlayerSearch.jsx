import { useState, useEffect, useMemo } from "react";
import { Icon } from "@iconify/react";
import { G } from "../../utils/tokens";
import { Avatar, PhotoAvatar } from "./index.jsx";

export function PlayerSearch({
  players,
  selected,
  onSelect,
  placeholder = "Search IPL Batter…",
  photoMap = {},   // ← new: ID → imgUrl map from photoLoader
}) {
  const [q,    setQ]    = useState(selected ? (selected.longName || selected.Name || "") : "");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (selected) setQ(selected.longName || selected.Name || "");
  }, [selected?.ID]);

  const filtered = useMemo(() => {
    if (!players?.length) return [];
    const lq = q.toLowerCase();
    return players
      .filter(
        (p) =>
          (p.longName || "").toLowerCase().includes(lq) ||
          (p.Name    || "").toLowerCase().includes(lq)
      )
      .slice(0, 14);
  }, [q, players]);

  return (
    <div style={{ position: "relative" }}>
      <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", display: "flex" }}>
        <Icon icon="solar:magnifer-bold" width={16} color={G.gray400} />
      </span>
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        placeholder={placeholder}
        style={{
          width: "100%", padding: "11px 14px 11px 40px", borderRadius: 10,
          border: `1.5px solid ${G.gray300}`, fontSize: 14, outline: "none",
          background: G.white, fontFamily: "'Barlow Condensed', sans-serif",
          transition: "border-color 0.15s",
        }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
          background: G.white, border: `1px solid ${G.gray200}`, borderRadius: 10,
          zIndex: 200, maxHeight: 260, overflowY: "auto",
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
        }}>
          {filtered.map((p) => (
            <div
              key={p.ID}
              onMouseDown={() => { onSelect(p); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 14px", cursor: "pointer",
                borderBottom: `1px solid ${G.gray100}`,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = G.greenLight)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <PhotoAvatar
                id={p.ID}
                name={p.longName || p.Name}
                size={34}
                color={G.green}
                photoUrl={photoMap[String(p.ID)]}
              />
              <div>
                <div style={{
                  fontWeight: 600, fontSize: 14, color: G.gray800,
                  fontFamily: "'Barlow Condensed', sans-serif",
                }}>
                  {p.longName || p.Name}
                </div>
                <div style={{ fontSize: 11, color: G.gray500 }}>
                  {p.longBattingStyles || "Batter"}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
