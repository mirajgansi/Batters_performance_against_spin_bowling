// ─── Design tokens ────────────────────────────────────────────────────────────
export const G = {
  green:      "#1a7340",
  greenLight: "#e8f5ee",
  greenMid:   "#2da060",
  accent:     "#f97316",
  accentLight:"#fff7ed",
  blue:       "#1e40af",
  blueLight:  "#eff6ff",
  red:        "#dc2626",
  redLight:   "#fef2f2",
  amber:      "#d97706",
  amberLight: "#fffbeb",
  gray50:     "#f9fafb",
  gray100:    "#f3f4f6",
  gray200:    "#e5e7eb",
  gray300:    "#d1d5db",
  gray400:    "#9ca3af",
  gray500:    "#6b7280",
  gray600:    "#4b5563",
  gray700:    "#374151",
  gray800:    "#1f2937",
  gray900:    "#111827",
  white:      "#ffffff",
};

export const PIE_COLORS   = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#9ca3af"];
export const CHART_COLORS = ["#1a7340", "#f97316", "#3b82f6", "#8b5cf6", "#ef4444"];

// ─── Spin type options (values must match encoder_spin classes in Flask) ───────
export const SPIN_TYPE_OPTIONS = [
  { value: "right-arm offbreak",     label: "Off Spin",            short: "OB"  },
  { value: "slow left-arm orthodox", label: "Left Arm Orthodox",   short: "SLA" },
  { value: "legbreak",               label: "Leg Spin",            short: "LB"  },
  { value: "legbreak googly",        label: "Leg Spin (Googly)",   short: "LBG" },
  { value: "left-arm wrist-spin",    label: "Left Arm Wrist Spin", short: "LWS" },
];

// ─── Phase options (values must match encoder_phase classes in Flask) ─────────
export const PHASE_OPTIONS = [
  { value: "Powerplay", label: "Powerplay"    },
  { value: "Middle",    label: "Middle Overs" },
  { value: "Death",     label: "Death Overs"  },
];
