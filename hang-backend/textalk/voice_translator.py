#!/usr/bin/env python3
"""
Voice to LaTeX Translation System
================================

This module provides real-time microphone input for mathematical speech-to-LaTeX translation.
It integrates speech recognition, natural language processing, and LaTeX generation.

Features:
- Real-time microphone recording
- Speech-to-text using Whisper
- Mathematical expression recognition
- LaTeX output generation
- Multiple translation backends (FST + Neural)

Usage:
    from voice_translator import VoiceTranslator
    
    translator = VoiceTranslator()
    translator.start_listening()
"""

import pyaudio
import wave
import threading
import time
import os
import tempfile
from datetime import datetime
from typing import Optional, Callable, Dict, Any
import numpy as np

# Import our existing components
from steve import Steve
from interpreter import MathFST


class AudioRecorder:
    """Real-time audio recording from microphone"""
    
    def __init__(self, sample_rate=16000, chunk_size=1024, channels=1):
        self.sample_rate = sample_rate
        self.chunk_size = chunk_size
        self.channels = channels
        self.audio_format = pyaudio.paInt16
        
        self.pyaudio = pyaudio.PyAudio()
        self.recording = False
        self.frames = []
        self.stream = None
        
    def start_recording(self):
        """Start recording audio from microphone"""
        if self.recording:
            return
            
        self.frames = []
        self.recording = True
        
        self.stream = self.pyaudio.open(
            format=self.audio_format,
            channels=self.channels,
            rate=self.sample_rate,
            input=True,
            frames_per_buffer=self.chunk_size,
            stream_callback=self._audio_callback
        )
        
        self.stream.start_stream()
        print("🎤 Recording started...")
        
    def stop_recording(self):
        """Stop recording and return audio data"""
        if not self.recording:
            return None
            
        self.recording = False
        
        if self.stream:
            self.stream.stop_stream()
            self.stream.close()
            
        print("🛑 Recording stopped.")
        
        if not self.frames:
            return None
            
        # Convert frames to numpy array
        audio_data = b''.join(self.frames)
        audio_array = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0
        
        return audio_array
        
    def _audio_callback(self, in_data, frame_count, time_info, status):
        """Callback for audio stream"""
        if self.recording:
            self.frames.append(in_data)
        return (in_data, pyaudio.paContinue)
        
    def save_audio(self, audio_data: np.ndarray, filename: str):
        """Save audio data to WAV file"""
        # Convert back to int16
        audio_int16 = (audio_data * 32768).astype(np.int16)
        
        with wave.open(filename, 'wb') as wf:
            wf.setnchannels(self.channels)
            wf.setsampwidth(self.pyaudio.get_sample_size(self.audio_format))
            wf.setframerate(self.sample_rate)
            wf.writeframes(audio_int16.tobytes())
            
    def cleanup(self):
        """Clean up audio resources"""
        if self.stream:
            self.stream.close()
        self.pyaudio.terminate()


