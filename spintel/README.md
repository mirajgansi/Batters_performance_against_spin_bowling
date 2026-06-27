# SpinIQ — IPL Spin Analytics Frontend

React + Vite frontend for the SPINTEL IPL spin bowling prediction tool.

## Folder structure

```
spintel/
├── public/
│   └── 2026_players_details.csv   ← copy your CSV here for player photos
├── src/
│   ├── api/
│   │   ├── flask.js               ← all Flask API calls
│   │   └── ollama.js              ← Ollama LLM streaming
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.jsx
│   │   │   └── Topbar.jsx
│   │   └── ui/
│   │       ├── index.jsx          ← Avatar, Badge, KpiCard, Card, Spinner…
│   │       ├── PlayerSearch.jsx
│   │       └── AIInsightBox.jsx
│   ├── hooks/
│   │   ├── useApiStatus.js        ← polls Flask /health
│   │   └── useReferenceData.js    ← loads players/venues/teams
│   ├── pages/
│   │   ├── DashboardPage.jsx      ← analysis tab
│   │   └── PredictionPage.jsx     ← prediction tab
│   ├── utils/
│   │   ├── tokens.js              ← colours, SPIN_TYPE_OPTIONS, PHASE_OPTIONS
│   │   └── photoLoader.js         ← CSV → ID→imgUrl map
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── .env.example
├── vite.config.js
└── package.json
```

## Setup

```bash
cd spintel
npm install
cp .env.example .env   # edit if deploying
npm run dev            # starts on http://localhost:5173
```

Flask must be running on port 5000 (Vite proxies /api/* to it in dev).

## Production build

```bash
npm run build          # outputs to dist/
```

Set `VITE_API_URL=https://your-flask.onrender.com` in your hosting env vars.

## Changing the Ollama model

Edit `src/api/ollama.js` → change `OLLAMA_MODEL` to whichever model you have pulled.
