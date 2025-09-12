#!/bin/bash
set -e

echo "=========================================="
echo "Starting Hang.ai backend with Cloud SQL Proxy..."
echo "=========================================="

# Set default port if PORT is not set
export PORT=${PORT:-8000}
echo "Using port: $PORT"

# Check environment variables
echo "=========================================="
echo "Checking environment variables..."
echo "=========================================="
echo "DB_NAME: ${DB_NAME:-'NOT SET'}"
echo "DB_USER: ${DB_USER:-'NOT SET'}"
echo "DB_HOST: ${DB_HOST:-'NOT SET'}"
echo "DB_PASSWORD: ${DB_PASSWORD:+SET}"
echo "DJANGO_SETTINGS_MODULE: ${DJANGO_SETTINGS_MODULE:-'NOT SET'}"
echo "SECRET_KEY: ${SECRET_KEY:+SET}"
echo "GCLOUD_CREDENTIALS_BASE64: ${GCLOUD_CREDENTIALS_BASE64:+SET}"
echo "CLOUD_SQL_CONNECTION_NAME: ${CLOUD_SQL_CONNECTION_NAME:-'NOT SET'}"

# Check if required environment variables are set
if [ -z "$GCLOUD_CREDENTIALS_BASE64" ]; then
    echo "=========================================="
    echo "ERROR: GCLOUD_CREDENTIALS_BASE64 is not set!"
    echo "Please set your Google Cloud credentials in Railway"
    echo "=========================================="
    exit 1
fi

if [ -z "$CLOUD_SQL_CONNECTION_NAME" ]; then
    echo "=========================================="
    echo "ERROR: CLOUD_SQL_CONNECTION_NAME is not set!"
    echo "Please set: CLOUD_SQL_CONNECTION_NAME=project:region:instance"
    echo "=========================================="
    exit 1
fi

# Set up Google Cloud credentials
echo "=========================================="
echo "Setting up Google Cloud credentials..."
echo "=========================================="
echo "$GCLOUD_CREDENTIALS_BASE64" | base64 -d > /tmp/gcloud-credentials.json
export GOOGLE_APPLICATION_CREDENTIALS=/tmp/gcloud-credentials.json

# Start Cloud SQL Auth Proxy in background
echo "=========================================="
echo "Starting Cloud SQL Auth Proxy..."
echo "=========================================="
cloud_sql_proxy "$CLOUD_SQL_CONNECTION_NAME" --port 5432 --credentials-file=/tmp/gcloud-credentials.json &
PROXY_PID=$!

# Wait for proxy to start
echo "Waiting for Cloud SQL Auth Proxy to start..."
sleep 5

# Check if proxy is running
if ! kill -0 $PROXY_PID 2>/dev/null; then
    echo "=========================================="
    echo "ERROR: Cloud SQL Auth Proxy failed to start!"
    echo "=========================================="
    exit 1
fi

echo "Cloud SQL Auth Proxy started successfully (PID: $PROXY_PID)"

# Update database settings to use localhost (proxy)
export DB_HOST=localhost
export DB_PORT=5432

# Test Django configuration
echo "=========================================="
echo "Testing Django configuration..."
echo "=========================================="
python manage.py check --deploy || {
    echo "=========================================="
    echo "ERROR: Django configuration check failed!"
    echo "=========================================="
    kill $PROXY_PID 2>/dev/null || true
    exit 1
}

# Wait for database to be ready
echo "=========================================="
echo "Waiting for database..."
echo "=========================================="
python manage.py migrate --noinput || {
    echo "=========================================="
    echo "ERROR: Database migration failed!"
    echo "=========================================="
    kill $PROXY_PID 2>/dev/null || true
    exit 1
}

# Collect static files
echo "=========================================="
echo "Collecting static files..."
echo "=========================================="
python manage.py collectstatic --noinput || {
    echo "=========================================="
    echo "WARNING: Static files collection failed, continuing..."
    echo "=========================================="
}

# Function to cleanup proxy on exit
cleanup() {
    echo "=========================================="
    echo "Shutting down Cloud SQL Auth Proxy..."
    echo "=========================================="
    kill $PROXY_PID 2>/dev/null || true
    wait $PROXY_PID 2>/dev/null || true
}

# Set trap to cleanup on exit
trap cleanup EXIT

# Start the application
echo "=========================================="
echo "Starting application on port $PORT..."
echo "=========================================="
exec gunicorn backend.wsgi:application --bind 0.0.0.0:$PORT --timeout 120 --workers 2
