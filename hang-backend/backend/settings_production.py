"""
Production settings for backend project.
"""

from .settings import *
import os

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = False

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.getenv('SECRET_KEY', 'django-insecure-8^^(_73o8m&zd39tx!z2*%l5fw)qsv(*^=t1kl-7%xm5%uq+wm')

# Allow all hosts for deployment (you should restrict this in production)
ALLOWED_HOSTS = ['*']

# CORS settings for production
CORS_ALLOWED_ORIGINS = [
    "https://hangai-six.vercel.app"
]

# Add your production frontend URL here
CORS_ALLOW_CREDENTIALS = True

# Static files configuration for production
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')
STATIC_URL = '/static/'

# Media files configuration
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')
MEDIA_URL = '/media/'

# Add whitenoise for serving static files
MIDDLEWARE.insert(1, 'whitenoise.middleware.WhiteNoiseMiddleware')

# WhiteNoise configuration
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

# Security settings for production
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'

# HTTPS settings (uncomment when using HTTPS)
# SECURE_SSL_REDIRECT = True
# SESSION_COOKIE_SECURE = True
# CSRF_COOKIE_SECURE = True

# Database configuration for production
# Override base settings to handle different database types
DB_NAME = os.getenv('DB_NAME')
DB_USER = os.getenv('DB_USER')
DB_PASSWORD = os.getenv('DB_PASSWORD')
DB_HOST = os.getenv('DB_HOST')
DB_PORT = os.getenv('DB_PORT', '5432')

# Check for required database environment variables
if not all([DB_NAME, DB_USER, DB_PASSWORD, DB_HOST]):
    raise ValueError("Missing required database environment variables: DB_NAME, DB_USER, DB_PASSWORD, DB_HOST")

# Database configuration
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': DB_NAME,
        'USER': DB_USER,
        'PASSWORD': DB_PASSWORD,
        'HOST': DB_HOST,
        'PORT': DB_PORT,
        'OPTIONS': {
            # Cloud SQL Proxy v2 handles SSL internally, disable for localhost
            'sslmode': 'disable',
        },
    }
}
