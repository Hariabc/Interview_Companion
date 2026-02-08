from fastapi import FastAPI, UploadFile, File, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import shutil
import os
from app.services.resume_parser import parse_resume_pdf
from app.services.scorer import score_answer_text
from app.services.audio_analyzer import analyze_audio_file
from app.services.adaptive import suggest_next_difficulty
from app.services.generator import generate_interview_questions

app = FastAPI(title="AI Interview ML Service")

class ScoreRequest(BaseModel):
    answer_text: Optional[str] = None
    audio_url: Optional[str] = None
    question_text: str
    ideal_keywords: Optional[List[str]] = None
    ideal_answer_text: Optional[str] = None

class DifficultyRequest(BaseModel):
    current_difficulty: int
    last_score: float

class QuestionParams(BaseModel):
    resume_text: str
    topics: List[str]

@app.get("/")
def health_check():
    return {"status": "healthy"}

@app.post("/parse_resume")
async def parse_resume(file: UploadFile = File(...)):
    temp_file = f"temp_{file.filename}"
    with open(temp_file, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    try:
        skills, text = parse_resume_pdf(temp_file)
    finally:
        if os.path.exists(temp_file):
            os.remove(temp_file)
            
    return {"skills": skills, "extracted_text": text[:500] + "..."}

@app.post("/score_answer")
async def score_answer(request: ScoreRequest):
    # 1. Transcribe if audio
    transcript = ""
    audio_metrics = {}
    
    if request.audio_url:
        # In a real app, download file from URL. 
        # For this prototype, we assume it might be a local path or we skip download
        # and just mock the transcription hook or implement basic download.
        # Here we will assume the ML service can access the file or it's passed as base64 (not implemented here for brevity)
        # For simplicity in this artifact, we'll error if it's a URL requiring auth/download without that logic.
        # But we can try to handle it if it's a public URL.
        
        # Mocking transcription for the scope of this file to avoid complex networking code here
        # In production: download_audio(request.audio_url) -> analyze_audio_file
        transcript = "This is a placeholder transcript for audio." 
        audio_metrics = {"wpm": 120, "fillers": 2, "pause_duration": 0.5}
        
        # If we had a file upload endpoint for audio, we'd use analyze_audio_file
    
    final_text = request.answer_text if request.answer_text else transcript
    
    if not final_text:
        raise HTTPException(status_code=400, detail="No text or audio provided")

    # 2. Score Text
    scores = score_answer_text(final_text, request.question_text, request.ideal_answer_text, request.ideal_keywords)
    
    return {
        **scores,
        "transcript": transcript,
        "audio_metrics": audio_metrics
    }

@app.post("/analyze_audio")
async def analyze_audio(file: UploadFile = File(...)):
    temp_file = f"temp_{file.filename}"
    with open(temp_file, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        metrics = analyze_audio_file(temp_file)
    finally:
        if os.path.exists(temp_file):
            os.remove(temp_file)
            
    return metrics

@app.post("/suggest_difficulty")
def suggest_difficulty(request: DifficultyRequest):
    new_difficulty = suggest_next_difficulty(request.current_difficulty, request.last_score)
    return {"suggested_difficulty": new_difficulty}

@app.post("/generate_questions")
def generate_questions(params: QuestionParams):
    questions = generate_interview_questions(params.resume_text, params.topics)
    return {"questions": questions}
