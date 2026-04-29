"""
ipl_scraper.py
==============
Scrapes IPL team squads, player bowling styles, and upcoming fixtures
from ESPNcricinfo + Cricbuzz + Wikipedia, with graceful fallbacks.

Saves results as:
  - ipl_squads.csv       (all players + bowling styles + team)
  - ipl_fixtures.csv     (upcoming match schedule)
  - ipl_squads.json      (same as CSV but JSON)
  - ipl_fixtures.json    (same as CSV but JSON)

Can be imported by:
  1. Your Streamlit app  (app.py)
  2. Your Jupyter notebooks
  3. Run standalone: python ipl_scraper.py
"""

import re
import time
import json
import os
import warnings
import urllib.request
import urllib.error
from datetime import datetime, timedelta

import pandas as pd
import numpy as np

warnings.filterwarnings("ignore")

# ══════════════════════════════════════════════════════════════════════
# CONFIG
# ══════════════════════════════════════════════════════════════════════

OUTPUT_DIR   = "."          # folder where CSV/JSON files are saved
CACHE_HOURS  = 12           # re-scrape only after this many hours
DELAY        = 1.0          # seconds between requests (be polite)

SPIN_TYPES = [
    "right-arm offbreak",
    "legbreak",
    "legbreak googly",
    "slow left-arm orthodox",
    "left-arm wrist-spin",
]

# ESPNcricinfo stable team IDs
ESPN_TEAM_IDS = {
    "Mumbai Indians":               2630,
    "Chennai Super Kings":          2629,
    "Royal Challengers Bengaluru":  2633,
    "Kolkata Knight Riders":        2631,
    "Delhi Capitals":               2634,
    "Rajasthan Royals":             2636,
    "Punjab Kings":                 2632,
    "Sunrisers Hyderabad":          4343,
    "Gujarat Titans":               6903,
    "Lucknow Super Giants":         6904,
}

# ESPNcricinfo IPL series IDs by year
ESPN_SERIES = {
    2025: 1449924,
    2024: 1410320,
    2023: 1345038,
    2022: 1298423,
}

# Cricbuzz IPL series IDs by year
CRICBUZZ_SERIES = {
    2025: 9237,
    2024: 7607,
}

# Hard-coded fallback bowling styles for well-known players
# (used when scraping returns nothing)
KNOWN_STYLES = {
    "YS Chahal":             "legbreak googly",
    "Kuldeep Yadav":         "left-arm wrist-spin",
    "Rashid Khan":           "legbreak googly",
    "SP Narine":             "right-arm offbreak",
    "Varun Chakaravarthy":   "right-arm offbreak",
    "R Ashwin":              "right-arm offbreak",
    "WA Sundar":             "right-arm offbreak",
    "Washington Sundar":     "right-arm offbreak",
    "RA Jadeja":             "slow left-arm orthodox",
    "AR Patel":              "slow left-arm orthodox",
    "Krunal Pandya":         "slow left-arm orthodox",
    "Ravi Bishnoi":          "legbreak googly",
    "Shakib Al Hasan":       "slow left-arm orthodox",
    "MM Ali":                "right-arm offbreak",
    "MJ Santner":            "slow left-arm orthodox",
    "M Theekshana":          "right-arm offbreak",
    "M Markande":            "legbreak googly",
    "KC Cariappa":           "right-arm offbreak",
    "RD Parag":              "legbreak",
    "Rahul Chahar":          "legbreak googly",
    "LS Livingstone":        "legbreak googly",
    "K Gowtham":             "right-arm offbreak",
    "Shams Mulani":          "slow left-arm orthodox",
    "GJ Maxwell":            "right-arm offbreak",
    "KV Sharma":             "slow left-arm orthodox",
    "HH Pandya":             "right-arm offbreak",
    "R Tewatia":             "legbreak googly",
    "Sai Kishore":           "slow left-arm orthodox",
    "Noor Ahmad":            "left-arm wrist-spin",
    "SS Sharma":             "legbreak googly",
    "Mujeeb Ur Rahman":      "right-arm offbreak",
    "Piyush Chawla":         "legbreak googly",
    "Imran Tahir":           "legbreak googly",
    "KM Asif":               "right-arm offbreak",
    "Mayank Markande":       "legbreak googly",
    "Shreyas Gopal":         "legbreak googly",
    "Rahul Tewatia":         "legbreak googly",
}

