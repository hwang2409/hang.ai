import logging
import os

from app.config import settings

logger = logging.getLogger(__name__)

WHISPER_MAX_BYTES = 25 * 1024 * 1024  # 25MB Whisper limit


async def transcribe_audio(file_path: str, openai_api_key: str | None = None) -> str | None:
    """Transcribe an audio file using OpenAI Whisper API. Returns None if unavailable."""
    api_key = openai_api_key or settings.OPENAI_API_KEY
    if not api_key:
        logger.info("No OpenAI API key available, skipping transcription")
        return None

    file_size = os.path.getsize(file_path)
    if file_size > WHISPER_MAX_BYTES:
        logger.warning(f"Audio file too large for Whisper ({file_size} bytes > 25MB), skipping")
        return None

    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=api_key)
        with open(file_path, "rb") as f:
            transcript = await client.audio.transcriptions.create(
                model="whisper-1",
                file=f,
            )
        return transcript.text
    except Exception as e:
        logger.error(f"Transcription failed: {e}")
        return None


async def transcribe_audio_background(file_id: int, file_path: str, openai_api_key: str | None = None):
    """Background task to transcribe audio and save to DB."""
    transcript = await transcribe_audio(file_path, openai_api_key=openai_api_key)
    if not transcript:
        return

    from sqlalchemy import select
    from app.database import async_session
    from app.files.models import UploadedFile

    async with async_session() as db:
        f = (await db.execute(
            select(UploadedFile).where(UploadedFile.id == file_id)
        )).scalar_one_or_none()
        if f:
            f.extracted_text = transcript
            await db.commit()
