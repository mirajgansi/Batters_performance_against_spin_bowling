"""
scraper_page.py
===============
Streamlit page for scraping IPL squads and fixtures.
Add this as a tab inside your main app.py, or run standalone:
    streamlit run scraper_page.py
"""

import streamlit as st
import pandas as pd
import json
import os
from datetime import datetime

# Import our scraper (must be in same folder)
from ipl_scraper import scrape_squads, scrape_fixtures, scrape_all, SPIN_TYPES

# ─── Page config (only needed if running standalone) ──────────────────────────
if __name__ == "__main__":
    st.set_page_config(
        page_title="IPL Data Scraper",
        page_icon="🌐",
        layout="wide",
    )

# ─── CSS ──────────────────────────────────────────────────────────────────────
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap');
html,body,[class*="css"]{font-family:'DM Sans',sans-serif;background:#0d1b2a!important;color:#f5f0e8;}
section[data-testid="stSidebar"]{background:linear-gradient(180deg,#0d1b2a,#1b2e48)!important;border-right:2px solid #e8c84b;}
section[data-testid="stSidebar"] *{color:#f5f0e8!important;}
.main{background:#0d1b2a!important;}
.scrape-title{font-family:'Bebas Neue',cursive;font-size:2.8rem;color:#e8c84b;letter-spacing:.08em;}
.scrape-sub{color:#8b9bb4;font-size:.9rem;letter-spacing:.15em;text-transform:uppercase;}
.card{background:linear-gradient(135deg,#1b2e48,#0d1b2a);border:1px solid rgba(232,200,75,.25);border-radius:12px;padding:1.2rem 1.4rem;margin-bottom:.8rem;}
.metric-n{font-family:'Bebas Neue',cursive;font-size:2.4rem;color:#e8c84b;line-height:1;}
.metric-l{font-size:.72rem;letter-spacing:.15em;text-transform:uppercase;color:#8b9bb4;}
.stButton>button{background:linear-gradient(135deg,#e8c84b,#f4722b);color:#0d1b2a!important;font-family:'Bebas Neue',cursive;font-size:1.1rem;letter-spacing:.1em;border:none;border-radius:8px;padding:.55rem 1.8rem;width:100%;}
.stButton>button:hover{opacity:.9;}
label{color:#8b9bb4!important;font-size:.83rem!important;}
.stSelectbox>div>div,.stNumberInput>div>div>input{background:#1b2e48!important;color:#f5f0e8!important;border:1px solid rgba(139,155,180,.4)!important;border-radius:8px!important;}
.log-box{background:#0a1420;border:1px solid rgba(139,155,180,.2);border-radius:8px;padding:1rem;font-family:'JetBrains Mono',monospace;font-size:.82rem;color:#8b9bb4;max-height:250px;overflow-y:auto;}
hr{border-color:rgba(232,200,75,.2)!important;}
.tag-spin{background:rgba(46,204,113,.15);border:1px solid rgba(46,204,113,.4);border-radius:12px;padding:2px 8px;font-size:.75rem;color:#2ecc71;margin:2px;display:inline-block;}
.tag-pace{background:rgba(231,76,60,.1);border:1px solid rgba(231,76,60,.3);border-radius:12px;padding:2px 8px;font-size:.75rem;color:#e74c3c;margin:2px;display:inline-block;}
</style>
""", unsafe_allow_html=True)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def render_log(messages):
    lines = "\n".join(f"› {m}" for m in messages)
    st.markdown(f'<div class="log-box">{lines}</div>', unsafe_allow_html=True)


def file_age(path):
    if not os.path.exists(path):
        return None
    age = datetime.now() - datetime.fromtimestamp(os.path.getmtime(path))
    h, rem = divmod(int(age.total_seconds()), 3600)
    m = rem // 60
    return f"{h}h {m}m ago" if h else f"{m}m ago"


# ─── Main UI ──────────────────────────────────────────────────────────────────

def scraper_ui(out_dir="."):
    st.markdown('<div class="scrape-title">🌐 IPL DATA SCRAPER</div>', unsafe_allow_html=True)
    st.markdown('<div class="scrape-sub">Squads · Bowling Styles · Fixtures — Auto-saved to CSV & JSON</div>',
                unsafe_allow_html=True)
    st.markdown("---")

    # ── Settings row ──────────────────────────────────────────────
    col1, col2, col3 = st.columns([1, 1, 2])
    with col1:
        season = st.selectbox("📅 Season", [2025, 2024, 2023, 2022], index=0)
    with col2:
        out_folder = st.text_input("📁 Save folder", value=out_dir)
    with col3:
        force = st.checkbox("🔄 Force refresh (ignore cache)", value=False)
        st.caption("Cache refreshes automatically every 12h (squads) / 3h (fixtures)")

    st.markdown("---")

    # ── Status cards ──────────────────────────────────────────────
    sq_csv = os.path.join(out_folder, "ipl_squads.csv")
    fx_csv = os.path.join(out_folder, "ipl_fixtures.csv")
    sq_age = file_age(sq_csv)
    fx_age = file_age(fx_csv)

    c1, c2, c3, c4 = st.columns(4)
    with c1:
        sq_rows = len(pd.read_csv(sq_csv)) if os.path.exists(sq_csv) else 0
        st.markdown(f"""
        <div class="card" style="text-align:center;">
            <div class="metric-n">{sq_rows}</div>
            <div class="metric-l">Players in squads.csv</div>
            <div style="color:#8b9bb4;font-size:.75rem;margin-top:4px;">{sq_age or '— not yet scraped'}</div>
        </div>""", unsafe_allow_html=True)
    with c2:
        if os.path.exists(sq_csv):
            sq_df = pd.read_csv(sq_csv)
            spin_n = sq_df["longBowlingStyles"].notna().sum() if "longBowlingStyles" in sq_df.columns else 0
        else:
            spin_n = 0
        st.markdown(f"""
        <div class="card" style="text-align:center;">
            <div class="metric-n" style="color:#2ecc71;">{spin_n}</div>
            <div class="metric-l">Spin Bowlers Found</div>
            <div style="color:#8b9bb4;font-size:.75rem;margin-top:4px;">from squads.csv</div>
        </div>""", unsafe_allow_html=True)
    with c3:
        fx_rows = len(pd.read_csv(fx_csv)) if os.path.exists(fx_csv) else 0
        st.markdown(f"""
        <div class="card" style="text-align:center;">
            <div class="metric-n">{fx_rows}</div>
            <div class="metric-l">Fixtures in fixtures.csv</div>
            <div style="color:#8b9bb4;font-size:.75rem;margin-top:4px;">{fx_age or '— not yet scraped'}</div>
        </div>""", unsafe_allow_html=True)
    with c4:
        st.markdown(f"""
        <div class="card" style="text-align:center;">
            <div class="metric-n" style="color:#f4722b;">{season}</div>
            <div class="metric-l">Active Season</div>
            <div style="color:#8b9bb4;font-size:.75rem;margin-top:4px;">IPL {season}</div>
        </div>""", unsafe_allow_html=True)

    st.markdown("---")

    # ── Action buttons ────────────────────────────────────────────
    btn1, btn2, btn3 = st.columns(3)
    run_squads   = btn1.button("🏏 Scrape Squads Only")
    run_fixtures = btn2.button("📅 Scrape Fixtures Only")
    run_all      = btn3.button("🚀 Scrape Everything")

    # ── Run scraping ──────────────────────────────────────────────
    if run_squads or run_fixtures or run_all:
        logs = []
        log_placeholder = st.empty()

        def log(msg):
            logs.append(msg)
            with log_placeholder:
                render_log(logs)

        fallback = os.path.join(out_folder, "2024_players_details.csv")

        with st.spinner("Scraping in progress..."):
            if run_squads or run_all:
                log(f"── Squads (IPL {season}) ──────────────────────────")
                sq_df, sq_csv_p, sq_json_p = scrape_squads(
                    season=season, out_dir=out_folder,
                    force=force, csv_fallback=fallback, log=log
                )
                st.session_state["sq_df"] = sq_df

            if run_fixtures or run_all:
                log(f"── Fixtures (IPL {season}) ─────────────────────────")
                fx_df, fx_csv_p, fx_json_p = scrape_fixtures(
                    season=season, out_dir=out_folder,
                    force=force, log=log
                )
                st.session_state["fx_df"] = fx_df

        st.success("✅ Scraping complete!")
        st.rerun()

    # ── Results preview ───────────────────────────────────────────
    tab_sq, tab_fx = st.tabs(["🏏 Squads", "📅 Fixtures"])

    with tab_sq:
        if os.path.exists(sq_csv):
            df = pd.read_csv(sq_csv)
            st.markdown(f"**{len(df)} players** loaded from `{sq_csv}`")

            # Filter controls
            col_f1, col_f2 = st.columns(2)
            with col_f1:
                spin_only = st.checkbox("🌀 Show spin bowlers only", value=False)
            with col_f2:
                teams = ["All"] + sorted(df["Team"].dropna().unique().tolist()) \
                    if "Team" in df.columns else ["All"]
                team_filter = st.selectbox("Filter by team", teams, key="squad_team_filter")

            filtered = df.copy()
            if spin_only:
                filtered = filtered[filtered["longBowlingStyles"].notna()]
            if team_filter != "All" and "Team" in filtered.columns:
                filtered = filtered[filtered["Team"] == team_filter]

            st.dataframe(filtered, use_container_width=True, height=400)

            # Download buttons
            dc1, dc2 = st.columns(2)
            dc1.download_button(
                "⬇️ Download squads.csv",
                data=df.to_csv(index=False),
                file_name="ipl_squads.csv",
                mime="text/csv",
            )
            if os.path.exists(sq_csv.replace(".csv",".json")):
                with open(sq_csv.replace(".csv",".json")) as f:
                    dc2.download_button(
                        "⬇️ Download squads.json",
                        data=f.read(),
                        file_name="ipl_squads.json",
                        mime="application/json",
                    )

            # Spin bowler breakdown by style
            if "longBowlingStyles" in df.columns:
                st.markdown("**Spin Bowler Breakdown**")
                style_counts = (
                    df[df["longBowlingStyles"].notna()]
                    .groupby("longBowlingStyles")
                    .size()
                    .reset_index(name="count")
                    .sort_values("count", ascending=False)
                )
                st.dataframe(style_counts, use_container_width=True, height=200)
        else:
            st.info("No squads data yet. Click **Scrape Squads** above.")

    with tab_fx:
        if os.path.exists(fx_csv):
            df = pd.read_csv(fx_csv)
            st.markdown(f"**{len(df)} fixtures** loaded from `{fx_csv}`")

            # Filter by team
            all_teams = sorted(set(
                df["team1"].dropna().tolist() + df["team2"].dropna().tolist()
            )) if "team1" in df.columns else []
            team_fx = st.selectbox("Filter by team", ["All"] + all_teams, key="fx_team_filter")

            filtered = df.copy()
            if team_fx != "All":
                filtered = filtered[
                    (filtered["team1"] == team_fx) | (filtered["team2"] == team_fx)
                ]

            st.dataframe(filtered, use_container_width=True, height=400)

            dc1, dc2 = st.columns(2)
            dc1.download_button(
                "⬇️ Download fixtures.csv",
                data=df.to_csv(index=False),
                file_name="ipl_fixtures.csv",
                mime="text/csv",
            )
            if os.path.exists(fx_csv.replace(".csv",".json")):
                with open(fx_csv.replace(".csv",".json")) as f:
                    dc2.download_button(
                        "⬇️ Download fixtures.json",
                        data=f.read(),
                        file_name="ipl_fixtures.json",
                        mime="application/json",
                    )
        else:
            st.info("No fixture data yet. Click **Scrape Fixtures** above.")


# ── Standalone entry ──────────────────────────────────────────────────────────
if __name__ == "__main__":
    scraper_ui()
