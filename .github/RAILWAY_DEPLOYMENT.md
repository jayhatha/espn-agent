# GitHub Actions Setup for Railway Deployment

This guide will help you set up automatic deployments to Railway when you push to the `main` branch.

## Prerequisites

- GitHub repository for your project
- Railway account with deployed services
- Railway CLI installed locally

## Step 1: Get Your Railway Token

1. **Generate a Railway API token**:

   ```bash
   railway login
   railway whoami --token
   ```

2. Copy the token that's displayed. It should look like: `YOUR_RAILWAY_TOKEN`

## Step 2: Get Your Railway Project ID

Run this command in your project directory:

```bash
railway status --json | grep '"id"' | head -1
```

Or get it from the Railway dashboard URL:

- URL format: `https://railway.com/project/{PROJECT_ID}`
- Your project ID: `e269f633-bb1f-4f90-a3b1-224260f3bc2e`

## Step 3: Add GitHub Secrets

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add these two secrets:

### Secret 1: RAILWAY_TOKEN

- **Name**: `RAILWAY_TOKEN`
- **Value**: Your Railway token from Step 1

### Secret 2: RAILWAY_PROJECT_ID

- **Name**: `RAILWAY_PROJECT_ID`
- **Value**: `e269f633-bb1f-4f90-a3b1-224260f3bc2e`

## Step 4: Test the Workflow

### Option A: Push to Main

```bash
git add .
git commit -m "Set up Railway deployment workflow"
git push origin main
```

### Option B: Manual Trigger

1. Go to your GitHub repository
2. Click **Actions** tab
3. Select **Deploy to Railway** workflow
4. Click **Run workflow** dropdown
5. Click **Run workflow** button

## How It Works

When you push to `main`, the workflow will:

1. ✅ Check out your code
2. ✅ Install Railway CLI
3. ✅ Deploy backend service
4. ✅ Deploy workers service
5. ✅ Deploy frontend service
6. ✅ Show deployment summary

Each service is deployed independently using its respective Railway configuration file.

## Deployment URLs

After deployment completes, your services will be available at:

- **Backend**: https://backend-production-c473.up.railway.app
- **Frontend**: https://frontend-production-1e247.up.railway.app

## Monitoring Deployments

### View Logs in GitHub

1. Go to **Actions** tab in your repository
2. Click on the latest workflow run
3. Click on the **Deploy to Railway** job to see logs

### View Logs in Railway

```bash
railway logs --service backend
railway logs --service workers
railway logs --service frontend
```

## Troubleshooting

### Error: "Project not found"

- Verify `RAILWAY_PROJECT_ID` matches your Railway project ID
- Check the Railway dashboard URL to confirm

### Error: "Unauthorized"

- Regenerate your Railway token: `railway whoami --token`
- Update the `RAILWAY_TOKEN` secret in GitHub

### Error: "Service not found"

- Ensure all three services (backend, workers, frontend) exist in Railway
- Check service names match exactly: `backend`, `workers`, `frontend`

### Deployment takes too long

- Railway builds Docker images from scratch
- First deployment takes 3-5 minutes per service
- Subsequent deployments use cached layers (faster)

## Development Workflow

### Recommended workflow:

1. **Develop locally** with Docker:

   ```bash
   docker-compose up
   ```

2. **Test your changes** locally

3. **Commit to a feature branch**:

   ```bash
   git checkout -b feature/my-feature
   git commit -am "Add new feature"
   git push origin feature/my-feature
   ```

4. **Create a Pull Request** on GitHub

5. **Review and merge to main**
   - This triggers automatic deployment to Railway

6. **Verify deployment** in Railway dashboard

## Optional: Add Branch Protection

To prevent accidental deployments:

1. Go to **Settings** → **Branches**
2. Click **Add rule**
3. Branch name pattern: `main`
4. Enable:
   - ✅ Require a pull request before merging
   - ✅ Require status checks to pass before merging
5. Click **Create**

This ensures all code is reviewed before deploying to production.

## Cost Considerations

- Each deployment triggers a new build
- Railway charges for build time + runtime
- Limit deployments to reduce costs:
  - Use feature branches for development
  - Only merge to main when ready to deploy
  - Consider a staging branch for pre-production testing

## Next Steps

- [ ] Add test workflow (run tests before deploying)
- [ ] Add database migration step to workflow
- [ ] Set up Slack notifications for deployments
- [ ] Create staging environment (optional)
