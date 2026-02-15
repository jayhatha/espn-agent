# Railway Deployment Guide

## ✅ Preparation Complete

The following has been prepared for deployment:

### Generated Files
- `.env.railway` - Contains your generated secrets (DO NOT COMMIT)
- `railway.backend.json` - Backend service configuration
- `railway.frontend.json` - Frontend service configuration
- `railway.workers.json` - Workers service configuration

### Security Secrets (Generated)
- SLACK_ENCRYPTION_KEY: `028ae89d3601056c8124668d4f94babfca5125da75422b2fecb4e1cea9fc0b2f`
- INTERNAL_JOB_TOKEN: `359d0c3f9cc94057719781ce77973fbe5d88a15772c9156a0bd2c723689e0ed7`

## 📋 Next Steps

### 1. Complete Railway Login (IN PROGRESS)

Run this in your terminal:
```bash
railway login
```

This will open your browser for authentication.

### 2. Create Railway Project

```bash
cd /Users/jay-work/Code/espn-agent
railway init
```

- Project name: "espn-fantasy-baseball"
- Link to GitHub repo when prompted (optional but recommended for auto-deploys)

### 3. Add Database Services

```bash
# Add PostgreSQL
railway add --database postgres

# Add Redis
railway add --database redis
```

Railway will auto-inject connection strings as:
- `DATABASE_URL` (from Postgres service)
- `REDIS_URL` (from Redis service)

### 4. Run Database Migrations

After databases are created:
```bash
# Get the DATABASE_URL from Railway
railway variables --service postgres

# Run migrations locally pointing to Railway DB
export DATABASE_URL=<railway-postgres-url-from-above>
cd packages/backend
pnpm migrate up
```

### 5. Create and Deploy Backend Service

```bash
railway up --service backend
```

This will:
- Build Docker image using `packages/backend/Dockerfile`
- Deploy and assign a public URL like: `https://espn-fantasy-backend.up.railway.app`

After deployment, set environment variables:
```bash
railway variables --service backend \\
  --set NODE_ENV=production \\
  --set PORT=3001 \\
  --set LOG_LEVEL=info \\
  --set SLACK_ENCRYPTION_KEY=028ae89d3601056c8124668d4f94babfca5125da75422b2fecb4e1cea9fc0b2f \\
  --set INTERNAL_JOB_TOKEN=359d0c3f9cc94057719781ce77973fbe5d88a15772c9156a0bd2c723689e0ed7
```

You'll need to add Slack credentials separately (see step 8).

### 6. Deploy Workers Service

```bash
railway up --service workers
```

Workers will connect to the same DATABASE_URL and REDIS_URL.

### 7. Deploy Frontend Service

First, set the API URL:
```bash
railway variables --service frontend \\
  --set NEXT_PUBLIC_API_URL=https://espn-fantasy-backend.up.railway.app
```

Then deploy:
```bash
railway up --service frontend
```

This assigns a public URL like: `https://espn-fantasy-frontend.up.railway.app`

### 8. Configure Slack App

Update your Slack app at https://api.slack.com/apps with:

1. **OAuth Redirect URL**: `https://espn-fantasy-backend.up.railway.app/slack/oauth/callback`
2. **Interactivity Request URL**: `https://espn-fantasy-backend.up.railway.app/slack/interactive`
3. **Slash Command URL**: `https://espn-fantasy-backend.up.railway.app/slack/commands`

Then add Slack credentials to backend:
```bash
railway variables --service backend \\
  --set SLACK_CLIENT_ID=<your-client-id> \\
  --set SLACK_CLIENT_SECRET=<your-client-secret> \\
  --set SLACK_SIGNING_SECRET=<your-signing-secret> \\
  --set SLACK_REDIRECT_URI=https://espn-fantasy-backend.up.railway.app/slack/oauth/callback \\
  --set FRONTEND_URL=https://espn-fantasy-frontend.up.railway.app
```

### 9. Configure Scheduled Jobs (Morning Reports)

Railway doesn't have built-in cron. Use Upstash QStash (free tier):

1. Go to https://upstash.com and create account
2. Create QStash schedule:
   - URL: `https://espn-fantasy-backend.up.railway.app/internal/jobs/morning-report`
   - Method: POST
   - Headers: `Authorization: Bearer 359d0c3f9cc94057719781ce77973fbe5d88a15772c9156a0bd2c723689e0ed7`
   - Schedule: `0 7 * * *` (7 AM daily)
   - Body: `{"date": "2026-02-14"}`

### 10. Verify Deployment

```bash
# Check backend health
curl https://espn-fantasy-backend.up.railway.app/health

# Check frontend
curl https://espn-fantasy-frontend.up.railway.app

# View logs
railway logs --service backend
railway logs --service workers
railway logs --service frontend
```

## 🔍 Troubleshooting

### Service won't start
- Check logs: `railway logs --service <service-name>`
- Verify environment variables: `railway variables --service <service-name>`
- Check Docker build: `docker build -f packages/backend/Dockerfile .`

### Database connection failed
- Ensure migrations ran successfully
- Check DATABASE_URL is auto-injected: `railway variables --service backend`

### Workers not processing jobs
- Check Redis connection: `railway variables --service workers`
- View worker logs: `railway logs --service workers`
- Ensure all 3 workers started (check for "worker started" messages)

## 📊 Cost Estimate

Railway pricing (approximate):
- PostgreSQL: $5/month
- Redis: $3/month
- Backend: $5/month (512MB RAM, always-on)
- Frontend: $5/month (512MB RAM, always-on)
- Workers: $5/month (512MB RAM, always-on)
- **Total**: ~$23/month

Free tier provides $5/month credit.

## 🔐 Security Notes

- **Never commit** `.env.railway` to git (already in .gitignore)
- Rotate secrets periodically
- Use Railway secrets for sensitive values
- Enable Railway's database backups (automated)

## 📚 Useful Commands

```bash
# View all services
railway status

# Shell into a service
railway shell --service backend

# View service metrics
railway metrics --service backend

# Rollback a deployment
railway rollback --service backend

# Link to a different project
railway link
```

## ✅ Success Criteria

Deployment is successful when:
1. All 5 services are running (green in Railway dashboard)
2. Backend health check passes
3. Frontend loads in browser
4. Workers show "started" in logs
5. Database migrations applied
6. Slack OAuth flow works
7. Morning report cron job configured

---

**Current Status**: Ready to deploy after Railway login
**Next Action**: Run `railway login` in your terminal
