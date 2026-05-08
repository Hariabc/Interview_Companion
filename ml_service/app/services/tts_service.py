import asyncio
import edge_tts
from typing import Optional
import base64

# Available voices - high quality neural voices
VOICES = {
    "female": "en-US-AriaNeural",
    "male": "en-US-GuyNeural",
    "female_friendly": "en-US-JennyNeural",
    "male_professional": "en-US-DavisNeural"
}

MALE_VOICES = [
    "en-US-DavisNeural",
    "en-US-GuyNeural",
    "en-US-AndrewNeural",
    "en-GB-RyanNeural",
    "en-IN-PrabhatNeural",
]

FEMALE_VOICES = [
    "en-US-JennyNeural",
    "en-US-AriaNeural",
    "en-GB-SoniaNeural",
    "en-IN-NeerjaNeural",
]


def build_voice_fallbacks(voice: str) -> list[str]:
    voice_key = (voice or "female_friendly").strip()
    resolved_voice = VOICES.get(voice_key, voice_key)
    normalized = voice_key.lower()
    resolved_normalized = resolved_voice.lower()

    if "female" in normalized or any(name.lower() == resolved_normalized for name in FEMALE_VOICES):
        candidates = [resolved_voice, *FEMALE_VOICES]
    elif normalized.startswith("male") or any(name.lower() == resolved_normalized for name in MALE_VOICES):
        candidates = [resolved_voice, *MALE_VOICES]
    else:
        candidates = [resolved_voice, *FEMALE_VOICES]

    deduped = []
    for candidate in candidates:
        if candidate and candidate not in deduped:
            deduped.append(candidate)
    return deduped

async def synthesize_speech_async(
    text: str, 
    voice: str = "female_friendly",
    output_filename: Optional[str] = None
) -> dict:
    """
    Convert text to speech using Edge TTS with fallback voices.
    """
    voices_to_try = build_voice_fallbacks(voice)
    
    last_error = None
    for v in voices_to_try:
        try:
            # Get specific voice name if using shorthand
            voice_name = VOICES.get(v, v)
            if not voice_name: voice_name = v
            
            print(f"Attempting synthesis with voice: {voice_name}")
            communicate = edge_tts.Communicate(text, voice_name)

            audio_chunks = []
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_chunks.append(chunk["data"])

            audio_bytes = b"".join(audio_chunks)
            if not audio_bytes:
                raise RuntimeError("TTS synthesis returned no audio data")

            audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
            
            return {
                "audio_path": None,
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
        output_filename: Kept for API compatibility; audio is generated in memory.
    
    Returns:
        dict with audio_path and audio_base64. audio_path is always None because
        synthesized audio is not written to disk.
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
    print(f"Audio generated successfully: {bool(result['audio_base64'])}")
    print(f"Voice used: {result['voice_used']}")