class VoiceTranslator:
    """Main voice-to-LaTeX translation system"""
    
    def __init__(self, 
                 sample_rate=16000,
                 temp_dir=None):
        """
        Initialize the voice translator
        
        Args:
            sample_rate (int): Audio sample rate
            temp_dir (str): Directory for temporary files
        """
        self.sample_rate = sample_rate
        self.temp_dir = temp_dir or tempfile.gettempdir()
        
        # Initialize components
        print("🚀 Initializing Voice Translator...")
        
        # Audio recorder
        self.recorder = AudioRecorder(sample_rate=sample_rate)
        
        # Speech-to-text (Whisper)
        print("📝 Loading speech recognition model...")
        self.speech_recognizer = Steve()
        
        # Math-to-LaTeX translator (FST-based)
        print("🧮 Loading mathematical translator...")
        self.fst_translator = MathFST()
        
        # State management
        self.is_listening = False
        self.last_translation = None
        self.translation_history = []
        
        # Callbacks
        self.on_speech_detected = None
        self.on_translation_complete = None
        self.on_error = None
        
        print("✅ Voice Translator initialized successfully!")
        
    def set_callbacks(self, 
                     on_speech_detected: Optional[Callable[[str], None]] = None,
                     on_translation_complete: Optional[Callable[[str, str], None]] = None,
                     on_error: Optional[Callable[[str], None]] = None):
        """Set callback functions for events"""
        self.on_speech_detected = on_speech_detected
        self.on_translation_complete = on_translation_complete
        self.on_error = on_error
        
    def start_listening(self, duration=None):
        """
        Start listening for voice input
        
        Args:
            duration (float): Recording duration in seconds (None = manual stop)
        """
        if self.is_listening:
            print("⚠️ Already listening...")
            return
            
        self.is_listening = True
        print("🎤 Starting voice translation session...")
        
        try:
            if duration:
                # Timed recording
                self._record_for_duration(duration)
            else:
                # Manual recording (call stop_listening to end)
                self.recorder.start_recording()
                
        except Exception as e:
            error_msg = f"Failed to start listening: {e}"
            print(f"❌ {error_msg}")
            if self.on_error:
                self.on_error(error_msg)
            self.is_listening = False
            
    def stop_listening(self):
        """Stop listening and process the recorded audio"""
        if not self.is_listening:
            print("⚠️ Not currently listening...")
            return None
            
        print("🔄 Processing speech...")
        
        try:
            # Stop recording and get audio data
            audio_data = self.recorder.stop_recording()
            self.is_listening = False
            
            if audio_data is None:
                print("❌ No audio data recorded")
                return None
                
            # Process the audio
            return self._process_audio(audio_data)
            
        except Exception as e:
            error_msg = f"Failed to process audio: {e}"
            print(f"❌ {error_msg}")
            if self.on_error:
                self.on_error(error_msg)
            self.is_listening = False
            return None
            
    def _record_for_duration(self, duration: float):
        """Record for a specific duration"""
        self.recorder.start_recording()
        
        def stop_after_duration():
            time.sleep(duration)
            if self.is_listening:
                self.stop_listening()
                
        threading.Thread(target=stop_after_duration, daemon=True).start()
        
    def _process_audio(self, audio_data: np.ndarray) -> Optional[Dict[str, Any]]:
        """Process recorded audio and generate LaTeX translation"""
        try:
            # Save audio to temporary file
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            temp_audio_path = os.path.join(self.temp_dir, f"voice_input_{timestamp}.wav")
            
            self.recorder.save_audio(audio_data, temp_audio_path)
            
            # Speech-to-text
            print("🗣️ Converting speech to text...")
            text = self._speech_to_text(temp_audio_path)
            
            if not text or not text.strip():
                print("❌ No speech detected or transcription failed")
                return None
                
            print(f"📝 Detected speech: '{text}'")
            
            # Trigger speech detected callback
            if self.on_speech_detected:
                self.on_speech_detected(text)
                
            # Text-to-LaTeX translation
            print("🧮 Translating to LaTeX...")
            latex_result = self._text_to_latex(text)
            
            if not latex_result:
                print("❌ LaTeX translation failed")
                return None
                
            print(f"📐 LaTeX result: {latex_result}")
            
            # Create result object
            result = {
                'timestamp': timestamp,
                'speech_text': text,
                'latex': latex_result,
                'audio_file': temp_audio_path,
                'method': 'fst'
            }
            
            # Store in history
            self.translation_history.append(result)
            self.last_translation = result
            
            # Trigger translation complete callback
            if self.on_translation_complete:
                self.on_translation_complete(text, latex_result)
                
            # Clean up temporary file
            try:
                os.remove(temp_audio_path)
            except:
                pass
                
            return result
            
        except Exception as e:
            error_msg = f"Error processing audio: {e}"
            print(f"❌ {error_msg}")
            if self.on_error:
                self.on_error(error_msg)
            return None
            
    def _speech_to_text(self, audio_path: str) -> str:
        """Convert speech to text using Whisper"""
        try:
            result = self.speech_recognizer.transcribe(audio_path)
            return result.strip() if result else ""
        except Exception as e:
            print(f"❌ Speech recognition failed: {e}")
            return ""
            
    def _text_to_latex(self, text: str) -> str:
        """Convert mathematical text to LaTeX using FST"""
        try:
            latex = self.fst_translator.compile(text)
            return latex.strip() if latex else ""
            
        except Exception as e:
            print(f"❌ LaTeX translation failed: {e}")
            return ""
            
    def translate_text_directly(self, text: str) -> Optional[Dict[str, Any]]:
        """Translate text directly without voice input"""
        print(f"🔄 Direct translation: '{text}'")
        
        try:
            # Text-to-LaTeX translation
            latex_result = self._text_to_latex(text)
            
            if not latex_result:
                print("❌ LaTeX translation failed")
                return None
                
            print(f"📐 LaTeX result: {latex_result}")
            
            # Create result object
            result = {
                'timestamp': datetime.now().strftime("%Y%m%d_%H%M%S"),
                'speech_text': text,
                'latex': latex_result,
                'audio_file': None,
                'method': 'fst'
            }
            
            # Store in history
            self.translation_history.append(result)
            self.last_translation = result
            
            # Trigger translation complete callback
            if self.on_translation_complete:
                self.on_translation_complete(text, latex_result)
                
            return result
            
        except Exception as e:
            error_msg = f"Direct translation failed: {e}"
            print(f"❌ {error_msg}")
            if self.on_error:
                self.on_error(error_msg)
            return None
            
    def get_translation_history(self) -> list:
        """Get history of all translations"""
        return self.translation_history.copy()
        
    def clear_history(self):
        """Clear translation history"""
        self.translation_history.clear()
        self.last_translation = None
        
    def cleanup(self):
        """Clean up resources"""
        self.recorder.cleanup()
        

