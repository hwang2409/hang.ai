# Voice Debug - Simple File Check

## 🚀 **Deploy the Fix**

```bash
git add .
git commit -m "Add file check to existing voice test endpoint"
git push
```

## 🔍 **Test After Deployment**

Use the existing working endpoint:

```bash
curl https://your-backend-url.railway.app/api/voice/test/
```

## 🎯 **Look for New Information**

The response should now include a `file_check` section:

```json
{
  "debug_info": { ... },
  "imports": { ... },
  "file_check": {
    "steve_exists": true/false,
    "steve_size": 1234,
    "interpreter_exists": true/false,
    "interpreter_size": 5678,
    "steve_path": "/app/textalk/steve.py",
    "interpreter_path": "/app/textalk/interpreter.py",
    "app_contents": ["backend", "textalk", "manage.py", ...],
    "textalk_contents": ["steve.py", "interpreter.py", ...]
  }
}
```

## 🔧 **What This Tells Us**

### **If Files Don't Exist:**
- `steve_exists: false`
- `steve_size: 0`
- **Fix**: Files not deployed - check Dockerfile

### **If Files Exist But Empty:**
- `steve_exists: true`
- `steve_size: 0`
- **Fix**: Files corrupted during deployment

### **If Files Exist and Have Size:**
- `steve_exists: true`
- `steve_size > 0`
- **Issue**: Import dependencies or Python path

## 🎊 **Success Indicators**

Your voice components should work when:
- ✅ `steve_exists: true`
- ✅ `steve_size > 0`
- ✅ `interpreter_exists: true`
- ✅ `interpreter_size > 0`
- ✅ `textalk_contents` includes `"steve.py"` and `"interpreter.py"`

## 🚨 **Common Issues**

1. **Files not deployed**: `steve_exists: false`
2. **Empty files**: `steve_size: 0`
3. **Wrong location**: Files in different directory
4. **Import errors**: Files exist but Python can't import them

This simple check will tell us exactly what's wrong! 🔍
