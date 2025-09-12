#!/bin/bash
set -e

echo "Starting Hang.ai backend..."

# Wait for database to be ready
echo "Waiting for database..."
python manage.py migrate --noinput

# Collect static files
echo "Collecting static files..."
python manage.py collectstatic --noinput

# Start the application with a fixed port
echo "Starting application..."
exec gunicorn backend.wsgi:application --bind 0.0.0.0:8000
