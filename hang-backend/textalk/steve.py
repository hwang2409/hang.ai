import torch
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, WhisperTokenizer, WhisperFeatureExtractor, pipeline
import librosa
import soundfile
import os
import logging

class Steve:
    def __init__(self):
        """Initialize Steve with robust error handling and production optimizations"""
        try:
            # Set up logging
            logging.basicConfig(level=logging.INFO)
            self.logger = logging.getLogger(__name__)
            
            # Device selection with fallback
            self.device = "cpu"  # Force CPU in production for stability
            self.torch_dtype = torch.float32
            
            # Use whisper-base for better accuracy (tiny model is too inaccurate)
            self.model_id = "openai/whisper-base"  # Better balance of size vs accuracy
            
            self.logger.info(f"Loading Whisper model: {self.model_id}")
            self.logger.info(f"Using device: {self.device}")
            
            # Load model with error handling and production optimizations
            try:
                self.logger.info("📥 Downloading/loading Whisper model (this may take a moment on first run)...")
                self.model = AutoModelForSpeechSeq2Seq.from_pretrained(
                    self.model_id, 
                    torch_dtype=self.torch_dtype, 
                    low_cpu_mem_usage=True,
                    cache_dir="/tmp/whisper_cache",  # Use tmp for caching
                    use_safetensors=True,  # Use safer tensor format
                    trust_remote_code=False  # Security best practice
                )
                self.model.to(self.device)
                
                # Enable memory optimization for production
                if hasattr(self.model, 'eval'):
                    self.model.eval()  # Set to evaluation mode
                    
                self.logger.info("✅ Model loaded successfully")
            except Exception as e:
                self.logger.error(f"❌ Failed to load model: {e}")
                self.logger.error("This might be due to network issues or insufficient disk space")
                raise

            # Load processor with error handling
            try:
                self.processor = AutoProcessor.from_pretrained(
                    self.model_id,
                    cache_dir="/tmp/whisper_cache"
                )
                self.tokenizer = self.processor.tokenizer
                self.feature_extractor = self.processor.feature_extractor
                self.logger.info("✅ Processor loaded successfully")
            except Exception as e:
                self.logger.error(f"❌ Failed to load processor: {e}")
                raise

            # Create pipeline with error handling and memory optimizations
            try:
                self.pipe = pipeline(
                    "automatic-speech-recognition",
                    model=self.model,
                    tokenizer=self.tokenizer,
                    feature_extractor=self.feature_extractor,
                    torch_dtype=self.torch_dtype,
                    device=self.device,
                    chunk_length_s=15,  # Shorter chunks for better memory management
                    stride_length_s=3,  # Overlap between chunks
                    return_timestamps=False,
                    batch_size=1,  # Process one at a time to save memory
                    max_new_tokens=128  # Limit output length
                )
                self.logger.info("✅ Pipeline created successfully")
            except Exception as e:
                self.logger.error(f"❌ Failed to create pipeline: {e}")
                raise

            self.logger.info("🎉 Steve initialized successfully!")
            
        except Exception as e:
            self.logger.error(f"💥 Steve initialization failed: {e}")
            # Set fallback mode
            self.pipe = None
            self.model = None

    def transcribe(self, audio_path):
        """Transcribe audio file with robust error handling"""
        try:
            if self.pipe is None:
                self.logger.error("❌ Speech recognition not available (model failed to load)")
                return "Speech recognition unavailable"
            
            if not os.path.exists(audio_path):
                self.logger.error(f"❌ Audio file not found: {audio_path}")
                return "Audio file not found"
            
            self.logger.info(f"🎵 Loading audio file: {audio_path}")
            audio, sr = librosa.load(audio_path, sr=16000)
            
            if len(audio) == 0:
                self.logger.warning("⚠️ Empty audio file")
                return "Empty audio"
            
            result = self.pipe_audio(audio)
            self.logger.info(f"✅ Transcription successful: '{result}'")
            return result
            
        except Exception as e:
            self.logger.error(f"❌ Transcription failed: {e}")
            return f"Transcription error: {str(e)}"

    def pipe_audio(self, audio):
        """Process audio through the pipeline with error handling"""
        try:
            if self.pipe is None:
                raise ValueError("Pipeline not initialized")
                
            result = self.pipe(audio)
            return result.get("text", "").strip()
            
        except Exception as e:
            self.logger.error(f"❌ Pipeline processing failed: {e}")
            raise

    # save audio
    def save_audio(self, audio, path, sr=16000):
        """Save audio to file"""
        try:
            soundfile.write(path, audio, sr)
            self.logger.info(f"✅ Audio saved to: {path}")
        except Exception as e:
            self.logger.error(f"❌ Failed to save audio: {e}")
            raise
    
    def cleanup_memory(self):
        """Clean up memory after processing (useful for production)"""
        try:
            import gc
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            self.logger.info("🧹 Memory cleanup completed")
        except Exception as e:
            self.logger.warning(f"⚠️ Memory cleanup failed: {e}")
    
    def get_model_info(self):
        """Get information about the loaded model"""
        return {
            "model_id": self.model_id,
            "device": self.device,
            "torch_dtype": str(self.torch_dtype),
            "model_loaded": self.model is not None,
            "pipeline_loaded": self.pipe is not None
        }

def main():
    steve = Steve()
    #dataset = load_dataset("distil-whisper/librispeech_long", "clean", split="validation[:1]")
    #audio = dataset[0]["audio"]
    #steve.save_audio(audio["array"], "tmp/test.wav", audio["sampling_rate"])
    #result = steve.pipe_audio(audio)
    #print(result)

    print(steve.transcribe("tmp/test.wav"))
if __name__ == "__main__":
    main()