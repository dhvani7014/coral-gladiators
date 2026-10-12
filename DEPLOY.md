# Deployment Guide

## Architecture
- **Frontend**: Vercel (free)
- **Backend**: Render.com (free tier)
- **Graph DB**: Neo4j AuraDB (free tier)
- **Data**: coral/data/*.jsonl (committed for small files, fetched at runtime for large)

## Step 1 — Neo4j AuraDB (Free)
1. Go to https://neo4j.com/cloud/aura → Create Free Instance
2. Save the connection URI (bolt://...), username, and password

## Step 2 — Deploy Backend to Render
1. Go to https://render.com → New → Web Service
2. Connect your GitHub repo
3. Settings:
   - **Root directory**: `backend`
   - **Build command**: `pip install -r requirements.txt`
   - **Start command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add environment variables:
   - `GROQ_API_KEY` — from https://console.groq.com
   - `NEO4J_URI` — from AuraDB (bolt://...)
   - `NEO4J_USER` — neo4j
   - `NEO4J_PASSWORD` — from AuraDB
   - `SLACK_BOT_TOKEN` — from api.slack.com/apps
   - `ADMIN_KEY` — any secret string
5. After deploy, copy your Render URL (e.g. https://sentinel-backend.onrender.com)

## Step 3 — Deploy Frontend to Vercel
1. `cd frontend && npx vercel`
2. When prompted, add environment variable:
   - `NEXT_PUBLIC_BACKEND_URL` = your Render URL from Step 2
3. Or set it in Vercel dashboard → Settings → Environment Variables

## Step 4 — Update Slack Webhook URL
In api.slack.com/apps → Event Subscriptions:
Replace ngrok URL with: `https://your-render-url.onrender.com/webhooks/slack`

## Step 5 — Sync Sanctions Data (run once after deploy)
```bash
curl -X POST https://your-render-url.onrender.com/admin/sync-sanctions \
  -H "X-Admin-Key: your-admin-key"
```

## Notes
- Render free tier sleeps after 15 min inactivity (first request takes ~30s to wake)
- Neo4j AuraDB free tier has 512MB storage limit
- Coral CLI must be installed on the server — see Dockerfile
