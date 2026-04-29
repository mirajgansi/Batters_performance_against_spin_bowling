"""
🏏 IPL Spin Predictor — Streamlit App (CSV-driven)
All player, team, bowling style, venue and batter stats
are loaded directly from your 3 CSV files.

Required CSVs (place in same folder as app.py):
  - Ball_By_Ball_Match_Data.csv
  - 2024_players_details.csv
  - Match_Info.csv
"""

import streamlit as st
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import os
import warnings
warnings.filterwarnings("ignore")

# ── Scraper (optional — only loads if ipl_scraper.py is present) ──────────────
try:
    from ipl_scraper import scrape_squads, scrape_fixtures, SPIN_TYPES as _SC_SPIN
    SCRAPER_AVAILABLE = True
except ImportError:
    SCRAPER_AVAILABLE = False

# ─── Page Config ──────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="IPL Spin Predictor",
    page_icon="🏏",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ─── Custom CSS ───────────────────────────────────────────────────────────────
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap');

:root {
    --gold: #e8c84b; --orange: #f4722b; --red: #c0392b;
    --blue-dark: #0d1b2a; --blue-mid: #1b2e48; --slate: #8b9bb4;
    --green: #2ecc71; --amber: #f39c12;
}
html, body, [class*="css"] { font-family: 'DM Sans', sans-serif; background-color: var(--blue-dark) !important; color: #f5f0e8; }
section[data-testid="stSidebar"] { background: linear-gradient(180deg,#0d1b2a,#1b2e48) !important; border-right: 2px solid var(--gold); }
section[data-testid="stSidebar"] * { color: #f5f0e8 !important; }
.main { background-color: var(--blue-dark) !important; }
.hero-title { font-family:'Bebas Neue',cursive; font-size:3.5rem; letter-spacing:.08em; color:var(--gold); text-shadow:0 0 30px rgba(232,200,75,.4); margin:0; line-height:1; }
.hero-sub { font-family:'DM Sans',sans-serif; font-weight:300; color:var(--slate); font-size:.95rem; letter-spacing:.2em; text-transform:uppercase; margin-top:4px; }
.pred-card { background:linear-gradient(135deg,#1b2e48,#0d1b2a); border:1px solid rgba(232,200,75,.25); border-radius:12px; padding:1.1rem 1.3rem; margin-bottom:.8rem; }
.metric-big { font-family:'Bebas Neue',cursive; font-size:2.6rem; color:var(--gold); line-height:1; }
.metric-label { font-size:.72rem; letter-spacing:.15em; text-transform:uppercase; color:var(--slate); margin-top:2px; }
.stButton>button { background:linear-gradient(135deg,var(--gold),var(--orange)); color:#0d1b2a !important; font-family:'Bebas Neue',cursive; font-size:1.1rem; letter-spacing:.1em; border:none; border-radius:8px; padding:.55rem 1.8rem; width:100%; transition:opacity .2s; }
.stButton>button:hover { opacity:.9; }
.stSelectbox>div>div, .stNumberInput>div>div>input { background:#1b2e48 !important; color:#f5f0e8 !important; border:1px solid rgba(139,155,180,.4) !important; border-radius:8px !important; }
label { color:var(--slate) !important; font-size:.83rem !important; }
.stTabs [data-baseweb="tab-list"] { background:transparent; border-bottom:2px solid rgba(232,200,75,.2); }
.stTabs [data-baseweb="tab"] { font-family:'Bebas Neue',cursive; font-size:1rem; letter-spacing:.1em; color:var(--slate) !important; background:transparent !important; border:none !important; padding:.5rem 1.5rem; }
.stTabs [aria-selected="true"] { color:var(--gold) !important; border-bottom:3px solid var(--gold) !important; }
hr { border-color:rgba(232,200,75,.2) !important; }
.badge-high   { background:#27ae60; color:#fff; padding:2px 8px; border-radius:10px; font-size:.75rem; }
.badge-medium { background:#f39c12; color:#fff; padding:2px 8px; border-radius:10px; font-size:.75rem; }
.badge-low    { background:#e74c3c; color:#fff; padding:2px 8px; border-radius:10px; font-size:.75rem; }
.info-box { background:rgba(27,46,72,.6); border-left:3px solid var(--gold); border-radius:0 8px 8px 0; padding:.8rem 1rem; margin:.5rem 0; font-size:.9rem; }
.team-pill { display:inline-block; background:rgba(232,200,75,.1); border:1px solid rgba(232,200,75,.3); border-radius:20px; padding:3px 12px; font-size:.8rem; color:var(--gold); margin:2px; }
</style>
""", unsafe_allow_html=True)

# ─── Constants ────────────────────────────────────────────────────────────────
SPIN_TYPES = [
    "right-arm offbreak", "legbreak", "legbreak googly",
    "slow left-arm orthodox", "left-arm wrist-spin",
]

DARK_BG = "#0d1b2a";  MID_BG = "#1b2e48"
GOLD="#e8c84b"; ORANGE="#f4722b"; SLATE="#8b9bb4"
GREEN="#2ecc71"; RED="#e74c3c"; AMBER="#f39c12"

TEAM_ALIAS = {
    "Kings XI Punjab": "Punjab Kings",
    "Delhi Daredevils": "Delhi Capitals",
    "Royal Challengers Bangalore": "Royal Challengers Bengaluru",
    "Deccan Chargers": "Sunrisers Hyderabad",
}

# ─── CSV Loader ───────────────────────────────────────────────────────────────

def find_csv_folder():
    """Search common locations for the 3 required CSV files."""
    candidates = [
        ".",                          # same folder as app.py
        os.path.dirname(__file__),
        os.path.expanduser("~/data"),
        "/mnt/user-data/uploads",     # Claude sandbox uploads
    ]
    needed = {"Ball_By_Ball_Match_Data.csv", "2024_players_details.csv", "Match_Info.csv"}
    for folder in candidates:
        if all(os.path.exists(os.path.join(folder, f)) for f in needed):
            return folder
    return None


@st.cache_data(show_spinner="📂 Loading CSV data...")
def load_data(folder):
    balls   = pd.read_csv(os.path.join(folder, "Ball_By_Ball_Match_Data.csv"))
    players = pd.read_csv(os.path.join(folder, "2024_players_details.csv"))
    matches = pd.read_csv(os.path.join(folder, "Match_Info.csv"))

    # ── Normalise column names (strip spaces / lowercase) ────────
    balls.columns   = balls.columns.str.strip()
    players.columns = players.columns.str.strip()
    matches.columns = matches.columns.str.strip()

    # ── Clean players ────────────────────────────────────────────
    players["longBowlingStyles"] = players["longBowlingStyles"].replace("Na", np.nan)

    # ── Build spin-bowler map {name → style} ────────────────────
    spin_map = {
        row["Name"]: row["longBowlingStyles"]
        for _, row in players.iterrows()
        if row["longBowlingStyles"] in SPIN_TYPES
    }

    # ── Attach venue + season from Match_Info ───────────────────
    matches["match_date"] = pd.to_datetime(matches["match_date"], errors="coerce")
    matches["season"]     = matches["match_date"].dt.year

    # Detect ID column (match_number or MatchID etc.)
    id_col = next((c for c in matches.columns if "match" in c.lower() and "number" in c.lower()), matches.columns[0])
    balls_id_col = "ID" if "ID" in balls.columns else balls.columns[0]

    balls = balls.merge(
        matches[[id_col, "season", "venue"]].rename(columns={id_col: balls_id_col}),
        on=balls_id_col, how="left",
    )

    # ── Team alias ───────────────────────────────────────────────
    for col in ["BattingTeam", "batting_team"]:
        if col in balls.columns:
            balls[col] = balls[col].replace(TEAM_ALIAS)

    # ── Filter legal spin deliveries ────────────────────────────
    extra_col = next((c for c in balls.columns if "extra" in c.lower() and "type" in c.lower()), None)
    if extra_col:
        legal = balls[~balls[extra_col].isin(["wides", "noballs"])].copy()
    else:
        legal = balls.copy()

    spin_df = legal[legal["Bowler"].isin(spin_map)].copy()
    spin_df["spin_type"] = spin_df["Bowler"].map(spin_map)

    phase_col = "Overs" if "Overs" in spin_df.columns else "overs"
    spin_df["phase"] = pd.cut(
        spin_df[phase_col], bins=[-1, 5, 14, 19],
        labels=["powerplay", "middle", "death"]
    )

    return balls, players, matches, spin_df, spin_map


@st.cache_data(show_spinner="⚙️ Computing batter features...")
def build_batter_features(_spin_df):
    """Compute career batting stats vs spin for every batter."""
    run_col  = "BatsmanRun"  if "BatsmanRun"  in _spin_df.columns else "batsman_run"
    wkt_col  = "IsWicketDelivery" if "IsWicketDelivery" in _spin_df.columns else "is_wicket"
    bat_col  = "Batter"      if "Batter"      in _spin_df.columns else "batter"

    bf = _spin_df.groupby(bat_col).agg(
        total_balls  =(run_col, "count"),
        total_runs   =(run_col, "sum"),
        dismissals   =(wkt_col, "sum"),
        dots         =(run_col, lambda x: (x == 0).sum()),
        fours        =(run_col, lambda x: (x == 4).sum()),
        sixes        =(run_col, lambda x: (x == 6).sum()),
        ones         =(run_col, lambda x: (x == 1).sum()),
        twos         =(run_col, lambda x: (x == 2).sum()),
    ).reset_index().rename(columns={bat_col: "Batter"})

    bf["sr"]           = bf["total_runs"] / bf["total_balls"] * 100
    bf["avg"]          = (bf["total_runs"] / bf["dismissals"].replace(0, np.nan)).fillna(bf["total_runs"])
    bf["dot_pct"]      = bf["dots"]  / bf["total_balls"] * 100
    bf["boundary_pct"] = (bf["fours"] + bf["sixes"]) / bf["total_balls"] * 100
    bf["six_pct"]      = bf["sixes"] / bf["total_balls"] * 100
    bf["wkt_rate"]     = bf["dismissals"] / bf["total_balls"] * 100
    bf["rotation_pct"] = (bf["ones"] + bf["twos"]) / bf["total_balls"] * 100

    # Only keep batters with at least 10 balls (removes noise)
    bf = bf[bf["total_balls"] >= 10].reset_index(drop=True)
    return bf


@st.cache_data(show_spinner="🏟️ Computing venue features...")
def build_venue_features(_spin_df):
    run_col = "BatsmanRun" if "BatsmanRun" in _spin_df.columns else "batsman_run"
    wkt_col = "IsWicketDelivery" if "IsWicketDelivery" in _spin_df.columns else "is_wicket"
    venue_col = "venue"

    if venue_col not in _spin_df.columns:
        return pd.DataFrame(columns=["venue","venue_spin_wkt_rate","venue_spin_economy"])

    vf = _spin_df.groupby(venue_col).agg(
        venue_spin_wkt_rate=(wkt_col, "mean"),
        venue_spin_economy =(run_col,  "mean"),
        count              =(run_col,  "count"),
    ).reset_index()
    vf = vf[vf["count"] >= 50].drop(columns="count")
    return vf


@st.cache_data(show_spinner="🏏 Building team rosters...")
def build_team_rosters(_balls, _players):
    """
    Derive team → batter list from Ball_By_Ball data,
    and team → spin bowlers from players CSV.
    """
    bat_col  = "Batter"      if "Batter"      in _balls.columns else "batter"
    team_col = "BattingTeam" if "BattingTeam" in _balls.columns else "batting_team"
    bowl_col = "Bowler"      if "Bowler"      in _balls.columns else "bowler"

    # Team → batters (appeared in at least 1 delivery for that team)
    team_batters = (
        _balls[[team_col, bat_col]]
        .dropna()
        .drop_duplicates()
        .groupby(team_col)[bat_col]
        .apply(list)
        .to_dict()
    )

    # Team → spin bowlers  (bowler appeared bowling for that team, and is a spinner)
    spin_names = set(_players[_players["longBowlingStyles"].isin(SPIN_TYPES)]["Name"])

    # Deduce bowling team: when team A bats, bowler is from team B
    # We approximate by: each bowler's "team" = the team that was *not* batting
    # when they bowled. Simpler: find all (BowlingTeam, Bowler) pairs.
    # Ball_By_Ball usually has a BowlingTeam column – let's check:
    if "BowlingTeam" in _balls.columns:
        team_spinners_raw = (
            _balls[_balls[bowl_col].isin(spin_names)][["BowlingTeam", bowl_col]]
            .drop_duplicates()
            .groupby("BowlingTeam")[bowl_col]
            .apply(list)
            .to_dict()
        )
    else:
        # Fallback: infer from all teams in which the bowler appeared
        team_spinners_raw = {}
        for team, batters in team_batters.items():
            bowlers_vs = _balls[_balls[team_col] == team][bowl_col].unique()
            spinners   = [b for b in bowlers_vs if b in spin_names]
            team_spinners_raw[team] = spinners

    # Build spin_map per team: {bowler_name: style}
    style_map = dict(zip(_players["Name"], _players["longBowlingStyles"]))
    team_spin_bowlers = {}
    for team, spinners in team_spinners_raw.items():
        team_spin_bowlers[team] = {s: style_map[s] for s in spinners if s in style_map}

    return team_batters, team_spin_bowlers


# ─── Prediction Engine ────────────────────────────────────────────────────────

def get_batter_row(batter_feats, name):
    row = batter_feats[batter_feats["Batter"] == name]
    if row.empty:
        avg = batter_feats[batter_feats["total_balls"] >= 30].mean(numeric_only=True)
        return avg, False
    return row.iloc[0], True


def predict_batter(batter_name, spin_type, phase, n_balls, venue,
                   batter_feats, venue_feats):
    stats, found = get_batter_row(batter_feats, batter_name)

    phase_factor = {"powerplay": 0.82, "middle": 1.0, "death": 1.15}.get(phase, 1.0)
    spin_difficulty = {
        "legbreak googly": 0.91, "left-arm wrist-spin": 0.88,
        "right-arm offbreak": 1.0, "legbreak": 0.95, "slow left-arm orthodox": 0.97,
    }
    diff = spin_difficulty.get(spin_type, 1.0)

    avg_wkt = venue_feats["venue_spin_wkt_rate"].mean() if not venue_feats.empty else 0.055
    avg_eco = venue_feats["venue_spin_economy"].mean()  if not venue_feats.empty else 1.35
    vrow = venue_feats[venue_feats["venue"] == venue] if not venue_feats.empty else pd.DataFrame()
    v_wkt = float(vrow["venue_spin_wkt_rate"].values[0]) if not vrow.empty else avg_wkt
    v_eco = float(vrow["venue_spin_economy"].values[0])  if not vrow.empty else avg_eco

    venue_factor = v_eco / avg_eco
    adj_sr   = float(stats["sr"]) * diff * phase_factor * venue_factor
    pred_runs = round((adj_sr / 100) * n_balls, 1)

    base_wkt  = float(stats["wkt_rate"]) / 100
    adj_wkt   = base_wkt / diff * (v_wkt / avg_wkt)
    dism_pct  = round(adj_wkt * 100, 2)
    spell_dism = round((1 - (1 - adj_wkt) ** n_balls) * 100, 1)
    expected  = round(pred_runs * (1 - adj_wkt), 1)

    nb = int(stats["total_balls"])
    if not found:    confidence = "LOW"
    elif nb >= 100:  confidence = "HIGH"
    elif nb >= 30:   confidence = "MEDIUM"
    else:            confidence = "LOW"

    return {
        "batter": batter_name, "spin_type": spin_type, "phase": phase,
        "predicted_sr": round(adj_sr, 1), "predicted_runs": pred_runs,
        "expected_runs": expected, "dismissal_prob_pct": dism_pct,
        "dismiss_in_spell_pct": spell_dism, "confidence": confidence,
        "hist_sr": round(float(stats["sr"]), 1), "hist_avg": round(float(stats["avg"]), 1),
        "dot_pct": round(float(stats["dot_pct"]), 1),
        "boundary_pct": round(float(stats["boundary_pct"]), 1),
    }


def monte_carlo(batter_name, spin_type, phase, n_balls, venue,
                batter_feats, venue_feats, spin_df, n_sim=1000):
    pred = predict_batter(batter_name, spin_type, phase, n_balls, venue,
                          batter_feats, venue_feats)
    dism_prob = pred["dismissal_prob_pct"] / 100

    bat_col = "BatsmanRun" if "BatsmanRun" in spin_df.columns else "batsman_run"
    batter_col = "Batter" if "Batter" in spin_df.columns else "batter"
    dist = spin_df[spin_df[batter_col] == batter_name][bat_col].values
    if len(dist) < 20:
        dist = spin_df[bat_col].values

    np.random.seed(42)
    totals = []
    for _ in range(n_sim):
        total = 0
        for _ in range(n_balls):
            if np.random.random() < dism_prob:
                break
            total += int(np.random.choice(dist))
        totals.append(total)
    return np.array(totals), pred


# ─── Plot helpers ─────────────────────────────────────────────────────────────

def fig_style(fig, ax_list):
    fig.patch.set_facecolor(DARK_BG)
    for ax in ax_list:
        ax.set_facecolor(MID_BG)
        ax.tick_params(colors=SLATE)
        ax.xaxis.label.set_color(SLATE)
        ax.yaxis.label.set_color(SLATE)
        ax.title.set_color(GOLD)
        for spine in ax.spines.values():
            spine.set_edgecolor(MID_BG)


def plot_radar(stats_row, batter_name):
    categories = ["Strike Rate", "Average", "Boundary%", "Rotation%", "Dot%*"]
    maxes = [170, 55, 35, 45, 50]
    mins  = [60,  5,  3,  10, 20]
    vals  = [float(stats_row["sr"]), float(stats_row["avg"]),
             float(stats_row["boundary_pct"]), float(stats_row["rotation_pct"]),
             float(stats_row["dot_pct"])]
    normed = [(v - mn) / max(mx - mn, 1) for v, mn, mx in zip(vals, mins, maxes)]
    normed[-1] = 1 - normed[-1]   # dot% inverted
    normed_plot = normed + [normed[0]]
    angles = [n / float(len(categories)) * 2 * np.pi for n in range(len(categories))]
    angles += angles[:1]

    fig, ax = plt.subplots(figsize=(4, 4), subplot_kw=dict(polar=True))
    fig_style(fig, [ax])
    ax.set_facecolor(MID_BG)
    ax.plot(angles, normed_plot, "o-", color=GOLD, linewidth=2)
    ax.fill(angles, normed_plot, alpha=0.25, color=GOLD)
    ax.set_xticks(angles[:-1])
    ax.set_xticklabels(categories, color=SLATE, size=8)
    ax.set_ylim(0, 1)
    ax.set_yticks([0.25, 0.5, 0.75, 1.0])
    ax.set_yticklabels(["25","50","75","100"], color=SLATE, size=6)
    ax.grid(color="#2a3f58", linewidth=0.5)
    ax.set_title(f"{batter_name}\nSpin Profile", color=GOLD, size=9, pad=12)
    plt.tight_layout()
    return fig


def plot_monte_carlo(totals, batter_name, n_balls):
    fig, ax = plt.subplots(figsize=(7, 3.5))
    fig_style(fig, [ax])
    ax.hist(totals, bins=25, color=GOLD, alpha=0.7, edgecolor=MID_BG, linewidth=0.5)
    ax.axvline(totals.mean(), color=ORANGE, linestyle="--", lw=2, label=f"Mean: {totals.mean():.1f}")
    ax.axvline(np.percentile(totals, 10), color=RED,   linestyle=":", lw=1.5, label=f"P10: {np.percentile(totals,10):.1f}")
    ax.axvline(np.percentile(totals, 90), color=GREEN, linestyle=":", lw=1.5, label=f"P90: {np.percentile(totals,90):.1f}")
    ax.set_xlabel(f"Total Runs in {n_balls} Balls", color=SLATE)
    ax.set_ylabel("Simulations", color=SLATE)
    ax.set_title(f"Monte Carlo — {batter_name} (1000 sims)", color=GOLD)
    ax.legend(facecolor=MID_BG, edgecolor=SLATE, labelcolor=SLATE)
    plt.tight_layout()
    return fig


def plot_team_comparison(df):
    fig, axes = plt.subplots(1, 2, figsize=(12, 5))
    fig_style(fig, axes)
    df_s = df.sort_values("Expected Runs", ascending=True)
    c_runs = [GREEN if x >= 8 else AMBER if x >= 5 else RED for x in df_s["Expected Runs"]]
    axes[0].barh(df_s["Batter"], df_s["Expected Runs"], color=c_runs, height=0.65)
    axes[0].set_title("Expected Runs vs Spin", color=GOLD)
    axes[0].set_xlabel("Expected Runs", color=SLATE)
    for val, bar in zip(df_s["Expected Runs"], axes[0].patches):
        axes[0].text(val+0.1, bar.get_y()+bar.get_height()/2, f"{val:.1f}", va="center", color=SLATE, size=8)
    c_dism = [GREEN if x < 5 else AMBER if x < 8 else RED for x in df_s["Dismiss%/ball"]]
    axes[1].barh(df_s["Batter"], df_s["Dismiss%/ball"], color=c_dism, height=0.65)
    axes[1].set_title("Dismissal Prob per Ball (%)", color=GOLD)
    axes[1].set_xlabel("Probability (%)", color=SLATE)
    for val, bar in zip(df_s["Dismiss%/ball"], axes[1].patches):
        axes[1].text(val+0.05, bar.get_y()+bar.get_height()/2, f"{val:.1f}%", va="center", color=SLATE, size=8)
    plt.tight_layout()
    return fig


# ─── Main App ─────────────────────────────────────────────────────────────────

def main():
    # ── Header ────────────────────────────────────────────────────
    st.markdown('<div class="hero-title">🏏 IPL SPIN PREDICTOR</div>', unsafe_allow_html=True)
    st.markdown('<div class="hero-sub">CSV-Driven · Ball-by-Ball Analytics · v3.0</div>', unsafe_allow_html=True)
    st.markdown("---")

    # ── CSV folder setup ──────────────────────────────────────────
    folder = find_csv_folder()

    if folder is None:
        st.error("⚠️ Could not find the 3 CSV files. Please enter the folder path below.")
        folder = st.text_input(
            "📁 Folder path containing your CSV files",
            placeholder="/path/to/your/data",
        )
        if not folder:
            st.stop()
        if not os.path.isdir(folder):
            st.error("That path does not exist."); st.stop()
        needed = {"Ball_By_Ball_Match_Data.csv","2024_players_details.csv","Match_Info.csv"}
        missing = [f for f in needed if not os.path.exists(os.path.join(folder, f))]
        if missing:
            st.error(f"Missing files: {missing}"); st.stop()
    else:
        st.sidebar.success(f"✅ CSVs loaded from: `{folder}`")

    # ── Load data ─────────────────────────────────────────────────
    balls, players, matches, spin_df, spin_map = load_data(folder)
    batter_feats  = build_batter_features(spin_df)
    venue_feats   = build_venue_features(spin_df)
    team_batters, team_spin_bowlers = build_team_rosters(balls, players)

    all_batters = sorted(batter_feats["Batter"].unique())
    all_venues  = sorted(venue_feats["venue"].unique()) if not venue_feats.empty else sorted(
        balls["venue"].dropna().unique() if "venue" in balls.columns else []
    )
    all_teams   = sorted(team_batters.keys())

    # ── Sidebar ───────────────────────────────────────────────────
    with st.sidebar:
        st.markdown("### ⚙️ Match Setup")
        venue    = st.selectbox("🏟️ Venue", all_venues) if all_venues else "Unknown"
        phase    = st.selectbox("📊 Match Phase", ["powerplay","middle","death"], index=1,
                                format_func=lambda x: {"powerplay":"Powerplay (1–6)",
                                                        "middle":"Middle (7–15)",
                                                        "death":"Death (16–20)"}[x])
        n_balls  = st.slider("🎯 Balls in Spell", 4, 24, 12, 2)
        spin_type = st.selectbox("🌀 Spin Type", SPIN_TYPES)

        st.markdown("---")
        # Dataset summary
        st.markdown("**📊 Dataset**")
        st.caption(f"Total spin deliveries: **{len(spin_df):,}**")
        st.caption(f"Unique batters: **{len(all_batters)}**")
        st.caption(f"Spin bowlers: **{len(spin_map)}**")
        st.caption(f"Venues: **{len(all_venues)}**")
        st.caption(f"Teams: **{len(all_teams)}**")

        # Venue spin stats
        if not venue_feats.empty and venue != "Unknown":
            vrow = venue_feats[venue_feats["venue"] == venue]
            if not vrow.empty:
                wkt_r = float(vrow["venue_spin_wkt_rate"].values[0])
                eco   = float(vrow["venue_spin_economy"].values[0])
                label = "🟢 Spin Friendly" if wkt_r > 0.062 else "🟡 Neutral" if wkt_r > 0.05 else "🔴 Batting Friendly"
                st.markdown(f"""
                <div class="info-box">
                    <b>{venue}</b><br>{label}<br>
                    Spin Wkt Rate: <b>{wkt_r*100:.1f}%</b><br>
                    Spin Economy: <b>{eco:.3f}</b> runs/ball
                </div>""", unsafe_allow_html=True)

    # ── Tabs ──────────────────────────────────────────────────────
    tab1, tab2, tab3, tab4 = st.tabs(["🔮 Single Batter", "🏟️ Team vs Team", "📊 Deep Dive", "🌐 Scraper"])

    # ═══════════════════════════════════════════════════════
    # TAB 1 — Single Batter
    # ═══════════════════════════════════════════════════════
    with tab1:
        st.markdown("#### Predict a Batter's Performance vs Spin")
        col1, col2 = st.columns([1, 2])

        with col1:
            batter_name = st.selectbox("🏏 Select Batter", all_batters)
            run_btn = st.button("🚀 Run Prediction")

        with col2:
            stats_row, _ = get_batter_row(batter_feats, batter_name)
            st.markdown(f"""
            <div class="pred-card">
                <div style="font-size:.75rem;color:{SLATE};letter-spacing:.15em;text-transform:uppercase;">
                    Historical vs Spin — {int(stats_row['total_balls'])} balls faced
                </div>
                <div style="display:flex;gap:2rem;margin-top:.6rem;">
                    <div><div class="metric-big">{float(stats_row['sr']):.0f}</div><div class="metric-label">Strike Rate</div></div>
                    <div><div class="metric-big">{float(stats_row['avg']):.0f}</div><div class="metric-label">Average</div></div>
                    <div><div class="metric-big">{float(stats_row['boundary_pct']):.0f}%</div><div class="metric-label">Boundary%</div></div>
                    <div><div class="metric-big">{float(stats_row['dot_pct']):.0f}%</div><div class="metric-label">Dot%</div></div>
                </div>
            </div>""", unsafe_allow_html=True)

        if run_btn:
            pred = predict_batter(batter_name, spin_type, phase, n_balls, venue, batter_feats, venue_feats)
            totals, _ = monte_carlo(batter_name, spin_type, phase, n_balls, venue,
                                    batter_feats, venue_feats, spin_df)
            st.markdown("---")

            c1, c2, c3, c4 = st.columns(4)
            for col, val, lbl, clr in [
                (c1, pred["predicted_runs"],      f"Predicted Runs ({n_balls} balls)", GOLD),
                (c2, pred["predicted_sr"],         "Predicted Strike Rate",             GOLD),
                (c3, pred["expected_runs"],        "Expected Runs (risk-adj)",          ORANGE),
                (c4, f"{pred['dismiss_in_spell_pct']}%", "Dismissal Risk in Spell",   RED),
            ]:
                col.markdown(f"""
                <div class="pred-card" style="text-align:center;">
                    <div class="metric-big" style="color:{clr};">{val}</div>
                    <div class="metric-label">{lbl}</div>
                </div>""", unsafe_allow_html=True)

            badge_cls = {"HIGH":"badge-high","MEDIUM":"badge-medium","LOW":"badge-low"}[pred["confidence"]]
            st.markdown(f'<span class="{badge_cls}">Confidence: {pred["confidence"]}</span>', unsafe_allow_html=True)
            st.markdown("---")

            col_a, col_b = st.columns([1, 2])
            with col_a:
                st.pyplot(plot_radar(stats_row, batter_name), use_container_width=True); plt.close()
            with col_b:
                st.pyplot(plot_monte_carlo(totals, batter_name, n_balls), use_container_width=True); plt.close()
                ca, cb, cc = st.columns(3)
                ca.metric("Mean", f"{totals.mean():.1f}")
                cb.metric("P10 (Worst)", f"{np.percentile(totals,10):.0f}")
                cc.metric("P90 (Best)", f"{np.percentile(totals,90):.0f}")

            st.markdown(f"""
            <div class="info-box">
                <b>{batter_name}</b> vs <b>{spin_type}</b> · <b>{phase}</b> · <b>{venue}</b><br>
                Predicted: <b>{pred['predicted_runs']} runs</b> @ SR <b>{pred['predicted_sr']}</b> ·
                Dismissal risk: <b>{pred['dismiss_in_spell_pct']}%</b> in {n_balls} balls ·
                Historical SR vs spin: <b>{pred['hist_sr']}</b>
            </div>""", unsafe_allow_html=True)

    # ═══════════════════════════════════════════════════════
    # TAB 2 — Team vs Team
    # ═══════════════════════════════════════════════════════
    with tab2:
        st.markdown("#### Full Team Batting XI vs Spin Bowlers")
        col_t1, col_t2 = st.columns(2)

        with col_t1:
            batting_team = st.selectbox("🏏 Batting Team", all_teams, key="bat_team")
            # Batters for that team who also appear in batter_feats
            team_bats = [b for b in team_batters.get(batting_team, []) if b in all_batters]
            batting_xi = st.multiselect(
                "Select Batting XI (max 11)", team_bats,
                default=team_bats[:8], max_selections=11, key="bat_xi"
            )

        with col_t2:
            bowling_team = st.selectbox("🌀 Bowling Team", all_teams, key="bowl_team")
            spinners = team_spin_bowlers.get(bowling_team, {})
            st.markdown("**Spin Bowlers in XI (from your data):**")
            if spinners:
                for b, t in list(spinners.items())[:8]:
                    st.markdown(f'<span class="team-pill">🌀 {b} — {t}</span>', unsafe_allow_html=True)
                primary_spin = list(spinners.values())[0]
            else:
                st.caption("No spin bowlers found for this team in data")
                primary_spin = spin_type

        team_btn = st.button("🏟️ Predict Full Team vs Spin")
        if team_btn:
            if not batting_xi:
                st.warning("Select at least 3 batters."); st.stop()
            results = [
                {
                    "Batter": b,
                    **{k: v for k, v in predict_batter(b, primary_spin, phase, n_balls, venue,
                                                        batter_feats, venue_feats).items()
                       if k in ("predicted_sr","predicted_runs","expected_runs",
                                "dismissal_prob_pct","dismiss_in_spell_pct","confidence")}
                }
                for b in batting_xi
            ]
            df = pd.DataFrame(results).rename(columns={
                "predicted_sr":"Pred SR","predicted_runs":"Pred Runs",
                "expected_runs":"Expected Runs","dismissal_prob_pct":"Dismiss%/ball",
                "dismiss_in_spell_pct":"Dismiss% in spell","confidence":"Confidence"
            }).sort_values("Expected Runs", ascending=False).reset_index(drop=True)

            st.markdown(f"##### {batting_team} vs {primary_spin} at {venue}")

            def conf_color(v): return f"color:{'#27ae60' if v=='HIGH' else '#f39c12' if v=='MEDIUM' else '#e74c3c'}"
            def runs_color(v): return f"color:{'#2ecc71' if v>=8 else '#f39c12' if v>=5 else '#e74c3c'}"
            styled = df.style.applymap(conf_color, subset=["Confidence"])\
                             .applymap(runs_color, subset=["Expected Runs"])\
                             .format({"Pred SR":"{:.1f}","Pred Runs":"{:.1f}","Expected Runs":"{:.1f}",
                                      "Dismiss%/ball":"{:.2f}%","Dismiss% in spell":"{:.1f}%"})
            st.dataframe(styled, use_container_width=True, height=380)
            st.pyplot(plot_team_comparison(df), use_container_width=True); plt.close()

            best, worst = df.iloc[0]["Batter"], df.iloc[-1]["Batter"]
            st.markdown(f"""
            <div class="info-box">
                🏆 <b>{best}</b> — most dangerous vs spin (highest expected runs)<br>
                ⚠️ <b>{worst}</b> — most at risk vs spin
            </div>""", unsafe_allow_html=True)

    # ═══════════════════════════════════════════════════════
    # TAB 3 — Deep Dive
    # ═══════════════════════════════════════════════════════
    with tab3:
        st.markdown("#### Batter Deep Dive — Spin Type × Phase Heatmap")
        batter_dd = st.selectbox("🏏 Select Batter", all_batters, key="dd_batter")
        stats_dd, _ = get_batter_row(batter_feats, batter_dd)

        col_a, col_b = st.columns([1, 2])
        with col_a:
            st.pyplot(plot_radar(stats_dd, batter_dd), use_container_width=True); plt.close()
            st.markdown(f"""
            <div class="pred-card">
                <b>Historical Spin Stats</b><br><br>
                Balls Faced: <b>{int(stats_dd['total_balls'])}</b><br>
                Strike Rate: <b>{float(stats_dd['sr']):.1f}</b><br>
                Average: <b>{float(stats_dd['avg']):.1f}</b><br>
                Dot %: <b>{float(stats_dd['dot_pct']):.1f}%</b><br>
                Boundary %: <b>{float(stats_dd['boundary_pct']):.1f}%</b><br>
                Wicket Rate: <b>{float(stats_dd['wkt_rate']):.2f}%</b>
            </div>""", unsafe_allow_html=True)

        with col_b:
            phases_ = ["powerplay","middle","death"]
            data_sr, data_exp = [], []
            for sp in SPIN_TYPES:
                row_sr, row_exp = [], []
                for ph in phases_:
                    p = predict_batter(batter_dd, sp, ph, 12, venue, batter_feats, venue_feats)
                    row_sr.append(p["predicted_sr"]); row_exp.append(p["expected_runs"])
                data_sr.append(row_sr); data_exp.append(row_exp)

            df_sr  = pd.DataFrame(data_sr,  index=SPIN_TYPES, columns=phases_)
            df_exp = pd.DataFrame(data_exp, index=SPIN_TYPES, columns=phases_)

            fig, axes = plt.subplots(1, 2, figsize=(10, 4))
            fig_style(fig, axes)
            sns.heatmap(df_sr,  ax=axes[0], cmap="RdYlGn", annot=True, fmt=".0f",
                        linewidths=0.5, linecolor=DARK_BG)
            axes[0].set_title("Predicted Strike Rate", color=GOLD)
            sns.heatmap(df_exp, ax=axes[1], cmap="RdYlGn", annot=True, fmt=".1f",
                        linewidths=0.5, linecolor=DARK_BG)
            axes[1].set_title("Expected Runs (12 balls)", color=GOLD)
            plt.suptitle(f"{batter_dd} — Spin Type × Phase", color=GOLD, size=11)
            plt.tight_layout()
            st.pyplot(fig, use_container_width=True); plt.close()

            flat_sr = [(SPIN_TYPES[i], phases_[j], data_sr[i][j])
                       for i in range(len(SPIN_TYPES)) for j in range(3)]
            best_m  = max(flat_sr, key=lambda x: x[2])
            worst_m = min(flat_sr, key=lambda x: x[2])
            st.markdown(f"""
            <div class="info-box">
                🔥 <b>Best matchup:</b> {batter_dd} vs <b>{best_m[0]}</b> · <b>{best_m[1]}</b> — SR <b>{best_m[2]:.0f}</b><br>
                ❄️ <b>Weakness:</b> vs <b>{worst_m[0]}</b> · <b>{worst_m[1]}</b> — SR <b>{worst_m[2]:.0f}</b>
            </div>""", unsafe_allow_html=True)


    # ═══════════════════════════════════════════════════════
    # TAB 4 — Scraper
    # ═══════════════════════════════════════════════════════
    with tab4:
        st.markdown("#### 🌐 Scrape Latest IPL Squads & Fixtures")

        if not SCRAPER_AVAILABLE:
            st.warning("""
            **ipl_scraper.py not found in your folder.**  
            Make sure `ipl_scraper.py` is in the same folder as `app.py`, then restart.
            """)
        else:
            import json
            from datetime import datetime

            col_s1, col_s2, col_s3 = st.columns([1, 1, 2])
            with col_s1:
                sc_season = st.selectbox("📅 Season", [2025, 2024, 2023], index=0, key="sc_season")
            with col_s2:
                sc_force = st.checkbox("🔄 Force refresh", value=False, key="sc_force")
            with col_s3:
                sc_outdir = st.text_input("📁 Save folder", value=folder, key="sc_outdir")

            # Show existing file status
            sq_path = os.path.join(sc_outdir, "ipl_squads.csv")
            fx_path = os.path.join(sc_outdir, "ipl_fixtures.csv")

            def file_info(path):
                if not os.path.exists(path):
                    return "❌ Not yet scraped"
                from datetime import datetime
                mtime = datetime.fromtimestamp(os.path.getmtime(path))
                rows  = len(pd.read_csv(path))
                return f"✅ {rows} rows · last updated {mtime.strftime('%d %b %Y %H:%M')}"

            st.markdown("---")
            ci1, ci2 = st.columns(2)
            ci1.markdown(f"**ipl_squads.csv** — {file_info(sq_path)}")
            ci2.markdown(f"**ipl_fixtures.csv** — {file_info(fx_path)}")
            st.markdown("---")

            # Buttons
            b1, b2, b3 = st.columns(3)
            do_squads   = b1.button("🏏 Scrape Squads")
            do_fixtures = b2.button("📅 Scrape Fixtures")
            do_all      = b3.button("🚀 Scrape Everything")

            if do_squads or do_fixtures or do_all:
                log_area = st.empty()
                logs = []
                def log(msg):
                    logs.append(msg)
                    log_area.markdown(
                        "<div style=\'background:#0a1420;border:1px solid #2a3f58;border-radius:8px;"
                        "padding:1rem;font-size:.82rem;color:#8b9bb4;max-height:200px;overflow-y:auto;\'>"
                        + "<br>".join(f"› {m}" for m in logs)
                        + "</div>", unsafe_allow_html=True
                    )

                fallback = os.path.join(folder, "2024_players_details.csv")

                with st.spinner("Scraping..."):
                    if do_squads or do_all:
                        sq_df, sq_csv_p, sq_json_p = scrape_squads(
                            season=sc_season, out_dir=sc_outdir,
                            force=sc_force, csv_fallback=fallback, log=log
                        )
                        st.session_state["scraped_squads"] = sq_df

                    if do_fixtures or do_all:
                        fx_df, fx_csv_p, fx_json_p = scrape_fixtures(
                            season=sc_season, out_dir=sc_outdir,
                            force=sc_force, log=log
                        )
                        st.session_state["scraped_fixtures"] = fx_df

                st.success("✅ Done! Restart the app to use the new data.")

            # Preview scraped data
            prev1, prev2 = st.tabs(["🏏 Squads Preview", "📅 Fixtures Preview"])

            with prev1:
                if os.path.exists(sq_path):
                    sq_preview = pd.read_csv(sq_path)
                    spin_only = st.checkbox("Show spin bowlers only", key="sp_only")
                    if spin_only:
                        sq_preview = sq_preview[sq_preview["longBowlingStyles"].notna()]
                    st.dataframe(sq_preview, use_container_width=True, height=350)

                    dl1, dl2 = st.columns(2)
                    dl1.download_button("⬇️ squads.csv",
                        sq_preview.to_csv(index=False), "ipl_squads.csv", "text/csv")
                    json_sq = sq_path.replace(".csv", ".json")
                    if os.path.exists(json_sq):
                        with open(json_sq) as f:
                            dl2.download_button("⬇️ squads.json",
                                f.read(), "ipl_squads.json", "application/json")
                else:
                    st.info("No squads data yet — click Scrape Squads above.")

            with prev2:
                if os.path.exists(fx_path):
                    fx_preview = pd.read_csv(fx_path)
                    st.dataframe(fx_preview, use_container_width=True, height=350)

                    dl1, dl2 = st.columns(2)
                    dl1.download_button("⬇️ fixtures.csv",
                        fx_preview.to_csv(index=False), "ipl_fixtures.csv", "text/csv")
                    json_fx = fx_path.replace(".csv", ".json")
                    if os.path.exists(json_fx):
                        with open(json_fx) as f:
                            dl2.download_button("⬇️ fixtures.json",
                                f.read(), "ipl_fixtures.json", "application/json")
                else:
                    st.info("No fixtures data yet — click Scrape Fixtures above.")


if __name__ == "__main__":
    main()

    # ═══════════════════════════════════════════════════════
    # TAB 4 — Scraper
    # ═══════════════════════════════════════════════════════