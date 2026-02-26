#!/bin/bash

# Railway GitHub Actions Setup Helper
# This script helps you gather the credentials needed for GitHub Actions

set -e

echo "=========================================="
echo "Railway GitHub Actions Setup Helper"
echo "=========================================="
echo ""

echo "📋 Step 1: Getting Railway Token"
echo "---"
echo "Running: railway whoami --token"
echo ""

RAILWAY_TOKEN=$(railway whoami --token 2>/dev/null || echo "")

if [ -z "$RAILWAY_TOKEN" ]; then
  echo "❌ Failed to get Railway token. Please run 'railway login' first."
  exit 1
else
  echo "✅ Railway Token:"
  echo "$RAILWAY_TOKEN"
  echo ""
fi

echo "📋 Step 2: Getting Railway Project ID"
echo "---"
echo "Running: railway status --json"
echo ""

RAILWAY_PROJECT_ID=$(railway status --json 2>/dev/null | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "")

if [ -z "$RAILWAY_PROJECT_ID" ]; then
  echo "❌ Failed to get Railway project ID. Please ensure you're in the project directory."
  exit 1
else
  echo "✅ Railway Project ID:"
  echo "$RAILWAY_PROJECT_ID"
  echo ""
fi

echo "=========================================="
echo "GitHub Secrets Configuration"
echo "=========================================="
echo ""
echo "Add these secrets to your GitHub repository:"
echo ""
echo "1. Go to: https://github.com/YOUR_USERNAME/YOUR_REPO/settings/secrets/actions"
echo "2. Click 'New repository secret'"
echo "3. Add the following secrets:"
echo ""
echo "Secret Name: RAILWAY_TOKEN"
echo "Secret Value:"
echo "$RAILWAY_TOKEN"
echo ""
echo "Secret Name: RAILWAY_PROJECT_ID"
echo "Secret Value:"
echo "$RAILWAY_PROJECT_ID"
echo ""

echo "=========================================="
echo "✅ Setup Complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Copy the secrets above to GitHub"
echo "2. Commit and push to main:"
echo "   git add .github/"
echo "   git commit -m 'Add Railway deployment workflow'"
echo "   git push origin main"
echo ""
echo "3. Watch the deployment:"
echo "   https://github.com/YOUR_USERNAME/YOUR_REPO/actions"
echo ""
