from django.apps import AppConfig
import logging

logger = logging.getLogger(__name__)

class VoiceConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'voice'
    
    def ready(self):
        """
        Preload voice components when Django starts for faster transcription
        """
        # Only preload in production or when explicitly requested
        import os
        if os.environ.get('PRELOAD_VOICE_COMPONENTS', '').lower() in ('true', '1', 'yes'):
            try:
                logger.info("🚀 Preloading voice components...")
                from voice.views import get_voice_components
                steve, fst = get_voice_components()
                if steve and fst:
                    logger.info("✅ Voice components preloaded successfully!")
                else:
                    logger.warning("⚠️ Voice components failed to preload")
            except Exception as e:
                logger.error(f"❌ Failed to preload voice components: {e}")
        else:
            logger.info("💡 Voice components will load on first use (set PRELOAD_VOICE_COMPONENTS=true to preload)")