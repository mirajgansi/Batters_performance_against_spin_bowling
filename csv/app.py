"""
🏏 IPL Spin Predictor — Redesigned UI v5.0
Changes from v4.1:
  - Single page: predict + verify in one flow (no Team vs Team tab)
  - Removed tabs entirely — sidebar controls, main panel shows results
  - Prediction and verification live on same scrollable page
  - Cleaner card-based layout with better visual hierarchy
  - All v4.1 bug fixes retained
"""

import re
import streamlit as st
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import seaborn as sns
import os, json, glob, warnings
from datetime import datetime
warnings.filterwarnings("ignore")

st.set_page_config(
    page_title="IPL Spin Predictor",
    page_icon="🏏",
    layout="wide",
    initial_sidebar_state="expanded"
)

# ─── DESIGN SYSTEM ─────────────────────────────────────────────────────────────
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500&family=Inter:wght@300;400;500&display=swap');

:root {
  --ink: #0e0e12;
  --paper: #f7f5f0;
  --cream: #eeebe3;
  --gold: #c8973a;
  --gold-light: #f0d490;
  --gold-dim: rgba(200,151,58,.15);
  --amber: #e07b2a;
  --red: #c0392b;
  --green: #1a7a4a;
  --slate: #6b6e7a;
  --border: rgba(14,14,18,.12);
  --panel: #ffffff;
  --panel2: #f9f8f5;
}

html, body, [class*="css"] {
  font-family: 'Inter', sans-serif;
  background-color: var(--paper) !important;
  color: var(--ink);
}

/* ── Sidebar ── */
section[data-testid="stSidebar"] {
  background: var(--ink) !important;
  border-right: none !important;
  width: 300px !important;
}
section[data-testid="stSidebar"] * { color: var(--paper) !important; }
section[data-testid="stSidebar"] .stSelectbox > div > div,
section[data-testid="stSidebar"] .stNumberInput > div > div > input {
  background: rgba(247,245,240,.08) !important;
  border: 1px solid rgba(247,245,240,.15) !important;
  border-radius: 6px !important;
  color: var(--paper) !important;
}
section[data-testid="stSidebar"] label { color: rgba(247,245,240,.6) !important; font-size:.78rem !important; }
section[data-testid="stSidebar"] .stSlider [data-testid="stTickBar"] { display: none; }

/* ── Main area ── */
.main { background: var(--paper) !important; padding-top: 0 !important; }
.block-container { padding: 2rem 2.5rem !important; max-width: 1100px !important; }

/* ── Typography ── */
.page-title {
  font-family: 'Syne', sans-serif;
  font-weight: 800;
  font-size: 2.8rem;
  letter-spacing: -.03em;
  color: var(--ink);
  line-height: 1;
  margin: 0;
}
.page-sub {
  font-family: 'DM Mono', monospace;
  font-size: .72rem;
  color: var(--slate);
  letter-spacing: .18em;
  text-transform: uppercase;
  margin-top: 6px;
}
.section-label {
  font-family: 'DM Mono', monospace;
  font-size: .68rem;
  letter-spacing: .2em;
  text-transform: uppercase;
  color: var(--slate);
  margin-bottom: 10px;
}

/* ── Cards ── */
.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1.25rem 1.5rem;
  margin-bottom: .9rem;
}
.card-accent {
  background: var(--ink);
  border-radius: 12px;
  padding: 1.4rem 1.5rem;
  margin-bottom: .9rem;
  color: var(--paper);
}
.stat-block {
  background: var(--panel2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: .9rem 1rem;
  text-align: center;
}
.stat-num {
  font-family: 'Syne', sans-serif;
  font-size: 2rem;
  font-weight: 700;
  color: var(--ink);
  line-height: 1;
}
.stat-num-gold {
  font-family: 'Syne', sans-serif;
  font-size: 2rem;
  font-weight: 700;
  color: var(--gold);
  line-height: 1;
}
.stat-num-red {
  font-family: 'Syne', sans-serif;
  font-size: 2rem;
  font-weight: 700;
  color: var(--red);
  line-height: 1;
}
.stat-num-green {
  font-family: 'Syne', sans-serif;
  font-size: 2rem;
  font-weight: 700;
  color: var(--green);
  line-height: 1;
}
.stat-label {
  font-size: .7rem;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: var(--slate);
  margin-top: 3px;
}

/* ── Batter card ── */
.bcard {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 1.1rem 1.3rem;
  margin-bottom: .6rem;
  position: relative;
  overflow: hidden;
}
.bcard-name {
  font-family: 'Syne', sans-serif;
  font-weight: 700;
  font-size: 1rem;
  color: var(--ink);
}
.bcard-meta {
  font-size: .72rem;
  color: var(--slate);
  font-family: 'DM Mono', monospace;
  letter-spacing: .05em;
}

/* ── Confidence badges ── */
.badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 20px;
  font-size: .68rem;
  font-weight: 500;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.badge-high { background: rgba(26,122,74,.1); color: var(--green); border: 1px solid rgba(26,122,74,.25); }
.badge-medium { background: rgba(200,151,58,.1); color: var(--gold); border: 1px solid rgba(200,151,58,.3); }
.badge-low { background: rgba(192,57,43,.08); color: var(--red); border: 1px solid rgba(192,57,43,.2); }

/* ── Verdict strip ── */
.verdict-strong { border-left: 3px solid var(--green); background: rgba(26,122,74,.05); border-radius: 0 6px 6px 0; padding: .5rem .8rem; font-size: .83rem; color: var(--ink); }
.verdict-solid { border-left: 3px solid var(--gold); background: rgba(200,151,58,.07); border-radius: 0 6px 6px 0; padding: .5rem .8rem; font-size: .83rem; color: var(--ink); }
.verdict-risk { border-left: 3px solid var(--red); background: rgba(192,57,43,.06); border-radius: 0 6px 6px 0; padding: .5rem .8rem; font-size: .83rem; color: var(--ink); }

/* ── Verify strips ── */
.verify-hit { border-left: 3px solid var(--green); background: rgba(26,122,74,.05); border-radius: 0 8px 8px 0; padding: .7rem 1rem; margin: .35rem 0; }
.verify-close { border-left: 3px solid var(--gold); background: rgba(200,151,58,.07); border-radius: 0 8px 8px 0; padding: .7rem 1rem; margin: .35rem 0; }
.verify-miss { border-left: 3px solid var(--red); background: rgba(192,57,43,.06); border-radius: 0 8px 8px 0; padding: .7rem 1rem; margin: .35rem 0; }
.badge-hit { background: rgba(26,122,74,.12); color: var(--green); border: 1px solid rgba(26,122,74,.3); }
.badge-close { background: rgba(200,151,58,.12); color: var(--gold); border: 1px solid rgba(200,151,58,.3); }
.badge-miss { background: rgba(192,57,43,.1); color: var(--red); border: 1px solid rgba(192,57,43,.25); }

/* ── Progress bar ── */
.bar-track { background: var(--cream); border-radius: 4px; height: 6px; overflow: hidden; margin: 4px 0; }
.bar-fill-green { background: var(--green); height: 100%; border-radius: 4px; }
.bar-fill-amber { background: var(--gold); height: 100%; border-radius: 4px; }
.bar-fill-red { background: var(--red); height: 100%; border-radius: 4px; }

/* ── Info box ── */
.info-box {
  background: var(--cream);
  border-radius: 8px;
  padding: .75rem 1rem;
  font-size: .83rem;
  color: var(--slate);
  margin: .5rem 0;
}

/* ── Divider ── */
hr { border: none; border-top: 1px solid var(--border) !important; margin: 1.5rem 0 !important; }

/* ── Buttons ── */
.stButton > button {
  background: var(--ink) !important;
  color: var(--paper) !important;
  font-family: 'Syne', sans-serif !important;
  font-weight: 600 !important;
  font-size: .88rem !important;
  letter-spacing: .04em !important;
  border: none !important;
  border-radius: 8px !important;
  padding: .55rem 1.6rem !important;
  width: 100% !important;
  transition: opacity .18s !important;
}
.stButton > button:hover { opacity: .85 !important; }

/* ── Venue pill ── */
.venue-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--gold-dim);
  border: 1px solid rgba(200,151,58,.25);
  border-radius: 20px;
  padding: 3px 12px;
  font-size: .75rem;
  color: var(--gold);
  font-family: 'DM Mono', monospace;
}

