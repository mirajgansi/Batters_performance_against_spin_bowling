    const NAV_ITEMS = [
  { id: "profile", icon: "👤", label: "Player Profile" },
  { id: "analysis", icon: "📊", label: "Spin Analysis" },
  { id: "prediction", icon: "🔮", label: "Match Prediction" },
  { id: "compare", icon: "⚡", label: "Spin Types" },
];

export function Sidebar({ activeTab, setActiveTab }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-icon">🏏</div>
        <div>
          <div className="logo-text">Spinners</div>
          <div className="logo-sub">Analytics</div>
        </div>
      </div>

      <div className="nav-section">
        <div className="nav-label">Dashboard</div>
        {NAV_ITEMS.map((item) => (
          <div
            key={item.id}
            className={`nav-item${activeTab === item.id ? " active" : ""}`}
            onClick={() => setActiveTab(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </div>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      <div
        style={{
          padding: "0 20px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          paddingTop: 16,
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: "#4E5A6E",
            fontFamily: "'DM Mono', monospace",
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Data
        </div>
        <div style={{ fontSize: 12, color: "#8A95A8", marginTop: 4 }}>
          2025 IPL Season
        </div>
        <div style={{ fontSize: 11, color: "#4E5A6E", marginTop: 2 }}>
          261 players • 5 spin types
        </div>
      </div>
    </aside>
  );
}