# ══════════════════════════════════════════════════════════════════════
# HTTP UTILITIES
# ══════════════════════════════════════════════════════════════════════

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "identity",
    "Connection":      "keep-alive",
}


def fetch(url, timeout=12, retries=3, delay=1.0):
    """
    Fetch a URL. Returns HTML string or None.
    Handles gzip, retries on timeout, respects rate limits.
    """
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read()
                enc = r.info().get("Content-Encoding", "")
                if enc == "gzip":
                    import gzip
                    raw = gzip.decompress(raw)
                return raw.decode("utf-8", errors="ignore")
        except urllib.error.HTTPError as e:
            if e.code == 429:                  # rate limited — wait longer
                time.sleep(delay * 3 * (attempt + 1))
            elif e.code in (403, 404, 410):
                return None                    # no point retrying
            else:
                time.sleep(delay * (attempt + 1))
        except urllib.error.URLError:
            time.sleep(delay * (attempt + 1))
        except Exception:
            time.sleep(delay)
    return None


def dig(obj, *keys):
    """Safely navigate nested dict/list: dig(data, 'a', 'b', 0, 'c')"""
    for k in keys:
        try:
            obj = obj[k]
        except (KeyError, IndexError, TypeError):
            return None
    return obj


# ══════════════════════════════════════════════════════════════════════
# BOWLING STYLE NORMALISER
# ══════════════════════════════════════════════════════════════════════

_STYLE_MAP = {
    "right-arm offbreak":     ["offbreak","off break","off-break","off spin","off-spin","offspinner"],
    "legbreak":               ["legbreak ","leg break ","leg-break ","^legbreak$","^leg break$"],
    "legbreak googly":        ["googly","wrist spin","wrist-spin","legbreak googly","leg spin","legspin"],
    "slow left-arm orthodox": ["slow left-arm orthodox","sla orthodox","left-arm spin",
                               "orthodox","slow left arm","slow left-arm","left arm orthodox"],
    "left-arm wrist-spin":    ["left-arm wrist","chinaman","left arm wrist","left-arm wrist-spin"],
}

def normalise_style(raw):
    """Return canonical spin type string or np.nan for pace/unknown."""
    if not raw or str(raw).strip().lower() in ("na","nan","none","","n/a","-"):
        return np.nan
    r = str(raw).lower().strip()
    # Already canonical?
    if r in [s.lower() for s in SPIN_TYPES]:
        return r
    for canonical, patterns in _STYLE_MAP.items():
        for pat in patterns:
            if pat in r:
                return canonical
    return np.nan  # pace or unrecognised


# ══════════════════════════════════════════════════════════════════════
# SOURCE 1 — ESPNcricinfo  (squads + fixtures)
# ══════════════════════════════════════════════════════════════════════

def espn_squad(team_name, team_id):
    """
    Scrape one team's squad from ESPNcricinfo.
    Returns list of dicts: {Name, Team, longBowlingStyles}
    """
    slug = team_name.lower().replace(" ", "-")
    url  = f"https://www.espncricinfo.com/team/{slug}-{team_id}/squad"
    html = fetch(url)
    if not html:
        return []

    players = []

    # ── Try __NEXT_DATA__ JSON blob ──────────────────────────────
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
    if m:
        try:
            data  = json.loads(m.group(1))
            squad = dig(data,"props","pageProps","data","content","squadDetails","players")
            if squad:
                for p in squad:
                    name  = p.get("longName") or p.get("name","")
                    style = normalise_style(p.get("longBowlingStyles","") or p.get("bowlingStyles",""))
                    if name:
                        players.append({"Name":name,"Team":team_name,"longBowlingStyles":style})
                return players
        except Exception:
            pass

    # ── Fallback: regex on raw HTML ──────────────────────────────
    pairs = re.findall(
        r'"longName"\s*:\s*"([^"]+)"[^}]{0,300}?"longBowlingStyles"\s*:\s*"([^"]*)"',
        html, re.DOTALL
    )
    for name, style in pairs:
        players.append({"Name": name, "Team": team_name,
                        "longBowlingStyles": normalise_style(style)})
    return players


def espn_all_squads():
    """Scrape all 10 IPL team squads from ESPN. Returns DataFrame."""
    rows = []
    for team, tid in ESPN_TEAM_IDS.items():
        result = espn_squad(team, tid)
        rows.extend(result)
        time.sleep(DELAY)
    return pd.DataFrame(rows) if rows else pd.DataFrame()


