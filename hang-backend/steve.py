import torch
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor, WhisperTokenizer, WhisperFeatureExtractor, pipeline
import librosa
import soundfile
from datasets import load_dataset

class Steve:
    def __init__(self):
        self.device = "cuda:0" if torch.cuda.is_available() else "cpu"
        self.torch_dtype = torch.float16 if torch.cuda.is_available() else torch.float32
        self.model_id = "openai/whisper-base"
        self.model = AutoModelForSpeechSeq2Seq.from_pretrained(
            self.model_id, torch_dtype=self.torch_dtype, low_cpu_mem_usage=True
        )
        self.model.to(self.device)

        self.processor = AutoProcessor.from_pretrained(self.model_id)
        self.tokenizer = self.processor.tokenizer
        self.feature_extractor = self.processor.feature_extractor

        self.pipe = pipeline(
            "automatic-speech-recognition",
            model=self.model,
            tokenizer=self.tokenizer,
            feature_extractor=self.feature_extractor,
            torch_dtype=self.torch_dtype,
            device=self.device,
        )

        print("Steve initialized successfully!")

    def transcribe(self, audio_path):
        audio, sr = librosa.load(audio_path, sr=16000)
        result = self.pipe_audio(audio)
        return result

    def pipe_audio(self, audio):
        result = self.pipe(audio)
        return result["text"]

    # save audio
    def save_audio(self, audio, path, sr=16000):
        soundfile.write(path, audio, sr)

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