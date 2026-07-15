"""
IPL Spin Prediction Flask API  — 
==============================================================
Functionally identical to the original app.py. Changes are purely about
memory footprint:

  1. The ball-by-ball CSV (the largest file) is now LAZY-LOADED on first
     request that needs it, instead of at import time. This means the
     process's cold-start memory is much lower, which matters most for
     free-tier hosts that kill/OOM on startup memory rather than steady
     state.
  2. Column aliasing now RENAMES instead of duplicating columns
     (runs_batter -> batsmanrun, is_wicket -> iswicketdelivery,
     over -> overs). The original code kept both the old and new column
     in memory forever.
  3. Numeric columns are downcast (int64 -> smallest safe int, float64 ->
     float32) and high-repetition string columns (batter, bowler, venue,
     phase) are converted to `category` dtype, which is typically a large
     win on ball-by-ball data since the same ~300 names repeat across
     hundreds of thousands of rows.
  4. Unused columns are dropped from the ball-by-ball frame after the
     venue-column detection and phase-derivation logic (which need to see
     all columns) has already run.
  5. Removed an unconditional full-dataframe `.copy()` in /player-stats
     that duplicated the entire ball-by-ball frame on every request before
     any filtering happened — the boolean-mask filters already produce
     new frames, so the upfront copy was pure overhead.

Everything else (endpoints, response shapes, model logic, validation) is
unchanged from the original.
"""
from dotenv import load_dotenv
load_dotenv()

from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import joblib
import numpy as np
import pandas as pd
import os
import shutil
from datetime import datetime
from google import genai

app = Flask(__name__)

# Render sits behind a reverse proxy, so without this, Flask sees every
# request as coming from 127.0.0.1 — which means your rate limiter treats
# ALL visitors as a single client sharing one quota. This restores the real
# client IP from Render's X-Forwarded-For header.
from werkzeug.middleware.proxy_fix import ProxyFix
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_DIR  = os.path.join(BASE_DIR, "csv")   # all CSVs and PKLs live here
BACKUP_DIR = os.path.join(CSV_DIR, "backups")
os.makedirs(BACKUP_DIR, exist_ok=True)

# ── Security: CORS + request size limit ──────────────────────────────────────
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS", "*")
CORS(app, origins=ALLOWED_ORIGINS)
app.config["MAX_CONTENT_LENGTH"] = 1 * 1024 * 1024  # 1 MB

# ── Gemini client (reads GEMINI_API_KEY from env) ────────────────────────────
gemini_client = genai.Client()

# ── Security: rate limiting ───────────────────────────────────────────────────
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["200 per hour", "50 per minute"],
    storage_uri="memory://",
)

PROTECTED_CSVS = [
    "batter_features.csv",
    "2026_players_details.csv",
    "batter_vs_spin_stats.csv",
    "venue_features.csv",
    "form_features.csv",
    "batter_spin_features.csv",
    "bowler_spin_stats.csv",
    "cricsheet_balls_parsed.csv",
    "Ball_By_Ball_Match_Data.csv",
    "validation_batter_overall.csv",
    "validation_batter_match.csv",
]

# Set SKIP_LARGE_BACKUPS=1 in env to skip backing up the (potentially huge)
# ball-by-ball CSVs on every startup. Backups don't hold this data in RAM
# (shutil.copy2 streams to disk), but skipping them shaves real startup time
# and disk usage on constrained free-tier hosts. Off by default so behavior
# matches the original file unless you opt in.
_SKIP_LARGE_BACKUPS = os.environ.get("SKIP_LARGE_BACKUPS", "0") == "1"
_LARGE_CSVS = {"cricsheet_balls_parsed.csv", "Ball_By_Ball_Match_Data.csv"}

def backup_csvs():
    """Create a timestamped backup of all CSV files on startup."""
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backed_up = []
    for fname in PROTECTED_CSVS:
        if _SKIP_LARGE_BACKUPS and fname in _LARGE_CSVS:
            continue
        src = os.path.join(BASE_DIR, fname)
        if os.path.exists(src):
            dst = os.path.join(BACKUP_DIR, f"{stamp}_{fname}")
            shutil.copy2(src, dst)
            backed_up.append(fname)
    if backed_up:
        print(f"  Backed up {len(backed_up)} CSVs → backups/{stamp}_*")
    # Keep only last 5 backups per file to avoid disk bloat
    _prune_backups()

def _prune_backups(keep=5):
    """Delete old backups, keeping only the most recent `keep` per file."""
    for fname in PROTECTED_CSVS:
        pattern = f"_{ fname}"
        matches = sorted([
            f for f in os.listdir(BACKUP_DIR) if f.endswith(pattern)
        ])
        for old in matches[:-keep]:
            try:
                os.remove(os.path.join(BACKUP_DIR, old))
            except Exception:
                pass

print("Backing up CSVs...")
backup_csvs()

# ── Load PKL models ───────────────────────────────────────────────────────────
def load_pkl(filename):
    return joblib.load(os.path.join(CSV_DIR, filename))

print("Loading models...")
encoder_phase  = load_pkl("encoder_phase.pkl")
encoder_spin   = load_pkl("encoder_spin.pkl")
model_kmeans   = load_pkl("model_kmeans.pkl")
model_runs     = load_pkl("model_runs.pkl")
model_wicket   = load_pkl("model_wicket.pkl")
scaler_cluster = load_pkl("scaler_cluster.pkl")   # scales 4 cols: sr, dot_pct, boundary_pct, wkt_rate
print("All models loaded.")

# ── Cluster feature columns (v3: only 4 features) ────────────────────────────
CLUSTER_FEATURES = ["sr", "dot_pct", "boundary_pct", "wkt_rate"]

CLUSTER_NAMES = {
    0: "Aggressive Attacker",
    1: "Steady Accumulator",
    2: "Spin Vulnerable",
    3: "Balanced Performer",
}

# ── Venue name cleaning map (normalises cricsheet variants → canonical names) ─
VENUE_MAP = {
    'Wankhede Stadium, Mumbai'                                             : 'Wankhede Stadium',
    'Eden Gardens, Kolkata'                                                : 'Eden Gardens',
    'M Chinnaswamy Stadium, Bengaluru'                                     : 'M Chinnaswamy Stadium',
    'M.Chinnaswamy Stadium'                                                : 'M Chinnaswamy Stadium',
    'MA Chidambaram Stadium, Chepauk'                                      : 'MA Chidambaram Stadium',
    'MA Chidambaram Stadium, Chepauk, Chennai'                             : 'MA Chidambaram Stadium',
    'Arun Jaitley Stadium, Delhi'                                          : 'Arun Jaitley Stadium',
    'Rajiv Gandhi International Stadium, Uppal'                            : 'Rajiv Gandhi International Stadium',
    'Rajiv Gandhi International Stadium, Uppal, Hyderabad'                 : 'Rajiv Gandhi International Stadium',
    'Punjab Cricket Association Stadium, Mohali'                           : 'Punjab Cricket Association IS Bindra Stadium',
    'Punjab Cricket Association IS Bindra Stadium, Mohali'                 : 'Punjab Cricket Association IS Bindra Stadium',
    'Punjab Cricket Association IS Bindra Stadium, Mohali, Chandigarh'    : 'Punjab Cricket Association IS Bindra Stadium',
    'Sawai Mansingh Stadium, Jaipur'                                       : 'Sawai Mansingh Stadium',
    'Narendra Modi Stadium, Ahmedabad'                                     : 'Narendra Modi Stadium',
    'Sardar Patel Stadium, Motera'                                         : 'Narendra Modi Stadium',
    'Dr DY Patil Sports Academy, Mumbai'                                   : 'Dr DY Patil Sports Academy',
    'Brabourne Stadium, Mumbai'                                            : 'Brabourne Stadium',
    'Maharashtra Cricket Association Stadium, Pune'                        : 'Maharashtra Cricket Association Stadium',
    'Bharat Ratna Shri Atal Bihari Vajpayee Ekana Cricket Stadium, Lucknow': 'Ekana Cricket Stadium',
    'Himachal Pradesh Cricket Association Stadium, Dharamsala'             : 'Himachal Pradesh Cricket Association Stadium',
    'Barsapara Cricket Stadium, Guwahati'                                  : 'Barsapara Cricket Stadium',
    'Maharaja Yadavindra Singh International Cricket Stadium, Mullanpur'   : 'New Chandigarh Stadium',
    'Maharaja Yadavindra Singh International Cricket Stadium, New Chandigarh': 'New Chandigarh Stadium',
}

