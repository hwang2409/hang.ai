from rest_framework import serializers
from .models import VoiceTranscription

class VoiceTranscriptionSerializer(serializers.ModelSerializer):
    """
    Serializer for VoiceTranscription model
    """
    formatted_created_at = serializers.ReadOnlyField()
    
    class Meta:
        model = VoiceTranscription
        fields = [
            'id',
            'audio_file_name',
            'audio_file_size', 
            'audio_duration',
            'audio_format',
            'speech_text',
            'latex_output',
            'processing_time',
            'success',
            'error_message',
            'status',
            'is_favorite',
            'tags',
            'notes',
            'created_at',
            'updated_at',
            'formatted_created_at',
        ]
        read_only_fields = [
            'id',
            'created_at', 
            'updated_at',
            'formatted_created_at',
        ]

class VoiceTranscriptionCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating new transcriptions
    """
    class Meta:
        model = VoiceTranscription
        fields = [
            'audio_file_name',
            'audio_file_size',
            'audio_duration', 
            'audio_format',
            'speech_text',
            'latex_output',
            'processing_time',
            'success',
            'error_message',
            'status',
        ]
