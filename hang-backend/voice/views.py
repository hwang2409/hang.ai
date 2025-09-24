import os
import tempfile
import logging
import time
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.decorators import action
import uuid
import sys

# Import our models and serializers
from .models import VoiceTranscription
from .serializers import VoiceTranscriptionSerializer, VoiceTranscriptionCreateSerializer

# Setup logging
logger = logging.getLogger(__name__)

# Global cache for voice components to avoid reloading them every time
_voice_components_cache = {
    'steve': None,
    'fst': None,
    'initialized': False,
    'error': None
}

def get_voice_components():
    """
    Get cached voice components, initialize them if not already done
    """
    global _voice_components_cache
    
    if _voice_components_cache['initialized'] and _voice_components_cache['error'] is None:
        return _voice_components_cache['steve'], _voice_components_cache['fst']
    
    try:
        # Multiple strategies to find textalk directory
        possible_paths = [
            # Strategy 1: Relative to voice app
            os.path.join(os.path.dirname(os.path.dirname(__file__)), 'textalk'),
            # Strategy 2: From Django project root
            os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'textalk'),
            # Strategy 3: From current working directory
            os.path.join(os.getcwd(), 'textalk'),
            # Strategy 4: Absolute path from app directory
            '/app/textalk',
            # Strategy 5: From manage.py location
            os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'textalk')
        ]
        
        textalk_path = None
        for path in possible_paths:
            if os.path.exists(path) and os.path.isdir(path):
                textalk_path = path
                logger.info(f"Found textalk directory at: {textalk_path}")
                break
        
        if not textalk_path:
            error_msg = f'Voice processing directory not found. Tried: {possible_paths}'
            logger.error(error_msg)
            _voice_components_cache['error'] = error_msg
            _voice_components_cache['initialized'] = True
            return None, None
        
        # Add to Python path if not already there
        if textalk_path not in sys.path:
            sys.path.insert(0, textalk_path)  # Insert at beginning for priority
            logger.info(f"Added {textalk_path} to Python path")
        
        # Import and initialize components (only once)
        if _voice_components_cache['steve'] is None:
            logger.info("Initializing Steve (Whisper) - this may take a moment...")
            try:
                # Try multiple import strategies
                steve_class = None
                for import_strategy in [
                    lambda: __import__('steve', fromlist=['Steve']).Steve,
                    lambda: __import__('textalk.steve', fromlist=['Steve']).Steve,
                ]:
                    try:
                        steve_class = import_strategy()
                        break
                    except ImportError:
                        continue
                
                if steve_class is None:
                    raise ImportError("Could not import Steve from any location")
                
                _voice_components_cache['steve'] = steve_class()
                logger.info("✅ Steve (Whisper) initialized and cached")
            except Exception as e:
                logger.error(f"Failed to import Steve: {e}")
                raise e
        
        if _voice_components_cache['fst'] is None:
            logger.info("Initializing MathFST...")
            try:
                # Try multiple import strategies
                fst_class = None
                for import_strategy in [
                    lambda: __import__('interpreter', fromlist=['MathFST']).MathFST,
                    lambda: __import__('textalk.interpreter', fromlist=['MathFST']).MathFST,
                ]:
                    try:
                        fst_class = import_strategy()
                        break
                    except ImportError:
                        continue
                
                if fst_class is None:
                    raise ImportError("Could not import MathFST from any location")
                
                _voice_components_cache['fst'] = fst_class()
                logger.info("✅ MathFST initialized and cached")
            except Exception as e:
                logger.error(f"Failed to import MathFST: {e}")
                raise e
        
        _voice_components_cache['initialized'] = True
        _voice_components_cache['error'] = None
        
        return _voice_components_cache['steve'], _voice_components_cache['fst']
        
    except Exception as e:
        error_msg = f"Failed to initialize voice components: {str(e)}"
        logger.error(error_msg)
        _voice_components_cache['error'] = error_msg
        _voice_components_cache['initialized'] = True
        return None, None

