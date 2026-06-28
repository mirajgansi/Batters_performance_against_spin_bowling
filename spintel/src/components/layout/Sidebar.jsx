import { Icon } from "@iconify/react";
import { G } from "../../utils/tokens";

const NAV_ITEMS = [
  { id: "dashboard",  label: "Analysis Dashboard", icon: "solar:chart-2-bold-duotone" },
  { id: "prediction", label: "Match Prediction",   icon: "solar:magic-stick-3-bold-duotone" },
];

export function Sidebar({ page, setPage, collapsed, setCollapsed }) {
  return (
    <aside style={{
      width: collapsed ? 60 : 230, background: G.gray900, flexShrink: 0,
      display: "flex", flexDirection: "column", transition: "width 0.2s",
      position: "sticky", top: 0, height: "100vh", overflow: "hidden",
    }}>
      {/* Logo */}
      <div style={{
        padding: collapsed ? "20px 0" : "20px 16px",
        borderBottom: `1px solid ${G.gray700}`,
        display: "flex", alignItems: "center", gap: 10,
        justifyContent: collapsed ? "center" : "flex-start",
      }}>
        <Icon icon="solar:cricket-bold-duotone" width={26} color={G.green} />
        {!collapsed && (
          <div>
            <div style={{
              color: G.white, fontWeight: 700, fontSize: 16,
              fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.5,
            }}>
              SpinIQ
            </div>
            <div style={{
              color: G.green, fontSize: 10, fontWeight: 600,
              textTransform: "uppercase", letterSpacing: 1,
            }}>
              IPL Analytics
            </div>
          </div>
        )}
      </div>

      {/* Nav label */}
      {!collapsed && (
        <div style={{
          padding: "8px 16px", fontSize: 10, color: G.gray500,
          fontWeight: 600, textTransform: "uppercase",
          letterSpacing: 1.2, marginTop: 8,
        }}>
          Navigation
        </div>
      )}

      {/* Nav items */}
      <nav style={{ flex: 1, padding: "4px 8px" }}>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => setPage(item.id)}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 12,
              padding: collapsed ? "11px" : "11px 12px", borderRadius: 8, border: "none",
              background: page === item.id ? G.green : "transparent",
              color: page === item.id ? G.white : G.gray400,
              cursor: "pointer", fontSize: 13, fontWeight: 600,
              fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 0.3,
              marginBottom: 2, justifyContent: collapsed ? "center" : "flex-start",
              transition: "all 0.15s",
            }}
          >
            <Icon icon={item.icon} width={18} />
            {!collapsed && item.label}
          </button>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          margin: "0 8px 16px", padding: "10px",
          background: G.gray800, border: "none", borderRadius: 8,
          color: G.gray400, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.15s",
        }}
      >
        <Icon icon={collapsed ? "solar:alt-arrow-right-bold" : "solar:alt-arrow-left-bold"} width={16} />
      </button>
    </aside>
  );
}
