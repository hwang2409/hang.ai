# Voice Components Production Troubleshooting

## 🚨 **Current Issue**
`Failed to import Steve: Could not import Steve from any location`

This means the `steve.py` file isn't being found in production.

## 🔍 **Diagnostic Steps**

### **Step 1: Check File Structure**
```bash
curl https://your-backend-url.railway.app/api/voice/files/
```

**Look for:**
- `steve_file_exists: true`
- `interpreter_file_exists: true`
- File paths and sizes

### **Step 2: Check Debug Info**
```bash
curl https://your-backend-url.railway.app/api/voice/test/
```

**Look for:**
- `textalk_exists: true`
- `steve_file_exists: true`
- `interpreter_file_exists: true`

## 🔧 **Possible Solutions**

### **Solution 1: Files Not Deployed**
If `steve_file_exists: false`:

**Check Dockerfile:**
```dockerfile
# Ensure this line exists
COPY . /app/
```

**Verify deployment:**
- The `textalk` directory should be copied to `/app/textalk/`
- Files should exist: `/app/textalk/steve.py`, `/app/textalk/interpreter.py`

### **Solution 2: Wrong Directory Structure**
If files exist but in wrong location:

**Check the debug output:**
- Look at `all_paths_tried` array
- See which paths are being checked
- Verify the correct path

### **Solution 3: Import Path Issues**
If files exist but imports fail:

**Check Python path:**
- Look at `python_path` in debug output
- Ensure textalk directory is in sys.path

## 🚀 **Quick Fixes**

### **Fix 1: Force File Copy**
Add to Dockerfile:
```dockerfile
# Explicitly copy textalk directory
COPY textalk/ /app/textalk/
```

### **Fix 2: Check .dockerignore**
Ensure `.dockerignore` doesn't exclude:
```
# Remove these if present:
textalk/
*.py
```

### **Fix 3: Verify Deployment**
Check if files are actually in production:
```bash
# If you have container access
ls -la /app/
ls -la /app/textalk/
cat /app/textalk/steve.py | head -10
```

## 🎯 **Expected Results**

After fixes, you should see:
- ✅ `steve_file_exists: true`
- ✅ `interpreter_file_exists: true`
- ✅ `imports.steve: "success"`
- ✅ `imports.interpreter: "success"`

## 🚨 **If Still Failing**

### **Check Production Logs**
Look for these messages:
- `"Found textalk directory at: /app/textalk"`
- `"Added /app/textalk to Python path"`
- `"✅ Steve (Whisper) initialized and cached"`

### **Manual Verification**
If you have container access:
```bash
# Check directory structure
ls -la /app/
ls -la /app/textalk/

# Test Python import
cd /app
python3 -c "
import sys
sys.path.insert(0, 'textalk')
from steve import Steve
print('✅ Import successful')
"
```

## 🔧 **Deployment Commands**

```bash
# Deploy the fixes
git add .
git commit -m "Add voice file diagnostics"
git push

# Test after deployment
curl https://your-backend-url.railway.app/api/voice/files/
curl https://your-backend-url.railway.app/api/voice/test/
```

## 🎊 **Success Indicators**

Your voice components are working when:
- ✅ Files exist in production (`steve_file_exists: true`)
- ✅ Imports work (`imports.steve: "success"`)
- ✅ Frontend shows "Backend components loaded successfully"
- ✅ Voice recording and transcription works

The diagnostic endpoints will help identify exactly where the issue is! 🚀
