# Fixed Deployment Guide for Hang.ai

This guide addresses the Nix/PostgreSQL deployment error and provides multiple deployment options.

## The Error You Encountered

The error `attribute 'dev' missing` occurs because:
- Railway's Nixpacks is trying to install `postgresql_16.dev`
- This package doesn't exist in the Nix package set
- The `.dev` suffix is incorrect for PostgreSQL development packages

## Solution: Multiple Deployment Options

I've created several deployment configurations to avoid this issue:

### Option 1: Railway with Dockerfile (Recommended)

1. **Use the Dockerfile instead of Nixpacks**:
   - Railway will automatically detect the `Dockerfile` and use it instead of Nixpacks
   - This avoids the PostgreSQL package issue entirely

2. **Deploy to Railway**:
   ```bash
   # Push your code to GitHub first
   git add .
   git commit -m "Add Dockerfile and fix deployment"
   git push
   ```

3. **In Railway Dashboard**:
   - Create new project from GitHub
   - Select your repository
   - Railway will automatically detect the Dockerfile
   - Add environment variables:
     ```
     DB_NAME=your_db_name
     DB_USER=your_db_user
     DB_PASSWORD=your_db_password
     DB_HOST=your_db_host
     DB_PORT=5432
     SECRET_KEY=your_secret_key
     DJANGO_SETTINGS_MODULE=backend.settings_production
     ```

### Option 2: Railway with Fixed Nixpacks

If you prefer to use Nixpacks, use the `nixpacks.toml` file I created:

1. **The nixpacks.toml file**:
   - Removes the problematic `postgresql_16.dev` package
   - Uses `postgresql` instead (client only, no dev package needed)
   - Specifies proper build phases

2. **Deploy**:
   - Railway will use the `nixpacks.toml` configuration
   - This should avoid the PostgreSQL package error

### Option 3: Heroku (Alternative)

1. **Create Heroku app**:
   ```bash
   heroku create your-app-name
   ```

2. **Set environment variables**:
   ```bash
   heroku config:set DB_NAME=your_db_name
   heroku config:set DB_USER=your_db_user
   heroku config:set DB_PASSWORD=your_db_password
   heroku config:set DB_HOST=your_db_host
   heroku config:set DB_PORT=5432
   heroku config:set SECRET_KEY=your_secret_key
   heroku config:set DJANGO_SETTINGS_MODULE=backend.settings_production
   ```

3. **Deploy**:
   ```bash
   git push heroku main
   ```

### Option 4: DigitalOcean App Platform

1. **Create App**:
   - Go to DigitalOcean App Platform
   - Connect GitHub repository
   - Select `hang-backend` as source directory
   - Choose "Docker" as build method

2. **Configure**:
   - Add environment variables
   - Set build command: `pip install -r requirements.txt && python manage.py collectstatic --noinput`
   - Set run command: `gunicorn backend.wsgi:application --bind 0.0.0.0:$PORT`

## Database Options

### Option 1: Railway PostgreSQL
- Create a PostgreSQL service in Railway
- Use the connection details in your environment variables

### Option 2: Supabase
- Create a project at supabase.com
- Use the connection details from your project settings

### Option 3: Neon
- Create a database at neon.tech
- Use the connection string provided

## Frontend Deployment (Vercel)

1. **Deploy to Vercel**:
   - Go to vercel.com
   - Connect GitHub repository
   - Set root directory to `hang-frontend`
   - Add environment variable:
     ```
     NEXT_PUBLIC_API_BASE_URL=https://your-backend-url.railway.app/api
     ```

2. **Update CORS**:
   - In your backend, update `CORS_ALLOWED_ORIGINS` with your Vercel URL

## Troubleshooting

### If you still get the Nix error:

1. **Force Dockerfile usage**:
   - Make sure `Dockerfile` exists in `hang-backend/`
   - Railway should automatically use it instead of Nixpacks

2. **Check Railway settings**:
   - In Railway dashboard, go to Settings → Build
   - Make sure "Use Dockerfile" is enabled

3. **Alternative: Use Render**:
   - Render.com has better Django support
   - No Nix issues
   - Free tier available

### Common Issues:

1. **Static files not loading**:
   - Make sure `whitenoise` is in requirements.txt
   - Check `STATIC_ROOT` and `STATIC_URL` settings

2. **Database connection errors**:
   - Verify all database environment variables are set
   - Check if your database allows external connections

3. **CORS errors**:
   - Update `CORS_ALLOWED_ORIGINS` with your frontend URL
   - Make sure `CORS_ALLOW_CREDENTIALS = True`

## Quick Fix Commands

If you're still having issues, try these commands:

```bash
# 1. Make sure all files are committed
git add .
git commit -m "Fix deployment configuration"
git push

# 2. Check if Dockerfile exists
ls -la hang-backend/Dockerfile

# 3. Test locally with production settings
cd hang-backend
export DJANGO_SETTINGS_MODULE=backend.settings_production
python manage.py collectstatic --noinput
python manage.py check --deploy
```

## Success Indicators

Your deployment is successful when:
- ✅ Backend builds without Nix errors
- ✅ Database migrations run successfully
- ✅ Static files are collected
- ✅ Frontend can connect to backend API
- ✅ User registration/login works
- ✅ Notes can be created and saved

## Need Help?

If you're still encountering issues:
1. Check the Railway/Render build logs
2. Verify all environment variables are set
3. Test the API endpoints manually
4. Check the browser console for frontend errors

The Dockerfile approach should resolve the Nix/PostgreSQL error you encountered. Let me know if you need help with any specific step!
