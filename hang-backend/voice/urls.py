from django.urls import path, include
from rest_framework.routers import DefaultRouter
from voice.views import VoiceTranscribeView, VoiceTextTranslateView, VoiceTestView, VoiceTranscriptionViewSet, VoiceFileCheckView

# Create router for ViewSet
router = DefaultRouter()
router.register(r'history', VoiceTranscriptionViewSet, basename='transcription')

urlpatterns = [
    path('transcribe/', VoiceTranscribeView.as_view(), name='voice-transcribe'),
    path('translate/', VoiceTextTranslateView.as_view(), name='voice-translate'),
    path('test/', VoiceTestView.as_view(), name='voice-test'),
    path('files/', VoiceFileCheckView.as_view(), name='voice-files'),
    # Include ViewSet URLs
    path('', include(router.urls)),
]
