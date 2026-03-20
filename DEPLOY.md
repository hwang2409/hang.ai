# Deploying neuronic

Vercel frontend + DigitalOcean backend.

## Architecture

```
[Browser] → [Vercel CDN] → static React app
                ↓ API calls
           [DigitalOcean VPS] → FastAPI + Redis + SQLite
```

- **Frontend** — Vercel serves the built React app (free tier)
- **Backend** — DigitalOcean droplet runs FastAPI, Redis, and SQLite via Docker

## Prerequisites

| Item | Where | Cost |
|------|-------|------|
| DigitalOcean droplet (2GB+ RAM) | digitalocean.com | ~$6-12/mo |
| Domain name | Namecheap, Cloudflare | ~$10/yr |
| Vercel account | vercel.com | Free |
| Anthropic API key | console.anthropic.com | Pay-per-use |
| OpenAI API key (optional, transcription) | platform.openai.com | Pay-per-use |
| Google OAuth creds (optional, calendar) | Google Cloud Console | Free |

## Step 1: Deploy the backend (DigitalOcean)

### Create a droplet

- Image: Ubuntu 24.04
- Plan: Basic $6/mo (1 vCPU, 2GB RAM) or higher
- Region: pick one close to your users
- Authentication: SSH key

### SSH in and set up Docker

```bash
ssh root@your-droplet-ip

# Install Docker
curl -fsSL https://get.docker.com | sh

# Clone the repo
git clone <your-repo-url> && cd hang/final
```

### Configure environment

```bash
cat > .env << 'EOF'
ANTHROPIC_API_KEY=sk-ant-your-key-here
JWT_SECRET=REPLACE_ME
CORS_ORIGINS=https://your-app.vercel.app
FRONTEND_URL=https://your-app.vercel.app
REDIS_URL=redis://redis:6379/0

# Optional
OPENAI_API_KEY=sk-your-key-here
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=https://api.yourdomain.com/integrations/google-calendar/callback
EOF
```

Generate a real JWT secret:

```bash
sed -i "s/REPLACE_ME/$(openssl rand -hex 32)/" .env
```

### Start the backend only

You don't need the frontend or nginx containers — Vercel handles that. Run just the backend and Redis:

```bash
docker compose up -d backend redis
```

This starts:
- **backend** — FastAPI on port 8000
- **redis** — cache + task queue on port 6379 (internal)

### Set up HTTPS with Caddy

The backend needs HTTPS so Vercel's frontend can call it without mixed-content errors.

```bash
apt install -y caddy
```

Create `/etc/caddy/Caddyfile`:

```
api.yourdomain.com {
    reverse_proxy localhost:8000
}
```

```bash
systemctl restart caddy
```

Caddy provisions SSL certificates automatically via Let's Encrypt.

### DNS

Create an A record: `api.yourdomain.com` → your droplet's IP address.

Wait for DNS to propagate, then verify:

```bash
curl https://api.yourdomain.com/health
# → {"status":"ok"}
```

## Step 2: Deploy the frontend (Vercel)

### Import to Vercel

1. Push your repo to GitHub
2. Go to vercel.com → "Add New Project" → import the repo
3. Set **Root Directory** to `frontend`
4. Framework preset: Vite (auto-detected)
5. Add one environment variable:
   - `VITE_API_URL` = `https://api.yourdomain.com`
6. Deploy

### Custom domain (optional)

In Vercel project settings → Domains, add `yourdomain.com`. Update `CORS_ORIGINS` and `FRONTEND_URL` on your backend `.env` to match, then restart:

```bash
# On your droplet
docker compose restart backend
```

## Production checklist

- [ ] `JWT_SECRET` is a random 32+ byte hex string (not the default)
- [ ] `CORS_ORIGINS` in backend `.env` matches your Vercel URL exactly
- [ ] `FRONTEND_URL` in backend `.env` matches your Vercel URL exactly
- [ ] `VITE_API_URL` in Vercel env vars points to `https://api.yourdomain.com`
- [ ] `ANTHROPIC_API_KEY` is set
- [ ] `api.yourdomain.com` resolves and returns `{"status":"ok"}`
- [ ] Frontend loads and can log in / sign up
- [ ] Backups are configured (see below)

## Backups

```bash
# Add to crontab on your droplet (crontab -e)
0 3 * * * mkdir -p /backups && docker cp hang-backend-1:/app/hang.db /backups/hang-$(date +\%F).db
0 3 * * * docker cp hang-backend-1:/app/media /backups/media-$(date +\%F)
```

Or enable DigitalOcean's weekly droplet backups ($1.20/mo).

## Common operations

```bash
# View backend logs
docker compose logs -f backend

# Restart after .env changes
docker compose restart backend

# Rebuild after code changes
git pull && docker compose up -d --build backend

# Redeploy frontend
# Just push to GitHub — Vercel auto-deploys on push
```

## Optional: Celery worker

For heavy workloads, run a dedicated worker:

```bash
docker compose up -d worker
```

Requires this in `docker-compose.yml`:

```yaml
worker:
  build: ./backend
  command: celery -A app.celery_app worker --loglevel=info
  env_file: .env
  depends_on:
    - redis
```

## Scaling

| Bottleneck | Fix |
|------------|-----|
| SQLite write contention | Swap `DATABASE_URL` to Postgres, add postgres to docker-compose |
| LLM latency | Already rate-limited (20/min per user) and semaphored (20 concurrent) |
| Static assets | Vercel's CDN handles this — zero config |
| Background tasks | Add more Celery worker containers |
| File storage | Mount a DigitalOcean Space (S3-compatible) |

## Troubleshooting

**CORS errors in browser console**
→ `CORS_ORIGINS` in `.env` doesn't match your Vercel URL. Include the full origin with `https://`, no trailing slash.

**API calls return 404 or network error**
→ `VITE_API_URL` in Vercel is wrong or missing. Must be the full URL: `https://api.yourdomain.com` (no trailing slash).

**Mixed content blocked**
→ Backend isn't running HTTPS. Make sure Caddy is running and `api.yourdomain.com` has a valid certificate.

**Google Calendar redirect fails**
→ `GOOGLE_REDIRECT_URI` must point to the backend, not the frontend: `https://api.yourdomain.com/integrations/google-calendar/callback`. Also add this URI in Google Cloud Console OAuth settings.