class VoiceTranscribeView(APIView):
    """
    API endpoint for voice transcription and LaTeX conversion
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    
    def _clean_speech_text(self, text):
        """
        Clean speech text for better FST parsing by removing trailing punctuation
        """
        if not text:
            return text
        
        # Strip whitespace
        cleaned_text = text.strip()
        
        # Remove trailing punctuation that interferes with math parsing
        # Common punctuation added by speech recognition: . , ! ? ; :
        trailing_punctuation = ['.', ',', '!', '?', ';', ':']
        
        while cleaned_text and cleaned_text[-1] in trailing_punctuation:
            cleaned_text = cleaned_text[:-1].strip()
        
        logger.info(f"Text cleaning: '{text}' -> '{cleaned_text}'")
        return cleaned_text
    
    def post(self, request):
        """
        Process uploaded audio file and return transcription + LaTeX
        """
        start_time = time.time()
        
        try:
            # Check if audio file is provided
            if 'audio' not in request.FILES:
                return Response({
                    'error': 'No audio file provided'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            audio_file = request.FILES['audio']
            
            # Validate file size (max 10MB)
            if audio_file.size > 10 * 1024 * 1024:
                return Response({
                    'error': 'Audio file too large. Maximum size is 10MB.'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Extract audio metadata
            file_extension = audio_file.name.split('.')[-1] if '.' in audio_file.name else 'webm'
            temp_filename = f"voice_input_{uuid.uuid4()}.{file_extension}"
            
            # Create temp directory if it doesn't exist
            temp_dir = os.path.join(default_storage.location, 'temp')
            os.makedirs(temp_dir, exist_ok=True)
            
            temp_path = default_storage.save(f"temp/{temp_filename}", ContentFile(audio_file.read()))
            full_temp_path = default_storage.path(temp_path)
            
            logger.info(f"Saved audio file to: {full_temp_path}")
            
            try:
                # Process audio with voice translator
                processing_result = self._process_audio_file(full_temp_path)
                processing_time = time.time() - start_time
                
                # Save transcription to database
                transcription = VoiceTranscription.objects.create(
                    user=request.user,
                    audio_file_name=audio_file.name,
                    audio_file_size=audio_file.size,
                    audio_format=file_extension,
                    speech_text=processing_result.get('speech_text', ''),
                    latex_output=processing_result.get('latex', ''),
                    processing_time=processing_time,
                    success=processing_result.get('success', False),
                    error_message=processing_result.get('message', '') if not processing_result.get('success') else '',
                    status='completed' if processing_result.get('success') else 'failed'
                )
                
                # Prepare response with database ID
                result = processing_result.copy()
                result['id'] = transcription.id
                result['created_at'] = transcription.formatted_created_at
                
                # Clean up temporary file
                if default_storage.exists(temp_path):
                    default_storage.delete(temp_path)
                
                logger.info(f"Transcription saved with ID: {transcription.id}")
                return Response(result, status=status.HTTP_200_OK)
                
            except Exception as e:
                # Clean up temporary file on error
                if default_storage.exists(temp_path):
                    default_storage.delete(temp_path)
                
                # Save failed transcription to database
                processing_time = time.time() - start_time
                VoiceTranscription.objects.create(
                    user=request.user,
                    audio_file_name=audio_file.name,
                    audio_file_size=audio_file.size,
                    audio_format=file_extension,
                    speech_text='',
                    latex_output='',
                    processing_time=processing_time,
                    success=False,
                    error_message=str(e),
                    status='failed'
                )
                
                raise e
                
        except Exception as e:
            logger.error(f"Voice transcription error: {str(e)}")
            return Response({
                'error': 'Failed to process audio file',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def _process_audio_file(self, audio_path):
        """
        Process audio file using cached voice components (much faster!)
        """
        try:
            logger.info(f"Processing audio file: {audio_path}")
            
            # Check if audio file exists and has content
            if not os.path.exists(audio_path):
                logger.error(f"Audio file not found: {audio_path}")
                return {
                    'speech_text': 'File error',
                    'latex': '',
                    'success': False,
                    'message': 'Audio file not found'
                }
            
            file_size = os.path.getsize(audio_path)
            logger.info(f"Audio file size: {file_size} bytes")
            
            if file_size == 0:
                return {
                    'speech_text': 'Empty file',
                    'latex': '',
                    'success': False,
                    'message': 'Audio file is empty'
                }
            
            # Get cached components (fast after first load)
            speech_recognizer, fst_translator = get_voice_components()
            
            if speech_recognizer is None or fst_translator is None:
                error_msg = _voice_components_cache.get('error', 'Voice components not available')
                logger.error(f"Voice components not available: {error_msg}")
                return {
                    'speech_text': 'Component error',
                    'latex': '',
                    'success': False,
                    'message': error_msg
                }
            
            # Convert speech to text (using cached Whisper model)
            logger.info("Starting speech-to-text conversion")
            try:
                raw_speech_text = speech_recognizer.transcribe(audio_path)
                logger.info(f"Raw speech recognition result: {raw_speech_text}")
                
                # Clean the speech text for better FST parsing
                speech_text = self._clean_speech_text(raw_speech_text)
                logger.info(f"Cleaned speech text: {speech_text}")
                
            except Exception as e:
                logger.error(f"Speech recognition failed: {str(e)}")
                return {
                    'speech_text': 'Recognition error',
                    'latex': '',
                    'success': False,
                    'message': f'Speech recognition failed: {str(e)}'
                }
            
            if not speech_text or not speech_text.strip():
                return {
                    'speech_text': 'No speech detected',
                    'latex': '',
                    'success': False,
                    'message': 'No speech was detected in the audio'
                }
            
            # Convert text to LaTeX (using cached FST)
            logger.info("Starting text-to-LaTeX conversion")
            try:
                latex_result = fst_translator.compile(speech_text)
                logger.info(f"LaTeX conversion result: {latex_result}")
            except Exception as e:
                logger.error(f"LaTeX conversion failed: {str(e)}")
                # Still return the speech text even if LaTeX conversion fails
                return {
                    'speech_text': speech_text,
                    'latex': '',
                    'success': True,
                    'message': f'Speech recognized but LaTeX conversion failed: {str(e)}'
                }
            
            return {
                'speech_text': speech_text,
                'latex': latex_result.strip() if latex_result else '',
                'success': True,
                'message': 'Transcription completed successfully'
            }
            
        except Exception as e:
            logger.error(f"Audio processing error: {str(e)}")
            return {
                'speech_text': 'Processing error',
                'latex': '',
                'success': False,
                'message': f'Failed to process audio: {str(e)}'
            }


class VoiceTextTranslateView(APIView):
    """
    API endpoint for direct text to LaTeX conversion (without audio)
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        """
        Convert text directly to LaTeX
        """
        try:
            text = request.data.get('text', '')
            
            if not text or not text.strip():
                return Response({
                    'error': 'No text provided'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Process text with FST translator
            result = self._process_text(text.strip())
            
            return Response(result, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"Text translation error: {str(e)}")
            return Response({
                'error': 'Failed to process text',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def _process_text(self, text):
        """
        Process text using cached FST translator (much faster!)
        """
        try:
            # Get cached components (fast after first load)
            _, fst_translator = get_voice_components()
            
            if fst_translator is None:
                error_msg = _voice_components_cache.get('error', 'FST translator not available')
                logger.error(f"FST translator not available: {error_msg}")
                return {
                    'speech_text': text,
                    'latex': '',
                    'success': False,
                    'message': error_msg
                }
            
            # Clean the text for better FST parsing
            cleaned_text = self._clean_speech_text(text)
            logger.info(f"Processing text: '{text}' -> '{cleaned_text}'")
            
            # Convert text to LaTeX using cached FST
            latex_result = fst_translator.compile(cleaned_text)
            
            return {
                'speech_text': cleaned_text,
                'latex': latex_result.strip() if latex_result else '',
                'success': True,
                'message': 'Translation completed successfully'
            }
            
        except Exception as e:
            logger.error(f"Text processing error: {str(e)}")
            return {
                'speech_text': text,
                'latex': '',
                'success': False,
                'message': f'Failed to process text: {str(e)}'
            }


class VoiceTestView(APIView):
    """
    API endpoint to test voice components availability
    """
    permission_classes = []  # Remove authentication requirement for debugging
    
    def get(self, request):
        """
        Test voice components and return status (uses cached components)
        """
        try:
            # Add debug information
            backend_dir = os.path.dirname(os.path.dirname(__file__))
            textalk_path = os.path.join(backend_dir, 'textalk')
            
            # Check if steve.py exists specifically
            steve_file_path = os.path.join(textalk_path, 'steve.py') if textalk_path else None
            interpreter_file_path = os.path.join(textalk_path, 'interpreter.py') if textalk_path else None
            
            # Check if files actually exist and get their sizes
            steve_exists = os.path.exists(steve_file_path) if steve_file_path else False
            interpreter_exists = os.path.exists(interpreter_file_path) if interpreter_file_path else False
            steve_size = os.path.getsize(steve_file_path) if steve_exists else 0
            interpreter_size = os.path.getsize(interpreter_file_path) if interpreter_exists else 0
            
            result = {
                'debug_info': {
                    'backend_dir': backend_dir,
                    'textalk_path': textalk_path,
                    'textalk_exists': os.path.exists(textalk_path) if textalk_path else False,
                    'steve_file_exists': steve_exists,
                    'interpreter_file_exists': interpreter_exists,
                    'steve_file_path': steve_file_path,
                    'interpreter_file_path': interpreter_file_path,
                    'steve_file_size': steve_size,
                    'interpreter_file_size': interpreter_size,
                    'current_dir': os.getcwd(),
                    'python_path': sys.path[:5],  # First 5 paths
                    'all_paths_tried': [
                        os.path.join(os.path.dirname(os.path.dirname(__file__)), 'textalk'),
                        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'textalk'),
                        os.path.join(os.getcwd(), 'textalk'),
                        '/app/textalk',
                        os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'textalk')
                    ]
                },
                'imports': {},
                'test_results': {},
                'cached': _voice_components_cache['initialized'],
                'cache_error': _voice_components_cache.get('error')
            }
            
            # Test direct imports to see what's failing
            try:
                # Try to import steve directly
                import steve
                result['direct_imports'] = {
                    'steve_module': 'success',
                    'steve_class_exists': hasattr(steve, 'Steve')
                }
            except Exception as e:
                result['direct_imports'] = {
                    'steve_module': f'failed: {str(e)}',
                    'steve_class_exists': False
                }
            
            try:
                # Try to import interpreter directly
                import interpreter
                result['direct_imports']['interpreter_module'] = 'success'
                result['direct_imports']['interpreter_class_exists'] = hasattr(interpreter, 'MathFST')
            except Exception as e:
                result['direct_imports']['interpreter_module'] = f'failed: {str(e)}'
                result['direct_imports']['interpreter_class_exists'] = False
            
            # Test cached components
            steve, fst = get_voice_components()
            
            # Test Steve (Whisper)
            if steve is not None:
                result['imports']['steve'] = 'success'
                try:
                    result['test_results']['steve'] = {
                        'status': 'cached and ready',
                        'model_id': steve.model_id,
                        'device': str(steve.device)
                    }
                except Exception as e:
                    result['test_results']['steve'] = {
                        'status': 'cached but error',
                        'error': str(e)
                    }
            else:
                result['imports']['steve'] = 'failed: not cached'
            
            # Test FST
            if fst is not None:
                result['imports']['interpreter'] = 'success'
                try:
                    test_result = fst.compile("integral of x squared dx")
                    result['test_results']['fst'] = {
                        'input': 'integral of x squared dx',
                        'output': test_result,
                        'status': 'cached and working'
                    }
                except Exception as e:
                    result['test_results']['fst'] = {
                        'status': 'cached but error',
                        'error': str(e)
                    }
            else:
                result['imports']['interpreter'] = 'failed: not cached'
            
            return Response(result, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"Voice test error: {str(e)}")
            return Response({
                'error': 'Voice test failed',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class VoiceFileCheckView(APIView):
    """
    Simple endpoint to check if voice files exist in production
    """
    permission_classes = []  # No auth required
    
    def get(self, request):
        """
        Check if voice component files exist
        """
        try:
            # Check multiple possible locations
            possible_locations = [
                '/app/textalk/steve.py',
                '/app/textalk/interpreter.py',
                os.path.join(os.getcwd(), 'textalk', 'steve.py'),
                os.path.join(os.getcwd(), 'textalk', 'interpreter.py'),
                os.path.join(os.path.dirname(os.path.dirname(__file__)), 'textalk', 'steve.py'),
                os.path.join(os.path.dirname(os.path.dirname(__file__)), 'textalk', 'interpreter.py'),
            ]
            
            results = {}
            for location in possible_locations:
                results[location] = {
                    'exists': os.path.exists(location),
                    'is_file': os.path.isfile(location) if os.path.exists(location) else False,
                    'size': os.path.getsize(location) if os.path.exists(location) else 0
                }
            
            return Response({
                'file_check': results,
                'current_dir': os.getcwd(),
                'app_dir_contents': os.listdir('/app') if os.path.exists('/app') else 'Not found',
                'textalk_dir_contents': os.listdir('/app/textalk') if os.path.exists('/app/textalk') else 'Not found'
            })
            
        except Exception as e:
            return Response({
                'error': 'File check failed',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class VoiceTranscriptionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing voice transcription history
    """
    serializer_class = VoiceTranscriptionSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Return transcriptions for the current user only"""
        return VoiceTranscription.objects.filter(user=self.request.user)
    
    def get_serializer_class(self):
        """Use different serializers for different actions"""
        if self.action == 'create':
            return VoiceTranscriptionCreateSerializer
        return VoiceTranscriptionSerializer
    
    @action(detail=False, methods=['get'])
    def recent(self, request):
        """Get recent transcriptions (last 20)"""
        transcriptions = self.get_queryset()[:20]
        serializer = self.get_serializer(transcriptions, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def favorites(self, request):
        """Get favorite transcriptions"""
        transcriptions = self.get_queryset().filter(is_favorite=True)
        serializer = self.get_serializer(transcriptions, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def toggle_favorite(self, request, pk=None):
        """Toggle favorite status of a transcription"""
        transcription = self.get_object()
        transcription.is_favorite = not transcription.is_favorite
        transcription.save()
        
        serializer = self.get_serializer(transcription)
        return Response(serializer.data)
    
    @action(detail=True, methods=['patch'])
    def add_notes(self, request, pk=None):
        """Add or update notes for a transcription"""
        transcription = self.get_object()
        notes = request.data.get('notes', '')
        tags = request.data.get('tags', '')
        
        transcription.notes = notes
        if tags:
            transcription.tags = tags
        transcription.save()
        
        serializer = self.get_serializer(transcription)
        return Response(serializer.data)
    
    @action(detail=True, methods=['patch'])
    def update_latex(self, request, pk=None):
        """Update the LaTeX output of a transcription"""
        try:
            transcription = self.get_object()
            new_latex = request.data.get('latex_output', '').strip()
            
            # Log the change for audit purposes
            old_latex = transcription.latex_output
            logger.info(f"User {request.user.username} updating LaTeX for transcription {transcription.id}: '{old_latex}' -> '{new_latex}'")
            
            # Update the LaTeX output
            transcription.latex_output = new_latex
            transcription.save()
            
            serializer = self.get_serializer(transcription)
            return Response(serializer.data)
            
        except Exception as e:
            logger.error(f"Failed to update LaTeX for transcription {pk}: {str(e)}")
            return Response({
                'error': 'Failed to update LaTeX',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    def destroy(self, request, pk=None):
        """Delete a single transcription permanently"""
        try:
            transcription = self.get_object()
            speech_preview = transcription.speech_text[:50] + "..." if len(transcription.speech_text) > 50 else transcription.speech_text
            
            # Log the deletion for audit purposes
            logger.info(f"User {request.user.username} deleting transcription {transcription.id}: '{speech_preview}'")
            
            # Delete the transcription
            transcription.delete()
            
            return Response({
                'message': 'Transcription deleted successfully',
                'deleted_id': int(pk)
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            logger.error(f"Failed to delete transcription {pk}: {str(e)}")
            return Response({
                'error': 'Failed to delete transcription',
                'details': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['delete'])
    def clear_history(self, request):
        """Clear all transcription history for the user"""
        deleted_count = self.get_queryset().delete()[0]
        logger.info(f"User {request.user.username} cleared all transcription history ({deleted_count} items)")
        return Response({
            'message': f'Deleted {deleted_count} transcriptions',
            'deleted_count': deleted_count
        })
    
    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Get transcription statistics for the user"""
        queryset = self.get_queryset()
        
        stats = {
            'total_transcriptions': queryset.count(),
            'successful_transcriptions': queryset.filter(success=True).count(),
            'failed_transcriptions': queryset.filter(success=False).count(),
            'favorite_transcriptions': queryset.filter(is_favorite=True).count(),
            'total_processing_time': sum(
                t.processing_time for t in queryset if t.processing_time
            ),
            'average_processing_time': None
        }
        
        if stats['successful_transcriptions'] > 0:
            successful_times = [
                t.processing_time for t in queryset.filter(success=True) 
                if t.processing_time
            ]
            if successful_times:
                stats['average_processing_time'] = sum(successful_times) / len(successful_times)
        
        return Response(stats)
