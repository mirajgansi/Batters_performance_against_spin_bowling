"""
check_model_features.py
Run in csv/ folder to see exactly what features each model expects.
"""
import joblib

print("=== model_runs (LGBMRegressor) ===")
m = joblib.load("model_runs.pkl")
if hasattr(m, "feature_name_"):
    print("Features:", m.feature_name_)
    print("Count:", len(m.feature_name_))
elif hasattr(m, "n_features_in_"):
    print("n_features_in_:", m.n_features_in_)
else:
    print("No feature names found")

print("\n=== model_wicket (XGBClassifier) ===")
m2 = joblib.load("model_wicket.pkl")
if hasattr(m2, "feature_names_in_"):
    print("Features:", list(m2.feature_names_in_))
    print("Count:", len(m2.feature_names_in_))
elif hasattr(m2, "n_features_in_"):
    print("n_features_in_:", m2.n_features_in_)

print("\n=== scaler_cluster ===")
s = joblib.load("scaler_cluster.pkl")
if hasattr(s, "feature_names_in_"):
    print("Features:", list(s.feature_names_in_))
    print("Count:", len(s.feature_names_in_))
elif hasattr(s, "n_features_in_"):
    print("n_features_in_:", s.n_features_in_)

print("\n=== model_kmeans ===")
k = joblib.load("model_kmeans.pkl")
if hasattr(k, "n_features_in_"):
    print("n_features_in_:", k.n_features_in_)
