import requests
import os
import sys

def test_enhanced_analysis():
    url = "http://localhost:8000/analyze_audio"
    
    # Use one of the existing test files in the directory
    test_file = "test_en-US-JennyNeural.mp3"
    
    if not os.path.exists(test_file):
        # Check if there's any other mp3/wav
        files = [f for f in os.listdir('.') if f.endswith(('.mp3', '.wav'))]
        if files:
            test_file = files[0]
        else:
            print("No test audio file found! Please provide a test_audio.wav or similar.")
            return

    print(f"Testing /analyze_audio with file: {test_file}")
    
    try:
        with open(test_file, "rb") as f:
            files = {"file": (test_file, f, "audio/mpeg")}
            response = requests.post(url, files=files)
            
        print(f"Status Code: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print("\nAnalysis Results:")
            print(f"Transcript: {data.get('transcript')}")
            print(f"Emotion: {data.get('emotion')}")
            print(f"Confidence: {data.get('confidence_score')}")
            print(f"Gaps found: {len(data.get('gaps', []))}")
            if data.get('gaps'):
                print(f"First gap: {data['gaps'][0]}")
            print(f"Fluency: {data.get('fluency_score')}")
            print(f"Metrics: WPM={data.get('wpm')}, Fillers={data.get('filler_words')}")
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Request failed: {e}")

if __name__ == "__main__":
    test_enhanced_analysis()
