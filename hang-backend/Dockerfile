# Use Python 3.9 slim image
FROM python:3.9-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DJANGO_SETTINGS_MODULE=backend.settings_production

# Set work directory
WORKDIR /app

# Install system dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        postgresql-client \
        build-essential \
        libpq-dev \
        wget \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Cloud SQL Auth Proxy
RUN wget https://dl.google.com/cloudsql/cloud_sql_proxy.linux.amd64 -O /usr/local/bin/cloud_sql_proxy \
    && chmod +x /usr/local/bin/cloud_sql_proxy

# Install Python dependencies
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy project
COPY . /app/

# Create directories for static and media files
RUN mkdir -p /app/staticfiles /app/media

# Copy and make startup script executable
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Set default port
ENV PORT=8000

# Expose port
EXPOSE $PORT

# Run the startup script
CMD ["/app/start.sh"]
