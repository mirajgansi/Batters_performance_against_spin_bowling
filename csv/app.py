"""
IPL Spin Prediction Flask API  — v3 Model
=========================================
Supports:
  - v3 model (20 features): cluster, venue, form, ball-level derived features
  - Falls back gracefully to v1 (12 features) if v3 CSVs are missing
  - Saved predictions with JSON persistence
  - Spin bowler list endpoint
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import numpy as np
import pandas as pd
import os
import json
import pathlib
import requests as req

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ── Load PKL models ───────────────────────────────────────────────────────────
def load_pkl(filename):
    return joblib.load(os.path.join(BASE_DIR, filename))

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

# ── Load CSVs at startup ──────────────────────────────────────────────────────
print("Loading CSVs...")
bf_df      = pd.read_csv(os.path.join(BASE_DIR, "batter_features.csv"))
bvs_df     = pd.read_csv(os.path.join(BASE_DIR, "batter_vs_spin_stats.csv"))
players_df = pd.read_csv(os.path.join(BASE_DIR, "2026_players_details.csv"))

# ── v3 CSVs (optional — fall back to means if missing) ───────────────────────
_venue_path = os.path.join(BASE_DIR, "venue_features.csv")
_form_path  = os.path.join(BASE_DIR, "form_features.csv")

venue_df = pd.read_csv(_venue_path) if os.path.exists(_venue_path) else None
form_df  = pd.read_csv(_form_path)  if os.path.exists(_form_path)  else None

MODEL_VERSION = "v3" if (venue_df is not None and form_df is not None) else "v1"
print(f"Model version detected: {MODEL_VERSION}")

if venue_df is not None:
    print(f"  venue_features.csv loaded — {len(venue_df)} venues")
    _venue_wkt_mean = float(venue_df["venue_spin_wkt_rate"].mean())
    _venue_eco_mean = float(venue_df["venue_spin_economy"].mean())
else:
    print("  venue_features.csv NOT found — using global defaults")
    _venue_wkt_mean = 0.05
    _venue_eco_mean = 0.90   # runs per ball (~7 econ)

if form_df is not None:
    print(f"  form_features.csv loaded — {len(form_df)} batters")
else:
    print("  form_features.csv NOT found — form_sr_last5 falls back to career SR")

# ── Ball-by-Ball (optional) ───────────────────────────────────────────────────
bbb_path = os.path.join(BASE_DIR, "Ball_By_Ball_Match_Data.csv")
bbb_df   = pd.read_csv(bbb_path) if os.path.exists(bbb_path) else None
if bbb_df is not None:
    print(f"Ball_By_Ball loaded — columns: {list(bbb_df.columns)}")
else:
    print("Ball_By_Ball_Match_Data.csv not found — phase/season breakdowns will be estimated")

# ── Saved predictions persistence ────────────────────────────────────────────
PREDS_FILE = pathlib.Path(BASE_DIR) / "saved_predictions.json"

def _load_preds():
    if PREDS_FILE.exists():
        try:
            return json.loads(PREDS_FILE.read_text(encoding="utf-8"))
        except Exception:
            return []
    return []

def _save_preds(preds):
    PREDS_FILE.write_text(json.dumps(preds, indent=2, ensure_ascii=False), encoding="utf-8")

print("CSVs loaded.")

# ── Helpers ───────────────────────────────────────────────────────────────────
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


def build_feature_vector(bf: dict, spin_enc: int, phase_enc: int,
                          phase: str, innings: int,
                          venue: str, batter_name: str):
    """
    Build the correct feature DataFrame for whichever model version is active.
    Returns (DataFrame, feature_list_used).
    """
    over_map = {"Powerplay": 3, "powerplay": 3,
                "Middle": 10,   "middle": 10,
                "Death": 17,    "death": 17}
    over_num = over_map.get(phase, 10)
    ball_num = 3

    sr           = float(bf.get("sr", 100))
    avg          = float(bf.get("avg", 25))
    dot_pct      = float(bf.get("dot_pct", 40))
    boundary_pct = float(bf.get("boundary_pct", 15))
    six_pct      = float(bf.get("six_pct", 5))
    wkt_rate     = float(bf.get("wkt_rate", 5))
    rotation_pct = float(bf.get("rotation_pct", 25))

    if MODEL_VERSION == "v3":
        cluster              = get_cluster(bf)
        v_wkt, v_eco         = get_venue_stats(venue)
        form_sr              = get_form_sr(batter_name, sr)
        ball_in_over_norm    = ball_num / 6
        is_last_ball         = 0
        over_x_ball          = over_num * ball_num
        is_death_last        = int(over_num >= 17 and ball_num >= 5)

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


# ─────────────────────────────────────────────────────────────────────────────
# ROUTES
# ─────────────────────────────────────────────────────────────────────────────

# ── GET /health ───────────────────────────────────────────────────────────────
@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "models_loaded": True,
        "model_version": MODEL_VERSION,
        "venue_features": venue_df is not None,
        "form_features":  form_df  is not None,
        "ball_by_ball":   bbb_df   is not None,
    })


# ── GET /players ──────────────────────────────────────────────────────────────
@app.route("/players", methods=["GET"])
def get_players():
    """All players from 2026_players_details.csv"""
    players = players_df.copy()
    players["ID"] = pd.to_numeric(players["ID"], errors="coerce").fillna(0).astype(int)
    players = players.where(pd.notnull(players), "")
    return jsonify(players.to_dict(orient="records"))


# ── GET /spin-bowlers ─────────────────────────────────────────────────────────
@app.route("/spin-bowlers", methods=["GET"])
def get_spin_bowlers():
    """
    Returns all players whose bowling style is one of the 5 spin types.
    Optional ?team=<team name> filter.
    """
    SPIN_KEYS = [
        "right-arm offbreak",
        "slow left-arm orthodox",
        "legbreak",
        "legbreak googly",
        "left-arm wrist-spin",
    ]
    SPIN_LABEL = {
        "right-arm offbreak":    "Off Spin",
        "slow left-arm orthodox":"Left Arm Orthodox",
        "legbreak":              "Leg Spin",
        "legbreak googly":       "Leg Spin (Googly)",
        "left-arm wrist-spin":   "Left Arm Wrist Spin",
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


# ── GET /venues ───────────────────────────────────────────────────────────────
@app.route("/venues", methods=["GET"])
def get_venues():
    """Return venues with spin stats if venue_features.csv exists."""
    if venue_df is not None:
        data = venue_df.copy()
        data = data.where(pd.notnull(data), None)
        return jsonify(data.to_dict(orient="records"))
    # Fallback: hardcoded IPL venues
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


# ── GET /player-stats/<player_id> ─────────────────────────────────────────────
@app.route("/player-stats/<int:player_id>", methods=["GET"])
def player_stats(player_id):
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

    sr           = float(bf.get("sr", 0))
    avg          = float(bf.get("avg", 0))
    dot_pct      = float(bf.get("dot_pct", 0))
    boundary_pct = float(bf.get("boundary_pct", 0))
    six_pct      = float(bf.get("six_pct", 0))
    wkt_rate     = float(bf.get("wkt_rate", 0))
    rotation_pct = float(bf.get("rotation_pct", 0))
    total_balls  = int(bf.get("total_balls", 0))
    dismissals   = int(bf.get("dismissals", 0))

    # ── Cluster archetype (v3) ────────────────────────────────────────────────
    cluster       = get_cluster(bf.to_dict())
    CLUSTER_NAMES = {
        0: "Aggressive Attacker",
        1: "Steady Accumulator",
        2: "Spin Vulnerable",
        3: "Balanced Performer",
    }
    cluster_name = CLUSTER_NAMES.get(cluster, "Unknown")

    # ── Dismissal breakdown ───────────────────────────────────────────────────
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

    # ── Phase breakdown ───────────────────────────────────────────────────────
    phases = []
    BBB_BATTER_COL = None
    if bbb_df is not None:
        for col in ["batter", "Batter"]:
            if col in bbb_df.columns:
                BBB_BATTER_COL = col
                break

    if bbb_df is not None and BBB_BATTER_COL and "phase" in bbb_df.columns:
        bbb_player = bbb_df[bbb_df[BBB_BATTER_COL] == batter_name]
        for phase_name in ["Powerplay", "Middle", "Death"]:
            p = bbb_player[bbb_player["phase"] == phase_name]
            if not p.empty:
                p_balls = len(p)
                p_runs  = p["batsman_runs"].sum() if "batsman_runs" in p.columns else (
                          p["BatsmanRun"].sum()   if "BatsmanRun"   in p.columns else 0)
                p_wkts  = (p["player_dismissed"].notna().sum() if "player_dismissed" in p.columns else
                           p["IsWicketDelivery"].sum()         if "IsWicketDelivery" in p.columns else 0)
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

    # ── Spin type comparison ──────────────────────────────────────────────────
    SPIN_TYPES = [
        ("right-arm offbreak",     "Off-break",    "OB"),
        ("slow left-arm orthodox", "SLA Orthodox", "SLA"),
        ("legbreak",               "Leg-break",    "LB"),
        ("legbreak googly",        "Googly",       "LBG"),
        ("left-arm wrist-spin",    "LW Spin",      "LWS"),
    ]

    bowler_spin_map = {}
    for _, row in players_df.iterrows():
        name  = row.get("Name") or row.get("longName", "")
        style = str(row.get("longBowlingStyles", "")).lower()
        for spin_key, _, _ in SPIN_TYPES:
            if spin_key in style:
                bowler_spin_map[name] = spin_key
                break

    spin_comparison = []
    BBB_BOWLER_COL = None
    if bbb_df is not None:
        for col in ["Bowler", "bowler"]:
            if col in bbb_df.columns:
                BBB_BOWLER_COL = col
                break
    BBB_BATTER_COL2 = BBB_BATTER_COL or "Batter"

    for spin_key, spin_label, spin_short in SPIN_TYPES:
        if bbb_df is not None and BBB_BATTER_COL2 in bbb_df.columns and BBB_BOWLER_COL:
            spin_bowlers = [b for b, s in bowler_spin_map.items() if s == spin_key]
            mask = (bbb_df[BBB_BATTER_COL2] == batter_name) & (bbb_df[BBB_BOWLER_COL].isin(spin_bowlers))
            spin_balls = bbb_df[mask]

            if not spin_balls.empty:
                s_balls      = len(spin_balls)
                runs_col     = "BatsmanRun" if "BatsmanRun" in spin_balls.columns else "batsman_runs"
                wkt_col      = "IsWicketDelivery" if "IsWicketDelivery" in spin_balls.columns else "player_dismissed"
                s_runs       = spin_balls[runs_col].sum() if runs_col in spin_balls.columns else 0
                s_dismissals = (spin_balls[wkt_col].sum() if wkt_col == "IsWicketDelivery"
                                else spin_balls[wkt_col].notna().sum()) if wkt_col in spin_balls.columns else 0
                spin_comparison.append({
                    "type": spin_label, "short": spin_short,
                    "sr":           round(s_runs / s_balls * 100, 1) if s_balls > 0 else 0,
                    "avg":          round(s_runs / max(1, s_dismissals), 1),
                    "dismissalProb": round(s_dismissals / s_balls, 3) if s_balls > 0 else 0,
                    "balls":        int(s_balls),
                })
                continue

        spin_comparison.append({
            "type": spin_label, "short": spin_short,
            "sr": round(sr, 1), "avg": round(avg, 1),
            "dismissalProb": round(wkt_rate / 100, 3),
            "balls": 0,
        })

    # ── Season trend ──────────────────────────────────────────────────────────
    seasons = []
    if bbb_df is not None and "season" in bbb_df.columns and BBB_BATTER_COL:
        bbb_player = bbb_df[bbb_df[BBB_BATTER_COL] == batter_name]
        for season in sorted(bbb_player["season"].dropna().unique()):
            s = bbb_player[bbb_player["season"] == season]
            s_balls  = len(s)
            runs_col = "BatsmanRun" if "BatsmanRun" in s.columns else "batsman_runs"
            wkt_col  = "IsWicketDelivery" if "IsWicketDelivery" in s.columns else "player_dismissed"
            s_runs   = s[runs_col].sum() if runs_col in s.columns else 0
            s_wkts   = (s[wkt_col].sum() if wkt_col == "IsWicketDelivery"
                        else s[wkt_col].notna().sum()) if wkt_col in s.columns else 0
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

    # ── Form SR ───────────────────────────────────────────────────────────────
    form_sr = get_form_sr(batter_name, sr)

    return jsonify({
        "balls":          total_balls,
        "sr":             sr,
        "avg":            avg,
        "dot_pct":        dot_pct,
        "boundary_pct":   boundary_pct,
        "six_pct":        six_pct,
        "wkt_rate":       wkt_rate,
        "rotation_pct":   rotation_pct,
        "dismissal_pct":  wkt_rate,
        "cluster":        cluster,
        "cluster_name":   cluster_name,
        "form_sr_last5":  round(form_sr, 1),
        "phases":         phases,
        "dismissals":     dismissals_data,
        "spinComparison": spin_comparison,
        "seasons":        seasons,
        "batter_features": bf.to_dict(),
        "batter_vs_spin":  bvs_rows.to_dict(orient="records"),
    })


# ── POST /predict ─────────────────────────────────────────────────────────────
@app.route("/predict", methods=["POST"])
def predict():
    data      = request.get_json(force=True)
    player_id = int(data.get("player_id", 0))
    spin_type = data.get("spin_type", "right-arm offbreak")
    phase     = data.get("phase", "Middle")
    venue     = data.get("venue", "")
    innings   = int(data.get("innings", 1))
    n_balls   = int(data.get("n_balls", 12))

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
        # ── Encode spin type and phase ────────────────────────────────────────
        try:
            spin_enc = int(encoder_spin.transform([spin_type])[0])
        except Exception:
            spin_enc = 0

        try:
            phase_lower = phase.lower()
            phase_enc   = int(encoder_phase.transform([phase_lower])[0])
        except Exception:
            phase_enc = {"powerplay": 0, "middle": 1, "death": 2}.get(phase.lower(), 1)

        # ── Build feature vector ──────────────────────────────────────────────
        model_features, features_used = build_feature_vector(
            bf, spin_enc, phase_enc, phase, innings, venue, batter_name
        )

        # ── Run models ────────────────────────────────────────────────────────
        raw_prediction = float(model_runs.predict(model_features)[0])

        # model_runs predicts runs-per-ball; convert to SR
        predicted_sr = round(raw_prediction * 100, 1) if raw_prediction < 5 else round(raw_prediction, 1)

        dismissal_prob = float(model_wicket.predict_proba(model_features)[0][1])

        # ── Derived outputs ───────────────────────────────────────────────────
        pred_runs_total      = round(raw_prediction * n_balls, 1) if raw_prediction < 5 \
                               else round((raw_prediction / 100) * n_balls, 1)
        expected_runs        = round(pred_runs_total * (1 - dismissal_prob), 1)
        dismiss_in_spell_pct = round((1 - (1 - dismissal_prob) ** n_balls) * 100, 1)

        balls_faced  = float(bf.get("total_balls", 50))
        confidence   = round(min(95, 60 + (balls_faced ** 0.5) * 1.2), 1)

        # Cluster info
        cluster      = get_cluster(bf)
        CLUSTER_NAMES = {0: "Aggressive Attacker", 1: "Steady Accumulator",
                         2: "Spin Vulnerable",     3: "Balanced Performer"}

        return jsonify({
            "predicted_sr":          predicted_sr,
            "predicted_runs":        pred_runs_total,
            "expected_runs":         expected_runs,
            "dismissal_prob":        round(dismissal_prob, 4),
            "dismissal_prob_pct":    round(dismissal_prob * 100, 2),
            "dismiss_in_spell_pct":  dismiss_in_spell_pct,
            "confidence":            confidence,
            "cluster":               cluster,
            "cluster_name":          CLUSTER_NAMES.get(cluster, "Unknown"),
            "spin_type":             spin_type,
            "phase":                 phase,
            "venue":                 venue,
            "model_version":         MODEL_VERSION,
            "features_used":         len(features_used),
            "n_balls":               n_balls,
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ── POST /ai-insight (Ollama streaming) ───────────────────────────────────────
@app.route("/ai-insight", methods=["POST"])
def ai_insight():
    data   = request.get_json(force=True)
    prompt = data.get("prompt", "")
    try:
        import json as _json

        def generate():
            res = req.post("http://localhost:11434/api/generate", json={
                "model":   "llama3",
                "prompt":  prompt,
                "stream":  True,
                "options": {"num_predict": 150, "temperature": 0.7},
            }, stream=True, timeout=300)
            for line in res.iter_lines():
                if line:
                    chunk = _json.loads(line)
                    token = chunk.get("response", "")
                    done  = chunk.get("done", False)
                    yield f"data: {_json.dumps({'token': token, 'done': done})}\n\n"
                    if done:
                        break

        return app.response_class(
            generate(),
            mimetype="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ── GET /saved-predictions ────────────────────────────────────────────────────
@app.route("/saved-predictions", methods=["GET"])
def get_saved_predictions():
    """Return all saved predictions from JSON file."""
    return jsonify(_load_preds())


# ── POST /save-prediction ─────────────────────────────────────────────────────
@app.route("/save-prediction", methods=["POST"])
def save_prediction():
    """
    Save a new prediction.
    Expected body: { player_id, batter_name, match, venue, spin_type, phase,
                     predicted_sr, predicted_runs, dismissal_prob, confidence, ... }
    """
    data  = request.get_json(force=True)
    preds = _load_preds()
    data["id"]     = (max((p.get("id", 0) for p in preds), default=0) + 1)
    data["status"] = "Pending"   # Pending | Accurate | Partially Accurate | Inaccurate
    preds.append(data)
    _save_preds(preds)
    return jsonify({"ok": True, "id": data["id"]})


# ── POST /update-prediction/<id> ──────────────────────────────────────────────
@app.route("/update-prediction/<int:pred_id>", methods=["POST"])
def update_prediction(pred_id):
    """
    Update a saved prediction with actual match results.
    Expected body: { actual_runs, actual_sr, dismissed (bool), notes (optional) }
    Auto-computes accuracy status.
    """
    data  = request.get_json(force=True)
    preds = _load_preds()

    updated = False
    for p in preds:
        if p.get("id") == pred_id:
            p.update(data)

            # ── Auto-compute accuracy ──────────────────────────────────────
            pred_runs   = float(p.get("predicted_runs", 0))
            actual_runs = float(p.get("actual_runs", 0))
            diff        = abs(actual_runs - pred_runs)

            if diff <= 5:
                p["status"] = "Accurate"
            elif diff <= 15:
                p["status"] = "Partially Accurate"
            else:
                p["status"] = "Inaccurate"

            updated = True
            break

    if not updated:
        return jsonify({"error": f"Prediction {pred_id} not found"}), 404

    _save_preds(preds)
    return jsonify({"ok": True, "status": preds[[p["id"] for p in preds].index(pred_id)]["status"]
                    if updated else "unknown"})


# ── DELETE /saved-predictions/<id> ───────────────────────────────────────────
@app.route("/saved-predictions/<int:pred_id>", methods=["DELETE"])
def delete_prediction(pred_id):
    preds = _load_preds()
    preds = [p for p in preds if p.get("id") != pred_id]
    _save_preds(preds)
    return jsonify({"ok": True})


# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app.run(debug=True, port=5000, threaded=True)