"""
IPL Spin Prediction Flask API
- Loads .pkl models for predictions
- Reads CSVs for real historical stats (Profile, Analysis, Compare tabs)
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import numpy as np
import pandas as pd
import os
import requests as req

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ── Load PKL models ───────────────────────────────────────────────────────
def load_pkl(filename):
    return joblib.load(os.path.join(BASE_DIR, filename))

print("Loading models...")
encoder_phase  = load_pkl("encoder_phase.pkl")
encoder_spin   = load_pkl("encoder_spin.pkl")
model_kmeans   = load_pkl("model_kmeans.pkl")
model_runs     = load_pkl("model_runs.pkl")
model_wicket   = load_pkl("model_wicket.pkl")
scaler_cluster = load_pkl("scaler_cluster.pkl")
print("All models loaded.")

#Ollama model
@app.route("/ai-insight", methods=["POST"])
def ai_insight():
    data   = request.get_json(force=True)
    prompt = data.get("prompt", "")
    try:
        import json
        def generate():
            res = req.post("http://localhost:11434/api/generate", json={
                "model":   "llama3",
                "prompt":  prompt,
                "stream":  True,
                "options": {"num_predict": 150, "temperature": 0.7}
            }, stream=True, timeout=300)
            for line in res.iter_lines():
                if line:
                    chunk = json.loads(line)
                    token = chunk.get("response", "")
                    done  = chunk.get("done", False)
                    yield f"data: {json.dumps({'token': token, 'done': done})}\n\n"
                    if done:
                        break
        return app.response_class(
            generate(),
            mimetype="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
        )
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    
# ── Load CSVs once at startup ─────────────────────────────────────────────
print("Loading CSVs...")
bf_df      = pd.read_csv(os.path.join(BASE_DIR, "batter_features.csv"))
bvs_df     = pd.read_csv(os.path.join(BASE_DIR, "batter_vs_spin_stats.csv"))
players_df = pd.read_csv(os.path.join(BASE_DIR, "2026_players_details.csv"))

bbb_path = os.path.join(BASE_DIR, "Ball_By_Ball_Match_Data.csv")
bbb_df   = pd.read_csv(bbb_path) if os.path.exists(bbb_path) else None
print("CSVs loaded.")
if bbb_df is not None:
    print("Ball_By_Ball columns:", list(bbb_df.columns))


# ── Helper ────────────────────────────────────────────────────────────────
def get_batter_name(player_id: int):
    row = players_df[players_df["ID"] == player_id]
    if row.empty:
        return None
    return row.iloc[0].get("Name") or row.iloc[0].get("longName")


# ── GET /players ──────────────────────────────────────────────────────────
@app.route("/players", methods=["GET"])
def get_players():
    """Returns all players from 2026_players_details.csv"""
    players = players_df.copy()
    players["ID"] = pd.to_numeric(players["ID"], errors="coerce").fillna(0).astype(int)
    # Replace all NaN/None with empty string to avoid JSON serialization issues
    players = players.where(pd.notnull(players), "")
    return jsonify(players.to_dict(orient="records"))


# ── GET /player-stats/<player_id> ─────────────────────────────────────────
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

    # Dismissal breakdown
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

    # Phase breakdown from Ball_By_Ball or estimated
    phases = []
    if bbb_df is not None and "batter" in bbb_df.columns and "phase" in bbb_df.columns:
        bbb_player = bbb_df[bbb_df["batter"] == batter_name]
        for phase_name in ["Powerplay", "Middle", "Death"]:
            p = bbb_player[bbb_player["phase"] == phase_name]
            if not p.empty:
                p_balls = len(p)
                p_runs  = p["batsman_runs"].sum() if "batsman_runs" in p.columns else 0
                p_wkts  = p["player_dismissed"].notna().sum() if "player_dismissed" in p.columns else 0
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

    # Spin comparison — calculated from Ball_By_Ball using bowler spin types
    SPIN_TYPES = [
        ("right-arm offbreak",     "Off-break",   "OB"),
        ("slow left-arm orthodox", "SLA Orthodox", "SLA"),
        ("legbreak",               "Leg-break",    "LB"),
        ("legbreak googly",        "Googly",       "LBG"),
        ("left-arm wrist-spin",    "LW Spin",      "LWS"),
    ]
    spin_comparison = []

    # Build bowler→spin_type lookup from players_df
    bowler_spin_map = {}
    for _, row in players_df.iterrows():
        name = row.get("Name") or row.get("longName", "")
        style = str(row.get("longBowlingStyles", "")).lower()
        for spin_key, _, _ in SPIN_TYPES:
            if spin_key in style:
                bowler_spin_map[name] = spin_key
                break

    for spin_key, spin_label, spin_short in SPIN_TYPES:
        if bbb_df is not None and "Batter" in bbb_df.columns and "Bowler" in bbb_df.columns:
            # Get all bowlers of this spin type
            spin_bowlers = [b for b, s in bowler_spin_map.items() if s == spin_key]
            # Filter ball-by-ball for this batter vs these bowlers
            mask = (bbb_df["Batter"] == batter_name) & (bbb_df["Bowler"].isin(spin_bowlers))
            spin_balls = bbb_df[mask]

            if not spin_balls.empty:
                s_balls     = len(spin_balls)
                s_runs      = spin_balls["BatsmanRun"].sum() if "BatsmanRun" in spin_balls.columns else 0
                s_dismissals= spin_balls["IsWicketDelivery"].sum() if "IsWicketDelivery" in spin_balls.columns else 0
                spin_sr     = round(s_runs / s_balls * 100, 1) if s_balls > 0 else 0
                spin_avg    = round(s_runs / max(1, s_dismissals), 1)
                spin_wkt    = round(s_dismissals / s_balls, 3) if s_balls > 0 else 0
                spin_comparison.append({
                    "type": spin_label, "short": spin_short,
                    "sr": spin_sr, "avg": spin_avg,
                    "dismissalProb": spin_wkt, "balls": int(s_balls),
                })
                continue

        # Fallback if no ball-by-ball data for this spin type
        spin_comparison.append({
            "type": spin_label, "short": spin_short,
            "sr": round(sr, 1), "avg": round(avg, 1),
            "dismissalProb": round(wkt_rate / 100, 3),
            "balls": 0,
        })

    # Season trend from Ball_By_Ball or estimated
    seasons = []
    if bbb_df is not None and "season" in bbb_df.columns and "batter" in bbb_df.columns:
        bbb_player = bbb_df[bbb_df["batter"] == batter_name]
        for season in sorted(bbb_player["season"].dropna().unique()):
            s = bbb_player[bbb_player["season"] == season]
            s_balls = len(s)
            s_runs  = s["batsman_runs"].sum() if "batsman_runs" in s.columns else 0
            s_wkts  = s["player_dismissed"].notna().sum() if "player_dismissed" in s.columns else 0
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

    return jsonify({
        "balls": total_balls, "sr": sr, "avg": avg,
        "dot_pct": dot_pct, "boundary_pct": boundary_pct,
        "six_pct": six_pct, "wkt_rate": wkt_rate,
        "rotation_pct": rotation_pct, "dismissal_pct": wkt_rate,
        "phases": phases, "dismissals": dismissals_data,
        "spinComparison": spin_comparison, "seasons": seasons,
        "batter_features": bf.to_dict(),
        "batter_vs_spin": bvs_rows.to_dict(orient="records"),
    })


# ── POST /predict ─────────────────────────────────────────────────────────
@app.route("/predict", methods=["POST"])
def predict():
    data      = request.get_json(force=True)
    player_id = int(data.get("player_id", 0))
    spin_type = data.get("spin_type", "right-arm offbreak")
    phase     = data.get("phase", "Middle")
    venue     = data.get("venue", "")

    batter_name = get_batter_name(player_id)
    bf_row = bf_df[bf_df["Batter"] == batter_name] if batter_name else pd.DataFrame()
    bf     = bf_row.iloc[0].to_dict() if not bf_row.empty else {}
    bvs_rows = bvs_df[bvs_df["batter"] == batter_name] if batter_name else pd.DataFrame()
    bvs    = bvs_rows.iloc[0].to_dict() if not bvs_rows.empty else {}

    try:
        # ── Batter stats from CSV ─────────────────────────────────────────
        sr           = float(bf.get("sr", 100))
        avg          = float(bf.get("avg", 25))
        dot_pct      = float(bf.get("dot_pct", 40))
        boundary_pct = float(bf.get("boundary_pct", 15))
        six_pct      = float(bf.get("six_pct", 5))
        wkt_rate     = float(bf.get("wkt_rate", 5))
        rotation_pct = float(bf.get("rotation_pct", 25))

        # ── Encode spin type and phase ────────────────────────────────────
        try:
            spin_enc = int(encoder_spin.transform([spin_type])[0])
        except Exception:
            spin_enc = 0
        try:
            phase_enc = int(encoder_phase.transform([phase])[0])
        except Exception:
            phase_enc = {"Powerplay": 0, "Middle": 1, "Death": 2}.get(phase, 1)

        # ── Cluster from scaler + kmeans (uses 16 batter_features cols) ──
        scaler_features = np.array([
            float(bf.get("total_balls", 100)),
            float(bf.get("total_runs", 0)),
            float(bf.get("dismissals", 0)),
            float(bf.get("dots", 0)),
            float(bf.get("fours", 0)),
            float(bf.get("sixes", 0)),
            float(bf.get("ones", 0)),
            float(bf.get("twos", 0)),
            sr, avg, dot_pct, boundary_pct, six_pct,
            wkt_rate, rotation_pct,
        ]).reshape(1, -1)  # 15 features — cluster is the OUTPUT not input
        features_scaled = scaler_cluster.transform(scaler_features)
        cluster         = int(model_kmeans.predict(features_scaled)[0])

        # ── Venue stats from venue_features.csv if available ─────────────
        venue_spin_wkt_rate  = 0.05
        venue_spin_economy   = 7.0
        if "venue_df" in globals():
            v_row = venue_df[venue_df["venue"].str.contains(venue, case=False, na=False)]
            if not v_row.empty:
                venue_spin_wkt_rate = float(v_row.iloc[0].get("spin_wkt_rate", 0.05))
                venue_spin_economy  = float(v_row.iloc[0].get("spin_economy", 7.0))

        # ── Form stats ────────────────────────────────────────────────────
        form_sr_last5 = sr  # fallback to career SR if no form data

        # ── Default ball context (mid-over, middle overs) ─────────────────
        overs          = {"Powerplay": 3.0, "Middle": 10.0, "Death": 17.0}.get(phase, 10.0)
        ball_number    = 3
        innings        = 1
        ball_in_over   = ball_number / 6.0
        is_last_ball   = 0
        over_x_ball    = overs * ball_number
        is_death_last  = 1 if phase == "Death" and ball_number == 6 else 0

        # ── Final 20-feature vector (must match training order exactly) ───
# Exactly 12 features the model was trained on
        model_features = pd.DataFrame([{
            "Overs":         overs,
            "BallNumber":    ball_number,
            "Innings":       innings,
            "spin_type_enc": spin_enc,
            "phase_enc":     phase_enc,
            "sr":            sr,
            "avg":           avg,
            "dot_pct":       dot_pct,
            "boundary_pct":  boundary_pct,
            "six_pct":       six_pct,
            "wkt_rate":      wkt_rate,
            "rotation_pct":  rotation_pct,
        }])
        raw_prediction = float(model_runs.predict(model_features)[0])
        # If model predicts runs per ball, convert to strike rate
        # runs_per_ball * 100 = strike rate
        if raw_prediction < 5:  # it's runs-per-ball, not SR
            predicted_sr = round(raw_prediction * 100, 1)
        else:
            predicted_sr = round(raw_prediction, 1)

        dismissal_prob = float(model_wicket.predict_proba(model_features)[0][1])
        predicted_avg  = round(predicted_sr / (dismissal_prob * 100 + 1), 2)
        balls_faced    = float(bf.get("total_balls", 50))
        confidence     = round(min(95, 60 + (balls_faced ** 0.5) * 1.2), 1)

        return jsonify({
            "predicted_sr":   round(predicted_sr, 1),
            "predicted_avg":  predicted_avg,
            "dismissal_prob": round(dismissal_prob, 3),
            "expected_runs":  round(predicted_avg * (1 - dismissal_prob), 1),
            "cluster":        cluster,
            "confidence":     confidence,
            "spin_type":      spin_type,
            "phase":          phase,
            "venue":          venue,
        })
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ── GET /health ───────────────────────────────────────────────────────────
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "models_loaded": True})

if __name__ == "__main__":
    app.run(debug=True, port=5000, threaded=True)