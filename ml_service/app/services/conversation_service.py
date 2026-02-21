import os
import json
from groq import Groq
from dotenv import load_dotenv
from typing import Optional, Dict, List

load_dotenv()

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))


def generate_ai_introduction(user_name: Optional[str] = None) -> str:
    """
    Generate a friendly AI introduction message.
    
    Args:
        user_name: Optional user name for personalization
    
    Returns:
        AI introduction text
    """
    try:
        greeting = f"Hello {user_name}!" if user_name else "Hello!"
        
        completion = client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": """You are a friendly and professional AI interviewer. 
                    Generate a warm, brief introduction (2-3 sentences) that:
                    1. Introduces yourself as an AI interviewer
                    2. Explains you'll be conducting a technical interview
                    3. Asks the candidate to introduce themselves and talk about their background
                    
                    Keep it conversational and encouraging. Don't be too formal."""
                },
                {
                    "role": "user",
                    "content": f"{greeting} Generate an introduction."
                }
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.7,
            max_tokens=200
        )
        
        intro_text = completion.choices[0].message.content.strip()
        return intro_text
    
    except Exception as e:
        print(f"Error generating AI introduction: {e}")
        # Fallback introduction
        return "Hello! I'm your AI interviewer today. I'm excited to learn more about you and your technical background. Could you please introduce yourself and tell me a bit about your experience?"