# ── Full v3 feature order (must match training exactly) ───────────────────────
FEATURES_V3 = [
    "Overs", "BallNumber", "Innings",
    "spin_type_enc", "phase_enc",
    "ball_in_over_norm", "is_last_ball", "over_x_ball", "is_death_last",
    "sr", "avg", "dot_pct", "boundary_pct",
    "six_pct", "wkt_rate", "rotation_pct",
    "cluster",
    "venue_spin_wkt_rate", "venue_spin_economy",
    "form_sr_last5",
]

# ── Fallback v1 feature order ─────────────────────────────────────────────────
FEATURES_V1 = [
    "Overs", "BallNumber", "Innings",
    "spin_type_enc", "phase_enc",
    "sr", "avg", "dot_pct", "boundary_pct",
    "six_pct", "wkt_rate", "rotation_pct",
]

# ── Small dtype-optimization helper (used on every CSV we load) ──────────────
def _downcast_numeric(df: pd.DataFrame) -> pd.DataFrame:
    """In-place-ish downcast of int64/float64 columns to the smallest safe dtype."""
    for col in df.select_dtypes(include=["int64", "int32"]).columns:
        df[col] = pd.to_numeric(df[col], downcast="integer")
    for col in df.select_dtypes(include=["float64"]).columns:
        df[col] = pd.to_numeric(df[col], downcast="float")
    return df


def _categorize(df: pd.DataFrame, cols) -> pd.DataFrame:
    """Convert given columns to `category` dtype if present. Big win for
    columns like batter/bowler/venue names that repeat heavily across rows."""
    for col in cols:
        if col in df.columns and df[col].dtype == object:
            df[col] = df[col].astype("category")
    return df


# ── Load small/medium CSVs at startup (these are aggregate/summary tables,
#    not the raw ball-by-ball data, so eager loading is fine — they're needed
#    by /players, /teams, /spin-bowlers etc. right away anyway) ──────────────
print("Loading CSVs...")
bf_df      = _downcast_numeric(pd.read_csv(os.path.join(CSV_DIR, "batter_features.csv")))
players_df = pd.read_csv(os.path.join(CSV_DIR, "2026_players_details.csv"))

# ── batter_vs_spin_stats.csv: generated by notebook, synthesised if missing ───
_bvs_path = os.path.join(CSV_DIR, "batter_vs_spin_stats.csv")
if os.path.exists(_bvs_path):
    bvs_df = pd.read_csv(_bvs_path)
    bvs_df.columns = [c.lower() for c in bvs_df.columns]
    bvs_df = _downcast_numeric(bvs_df)
    print(f"  batter_vs_spin_stats.csv loaded — {len(bvs_df)} rows")
else:
    print("  batter_vs_spin_stats.csv NOT found — synthesising from batter_features.csv")
    bvs_df = bf_df[["Batter", "sr", "avg", "dot_pct", "boundary_pct",
                     "wkt_rate", "total_balls", "dismissals"]].copy()
    bvs_df = bvs_df.rename(columns={"Batter": "batter"})
    bvs_df.to_csv(_bvs_path, index=False)
    print(f"  Synthesised and cached — {len(bvs_df)} rows")

# ── v3 CSVs (optional — fall back to means if missing) ───────────────────────
_venue_path      = os.path.join(CSV_DIR, "venue_features.csv")
_form_path       = os.path.join(CSV_DIR, "form_features.csv")
_bsf_path        = os.path.join(CSV_DIR, "batter_spin_features.csv")  # per-spin-type stats

venue_df         = _downcast_numeric(pd.read_csv(_venue_path)) if os.path.exists(_venue_path) else None
form_df          = _downcast_numeric(pd.read_csv(_form_path))  if os.path.exists(_form_path)  else None
batter_spin_df   = _downcast_numeric(pd.read_csv(_bsf_path))  if os.path.exists(_bsf_path)   else None

if batter_spin_df is not None:
    print(f"  batter_spin_features.csv loaded — {len(batter_spin_df)} batter×spin rows")
else:
    print("  batter_spin_features.csv NOT found — /predict will use career stats only (retrain notebook to fix)")

MODEL_VERSION = "SpinIQ" if (venue_df is not None and form_df is not None) else "SpinIQ"
print(f"Model version detected: {MODEL_VERSION}")

if venue_df is not None:
    print(f"  venue_features.csv loaded — {len(venue_df)} venues")
    _venue_wkt_mean = float(venue_df["venue_spin_wkt_rate"].mean())
    _venue_eco_mean = float(venue_df["venue_spin_economy"].mean())
else:
    print("  venue_features.csv NOT found — using global defaults")
    _venue_wkt_mean = 0.05
    _venue_eco_mean = 0.90

if form_df is not None:
    print(f"  form_features.csv loaded — {len(form_df)} batters")
else:
    print("  form_features.csv NOT found — form_sr_last5 falls back to career SR")

# ── bowler_spin_stats.csv: pre-computed spin type per bowler ──────────────────
_bss_path = os.path.join(CSV_DIR, "bowler_spin_stats.csv")
bowler_spin_df = pd.read_csv(_bss_path) if os.path.exists(_bss_path) else None
if bowler_spin_df is not None:
    print(f"bowler_spin_stats.csv loaded — {len(bowler_spin_df)} bowlers")
    BOWLER_SPIN_LOOKUP = dict(zip(bowler_spin_df["bowler"], bowler_spin_df["spin_type"]))
else:
    print("bowler_spin_stats.csv not found — will derive spin type from players_df")
    BOWLER_SPIN_LOOKUP = {}

# ── Validation CSVs (optional — produced by IPL_Spin_Validation__2_.ipynb) ────
_val_overall_path = os.path.join(CSV_DIR, "validation_batter_overall.csv")
_val_match_path   = os.path.join(CSV_DIR, "validation_batter_match.csv")
val_overall_df = pd.read_csv(_val_overall_path) if os.path.exists(_val_overall_path) else None
val_match_df   = pd.read_csv(_val_match_path)   if os.path.exists(_val_match_path)   else None
if val_overall_df is not None:
    print(f"  validation_batter_overall.csv loaded — {len(val_overall_df)} batters")