def espn_fixtures(season=None):
    """
    Scrape IPL fixture list from ESPNcricinfo.
    Returns DataFrame with: match_no, date, team1, team2, venue, status
    """
    season  = season or datetime.now().year
    series  = ESPN_SERIES.get(season, ESPN_SERIES[max(ESPN_SERIES)])
    url     = (f"https://www.espncricinfo.com/series/"
               f"indian-premier-league-{season}-{series}/match-schedule-fixtures")
    html    = fetch(url)
    if not html:
        return pd.DataFrame()

    fixtures = []

    # Try __NEXT_DATA__ JSON
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
    if m:
        try:
            data    = json.loads(m.group(1))
            matches = dig(data,"props","pageProps","data","content","matches") or []
            for match in matches:
                teams  = match.get("teams", [{},{}])
                t1     = dig(teams,0,"longName") or dig(teams,0,"name") or "TBA"
                t2     = dig(teams,1,"longName") or dig(teams,1,"name") or "TBA"
                date   = match.get("startDate") or match.get("date","")
                venue  = dig(match,"ground","longName") or dig(match,"venue","name","longName") or ""
                status = match.get("status","scheduled")
                mno    = match.get("matchNumber","")
                fixtures.append({
                    "match_no": mno, "date": date,
                    "team1": t1, "team2": t2,
                    "venue": venue, "status": status,
                    "source": "ESPNcricinfo",
                })
        except Exception:
            pass

    return pd.DataFrame(fixtures) if fixtures else pd.DataFrame()


# ══════════════════════════════════════════════════════════════════════
# SOURCE 2 — Cricbuzz  (squads + fixtures)
# ══════════════════════════════════════════════════════════════════════

def cricbuzz_all_squads(season=None):
    """
    Scrape IPL squads from Cricbuzz series page.
    Returns DataFrame with: Name, Team, longBowlingStyles
    """
    season = season or datetime.now().year
    series = CRICBUZZ_SERIES.get(season, CRICBUZZ_SERIES[max(CRICBUZZ_SERIES)])
    url    = f"https://www.cricbuzz.com/cricket-series/{series}/squads"
    html   = fetch(url)
    if not html:
        return pd.DataFrame()

    rows = []
    # Cricbuzz embeds player cards with role information
    # Pattern: player name slug + role text nearby
    blocks = re.findall(
        r'/profiles/(\d+)/([a-z-]+).*?<div[^>]*class="[^"]*cb-col[^"]*"[^>]*>([^<]{3,60})</div>',
        html, re.DOTALL
    )
    for pid, slug, role_text in blocks:
        name  = slug.replace("-", " ").title()
        style = normalise_style(role_text.strip())
        rows.append({"Name": name, "Team": "Unknown",
                     "longBowlingStyles": style, "source": "Cricbuzz"})

    return pd.DataFrame(rows) if rows else pd.DataFrame()


def cricbuzz_fixtures(season=None):
    """
    Scrape IPL fixtures from Cricbuzz.
    Returns DataFrame with: match_no, date, team1, team2, venue, status
    """
    season = season or datetime.now().year
    series = CRICBUZZ_SERIES.get(season, CRICBUZZ_SERIES[max(CRICBUZZ_SERIES)])
    url    = f"https://www.cricbuzz.com/cricket-series/{series}/matches"
    html   = fetch(url)
    if not html:
        return pd.DataFrame()

    fixtures = []
    # Match rows look like: Team1 vs Team2 with date/venue info
    match_blocks = re.findall(
        r'<div[^>]*cb-col-60[^>]*>(.*?)</div>\s*<div[^>]*cb-col-40[^>]*>(.*?)</div>',
        html, re.DOTALL
    )
    for block1, block2 in match_blocks:
        teams = re.findall(r'([A-Z][a-zA-Z ]{3,25})\s+vs\s+([A-Z][a-zA-Z ]{3,25})', block1)
        date  = re.search(r'(\w{3},\s+\d{1,2}\s+\w{3}\s+\d{4})', block2)
        venue = re.search(r'<a[^>]*>([^<]{5,60}Stadium[^<]*)</a>', block2)
        if teams:
            fixtures.append({
                "match_no": "",
                "date":     date.group(1)  if date  else "",
                "team1":    teams[0][0].strip(),
                "team2":    teams[0][1].strip(),
                "venue":    venue.group(1).strip() if venue else "",
                "status":   "scheduled",
                "source":   "Cricbuzz",
            })

    return pd.DataFrame(fixtures) if fixtures else pd.DataFrame()


