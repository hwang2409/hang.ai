#!/bin/bash

echo "🎙️ Starting Django Server with Voice Component Preloading"
echo "========================================================="

# Set environment variable to preload voice components
export PRELOAD_VOICE_COMPONENTS=true

echo "📦 Voice components will be preloaded for faster transcription"
echo "🚀 Starting Django development server..."

# Start Django server
python3 manage.py runserver 8000