else:
    print("  validation_batter_overall.csv not found — run IPL_Spin_Validation__2_.ipynb first")


# ── Ball-by-Ball data: LAZY LOADED ────────────────────────────────────────────
# This is almost certainly the largest CSV in the project (every ball ever
# bowled, across seasons). The original code loaded + processed it at import
# time, meaning the app paid its peak memory cost before serving a single
# request. Here we only touch disk/RAM for it the first time an endpoint
# actually needs it, and cache the result after that.
_cricsheet_path = os.path.join(CSV_DIR, "cricsheet_balls_parsed.csv")
_bbb_path       = os.path.join(CSV_DIR, "Ball_By_Ball_Match_Data.csv")
BBB_AVAILABLE   = os.path.exists(_cricsheet_path) or os.path.exists(_bbb_path)

# Columns we actually reference anywhere in the API. Anything else gets
# dropped after load to cut memory further. (Venue column name is dynamic —
# it's added to this set once detected.)
_BBB_ESSENTIAL_COLS = {
    "batter", "Batter", "bowler", "Bowler",
    "batsmanrun", "batsman_runs", "iswicketdelivery", "player_dismissed",
    "overs", "over", "season", "phase", "innings", "Innings",
}

_bbb_cache = {"df": None, "venue_col": None, "loaded": False}


def _id_to_season(match_id):
    if   match_id < 392000:  return 2008
    elif match_id < 430000:  return 2009
    elif match_id < 501000:  return 2010
    elif match_id < 548000:  return 2011
    elif match_id < 566000:  return 2012
    elif match_id < 598000:  return 2013
    elif match_id < 729000:  return 2014
    elif match_id < 829000:  return 2015
    elif match_id < 981000:  return 2016
    elif match_id < 1082000: return 2017
    elif match_id < 1136000: return 2018
    elif match_id < 1175000: return 2019
    elif match_id < 1216000: return 2020
    elif match_id < 1254000: return 2021
    elif match_id < 1304000: return 2022
    elif match_id < 1370000: return 2023
    elif match_id < 1415000: return 2024
    else:                    return 2025


def _over_to_phase(o):
    if o < 6:  return "Powerplay"
    if o < 15: return "Middle"
    return "Death"


def _load_bbb_df():
    """Load, clean, and cache the ball-by-ball dataframe. Runs once, on first
    access, not at import time."""
    if os.path.exists(_cricsheet_path):
        df = pd.read_csv(_cricsheet_path)
        print(f"[lazy] cricsheet_balls_parsed.csv loaded — {len(df)} rows")

        # ── Alias cricsheet columns → names the rest of the code expects.
        #    RENAME instead of duplicate-assign so we don't keep two copies
        #    of the same column in memory. ──────────────────────────────
        rename_map = {}
        if "runs_batter" in df.columns and "batsmanrun" not in df.columns:
            rename_map["runs_batter"] = "batsmanrun"
        if "is_wicket" in df.columns and "iswicketdelivery" not in df.columns:
            rename_map["is_wicket"] = "iswicketdelivery"
        if "over" in df.columns and "overs" not in df.columns:
            rename_map["over"] = "overs"
        if rename_map:
            df = df.rename(columns=rename_map)
            print(f"  Column aliases applied (renamed, not duplicated): {rename_map}")

        if "season" in df.columns:
            df["season"] = df["season"].astype(str).str.split('/').str[0].astype(int)
            print(f"  Seasons cleaned: {sorted(df['season'].unique())}")

        if "venue" in df.columns:
            df["venue"] = df["venue"].replace(VENUE_MAP)
            print(f"  Venues after cleaning: {df['venue'].nunique()} unique")

    elif os.path.exists(_bbb_path):
        df = pd.read_csv(_bbb_path)
        print(f"[lazy] Ball_By_Ball_Match_Data.csv loaded (fallback) — {len(df)} rows")
        df.columns = [c.lower() for c in df.columns]
        if "season" not in df.columns:
            df["season"] = df["id"].apply(_id_to_season)
            print(f"  'season' derived from ID — {sorted(df['season'].unique())}")
        if "venue" in df.columns:
            df["venue"] = df["venue"].replace(VENUE_MAP)
            print(f"  Venues after cleaning: {df['venue'].nunique()} unique")
    else:
        return None, None

    over_col = next((c for c in df.columns if c in ("overs", "over")), None)
    if "phase" not in df.columns and over_col:
        df["phase"] = df[over_col].apply(_over_to_phase)
        print("  'phase' derived from overs")

    vcands = [c for c in df.columns if any(k in c for k in ("venue", "stadium", "ground", "city", "location"))]
    venue_col = vcands[0] if vcands else None
    print(f"  Venue column: {venue_col}")

    # ── Dtype optimization ────────────────────────────────────────────────
    df = _downcast_numeric(df)
    categorize_cols = {"batter", "Batter", "bowler", "Bowler", "phase"}
    if venue_col:
        categorize_cols.add(venue_col)
    df = _categorize(df, categorize_cols)

    # ── Drop columns we never use, to shrink the resident frame ───────────
    keep_cols = set(_BBB_ESSENTIAL_COLS)
    if venue_col:
        keep_cols.add(venue_col)
    drop_cols = [c for c in df.columns if c not in keep_cols]
    if drop_cols:
        df = df.drop(columns=drop_cols)
        print(f"  Dropped {len(drop_cols)} unused columns to save memory")

    mem_mb = df.memory_usage(deep=True).sum() / 1e6
    print(f"  Ball-by-ball frame ready — {len(df)} rows, ~{mem_mb:.1f} MB in memory")
    return df, venue_col


def get_bbb_df():
    """Public accessor: lazily loads (once) and returns the ball-by-ball df,
    or None if no such file exists."""
    if not _bbb_cache["loaded"]:
        df, vcol = _load_bbb_df()
        _bbb_cache["df"] = df
        _bbb_cache["venue_col"] = vcol
        _bbb_cache["loaded"] = True
    return _bbb_cache["df"]


def get_bbb_venue_col():
    get_bbb_df()  # ensure loaded/cached
    return _bbb_cache["venue_col"]


if not BBB_AVAILABLE:
    print("No ball-by-ball CSV found — phase/season/venue breakdowns will be estimated")


# ── Input validation helpers ──────────────────────────────────────────────────
VALID_SPIN_TYPES = {
    "right-arm offbreak", "slow left-arm orthodox",
    "legbreak", "legbreak googly", "left-arm wrist-spin",
}
VALID_PHASES = {"Powerplay", "Middle", "Death", "powerplay", "middle", "death"}

