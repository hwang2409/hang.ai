#!/bin/bash

echo "🎙️ Installing Voice Transcription Dependencies"
echo "=============================================="

# Navigate to the textalk directory where voice components are located
cd textalk

echo "📦 Installing Python dependencies..."
pip install -r requirements_voice.txt

echo "🧪 Testing voice components..."
python -c "
try:
    from steve import Steve
    from interpreter import MathFST
    print('✅ Steve (Whisper) component loaded successfully')
    print('✅ MathFST (interpreter) component loaded successfully')
    
    # Quick test
    fst = MathFST()
    result = fst.compile('integral of x squared dx')
    print(f'✅ FST test: \"integral of x squared dx\" -> \"{result}\"')
    
    print('🎉 All voice components are working correctly!')
    
except ImportError as e:
    print(f'❌ Import error: {e}')
    print('Please check that all dependencies are installed correctly.')
except Exception as e:
    print(f'❌ Error: {e}')
"

echo ""
echo "🚀 Voice transcription setup complete!"
echo "You can now use the voice features in your application."
