import os
from deepgram import DeepgramClient, PrerecordedOptions, FileSource
from dotenv import load_dotenv
from typing import Union, BinaryIO
import json

load_dotenv()

# Initialize Deepgram client
DEEPGRAM_API_KEY = os.environ.get("DEEPGRAM_API_KEY")

if not DEEPGRAM_API_KEY:
    print("WARNING: DEEPGRAM_API_KEY is not set in environment variables.")
else:
    print(f"DEEPGRAM_API_KEY loaded: {DEEPGRAM_API_KEY[:5]}...")
    print("STT_SERVICE_INTERNAL_VERSION: 1.0.1 (Fixed Attribute Error)")

deepgram = DeepgramClient(DEEPGRAM_API_KEY) if DEEPGRAM_API_KEY else None


import inspect

def transcribe_audio(audio_source: Union[str, bytes, BinaryIO]) -> dict:
    """
    Transcribe audio to text using Deepgram API.
    """
    print("CRITICAL_DEBUG: Function 'transcribe_audio' called.")
    try:
        source_code = inspect.getsource(transcribe_audio)
        print(f"CRITICAL_DEBUG: Source code of calling function:\n{source_code}")
    except Exception as e:
        print(f"CRITICAL_DEBUG: Failed to get source code: {e}")
    if not deepgram:
        raise Exception("Deepgram client not initialized. Check DEEPGRAM_API_KEY.")
    
    try:
        # Prepare audio payload
        if isinstance(audio_source, str):
            # File path
            with open(audio_source, "rb") as audio_file:
                buffer_data = audio_file.read()
        elif isinstance(audio_source, bytes):
            # Raw bytes
            buffer_data = audio_source
        else:
            # File-like object
            buffer_data = audio_source.read()
        
        payload: FileSource = {
            "buffer": buffer_data,
        }
        
        # Configure Deepgram options
        options = PrerecordedOptions(
            model="nova-2",
            smart_format=True,
            punctuate=True,
            diarize=False,
            language="en-US",
            utterances=True
        )
        
        # Debug logging
        print(f"DEBUG: type(deepgram): {type(deepgram)}")
        print(f"DEBUG: type(deepgram.listen): {type(deepgram.listen)}")
        print(f"DEBUG: dir(deepgram.listen): {dir(deepgram.listen)}")
        
        # Transcribe
        print("DEBUG: Calling transcribe_file...")
        response = deepgram.listen.prerecorded.v("1").transcribe_file(payload, options)
        print("DEBUG: Calling successful!")
        
        # Extract transcript and metadata
        result = response.to_dict()
        
        # Get the best transcript
        transcript = ""
        confidence = 0.0
        words_count = 0
        
        if result.get("results") and result["results"].get("channels"):
            channel = result["results"]["channels"][0]
            if channel.get("alternatives"):
                alternative = channel["alternatives"][0]
                transcript = alternative.get("transcript", "")
                confidence = alternative.get("confidence", 0.0)
                words_count = len(alternative.get("words", []))
        
        return {
            "transcript": transcript,
            "confidence": confidence,
            "words_count": words_count,
            "full_response": result
        }
    
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        print(f"Error in STT transcription: {e}")
        print(f"Details: {error_details}")
        # Return a fallback transcript with actual error to help debugging
        return {
            "transcript": f"[GHOST_ERROR_123 - Transcription failed: {str(e)}]",
            "confidence": 0.0,
            "words_count": 0,
            "error": str(e),
            "debug_info": error_details
        }


def transcribe_audio_url(audio_url: str) -> dict:
    """
    Transcribe audio from a URL using Deepgram API.
    
    Args:
        audio_url: Public URL of the audio file
    
    Returns:
        dict with transcript, confidence, and metadata
    """
    if not deepgram:
        raise Exception("Deepgram client not initialized. Check DEEPGRAM_API_KEY.")
    
    try:
        # Configure Deepgram options
        options = PrerecordedOptions(
            model="nova-2",
            smart_format=True,
            punctuate=True,
            diarize=False,
            language="en-US",
            utterances=True
        )
        
        # Transcribe from URL
        response = deepgram.listen.prerecorded.v("1").transcribe_url(
            {"url": audio_url},
            options
        )
        
        # Extract transcript and metadata
        result = response.to_dict()
        
        # Get the best transcript
        transcript = ""
        confidence = 0.0
        words_count = 0
        
        if result.get("results") and result["results"].get("channels"):
            channel = result["results"]["channels"][0]
            if channel.get("alternatives"):
                alternative = channel["alternatives"][0]
                transcript = alternative.get("transcript", "")
                confidence = alternative.get("confidence", 0.0)
                words_count = len(alternative.get("words", []))
        
        return {
            "transcript": transcript,
            "confidence": confidence,
            "words_count": words_count,
            "full_response": result
        }
    
    except Exception as e:
        print(f"Error in STT transcription from URL: {e}")
        raise Exception(f"STT transcription failed: {str(e)}")


if __name__ == "__main__":
    # Test the STT service (requires a test audio file)
    print("STT Service initialized successfully")
    if DEEPGRAM_API_KEY:
        print("Ready to transcribe audio")
    else:
        print("Missing DEEPGRAM_API_KEY - transcription will fail")
