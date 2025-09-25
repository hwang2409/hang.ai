# Use Microsoft Container Registry Python image to avoid Docker Hub issues  
FROM mcr.microsoft.com/devcontainers/python:3.11

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DJANGO_SETTINGS_MODULE=backend.settings_production

# Set work directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    postgresql-client \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy project
COPY . /app/

# Create directories
RUN mkdir -p /app/staticfiles /app/media

# Collect static files
RUN python manage.py collectstatic --noinput

# Set default port
ENV PORT=8000
EXPOSE $PORT

# Run the application directly with gunicorn
CMD ["sh", "-c", "gunicorn backend.wsgi:application --bind 0.0.0.0:$PORT"]
