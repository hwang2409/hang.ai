# Deployment Guide for Hang.ai

This guide will help you deploy your Hang.ai note-taking application to production.

## Architecture Overview

- **Frontend**: Next.js app deployed on Vercel
- **Backend**: Django REST API deployed on Railway
- **Database**: PostgreSQL (Railway, Supabase, or Neon)

## Prerequisites

1. GitHub account
2. Vercel account (free tier available)
3. Railway account (free tier available)
4. Domain name (optional)

## Step 1: Prepare Your Code

### 1.1 Push to GitHub

```bash
# Initialize git if not already done
git init
git add .
git commit -m "Initial commit"

# Create a GitHub repository and push
git remote add origin https://github.com/yourusername/hang-ai.git
git push -u origin main
```

### 1.2 Environment Variables

Create a `.env` file in the backend directory with your production database credentials:

```bash
# Backend .env file
DB_NAME=your_production_db_name
DB_USER=your_production_db_user
DB_PASSWORD=your_production_db_password
DB_HOST=your_production_db_host
DB_PORT=5432
SECRET_KEY=your_very_secure_secret_key_here
```

## Step 2: Deploy Backend to Railway

### 2.1 Connect Railway to GitHub

1. Go to [Railway.app](https://railway.app)
2. Sign up/login with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your repository
5. Choose the `hang-backend` folder as the root directory

### 2.2 Configure Environment Variables

In Railway dashboard, go to your project → Variables tab and add:

```
DB_NAME=your_production_db_name
DB_USER=your_production_db_user
DB_PASSWORD=your_production_db_password
DB_HOST=your_production_db_host
DB_PORT=5432
SECRET_KEY=your_very_secure_secret_key_here
DJANGO_SETTINGS_MODULE=backend.settings_production
```

### 2.3 Deploy

Railway will automatically deploy your backend. Note the generated URL (e.g., `https://your-app.railway.app`).

## Step 3: Deploy Frontend to Vercel

### 3.1 Connect Vercel to GitHub

1. Go to [Vercel.com](https://vercel.com)
2. Sign up/login with GitHub
3. Click "New Project"
4. Import your GitHub repository
5. Set the root directory to `hang-frontend`

### 3.2 Configure Environment Variables

In Vercel dashboard, go to your project → Settings → Environment Variables and add:

```
NEXT_PUBLIC_API_BASE_URL=https://your-backend-url.railway.app/api
```

### 3.3 Deploy

Vercel will automatically deploy your frontend. You'll get a URL like `https://your-app.vercel.app`.

## Step 4: Update CORS Settings

### 4.1 Update Backend CORS

In your Railway backend, update the CORS settings in `backend/settings_production.py`:

```python
CORS_ALLOWED_ORIGINS = [
    "https://your-frontend-url.vercel.app",
]
```

### 4.2 Redeploy Backend

Push your changes to trigger a new deployment:

```bash
git add .
git commit -m "Update CORS settings for production"
git push
```

## Step 5: Database Setup

### 5.1 Run Migrations

Connect to your Railway backend and run migrations:

```bash
# In Railway dashboard, go to your service → Deployments → View Logs
# Or use Railway CLI:
railway run python manage.py migrate
```

### 5.2 Create Superuser

```bash
railway run python manage.py createsuperuser
```

## Step 6: Test Your Deployment

1. Visit your frontend URL
2. Try creating an account
3. Create a note
4. Test all functionality

## Step 7: Custom Domain (Optional)

### 7.1 Frontend Domain

1. In Vercel dashboard, go to your project → Settings → Domains
2. Add your custom domain
3. Update DNS records as instructed

### 7.2 Backend Domain

1. In Railway dashboard, go to your project → Settings → Domains
2. Add your custom domain
3. Update the `NEXT_PUBLIC_API_BASE_URL` in Vercel with your new backend domain

## Monitoring and Maintenance

### Logs

- **Frontend**: Vercel dashboard → Functions tab
- **Backend**: Railway dashboard → Deployments → View Logs

### Database Backups

Railway provides automatic backups for PostgreSQL databases.

### Updates

To update your application:

1. Make changes locally
2. Test thoroughly
3. Push to GitHub
4. Both Vercel and Railway will automatically redeploy

## Troubleshooting

### Common Issues

1. **CORS Errors**: Make sure your frontend URL is in the backend's `CORS_ALLOWED_ORIGINS`
2. **Database Connection**: Verify your database credentials in Railway environment variables
3. **Static Files**: Ensure `STATIC_ROOT` and `MEDIA_ROOT` are properly configured
4. **Environment Variables**: Double-check all environment variables are set correctly

### Debug Mode

If you need to debug, temporarily set `DEBUG = True` in your production settings, but remember to set it back to `False` for security.

## Security Considerations

1. **Secret Key**: Use a strong, unique secret key
2. **Database**: Use strong passwords and enable SSL
3. **HTTPS**: Both Vercel and Railway provide HTTPS by default
4. **CORS**: Only allow your frontend domain
5. **Environment Variables**: Never commit sensitive data to git

## Cost Estimation

- **Vercel**: Free tier includes 100GB bandwidth, unlimited deployments
- **Railway**: Free tier includes $5 credit monthly
- **Database**: Railway PostgreSQL is included in the free tier

## Support

- [Vercel Documentation](https://vercel.com/docs)
- [Railway Documentation](https://docs.railway.app)
- [Django Deployment Guide](https://docs.djangoproject.com/en/3.2/howto/deployment/)

---

Your Hang.ai application should now be live and accessible to users worldwide! 🚀
