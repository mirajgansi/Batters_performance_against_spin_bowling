# Hugging Face Spaces (Docker SDK) — free CPU tier gives 16GB RAM, 2 vCPU
FROM python:3.11-slim

WORKDIR /app

# System deps some ML wheels (lightgbm/xgboost) sometimes need at build time
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first (better layer caching — only reinstalls if requirements.txt changes)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend (app.py, csv/ folder with CSVs + .pkl models, etc.)
COPY . .

# HF Spaces expects the container to listen on port 7860 by default
ENV PORT=7860
EXPOSE 7860

# 1 worker keeps memory predictable; --timeout gives Gemini streaming room to breathe
CMD ["gunicorn", "--bind", "0.0.0.0:7860", "--workers", "1", "--threads", "4", "--timeout", "120", "app:app"]