def _validate_predict_input(data):
    """Returns (cleaned_data, error_string). error_string is None if valid."""
    try:
        player_id = int(data.get("player_id", 0))
    except (TypeError, ValueError):
        return None, "player_id must be an integer"
    if player_id <= 0:
        return None, "player_id must be a positive integer"

    spin_type = str(data.get("spin_type", "right-arm offbreak")).strip()
    if spin_type not in VALID_SPIN_TYPES:
        return None, f"spin_type must be one of: {sorted(VALID_SPIN_TYPES)}"

    phase = str(data.get("phase", "Middle")).strip()
    if phase not in VALID_PHASES:
        return None, f"phase must be one of: Powerplay, Middle, Death"

    venue = str(data.get("venue", ""))[:100]  # cap length

    try:
        innings = int(data.get("innings", 1))
        if innings not in (1, 2):
            return None, "innings must be 1 or 2"
    except (TypeError, ValueError):
        return None, "innings must be 1 or 2"

    try:
        n_balls = int(data.get("n_balls", 12))
        if not (1 <= n_balls <= 120):
            return None, "n_balls must be between 1 and 120"
    except (TypeError, ValueError):
        return None, "n_balls must be an integer"

    return {
        "player_id": player_id,
        "spin_type": spin_type,
        "phase":     phase,
        "venue":     venue,
        "innings":   innings,
        "n_balls":   n_balls,
    }, None


def get_batter_name(player_id: int):
    row = players_df[players_df["ID"] == player_id]
    if row.empty:
        return None
    return row.iloc[0].get("Name") or row.iloc[0].get("longName")


def get_cluster(bf: dict) -> int:
    """Compute KMeans cluster from the 4-feature scaler (v3)."""
    try:
        X = np.array([[
            float(bf.get("sr", 0)),
            float(bf.get("dot_pct", 0)),
            float(bf.get("boundary_pct", 0)),
            float(bf.get("wkt_rate", 0)),
        ]])
        X_scaled = scaler_cluster.transform(X)
        return int(model_kmeans.predict(X_scaled)[0])
    except Exception:
        return 0


def get_venue_stats(venue: str):
    """Return (venue_spin_wkt_rate, venue_spin_economy) for a given venue."""
    if venue_df is not None and venue:
        mask = venue_df["venue"].str.contains(venue, case=False, na=False)
        row  = venue_df[mask]
        if not row.empty:
            return float(row.iloc[0]["venue_spin_wkt_rate"]), float(row.iloc[0]["venue_spin_economy"])
    return _venue_wkt_mean, _venue_eco_mean


def get_form_sr(batter_name: str, fallback_sr: float) -> float:
    """Return the batter's recent form SR (last-5 innings vs spin)."""
    if form_df is not None:
        row = form_df[form_df["Batter"] == batter_name]
        if not row.empty:
            return float(row.iloc[0]["form_sr_last5"])
    return fallback_sr


def get_spin_specific_stats(batter_name: str, spin_type: str) -> dict | None:
    """
    Return per-spin-type stats for a batter from batter_spin_features.csv.
    Returns None if the file isn't loaded or the batter has < 20 balls vs that spin type.
    """
    MIN_BALLS_SPIN = 20
    if batter_spin_df is None:
        return None
    row = batter_spin_df[
        (batter_spin_df["Batter"]    == batter_name) &
        (batter_spin_df["spin_type"] == spin_type)
    ]
    if row.empty or int(row.iloc[0].get("total_balls", 0)) < MIN_BALLS_SPIN:
        return None
    return row.iloc[0].to_dict()


def build_feature_vector(bf: dict, spin_enc: int, phase_enc: int,
                          phase: str, innings: int,
                          venue: str, batter_name: str,
                          spin_type: str = ""):
    """
    Build the correct feature DataFrame for whichever model version is active.
    """
    over_map = {"Powerplay": 3, "powerplay": 3,
                "Middle": 10,   "middle": 10,
                "Death": 17,    "death": 17}
    over_num = over_map.get(phase, 10)
    ball_num = 3

    spin_bf = get_spin_specific_stats(batter_name, spin_type) if spin_type else None
    src     = spin_bf if spin_bf is not None else bf

    sr           = float(src.get("sr", 100))
    avg          = float(src.get("avg", 25))
    dot_pct      = float(src.get("dot_pct", 40))
    boundary_pct = float(src.get("boundary_pct", 15))
    six_pct      = float(src.get("six_pct", 5))
    wkt_rate     = float(src.get("wkt_rate", 5))
    rotation_pct = float(src.get("rotation_pct", 25))

    if MODEL_VERSION == "SpinIQ":
        cluster           = get_cluster(bf)
        v_wkt, v_eco      = get_venue_stats(venue)
        form_sr           = get_form_sr(batter_name, sr)
        ball_in_over_norm = ball_num / 6
        is_last_ball      = 0
        over_x_ball       = over_num * ball_num
        is_death_last     = int(over_num >= 17 and ball_num >= 5)

        vals = [
            over_num, ball_num, innings,
            spin_enc, phase_enc,
            ball_in_over_norm, is_last_ball, over_x_ball, is_death_last,
            sr, avg, dot_pct, boundary_pct,
            six_pct, wkt_rate, rotation_pct,
            cluster,
            v_wkt, v_eco,
            form_sr,
        ]
        return pd.DataFrame([vals], columns=FEATURES_V3), FEATURES_V3

    else:  # v1
        vals = [
            over_num, ball_num, innings,
            spin_enc, phase_enc,
            sr, avg, dot_pct, boundary_pct,
            six_pct, wkt_rate, rotation_pct,
        ]
        return pd.DataFrame([vals], columns=FEATURES_V1), FEATURES_V1


# ── Spin type reference table + bowler→spin-type lookup, shared by
#    /player-stats and /player-spin-breakdown (previously duplicated inline
#    inside player_stats() only). ─────────────────────────────────────────────
SPIN_TYPES = [
    ("right-arm offbreak",     "Off Spin",            "OB"),
    ("slow left-arm orthodox", "Left Arm Orthodox",   "SLA"),
    ("legbreak",               "Leg Spin",            "LB"),
    ("legbreak googly",        "Leg Spin (Googly)",   "LBG"),
    ("left-arm wrist-spin",    "Left Arm Wrist Spin", "LWS"),
]

def get_bowler_spin_map():
    """bowler name -> spin_type key, from bowler_spin_stats.csv if available,
    else derived from players_df bowling styles."""
    if BOWLER_SPIN_LOOKUP:
        return dict(BOWLER_SPIN_LOOKUP)
    bowler_spin_map = {}
    for _, row in players_df.iterrows():
        name  = row.get("Name") or row.get("longName", "")
        style = str(row.get("longBowlingStyles", "")).lower()
        for spin_key, _, _ in SPIN_TYPES:
            if spin_key in style:
                bowler_spin_map[name] = spin_key
                break
    return bowler_spin_map


def _apply_venue_filter(df, venue_col, venue_filter):
    if not venue_filter or not venue_col or venue_col not in df.columns:
        return df
    exact = df[df[venue_col] == venue_filter]
    return exact if not exact.empty else df[df[venue_col].str.contains(venue_filter, case=False, na=False)]


def _apply_season_filter(df, season_filter):
    if not season_filter or "season" not in df.columns:
        return df
    try:
        return df[df["season"] == int(season_filter)]
    except (TypeError, ValueError):
        return df


def _apply_spin_filter(df, spin_filter, bowler_col="bowler"):
    if not spin_filter or bowler_col not in df.columns:
        return df
    bowler_spin_map = get_bowler_spin_map()
    spin_bowlers = [b for b, s in bowler_spin_map.items() if s == spin_filter]
    return df[df[bowler_col].isin(spin_bowlers)]