/* ── Dismiss bar ── */
.dismiss-label {
  font-family: 'DM Mono', monospace;
  font-size: .65rem;
  color: var(--slate);
  letter-spacing: .1em;
  text-transform: uppercase;
  margin-bottom: 3px;
}

/* ── Sidebar heading ── */
.sb-title {
  font-family: 'Syne', sans-serif;
  font-weight: 700;
  font-size: 1.15rem;
  color: var(--paper);
  letter-spacing: -.01em;
}
.sb-gold-line {
  width: 28px;
  height: 3px;
  background: var(--gold);
  border-radius: 2px;
  margin: 6px 0 16px;
}
.sb-stat {
  font-family: 'DM Mono', monospace;
  font-size: .72rem;
  color: rgba(247,245,240,.5);
  padding: 2px 0;
}
</style>
""", unsafe_allow_html=True)

# ─── CONSTANTS ─────────────────────────────────────────────────────────────────
SPIN_TYPES = [
    "right-arm offbreak", "legbreak", "legbreak googly",
    "slow left-arm orthodox", "left-arm wrist-spin"
]
SPIN_SHORT = {
    "right-arm offbreak": "RAO",
    "slow left-arm orthodox": "SLA",
    "legbreak googly": "LBG",
    "legbreak": "LB",
    "left-arm wrist-spin": "Chinaman"
}
TEAM_ALIAS = {
    "Kings XI Punjab": "Punjab Kings",
    "Delhi Daredevils": "Delhi Capitals",
    "Royal Challengers Bangalore": "Royal Challengers Bengaluru",
    "Deccan Chargers": "Sunrisers Hyderabad"
}
PREDICTIONS_FILE = "saved_predictions.csv"
PHASE_BALLS = {"powerplay": 18, "middle": 24, "death": 18}
PHASE_LABEL = {
    "powerplay": "Powerplay (1–6)",
    "middle": "Middle (7–15)",
    "death": "Death (16–20)"
}

# Matplotlib theme
DARK_BG = "#0e0e12"
MID_BG  = "#1a1a22"
GOLD    = "#c8973a"
AMBER   = "#e07b2a"
SLATE   = "#6b6e7a"
GREEN   = "#1a7a4a"
RED     = "#c0392b"
PAPER   = "#f7f5f0"


# ─── HELPERS ───────────────────────────────────────────────────────────────────
def is_valid_actual(val):
    if val is None: return False
    s = str(val).strip()
    if s in ("", "nan", "NaN", "None", "nat", "NaT"): return False
    try: float(s); return True
    except ValueError: return False

def find_csv_folder():
    candidates = [".", "./data", os.path.dirname(__file__),
                  os.path.expanduser("~/data"), "/mnt/user-data/uploads"]
    needed = {"Ball_By_Ball_Match_Data.csv", "2024_players_details.csv", "Match_Info.csv"}
    for f in candidates:
        if all(os.path.exists(os.path.join(f, n)) for n in needed):
            return f
    return None

# ─── DATA LOADING ──────────────────────────────────────────────────────────────
@st.cache_data(show_spinner="Loading data…")
def load_data(folder):
    balls   = pd.read_csv(os.path.join(folder, "Ball_By_Ball_Match_Data.csv"))
    players = pd.read_csv(os.path.join(folder, "2024_players_details.csv"))
    matches = pd.read_csv(os.path.join(folder, "Match_Info.csv"))
    for df in [balls, players, matches]:
        df.columns = df.columns.str.strip()
    players["longBowlingStyles"] = players["longBowlingStyles"].replace("Na", np.nan)
    spin_map = {r["Name"]: r["longBowlingStyles"] for _, r in players.iterrows()
                if r["longBowlingStyles"] in SPIN_TYPES}
    matches["match_date"] = pd.to_datetime(matches["match_date"], errors="coerce")
    matches["season"]     = matches["match_date"].dt.year
    id_col       = next((c for c in matches.columns if "match" in c.lower() and "number" in c.lower()), matches.columns[0])
    balls_id_col = "ID" if "ID" in balls.columns else balls.columns[0]
    balls = balls.merge(
        matches[[id_col, "season", "venue"]].rename(columns={id_col: balls_id_col}),
        on=balls_id_col, how="left"
    )
    for col in ["BattingTeam", "batting_team"]:
        if col in balls.columns:
            balls[col] = balls[col].replace(TEAM_ALIAS)
    extra_col = next((c for c in balls.columns if "extra" in c.lower() and "type" in c.lower()), None)
    legal = balls[~balls[extra_col].isin(["wides", "noballs"])].copy() if extra_col else balls.copy()
    spin_df = legal[legal["Bowler"].isin(spin_map)].copy()
    spin_df["spin_type"] = spin_df["Bowler"].map(spin_map)
    pc = "Overs" if "Overs" in spin_df.columns else "overs"
    spin_df["phase"] = pd.cut(spin_df[pc], bins=[-1, 5, 14, 19],
                               labels=["powerplay", "middle", "death"])
    return balls, players, matches, spin_df, spin_map

@st.cache_data(show_spinner="Computing batter features…")
def build_batter_features(_spin_df):
    rc = "BatsmanRun" if "BatsmanRun" in _spin_df.columns else "batsman_run"
    wc = "IsWicketDelivery" if "IsWicketDelivery" in _spin_df.columns else "is_wicket"
    bc = "Batter" if "Batter" in _spin_df.columns else "batter"
    bf = _spin_df.groupby(bc).agg(
        total_balls=(rc, "count"), total_runs=(rc, "sum"), dismissals=(wc, "sum"),
        dots=(rc, lambda x: (x == 0).sum()), fours=(rc, lambda x: (x == 4).sum()),
        sixes=(rc, lambda x: (x == 6).sum()), ones=(rc, lambda x: (x == 1).sum()),
        twos=(rc, lambda x: (x == 2).sum()),
    ).reset_index().rename(columns={bc: "Batter"})
    bf["sr"]           = bf["total_runs"] / bf["total_balls"] * 100
    bf["avg"]          = (bf["total_runs"] / bf["dismissals"].replace(0, np.nan)).fillna(bf["total_runs"])
    bf["dot_pct"]      = bf["dots"] / bf["total_balls"] * 100
    bf["boundary_pct"] = (bf["fours"] + bf["sixes"]) / bf["total_balls"] * 100
    bf["six_pct"]      = bf["sixes"] / bf["total_balls"] * 100
    bf["wkt_rate"]     = bf["dismissals"] / bf["total_balls"] * 100
    bf["rotation_pct"] = (bf["ones"] + bf["twos"]) / bf["total_balls"] * 100
    return bf[bf["total_balls"] >= 10].reset_index(drop=True)

@st.cache_data(show_spinner="Computing venue features…")
def build_venue_features(_spin_df):
    rc = "BatsmanRun" if "BatsmanRun" in _spin_df.columns else "batsman_run"
    wc = "IsWicketDelivery" if "IsWicketDelivery" in _spin_df.columns else "is_wicket"
    if "venue" not in _spin_df.columns:
        return pd.DataFrame(columns=["venue", "venue_spin_wkt_rate", "venue_spin_economy"])
    vf = _spin_df.groupby("venue").agg(
        venue_spin_wkt_rate=(wc, "mean"),
        venue_spin_economy=(rc, "mean"),
        count=(rc, "count")
    ).reset_index()
    return vf[vf["count"] >= 50].drop(columns="count")

@st.cache_data(show_spinner="Building team rosters…")
def build_team_rosters(_balls, _players):
    bc  = "Batter"      if "Batter"      in _balls.columns else "batter"
    tc  = "BattingTeam" if "BattingTeam" in _balls.columns else "batting_team"
    bwc = "Bowler"      if "Bowler"      in _balls.columns else "bowler"
    team_batters = (_balls[[tc, bc]].dropna().drop_duplicates()
                    .groupby(tc)[bc].apply(list).to_dict())
    spin_names = set(_players[_players["longBowlingStyles"].isin(SPIN_TYPES)]["Name"])
    style_map  = dict(zip(_players["Name"], _players["longBowlingStyles"]))
    if "BowlingTeam" in _balls.columns:
        raw = (_balls[_balls[bwc].isin(spin_names)][["BowlingTeam", bwc]]
               .drop_duplicates().groupby("BowlingTeam")[bwc].apply(list).to_dict())
    else:
        raw = {}
        for team in team_batters:
            bvs = _balls[_balls[tc] == team][bwc].unique()
            raw[team] = [b for b in bvs if b in spin_names]
    team_spin_bowlers = {t: {s: style_map[s] for s in sp if s in style_map} for t, sp in raw.items()}
    return team_batters, team_spin_bowlers


# ─── PREDICTION ENGINE ─────────────────────────────────────────────────────────
def get_batter_row(bf, name):
    row = bf[bf["Batter"] == name]
    if row.empty:
        return bf[bf["total_balls"] >= 30].mean(numeric_only=True), False
    return row.iloc[0], True

def predict_batter(batter_name, spin_type, phase, n_balls, venue, bf, vf):
    stats, found = get_batter_row(bf, batter_name)
    pf   = {"powerplay": 0.82, "middle": 1.0, "death": 1.15}.get(phase, 1.0)
    sd   = {"legbreak googly": 0.91, "left-arm wrist-spin": 0.88,
            "right-arm offbreak": 1.0, "legbreak": 0.95, "slow left-arm orthodox": 0.97}
    diff = sd.get(spin_type, 1.0)
    avg_wkt = vf["venue_spin_wkt_rate"].mean() if not vf.empty else 0.055
    avg_eco = vf["venue_spin_economy"].mean()  if not vf.empty else 1.35
    vrow    = vf[vf["venue"] == venue] if not vf.empty else pd.DataFrame()
    v_wkt   = float(vrow["venue_spin_wkt_rate"].values[0]) if not vrow.empty else avg_wkt
    v_eco   = float(vrow["venue_spin_economy"].values[0])  if not vrow.empty else avg_eco
    adj_sr    = float(stats["sr"]) * diff * pf * (v_eco / avg_eco)
    pred_runs = round((adj_sr / 100) * n_balls, 1)
    base_wkt  = float(stats["wkt_rate"]) / 100
    adj_wkt   = base_wkt / diff * (v_wkt / avg_wkt)
    nb   = int(stats["total_balls"])
    conf = "LOW" if not found else "HIGH" if nb >= 100 else "MEDIUM" if nb >= 30 else "LOW"
    return {
        "batter": batter_name, "spin_type": spin_type, "phase": phase,
        "predicted_sr": round(adj_sr, 1), "predicted_runs": pred_runs,
        "expected_runs": round(pred_runs * (1 - adj_wkt), 1),
        "dismissal_prob_pct": round(adj_wkt * 100, 2),
        "dismiss_in_spell_pct": round((1 - (1 - adj_wkt) ** n_balls) * 100, 1),
        "confidence": conf,
        "hist_sr": round(float(stats["sr"]), 1),
        "hist_avg": round(float(stats["avg"]), 1),
        "dot_pct": round(float(stats["dot_pct"]), 1),
        "boundary_pct": round(float(stats["boundary_pct"]), 1),
        "total_balls": nb
    }

def monte_carlo(batter_name, spin_type, phase, n_balls, venue, bf, vf, spin_df, n_sim=1000):
    pred      = predict_batter(batter_name, spin_type, phase, n_balls, venue, bf, vf)
    dism_prob = pred["dismissal_prob_pct"] / 100
    rc  = "BatsmanRun" if "BatsmanRun" in spin_df.columns else "batsman_run"
    brc = "Batter"     if "Batter"     in spin_df.columns else "batter"
    dist = spin_df[spin_df[brc] == batter_name][rc].values
    if len(dist) < 20:
        dist = spin_df[rc].values
    np.random.seed(42)
    totals = []
    for _ in range(n_sim):
        total = 0
        for _ in range(n_balls):
            if np.random.random() < dism_prob: break
            total += int(np.random.choice(dist))
        totals.append(total)
    return np.array(totals), pred


# ─── PERSISTENCE ───────────────────────────────────────────────────────────────
def load_saved_predictions(folder):
    path = os.path.join(folder, PREDICTIONS_FILE)
    if os.path.exists(path):
        return pd.read_csv(path, dtype=str)
    return pd.DataFrame(columns=[
        "saved_at", "match_label", "batter", "bowling_team",
        "spin_type", "phase", "venue", "n_balls",
        "predicted_runs", "predicted_sr", "expected_runs",
        "dismiss_in_spell_pct", "confidence",
        "actual_runs", "actual_dismissed", "verified_at"
    ])

def save_prediction(folder, row_dict):
    path = os.path.join(folder, PREDICTIONS_FILE)
    df   = load_saved_predictions(folder)
    df   = pd.concat([df, pd.DataFrame([row_dict])], ignore_index=True)
    df.to_csv(path, index=False)

def update_actual(folder, idx, actual_runs, actual_dismissed):
    path = os.path.join(folder, PREDICTIONS_FILE)
    df   = pd.read_csv(path, dtype=str)
    df.at[idx, "actual_runs"]      = str(actual_runs)
    df.at[idx, "actual_dismissed"] = str(actual_dismissed)
    df.at[idx, "verified_at"]      = datetime.now().strftime("%Y-%m-%d %H:%M")
    df.to_csv(path, index=False)

def get_actual_runs_from_json(json_folder, batter_name, match_label):
    if not json_folder or not os.path.isdir(json_folder):
        return None, None
    label_lower = match_label.lower()
    words = [w for w in re.split(r'\W+', label_lower) if len(w) >= 4]
    for fp in sorted(glob.glob(os.path.join(json_folder, "*.json"))):
        try:
            with open(fp, encoding="utf-8") as f:
                m = json.load(f)
        except Exception:
            continue
        teams = [t.lower() for t in m.get("info", {}).get("teams", [])]
        if not any(w in team or team in label_lower for w in words for team in teams):
            continue
        batter_runs = 0; batter_found = False; was_dismissed = False
        bl = batter_name.lower()
        for inn in m.get("innings", []):
            for od in inn.get("overs", []):
                for ball in od.get("deliveries", []):
                    if ball.get("batter", "").lower() == bl:
                        batter_found = True
                        batter_runs += ball.get("runs", {}).get("batter", 0)
                        for w in ball.get("wickets", []):
                            if w.get("player_out", "").lower() == bl:
                                was_dismissed = True
        if batter_found:
            return batter_runs, was_dismissed
    return None, None


# ─── CHARTS ────────────────────────────────────────────────────────────────────
def _fig_light(fig, axes):
    fig.patch.set_facecolor(PAPER)
    for ax in axes:
        ax.set_facecolor("#f0ede5")
        ax.tick_params(colors="#6b6e7a", labelsize=8)
        ax.xaxis.label.set_color("#6b6e7a")
        ax.yaxis.label.set_color("#6b6e7a")
        ax.title.set_color("#0e0e12")
        for s in ax.spines.values():
            s.set_edgecolor("#e0ddd5")

def plot_radar(stats_row, batter_name):
    cats   = ["SR", "Avg", "Boundary%", "Rotation%", "Dot%*"]
    maxes  = [170, 55, 35, 45, 50]
    mins   = [60, 5, 3, 10, 20]
    vals   = [float(stats_row["sr"]), float(stats_row["avg"]),
               float(stats_row["boundary_pct"]), float(stats_row["rotation_pct"]),
               float(stats_row["dot_pct"])]
    normed = [(v - mn) / max(mx - mn, 1) for v, mn, mx in zip(vals, mins, maxes)]
    normed[-1] = 1 - normed[-1]
    np_ = normed + [normed[0]]
    angles = [n / float(len(cats)) * 2 * np.pi for n in range(len(cats))] + [0]
    fig, ax = plt.subplots(figsize=(3.5, 3.5), subplot_kw=dict(polar=True))
    fig.patch.set_facecolor(PAPER)
    ax.set_facecolor("#f0ede5")
    ax.plot(angles, np_, "o-", color=GOLD, linewidth=2)
    ax.fill(angles, np_, alpha=0.2, color=GOLD)
    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(cats, color=SLATE, size=8)
    ax.set_ylim(0, 1)
    ax.set_yticks([.25, .5, .75, 1])
    ax.set_yticklabels(["25", "50", "75", "100"], color=SLATE, size=6)
    ax.grid(color="#d8d5cd", linewidth=0.5)
    ax.tick_params(colors=SLATE)
    ax.set_title(f"{batter_name}\nvs Spin", color=DARK_BG, size=9, pad=10)
    plt.tight_layout()
    return fig

def plot_monte_carlo(totals, batter_name, n_balls):
    fig, ax = plt.subplots(figsize=(6, 3))
    _fig_light(fig, [ax])
    ax.hist(totals, bins=25, color=GOLD, alpha=0.75, edgecolor=PAPER, linewidth=0.5)
    ax.axvline(totals.mean(), color=AMBER, linestyle="--", lw=2,
               label=f"Mean: {totals.mean():.1f}")
    ax.axvline(np.percentile(totals, 10), color=RED, linestyle=":", lw=1.5,
               label=f"P10: {np.percentile(totals, 10):.1f}")
    ax.axvline(np.percentile(totals, 90), color=GREEN, linestyle=":", lw=1.5,
               label=f"P90: {np.percentile(totals, 90):.1f}")
    ax.set_xlabel(f"Runs in {n_balls} balls", color=SLATE, size=8)
    ax.set_ylabel("Simulations", color=SLATE, size=8)
    ax.set_title(f"Monte Carlo — 1000 simulations", color=DARK_BG, size=9)
    ax.legend(facecolor="#f0ede5", edgecolor="#d8d5cd", labelcolor=SLATE, fontsize=8)
    plt.tight_layout()
    return fig

def plot_accuracy_summary(df_ver):
    counts = df_ver["result"].value_counts().reindex(
        ["Hit ✅", "Close ⚠️", "Miss ❌"], fill_value=0)
    fig, ax = plt.subplots(figsize=(4, 2.8))
    _fig_light(fig, [ax])
    colors = [GREEN, GOLD, RED]
    bars = ax.bar(["Hit\n(±3)", "Close\n(±7)", "Miss"], counts.values,
                  color=colors, width=0.55, edgecolor=PAPER, linewidth=0.5)
    for bar, v in zip(bars, counts.values):
        ax.text(bar.get_x() + bar.get_width() / 2, v + 0.05, str(v),
                ha="center", va="bottom", color=SLATE, fontsize=9)
    ax.set_title("Accuracy breakdown", color=DARK_BG, size=9)
    ax.set_ylabel("Count", color=SLATE, size=8)
    plt.tight_layout()
    return fig

def plot_pred_vs_actual(df_ver):
    fig, ax = plt.subplots(figsize=(5, 3.5))
    _fig_light(fig, [ax])
    ax.scatter(df_ver["predicted_runs"], df_ver["actual_runs"],
               color=GOLD, alpha=0.85, edgecolors="#d8d5cd", s=70)
    mx = max(df_ver["predicted_runs"].max(), df_ver["actual_runs"].max()) + 2
    ax.plot([0, mx], [0, mx], color=SLATE, linestyle="--", lw=1, label="Perfect")
    for _, row in df_ver.iterrows():
        ax.annotate(str(row["batter"]).split()[-1],
                    (row["predicted_runs"], row["actual_runs"]),
                    fontsize=7, color=SLATE, xytext=(3, 3), textcoords="offset points")
    ax.set_xlabel("Predicted runs", color=SLATE, size=8)
    ax.set_ylabel("Actual runs", color=SLATE, size=8)
    ax.set_title("Predicted vs Actual", color=DARK_BG, size=9)
    ax.legend(facecolor="#f0ede5", edgecolor="#d8d5cd", labelcolor=SLATE, fontsize=8)
    plt.tight_layout()
    return fig


# ─── MAIN ──────────────────────────────────────────────────────────────────────
def main():
    # ── Data bootstrap ──────────────────────────────────────────────────────
    folder = find_csv_folder()
    if folder is None:
        st.markdown('<div class="page-title">🏏 IPL Spin Predictor</div>', unsafe_allow_html=True)
        st.error("Could not locate the 3 CSV files automatically.")
        folder = st.text_input("Folder path containing CSV files",
                                placeholder="/path/to/your/data")
        if not folder: st.stop()
        if not os.path.isdir(folder): st.error("Path does not exist."); st.stop()
        needed  = {"Ball_By_Ball_Match_Data.csv", "2024_players_details.csv", "Match_Info.csv"}
        missing = [f for f in needed if not os.path.exists(os.path.join(folder, f))]
        if missing: st.error(f"Missing: {missing}"); st.stop()

    balls, players, matches, spin_df, spin_map = load_data(folder)
    bf = build_batter_features(spin_df)
    vf = build_venue_features(spin_df)
    team_batters, team_spin_bowlers = build_team_rosters(balls, players)

    all_batters = sorted(bf["Batter"].unique())
    all_venues  = (sorted(vf["venue"].unique()) if not vf.empty
                   else sorted(balls["venue"].dropna().unique() if "venue" in balls.columns else []))
    all_teams   = sorted(team_batters.keys())

    # ── Sidebar ─────────────────────────────────────────────────────────────
    with st.sidebar:
        st.markdown("""
        <div class="sb-title">🏏 IPL Spin<br>Predictor</div>
        <div class="sb-gold-line"></div>
        """, unsafe_allow_html=True)

        st.markdown("**Match Setup**")
        venue = st.selectbox("Venue", all_venues, key="venue") if all_venues else "Unknown"
        phase = st.selectbox(
            "Phase",
            ["powerplay", "middle", "death"],
            index=1,
            format_func=lambda x: PHASE_LABEL[x],
            key="phase"
        )
        spin_type = st.selectbox("Spin type", SPIN_TYPES, key="spin_type")
        n_balls   = st.slider("Balls in spell", 4, 24, 12, 2, key="n_balls")
        innings   = st.selectbox("Innings", [1, 2],
                                  format_func=lambda x: "1st innings" if x == 1 else "2nd innings (chase)",
                                  key="innings")
        st.markdown("---")

        st.markdown("**Teams**")
        batting_team = st.selectbox("Batting team", all_teams, key="bat_team")
        bowling_team = st.selectbox("Bowling team", all_teams, key="bowl_team")
        spinners     = team_spin_bowlers.get(bowling_team, {})
        primary_spin = list(spinners.values())[0] if spinners else spin_type

        st.markdown("---")
        st.markdown("**Dataset**")
        st.markdown(f"""
        <div class="sb-stat">Spin deliveries: <b>{len(spin_df):,}</b></div>
        <div class="sb-stat">Unique batters: <b>{len(all_batters)}</b></div>
        <div class="sb-stat">Spin bowlers: <b>{len(spin_map)}</b></div>
        <div class="sb-stat">Venues: <b>{len(all_venues)}</b></div>
        """, unsafe_allow_html=True)

        if not vf.empty and venue != "Unknown":
            vrow = vf[vf["venue"] == venue]
            if not vrow.empty:
                wkt_r = float(vrow["venue_spin_wkt_rate"].values[0])
                eco   = float(vrow["venue_spin_economy"].values[0])
                lbl   = ("Spin friendly" if wkt_r > 0.062
                          else "Neutral" if wkt_r > 0.05
                          else "Batting friendly")
                st.markdown("---")
                st.markdown(f"""<div style="background:rgba(200,151,58,.1);border:1px solid rgba(200,151,58,.2);
                    border-radius:8px;padding:.7rem .9rem;font-size:.75rem;color:rgba(247,245,240,.8);">
                    <b style="color:{GOLD};">{lbl}</b><br>
                    Wkt rate: <b>{wkt_r*100:.1f}%</b><br>
                    Economy: <b>{eco:.3f}</b>/ball</div>""", unsafe_allow_html=True)

        st.markdown("---")
        st.markdown("**Match label** (for saving)")
        match_label = st.text_input(
            "e.g. SRH vs RCB",
            placeholder="Sunrisers Hyderabad vs Royal Challengers Bengaluru",
            label_visibility="collapsed",
            key="match_label"
        )

    # ── Page header ─────────────────────────────────────────────────────────
    st.markdown("""
    <div class="page-title">IPL Spin Predictor</div>
    <div class="page-sub">Ball-by-ball analytics · Cricsheet JSON · v5.0</div>
    """, unsafe_allow_html=True)
    st.markdown("---")

    # ── Batter selector + predict ────────────────────────────────────────────
    tbats = [b for b in team_batters.get(batting_team, []) if b in all_batters]

    col_sel, col_btn = st.columns([3, 1])
    with col_sel:
        selected_xi = st.multiselect(
            f"Select batters from {batting_team}",
            tbats,
            default=tbats[:6],
            max_selections=11,
            key="selected_xi",
            placeholder="Choose batters…"
        )
    with col_btn:
        st.markdown("<div style='margin-top:1.7rem;'></div>", unsafe_allow_html=True)
        run_pred = st.button("▶ Run Predictions", key="run_pred")

    # Spinner availability info
    if spinners:
        pills = " ".join(
            f'<span style="display:inline-block;background:rgba(200,151,58,.08);'
            f'border:1px solid rgba(200,151,58,.2);border-radius:16px;'
            f'padding:2px 10px;font-size:.72rem;color:{GOLD};margin:2px;">'
            f'{b} — {SPIN_SHORT.get(t,t)}</span>'
            for b, t in list(spinners.items())[:6]
        )
        st.markdown(
            f'<div style="margin:.3rem 0 .8rem;font-size:.72rem;color:{SLATE};'
            f'font-family:DM Mono,monospace;letter-spacing:.08em;text-transform:uppercase;'
            f'margin-bottom:4px;">Spin options from {bowling_team}</div>{pills}',
            unsafe_allow_html=True
        )

    # ── PREDICTIONS ─────────────────────────────────────────────────────────
    if run_pred or st.session_state.get("preds_cache"):
        if run_pred:
            if not selected_xi:
                st.warning("Select at least one batter.")
                st.stop()
            inn_adj = 0.97 if innings == 2 else 1.0
            preds   = []
            for b in selected_xi:
                p = predict_batter(b, primary_spin, phase, n_balls, venue, bf, vf)
                p["predicted_sr"]   = round(p["predicted_sr"] * inn_adj, 1)
                p["predicted_runs"] = round(p["predicted_runs"] * inn_adj, 1)
                p["expected_runs"]  = round(p["expected_runs"] * inn_adj, 1)
                preds.append(p)
            st.session_state["preds_cache"] = preds
        else:
            preds = st.session_state["preds_cache"]

        # ── Team summary bar ─────────────────────────────────────────────
        avg_sr  = sum(p["predicted_sr"] for p in preds) / len(preds)
        avg_dis = sum(p["dismiss_in_spell_pct"] for p in preds) / len(preds)
        best_b  = max(preds, key=lambda p: p["predicted_sr"])
        risk_b  = max(preds, key=lambda p: p["dismiss_in_spell_pct"])

        st.markdown("---")
        sm1, sm2, sm3, sm4 = st.columns(4)
        for col, val, lbl, cls in [
            (sm1, f"{avg_sr:.0f}", "Avg strike rate", "stat-num"),
            (sm2, f"{sum(p['predicted_runs'] for p in preds):.0f}", "Total pred runs", "stat-num-gold"),
            (sm3, f"{avg_dis:.0f}%", "Avg dismissal risk", "stat-num-red"),
            (sm4, str(len(preds)), "Batters analysed", "stat-num"),
        ]:
            col.markdown(f"""<div class="stat-block">
                <div class="{cls}">{val}</div>
                <div class="stat-label">{lbl}</div>
            </div>""", unsafe_allow_html=True)

        st.markdown(f"""<div class="info-box" style="margin-top:.8rem;">
            🏆 <b>Most dangerous vs spin:</b> {best_b['batter']}
            — SR {best_b['predicted_sr']}, {best_b['predicted_runs']} pred runs&nbsp;&nbsp;·&nbsp;&nbsp;
            ⚠️ <b>Highest dismissal risk:</b> {risk_b['batter']}
            — {risk_b['dismiss_in_spell_pct']:.1f}% chance in spell
        </div>""", unsafe_allow_html=True)

        st.markdown("---")
        st.markdown(f'<div class="section-label">Batter breakdown · {PHASE_LABEL[phase]} · '
                    f'{SPIN_SHORT.get(primary_spin, primary_spin)} · {n_balls} balls</div>',
                    unsafe_allow_html=True)

        # ── Per-batter cards ─────────────────────────────────────────────
        for p in preds:
            sr_color  = GREEN  if p["predicted_sr"] >= 125 else GOLD if p["predicted_sr"] >= 100 else RED
            dis_color = GREEN  if p["dismiss_in_spell_pct"] < 25 else GOLD if p["dismiss_in_spell_pct"] < 50 else RED
            dis_pct   = min(p["dismiss_in_spell_pct"], 100)
            bar_color = ("bar-fill-green" if dis_pct < 25
                         else "bar-fill-amber" if dis_pct < 50
                         else "bar-fill-red")
            verdict_cls = ("verdict-strong" if p["predicted_sr"] >= 125
                           else "verdict-solid" if p["predicted_sr"] >= 100
                           else "verdict-risk")
            verdict_txt = ("🔥 Strong vs spin — expect aggressive play"
                           if p["predicted_sr"] >= 125
                           else "🟡 Solid vs spin — controlled batting likely"
                           if p["predicted_sr"] >= 100
                           else "❄️ Vulnerable vs spin — dot or wicket risk")
            badge_cls = {"HIGH": "badge-high", "MEDIUM": "badge-medium", "LOW": "badge-low"}[p["confidence"]]

            st.markdown(f"""
            <div class="bcard">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.75rem;">
                <div>
                  <div class="bcard-name">{p['batter']}</div>
                  <div class="bcard-meta">Historical SR vs spin: {p['hist_sr']} · {p['total_balls']} balls faced</div>
                </div>
                <span class="badge {badge_cls}">{p['confidence']} confidence</span>
              </div>

              <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:.85rem;">
                <div class="stat-block" style="flex:1;min-width:90px;padding:.7rem .9rem;">
                  <div style="font-family:'Syne',sans-serif;font-size:1.7rem;font-weight:700;
                    color:{sr_color};line-height:1;">{p['predicted_sr']}</div>
                  <div class="stat-label">Strike rate</div>
                </div>
                <div class="stat-block" style="flex:1;min-width:90px;padding:.7rem .9rem;">
                  <div style="font-family:'Syne',sans-serif;font-size:1.7rem;font-weight:700;
                    color:{GOLD};line-height:1;">{p['predicted_runs']}</div>
                  <div class="stat-label">Pred runs ({n_balls}b)</div>
                </div>
                <div class="stat-block" style="flex:1;min-width:90px;padding:.7rem .9rem;">
                  <div style="font-family:'Syne',sans-serif;font-size:1.7rem;font-weight:700;
                    color:{AMBER};line-height:1;">{p['expected_runs']}</div>
                  <div class="stat-label">Expected (risk-adj)</div>
                </div>
                <div class="stat-block" style="flex:1;min-width:90px;padding:.7rem .9rem;">
                  <div style="font-family:'Syne',sans-serif;font-size:1.7rem;font-weight:700;
                    color:{dis_color};line-height:1;">{p['dismissal_prob_pct']:.1f}%</div>
                  <div class="stat-label">Wkt risk / ball</div>
                </div>
              </div>

              <div style="margin-bottom:.75rem;">
                <div class="dismiss-label">Dismissal chance across {n_balls}-ball spell — {p['dismiss_in_spell_pct']:.1f}%</div>
                <div class="bar-track">
                  <div class="{bar_color}" style="width:{dis_pct}%;"></div>
                </div>
              </div>

              <div class="{verdict_cls}">{verdict_txt}</div>
            </div>
            """, unsafe_allow_html=True)

        # ── Deep dive (single batter, Monte Carlo) ────────────────────────
        st.markdown("---")
        st.markdown('<div class="section-label">Deep dive — single batter</div>',
                    unsafe_allow_html=True)
        dd_batter = st.selectbox(
            "Choose batter for detailed view",
            [p["batter"] for p in preds],
            key="dd_batter"
        )
        dd_pred = next(p for p in preds if p["batter"] == dd_batter)
        totals, _ = monte_carlo(dd_batter, primary_spin, phase, n_balls, venue, bf, vf, spin_df)
        dd_stats, _ = get_batter_row(bf, dd_batter)

        ca, cb = st.columns([1, 2])
        with ca:
            st.pyplot(plot_radar(dd_stats, dd_batter), use_container_width=True)
            plt.close()
        with cb:
            st.pyplot(plot_monte_carlo(totals, dd_batter, n_balls), use_container_width=True)
            plt.close()
            m1, m2, m3 = st.columns(3)
            m1.metric("Mean", f"{totals.mean():.1f}")
            m2.metric("P10 (floor)", f"{np.percentile(totals, 10):.0f}")
            m3.metric("P90 (ceiling)", f"{np.percentile(totals, 90):.0f}")

        # ── Save predictions ──────────────────────────────────────────────
        st.markdown("---")
        st.markdown('<div class="section-label">Save these predictions</div>',
                    unsafe_allow_html=True)
        sv1, sv2 = st.columns([2, 1])
        with sv1:
            st.markdown(f"""<div class="info-box">
                These predictions will be saved under the match label set in the sidebar.
                Current label: <b>{match_label or '(not set — add in sidebar)'}</b>
            </div>""", unsafe_allow_html=True)
        with sv2:
            save_btn = st.button("💾 Save predictions", key="save_btn")

        if save_btn:
            if not match_label.strip():
                st.warning("Set a match label in the sidebar first.")
            else:
                for p in preds:
                    save_prediction(folder, {
                        "saved_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
                        "match_label": match_label.strip(),
                        "batter": p["batter"], "bowling_team": bowling_team,
                        "spin_type": primary_spin, "phase": phase, "venue": venue,
                        "n_balls": n_balls,
                        "predicted_runs": p["predicted_runs"],
                        "predicted_sr": p["predicted_sr"],
                        "expected_runs": p["expected_runs"],
                        "dismiss_in_spell_pct": p["dismiss_in_spell_pct"],
                        "confidence": p["confidence"],
                        "actual_runs": "", "actual_dismissed": "", "verified_at": ""
                    })
                st.success(f"✅ Saved {len(preds)} predictions for **{match_label}**")

    # ─── VERIFY SECTION ──────────────────────────────────────────────────────
    st.markdown("---")
    st.markdown('<div class="section-label">Verify predictions vs actuals</div>',
                unsafe_allow_html=True)

    sdf = load_saved_predictions(folder)
    if sdf.empty:
        st.info("No saved predictions yet. Run predictions above and save them first.")
    else:
        match_labels = sdf["match_label"].unique().tolist()
        v1, v2, v3 = st.columns([2, 2, 1])
        with v1:
            sel_match = st.selectbox("Select saved match", match_labels, key="ver_match")
        with v2:
            json_folder = st.text_input(
                "Cricsheet JSON folder (for auto-fetch)",
                placeholder="D:/ipl_json",
                key="json_folder"
            )
        with v3:
            st.markdown("<div style='margin-top:1.7rem;'></div>", unsafe_allow_html=True)
            auto_fetch = st.button("🔄 Auto-fetch", key="auto_fetch")

        mdf = sdf[sdf["match_label"] == sel_match].copy()
        st.markdown(f"**{len(mdf)} predictions** saved for: _{sel_match}_")

        if auto_fetch:
            jf = (json_folder or "").strip()
            if not jf:
                st.error("Enter a JSON folder path.")
            elif not os.path.isdir(jf):
                st.error(f"Folder not found: `{jf}`")
            else:
                found_count = 0; not_found = []
                with st.spinner("Searching JSON files…"):
                    for idx, row in mdf.iterrows():
                        runs, dismissed = get_actual_runs_from_json(jf, row["batter"], sel_match)
                        if runs is not None:
                            update_actual(folder, idx, runs, dismissed)
                            found_count += 1
                        else:
                            not_found.append(row["batter"])
                if found_count:
                    st.success(f"✅ Auto-filled actuals for **{found_count}** batters!")
                    if not_found:
                        st.warning(f"Not found — enter manually: {', '.join(not_found)}")
                    st.rerun()
                else:
                    st.error(
                        "No batters found. Check:\n"
                        f"- Match label words match team names in the JSON\n"
                        f"- JSON files are directly in `{jf}`\n"
                        f"- Names match Cricsheet format e.g. `V Kohli`"
                    )

        # ── Manual entry grid ────────────────────────────────────────────
        st.markdown('<div class="section-label" style="margin-top:1rem;">Manual actuals entry</div>',
                    unsafe_allow_html=True)
        manual_updates = {}
        for i, (idx, row) in enumerate(mdf.iterrows()):
            c1, c2, c3, c4 = st.columns([2.2, 1.2, 1, 1])
            c1.markdown(f"**{row['batter']}**")
            c2.caption(f"Predicted: {row['predicted_runs']} runs")
            existing_runs = int(float(row["actual_runs"])) if is_valid_actual(row["actual_runs"]) else 0
            existing_dis  = str(row.get("actual_dismissed", "")).strip().lower() == "true"
            ar = c3.number_input("Actual runs", min_value=0, max_value=200,
                                  value=existing_runs, key=f"ar_{idx}", label_visibility="collapsed")
            di = c4.checkbox("Dismissed", value=existing_dis, key=f"di_{idx}")
            manual_updates[idx] = (ar, di)

        sv_col1, sv_col2 = st.columns([1, 3])
        with sv_col1:
            if st.button("💾 Save actuals", key="save_actuals"):
                for idx, (runs, dis) in manual_updates.items():
                    update_actual(folder, idx, runs, dis)
                st.success("✅ Saved!")
                st.rerun()

        # ── Accuracy results ─────────────────────────────────────────────
        fresh    = load_saved_predictions(folder)
        mdf2     = fresh[fresh["match_label"] == sel_match].copy()
        verified = mdf2[mdf2["actual_runs"].apply(is_valid_actual)].copy()

        if verified.empty:
            st.markdown("""<div class="info-box">
                Enter actual runs above and click <b>Save actuals</b> — accuracy results appear here.
            </div>""", unsafe_allow_html=True)
        else:
            verified["actual_runs"]    = verified["actual_runs"].astype(float).astype(int)
            verified["predicted_runs"] = verified["predicted_runs"].astype(float)
            verified["error"]          = (verified["actual_runs"] - verified["predicted_runs"]).round(1)
            verified["abs_error"]      = verified["error"].abs()
            verified["result"] = verified["error"].apply(
                lambda e: "Hit ✅" if abs(e) <= 3 else "Close ⚠️" if abs(e) <= 7 else "Miss ❌"
            )

            st.markdown("---")
            st.markdown('<div class="section-label">Accuracy results</div>', unsafe_allow_html=True)

            mae   = verified["abs_error"].mean()
            hits  = (verified["result"] == "Hit ✅").sum()
            close = (verified["result"] == "Close ⚠️").sum()
            total = len(verified)

            ac1, ac2, ac3, ac4 = st.columns(4)
            for col, val, lbl in [
                (ac1, f"{mae:.1f}", "Mean abs error (runs)"),
                (ac2, f"{hits}/{total}", "Hits within ±3 runs"),
                (ac3, f"{(hits + close)}/{total}", "Within ±7 runs"),
                (ac4, f"{hits / total * 100:.0f}%", "Hit rate"),
            ]:
                col.markdown(f"""<div class="stat-block">
                    <div class="stat-num">{val}</div>
                    <div class="stat-label">{lbl}</div>
                </div>""", unsafe_allow_html=True)

            st.markdown("<div style='margin-top:.8rem;'></div>", unsafe_allow_html=True)

            for _, row in verified.iterrows():
                cls_map = {"Hit ✅": "verify-hit", "Close ⚠️": "verify-close", "Miss ❌": "verify-miss"}
                bdg_map = {"Hit ✅": "badge-hit", "Close ⚠️": "badge-close", "Miss ❌": "badge-miss"}
                ds  = " · 🏴 Dismissed" if str(row.get("actual_dismissed", "")).strip().lower() == "true" else ""
                cls = cls_map[row["result"]]
                bdg = bdg_map[row["result"]]
                st.markdown(f"""
                <div class="{cls}" style="display:flex;align-items:center;justify-content:space-between;">
                  <div>
                    <b>{row['batter']}</b>
                    <span style="color:{SLATE};font-size:.83rem;"> —
                      predicted <b>{row['predicted_runs']}</b> → actual <b>{row['actual_runs']}</b>
                      (error: {row['error']:+.0f}){ds}
                    </span>
                  </div>
                  <span class="badge {bdg}">{row['result']}</span>
                </div>""", unsafe_allow_html=True)

            st.markdown("---")
            ch1, ch2 = st.columns(2)
            with ch1:
                st.pyplot(plot_accuracy_summary(verified), use_container_width=True)
                plt.close()
            with ch2:
                st.pyplot(plot_pred_vs_actual(verified), use_container_width=True)
                plt.close()

            st.download_button(
                "⬇️ Download verified results CSV",
                verified[["batter", "predicted_runs", "actual_runs", "error",
                           "result", "confidence", "dismiss_in_spell_pct", "actual_dismissed"]
                         ].to_csv(index=False),
                f"verified_{sel_match.replace(' ', '_')}.csv",
                "text/csv"
            )

        # ── Manage saved data ────────────────────────────────────────────
        st.markdown("---")
        with st.expander("📂 Manage saved predictions"):
            st.dataframe(sdf, use_container_width=True, height=250)
            dl_col, del_col = st.columns(2)
            with dl_col:
                st.download_button(
                    "⬇️ Download all saved predictions",
                    sdf.to_csv(index=False),
                    "saved_predictions.csv",
                    "text/csv"
                )
            with del_col:
                if st.button("🗑️ Clear ALL saved predictions"):
                    path = os.path.join(folder, PREDICTIONS_FILE)
                    if os.path.exists(path):
                        os.remove(path)
                    st.success("Cleared. Refresh the page.")


if __name__ == "__main__":
    main()