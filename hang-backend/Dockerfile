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

# Copy project (this will copy the main repo but not submodule contents)
COPY . /app/

# Handle textalk git submodule by copying files explicitly from the build context
# First, initialize the submodule structure
RUN mkdir -p /app/textalk

# Copy all textalk files from the build context
COPY textalk/ /app/textalk/

# If the above doesn't work due to submodule issues, copy files individually
RUN if [ ! -f /app/textalk/steve.py ]; then \
    echo "WARNING: steve.py not found, checking what was copied..." && \
    ls -la /app/textalk/ && \
    echo "This suggests git submodule files weren't included in build context"; \
fi

# Verify files were copied and show what's in the directories
RUN echo "=== Verifying textalk files ===" && \
    ls -la /app/ && \
    echo "=== Contents of /app/textalk/ ===" && \
    ls -la /app/textalk/ && \
    echo "=== Checking steve.py exists ===" && \
    ls -la /app/textalk/steve.py && \
    echo "=== First few lines of steve.py ===" && \
    head -5 /app/textalk/steve.py

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