# ══════════════════════════════════════════════════════════════════════
# SOURCE 3 — Wikipedia  (squad names only, styles from KNOWN_STYLES)
# ══════════════════════════════════════════════════════════════════════

def wikipedia_squads(season=None):
    """
    Scrape IPL squad player names from Wikipedia.
    Bowling styles filled from KNOWN_STYLES fallback dict.
    """
    season = season or datetime.now().year
    url    = (f"https://en.wikipedia.org/w/api.php?action=parse"
              f"&page={season}_Indian_Premier_League"
              f"&prop=wikitext&format=json&section=0")
    html   = fetch(url)
    if not html:
        # Try previous year if current not available
        url = (f"https://en.wikipedia.org/w/api.php?action=parse"
               f"&page={season-1}_Indian_Premier_League"
               f"&prop=wikitext&format=json")
        html = fetch(url)
    if not html:
        return pd.DataFrame()

    try:
        wikitext = json.loads(html)["parse"]["wikitext"]["*"]
    except Exception:
        return pd.DataFrame()

    # Extract all [[Player Name]] or [[Player Name|Display]] links
    names = re.findall(r'\[\[([A-Z][a-z]+(?:\s[A-Z][a-zA-Z\.]+)+)(?:\|[^\]]*)?\]\]', wikitext)
    rows  = []
    for name in set(names):
        style = KNOWN_STYLES.get(name, np.nan)
        rows.append({"Name": name, "Team": "Unknown",
                     "longBowlingStyles": style, "source": "Wikipedia"})

    return pd.DataFrame(rows) if rows else pd.DataFrame()


def wikipedia_fixtures(season=None):
    """Extract match schedule from Wikipedia IPL page."""
    season = season or datetime.now().year
    url    = (f"https://en.wikipedia.org/w/api.php?action=parse"
              f"&page={season}_Indian_Premier_League"
              f"&prop=wikitext&format=json")
    html   = fetch(url)
    if not html:
        return pd.DataFrame()

    try:
        wikitext = json.loads(html)["parse"]["wikitext"]["*"]
    except Exception:
        return pd.DataFrame()

    fixtures = []
    # Wikipedia fixture format: Team1 v Team2 | Date | Venue
    blocks = re.findall(
        r'\|\s*([A-Z][a-zA-Z ]+)\s+v\s+([A-Z][a-zA-Z ]+)\s*\|\|([^\|]+)\|\|([^\|\n]+)',
        wikitext
    )
    for t1, t2, date, venue in blocks:
        fixtures.append({
            "match_no": "",
            "date":     date.strip(),
            "team1":    t1.strip(),
            "team2":    t2.strip(),
            "venue":    venue.strip(),
            "status":   "scheduled",
            "source":   "Wikipedia",
        })

    return pd.DataFrame(fixtures) if fixtures else pd.DataFrame()


# ══════════════════════════════════════════════════════════════════════
# MERGE & DEDUPLICATE
# ══════════════════════════════════════════════════════════════════════

def merge_squad_sources(*dfs):
    """
    Combine squad DataFrames from multiple sources.
    Priority: ESPN > Cricbuzz > Wikipedia > KNOWN_STYLES
    """
    combined = pd.concat([d for d in dfs if not d.empty], ignore_index=True)
    if combined.empty:
        return pd.DataFrame(columns=["Name","Team","longBowlingStyles","source"])

    # Keep first occurrence (highest-priority source listed first)
    combined = combined.drop_duplicates("Name", keep="first").reset_index(drop=True)

    # Patch missing bowling styles from KNOWN_STYLES
    def patch_style(row):
        if pd.isna(row["longBowlingStyles"]) or row["longBowlingStyles"] == "":
            return KNOWN_STYLES.get(row["Name"], np.nan)
        return row["longBowlingStyles"]

    combined["longBowlingStyles"] = combined.apply(patch_style, axis=1)
    return combined


