import wave
import json
import os
import sys

# Add FFmpeg to PATH before importing pydub (Windows compatibility)
if os.name == 'nt':  # Windows
    ffmpeg_bin_paths = [
        r"C:\Users\DELL\AppData\Local\Microsoft\WinGet\Links",
        r"C:\Users\DELL\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.0.1-full_build\bin",
    ]
    for bin_path in ffmpeg_bin_paths:
        if os.path.exists(bin_path) and bin_path not in os.environ.get('PATH', ''):
            os.environ['PATH'] = bin_path + os.pathsep + os.environ.get('PATH', '')
            print(f"Added to PATH: {bin_path}")

import vosk
import librosa
import numpy as np
import io
from pydub import AudioSegment
from pydub.utils import which

# Configure FFmpeg path for pydub (Windows compatibility)
if os.name == 'nt':  # Windows
    # Try to find ffmpeg in common locations
    ffmpeg_paths = [
        r"C:\Users\DELL\AppData\Local\Microsoft\WinGet\Links\ffmpeg.exe",
        which("ffmpeg"),  # Check PATH
    ]
    ffprobe_paths = [
        r"C:\Users\DELL\AppData\Local\Microsoft\WinGet\Links\ffprobe.exe",
        which("ffprobe"),  # Check PATH
    ]
    
    ffmpeg_path = None
    ffprobe_path = None
    
    for path in ffmpeg_paths:
        if path and os.path.exists(path):
            ffmpeg_path = path
            break
    
    for path in ffprobe_paths:
        if path and os.path.exists(path):
            ffprobe_path = path
            break
    
    if ffmpeg_path:
        AudioSegment.converter = ffmpeg_path
        AudioSegment.ffmpeg = ffmpeg_path
        print(f"FFmpeg configured at: {ffmpeg_path}")
    
    if ffprobe_path:
        AudioSegment.ffprobe = ffprobe_path
        print(f"FFprobe configured at: {ffprobe_path}")



# Initialize Vosk Model
# In a real deployment, ensure the model is downloaded to 'model' directory.
MODEL_PATH = "model" 
if not os.path.exists(MODEL_PATH):
    print(f"WARNING: Vosk model not found at '{MODEL_PATH}'. Audio transcription will fail.")
    model = None
else:
    vosk.SetLogLevel(-1)
    model = vosk.Model(MODEL_PATH)

def convert_to_wav(audio_source):
    """
    Converts audio from various formats (WebM, MP3, etc.) to WAV format in memory.
    Returns a BytesIO object containing WAV data.
    """
    try:
        # If it's a file path
        if isinstance(audio_source, str):
            audio = AudioSegment.from_file(audio_source)
        else:
            # If it's a file-like object, read it
            audio_source.seek(0)
            audio_bytes = audio_source.read()
            audio = AudioSegment.from_file(io.BytesIO(audio_bytes))
        
        # Convert to WAV format: mono, 16-bit, 16kHz (good for speech recognition)
        audio = audio.set_channels(1)
        audio = audio.set_frame_rate(16000)
        audio = audio.set_sample_width(2)  # 16-bit
        
        # Export to BytesIO as WAV
        wav_io = io.BytesIO()
        audio.export(wav_io, format='wav')
        wav_io.seek(0)
        return wav_io
    except Exception as e:
        print(f"Error converting audio to WAV: {e}")
        return None

def analyze_audio_file(audio_source):
    """
    Analyzes an audio file to extract transcript and acoustic metrics.
    Returns a dictionary with transcript, wpm, silence_duration, etc.
    """
    results = {
        "transcript": "",
        "wpm": 0,
        "pause_duration": 0,
        "filler_words": 0,
        "pitch_variance": 0,
        "volume_consistency": 0,
        "fluency_score": 0,
        "confidence_score": 0
    }

    # Convert audio to WAV format first
    wav_source = convert_to_wav(audio_source)
    if not wav_source:
        print("Failed to convert audio to WAV format")
        return results

    # 1. Transcription with Vosk
    if model:
        try:
            wav_source.seek(0)
            wf = wave.open(wav_source, "rb")
        except (wave.Error, EOFError) as e:
            print(f"Wave open failed after conversion: {e}")
            wf = None
            
        if wf and (wf.getnchannels() != 1 or wf.getsampwidth() != 2 or wf.getcomptype() != "NONE"):
            # Handle format mismatch
            pass # VOSK might fail or warn
        
        if wf:
            rec = vosk.KaldiRecognizer(model, wf.getframerate())
            rec.SetWords(True)
    
            transcript_parts = []
            while True:
                data = wf.readframes(4000)
                if len(data) == 0:
                    break
                if rec.AcceptWaveform(data):
                    part = json.loads(rec.Result())
                    transcript_parts.append(part.get("text", ""))
            
            final_part = json.loads(rec.FinalResult())
            transcript_parts.append(final_part.get("text", ""))
            results["transcript"] = " ".join([t for t in transcript_parts if t])
            # wf.close() # Don't close if it's a file-like object we need later? 
            # wave.open(file_object) does not close file object on close().
            wf.close() 

    # 2. Acoustic Analysis with Librosa
    try:
        wav_source.seek(0)
        y, sr = librosa.load(wav_source, sr=None)
        duration = librosa.get_duration(y=y, sr=sr)
        
        # Audio feature extraction
        rms = librosa.feature.rms(y=y)[0]
        pitches, magnitudes = librosa.piptrack(y=y, sr=sr)
        
        # Silence Detection
        non_silent_intervals = librosa.effects.split(y, top_db=20)
        non_silent_duration = sum(end - start for start, end in non_silent_intervals) / sr
        results["pause_duration"] = round(duration - non_silent_duration, 2)
        
        # Pitch Variance (Standard Deviation of pitch)
        # Filter out zero pitches (unvoiced)
        pitch_values = pitches[pitches > 0]
        if len(pitch_values) > 0:
            results["pitch_variance"] = round(float(np.std(pitch_values)), 2)
            
        # Volume Consistency (Inverse of RMS Standard Deviation)
        # Lower std dev means more consistent volume. 
        # We normalize specific to typical speech range.
        results["volume_consistency"] = round(1.0 - float(np.std(rms)), 2) 

        # 3. Derived Metrics
        word_count = len(results["transcript"].split())
        results["wpm"] = round((word_count / duration) * 60) if duration > 0 else 0
        
        # Filler Words (Simple keyword match)
        fillers = ["um", "uh", "like", "you know", "sort of"]
        filler_count = sum(results["transcript"].lower().count(f) for f in fillers)
        results["filler_words"] = filler_count

        # 4. Scoring Logic (0-10)
        
        # Fluency Score:
        # Base 10. Penalize for low WPM (<100) or high WPM (>160). Penalize for fillers.
        fluency = 10
        if results["wpm"] < 100: fluency -= 2
        if results["wpm"] > 160: fluency -= 1
        fluency -= (filler_count * 0.5)
        results["fluency_score"] = max(0, min(10, round(fluency, 1)))
        
        # Confidence Score:
        # Base 10. Penalize for too much silence (>20% of time). Penalize for low volume consistency.
        confidence = 10
        silence_ratio = results["pause_duration"] / duration if duration > 0 else 0
        if silence_ratio > 0.2: confidence -= (silence_ratio * 10) # Heavy penalty for silence
        if results["volume_consistency"] < 0.8: confidence -= 1
        if results["wpm"] < 80: confidence -= 2
        results["confidence_score"] = max(0, min(10, round(confidence, 1)))

    except Exception as e:
        print(f"Error in acoustic analysis: {e}")
        # Fallback if librosa fails (e.g., file codec issues)

    return results
