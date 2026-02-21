
import requests
import json

def test_ml_service():
    url = "http://localhost:8000/conversation/start"
    payload = {"user_name": "Test User"}
    
    try:
        print(f"Testing ML service at {url}...")
        response = requests.post(url, json=payload)
        print(f"Status Code: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print("Success!")
            print(f"Intro Text: {data['intro_text']}")
            print(f"Audio Base64 length: {len(data['audio_base64'])}")
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Connection failed: {e}")

if __name__ == "__main__":
    test_ml_service()
