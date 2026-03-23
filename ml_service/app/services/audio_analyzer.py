import wave
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor

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
from app.services.stt_service import transcribe_audio

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

def read_audio_bytes(audio_source):
    if isinstance(audio_source, str):
        with open(audio_source, "rb") as audio_file:
            return audio_file.read()

    audio_source.seek(0)
    return audio_source.read()

def convert_to_wav(audio_source):
    """
    Converts audio from various formats (WebM, MP3, etc.) to WAV format in memory.
    Returns a BytesIO object containing WAV data.
    """
    try:
        if isinstance(audio_source, bytes):
            audio = AudioSegment.from_file(io.BytesIO(audio_source))
        elif isinstance(audio_source, str):
            audio = AudioSegment.from_file(audio_source)
        else:
            audio_source.seek(0)
            audio = AudioSegment.from_file(io.BytesIO(audio_source.read()))
        
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

def analyze_audio_file(audio_source, existing_transcript=None):
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
        "confidence_score": 0,
        "emotion": "neutral",
        "gaps": []
    }

    try:
        audio_bytes = read_audio_bytes(audio_source)
    except Exception as e:
        print(f"Failed to read audio bytes: {e}")
        return results

    transcription_future = None
    if not existing_transcript:
        executor = ThreadPoolExecutor(max_workers=1)
        transcription_future = executor.submit(transcribe_audio, audio_bytes)
    else:
        executor = None

    wav_source = convert_to_wav(audio_bytes)
    if not wav_source:
        print("Failed to convert audio to WAV format")
        if transcription_future:
            executor.shutdown(wait=False)
        return results

    silence_ratio = 0

    # 1. Acoustic Analysis with Librosa
    try:
        wav_source.seek(0)
        y, sr = librosa.load(wav_source, sr=None)
        duration = librosa.get_duration(y=y, sr=sr)
        
        rms = librosa.feature.rms(y=y)[0]
        pitches, magnitudes = librosa.piptrack(y=y, sr=sr)
        
        non_silent_intervals = librosa.effects.split(y, top_db=20)
        non_silent_duration = sum(end - start for start, end in non_silent_intervals) / sr
        results["pause_duration"] = round(duration - non_silent_duration, 2)
        
        pitch_values = pitches[pitches > 0]
        if len(pitch_values) > 0:
            results["pitch_variance"] = round(float(np.std(pitch_values)), 2)
            
        results["volume_consistency"] = round(1.0 - float(np.std(rms)), 2)

        silent_intervals = []
        last_end = 0
        for start, end in non_silent_intervals:
            gap_duration = (start - last_end) / sr
            if gap_duration > 0.5:
                silent_intervals.append({
                    "start": round(last_end / sr, 2),
                    "end": round(start / sr, 2),
                    "duration": round(gap_duration, 2)
                })
            last_end = end

        trailing_gap = (len(y) - last_end) / sr
        if trailing_gap > 0.5:
            silent_intervals.append({
                "start": round(last_end / sr, 2),
                "end": round(len(y) / sr, 2),
                "duration": round(trailing_gap, 2)
            })

        results["gaps"] = silent_intervals
        silence_ratio = results["pause_duration"] / duration if duration > 0 else 0
    except Exception as e:
        print(f"Error in acoustic analysis: {e}")
        duration = 0

    # 2. Transcription (Prefer existing, then Deepgram, then Vosk)
    if existing_transcript:
        results["transcript"] = existing_transcript
    else:
        transcript_result = None
        try:
            if transcription_future:
                transcript_result = transcription_future.result()
            
            if transcript_result and transcript_result.get("transcript"):
                results["transcript"] = transcript_result["transcript"]
                results["confidence_score"] = round(transcript_result.get("confidence", 0) * 10, 1)
        except Exception as e:
            print(f"Deepgram transcription failed: {e}")
        finally:
            if executor:
                executor.shutdown(wait=False)

        if not results["transcript"] and model:
            try:
                wav_source.seek(0)
                wf = wave.open(wav_source, "rb")
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
                wf.close()
            except Exception as e:
                print(f"Vosk fallback failed: {e}")

    try:
        word_count = len(results["transcript"].split())
        results["wpm"] = round((word_count / duration) * 60) if duration > 0 else 0

        fillers = ["um", "uh", "like", "you know", "sort of"]
        filler_count = sum(results["transcript"].lower().count(f) for f in fillers)
        results["filler_words"] = filler_count

        fluency = 10
        if results["wpm"] < 100: fluency -= 2
        if results["wpm"] > 160: fluency -= 1
        fluency -= (filler_count * 0.5)
        results["fluency_score"] = max(0, min(10, round(fluency, 1)))

        if results["confidence_score"] == 0:
            confidence = 10
            if silence_ratio > 0.2: confidence -= (silence_ratio * 10) # Heavy penalty for silence
            if results["volume_consistency"] < 0.8: confidence -= 1
            if results["wpm"] < 80: confidence -= 2
            results["confidence_score"] = max(0, min(10, round(confidence, 1)))

        if results["pitch_variance"] > 300 and results["volume_consistency"] > 0.8:
            results["emotion"] = "energetic"
        elif silence_ratio > 0.3 or results["pitch_variance"] < 50:
            results["emotion"] = "hesitant"
        else:
            results["emotion"] = "calm"

    except Exception as e:
        print(f"Error in derived metric analysis: {e}")

    return results
