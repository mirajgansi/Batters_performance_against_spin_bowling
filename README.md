🏏 IPL Batsmen Performance Against Spin Bowling

Predicts and analyzes how IPL batters perform against different types of spin bowling — strike rate, dismissal probability, phase-wise breakdowns, and AI-generated insights — powered by a trained ML pipeline (SpinIQ) and ball-by-ball IPL data (2008–2025).

Structure
├── backend/     Flask API — predictions, player stats, AI insights
└── frontend/    React + Vite dashboard — search, predict, visualize

See backend/README.md and frontend/README.md for setup details on each.

Quick start
bash
# Backend
cd backend
python app.py          # http://localhost:5000

# Frontend
cd frontend
npm install
npm run dev             # http://localhost:5173
Stack
Backend: Flask, scikit-learn, pandas
Frontend: React, Vite, Recharts
Data: Cricsheet ball-by-ball IPL data (2008–2025)
AI Insights: Gemini API
