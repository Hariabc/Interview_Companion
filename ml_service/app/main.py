from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import shutil
import os
from app.services.resume_parser import parse_resume_pdf
from app.services.scorer import score_answer_text, rewrite_answer_text
from app.services.audio_analyzer import analyze_audio_file
from app.services.adaptive import suggest_next_difficulty
from app.services.generator import generate_interview_questions
from app.services.conversation_service import (
    generate_ai_introduction,
    analyze_user_introduction,
    generate_contextual_questions
)
from app.services.stt_service import transcribe_audio, transcribe_audio_url
from app.services.tts_service import synthesize_speech
from app.services.code_review_service import analyze_code_submission
from app.services.coding_challenge_service import generate_personalized_coding_challenge
from app.services.question_cache import clear_cache, get_cache_stats

app = FastAPI(title="AI Interview ML Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ScoreRequest(BaseModel):
    answer_text: Optional[str] = None
    audio_url: Optional[str] = None
    question_text: str
    ideal_keywords: Optional[List[str]] = None
    ideal_answer_text: Optional[str] = None

class DifficultyRequest(BaseModel):
    current_difficulty: int
    last_score: float

class RewriteRequest(BaseModel):
    answer_text: str
    question_text: str
    ideal_keywords: Optional[List[str]] = None
    ideal_answer_text: Optional[str] = None
    feedback_text: Optional[str] = None

class QuestionParams(BaseModel):
    resume_text: str
    topics: List[str]

@app.get("/")
def health_check():
    return {"status": "healthy"}

@app.get("/cache/stats")
def cache_stats():
    """Get cache statistics."""
    return get_cache_stats()

@app.post("/cache/clear")
def cache_clear():
    """Clear all cached questions."""
    clear_cache()
    return {"status": "success", "message": "Cache cleared"}

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
        # For this prototype, we'll try to use the stt_service to get the transcript 
        # then pass it to audio_analyzer if we had the file.
        # Since we don't have download logic here yet, we'll use transcribe_audio_url
        try:
            stt_result = transcribe_audio_url(request.audio_url)
            transcript = stt_result.get("transcript", "")
            # We can't do acoustic analysis on a URL easily without downloading it.
            # For now, we return the transcript and basic metrics from STT
            audio_metrics = {
                "confidence": stt_result.get("confidence", 0),
                "words_count": stt_result.get("words_count", 0)
            }
        except Exception as e:
            print(f"Error transcribing audio URL: {e}")
            transcript = "[Transcription error]"
    
    final_text = request.answer_text if request.answer_text else transcript
    
    if not final_text:
        raise HTTPException(status_code=400, detail="No text or audio provided for scoring")
    
    if not request.question_text:
        raise HTTPException(status_code=400, detail="question_text is required")

    # 2. Score Text
    # Provide defaults for optional parameters
    ideal_answer = request.ideal_answer_text if request.ideal_answer_text else ""
    ideal_keywords = request.ideal_keywords if request.ideal_keywords else []
    
    scores = score_answer_text(final_text, request.question_text, ideal_answer, ideal_keywords)
    
    return {
        **scores,
        "transcript": transcript,
        "audio_metrics": audio_metrics
    }

@app.post("/analyze_audio")
async def analyze_audio(file: UploadFile = File(...)):
    # Process directly from memory/spooled temp file
    metrics = analyze_audio_file(file.file)
    return metrics

@app.post("/suggest_difficulty")
def suggest_difficulty(request: DifficultyRequest):
    new_difficulty = suggest_next_difficulty(request.current_difficulty, request.last_score)
    return {"suggested_difficulty": new_difficulty}

@app.post("/rewrite_answer")
def rewrite_answer(request: RewriteRequest):
    if not request.answer_text or not request.question_text:
        raise HTTPException(status_code=400, detail="answer_text and question_text are required")

    result = rewrite_answer_text(
        answer_text=request.answer_text,
        question_text=request.question_text,
        ideal_answer_text=request.ideal_answer_text,
        ideal_keywords=request.ideal_keywords,
        feedback_text=request.feedback_text
    )
    return result

@app.post("/generate_questions")
def generate_questions(params: QuestionParams):
    questions = generate_interview_questions(params.resume_text, params.topics)
    return {"questions": questions}

# ============ CONVERSATION ENDPOINTS ============

class ConversationStartRequest(BaseModel):
    user_name: Optional[str] = None

class UserIntroAnalysisRequest(BaseModel):
    user_intro_text: str
    resume_text: Optional[str] = None

class ContextualQuestionsRequest(BaseModel):
    user_intro_analysis: dict
    resume_text: Optional[str] = None
    selected_topics: Optional[List[str]] = None
    count: int = 3
    difficulty_hint: Optional[int] = None
    previous_answer: Optional[str] = None
    audio_metrics: Optional[dict] = None
    conversation_history: Optional[List[dict]] = None
    asked_questions: Optional[List[str]] = None
    diversity_nonce: Optional[str] = None

class TranscribeRequest(BaseModel):
    audio_url: Optional[str] = None

class CodeSubmissionRequest(BaseModel):
    challenge_title: str
    challenge_prompt: str
    language: str
    code: str
    passed_count: int
    total_count: int
    run_results: List[dict]
    user_transcript: Optional[str] = None

class GenerateCodingChallengeRequest(BaseModel):
    resume_text: Optional[str] = None
    topics: Optional[List[str]] = None
    mentioned_skills: Optional[List[str]] = None
    user_summary: Optional[str] = None
    round: int = 1

@app.post("/conversation/start")
def start_conversation(request: ConversationStartRequest):
    """Generate AI introduction and synthesize to speech"""
    try:
        # Generate introduction text
        intro_text = generate_ai_introduction(request.user_name)
        
        # Synthesize to speech
        tts_result = synthesize_speech(
            text=intro_text,
            voice="female_friendly",
            output_filename=f"ai_intro_{request.user_name or 'user'}"
        )
        
        if not tts_result.get("audio_base64"):
            error_msg = tts_result.get("error", "TTS synthesis failed")
            print(f"ERROR: /conversation/start failed: {error_msg}")
            raise HTTPException(status_code=500, detail=f"TTS synthesis failed: {error_msg}")

        return {
            "intro_text": intro_text,
            "audio_path": tts_result["audio_path"],
            "audio_base64": tts_result["audio_base64"],
            "voice_used": tts_result["voice_used"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/conversation/analyze_user_intro")
def analyze_user_intro(request: UserIntroAnalysisRequest):
    """Analyze user's introduction to extract topics and context"""
    try:
        analysis = analyze_user_introduction(
            user_intro_text=request.user_intro_text,
            resume_text=request.resume_text
        )
        return analysis
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/conversation/generate_contextual_questions")
def generate_contextual_qs(request: ContextualQuestionsRequest):
    """Generate questions based on conversation context and resume"""
    try:
        questions = generate_contextual_questions(
            user_intro_analysis=request.user_intro_analysis,
            resume_text=request.resume_text,
            selected_topics=request.selected_topics,
            count=request.count,
            difficulty_hint=request.difficulty_hint,
            previous_answer=request.previous_answer,
            audio_metrics=request.audio_metrics,
            conversation_history=request.conversation_history,
            asked_questions=request.asked_questions,
            diversity_nonce=request.diversity_nonce
        )
        return {"questions": questions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/transcribe_audio")
async def transcribe_audio_endpoint(file: UploadFile = File(...)):
    """Transcribe audio file to text using Deepgram"""
    try:
        # Read file content
        audio_bytes = await file.read()
        
        # Transcribe
        result = transcribe_audio(audio_bytes)
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/transcribe_audio_url")
def transcribe_url_endpoint(request: TranscribeRequest):
    """Transcribe audio from URL using Deepgram"""
    try:
        if not request.audio_url:
            raise HTTPException(status_code=400, detail="audio_url is required")
        
        result = transcribe_audio_url(request.audio_url)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/synthesize_speech")
def synthesize_speech_endpoint(text: str, voice: str = "female_friendly"):
    """Convert text to speech using Edge TTS"""
    try:
        result = synthesize_speech(text=text, voice=voice)
        if not result.get("audio_base64"):
            error_msg = result.get("error", "TTS synthesis failed")
            print(f"ERROR: /synthesize_speech failed: {error_msg}")
            raise HTTPException(status_code=500, detail=f"TTS synthesis failed: {error_msg}")
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/coding/analyze_submission")
def analyze_code_submission_endpoint(request: CodeSubmissionRequest):
    """Analyze coding submission and provide feedback with complexity suggestions"""
    try:
        result = analyze_code_submission(request.model_dump())
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/coding/generate_challenge")
def generate_coding_challenge_endpoint(request: GenerateCodingChallengeRequest):
    """Generate a personalized coding challenge based on resume/topics/context."""
    try:
        result = generate_personalized_coding_challenge(request.model_dump())
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
