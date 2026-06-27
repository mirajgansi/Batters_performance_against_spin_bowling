import { useState, useEffect } from "react";
import {
  fetchPlayers,
  fetchVenues,
  fetchTeams,
  fetchSpinBowlers,
} from "../api/flask";

/**
 * Loads all static reference data once when the API comes online.
 * Returns { players, venues, teams, spinBowlers }
 */
export function useReferenceData(apiStatus) {
  const [players,     setPlayers]     = useState([]);
  const [venues,      setVenues]      = useState([]);
  const [teams,       setTeams]       = useState([]);
  const [spinBowlers, setSpinBowlers] = useState([]);

  useEffect(() => {
    if (apiStatus !== "connected") return;
    fetchPlayers().then(setPlayers).catch(() => {});
    fetchVenues().then((d) => setVenues(d.map((v) => v.venue || v))).catch(() => {});
    fetchTeams().then(setTeams).catch(() => {});
    fetchSpinBowlers().then(setSpinBowlers).catch(() => {});
  }, [apiStatus]);

  return { players, venues, teams, spinBowlers };
}