def analyze_user_introduction(
    user_intro_text: str,
    resume_text: Optional[str] = None
) -> Dict:
    """
    Analyze user's introduction to extract key information and topics.
    
    Args:
        user_intro_text: Transcript of user's introduction
        resume_text: Optional resume text for additional context
    
    Returns:
        dict with extracted topics, experience level, and key skills
    """
    try:
        resume_context = f"\n\nResume Context:\n{resume_text[:1000]}" if resume_text else ""
        
        completion = client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": """You are an expert at analyzing candidate introductions.
                    Extract key information from the candidate's introduction and return ONLY valid JSON.
                    
                    Return format:
                    {
                        "key_topics": ["topic1", "topic2", ...],
                        "experience_level": "junior|mid|senior",
                        "mentioned_skills": ["skill1", "skill2", ...],
                        "areas_of_interest": ["area1", "area2", ...],
                        "summary": "brief summary of candidate background"
                    }
                    """
                },
                {
                    "role": "user",
                    "content": f"""Analyze this candidate introduction:
                    
                    "{user_intro_text}"
                    {resume_context}
                    
                    Extract key topics, skills, and experience level."""
                }
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.3,
            response_format={"type": "json_object"}
        )
        
        result = json.loads(completion.choices[0].message.content)
        return result
    
    except Exception as e:
        print(f"Error analyzing user introduction: {e}")
        # Fallback analysis
        return {
            "key_topics": ["General Programming"],
            "experience_level": "mid",
            "mentioned_skills": [],
            "areas_of_interest": [],
            "summary": user_intro_text[:200]
        }


def generate_contextual_questions(
    user_intro_analysis: Dict,
    resume_text: Optional[str] = None,
    selected_topics: Optional[List[str]] = None,
    count: int = 3,
    difficulty_hint: Optional[int] = None,
    previous_answer: Optional[str] = None,
    audio_metrics: Optional[Dict] = None,
    conversation_history: Optional[List[Dict]] = None,
    asked_questions: Optional[List[str]] = None,
    diversity_nonce: Optional[str] = None
) -> List[Dict]:
    """
    Generate interview questions based on user introduction and resume.
    
    Args:
        user_intro_analysis: Analysis from analyze_user_introduction
        resume_text: Optional resume text
        selected_topics: Optional list of topics to focus on
        count: Number of questions to generate
    
    Returns:
        List of question dictionaries
    """
    try:
        # Combine topics from user intro and selected topics
        topics = user_intro_analysis.get("key_topics", [])
        if selected_topics:
            topics.extend(selected_topics)
        topics = list(set(topics))  # Remove duplicates
        
        if not topics:
            topics = ["General Programming"]
        
        experience_level = user_intro_analysis.get("experience_level", "mid")
        mentioned_skills = user_intro_analysis.get("mentioned_skills", [])
        user_summary = user_intro_analysis.get("summary", "")
        difficulty = difficulty_hint if difficulty_hint else 3
        
        resume_context = f"\n\nResume:\n{resume_text[:1500]}" if resume_text else ""
        skills_context = f"\n\nMentioned Skills: {', '.join(mentioned_skills)}" if mentioned_skills else ""
        previous_answer_context = f"\n\nCandidate's Most Recent Answer (transcript): {previous_answer}" if previous_answer else ""
        audio_metrics_context = f"\n\nVoice Metrics: {json.dumps(audio_metrics)}" if audio_metrics else ""
        asked_questions_context = ""
        if asked_questions:
            trimmed_asked = [str(q).strip() for q in asked_questions if str(q).strip()][:20]
            if trimmed_asked:
                asked_questions_context = f"\n\nAlready Asked Questions (must not repeat): {json.dumps(trimmed_asked)}"
        diversity_context = f"\n\nDiversity Nonce: {diversity_nonce}" if diversity_nonce else ""
        history_context = ""
        if conversation_history:
            trimmed_history = conversation_history[-8:]
            history_context = f"\n\nRecent Conversation History: {json.dumps(trimmed_history)}"
        
        completion = client.chat.completions.create(
            messages=[
                {
                    "role": "system",
                    "content": """You are an expert technical interviewer running a realistic human conversation.
                    Generate personalized interviewer prompts based on the candidate's introduction and background.
                    The interviewer should sound natural, like a discussion:
                    - Start with an explicit acknowledgment of what the candidate just said (paraphrase, not copy)
                    - Ask a focused follow-up
                    - Avoid robotic tone and avoid asking disconnected questions
                    - Keep each prompt to 1-3 sentences, concise and spoken-friendly
                    - If candidate asks for help/support, adapt tone to supportive coaching before technical probing
                    - If candidate asks to skip, acknowledge and move on gracefully
                    - Do not inject generic motivational lines unless the candidate explicitly asks for help/support
                    - Keep technical depth: include core computer science probing, not only project storytelling
                    - For each generated batch, ensure at least one prompt is a DSA-focused technical question
                    - Across ongoing turns, regularly ask DSA follow-ups (arrays/strings, hash maps, stacks/queues, trees/graphs, complexity)
                    - When you ask a DSA question, mention expected time/space complexity in the ideal answer text
                    - Never repeat or trivially rephrase a question already asked in this session
                    
                    Return ONLY valid JSON in this format:
                    {
                        "questions": [
                            {
                                "question_text": "...",
                                "topic": "...",
                                "difficulty_level": 1-5,
                                "ideal_answer_keywords": ["..."],
                                "ideal_answer_text": "..."
                            }
                        ]
                    }
                    
                    Make prompts relevant to what the candidate mentioned in their introduction and most recent answer.
                    Adjust difficulty based on experience level and difficulty hint.
                    """
                },
                {
                    "role": "user",
                    "content": f"""Generate {count} personalized conversational interviewer prompts.
                    
                    Candidate Introduction Summary: {user_summary}
                    Experience Level: {experience_level}
                    Topics to Focus On: {', '.join(topics)}
                    Difficulty Hint (1-5): {difficulty}
                    {skills_context}
                    {resume_context}
                    {previous_answer_context}
                    {audio_metrics_context}
                    {asked_questions_context}
                    {diversity_context}
                    {history_context}
                    
                    Generate prompts that build naturally on what the candidate said. 
                    Also ensure at least one prompt in this batch is DSA-focused technical interviewing.
                    """
                }
            ],
            model="llama-3.3-70b-versatile",
            temperature=0.7,
            response_format={"type": "json_object"}
        )
        
        result = json.loads(completion.choices[0].message.content)
        questions = result.get("questions", [])

        def _normalize_question(text: str) -> str:
            return "".join(ch.lower() for ch in str(text or "") if ch.isalnum() or ch.isspace()).strip()

        asked_normalized = set(_normalize_question(q) for q in (asked_questions or []) if str(q or "").strip())
        seen_batch = set()
        unique_questions: List[Dict] = []
        for q in questions:
            q_text = str(q.get("question_text", "")).strip()
            normalized = _normalize_question(q_text)
            if not normalized:
                continue
            if normalized in asked_normalized or normalized in seen_batch:
                continue
            seen_batch.add(normalized)
            unique_questions.append(q)

        questions = unique_questions
        return questions
    
    except Exception as e:
        print(f"Error generating contextual questions: {e}")
        return []


if __name__ == "__main__":
    # Test the conversation service
    intro = generate_ai_introduction("John")
    print("AI Introduction:", intro)
    
    test_user_intro = "Hi, I'm a full-stack developer with 3 years of experience in React and Node.js. I've worked on several e-commerce projects."
    analysis = analyze_user_introduction(test_user_intro)
    print("\nUser Analysis:", json.dumps(analysis, indent=2))
    
    questions = generate_contextual_questions(analysis, count=2)
    print("\nGenerated Questions:", json.dumps(questions, indent=2))
