#!/bin/bash

# Deployment script for Hang.ai
# This script helps prepare your application for deployment

echo "🚀 Hang.ai Deployment Preparation Script"
echo "========================================"

# Check if we're in the right directory
if [ ! -f "hang-frontend/package.json" ] || [ ! -f "hang-backend/manage.py" ]; then
    echo "❌ Error: Please run this script from the root directory of your Hang.ai project"
    exit 1
fi

echo "✅ Project structure looks good"

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "📦 Initializing git repository..."
    git init
    git add .
    git commit -m "Initial commit for deployment"
    echo "✅ Git repository initialized"
else
    echo "✅ Git repository already exists"
fi

# Check if .env file exists in backend
if [ ! -f "hang-backend/.env" ]; then
    echo "⚠️  Warning: No .env file found in hang-backend directory"
    echo "   You'll need to create one with your production database credentials"
    echo "   Example:"
    echo "   DB_NAME=your_production_db_name"
    echo "   DB_USER=your_production_db_user"
    echo "   DB_PASSWORD=your_production_db_password"
    echo "   DB_HOST=your_production_db_host"
    echo "   DB_PORT=5432"
    echo "   SECRET_KEY=your_very_secure_secret_key_here"
fi

# Check if all required files exist
echo "🔍 Checking deployment files..."

required_files=(
    "hang-frontend/vercel.json"
    "hang-backend/requirements.txt"
    "hang-backend/Procfile"
    "hang-backend/runtime.txt"
    "hang-backend/backend/settings_production.py"
)

for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file exists"
    else
        echo "❌ $file is missing"
    fi
done

echo ""
echo "📋 Next Steps:"
echo "1. Push your code to GitHub:"
echo "   git remote add origin https://github.com/yourusername/hang-ai.git"
echo "   git push -u origin main"
echo ""
echo "2. Deploy backend to Railway:"
echo "   - Go to railway.app"
echo "   - Connect your GitHub repository"
echo "   - Set root directory to 'hang-backend'"
echo "   - Add environment variables"
echo ""
echo "3. Deploy frontend to Vercel:"
echo "   - Go to vercel.com"
echo "   - Connect your GitHub repository"
echo "   - Set root directory to 'hang-frontend'"
echo "   - Add NEXT_PUBLIC_API_BASE_URL environment variable"
echo ""
echo "4. Update CORS settings in backend with your frontend URL"
echo ""
echo "📖 For detailed instructions, see DEPLOYMENT.md"
echo ""
echo "🎉 Happy deploying!"
