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
        # Audio processing dependencies
        portaudio19-dev \
        libasound2-dev \
        libsndfile1-dev \
        ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install Cloud SQL Auth Proxy v2
RUN wget https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.0/cloud-sql-proxy.linux.amd64 -O /usr/local/bin/cloud_sql_proxy \
    && chmod +x /usr/local/bin/cloud_sql_proxy

# Install Python dependencies
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy project
COPY . /app/

# Create directories for static and media files
RUN mkdir -p /app/staticfiles /app/media

# Copy and make startup scripts executable
COPY start.sh /app/start.sh
COPY start_with_proxy.sh /app/start_with_proxy.sh
RUN chmod +x /app/start.sh /app/start_with_proxy.sh

# Set default port
ENV PORT=8000

# Expose port
EXPOSE $PORT

# Run the startup script
CMD ["bash", "/app/start_with_proxy.sh"]
