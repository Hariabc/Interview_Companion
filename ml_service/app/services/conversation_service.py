import os
import json
from groq import Groq
from dotenv import load_dotenv
from typing import Optional, Dict, List

load_dotenv()

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))


def _build_fallback_questions(
    topics: List[str],
    difficulty: int,
    count: int,
    experience_level: str,
    interview_mode: str = "balanced"
) -> List[Dict]:
    safe_topic = (topics[0] if topics else "core programming").strip() or "core programming"
    safe_count = max(1, min(5, int(count or 1)))
    safe_difficulty = max(1, min(5, int(difficulty or 3)))

    if interview_mode == "salary_negotiation":
        templates = [
            {
                "question_text": "What compensation range would you ask for, and what is the main reason behind that number?",
                "topic": "Salary Negotiation",
                "difficulty_level": min(safe_difficulty, 2),
                "ideal_answer_keywords": ["range", "market", "impact", "role", "flexibility"],
                "ideal_answer_text": "Give a clear range, connect it to role scope and market data, and stay open to the full offer package."
            },
            {
                "question_text": "If the recruiter says budget is capped, how would you respond while preserving the relationship?",
                "topic": "Salary Negotiation",
                "difficulty_level": safe_difficulty,
                "ideal_answer_keywords": ["empathy", "alternatives", "levers", "timing", "professionalism"],
                "ideal_answer_text": "Acknowledge constraints, discuss alternative levers, and keep the discussion collaborative and data-driven."
            },
        ]
    elif interview_mode in {"hr_round", "behavioral_storytelling", "managerial_leadership"}:
        templates = [
            {
                "question_text": "Tell me about one project you are proud of. What was your role and what changed because of your work?",
                "topic": "Behavioral",
                "difficulty_level": min(safe_difficulty, 2),
                "ideal_answer_keywords": ["project", "role", "action", "impact", "learning"],
                "ideal_answer_text": "Use a simple STAR structure: context, your action, result, and learning."
            },
            {
                "question_text": "Describe a time you helped someone or unblocked a team task.",
                "topic": "Leadership",
                "difficulty_level": min(safe_difficulty, 2),
                "ideal_answer_keywords": ["ownership", "initiative", "alignment", "impact", "reflection"],
                "ideal_answer_text": "Show initiative, cross-team alignment, concrete impact, and what you improved afterward."
            },
        ]
    elif interview_mode == "system_design":
        templates = [
            {
                "question_text": "Pick one app feature you know well. How would you design the basic backend for it?",
                "topic": "System Design",
                "difficulty_level": min(safe_difficulty, 2),
                "ideal_answer_keywords": ["requirements", "api", "database", "scale", "trade-off"],
                "ideal_answer_text": "Clarify requirements, name core APIs and storage, then mention one scaling or reliability trade-off."
            },
            {
                "question_text": "How would you store and show notifications for users in a simple web app?",
                "topic": "System Design",
                "difficulty_level": min(safe_difficulty, 2),
                "ideal_answer_keywords": ["user", "database", "status", "api", "delivery"],
                "ideal_answer_text": "Discuss notification records, read/unread status, basic APIs, and delivery options."
            },
        ]
    elif interview_mode == "dsa_round":
        templates = [
            {
                "question_text": "Given a list of numbers, how would you find the largest number and what is the time complexity?",
                "topic": "Problem Solving",
                "difficulty_level": min(safe_difficulty, 2),
                "ideal_answer_keywords": ["loop", "maximum", "O(n)", "edge cases"],
                "ideal_answer_text": "Scan once, track the current maximum, handle empty input, and explain O(n) time and O(1) space."
            },
            {
                "question_text": "How would you check whether a string is a palindrome?",
                "topic": "Strings",
                "difficulty_level": min(safe_difficulty, 2),
                "ideal_answer_keywords": ["two pointers", "compare", "O(n)", "edge cases"],
                "ideal_answer_text": "Use two pointers from both ends, compare characters, and discuss normalization if needed."
            },
        ]
    else:
        templates = [
            {
                "question_text": f"Let's start simple with {safe_topic}. What is one small feature or problem you handled, and how did you approach it?",
                "topic": safe_topic,
                "difficulty_level": min(safe_difficulty, 2),
                "ideal_answer_keywords": ["problem", "approach", "decision", "result", "learning"],
                "ideal_answer_text": "Describe the problem, your approach, one decision you made, and the result."
            },
            {
                "question_text": "Tell me about a bug or issue you fixed recently. How did you find the cause?",
                "topic": "Debugging",
                "difficulty_level": min(safe_difficulty, 2),
                "ideal_answer_keywords": ["reproduce", "logs", "hypothesis", "fix", "verify"],
                "ideal_answer_text": "Explain reproduction, investigation, fix, verification, and prevention."
            },
            {
                "question_text": f"What is one thing you would improve in a past {safe_topic} project if you rebuilt it today?",
                "topic": safe_topic,
                "difficulty_level": min(safe_difficulty, 2),
                "ideal_answer_keywords": ["improvement", "reason", "impact", "trade-off"],
                "ideal_answer_text": "Name a concrete improvement, why it matters, and the trade-off."
            }
        ]

    return templates[:safe_count]


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
    topics: List[str] = []
    experience_level = user_intro_analysis.get("experience_level", "mid")
    difficulty = difficulty_hint if difficulty_hint else 3
    safe_count = max(1, int(count or 1))
    interview_mode = str(user_intro_analysis.get("interview_mode", "balanced") or "balanced").strip().lower()
    mode_directive = str(user_intro_analysis.get("mode_directive", "") or "").strip()
    adaptive_context = user_intro_analysis.get("adaptive_context", {}) or {}
    non_technical_modes = {"hr_round", "salary_negotiation", "behavioral_storytelling", "managerial_leadership"}
    must_include_dsa = interview_mode == "dsa_round"

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
        adaptive_context_text = f"\n\nAdaptive Follow-Up Strategy: {json.dumps(adaptive_context)}" if adaptive_context else ""
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
        
        dsa_guidance = "This is DSA mode: ask beginner-friendly algorithm questions first and include time/space complexity." if must_include_dsa else "Do not force DSA prompts in this mode unless the selected interview mode is DSA."

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
                    - Keep each prompt to 1-2 short sentences, concise and spoken-friendly
                    - Prefer simple, answerable questions first; avoid senior-level architecture, obscure algorithms, or heavy trade-off chains unless difficulty is 4-5
                    - Do not ask the same generic opening question about MERN stack, full-stack work, or "walk me through a project where you applied it"
                    - Do not start every new session with "You mentioned..." or "You have worked with..."; vary the angle using the diversity nonce
                    - For the first generated batch after introduction, make the first question a simple mode-specific warm-up
                    - If candidate asks for help/support, adapt tone to supportive coaching before technical probing
                    - If candidate asks to skip, acknowledge and move on gracefully
                    - Respect the adaptive follow-up strategy when provided:
                      - deepen: probe trade-offs, edge cases, scale, failure modes, or judgment
                      - clarify: ask the candidate to make the previous answer more concrete or specific
                      - simplify: ask a narrower, more answerable version in the same area
                      - move_on: switch topic politely without punishing the candidate
                      - recover: reset with a cleaner, confidence-building question
                    - Do not inject generic motivational lines unless the candidate explicitly asks for help/support
                    - Keep prompts consistent with selected interview mode and mode directive
                    - Never repeat or trivially rephrase a question already asked in this session
                    - Balanced mode should mix practical technical, debugging, and behavioral questions; DSA mode should be the only mode that requires algorithm puzzles
                    
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
                    Interview Mode: {interview_mode}
                    Topics to Focus On: {', '.join(topics)}
                    Difficulty Hint (1-5): {difficulty}
                    Mode Directive: {mode_directive}
                    DSA Guidance: {dsa_guidance}
                    {skills_context}
                    {resume_context}
                    {previous_answer_context}
                    {audio_metrics_context}
                    {adaptive_context_text}
                    {asked_questions_context}
                    {diversity_context}
                    {history_context}
                    
                    Generate prompts that build naturally on what the candidate said.
                    Make the first prompt easier than the rest unless Difficulty Hint is 4 or 5.
                    Use the Interview Mode as the main guide for question type.
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
        if not questions:
            return _build_fallback_questions(topics, difficulty, safe_count, experience_level, interview_mode)
        return questions
    
    except Exception as e:
        print(f"Error generating contextual questions: {e}")
        return _build_fallback_questions(topics, difficulty, safe_count, experience_level, interview_mode)


if __name__ == "__main__":
    # Test the conversation service
    intro = generate_ai_introduction("John")
    print("AI Introduction:", intro)
    
    test_user_intro = "Hi, I'm a full-stack developer with 3 years of experience in React and Node.js. I've worked on several e-commerce projects."
    analysis = analyze_user_introduction(test_user_intro)
    print("\nUser Analysis:", json.dumps(analysis, indent=2))
    
    questions = generate_contextual_questions(analysis, count=2)
    print("\nGenerated Questions:", json.dumps(questions, indent=2))