def interactive_demo():
    """Interactive demonstration of the voice translator"""
    print("🎙️ Voice to LaTeX Translation Demo")
    print("=" * 50)
    
    translator = VoiceTranslator()
    
    def on_speech_detected(text):
        print(f"🗣️ Heard: '{text}'")
        
    def on_translation_complete(text, latex):
        print(f"📝 Input: {text}")
        print(f"📐 LaTeX: {latex}")
        print("-" * 30)
        
    def on_error(error):
        print(f"❌ Error: {error}")
        
    translator.set_callbacks(
        on_speech_detected=on_speech_detected,
        on_translation_complete=on_translation_complete,
        on_error=on_error
    )
    
    print("\n🎤 Voice Translation Mode")
    print("Commands:")
    print("  - Press ENTER to start recording")
    print("  - Press ENTER again to stop recording")
    print("  - Type 'text:' followed by text for direct translation")
    print("  - Type 'history' to see translation history")
    print("  - Type 'quit' to exit")
    print("-" * 40)
    
    try:
        while True:
            user_input = input("\nPress ENTER to record (or type command): ").strip()
            
            if user_input.lower() in ['quit', 'exit', 'q']:
                break
                
            elif user_input.lower() == 'history':
                history = translator.get_translation_history()
                if history:
                    print("\n📚 Translation History:")
                    for i, item in enumerate(history, 1):
                        print(f"{i}. {item['speech_text']} → {item['latex']}")
                else:
                    print("📭 No translations yet")
                    
            elif user_input.startswith('text:'):
                # Direct text translation
                text = user_input[5:].strip()
                if text:
                    translator.translate_text_directly(text)
                    
            elif user_input == '':
                # Voice recording mode
                if not translator.is_listening:
                    print("🎤 Recording... (press ENTER to stop)")
                    translator.start_listening()
                    input()  # Wait for user to press ENTER
                    translator.stop_listening()
                else:
                    translator.stop_listening()
                    
            else:
                print("❓ Unknown command. Try 'quit', 'history', 'text:', or just ENTER to record.")
                
    except KeyboardInterrupt:
        print("\n👋 Interrupted by user")
        
    finally:
        translator.cleanup()
        print("🧹 Cleaned up resources")
        

def quick_test():
    """Quick test of text translation functionality"""
    print("🧪 Quick Test Mode")
    print("=" * 30)
    
    translator = VoiceTranslator()  # FST-based translation
    
    test_cases = [
        "integral of x squared dx",
        "derivative of sine x",
        "x plus y equals z",
        "square root of x",
        "limit as x approaches zero",
        "sum from i equals one to n",
        "a over b",
    ]
    
    print("Testing mathematical expressions:")
    for i, test in enumerate(test_cases, 1):
        print(f"\n{i}. Testing: '{test}'")
        result = translator.translate_text_directly(test)
        if result:
            print(f"   Result: {result['latex']}")
        else:
            print("   ❌ Failed")
            
    translator.cleanup()


def main():
    """Main function"""
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == 'test':
        quick_test()
    else:
        interactive_demo()


if __name__ == "__main__":
    main()
