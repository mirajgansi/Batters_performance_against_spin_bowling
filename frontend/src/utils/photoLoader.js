import Papa from "papaparse";

const PLAYERS_CSV_URL = "/2026_players_details.csv";
/**
 * Loads the players CSV from /public and returns a Map of ID → imgUrl.
 * This runs once at app startup so player photos are available everywhere.
 */
export async function loadPhotoMap() {
  try {
    const res = await fetch(PLAYERS_CSV_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();

    return new Promise((resolve, reject) => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: ({ data }) => {
          const map = {};
          for (const row of data) {
            const id  = row.ID || row.id;
            const url = (row.imgUrl || "").trim();
            if (id && url) map[String(id)] = url;
          }
          resolve(map);
        },
        error: reject,
      });
    });
  } catch {
    return {};
  }
}
