# Voice Transcription Deployment Guide

This guide covers deploying the Hang.ai app with voice transcription functionality to production.

## 🎯 What's Included

The voice transcription feature includes:
- **Speech-to-Text**: Whisper AI model for speech recognition
- **Text-to-LaTeX**: Finite State Transducer for mathematical expressions
- **Database Storage**: Persistent transcription history
- **Real-time Processing**: Fast audio processing with caching

## 🚀 Deployment Steps

### 1. Backend Deployment (Railway/Heroku/Render)

#### **Option A: Railway (Recommended)**

1. **Push updated code**:
   ```bash
   git add .
   git commit -m "Add voice transcription dependencies"
   git push
   ```

2. **Deploy to Railway**:
   - Railway will automatically detect the `Dockerfile`
   - The Dockerfile includes all voice dependencies
   - System audio libraries are pre-installed

3. **Set Environment Variables**:
   ```
   DB_NAME=your_db_name
   DB_USER=your_db_user  
   DB_PASSWORD=your_db_password
   DB_HOST=your_db_host
   DB_PORT=5432
   SECRET_KEY=your_secret_key
   DJANGO_SETTINGS_MODULE=backend.settings_production
   PRELOAD_VOICE_COMPONENTS=true  # Optional: preload models on startup
   ```

#### **Option B: Heroku**

1. **Create Heroku app**:
   ```bash
   heroku create your-app-name
   ```

2. **Add buildpack for audio support**:
   ```bash
   heroku buildpacks:add --index 1 https://github.com/jonathanong/heroku-buildpack-ffmpeg-latest.git
   heroku buildpacks:add --index 2 heroku/python
   ```

3. **Set environment variables**:
   ```bash
   heroku config:set PRELOAD_VOICE_COMPONENTS=true
   heroku config:set DJANGO_SETTINGS_MODULE=backend.settings_production
   # ... other database variables
   ```

4. **Deploy**:
   ```bash
   git push heroku main
   ```

### 2. Frontend Deployment (Vercel)

1. **Deploy to Vercel**:
   - Connect GitHub repository
   - Set root directory to `hang-frontend`
   - Add environment variable:
     ```
     NEXT_PUBLIC_API_BASE_URL=https://your-backend-url.railway.app/api
     ```

2. **Update CORS in backend**:
   - Add your Vercel URL to `CORS_ALLOWED_ORIGINS` in `settings_production.py`

### 3. Database Setup

#### **Voice Transcription Tables**
The voice app creates these tables automatically:
- `voice_voicetranscription`: Stores transcription history
- Indexes for performance on user queries

#### **Migration Commands**
```bash
# Run migrations (handled automatically in deployment)
python manage.py migrate voice
```

## 🔧 Voice-Specific Configuration

### **Environment Variables**

| Variable | Description | Default |
|----------|-------------|---------|
| `PRELOAD_VOICE_COMPONENTS` | Preload Whisper/FST models on startup | `false` |
| `DJANGO_SETTINGS_MODULE` | Use production settings | `backend.settings_production` |

### **Model Loading Strategy**

#### **Option 1: Lazy Loading (Default)**
- Models load on first transcription request
- Faster startup, slower first request
- Good for development/testing

#### **Option 2: Preloading (Production)**
- Models load during server startup
- Slower startup, faster requests
- Better for production with high traffic

**To enable preloading**:
```bash
export PRELOAD_VOICE_COMPONENTS=true
```

## 📊 Performance Considerations

### **Memory Usage**
- **Whisper model**: ~1GB RAM
- **FST components**: ~50MB RAM
- **Total voice overhead**: ~1.1GB RAM

### **Startup Time**
- **Without preloading**: ~30 seconds first request
- **With preloading**: ~2-3 minutes startup time
- **Subsequent requests**: <1 second

### **Storage Requirements**
- **Model files**: Downloaded automatically on first use
- **Transcription data**: Stored in database
- **Audio files**: Temporary, cleaned up after processing

## 🧪 Testing Deployment

### **1. Health Check**
```bash
curl https://your-backend-url.railway.app/api/voice/test/
```

Expected response:
```json
{
  "status": "success",
  "components": {
    "steve": "available",
    "fst": "available"
  },
  "cache_status": "initialized"
}
```

### **2. Test Transcription**
1. Go to `/voice` page on frontend
2. Click "Start Recording"
3. Say: "integral of x squared"
4. Check for LaTeX output: `\int x^2 \, dx`

### **3. Database Verification**
```bash
# Check if transcriptions are being saved
python manage.py shell
>>> from voice.models import VoiceTranscription
>>> VoiceTranscription.objects.count()
```

## 🚨 Troubleshooting

### **Common Issues**

#### **1. "No module named 'torch'"**
- **Cause**: Voice dependencies not installed
- **Fix**: Ensure `requirements.txt` includes voice dependencies

#### **2. "Audio processing failed"**
- **Cause**: Missing system audio libraries
- **Fix**: Dockerfile includes `portaudio19-dev`, `libsndfile1-dev`

#### **3. "Whisper model not found"**
- **Cause**: Model download failed
- **Fix**: Check internet connection, model downloads automatically

#### **4. "CORS error"**
- **Cause**: Frontend URL not in CORS settings
- **Fix**: Add Vercel URL to `CORS_ALLOWED_ORIGINS`

#### **5. "Database connection failed"**
- **Cause**: Database environment variables not set
- **Fix**: Verify all database credentials

### **Debug Commands**

```bash
# Check voice components status
curl https://your-backend-url.railway.app/api/voice/test/

# Test database connection
python manage.py dbshell

# Check logs
heroku logs --tail  # For Heroku
railway logs        # For Railway
```

## 📈 Monitoring

### **Key Metrics to Monitor**
- **Transcription success rate**: Should be >90%
- **Processing time**: Should be <5 seconds
- **Memory usage**: Monitor for memory leaks
- **Database growth**: Transcription storage

### **Logs to Watch**
- Voice component initialization
- Transcription processing times
- Error rates and types
- Database query performance

## 🎯 Success Indicators

Your voice transcription deployment is successful when:

✅ **Backend builds** without dependency errors  
✅ **Voice components load** (check `/api/voice/test/`)  
✅ **Frontend connects** to backend API  
✅ **Recording works** in browser  
✅ **Transcription processes** successfully  
✅ **LaTeX output** is generated  
✅ **Database saves** transcription history  
✅ **Edit functionality** works  
✅ **Delete functionality** works  

## 🚀 Production Optimization

### **For High Traffic**
1. **Enable preloading**: `PRELOAD_VOICE_COMPONENTS=true`
2. **Use Redis caching**: For model components
3. **Database indexing**: Already configured
4. **CDN for static files**: Vercel handles this

### **For Cost Optimization**
1. **Lazy loading**: Don't preload models
2. **Database cleanup**: Regular transcription cleanup
3. **Resource limits**: Set memory/CPU limits

## 📞 Support

If you encounter issues:

1. **Check build logs** for dependency errors
2. **Test API endpoints** manually
3. **Verify environment variables** are set
4. **Check browser console** for frontend errors
5. **Monitor server logs** for backend errors

The voice transcription feature is now ready for production deployment! 🎉