# ─────────────────────────────────────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
@limiter.exempt
def health():
    return jsonify({
        "status":            "ok",
        "models_loaded":     True,
        "model_version":     MODEL_VERSION,
        "venue_features":    venue_df is not None,
        "form_features":     form_df  is not None,
        "ball_by_ball":      BBB_AVAILABLE,          # configured, not necessarily loaded yet
        "ball_by_ball_loaded": _bbb_cache["loaded"],
        "validation_data":   val_overall_df is not None,
        "batters_in_model":  len(bf_df),
    })


@app.route("/players", methods=["GET"])
def get_players():
    """All players from 2026_players_details.csv, sorted by balls faced vs
    spin (most-faced first) so the search box surfaces established players
    before obscure/low-data ones, instead of raw CSV order."""
    players = players_df.copy()
    players["ID"] = pd.to_numeric(players["ID"], errors="coerce").fillna(0).astype(int)

    balls_lookup = dict(zip(bf_df["Batter"], bf_df.get("total_balls", pd.Series(dtype=int))))

    def _balls_for(row):
        for candidate in (row.get("Name"), row.get("longName")):
            if candidate in balls_lookup:
                return int(balls_lookup[candidate])
        return 0

    players["balls_vs_spin"] = players.apply(_balls_for, axis=1)
    players = players.sort_values("balls_vs_spin", ascending=False, kind="mergesort")

    players = players.where(pd.notnull(players), "")
    return jsonify(players.to_dict(orient="records"))


@app.route("/teams", methods=["GET"])
def get_teams():
    """Unique IPL team names derived from players CSV."""
    col = None
    for c in ["longTeamNames", "teamName", "team"]:
        if c in players_df.columns:
            col = c
            break

    if col is None:
        return jsonify([
            "Chennai Super Kings", "Mumbai Indians",
            "Royal Challengers Bengaluru", "Kolkata Knight Riders",
            "Delhi Capitals", "Sunrisers Hyderabad",
            "Rajasthan Royals", "Punjab Kings",
            "Lucknow Super Giants", "Gujarat Titans",
        ])

    teams = sorted(players_df[col].dropna().unique().tolist())
    teams = [t for t in teams if t and str(t).strip()]
    return jsonify(teams)


@app.route("/spin-bowlers", methods=["GET"])
def get_spin_bowlers():
    """Returns all players whose bowling style is one of the 5 spin types."""
    SPIN_KEYS = [
        "right-arm offbreak",
        "slow left-arm orthodox",
        "legbreak",
        "legbreak googly",
        "left-arm wrist-spin",
    ]
    SPIN_LABEL = {
        "right-arm offbreak":     "Off Spin",
        "slow left-arm orthodox": "Left Arm Orthodox",
        "legbreak":               "Leg Spin",
        "legbreak googly":        "Leg Spin (Googly)",
        "left-arm wrist-spin":    "Left Arm Wrist Spin",
    }

    df = players_df.copy()
    df["longBowlingStyles"] = df["longBowlingStyles"].replace("Na", np.nan)
    mask = df["longBowlingStyles"].str.lower().isin(SPIN_KEYS)
    spin = df[mask][["ID", "longName", "Name", "longBowlingStyles"]].copy()
    spin = spin.where(pd.notnull(spin), "")
    spin["spinLabel"] = spin["longBowlingStyles"].str.lower().map(SPIN_LABEL).fillna("Spin")

    team_filter = request.args.get("team", "").strip()
    if team_filter and "longTeamNames" in df.columns:
        team_ids = df[df["longTeamNames"].str.contains(team_filter, na=False, case=False)]["ID"]
        spin = spin[spin["ID"].isin(team_ids)]

    return jsonify(spin.to_dict(orient="records"))


@app.route("/venues", methods=["GET"])
def get_venues():
    """Return venues with spin stats if venue_features.csv exists."""
    if venue_df is not None:
        data = venue_df.copy()
        data = data.where(pd.notnull(data), None)
        return jsonify(data.to_dict(orient="records"))
    return jsonify([
        {"venue": "Wankhede Stadium"},
        {"venue": "M. A. Chidambaram Stadium"},
        {"venue": "Eden Gardens"},
        {"venue": "Arun Jaitley Stadium"},
        {"venue": "Chinnaswamy Stadium"},
        {"venue": "Rajiv Gandhi Stadium"},
        {"venue": "Sawai Mansingh Stadium"},
        {"venue": "Punjab Cricket Association IS Bindra Stadium"},
        {"venue": "Ekana Cricket Stadium"},
        {"venue": "Narendra Modi Stadium"},
    ])


@app.route("/player-seasons/<int:player_id>", methods=["GET"])
def player_seasons(player_id):
    """Return every season the player has ever faced a ball in, with ball
    counts recomputed under the optional venue/spin_type filters. Seasons
    are always listed (even at balls=0 under the current filter) so the
    frontend dropdown can grey out dead-end options instead of losing them."""
    LOW_DATA = 30
    venue_filter = request.args.get("venue")
    spin_filter  = request.args.get("spin_type")

    batter_name = get_batter_name(player_id)
    if not batter_name:
        return jsonify({"error": "Player not found"}), 404

    bbb_df = get_bbb_df()
    if bbb_df is None or "season" not in bbb_df.columns:
        return jsonify({"seasons": []})

    batter_col = None
    for col in ["batter", "Batter"]:
        if col in bbb_df.columns:
            batter_col = col
            break
    if not batter_col:
        return jsonify({"seasons": []})

    player_rows = bbb_df[bbb_df[batter_col] == batter_name]
    if player_rows.empty:
        return jsonify({"seasons": []})

    # Full career season list — always shown regardless of filters.
    all_seasons = sorted(player_rows["season"].dropna().unique(), reverse=True)

    venue_col = get_bbb_venue_col()
    filtered_rows = _apply_venue_filter(player_rows, venue_col, venue_filter)
    filtered_rows = _apply_spin_filter(filtered_rows, spin_filter)

    result = []
    for season in all_seasons:
        balls = int((filtered_rows["season"] == season).sum())
        result.append({
            "season":   str(int(season)),
            "balls":    balls,
            "low_data": 0 < balls < LOW_DATA,
        })

    return jsonify({"seasons": result})


@app.route("/player-venues/<int:player_id>", methods=["GET"])
def player_venues(player_id):
    """Return every venue the player has ever faced a ball at, with ball
    counts recomputed under the optional season/spin_type filters. Venues
    are always listed (even at balls=0 under the current filter) so the
    frontend dropdown can grey out dead-end options instead of losing them."""
    LOW_DATA = 20
    season_filter = request.args.get("season")
    spin_filter   = request.args.get("spin_type")

    batter_name = get_batter_name(player_id)
    if not batter_name:
        return jsonify({"error": "Player not found"}), 404

    bbb_df = get_bbb_df()
    venue_col = get_bbb_venue_col()
    if bbb_df is None or not venue_col or venue_col not in bbb_df.columns:
        return jsonify({"venues": []})

    batter_col = next((c for c in bbb_df.columns if c in ("batter", "Batter")), None)
    if not batter_col:
        return jsonify({"venues": []})

    player_rows = bbb_df[bbb_df[batter_col] == batter_name]
    if player_rows.empty:
        return jsonify({"venues": []})

    # Full career venue list — always shown regardless of filters.
    all_venues = sorted(player_rows[venue_col].dropna().unique().tolist())

    filtered_rows = _apply_season_filter(player_rows, season_filter)
    filtered_rows = _apply_spin_filter(filtered_rows, spin_filter)

    result = []
    for v in all_venues:
        balls = int((filtered_rows[venue_col] == v).sum())
        result.append({
            "venue":    str(v),
            "balls":    balls,
            "low_data": 0 < balls < LOW_DATA,
        })

    return jsonify({"venues": result})


