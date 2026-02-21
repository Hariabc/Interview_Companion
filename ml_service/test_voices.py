
import asyncio
import edge_tts
import sys

async def test_multiple_voices():
    voices = ["en-US-JennyNeural", "en-US-AriaNeural", "en-GB-SoniaNeural", "en-IN-NeerjaNeural"]
    text = "Hello! This is a voice test."
    
    for voice in voices:
        output_file = f"test_{voice}.mp3"
        try:
            print(f"Testing voice: {voice}...")
            communicate = edge_tts.Communicate(text, voice)
            await communicate.save(output_file)
            print(f"Success! {voice} works.")
            return voice
        except Exception as e:
            print(f"Failed for {voice}: {e}")
            
    print("All voices failed.")
    return None

if __name__ == "__main__":
    asyncio.run(test_multiple_voices())