def merge_fixture_sources(*dfs):
    """Combine fixture DataFrames, drop obvious duplicates."""
    combined = pd.concat([d for d in dfs if not d.empty], ignore_index=True)
    if combined.empty:
        return pd.DataFrame()
    # Deduplicate on team pair + date
    combined["_key"] = (
        combined["team1"].str.lower().str.strip() + "_" +
        combined["team2"].str.lower().str.strip() + "_" +
        combined["date"].str.strip()
    )
    combined = combined.drop_duplicates("_key").drop(columns="_key").reset_index(drop=True)
    return combined


# ══════════════════════════════════════════════════════════════════════
# SAVE TO CSV AND JSON
# ══════════════════════════════════════════════════════════════════════

def save_squads(df, out_dir=OUTPUT_DIR):
    """Save squad DataFrame to CSV and JSON."""
    os.makedirs(out_dir, exist_ok=True)
    csv_path  = os.path.join(out_dir, "ipl_squads.csv")
    json_path = os.path.join(out_dir, "ipl_squads.json")

    df.to_csv(csv_path, index=False)

    # Nested JSON: {team: [{Name, longBowlingStyles}, ...]}
    nested = {}
    for team, grp in df.groupby("Team"):
        nested[team] = grp[["Name","longBowlingStyles"]].to_dict("records")
    with open(json_path, "w") as f:
        json.dump({"scraped_at": datetime.now().isoformat(),
                   "total_players": len(df),
                   "teams": nested}, f, indent=2)

    print(f"  ✅ Squads saved → {csv_path}  ({len(df)} players)")
    print(f"  ✅ Squads saved → {json_path}")
    return csv_path, json_path


def save_fixtures(df, out_dir=OUTPUT_DIR):
    """Save fixtures DataFrame to CSV and JSON."""
    os.makedirs(out_dir, exist_ok=True)
    csv_path  = os.path.join(out_dir, "ipl_fixtures.csv")
    json_path = os.path.join(out_dir, "ipl_fixtures.json")

    df.to_csv(csv_path, index=False)

    records = df.to_dict("records")
    with open(json_path, "w") as f:
        json.dump({"scraped_at": datetime.now().isoformat(),
                   "total_matches": len(df),
                   "matches": records}, f, indent=2)

    print(f"  ✅ Fixtures saved → {csv_path}  ({len(df)} matches)")
    print(f"  ✅ Fixtures saved → {json_path}")
    return csv_path, json_path


# ══════════════════════════════════════════════════════════════════════
# CACHE
# ══════════════════════════════════════════════════════════════════════

def _cache_fresh(path, hours=CACHE_HOURS):
    """Return True if file exists and was modified less than `hours` ago."""
    if not os.path.exists(path):
        return False
    age = datetime.now() - datetime.fromtimestamp(os.path.getmtime(path))
    return age < timedelta(hours=hours)


# ══════════════════════════════════════════════════════════════════════
# MAIN PUBLIC API
# ══════════════════════════════════════════════════════════════════════

def scrape_squads(season=None, out_dir=OUTPUT_DIR,
                  force=False, csv_fallback=None, log=print):
    """
    Fetch latest IPL squad data and save to ipl_squads.csv / ipl_squads.json.

    Returns (DataFrame, csv_path, json_path)
    """
    csv_path  = os.path.join(out_dir, "ipl_squads.csv")
    json_path = os.path.join(out_dir, "ipl_squads.json")

    # ── Use cache if fresh ────────────────────────────────────────
    if not force and _cache_fresh(csv_path):
        log(f"📂 Using cached squads ({csv_path})")
        return pd.read_csv(csv_path), csv_path, json_path

    log("🌐 Scraping ESPNcricinfo squads...")
    df_espn = espn_all_squads()
    log(f"   ESPN: {len(df_espn)} players found")

    log("🌐 Scraping Cricbuzz squads...")
    df_cb = cricbuzz_all_squads(season)
    log(f"   Cricbuzz: {len(df_cb)} players found")

    if len(df_espn) < 20 and len(df_cb) < 20:
        log("🌐 Trying Wikipedia as backup...")
        df_wiki = wikipedia_squads(season)
        log(f"   Wikipedia: {len(df_wiki)} players found")
    else:
        df_wiki = pd.DataFrame()

    df = merge_squad_sources(df_espn, df_cb, df_wiki)

    # ── CSV fallback if scraping completely failed ─────────────────
    if df.empty and csv_fallback and os.path.exists(csv_fallback):
        log(f"⚠️  Web scraping returned nothing. Loading from {csv_fallback}")
        df = pd.read_csv(csv_fallback)
        df.columns = df.columns.str.strip()
        df["longBowlingStyles"] = df["longBowlingStyles"].apply(normalise_style)
        df["longBowlingStyles"] = df.apply(
            lambda r: KNOWN_STYLES.get(r["Name"], r["longBowlingStyles"])
                      if pd.isna(r["longBowlingStyles"]) else r["longBowlingStyles"],
            axis=1
        )
        df["source"] = "CSV fallback"

    if df.empty:
        log("⚠️  All sources failed. Using built-in player list.")
        df = pd.DataFrame([
            {"Name": k, "Team": "Unknown", "longBowlingStyles": v, "source": "built-in"}
            for k, v in KNOWN_STYLES.items()
        ])

    spin_count = df["longBowlingStyles"].notna().sum()
    log(f"✅ Total: {len(df)} players | {spin_count} spin bowlers identified")
    csv_path, json_path = save_squads(df, out_dir)
    return df, csv_path, json_path


