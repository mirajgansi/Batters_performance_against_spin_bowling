"""
add_cluster_column.py
Run in csv/ folder to add the cluster column back to batter_features.csv
"""
import pandas as pd
import numpy as np
import joblib

print("Loading batter_features.csv...")
bf = pd.read_csv("batter_features.csv")
print("Columns:", list(bf.columns))

if "cluster" in bf.columns:
    print("✓ cluster column already exists!")
else:
    print("Adding cluster column...")
    
    scaler  = joblib.load("scaler_cluster.pkl")
    kmeans  = joblib.load("model_kmeans.pkl")

    # Use the same numeric columns the scaler was trained on
    numeric_cols = bf.select_dtypes(include=[np.number]).columns.tolist()
    drop_cols    = [c for c in numeric_cols if "id" in c.lower()]
    cluster_cols = [c for c in numeric_cols if c not in drop_cols]

    print(f"Clustering on: {cluster_cols}")

    X         = bf[cluster_cols].fillna(0).values
    X_scaled  = scaler.transform(X)
    bf["cluster"] = kmeans.predict(X_scaled)

    bf.to_csv("batter_features.csv", index=False)
    print(f"✓ Saved batter_features.csv with cluster column")
    print(f"  Cluster distribution:\n{bf['cluster'].value_counts().sort_index()}")
