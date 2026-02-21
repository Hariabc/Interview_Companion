
import asyncio
import edge_tts
import sys

async def test_synthesis():
    text = "Hello! This is a test of the speech synthesis system."
    voice = "en-US-JennyNeural"
    output_file = "test_test.mp3"
    
    try:
        print(f"Testing synthesis with voice {voice}...")
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(output_file)
        print("Success! File saved as test_test.mp3")
    except Exception as e:
        print(f"Synthesis failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(test_synthesis())