def scrape_fixtures(season=None, out_dir=OUTPUT_DIR, force=False, log=print):
    """
    Fetch IPL fixture schedule and save to ipl_fixtures.csv / ipl_fixtures.json.

    Returns (DataFrame, csv_path, json_path)
    """
    season    = season or datetime.now().year
    csv_path  = os.path.join(out_dir, "ipl_fixtures.csv")
    json_path = os.path.join(out_dir, "ipl_fixtures.json")

    if not force and _cache_fresh(csv_path, hours=3):  # fixtures change more often
        log(f"📂 Using cached fixtures ({csv_path})")
        return pd.read_csv(csv_path), csv_path, json_path

    log("🌐 Scraping fixtures from ESPNcricinfo...")
    df_espn = espn_fixtures(season)
    log(f"   ESPN fixtures: {len(df_espn)} matches")

    log("🌐 Scraping fixtures from Cricbuzz...")
    df_cb = cricbuzz_fixtures(season)
    log(f"   Cricbuzz fixtures: {len(df_cb)} matches")

    log("🌐 Scraping fixtures from Wikipedia...")
    df_wiki = wikipedia_fixtures(season)
    log(f"   Wikipedia fixtures: {len(df_wiki)} matches")

    df = merge_fixture_sources(df_espn, df_cb, df_wiki)

    if df.empty:
        log("⚠️  No fixture data found.")
        return df, csv_path, json_path

    log(f"✅ {len(df)} fixtures found")
    csv_path, json_path = save_fixtures(df, out_dir)
    return df, csv_path, json_path


def scrape_all(season=None, out_dir=OUTPUT_DIR,
               force=False, csv_fallback=None, log=print):
    """Run both squad and fixture scraping in one call."""
    log(f"\n{'='*50}")
    log(f"🏏 IPL Scraper — Season {season or datetime.now().year}")
    log(f"{'='*50}\n")
    log("── SQUADS ──────────────────────────────────────")
    squads_df, sq_csv, sq_json = scrape_squads(
        season, out_dir, force, csv_fallback, log)
    log("\n── FIXTURES ────────────────────────────────────")
    fixtures_df, fx_csv, fx_json = scrape_fixtures(
        season, out_dir, force, log)
    log(f"\n✅ Done! Files saved to: {os.path.abspath(out_dir)}")
    return {
        "squads":   {"df": squads_df,  "csv": sq_csv,  "json": sq_json},
        "fixtures": {"df": fixtures_df,"csv": fx_csv,  "json": fx_json},
    }


# ══════════════════════════════════════════════════════════════════════
# RUN STANDALONE
# ══════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser(description="IPL Squad & Fixture Scraper")
    p.add_argument("--season",   type=int, default=None,  help="IPL season year (default: current)")
    p.add_argument("--out",      type=str, default=".",   help="Output folder")
    p.add_argument("--force",    action="store_true",     help="Ignore cache, force re-scrape")
    p.add_argument("--fallback", type=str, default="2024_players_details.csv",
                   help="CSV fallback path")
    args = p.parse_args()

    results = scrape_all(
        season=args.season,
        out_dir=args.out,
        force=args.force,
        csv_fallback=args.fallback,
    )