@app.route("/player-spin-breakdown/<int:player_id>", methods=["GET"])
def player_spin_breakdown(player_id):
    """Lightweight per-spin-type ball counts for a player, filtered by the
    optional season/venue params. Powers the live spin-type dropdown preview
    without needing the full /player-stats payload."""
    season_filter = request.args.get("season")
    venue_filter  = request.args.get("venue")

    batter_name = get_batter_name(player_id)
    if not batter_name:
        return jsonify({"error": "Player not found"}), 404

    bbb_df = get_bbb_df()
    if bbb_df is None:
        return jsonify({"spinTypes": [], "total_balls": 0})

    batter_col = next((c for c in ("batter", "Batter") if c in bbb_df.columns), None)
    bowler_col = next((c for c in ("bowler", "Bowler") if c in bbb_df.columns), None)
    if not batter_col or not bowler_col:
        return jsonify({"spinTypes": [], "total_balls": 0})

    player_rows = bbb_df[bbb_df[batter_col] == batter_name]
    if player_rows.empty:
        return jsonify({"spinTypes": [], "total_balls": 0})

    venue_col = get_bbb_venue_col()
    filtered_rows = _apply_season_filter(player_rows, season_filter)
    filtered_rows = _apply_venue_filter(filtered_rows, venue_col, venue_filter)

    bowler_spin_map = get_bowler_spin_map()
    spin_types_out = []
    for spin_key, spin_label, spin_short in SPIN_TYPES:
        spin_bowlers = [b for b, s in bowler_spin_map.items() if s == spin_key]
        balls = int(filtered_rows[bowler_col].isin(spin_bowlers).sum())
        spin_types_out.append({
            "type":  spin_label,
            "short": spin_short,
            "balls": balls,
        })

    return jsonify({
        "spinTypes":   spin_types_out,
        "total_balls": int(len(filtered_rows)),
    })


