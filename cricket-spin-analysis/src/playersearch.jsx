import { useState, useMemo, useCallback } from "react";
import { PlayerAvatar } from "./ui";

export function PlayerSearch({ players, selected, onSelect }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!query) return players.slice(0, 20);
    const q = query.toLowerCase();
    return players
      .filter(
        (p) =>
          p.longName?.toLowerCase().includes(q) ||
          p.Name?.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [query, players]);

  const handleSelect = useCallback(
    (p) => {
      onSelect(p);
      setQuery(p.longName || p.Name);
      setOpen(false);
    },
    [onSelect]
  );

  return (
    <div className="player-search" style={{ position: "relative" }}>
      <span className="ps-icon">🔍</span>
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        placeholder="Search player by name…"
      />
      {open && filtered.length > 0 && (
        <div className="dropdown scrollbar-hide">
          {filtered.map((p) => (
            <div
              key={p.ID}
              className="dropdown-item"
              onMouseDown={() => handleSelect(p)}
            >
              <PlayerAvatar player={p} size={30} />
              <div>
                <div className="di-name">{p.longName || p.Name}</div>
                <div className="di-sub">
                  {p.longBattingStyles} •{" "}
                  {p.longBowlingStyles !== "Na" ? p.longBowlingStyles : "Bat"}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}