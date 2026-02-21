import os
import asyncio
import edge_tts
from pathlib import Path
from typing import Optional
import base64

# Create directory for storing generated audio files
AUDIO_DIR = Path(__file__).parent.parent.parent / "temp_audio"
AUDIO_DIR.mkdir(exist_ok=True)

# Available voices - high quality neural voices
VOICES = {
    "female": "en-US-AriaNeural",
    "male": "en-US-GuyNeural",
    "female_friendly": "en-US-JennyNeural",
    "male_professional": "en-US-DavisNeural"
}

async def synthesize_speech_async(
    text: str, 
    voice: str = "female_friendly",
    output_filename: Optional[str] = None
) -> dict:
    """
    Convert text to speech using Edge TTS with fallback voices.
    """
    voices_to_try = [voice, "en-US-JennyNeural", "en-US-AriaNeural", "en-GB-SoniaNeural", "en-IN-NeerjaNeural"]
    
    last_error = None
    for v in voices_to_try:
        try:
            # Get specific voice name if using shorthand
            voice_name = VOICES.get(v, v)
            if not voice_name: voice_name = v
            
            # Generate unique filename if not provided
            import time
            current_filename = output_filename if output_filename else f"tts_{int(time.time() * 1000)}"
            output_path = AUDIO_DIR / f"{current_filename}.mp3"
            
            print(f"Attempting synthesis with voice: {voice_name}")
            communicate = edge_tts.Communicate(text, voice_name)
            await communicate.save(str(output_path))
            
            # Read file and convert to base64
            with open(output_path, "rb") as audio_file:
                audio_bytes = audio_file.read()
                audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
            
            return {
                "audio_path": str(output_path),
                "audio_base64": audio_base64,
                "voice_used": voice_name,
                "text": text
            }
        except Exception as e:
            print(f"Failed with voice {v}: {e}")
            last_error = e
            continue
            
    # If all voices fail, return fallback result
    return {
        "audio_path": None,
        "audio_base64": "",
        "voice_used": "none",
        "text": text,
        "error": str(last_error) if last_error else "All voices failed"
    }
    


def synthesize_speech(
    text: str, 
    voice: str = "female_friendly",
    output_filename: Optional[str] = None
) -> dict:
    """
    Synchronous wrapper for synthesize_speech_async.
    
    Args:
        text: The text to convert to speech
        voice: Voice type (female, male, female_friendly, male_professional)
        output_filename: Optional custom filename (without extension)
    
    Returns:
        dict with audio_path and audio_base64
    """
    return asyncio.run(synthesize_speech_async(text, voice, output_filename))


async def get_available_voices():
    """Get list of all available Edge TTS voices"""
    voices = await edge_tts.list_voices()
    return voices


if __name__ == "__main__":
    # Test the TTS service
    test_text = "Hello! I'm your AI interviewer. I'm excited to conduct this interview with you today."
    result = synthesize_speech(test_text, voice="female_friendly")
    print(f"Audio generated successfully at: {result['audio_path']}")
    print(f"Voice used: {result['voice_used']}")