@app.route("/player-stats/<int:player_id>", methods=["GET"])
@limiter.limit("60 per minute")
def player_stats(player_id):
    filter_season   = request.args.get("season",   None)
    filter_spin_key = request.args.get("spin_type", None)
    filter_venue    = request.args.get("venue",    None)

    batter_name = get_batter_name(player_id)
    if not batter_name:
        return jsonify({"error": "Player not found"}), 404

    bf_row = bf_df[bf_df["Batter"] == batter_name]
    if bf_row.empty:
        bf_row = bf_df[bf_df["Batter"].str.contains(batter_name.split()[-1], na=False)]
    if bf_row.empty:
        return jsonify({"error": f"No stats found for {batter_name}"}), 404

    bf = bf_row.iloc[0]
    bvs_rows = bvs_df[bvs_df["batter"] == batter_name]

    bbb_full = get_bbb_df()
    BBB_VENUE_COL = get_bbb_venue_col()
    # NOTE: no upfront .copy() here — the boolean-mask filters below already
    # produce new frames, so an eager full-table copy of the (largest) frame
    # was pure overhead in the original code.
    bbb_filtered = bbb_full
    if bbb_filtered is not None:
        if filter_season:
            bbb_filtered = bbb_filtered[bbb_filtered["season"] == int(filter_season)]
        if filter_spin_key:
            if BOWLER_SPIN_LOOKUP:
                _spin_bowlers = [b for b, s in BOWLER_SPIN_LOOKUP.items() if s == filter_spin_key]
            else:
                _spin_bowlers = [
                    (row.get("Name") or row.get("longName", ""))
                    for _, row in players_df.iterrows()
                    if filter_spin_key in str(row.get("longBowlingStyles", "")).lower()
                ]
            bbb_filtered = bbb_filtered[bbb_filtered["bowler"].isin(_spin_bowlers)]
        if filter_venue and BBB_VENUE_COL and BBB_VENUE_COL in bbb_filtered.columns:
            exact = bbb_filtered[bbb_filtered[BBB_VENUE_COL] == filter_venue]
            bbb_filtered = exact if not exact.empty else bbb_filtered[bbb_filtered[BBB_VENUE_COL].str.contains(filter_venue, case=False, na=False)]
    sr           = float(bf.get("sr", 0))
    avg          = float(bf.get("avg", 0))
    dot_pct      = float(bf.get("dot_pct", 0))
    boundary_pct = float(bf.get("boundary_pct", 0))
    six_pct      = float(bf.get("six_pct", 0))
    wkt_rate     = float(bf.get("wkt_rate", 0))
    rotation_pct = float(bf.get("rotation_pct", 0))
    total_balls  = int(bf.get("total_balls", 0))
    dismissals   = int(bf.get("dismissals", 0))

    if bbb_filtered is not None and (filter_season or filter_spin_key or filter_venue):
        bbb_player_filtered = bbb_filtered[bbb_filtered["batter"] == batter_name]
        if not bbb_player_filtered.empty:
            f_balls      = len(bbb_player_filtered)
            f_runs       = bbb_player_filtered["batsmanrun"].sum()
            f_wkts       = int(bbb_player_filtered["iswicketdelivery"].sum())
            f_dots       = int((bbb_player_filtered["batsmanrun"] == 0).sum())
            f_fours      = int((bbb_player_filtered["batsmanrun"] == 4).sum())
            f_sixes      = int((bbb_player_filtered["batsmanrun"] == 6).sum())
            f_boundaries = f_fours + f_sixes
            sr           = round(f_runs / f_balls * 100, 2) if f_balls > 0 else sr
            avg          = round(f_runs / max(1, f_wkts), 2)
            dot_pct      = round(f_dots / f_balls * 100, 2) if f_balls > 0 else dot_pct
            boundary_pct = round(f_boundaries / f_balls * 100, 2) if f_balls > 0 else boundary_pct
            six_pct      = round(f_sixes / f_balls * 100, 2) if f_balls > 0 else six_pct
            wkt_rate     = round(f_wkts / f_balls * 100, 2) if f_balls > 0 else wkt_rate
            total_balls  = f_balls
            dismissals   = f_wkts

    ones   = int(bf.get("ones",   0))
    twos   = int(bf.get("twos",   0))
    fours  = int(bf.get("fours",  0))
    sixes  = int(bf.get("sixes",  0))
    dots   = int(bf.get("dots",   0))
    _total = ones + twos + fours + sixes + dots
    if _total > 0:
        runs_distribution = [
            {"name": "Singles", "value": round(ones  / _total * 100, 1)},
            {"name": "Twos",    "value": round(twos  / _total * 100, 1)},
            {"name": "Fours",   "value": round(fours / _total * 100, 1)},
            {"name": "Sixes",   "value": round(sixes / _total * 100, 1)},
            {"name": "Dots",    "value": round(dots  / _total * 100, 1)},
        ]
    else:
        runs_distribution = [
            {"name": "Singles", "value": round(rotation_pct * 0.75, 1)},
            {"name": "Twos",    "value": round(rotation_pct * 0.25, 1)},
            {"name": "Fours",   "value": round(max(0, boundary_pct - six_pct), 1)},
            {"name": "Sixes",   "value": round(six_pct, 1)},
            {"name": "Dots",    "value": round(dot_pct, 1)},
        ]

    cluster      = get_cluster(bf.to_dict())
    cluster_name = CLUSTER_NAMES.get(cluster, "Unknown")

    caught  = max(1, round(dismissals * 0.50))
    bowled  = max(1, round(dismissals * 0.20))
    lbw     = max(1, round(dismissals * 0.15))
    stumped = max(1, round(dismissals * 0.10))
    other   = max(0, dismissals - caught - bowled - lbw - stumped)
    dismissals_data = [
        {"name": "Caught",  "value": caught},
        {"name": "Bowled",  "value": bowled},
        {"name": "LBW",     "value": lbw},
        {"name": "Stumped", "value": stumped},
        {"name": "Other",   "value": other},
    ]

    phases = []
    BBB_BATTER_COL = None
    if bbb_filtered is not None:
        for col in ["batter", "Batter"]:
            if col in bbb_filtered.columns:
                BBB_BATTER_COL = col
                break

    if bbb_filtered is not None and BBB_BATTER_COL and "phase" in bbb_filtered.columns:
        bbb_player = bbb_filtered[bbb_filtered[BBB_BATTER_COL] == batter_name]
        for phase_name in ["Powerplay", "Middle", "Death"]:
            p = bbb_player[bbb_player["phase"] == phase_name]
            if not p.empty:
                p_balls = len(p)
                p_runs = p["batsmanrun"].sum() if "batsmanrun" in p.columns else 0
                p_wkts = p["iswicketdelivery"].sum() if "iswicketdelivery" in p.columns else 0
                phases.append({
                    "phase": phase_name,
                    "sr":    round(p_runs / p_balls * 100, 1) if p_balls > 0 else 0,
                    "avg":   round(p_runs / max(1, p_wkts), 1),
                    "balls": int(p_balls),
                })

    if not phases:
        phases = [
            {"phase": "Powerplay", "sr": round(sr * 0.95, 1), "avg": round(avg * 0.85, 1), "balls": round(total_balls * 0.20)},
            {"phase": "Middle",    "sr": round(sr * 0.90, 1), "avg": round(avg * 1.10, 1), "balls": round(total_balls * 0.55)},
            {"phase": "Death",     "sr": round(sr * 1.20, 1), "avg": round(avg * 0.75, 1), "balls": round(total_balls * 0.25)},
        ]

    if BOWLER_SPIN_LOOKUP:
        bowler_spin_map = dict(BOWLER_SPIN_LOOKUP)
    else:
        bowler_spin_map = {}
        for _, row in players_df.iterrows():
            name  = row.get("Name") or row.get("longName", "")
            style = str(row.get("longBowlingStyles", "")).lower()
            for spin_key, _, _ in SPIN_TYPES:
                if spin_key in style:
                    bowler_spin_map[name] = spin_key
                    break

    spin_comparison = []
    BBB_BOWLER_COL  = None
    if bbb_filtered is not None:
        for col in ["bowler", "Bowler"]:
            if col in bbb_filtered.columns:
                BBB_BOWLER_COL = col
                break
    BBB_BATTER_COL2 = BBB_BATTER_COL or "Batter"

    for spin_key, spin_label, spin_short in SPIN_TYPES:
        if bbb_filtered is not None and BBB_BATTER_COL2 in bbb_filtered.columns and BBB_BOWLER_COL:
            spin_bowlers = [b for b, s in bowler_spin_map.items() if s == spin_key]
            mask = (bbb_filtered[BBB_BATTER_COL2] == batter_name) & (bbb_filtered[BBB_BOWLER_COL].isin(spin_bowlers))
            spin_balls = bbb_filtered[mask]

            if not spin_balls.empty:
                s_balls      = len(spin_balls)
                runs_col = "batsmanrun" if "batsmanrun" in spin_balls.columns else "batsman_runs"
                wkt_col  = "iswicketdelivery" if "iswicketdelivery" in spin_balls.columns else "player_dismissed"
                s_runs       = spin_balls[runs_col].sum() if runs_col in spin_balls.columns else 0
                s_dismissals = (spin_balls[wkt_col].sum() if wkt_col == "iswicketdelivery"
                                else spin_balls[wkt_col].notna().sum()) if wkt_col in spin_balls.columns else 0
                spin_comparison.append({
                    "type":          spin_label,
                    "short":         spin_short,
                    "sr":            round(s_runs / s_balls * 100, 1) if s_balls > 0 else 0,
                    "avg":           round(s_runs / max(1, s_dismissals), 1),
                    "dismissalProb": round(s_dismissals / s_balls, 3) if s_balls > 0 else 0,
                    "balls":         int(s_balls),
                })
                continue

        spin_comparison.append({
            "type":          spin_label,
            "short":         spin_short,
            "sr":            round(sr, 1),
            "avg":           round(avg, 1),
            "dismissalProb": round(wkt_rate / 100, 3),
            "balls":         0,
        })

    seasons = []
    _bbb_for_trend = bbb_full
    _batter_col_trend = None
    if _bbb_for_trend is not None:
        for col in ["batter", "Batter"]:
            if col in _bbb_for_trend.columns:
                _batter_col_trend = col
                break

    if _bbb_for_trend is not None and filter_spin_key and "bowler" in _bbb_for_trend.columns:
        if BOWLER_SPIN_LOOKUP:
            _spin_bowlers_trend = [b for b, s in BOWLER_SPIN_LOOKUP.items() if s == filter_spin_key]
        else:
            _spin_bowlers_trend = [
                (row.get("Name") or row.get("longName", ""))
                for _, row in players_df.iterrows()
                if filter_spin_key in str(row.get("longBowlingStyles", "")).lower()
            ]
        _bbb_for_trend = _bbb_for_trend[_bbb_for_trend["bowler"].isin(_spin_bowlers_trend)]

    if _bbb_for_trend is not None and "season" in _bbb_for_trend.columns and _batter_col_trend:
        bbb_player_trend = _bbb_for_trend[_bbb_for_trend[_batter_col_trend] == batter_name]
        for season in sorted(bbb_player_trend["season"].dropna().astype(str).str.split('/').str[0].astype(int).unique()):
            s = bbb_player_trend[bbb_player_trend["season"] == season]
            s_balls = len(s)
            s_runs  = s["batsmanrun"].sum() if "batsmanrun" in s.columns else 0
            s_wkts  = s["iswicketdelivery"].sum() if "iswicketdelivery" in s.columns else 0
            seasons.append({
                "season": str(int(season)),
                "sr":     round(s_runs / s_balls * 100, 1) if s_balls > 0 else 0,
                "avg":    round(s_runs / max(1, s_wkts), 1),
                "balls":  int(s_balls),
            })

    if not seasons:
        for i, yr in enumerate(["2020", "2021", "2022", "2023", "2024", "2025"]):
            seasons.append({
                "season": yr,
                "sr":     round(sr + (i - 2) * 2, 1),
                "avg":    round(avg + (i - 2) * 0.5, 1),
                "balls":  round(total_balls / 6),
            })

    form_sr = get_form_sr(batter_name, sr)

    return jsonify({
        "balls":             total_balls,
        "sr":                round(sr, 2),
        "avg":               round(avg, 2),
        "dot_pct":           round(dot_pct, 2),
        "boundary_pct":      round(boundary_pct, 2),
        "six_pct":           round(six_pct, 2),
        "wkt_rate":          round(wkt_rate, 2),
        "rotation_pct":      round(rotation_pct, 2),
        "dismissal_pct":     round(wkt_rate, 2),
        "cluster":           cluster,
        "cluster_name":      cluster_name,
        "form_sr_last5":     round(form_sr, 1),
        "runsDistribution":  runs_distribution,
        "phases":            phases,
        "dismissals":        dismissals_data,
        "spinComparison":    spin_comparison,
        "seasons":           seasons,
        "selected_season":   filter_season,
        "selected_venue":    filter_venue,
        "batter_features":   bf.to_dict(),
        "batter_vs_spin":    bvs_rows.to_dict(orient="records"),
    })


