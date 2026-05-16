"""
fix_scaler_and_cluster.py
Re-saves scaler_cluster.pkl and model_kmeans.pkl using the correct 15 columns,
then adds the cluster column to batter_features.csv
"""
import pandas as pd
import numpy as np
import joblib
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans

print("Loading batter_features.csv...")
bf = pd.read_csv("batter_features.csv")

# These are the 15 numeric columns (excluding cluster which doesn't exist yet)
CLUSTER_COLS = [
    'total_balls', 'total_runs', 'dismissals', 'dots', 'fours', 'sixes',
    'ones', 'twos', 'sr', 'avg', 'dot_pct', 'boundary_pct',
    'six_pct', 'wkt_rate', 'rotation_pct'
]

X = bf[CLUSTER_COLS].fillna(0).values
print(f"Fitting scaler on {X.shape[1]} features...")

# Re-fit scaler on correct columns
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)
joblib.dump(scaler, "scaler_cluster.pkl")
print("✓ Saved scaler_cluster.pkl")

# Re-fit kmeans
kmeans = KMeans(n_clusters=4, random_state=42, n_init=10)
kmeans.fit(X_scaled)
joblib.dump(kmeans, "model_kmeans.pkl")
print("✓ Saved model_kmeans.pkl")

# Add cluster column to CSV
bf["cluster"] = kmeans.predict(X_scaled)
bf.to_csv("batter_features.csv", index=False)
print(f"✓ Saved batter_features.csv with cluster column")
print(f"  Cluster distribution:\n{bf['cluster'].value_counts().sort_index()}")
print("\nDone! Now re-run your validation notebook.")
