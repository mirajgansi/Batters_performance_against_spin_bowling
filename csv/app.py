"""
IPL Spin Prediction Flask API
Loads your .pkl models and serves predictions to the React frontend.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import numpy as np
import pandas as pd
import os

app = Flask(__name__)
CORS(app)  # Allow React (localhost:3000 or 5173) to call this API

# ── Load all .pkl models once at startup ──────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def load_pkl(filename):
    path = os.path.join(BASE_DIR, filename)
    return joblib.load(path)  # notebooks used joblib.dump(), so we must use joblib.load()

print("Loading models...")
encoder_phase   = load_pkl("encoder_phase.pkl")
encoder_spin    = load_pkl("encoder_spin.pkl")
model_kmeans    = load_pkl("model_kmeans.pkl")
model_runs      = load_pkl("model_runs.pkl")
model_wicket    = load_pkl("model_wicket.pkl")
scaler_cluster  = load_pkl("scaler_cluster.pkl")
print("All models loaded successfully.")


# ── Helper: build feature vector ─────────────────────────────────────────
def build_features(player_id: int, spin_type: str, phase: str, venue: str,
                   batter_features: dict, batter_vs_spin: dict) -> np.ndarray:
    """
    Combine batter stats + encoded spin/phase into a feature vector.
    Adjust column order to match what your model was trained on.
    """

    # Encode categorical inputs
    # encoder_spin expects shape (1, 1) — adjust if yours is different
    try:
        spin_enc = encoder_spin.transform([[spin_type]])[0]
    except Exception:
        spin_enc = [0]

    try:
        phase_enc = encoder_phase.transform([[phase]])[0]
    except Exception:
        phase_enc = [0]

    # Pull batter stats (fall back to 0 if key missing)
    sr          = batter_features.get("strike_rate", 0)
    avg         = batter_features.get("average", 0)
    dot_pct     = batter_features.get("dot_pct", 0)
    boundary_pct= batter_features.get("boundary_pct", 0)
    balls_faced = batter_vs_spin.get("balls_faced", 0)
    wkt_rate    = batter_vs_spin.get("wicket_rate", 0)

    # Assemble — keep this order identical to your training pipeline!
    features = np.array([
        sr, avg, dot_pct, boundary_pct, balls_faced, wkt_rate,
        *spin_enc, *phase_enc
    ]).reshape(1, -1)

    return features


# ── POST /predict ─────────────────────────────────────────────────────────
@app.route("/predict", methods=["POST"])
def predict():
    """
    Request body (JSON):
    {
      "player_id": 95094,
      "spin_type": "right-arm offbreak",
      "phase": "Powerplay",
      "venue": "Wankhede Stadium",
      "batter_features": { "strike_rate": 140, "average": 35, ... },
      "batter_vs_spin":  { "balls_faced": 120, "wicket_rate": 0.05, ... }
    }

    Response:
    {
      "predicted_sr": 142.5,
      "predicted_avg": 33.2,
      "dismissal_prob": 0.07,
      "cluster": 2,
      "confidence": 85.3
    }
    """
    data = request.get_json(force=True)

    player_id       = int(data.get("player_id", 0))
    spin_type       = data.get("spin_type", "right-arm offbreak")
    phase           = data.get("phase", "Middle")
    venue           = data.get("venue", "")
    batter_features = data.get("batter_features", {})
    batter_vs_spin  = data.get("batter_vs_spin", {})

    try:
        features = build_features(
            player_id, spin_type, phase, venue,
            batter_features, batter_vs_spin
        )

        # Scale for clustering
        features_scaled = scaler_cluster.transform(features)

        # Cluster (batter profile group)
        cluster = int(model_kmeans.predict(features_scaled)[0])

        # Predict runs (strike rate / expected runs)
        predicted_sr = float(model_runs.predict(features)[0])

        # Predict wicket probability
        dismissal_prob = float(model_wicket.predict_proba(features)[0][1])

        # Derived stats
        predicted_avg = round(predicted_sr / 6, 2)   # rough proxy
        balls_faced   = batter_vs_spin.get("balls_faced", 50)
        confidence    = round(min(95, 60 + (balls_faced ** 0.5) * 1.2), 1)

        return jsonify({
            "predicted_sr":    round(predicted_sr, 1),
            "predicted_avg":   predicted_avg,
            "dismissal_prob":  round(dismissal_prob, 3),
            "cluster":         cluster,
            "confidence":      confidence,
            "spin_type":       spin_type,
            "phase":           phase,
            "venue":           venue,
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── GET /player-stats/<player_id> ─────────────────────────────────────────
@app.route("/player-stats/<int:player_id>", methods=["GET"])
def player_stats(player_id):
    """
    Optionally: load batter_features.csv / batter_vs_spin_stats.csv
    and return pre-computed stats for a player.
    """
    try:
        bf_path  = os.path.join(BASE_DIR, "batter_features.csv")
        bvs_path = os.path.join(BASE_DIR, "batter_vs_spin_stats.csv")

        bf  = pd.read_csv(bf_path)
        bvs = pd.read_csv(bvs_path)

        bf_row  = bf[bf["player_id"] == player_id].to_dict(orient="records")
        bvs_rows = bvs[bvs["player_id"] == player_id].to_dict(orient="records")

        return jsonify({
            "batter_features": bf_row[0]  if bf_row  else {},
            "batter_vs_spin":  bvs_rows,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── GET /health ───────────────────────────────────────────────────────────
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "models_loaded": True})


if __name__ == "__main__":
    app.run(debug=True, port=5000)