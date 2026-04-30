"""
🏏 IPL Spin Predictor — Streamlit App v4.1
Fixes in this version:
  - actual_runs check now handles 0, 0.0, floats correctly (was breaking with isdigit)
  - CSV saved/loaded as string dtype to avoid NaN/float corruption
  - Auto-fetch triggers st.rerun() so accuracy shows immediately
  - JSON matching is flexible — partial team name words work
  - Manual entry shows existing fetched values pre-filled
  - Better error messages with exact diagnostic info
"""

import re
import streamlit as st
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import os, json, glob, warnings
from datetime import datetime
warnings.filterwarnings("ignore")

st.set_page_config(page_title="IPL Spin Predictor", page_icon="🏏",
                   layout="wide", initial_sidebar_state="expanded")

st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap');
:root{--gold:#e8c84b;--orange:#f4722b;--red:#c0392b;--blue-dark:#0d1b2a;--blue-mid:#1b2e48;--slate:#8b9bb4;--green:#2ecc71;--amber:#f39c12;}
html,body,[class*="css"]{font-family:'DM Sans',sans-serif;background-color:var(--blue-dark)!important;color:#f5f0e8;}
section[data-testid="stSidebar"]{background:linear-gradient(180deg,#0d1b2a,#1b2e48)!important;border-right:2px solid var(--gold);}
section[data-testid="stSidebar"] *{color:#f5f0e8!important;}
.main{background-color:var(--blue-dark)!important;}
.hero-title{font-family:'Bebas Neue',cursive;font-size:3.5rem;letter-spacing:.08em;color:var(--gold);text-shadow:0 0 30px rgba(232,200,75,.4);margin:0;line-height:1;}
.hero-sub{font-family:'DM Sans',sans-serif;font-weight:300;color:var(--slate);font-size:.95rem;letter-spacing:.2em;text-transform:uppercase;margin-top:4px;}
.pred-card{background:linear-gradient(135deg,#1b2e48,#0d1b2a);border:1px solid rgba(232,200,75,.25);border-radius:12px;padding:1.1rem 1.3rem;margin-bottom:.8rem;}
.metric-big{font-family:'Bebas Neue',cursive;font-size:2.6rem;color:var(--gold);line-height:1;}
.metric-label{font-size:.72rem;letter-spacing:.15em;text-transform:uppercase;color:var(--slate);margin-top:2px;}
.stButton>button{background:linear-gradient(135deg,var(--gold),var(--orange));color:#0d1b2a!important;font-family:'Bebas Neue',cursive;font-size:1.1rem;letter-spacing:.1em;border:none;border-radius:8px;padding:.55rem 1.8rem;width:100%;transition:opacity .2s;}
.stButton>button:hover{opacity:.9;}
.stSelectbox>div>div,.stNumberInput>div>div>input{background:#1b2e48!important;color:#f5f0e8!important;border:1px solid rgba(139,155,180,.4)!important;border-radius:8px!important;}
label{color:var(--slate)!important;font-size:.83rem!important;}
.stTabs [data-baseweb="tab-list"]{background:transparent;border-bottom:2px solid rgba(232,200,75,.2);}
.stTabs [data-baseweb="tab"]{font-family:'Bebas Neue',cursive;font-size:1rem;letter-spacing:.1em;color:var(--slate)!important;background:transparent!important;border:none!important;padding:.5rem 1.5rem;}
.stTabs [aria-selected="true"]{color:var(--gold)!important;border-bottom:3px solid var(--gold)!important;}
hr{border-color:rgba(232,200,75,.2)!important;}
.badge-high{background:#27ae60;color:#fff;padding:2px 8px;border-radius:10px;font-size:.75rem;}
.badge-medium{background:#f39c12;color:#fff;padding:2px 8px;border-radius:10px;font-size:.75rem;}
.badge-low{background:#e74c3c;color:#fff;padding:2px 8px;border-radius:10px;font-size:.75rem;}
.badge-hit{background:#27ae60;color:#fff;padding:3px 10px;border-radius:10px;font-size:.8rem;font-weight:600;}
.badge-close{background:#f39c12;color:#fff;padding:3px 10px;border-radius:10px;font-size:.8rem;font-weight:600;}
.badge-miss{background:#e74c3c;color:#fff;padding:3px 10px;border-radius:10px;font-size:.8rem;font-weight:600;}
.info-box{background:rgba(27,46,72,.6);border-left:3px solid var(--gold);border-radius:0 8px 8px 0;padding:.8rem 1rem;margin:.5rem 0;font-size:.9rem;}
.team-pill{display:inline-block;background:rgba(232,200,75,.1);border:1px solid rgba(232,200,75,.3);border-radius:20px;padding:3px 12px;font-size:.8rem;color:var(--gold);margin:2px;}
.verify-hit{background:rgba(46,204,113,.08);border-left:3px solid #2ecc71;border-radius:0 8px 8px 0;padding:.6rem 1rem;margin:.3rem 0;}
.verify-miss{background:rgba(231,76,60,.08);border-left:3px solid #e74c3c;border-radius:0 8px 8px 0;padding:.6rem 1rem;margin:.3rem 0;}
</style>""", unsafe_allow_html=True)

SPIN_TYPES = ["right-arm offbreak","legbreak","legbreak googly",
              "slow left-arm orthodox","left-arm wrist-spin"]
DARK_BG="#0d1b2a"; MID_BG="#1b2e48"
GOLD="#e8c84b"; ORANGE="#f4722b"; SLATE="#8b9bb4"
GREEN="#2ecc71"; RED="#e74c3c"; AMBER="#f39c12"
TEAM_ALIAS = {"Kings XI Punjab":"Punjab Kings","Delhi Daredevils":"Delhi Capitals",
              "Royal Challengers Bangalore":"Royal Challengers Bengaluru",
              "Deccan Chargers":"Sunrisers Hyderabad"}
PREDICTIONS_FILE = "saved_predictions.csv"

# ── KEY FIX 1: robust actual_runs check ──────────────────────────────────────
def is_valid_actual(val):
    """True if val is a real recorded number (including 0), not blank/nan."""
    if val is None: return False
    s = str(val).strip()
    if s in ("", "nan", "NaN", "None", "nat", "NaT"): return False
    try: float(s); return True
    except ValueError: return False

def find_csv_folder():
    candidates = [".","./data", os.path.dirname(__file__),
                  os.path.expanduser("~/data"), "/mnt/user-data/uploads"]
    needed = {"Ball_By_Ball_Match_Data.csv","2024_players_details.csv","Match_Info.csv"}
    for f in candidates:
        if all(os.path.exists(os.path.join(f, n)) for n in needed): return f
    return None

@st.cache_data(show_spinner="📂 Loading CSV data...")
def load_data(folder):
    balls   = pd.read_csv(os.path.join(folder,"Ball_By_Ball_Match_Data.csv"))
    players = pd.read_csv(os.path.join(folder,"2024_players_details.csv"))
    matches = pd.read_csv(os.path.join(folder,"Match_Info.csv"))
    for df in [balls, players, matches]: df.columns = df.columns.str.strip()
    players["longBowlingStyles"] = players["longBowlingStyles"].replace("Na", np.nan)
    spin_map = {r["Name"]: r["longBowlingStyles"] for _, r in players.iterrows()
                if r["longBowlingStyles"] in SPIN_TYPES}
    matches["match_date"] = pd.to_datetime(matches["match_date"], errors="coerce")
    matches["season"]     = matches["match_date"].dt.year
    id_col       = next((c for c in matches.columns if "match" in c.lower() and "number" in c.lower()), matches.columns[0])
    balls_id_col = "ID" if "ID" in balls.columns else balls.columns[0]
    balls = balls.merge(matches[[id_col,"season","venue"]].rename(columns={id_col:balls_id_col}),
                        on=balls_id_col, how="left")
    for col in ["BattingTeam","batting_team"]:
        if col in balls.columns: balls[col] = balls[col].replace(TEAM_ALIAS)
    extra_col = next((c for c in balls.columns if "extra" in c.lower() and "type" in c.lower()), None)
    legal = balls[~balls[extra_col].isin(["wides","noballs"])].copy() if extra_col else balls.copy()
    spin_df = legal[legal["Bowler"].isin(spin_map)].copy()
    spin_df["spin_type"] = spin_df["Bowler"].map(spin_map)
    pc = "Overs" if "Overs" in spin_df.columns else "overs"
    spin_df["phase"] = pd.cut(spin_df[pc], bins=[-1,5,14,19], labels=["powerplay","middle","death"])
    return balls, players, matches, spin_df, spin_map

@st.cache_data(show_spinner="⚙️ Computing batter features...")
def build_batter_features(_spin_df):
    rc = "BatsmanRun" if "BatsmanRun" in _spin_df.columns else "batsman_run"
    wc = "IsWicketDelivery" if "IsWicketDelivery" in _spin_df.columns else "is_wicket"
    bc = "Batter" if "Batter" in _spin_df.columns else "batter"
    bf = _spin_df.groupby(bc).agg(
        total_balls=(rc,"count"), total_runs=(rc,"sum"), dismissals=(wc,"sum"),
        dots=(rc,lambda x:(x==0).sum()), fours=(rc,lambda x:(x==4).sum()),
        sixes=(rc,lambda x:(x==6).sum()), ones=(rc,lambda x:(x==1).sum()),
        twos=(rc,lambda x:(x==2).sum()),
    ).reset_index().rename(columns={bc:"Batter"})
    bf["sr"]           = bf["total_runs"]/bf["total_balls"]*100
    bf["avg"]          = (bf["total_runs"]/bf["dismissals"].replace(0,np.nan)).fillna(bf["total_runs"])
    bf["dot_pct"]      = bf["dots"]/bf["total_balls"]*100
    bf["boundary_pct"] = (bf["fours"]+bf["sixes"])/bf["total_balls"]*100
    bf["six_pct"]      = bf["sixes"]/bf["total_balls"]*100
    bf["wkt_rate"]     = bf["dismissals"]/bf["total_balls"]*100
    bf["rotation_pct"] = (bf["ones"]+bf["twos"])/bf["total_balls"]*100
    return bf[bf["total_balls"]>=10].reset_index(drop=True)

@st.cache_data(show_spinner="🏟️ Computing venue features...")
def build_venue_features(_spin_df):
    rc = "BatsmanRun" if "BatsmanRun" in _spin_df.columns else "batsman_run"
    wc = "IsWicketDelivery" if "IsWicketDelivery" in _spin_df.columns else "is_wicket"
    if "venue" not in _spin_df.columns:
        return pd.DataFrame(columns=["venue","venue_spin_wkt_rate","venue_spin_economy"])
    vf = _spin_df.groupby("venue").agg(
        venue_spin_wkt_rate=(wc,"mean"), venue_spin_economy=(rc,"mean"), count=(rc,"count")
    ).reset_index()
    return vf[vf["count"]>=50].drop(columns="count")

@st.cache_data(show_spinner="🏏 Building team rosters...")
def build_team_rosters(_balls, _players):
    bc  = "Batter"      if "Batter"      in _balls.columns else "batter"
    tc  = "BattingTeam" if "BattingTeam" in _balls.columns else "batting_team"
    bwc = "Bowler"      if "Bowler"      in _balls.columns else "bowler"
    team_batters = (_balls[[tc,bc]].dropna().drop_duplicates()
                    .groupby(tc)[bc].apply(list).to_dict())
    spin_names = set(_players[_players["longBowlingStyles"].isin(SPIN_TYPES)]["Name"])
    style_map  = dict(zip(_players["Name"],_players["longBowlingStyles"]))
    if "BowlingTeam" in _balls.columns:
        raw = (_balls[_balls[bwc].isin(spin_names)][["BowlingTeam",bwc]]
               .drop_duplicates().groupby("BowlingTeam")[bwc].apply(list).to_dict())
    else:
        raw = {}
        for team in team_batters:
            bvs = _balls[_balls[tc]==team][bwc].unique()
            raw[team] = [b for b in bvs if b in spin_names]
    team_spin_bowlers = {t:{s:style_map[s] for s in sp if s in style_map} for t,sp in raw.items()}
    return team_batters, team_spin_bowlers

def get_batter_row(bf, name):
    row = bf[bf["Batter"]==name]
    if row.empty:
        return bf[bf["total_balls"]>=30].mean(numeric_only=True), False
    return row.iloc[0], True

def predict_batter(batter_name, spin_type, phase, n_balls, venue, bf, vf):
    stats, found = get_batter_row(bf, batter_name)
    pf = {"powerplay":0.82,"middle":1.0,"death":1.15}.get(phase,1.0)
    sd = {"legbreak googly":0.91,"left-arm wrist-spin":0.88,"right-arm offbreak":1.0,
          "legbreak":0.95,"slow left-arm orthodox":0.97}
    diff    = sd.get(spin_type,1.0)
    avg_wkt = vf["venue_spin_wkt_rate"].mean() if not vf.empty else 0.055
    avg_eco = vf["venue_spin_economy"].mean()  if not vf.empty else 1.35
    vrow    = vf[vf["venue"]==venue] if not vf.empty else pd.DataFrame()
    v_wkt   = float(vrow["venue_spin_wkt_rate"].values[0]) if not vrow.empty else avg_wkt
    v_eco   = float(vrow["venue_spin_economy"].values[0])  if not vrow.empty else avg_eco
    adj_sr    = float(stats["sr"]) * diff * pf * (v_eco/avg_eco)
    pred_runs = round((adj_sr/100)*n_balls, 1)
    base_wkt  = float(stats["wkt_rate"])/100
    adj_wkt   = base_wkt/diff*(v_wkt/avg_wkt)
    nb = int(stats["total_balls"])
    conf = "LOW" if not found else "HIGH" if nb>=100 else "MEDIUM" if nb>=30 else "LOW"
    return {"batter":batter_name,"spin_type":spin_type,"phase":phase,
            "predicted_sr":round(adj_sr,1),"predicted_runs":pred_runs,
            "expected_runs":round(pred_runs*(1-adj_wkt),1),
            "dismissal_prob_pct":round(adj_wkt*100,2),
            "dismiss_in_spell_pct":round((1-(1-adj_wkt)**n_balls)*100,1),
            "confidence":conf,
            "hist_sr":round(float(stats["sr"]),1),"hist_avg":round(float(stats["avg"]),1),
            "dot_pct":round(float(stats["dot_pct"]),1),
            "boundary_pct":round(float(stats["boundary_pct"]),1)}

def monte_carlo(batter_name, spin_type, phase, n_balls, venue, bf, vf, spin_df, n_sim=1000):
    pred      = predict_batter(batter_name,spin_type,phase,n_balls,venue,bf,vf)
    dism_prob = pred["dismissal_prob_pct"]/100
    rc  = "BatsmanRun" if "BatsmanRun" in spin_df.columns else "batsman_run"
    brc = "Batter"     if "Batter"     in spin_df.columns else "batter"
    dist = spin_df[spin_df[brc]==batter_name][rc].values
    if len(dist)<20: dist = spin_df[rc].values
    np.random.seed(42)
    totals=[]
    for _ in range(n_sim):
        total=0
        for _ in range(n_balls):
            if np.random.random()<dism_prob: break
            total+=int(np.random.choice(dist))
        totals.append(total)
    return np.array(totals), pred

# ── KEY FIX 2: load CSV as str to avoid NaN/float issues ─────────────────────
def load_saved_predictions(folder):
    path = os.path.join(folder, PREDICTIONS_FILE)
    if os.path.exists(path):
        return pd.read_csv(path, dtype=str)
    return pd.DataFrame(columns=["saved_at","match_label","batter","bowling_team",
        "spin_type","phase","venue","n_balls","predicted_runs","predicted_sr",
        "expected_runs","dismiss_in_spell_pct","confidence",
        "actual_runs","actual_dismissed","verified_at"])

def save_prediction(folder, row_dict):
    path = os.path.join(folder, PREDICTIONS_FILE)
    df   = load_saved_predictions(folder)
    df   = pd.concat([df, pd.DataFrame([row_dict])], ignore_index=True)
    df.to_csv(path, index=False)

def update_actual(folder, idx, actual_runs, actual_dismissed):
    path = os.path.join(folder, PREDICTIONS_FILE)
    df   = pd.read_csv(path, dtype=str)
    df.at[idx,"actual_runs"]      = str(actual_runs)
    df.at[idx,"actual_dismissed"] = str(actual_dismissed)
    df.at[idx,"verified_at"]      = datetime.now().strftime("%Y-%m-%d %H:%M")
    df.to_csv(path, index=False)

# ── KEY FIX 3: flexible JSON matching ────────────────────────────────────────
def get_actual_runs_from_json(json_folder, batter_name, match_label):
    if not json_folder or not os.path.isdir(json_folder):
        return None, None
    label_lower = match_label.lower()
    words = [w for w in re.split(r'\W+', label_lower) if len(w) >= 4]
    for fp in sorted(glob.glob(os.path.join(json_folder, "*.json"))):
        try:
            with open(fp, encoding="utf-8") as f: m = json.load(f)
        except Exception: continue
        teams = [t.lower() for t in m.get("info",{}).get("teams",[])]
        # match if any meaningful word from label appears in any team name
        if not any(w in team or team in label_lower for w in words for team in teams):
            continue
        batter_runs=0; batter_found=False; was_dismissed=False
        bl = batter_name.lower()
        for inn in m.get("innings",[]):
            for od in inn.get("overs",[]):
                for ball in od.get("deliveries",[]):
                    if ball.get("batter","").lower()==bl:
                        batter_found = True
                        batter_runs += ball.get("runs",{}).get("batter",0)
                        for w in ball.get("wickets",[]):
                            if w.get("player_out","").lower()==bl: was_dismissed=True
        if batter_found: return batter_runs, was_dismissed
    return None, None

def fig_style(fig, axs):
    fig.patch.set_facecolor(DARK_BG)
    for ax in axs:
        ax.set_facecolor(MID_BG); ax.tick_params(colors=SLATE)
        ax.xaxis.label.set_color(SLATE); ax.yaxis.label.set_color(SLATE)
        ax.title.set_color(GOLD)
        for s in ax.spines.values(): s.set_edgecolor(MID_BG)

def plot_radar(stats_row, batter_name):
    cats=["Strike Rate","Average","Boundary%","Rotation%","Dot%*"]
    maxes=[170,55,35,45,50]; mins=[60,5,3,10,20]
    vals=[float(stats_row["sr"]),float(stats_row["avg"]),float(stats_row["boundary_pct"]),
          float(stats_row["rotation_pct"]),float(stats_row["dot_pct"])]
    normed=[(v-mn)/max(mx-mn,1) for v,mn,mx in zip(vals,mins,maxes)]
    normed[-1]=1-normed[-1]
    np_=normed+[normed[0]]
    angles=[n/float(len(cats))*2*np.pi for n in range(len(cats))]+[0]
    fig,ax=plt.subplots(figsize=(4,4),subplot_kw=dict(polar=True))
    fig_style(fig,[ax]); ax.set_facecolor(MID_BG)
    ax.plot(angles,np_,"o-",color=GOLD,linewidth=2)
    ax.fill(angles,np_,alpha=0.25,color=GOLD)
    ax.set_xticks(angles[:-1]); ax.set_xticklabels(cats,color=SLATE,size=8)
    ax.set_ylim(0,1); ax.set_yticks([.25,.5,.75,1]); ax.set_yticklabels(["25","50","75","100"],color=SLATE,size=6)
    ax.grid(color="#2a3f58",linewidth=0.5)
    ax.set_title(f"{batter_name}\nSpin Profile",color=GOLD,size=9,pad=12)
    plt.tight_layout(); return fig

def plot_monte_carlo(totals, batter_name, n_balls):
    fig,ax=plt.subplots(figsize=(7,3.5)); fig_style(fig,[ax])
    ax.hist(totals,bins=25,color=GOLD,alpha=0.7,edgecolor=MID_BG,linewidth=0.5)
    ax.axvline(totals.mean(),color=ORANGE,linestyle="--",lw=2,label=f"Mean: {totals.mean():.1f}")
    ax.axvline(np.percentile(totals,10),color=RED,linestyle=":",lw=1.5,label=f"P10: {np.percentile(totals,10):.1f}")
    ax.axvline(np.percentile(totals,90),color=GREEN,linestyle=":",lw=1.5,label=f"P90: {np.percentile(totals,90):.1f}")
    ax.set_xlabel(f"Total Runs in {n_balls} Balls",color=SLATE); ax.set_ylabel("Simulations",color=SLATE)
    ax.set_title(f"Monte Carlo — {batter_name} (1000 sims)",color=GOLD)
    ax.legend(facecolor=MID_BG,edgecolor=SLATE,labelcolor=SLATE)
    plt.tight_layout(); return fig

def plot_team_comparison(df):
    fig,axes=plt.subplots(1,2,figsize=(12,5)); fig_style(fig,axes)
    ds=df.sort_values("Expected Runs",ascending=True)
    cr=[GREEN if x>=8 else AMBER if x>=5 else RED for x in ds["Expected Runs"]]
    axes[0].barh(ds["Batter"],ds["Expected Runs"],color=cr,height=0.65)
    axes[0].set_title("Expected Runs vs Spin",color=GOLD); axes[0].set_xlabel("Expected Runs",color=SLATE)
    for v,b in zip(ds["Expected Runs"],axes[0].patches):
        axes[0].text(v+0.1,b.get_y()+b.get_height()/2,f"{v:.1f}",va="center",color=SLATE,size=8)
    cd=[GREEN if x<5 else AMBER if x<8 else RED for x in ds["Dismiss%/ball"]]
    axes[1].barh(ds["Batter"],ds["Dismiss%/ball"],color=cd,height=0.65)
    axes[1].set_title("Dismissal Prob per Ball (%)",color=GOLD); axes[1].set_xlabel("Probability (%)",color=SLATE)
    for v,b in zip(ds["Dismiss%/ball"],axes[1].patches):
        axes[1].text(v+0.05,b.get_y()+b.get_height()/2,f"{v:.1f}%",va="center",color=SLATE,size=8)
    plt.tight_layout(); return fig

def plot_accuracy_summary(df_ver):
    counts=df_ver["result"].value_counts().reindex(["Hit ✅","Close ⚠️","Miss ❌"],fill_value=0)
    fig,ax=plt.subplots(figsize=(5,3)); fig_style(fig,[ax])
    ax.bar(counts.index,counts.values,color=[GREEN,AMBER,RED],width=0.5)
    for i,v in enumerate(counts.values): ax.text(i,v+0.1,str(v),ha="center",color=SLATE,fontsize=10)
    ax.set_title("Prediction Accuracy Summary",color=GOLD); ax.set_ylabel("Count",color=SLATE)
    plt.tight_layout(); return fig

def plot_pred_vs_actual(df_ver):
    fig,ax=plt.subplots(figsize=(6,4)); fig_style(fig,[ax])
    ax.scatter(df_ver["predicted_runs"],df_ver["actual_runs"],color=GOLD,alpha=0.8,edgecolors=MID_BG,s=80)
    mx=max(df_ver["predicted_runs"].max(),df_ver["actual_runs"].max())+2
    ax.plot([0,mx],[0,mx],color=SLATE,linestyle="--",lw=1,label="Perfect prediction")
    for _,row in df_ver.iterrows():
        ax.annotate(str(row["batter"]).split()[-1],(row["predicted_runs"],row["actual_runs"]),
                    fontsize=7,color=SLATE,xytext=(3,3),textcoords="offset points")
    ax.set_xlabel("Predicted Runs",color=SLATE); ax.set_ylabel("Actual Runs",color=SLATE)
    ax.set_title("Predicted vs Actual Runs",color=GOLD)
    ax.legend(facecolor=MID_BG,edgecolor=SLATE,labelcolor=SLATE,fontsize=8)
    plt.tight_layout(); return fig

# ─── MAIN ─────────────────────────────────────────────────────────────────────
def main():
    st.markdown('<div class="hero-title">🏏 IPL SPIN PREDICTOR</div>', unsafe_allow_html=True)
    st.markdown('<div class="hero-sub">Cricsheet JSON · Ball-by-Ball Analytics · v4.1</div>', unsafe_allow_html=True)
    st.markdown("---")

    folder = find_csv_folder()
    if folder is None:
        st.error("⚠️ Could not find the 3 CSV files.")
        folder = st.text_input("📁 Folder path containing your CSV files", placeholder="/path/to/your/data")
        if not folder: st.stop()
        if not os.path.isdir(folder): st.error("That path does not exist."); st.stop()
        needed  = {"Ball_By_Ball_Match_Data.csv","2024_players_details.csv","Match_Info.csv"}
        missing = [f for f in needed if not os.path.exists(os.path.join(folder,f))]
        if missing: st.error(f"Missing files: {missing}"); st.stop()
    else:
        st.sidebar.success(f"✅ CSVs loaded from: `{folder}`")

    balls,players,matches,spin_df,spin_map = load_data(folder)
    bf = build_batter_features(spin_df)
    vf = build_venue_features(spin_df)
    team_batters,team_spin_bowlers = build_team_rosters(balls,players)

    all_batters = sorted(bf["Batter"].unique())
    all_venues  = sorted(vf["venue"].unique()) if not vf.empty else sorted(
        balls["venue"].dropna().unique() if "venue" in balls.columns else [])
    all_teams   = sorted(team_batters.keys())

    with st.sidebar:
        st.markdown("### ⚙️ Match Setup")
        venue     = st.selectbox("🏟️ Venue", all_venues) if all_venues else "Unknown"
        phase     = st.selectbox("📊 Match Phase",["powerplay","middle","death"],index=1,
                                 format_func=lambda x:{"powerplay":"Powerplay (1–6)",
                                                        "middle":"Middle (7–15)","death":"Death (16–20)"}[x])
        n_balls   = st.slider("🎯 Balls in Spell",4,24,12,2)
        spin_type = st.selectbox("🌀 Spin Type",SPIN_TYPES)
        st.markdown("---")
        st.markdown("**📊 Dataset**")
        st.caption(f"Total spin deliveries: **{len(spin_df):,}**")
        st.caption(f"Unique batters: **{len(all_batters)}**")
        st.caption(f"Spin bowlers: **{len(spin_map)}**")
        st.caption(f"Venues: **{len(all_venues)}**")
        if not vf.empty and venue!="Unknown":
            vrow=vf[vf["venue"]==venue]
            if not vrow.empty:
                wkt_r=float(vrow["venue_spin_wkt_rate"].values[0])
                eco=float(vrow["venue_spin_economy"].values[0])
                lbl="🟢 Spin Friendly" if wkt_r>0.062 else "🟡 Neutral" if wkt_r>0.05 else "🔴 Batting Friendly"
                st.markdown(f"""<div class="info-box"><b>{venue}</b><br>{lbl}<br>
                    Spin Wkt Rate: <b>{wkt_r*100:.1f}%</b><br>
                    Spin Economy: <b>{eco:.3f}</b> runs/ball</div>""",unsafe_allow_html=True)

    tab1,tab2,tab3,tab4,tab5 = st.tabs([
        "🔮 Single Batter","🏟️ Team vs Team","📊 Deep Dive",
        "💾 Save Predictions","✅ Verify Predictions"])

    # TAB 1
    with tab1:
        st.markdown("#### Predict a Batter's Performance vs Spin")
        c1,c2=st.columns([1,2])
        with c1:
            batter_name=st.selectbox("🏏 Select Batter",all_batters)
            run_btn=st.button("🚀 Run Prediction")
        with c2:
            sr,_=get_batter_row(bf,batter_name)
            st.markdown(f"""<div class="pred-card">
                <div style="font-size:.75rem;color:{SLATE};letter-spacing:.15em;text-transform:uppercase;">
                Historical vs Spin — {int(sr['total_balls'])} balls faced</div>
                <div style="display:flex;gap:2rem;margin-top:.6rem;">
                <div><div class="metric-big">{float(sr['sr']):.0f}</div><div class="metric-label">Strike Rate</div></div>
                <div><div class="metric-big">{float(sr['avg']):.0f}</div><div class="metric-label">Average</div></div>
                <div><div class="metric-big">{float(sr['boundary_pct']):.0f}%</div><div class="metric-label">Boundary%</div></div>
                <div><div class="metric-big">{float(sr['dot_pct']):.0f}%</div><div class="metric-label">Dot%</div></div>
                </div></div>""",unsafe_allow_html=True)
        if run_btn:
            pred=predict_batter(batter_name,spin_type,phase,n_balls,venue,bf,vf)
            totals,_=monte_carlo(batter_name,spin_type,phase,n_balls,venue,bf,vf,spin_df)
            st.markdown("---")
            c1,c2,c3,c4=st.columns(4)
            for col,val,lbl,clr in [(c1,pred["predicted_runs"],f"Predicted Runs ({n_balls} balls)",GOLD),
                                     (c2,pred["predicted_sr"],"Predicted Strike Rate",GOLD),
                                     (c3,pred["expected_runs"],"Expected Runs (risk-adj)",ORANGE),
                                     (c4,f"{pred['dismiss_in_spell_pct']}%","Dismissal Risk in Spell",RED)]:
                col.markdown(f"""<div class="pred-card" style="text-align:center;">
                    <div class="metric-big" style="color:{clr};">{val}</div>
                    <div class="metric-label">{lbl}</div></div>""",unsafe_allow_html=True)
            bc={"HIGH":"badge-high","MEDIUM":"badge-medium","LOW":"badge-low"}[pred["confidence"]]
            st.markdown(f'<span class="{bc}">Confidence: {pred["confidence"]}</span>',unsafe_allow_html=True)
            st.markdown("---")
            ca,cb=st.columns([1,2])
            with ca: st.pyplot(plot_radar(sr,batter_name),use_container_width=True); plt.close()
            with cb:
                st.pyplot(plot_monte_carlo(totals,batter_name,n_balls),use_container_width=True); plt.close()
                x1,x2,x3=st.columns(3)
                x1.metric("Mean",f"{totals.mean():.1f}")
                x2.metric("P10 (Worst)",f"{np.percentile(totals,10):.0f}")
                x3.metric("P90 (Best)",f"{np.percentile(totals,90):.0f}")

    # TAB 2
    with tab2:
        st.markdown("#### Full Team Batting XI vs Spin Bowlers")
        ct1,ct2=st.columns(2)
        with ct1:
            batting_team=st.selectbox("🏏 Batting Team",all_teams,key="bat_team")
            tbats=[b for b in team_batters.get(batting_team,[]) if b in all_batters]
            batting_xi=st.multiselect("Select Batting XI",tbats,default=tbats[:8],max_selections=11,key="bat_xi")
        with ct2:
            bowling_team=st.selectbox("🌀 Bowling Team",all_teams,key="bowl_team")
            spinners=team_spin_bowlers.get(bowling_team,{})
            st.markdown("**Spin Bowlers in XI:**")
            if spinners:
                for b,t in list(spinners.items())[:8]:
                    st.markdown(f'<span class="team-pill">🌀 {b} — {t}</span>',unsafe_allow_html=True)
                primary_spin=list(spinners.values())[0]
            else:
                st.caption("No spin bowlers found"); primary_spin=spin_type
        if st.button("🏟️ Predict Full Team vs Spin"):
            if not batting_xi: st.warning("Select at least 3 batters."); st.stop()
            results=[{"Batter":b,**{k:v for k,v in predict_batter(b,primary_spin,phase,n_balls,venue,bf,vf).items()
                      if k in ("predicted_sr","predicted_runs","expected_runs",
                               "dismissal_prob_pct","dismiss_in_spell_pct","confidence")}}
                     for b in batting_xi]
            df=pd.DataFrame(results).rename(columns={"predicted_sr":"Pred SR","predicted_runs":"Pred Runs",
                "expected_runs":"Expected Runs","dismissal_prob_pct":"Dismiss%/ball",
                "dismiss_in_spell_pct":"Dismiss% in spell","confidence":"Confidence"
            }).sort_values("Expected Runs",ascending=False).reset_index(drop=True)
            st.markdown(f"##### {batting_team} vs {primary_spin} at {venue}")
            def cc(v): return f"color:{'#27ae60' if v=='HIGH' else '#f39c12' if v=='MEDIUM' else '#e74c3c'}"
            def rc(v): return f"color:{'#2ecc71' if v>=8 else '#f39c12' if v>=5 else '#e74c3c'}"
            st.dataframe(df.style.applymap(cc,subset=["Confidence"]).applymap(rc,subset=["Expected Runs"])
                .format({"Pred SR":"{:.1f}","Pred Runs":"{:.1f}","Expected Runs":"{:.1f}",
                         "Dismiss%/ball":"{:.2f}%","Dismiss% in spell":"{:.1f}%"}),
                use_container_width=True,height=380)
            st.pyplot(plot_team_comparison(df),use_container_width=True); plt.close()
            st.markdown(f"""<div class="info-box">🏆 <b>{df.iloc[0]['Batter']}</b> — most dangerous vs spin<br>
                ⚠️ <b>{df.iloc[-1]['Batter']}</b> — most at risk vs spin</div>""",unsafe_allow_html=True)

    # TAB 3
    with tab3:
        st.markdown("#### Batter Deep Dive — Spin Type × Phase Heatmap")
        bdd=st.selectbox("🏏 Select Batter",all_batters,key="dd_batter")
        sdd,_=get_batter_row(bf,bdd)
        ca,cb=st.columns([1,2])
        with ca:
            st.pyplot(plot_radar(sdd,bdd),use_container_width=True); plt.close()
            st.markdown(f"""<div class="pred-card"><b>Historical Spin Stats</b><br><br>
                Balls Faced: <b>{int(sdd['total_balls'])}</b><br>SR: <b>{float(sdd['sr']):.1f}</b><br>
                Avg: <b>{float(sdd['avg']):.1f}</b><br>Dot%: <b>{float(sdd['dot_pct']):.1f}%</b><br>
                Boundary%: <b>{float(sdd['boundary_pct']):.1f}%</b><br>
                Wkt Rate: <b>{float(sdd['wkt_rate']):.2f}%</b></div>""",unsafe_allow_html=True)
        with cb:
            ph_=["powerplay","middle","death"]; dsr,dex=[],[]
            for sp in SPIN_TYPES:
                rsr,rex=[],[]
                for ph in ph_:
                    p=predict_batter(bdd,sp,ph,12,venue,bf,vf)
                    rsr.append(p["predicted_sr"]); rex.append(p["expected_runs"])
                dsr.append(rsr); dex.append(rex)
            fig,axes=plt.subplots(1,2,figsize=(10,4)); fig_style(fig,axes)
            sns.heatmap(pd.DataFrame(dsr,index=SPIN_TYPES,columns=ph_),ax=axes[0],
                        cmap="RdYlGn",annot=True,fmt=".0f",linewidths=0.5,linecolor=DARK_BG)
            axes[0].set_title("Predicted Strike Rate",color=GOLD)
            sns.heatmap(pd.DataFrame(dex,index=SPIN_TYPES,columns=ph_),ax=axes[1],
                        cmap="RdYlGn",annot=True,fmt=".1f",linewidths=0.5,linecolor=DARK_BG)
            axes[1].set_title("Expected Runs (12 balls)",color=GOLD)
            plt.suptitle(f"{bdd} — Spin Type × Phase",color=GOLD,size=11); plt.tight_layout()
            st.pyplot(fig,use_container_width=True); plt.close()
            flat=[(SPIN_TYPES[i],ph_[j],dsr[i][j]) for i in range(len(SPIN_TYPES)) for j in range(3)]
            bm=max(flat,key=lambda x:x[2]); wm=min(flat,key=lambda x:x[2])
            st.markdown(f"""<div class="info-box">🔥 Best: {bdd} vs <b>{bm[0]}</b> · <b>{bm[1]}</b> — SR <b>{bm[2]:.0f}</b><br>
                ❄️ Weakness: vs <b>{wm[0]}</b> · <b>{wm[1]}</b> — SR <b>{wm[2]:.0f}</b></div>""",unsafe_allow_html=True)

    # TAB 4 — Save Predictions
    with tab4:
        st.markdown("#### 💾 Save Pre-Match Predictions")
        st.markdown("""<div class="info-box">Enter the <b>full team names exactly</b> as they appear in
            Cricsheet JSONs (e.g. <b>Sunrisers Hyderabad vs Royal Challengers Bengaluru</b>).
            This is used to auto-match the JSON file later.</div>""",unsafe_allow_html=True)
        st.markdown("---")
        sc1,sc2=st.columns(2)
        with sc1:
            sml=st.text_input("📋 Match Label (use full team names)",
                              placeholder="Sunrisers Hyderabad vs Royal Challengers Bengaluru",
                              key="save_match_label")
            sbt=st.selectbox("🏏 Batting Team",all_teams,key="save_bat_team")
            sbwt=st.selectbox("🌀 Bowling Team",all_teams,key="save_bowl_team")
        with sc2:
            sv=st.selectbox("🏟️ Venue",all_venues,key="save_venue") if all_venues else "Unknown"
            sp=st.selectbox("📊 Phase",["powerplay","middle","death"],index=1,
                            format_func=lambda x:{"powerplay":"Powerplay (1–6)",
                                                   "middle":"Middle (7–15)","death":"Death (16–20)"}[x],
                            key="save_phase")
            snb=st.slider("🎯 Balls in Spell",4,24,12,2,key="save_n_balls")
        sspinners=team_spin_bowlers.get(sbwt,{})
        sst=list(sspinners.values())[0] if sspinners else spin_type
        st.markdown("---")
        stb=[b for b in team_batters.get(sbt,[]) if b in all_batters]
        sxi=st.multiselect("Choose batters to predict",stb,default=stb[:6],max_selections=11,key="save_xi")
        if st.button("👁️ Preview Predictions") and sxi:
            pr=[]
            for b in sxi:
                p=predict_batter(b,sst,sp,snb,sv,bf,vf)
                pr.append({"Batter":b,"Predicted Runs":p["predicted_runs"],"SR":p["predicted_sr"],
                            "Expected Runs":p["expected_runs"],"Dismiss%":p["dismiss_in_spell_pct"],
                            "Confidence":p["confidence"]})
            st.dataframe(pd.DataFrame(pr),use_container_width=True)
        st.markdown("---")
        if st.button("💾 Save These Predictions to File"):
            if not sml.strip(): st.warning("Enter a match label first.")
            elif not sxi: st.warning("Select at least one batter.")
            else:
                cnt=0
                for b in sxi:
                    p=predict_batter(b,sst,sp,snb,sv,bf,vf)
                    save_prediction(folder,{"saved_at":datetime.now().strftime("%Y-%m-%d %H:%M"),
                        "match_label":sml.strip(),"batter":b,"bowling_team":sbwt,
                        "spin_type":sst,"phase":sp,"venue":sv,"n_balls":snb,
                        "predicted_runs":p["predicted_runs"],"predicted_sr":p["predicted_sr"],
                        "expected_runs":p["expected_runs"],"dismiss_in_spell_pct":p["dismiss_in_spell_pct"],
                        "confidence":p["confidence"],"actual_runs":"","actual_dismissed":"","verified_at":""}); cnt+=1
                st.success(f"✅ Saved {cnt} predictions for **{sml}**")
        st.markdown("---")
        sdf=load_saved_predictions(folder)
        if sdf.empty: st.info("No predictions saved yet.")
        else:
            st.dataframe(sdf,use_container_width=True,height=300)
            st.download_button("⬇️ Download saved_predictions.csv",sdf.to_csv(index=False),"saved_predictions.csv","text/csv")
            if st.button("🗑️ Clear ALL saved predictions"):
                path=os.path.join(folder,PREDICTIONS_FILE)
                if os.path.exists(path): os.remove(path)
                st.success("Cleared. Refresh the page.")

    # TAB 5 — Verify Predictions
    with tab5:
        st.markdown("#### ✅ Verify Predictions vs Actual Results")
        st.markdown("""<div class="info-box">
            After the match, enter your JSON folder and click <b>Auto-fetch Actuals</b>.
            The app reads the Cricsheet JSON, tallies each batter's runs, and shows accuracy instantly.
            </div>""",unsafe_allow_html=True)

        sdf=load_saved_predictions(folder)
        if sdf.empty: st.info("No saved predictions. Go to 💾 Save Predictions first."); st.stop()

        match_labels=sdf["match_label"].unique().tolist()
        sel_match=st.selectbox("📋 Select Match to Verify",match_labels,key="ver_match")
        mdf=sdf[sdf["match_label"]==sel_match].copy()
        st.markdown(f"**{len(mdf)} predictions saved for: {sel_match}**")
        st.markdown("---")

        st.markdown("##### 🔍 Auto-lookup from Cricsheet JSONs")
        st.caption("Paste the folder path that contains your .json files")
        jf=st.text_input("📁 Cricsheet JSON folder path",placeholder="D:/ipl_json",key="json_folder")

        if st.button("🔄 Auto-fetch Actuals from JSONs"):
            jf=jf.strip()
            if not jf: st.error("Please enter a folder path.")
            elif not os.path.isdir(jf): st.error(f"Folder not found: `{jf}`")
            else:
                found_count=0; not_found=[]
                with st.spinner("Searching JSON files..."):
                    for idx,row in mdf.iterrows():
                        runs,dismissed=get_actual_runs_from_json(jf,row["batter"],sel_match)
                        if runs is not None:
                            update_actual(folder,idx,runs,dismissed); found_count+=1
                        else: not_found.append(row["batter"])
                if found_count:
                    st.success(f"✅ Auto-filled actuals for **{found_count}** batters!")
                    if not_found: st.warning(f"Not found in JSON (enter manually): {', '.join(not_found)}")
                    st.rerun()  # ← refreshes immediately so accuracy chart appears
                else:
                    st.error("❌ No batters found. Check:\n"
                             f"- Match label contains the team names exactly as in the JSON\n"
                             f"- JSON files are directly in `{jf}` (not in a subfolder)\n"
                             f"- Batter names match Cricsheet format e.g. `V Kohli` not `Virat Kohli`")

        st.markdown("---")
        st.markdown("##### ✏️ Enter / Edit Actuals Manually")
        manual_updates={}
        for i,(idx,row) in enumerate(mdf.iterrows()):
            c1,c2,c3,c4=st.columns([2,1,1,1])
            c1.markdown(f"**{row['batter']}**")
            c2.caption(f"Pred: {row['predicted_runs']} runs")
            # KEY FIX: pre-fill with already-fetched value if it exists
            existing_runs=int(float(row["actual_runs"])) if is_valid_actual(row["actual_runs"]) else 0
            existing_dis=str(row.get("actual_dismissed","")).strip().lower()=="true"
            ar=c3.number_input("Actual Runs",min_value=0,max_value=200,
                               value=existing_runs,key=f"ar_{idx}")
            di=c4.checkbox("Dismissed?",value=existing_dis,key=f"di_{idx}")
            manual_updates[idx]=(ar,di)
        if st.button("💾 Save Manual Actuals"):
            for idx,(runs,dis) in manual_updates.items():
                update_actual(folder,idx,runs,dis)
            st.success("✅ Saved!"); st.rerun()

        # Accuracy results — reloads fresh every time
        st.markdown("---")
        st.markdown("##### 📊 Prediction Accuracy")
        fresh=load_saved_predictions(folder)
        mdf2=fresh[fresh["match_label"]==sel_match].copy()
        verified=mdf2[mdf2["actual_runs"].apply(is_valid_actual)].copy()

        if verified.empty:
            st.info("Click **Auto-fetch Actuals from JSONs** above — results appear here automatically.")
        else:
            verified["actual_runs"]    = verified["actual_runs"].astype(float).astype(int)
            verified["predicted_runs"] = verified["predicted_runs"].astype(float)
            verified["error"]          = (verified["actual_runs"]-verified["predicted_runs"]).round(1)
            verified["abs_error"]      = verified["error"].abs()
            def classify(e):
                return "Hit ✅" if abs(e)<=3 else "Close ⚠️" if abs(e)<=7 else "Miss ❌"
            verified["result"]=verified["error"].apply(classify)

            m1,m2,m3,m4=st.columns(4)
            mae=verified["abs_error"].mean()
            hits=(verified["result"]=="Hit ✅").sum()
            close=(verified["result"]=="Close ⚠️").sum()
            total=len(verified)
            m1.metric("Mean Absolute Error",f"{mae:.1f} runs")
            m2.metric("Hit Rate (±3 runs)",f"{hits}/{total} ({hits/total*100:.0f}%)")
            m3.metric("Close (±7 runs)",f"{hits+close}/{total} ({(hits+close)/total*100:.0f}%)")
            m4.metric("Predictions Verified",str(total))
            st.markdown("---")

            for _,row in verified.iterrows():
                bdg={"Hit ✅":"badge-hit","Close ⚠️":"badge-close","Miss ❌":"badge-miss"}[row["result"]]
                dcls="verify-hit" if "Hit" in row["result"] else "verify-miss"
                ds=" · 🏴 Dismissed" if str(row.get("actual_dismissed","")).strip().lower()=="true" else ""
                st.markdown(f"""<div class="{dcls}">
                    <b>{row['batter']}</b> &nbsp;
                    Predicted <b>{row['predicted_runs']}</b> → Actual <b>{row['actual_runs']}</b>
                    &nbsp;(error: {row['error']:+.0f}){ds}
                    &nbsp;<span class="{bdg}">{row['result']}</span></div>""",unsafe_allow_html=True)

            st.markdown("---")
            ch1,ch2=st.columns(2)
            with ch1: st.pyplot(plot_accuracy_summary(verified),use_container_width=True); plt.close()
            with ch2: st.pyplot(plot_pred_vs_actual(verified),use_container_width=True); plt.close()

            st.download_button("⬇️ Download Verified Results CSV",
                verified[["batter","predicted_runs","actual_runs","error","result",
                           "confidence","dismiss_in_spell_pct","actual_dismissed"]].to_csv(index=False),
                f"verified_{sel_match.replace(' ','_')}.csv","text/csv")

if __name__=="__main__":
    main()