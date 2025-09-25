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
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Cloud SQL Auth Proxy v2
RUN wget https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.0/cloud-sql-proxy.linux.amd64 -O /usr/local/bin/cloud_sql_proxy \
    && chmod +x /usr/local/bin/cloud_sql_proxy

# Copy requirements first for better caching
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy project
COPY . /app/

# Create directories
RUN mkdir -p /app/staticfiles /app/media

# Note: collectstatic will be run at startup when environment variables are available

# Set default port
ENV PORT=8000
EXPOSE $PORT

# Make startup scripts executable
RUN chmod +x /app/start.sh /app/start_with_proxy.sh

# Use the Cloud SQL proxy script
CMD ["bash", "/app/start_with_proxy.sh"]