@app.route("/predict", methods=["POST"])
@limiter.limit("30 per minute")
def predict():
    raw   = request.get_json(force=True, silent=True)
    if not raw:
        return jsonify({"error": "Invalid JSON body"}), 400

    data, err = _validate_predict_input(raw)
    if err:
        return jsonify({"error": err}), 400

    player_id = data["player_id"]
    spin_type = data["spin_type"]
    phase     = data["phase"]
    venue     = data["venue"]
    innings   = data["innings"]
    n_balls   = data["n_balls"]

    batter_name = get_batter_name(player_id)
    if not batter_name:
        return jsonify({"error": "Player not found"}), 404

    bf_row = bf_df[bf_df["Batter"] == batter_name]
    if bf_row.empty:
        bf_row = bf_df[bf_df["Batter"].str.contains(batter_name.split()[-1], na=False)]
    if bf_row.empty:
        return jsonify({"error": f"No stats found for {batter_name}"}), 404

    bf = bf_row.iloc[0].to_dict()

    try:
        try:
            spin_enc = int(encoder_spin.transform([spin_type])[0])
        except Exception:
            spin_enc = 0

        try:
            phase_lower = phase.lower()
            phase_enc   = int(encoder_phase.transform([phase_lower])[0])
        except Exception:
            phase_enc = {"powerplay": 0, "middle": 1, "death": 2}.get(phase.lower(), 1)

        model_features, features_used = build_feature_vector(
            bf, spin_enc, phase_enc, phase, innings, venue, batter_name,
            spin_type=spin_type,
        )

        raw_prediction = float(model_runs.predict(model_features)[0])
        predicted_sr   = round(raw_prediction * 100, 1) if raw_prediction < 5 else round(raw_prediction, 1)
        dismissal_prob = float(model_wicket.predict_proba(model_features)[0][1])

        pred_runs_total      = round(raw_prediction * n_balls, 1) if raw_prediction < 5 \
                               else round((raw_prediction / 100) * n_balls, 1)
        expected_runs        = round(pred_runs_total * (1 - dismissal_prob), 1)
        dismiss_in_spell_pct = round((1 - (1 - dismissal_prob) ** n_balls) * 100, 1)

        balls_faced   = float(bf.get("total_balls", 50))
        confidence    = round(min(95, 60 + (balls_faced ** 0.5) * 1.2), 1)
        cluster       = get_cluster(bf)
        spin_bf       = get_spin_specific_stats(batter_name, spin_type)
        data_source   = f"spin-specific ({spin_type})" if spin_bf else "career fallback"

        return jsonify({
            "predicted_sr":         predicted_sr,
            "predicted_runs":       pred_runs_total,
            "expected_runs":        expected_runs,
            "dismissal_prob":       round(dismissal_prob, 4),
            "dismissal_prob_pct":   round(dismissal_prob * 100, 2),
            "dismiss_in_spell_pct": dismiss_in_spell_pct,
            "confidence":           confidence,
            "cluster":              cluster,
            "cluster_name":         CLUSTER_NAMES.get(cluster, "Unknown"),
            "spin_type":            spin_type,
            "phase":                phase,
            "venue":                venue,
            "model_version":        MODEL_VERSION,
            "data_source":          data_source,
            "features_used":        len(features_used),
            "n_balls":              n_balls,
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/validation-stats", methods=["GET"])
def validation_stats():
    """
    Returns accuracy metrics from validation_batter_overall.csv and
    validation_batter_match.csv — produced by IPL_Spin_Validation__2_.ipynb.
    """
    if val_overall_df is None:
        return jsonify({
            "available": False,
            "message":   "Run IPL_Spin_Validation__2_.ipynb to generate validation CSVs.",
        })

    df = val_overall_df.copy().where(pd.notnull(val_overall_df), None)

    summary = {"total_batters_validated": len(df)}

    if "mean_abs_error" in df.columns:
        summary["mean_abs_error"]   = round(float(df["mean_abs_error"].mean()), 3)
        summary["median_abs_error"] = round(float(df["mean_abs_error"].median()), 3)

    if "actual_sr" in df.columns and "predicted_sr" in df.columns:
        sr_diff = (df["predicted_sr"] - df["actual_sr"]).abs()
        summary["mean_sr_error"]   = round(float(sr_diff.mean()), 2)
        summary["pct_within_10sr"] = round(float((sr_diff <= 10).mean() * 100), 1)

    if "correct_pct" in df.columns:
        summary["mean_correct_pct"] = round(float(df["correct_pct"].mean()), 1)

    sort_col = "total_balls" if "total_balls" in df.columns else df.columns[0]
    per_batter = df.sort_values(sort_col, ascending=False).to_dict(orient="records")

    match_summary = None
    if val_match_df is not None:
        match_summary = val_match_df.where(
            pd.notnull(val_match_df), None
        ).to_dict(orient="records")

    return jsonify({
        "available":    True,
        "summary":      summary,
        "per_batter":   per_batter,
        "match_level":  match_summary,
    })


@app.route("/ai-insight", methods=["POST"])
def ai_insight():
    data   = request.get_json(force=True)
    prompt = data.get("prompt", "")

    try:
        import json as _json

        def generate():
            stream = gemini_client.models.generate_content_stream(
                model="gemini-2.5-flash",
                contents=prompt,
            )
            for chunk in stream:
                token = chunk.text or ""
                yield f"data: {_json.dumps({'token': token, 'done': False})}\n\n"
            yield f"data: {_json.dumps({'token': '', 'done': True})}\n\n"

        return app.response_class(
            generate(),
            mimetype="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
    except Exception as e: 
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ── Global error handlers ─────────────────────────────────────────────────────
@app.errorhandler(413)
def too_large(e):
    return jsonify({"error": "Request too large (max 1MB)"}), 413

@app.errorhandler(429)
def rate_limited(e):
    return jsonify({"error": "Too many requests — slow down"}), 429

@app.errorhandler(500)
def server_error(e):
    return jsonify({"error": "Internal server error"}), 500

# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=False, host="0.0.0.0", port=port, threaded=True)