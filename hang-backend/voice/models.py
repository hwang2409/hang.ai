from django.db import models
from django.contrib.auth import get_user_model
from django.utils import timezone

User = get_user_model()

class VoiceTranscription(models.Model):
    """
    Model to store voice transcription history
    """
    user = models.ForeignKey(
        User, 
        on_delete=models.CASCADE, 
        related_name='voice_transcriptions'
    )
    
    # Audio metadata
    audio_file_name = models.CharField(max_length=255, blank=True)
    audio_file_size = models.PositiveIntegerField(null=True, blank=True)  # in bytes
    audio_duration = models.FloatField(null=True, blank=True)  # in seconds
    audio_format = models.CharField(max_length=50, blank=True)  # webm, mp4, wav, etc.
    
    # Transcription results
    speech_text = models.TextField()
    latex_output = models.TextField(blank=True)
    
    # Processing metadata
    processing_time = models.FloatField(null=True, blank=True)  # in seconds
    success = models.BooleanField(default=True)
    error_message = models.TextField(blank=True)
    
    # Status tracking
    STATUS_CHOICES = [
        ('transcribing', 'Transcribing'),
        ('translating', 'Translating'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='completed')
    
    # Timestamps
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    
    # User preferences
    is_favorite = models.BooleanField(default=False)
    tags = models.CharField(max_length=500, blank=True)  # comma-separated tags
    notes = models.TextField(blank=True)  # user notes about this transcription
    
    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', '-created_at']),
            models.Index(fields=['user', 'status']),
            models.Index(fields=['user', 'is_favorite']),
        ]
    
    def __str__(self):
        return f"{self.user.username} - {self.speech_text[:50]}{'...' if len(self.speech_text) > 50 else ''}"
    
    @property
    def formatted_created_at(self):
        """Return formatted creation time"""
        return self.created_at.strftime("%Y-%m-%d %H:%M:%S")
    
    def save(self, *args, **kwargs):
        """Override save to update timestamps"""
        if not self.pk:
            self.created_at = timezone.now()
        self.updated_at = timezone.now()
        super().save(*args, **kwargs)
